package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"Coriva/internal/composex"
	"Coriva/internal/core"
	"Coriva/internal/dockerx"
	"Coriva/internal/store"
)

const (
	eventLogLine      = "coriva:log-line"
	eventPullProgress = "coriva:pull-progress"
	recentActionLimit = 100
)

// App 是 Wails 暴露给前端的应用门面，负责把 UI 操作路由到后端服务。
type App struct {
	ctx     context.Context
	logger  *slog.Logger
	store   *store.Store
	docker  *dockerx.Client
	compose *composex.Runner

	streamsMu sync.Mutex
	streams   map[string]context.CancelFunc
}

// NewApp 创建 Coriva 应用实例。
func NewApp() *App {
	logger := slog.Default()
	return &App{
		logger:  logger,
		docker:  dockerx.New(logger),
		compose: composex.New(logger),
		streams: make(map[string]context.CancelFunc),
	}
}

// startup 在应用启动时初始化本地存储和运行上下文。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	localStore, err := store.New(ctx, a.logger)
	if err != nil {
		a.logger.Error("应用启动时初始化本地存储失败", "keyword", "CORIVA_SQLITE_MIGRATION", "error", err)
		return
	}
	a.store = localStore
	a.restoreDockerContext(ctx)
	a.syncComposeDockerEnvironment()
}

// shutdown 在应用退出时释放日志订阅和数据库连接。
func (a *App) shutdown(ctx context.Context) {
	a.cancelAllStreams()
	if err := a.store.Close(); err != nil {
		a.logger.Warn("关闭本地数据库失败", "keyword", "CORIVA_SQLITE_MIGRATION", "error", err)
	}
}

// GetAppStatus 返回 Coriva 当前环境状态。
func (a *App) GetAppStatus() core.AppStatusDTO {
	ctx, cancel := a.timeoutContext(8 * time.Second)
	defer cancel()

	status := core.AppStatusDTO{
		Docker:        a.docker.Status(ctx),
		ActiveContext: a.docker.ActiveContext(),
		Platform:      runtime.GOOS + "/" + runtime.GOARCH,
		GoVersion:     runtime.Version(),
	}
	a.syncComposeDockerEnvironment()
	if composeErr := a.composeContextError(); composeErr != nil {
		status.Compose = core.ComposeStatusDTO{Available: false, Error: composeErr.Error()}
	} else {
		status.Compose = a.compose.Status(ctx)
	}
	if a.store != nil {
		status.DatabasePath = a.store.DBPath()
		status.AppDataPath = a.store.AppPath()
		status.RecentActions = a.store.ListRecentActions(ctx, recentActionLimit)
	}
	return status
}

// ListDockerContexts 返回 Coriva 自身维护的 Docker context。
func (a *App) ListDockerContexts() ([]core.DockerContextDTO, error) {
	ctx, cancel := a.timeoutContext(8 * time.Second)
	defer cancel()

	active := a.docker.ActiveContext()
	contexts := make([]core.DockerContextDTO, 0)
	if a.store != nil {
		items, err := a.store.ListDockerConnections(ctx)
		if err != nil {
			return nil, err
		}
		contexts = append(contexts, items...)
	}
	if active.ID != "" {
		active.Current = true
		contexts = append(contexts, active)
	}
	return mergeDockerContexts(contexts, active.ID), nil
}

// SaveDockerContext 创建或更新 Coriva 自有 Docker 连接；连接失败也允许保存并记录检测结果。
func (a *App) SaveDockerContext(request core.SaveDockerContextRequestDTO) (core.DockerContextDTO, error) {
	if a.store == nil {
		return core.DockerContextDTO{}, fmt.Errorf("本地数据库未初始化")
	}
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()

	connection := core.DockerContextDTO{
		ID:            strings.TrimSpace(request.ID),
		Name:          strings.TrimSpace(request.Name),
		Description:   strings.TrimSpace(request.Description),
		Source:        "coriva",
		Host:          strings.TrimSpace(request.Host),
		CaPath:        strings.TrimSpace(request.CaPath),
		CertPath:      strings.TrimSpace(request.CertPath),
		KeyPath:       strings.TrimSpace(request.KeyPath),
		SSHKeyPath:    strings.TrimSpace(request.SSHKeyPath),
		SkipTLSVerify: request.SkipTLSVerify,
	}
	if connection.ID == "" {
		connection.ID = uuid.NewString()
	}
	normalizedHost, err := normalizeDockerHostForCompare(connection.Host)
	if err != nil {
		return core.DockerContextDTO{}, err
	}
	connection.NormalizedHost = normalizedHost
	connection.BridgeType = dockerBridgeType(connection.Host)
	connection.ConnectionStatus = "unchecked"
	materialized, err := a.materializeDockerCredentials(connection)
	if err != nil {
		return core.DockerContextDTO{}, err
	}
	saved, err := a.store.UpsertDockerConnection(ctx, materialized)
	if err != nil {
		return core.DockerContextDTO{}, err
	}
	probe := a.probeDockerContext(ctx, saved, "")
	saved.ConnectionStatus = statusFromProbe(probe)
	saved.ConnectionError = errorFromProbe(probe)
	saved.LastCheckedAt = time.Now().UTC().Format(time.RFC3339)
	if updateErr := a.store.UpdateDockerConnectionProbe(ctx, saved.ID, saved.ConnectionStatus, saved.ConnectionError, saved.LastCheckedAt); updateErr != nil {
		a.logger.Warn("更新 Docker 连接检测结果失败", "keyword", "CORIVA_DOCKER_CONTEXT", "contextID", saved.ID, "error", updateErr)
	}
	a.logger.Info("保存 Docker 连接完成", "keyword", "CORIVA_DOCKER_CONTEXT", "contextID", saved.ID, "contextName", saved.Name, "host", saved.Host)
	return saved, nil
}

// TestDockerContext 主动测试指定 Docker context，并返回可展示的连接诊断结果。
func (a *App) TestDockerContext(id string) core.DockerContextProbeDTO {
	ctx, cancel := a.timeoutContext(8 * time.Second)
	defer cancel()

	connection, err := a.contextByID(ctx, id)
	if err != nil {
		return core.DockerContextProbeDTO{OK: false, Message: err.Error(), BridgeType: "remote"}
	}
	probe := a.probeDockerContext(ctx, connection, "")
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	if a.store != nil && connection.Source == "coriva" {
		if err := a.store.UpdateDockerConnectionProbe(ctx, connection.ID, statusFromProbe(probe), errorFromProbe(probe), checkedAt); err != nil {
			a.logger.Warn("更新 Docker context 测试结果失败", "keyword", "CORIVA_DOCKER_CONTEXT", "contextID", connection.ID, "error", err)
		}
	}
	return probe
}

// SwitchDockerContext 切换 Coriva 当前使用的 Docker 连接，不修改系统 Docker CLI currentContext。
func (a *App) SwitchDockerContext(request core.SwitchDockerContextRequestDTO) core.ActionResultDTO {
	ctx, cancel := a.timeoutContext(12 * time.Second)
	defer cancel()

	connection, err := a.contextByID(ctx, request.ID)
	if err != nil {
		return failed(err.Error())
	}
	status := a.docker.ActivateContext(ctx, connection, request.Passphrase)
	if !status.Connected {
		return failed(status.Error)
	}
	a.syncComposeDockerEnvironment()
	if a.store != nil {
		if err := a.store.SaveActiveDockerContextID(ctx, connection.ID); err != nil {
			a.logger.Warn("保存当前 Docker 连接失败", "keyword", "CORIVA_DOCKER_CONTEXT", "contextID", connection.ID, "error", err)
		}
	}
	return okResult("Docker 连接已切换")
}

// DeleteDockerContext 逻辑删除 Coriva 自有 Docker 连接，不修改系统 Docker CLI context。
func (a *App) DeleteDockerContext(id string) core.ActionResultDTO {
	if a.store == nil {
		return failed("本地数据库未初始化")
	}
	if strings.HasPrefix(id, "cli:") || id == "env" {
		return failed("外部 Docker context 不能在 Coriva 中删除")
	}
	ctx, cancel := a.timeoutContext(8 * time.Second)
	defer cancel()
	if err := a.store.DeleteDockerConnection(ctx, id); err != nil {
		return failed(err.Error())
	}
	if a.docker.ActiveContext().ID == id {
		_ = a.store.SaveActiveDockerContextID(ctx, "")
		a.docker.SetActiveContext(core.DockerContextDTO{
			ID:          "env",
			Name:        "Local Docker",
			Source:      "default",
			Host:        dockerxDefaultHost(),
			Current:     true,
			ReadOnly:    true,
			Description: "Coriva 默认本机 Docker 连接。",
		}, "")
		a.syncComposeDockerEnvironment()
	}
	return okResult("Docker 连接已删除")
}

// ListContainers 返回容器列表。
func (a *App) ListContainers(query core.ContainerQueryDTO) ([]core.ContainerSummaryDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.ListContainers(ctx, query)
}

// StartContainer 启动容器。
func (a *App) StartContainer(id string) core.ActionResultDTO {
	return a.containerAction("start_container", id, "容器已启动", func(ctx context.Context) error {
		return a.docker.StartContainer(ctx, id)
	})
}

// StopContainer 停止容器。
func (a *App) StopContainer(id string) core.ActionResultDTO {
	return a.containerAction("stop_container", id, "容器已停止", func(ctx context.Context) error {
		return a.docker.StopContainer(ctx, id)
	})
}

// RestartContainer 重启容器。
func (a *App) RestartContainer(id string) core.ActionResultDTO {
	return a.containerAction("restart_container", id, "容器已重启", func(ctx context.Context) error {
		return a.docker.RestartContainer(ctx, id)
	})
}

// RemoveContainer 删除容器。
func (a *App) RemoveContainer(id string, force bool) core.ActionResultDTO {
	return a.containerAction("remove_container", id, "容器已删除", func(ctx context.Context) error {
		return a.docker.RemoveContainer(ctx, id, force)
	})
}

// StreamContainerLogs 开始订阅容器日志。
func (a *App) StreamContainerLogs(request core.LogStreamRequestDTO) (core.StreamSubscriptionDTO, error) {
	subscriptionID := composex.NewSubscriptionID()
	ctx, cancel := context.WithCancel(a.ctx)
	a.registerStream(subscriptionID, cancel)

	go func() {
		defer a.unregisterStream(subscriptionID)
		err := a.docker.StreamContainerLogs(ctx, request.ID, request.Tail, request.Follow, func(event core.LogLineEvent) {
			event.SubscriptionID = subscriptionID
			a.emitLogLine(event)
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			a.emitLogLine(core.LogLineEvent{
				SubscriptionID: subscriptionID,
				Source:         "container",
				Line:           err.Error(),
				Level:          "error",
				Time:           time.Now().Format(time.RFC3339),
			})
		}
	}()

	return core.StreamSubscriptionDTO{SubscriptionID: subscriptionID}, nil
}

// StopLogStream 停止日志订阅。
func (a *App) StopLogStream(subscriptionID string) core.ActionResultDTO {
	if subscriptionID == "" {
		return failed("订阅 ID 不能为空")
	}
	a.streamsMu.Lock()
	cancel, ok := a.streams[subscriptionID]
	a.streamsMu.Unlock()
	if ok {
		cancel()
	}
	return okResult("日志订阅已停止")
}

// ListImages 返回镜像列表。
func (a *App) ListImages(query core.ImageQueryDTO) ([]core.ImageSummaryDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.ListImages(ctx, query)
}

// InspectImageRunConfig 读取镜像默认运行配置，供前端生成容器运行表单。
func (a *App) InspectImageRunConfig(reference string) (core.ImageRunConfigDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.InspectImageRunConfig(ctx, reference)
}

// RunImage 根据镜像配置创建并启动容器。
func (a *App) RunImage(request core.ImageRunRequestDTO) core.ActionResultDTO {
	ctx, cancel := a.timeoutContext(45 * time.Second)
	defer cancel()
	containerID, err := a.docker.RunImage(ctx, request)
	target := strings.TrimSpace(request.Name)
	if target == "" {
		target = strings.TrimSpace(containerID)
	}
	if target == "" {
		target = strings.TrimSpace(request.Image)
	}
	if err != nil {
		a.recordAction("run_image", strings.TrimSpace(request.Image), "failed", err.Error())
		return failed(err.Error())
	}
	a.recordAction("run_image", target, "success", "容器已启动")
	return okResult("容器已启动")
}

// PullImage 拉取镜像，并返回进度订阅 ID。
func (a *App) PullImage(request core.ImagePullRequestDTO) (core.StreamSubscriptionDTO, error) {
	subscriptionID := composex.NewSubscriptionID()
	ctx, cancel := context.WithCancel(a.ctx)
	a.registerStream(subscriptionID, cancel)

	go func() {
		defer a.unregisterStream(subscriptionID)
		err := a.docker.PullImage(ctx, request.Reference, func(event core.PullProgressEvent) {
			event.SubscriptionID = subscriptionID
			wailsRuntime.EventsEmit(a.ctx, eventPullProgress, event)
		})
		if errors.Is(err, context.Canceled) {
			wailsRuntime.EventsEmit(a.ctx, eventPullProgress, core.PullProgressEvent{
				SubscriptionID: subscriptionID,
				Reference:      request.Reference,
				Status:         "cancelled",
				Done:           true,
			})
			a.recordAction("pull_image", request.Reference, "failed", "镜像拉取已取消")
			return
		}
		if err != nil && !errors.Is(err, context.Canceled) {
			wailsRuntime.EventsEmit(a.ctx, eventPullProgress, core.PullProgressEvent{
				SubscriptionID: subscriptionID,
				Reference:      request.Reference,
				Error:          err.Error(),
				Done:           true,
			})
			a.recordAction("pull_image", request.Reference, "failed", err.Error())
			return
		}
		a.recordAction("pull_image", request.Reference, "success", "镜像拉取完成")
	}()

	return core.StreamSubscriptionDTO{SubscriptionID: subscriptionID}, nil
}

// CancelImagePull 取消指定镜像拉取任务。
func (a *App) CancelImagePull(subscriptionID string) core.ActionResultDTO {
	if strings.TrimSpace(subscriptionID) == "" {
		return failed("拉取任务 ID 不能为空")
	}
	a.streamsMu.Lock()
	cancel, ok := a.streams[subscriptionID]
	a.streamsMu.Unlock()
	if !ok {
		return failed("拉取任务不存在或已结束")
	}
	cancel()
	return okResult("镜像拉取取消中")
}

// RemoveImage 删除镜像。
func (a *App) RemoveImage(id string, force bool) core.ActionResultDTO {
	ctx, cancel := a.timeoutContext(30 * time.Second)
	defer cancel()
	err := a.docker.RemoveImage(ctx, id, force)
	if err != nil {
		a.recordAction("remove_image", id, "failed", err.Error())
		return failed(err.Error())
	}
	a.recordAction("remove_image", id, "success", "镜像已删除")
	return okResult("镜像已删除")
}

// ListComposeProjects 返回本地 Compose 项目列表，并刷新服务状态。
func (a *App) ListComposeProjects() ([]core.ComposeProjectDTO, error) {
	if a.store == nil {
		return nil, fmt.Errorf("本地数据库未初始化")
	}
	a.syncComposeDockerEnvironment()
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	projects, err := a.store.ListComposeProjects(ctx)
	if err != nil {
		return nil, err
	}
	if err := a.composeContextError(); err != nil {
		for i := range projects {
			projects[i].Status = "unavailable"
		}
		return projects, nil
	}
	for i := range projects {
		projects[i] = a.compose.LoadServices(ctx, projects[i])
	}
	return projects, nil
}

// AddComposeProject 添加本地 Compose 项目。
func (a *App) AddComposeProject(request core.AddComposeProjectRequestDTO) (core.ComposeProjectDTO, error) {
	if a.store == nil {
		return core.ComposeProjectDTO{}, fmt.Errorf("本地数据库未初始化")
	}
	ctx, cancel := a.timeoutContext(10 * time.Second)
	defer cancel()
	a.syncComposeDockerEnvironment()

	name, path, config, err := a.compose.ResolveProjectPath(request.Path)
	if err != nil {
		a.recordAction("add_compose_project", request.Path, "failed", err.Error())
		return core.ComposeProjectDTO{}, err
	}
	project, err := a.store.UpsertComposeProject(ctx, name, path, config)
	if err != nil {
		a.recordAction("add_compose_project", request.Path, "failed", err.Error())
		return core.ComposeProjectDTO{}, err
	}
	a.recordAction("add_compose_project", project.Name, "success", "Compose 项目已添加")
	return a.compose.LoadServices(ctx, project), nil
}

// ComposeUp 启动 Compose 项目。
func (a *App) ComposeUp(id string) core.ActionResultDTO {
	return a.composeAction("compose_up", id, "Compose 项目已启动", func(ctx context.Context, project core.ComposeProjectDTO) error {
		return a.compose.Up(ctx, project)
	})
}

// ComposeDown 停止 Compose 项目。
func (a *App) ComposeDown(id string) core.ActionResultDTO {
	return a.composeAction("compose_down", id, "Compose 项目已停止", func(ctx context.Context, project core.ComposeProjectDTO) error {
		return a.compose.Down(ctx, project)
	})
}

// ComposeRestart 重启 Compose 项目。
func (a *App) ComposeRestart(id string) core.ActionResultDTO {
	return a.composeAction("compose_restart", id, "Compose 项目已重启", func(ctx context.Context, project core.ComposeProjectDTO) error {
		return a.compose.Restart(ctx, project)
	})
}

// StreamComposeLogs 开始订阅 Compose 日志。
func (a *App) StreamComposeLogs(request core.LogStreamRequestDTO) (core.StreamSubscriptionDTO, error) {
	if a.store == nil {
		return core.StreamSubscriptionDTO{}, fmt.Errorf("本地数据库未初始化")
	}
	a.syncComposeDockerEnvironment()
	if err := a.composeContextError(); err != nil {
		return core.StreamSubscriptionDTO{}, err
	}
	ctx, cancel := context.WithCancel(a.ctx)
	project, err := a.store.ComposeProjectByID(ctx, request.ID)
	if err != nil {
		cancel()
		return core.StreamSubscriptionDTO{}, err
	}
	subscriptionID := composex.NewSubscriptionID()
	a.registerStream(subscriptionID, cancel)

	go func() {
		defer a.unregisterStream(subscriptionID)
		err := a.compose.StreamLogs(ctx, project, request.Service, request.Tail, func(event core.LogLineEvent) {
			event.SubscriptionID = subscriptionID
			a.emitLogLine(event)
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			a.emitLogLine(core.LogLineEvent{
				SubscriptionID: subscriptionID,
				Source:         "compose",
				Line:           err.Error(),
				Level:          "error",
				Time:           time.Now().Format(time.RFC3339),
			})
		}
	}()
	return core.StreamSubscriptionDTO{SubscriptionID: subscriptionID}, nil
}

// ListVolumes 返回只读数据卷列表。
func (a *App) ListVolumes() ([]core.VolumeDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.ListVolumes(ctx)
}

// ListNetworks 返回网络列表。
func (a *App) ListNetworks() ([]core.NetworkDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.ListNetworks(ctx)
}

// CreateNetwork 创建 Docker 网络。
func (a *App) CreateNetwork(request core.NetworkCreateRequestDTO) core.ActionResultDTO {
	return a.networkAction("create_network", request.Name, "网络已创建", 30*time.Second, func(ctx context.Context) error {
		return a.docker.CreateNetwork(ctx, request)
	})
}

// InspectNetwork 读取 Docker 网络详情。
func (a *App) InspectNetwork(request core.NetworkInspectRequestDTO) (core.NetworkInspectDTO, error) {
	ctx, cancel := a.timeoutContext(15 * time.Second)
	defer cancel()
	return a.docker.InspectNetwork(ctx, request)
}

// ConnectNetwork 将容器连接到指定 Docker 网络。
func (a *App) ConnectNetwork(request core.NetworkConnectRequestDTO) core.ActionResultDTO {
	return a.networkAction("connect_network", request.NetworkID, "容器已连接网络", 30*time.Second, func(ctx context.Context) error {
		return a.docker.ConnectNetwork(ctx, request)
	})
}

// DisconnectNetwork 将容器从指定 Docker 网络断开。
func (a *App) DisconnectNetwork(request core.NetworkDisconnectRequestDTO) core.ActionResultDTO {
	return a.networkAction("disconnect_network", request.NetworkID, "容器已断开网络", 30*time.Second, func(ctx context.Context) error {
		return a.docker.DisconnectNetwork(ctx, request)
	})
}

// RemoveNetwork 删除 Docker 网络。
func (a *App) RemoveNetwork(id string, force bool) core.ActionResultDTO {
	return a.networkAction("remove_network", id, "网络已删除", 30*time.Second, func(ctx context.Context) error {
		return a.docker.RemoveNetwork(ctx, id, force)
	})
}

// PruneNetworks 清理未使用的 Docker 网络。
func (a *App) PruneNetworks(request core.NetworkPruneRequestDTO) core.ActionResultDTO {
	target := "unused_networks"
	ctx, cancel := a.timeoutContext(2 * time.Minute)
	defer cancel()
	deleted, err := a.docker.PruneNetworks(ctx, request)
	if err != nil {
		a.recordAction("prune_networks", target, "failed", err.Error())
		return failed(err.Error())
	}
	message := fmt.Sprintf("已清理 %d 个网络", len(deleted))
	a.recordAction("prune_networks", target, "success", message)
	return okResult(message)
}

func (a *App) containerAction(kind string, id string, successMessage string, run func(context.Context) error) core.ActionResultDTO {
	ctx, cancel := a.timeoutContext(30 * time.Second)
	defer cancel()
	err := run(ctx)
	if err != nil {
		a.recordAction(kind, id, "failed", err.Error())
		return failed(err.Error())
	}
	a.recordAction(kind, id, "success", successMessage)
	return okResult(successMessage)
}

func (a *App) networkAction(kind string, target string, successMessage string, timeout time.Duration, run func(context.Context) error) core.ActionResultDTO {
	ctx, cancel := a.timeoutContext(timeout)
	defer cancel()
	err := run(ctx)
	if err != nil {
		a.recordAction(kind, target, "failed", err.Error())
		return failed(err.Error())
	}
	a.recordAction(kind, target, "success", successMessage)
	return okResult(successMessage)
}

func (a *App) composeAction(kind string, id string, successMessage string, run func(context.Context, core.ComposeProjectDTO) error) core.ActionResultDTO {
	if a.store == nil {
		return failed("本地数据库未初始化")
	}
	a.syncComposeDockerEnvironment()
	if err := a.composeContextError(); err != nil {
		return failed(err.Error())
	}
	ctx, cancel := a.timeoutContext(2 * time.Minute)
	defer cancel()
	project, err := a.store.ComposeProjectByID(ctx, id)
	if err != nil {
		a.recordAction(kind, id, "failed", err.Error())
		return failed(err.Error())
	}
	err = run(ctx, project)
	if err != nil {
		a.recordAction(kind, project.Name, "failed", err.Error())
		return failed(err.Error())
	}
	a.recordAction(kind, project.Name, "success", successMessage)
	return okResult(successMessage)
}

func (a *App) recordAction(kind string, target string, status string, message string) {
	if a.store == nil {
		return
	}
	ctx, cancel := a.timeoutContext(3 * time.Second)
	defer cancel()
	a.store.RecordAction(ctx, kind, target, status, message)
}

func (a *App) timeoutContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	if a.ctx == nil {
		return context.WithTimeout(context.Background(), timeout)
	}
	return context.WithTimeout(a.ctx, timeout)
}

func (a *App) registerStream(id string, cancel context.CancelFunc) {
	a.streamsMu.Lock()
	defer a.streamsMu.Unlock()
	a.streams[id] = cancel
}

func (a *App) unregisterStream(id string) {
	a.streamsMu.Lock()
	defer a.streamsMu.Unlock()
	delete(a.streams, id)
}

func (a *App) cancelAllStreams() {
	a.streamsMu.Lock()
	defer a.streamsMu.Unlock()
	for id, cancel := range a.streams {
		cancel()
		delete(a.streams, id)
	}
}

func (a *App) emitLogLine(event core.LogLineEvent) {
	wailsRuntime.EventsEmit(a.ctx, eventLogLine, event)
}

func (a *App) restoreDockerContext(ctx context.Context) {
	if a.store == nil {
		return
	}
	activeID := a.store.ActiveDockerContextID(ctx)
	if activeID == "" {
		return
	}
	connections, err := a.store.ListDockerConnections(ctx)
	if err != nil {
		a.logger.Warn("恢复 Docker 连接失败", "keyword", "CORIVA_DOCKER_CONTEXT", "contextID", activeID, "error", err)
		return
	}
	for _, connection := range connections {
		if connection.ID == activeID {
			a.docker.SetActiveContext(connection, "")
			return
		}
	}
}

func (a *App) contextByID(ctx context.Context, id string) (core.DockerContextDTO, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return core.DockerContextDTO{}, fmt.Errorf("Docker 连接 ID 不能为空")
	}
	if a.store != nil {
		connections, err := a.store.ListDockerConnections(ctx)
		if err != nil {
			return core.DockerContextDTO{}, err
		}
		for _, connection := range connections {
			if connection.ID == id {
				return connection, nil
			}
		}
	}
	active := a.docker.ActiveContext()
	if active.ID == id {
		return active, nil
	}
	return core.DockerContextDTO{}, fmt.Errorf("未找到 Docker 连接: %s", id)
}

func (a *App) materializeDockerCredentials(connection core.DockerContextDTO) (core.DockerContextDTO, error) {
	if a.store == nil {
		return core.DockerContextDTO{}, fmt.Errorf("本地数据库未初始化")
	}
	targetDir := filepath.Join(a.store.CredentialsPath(), connection.ID)
	var err error
	if connection.CaPath, err = copyCredentialFile(connection.CaPath, targetDir, "ca.pem"); err != nil {
		return core.DockerContextDTO{}, err
	}
	if connection.CertPath, err = copyCredentialFile(connection.CertPath, targetDir, "cert.pem"); err != nil {
		return core.DockerContextDTO{}, err
	}
	if connection.KeyPath, err = copyCredentialFile(connection.KeyPath, targetDir, "key.pem"); err != nil {
		return core.DockerContextDTO{}, err
	}
	if connection.SSHKeyPath, err = copyCredentialFile(connection.SSHKeyPath, targetDir, "ssh_key"); err != nil {
		return core.DockerContextDTO{}, err
	}
	return connection, nil
}

func copyCredentialFile(source string, targetDir string, fileName string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return "", nil
	}
	absSource, err := filepath.Abs(source)
	if err != nil {
		return "", fmt.Errorf("解析凭据路径失败: %w", err)
	}
	absTargetDir, err := filepath.Abs(targetDir)
	if err != nil {
		return "", fmt.Errorf("解析凭据目录失败: %w", err)
	}
	target := filepath.Join(absTargetDir, fileName)
	if absSource == target {
		return target, nil
	}
	if err := os.MkdirAll(absTargetDir, 0o700); err != nil {
		return "", fmt.Errorf("创建 Docker 凭据目录失败: %w", err)
	}
	input, err := os.Open(absSource)
	if err != nil {
		return "", fmt.Errorf("读取 Docker 凭据失败: %w", err)
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return "", fmt.Errorf("写入 Docker 凭据失败: %w", err)
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		return "", fmt.Errorf("复制 Docker 凭据失败: %w", err)
	}
	if err := output.Close(); err != nil {
		return "", fmt.Errorf("关闭 Docker 凭据文件失败: %w", err)
	}
	return target, nil
}

func validateDockerHost(host string) error {
	_, err := normalizeDockerHostForCompare(host)
	return err
}

func normalizeDockerHostForCompare(host string) (string, error) {
	host = strings.TrimSpace(host)
	if host == "" {
		return "", fmt.Errorf("Docker Host 不能为空")
	}
	parsed, err := url.Parse(host)
	if err != nil {
		return "", fmt.Errorf("Docker Host 地址无效: %w", err)
	}
	switch parsed.Scheme {
	case "unix", "npipe":
		pathValue := strings.TrimRight(parsed.Path, "/")
		if parsed.Scheme == "npipe" {
			pathValue = strings.TrimRight(parsed.Host+parsed.Path, "/")
		}
		return strings.ToLower(parsed.Scheme) + "://" + pathValue, nil
	case "tcp", "http", "https", "ssh":
		scheme := strings.ToLower(parsed.Scheme)
		if scheme == "http" || scheme == "https" {
			scheme = "tcp"
		}
		parsed.Scheme = scheme
		parsed.Host = strings.ToLower(strings.TrimRight(parsed.Host, "/"))
		parsed.Path = strings.TrimRight(parsed.Path, "/")
		return strings.TrimRight(parsed.String(), "/"), nil
	default:
		return "", fmt.Errorf("不支持的 Docker Host 协议: %s", parsed.Scheme)
	}
}

func dockerBridgeType(host string) string {
	parsed, err := url.Parse(strings.TrimSpace(host))
	if err != nil {
		return "remote"
	}
	switch strings.ToLower(parsed.Scheme) {
	case "unix", "npipe":
		return "local"
	case "tcp", "http", "https", "ssh":
		hostName := strings.ToLower(parsed.Hostname())
		if hostName == "localhost" {
			return "local"
		}
		ip := net.ParseIP(hostName)
		if ip == nil {
			return "remote"
		}
		if ip.IsLoopback() {
			return "local"
		}
	}
	return "remote"
}

func (a *App) probeDockerContext(ctx context.Context, connection core.DockerContextDTO, passphrase string) core.DockerContextProbeDTO {
	connection.BridgeType = dockerBridgeType(connection.Host)
	status := a.docker.ProbeContext(ctx, connection, passphrase)
	probe := core.DockerContextProbeDTO{
		OK:            status.Connected,
		BridgeType:    connection.BridgeType,
		ServerVersion: status.ServerVersion,
		APIVersion:    status.APIVersion,
		OS:            status.OS,
		Architecture:  status.Architecture,
	}
	if status.Connected {
		probe.Message = "Docker context 连接成功"
		return probe
	}
	probe.Message = status.Error
	if probe.Message == "" {
		probe.Message = "Docker context 连接失败"
	}
	return probe
}

func statusFromProbe(probe core.DockerContextProbeDTO) string {
	if probe.OK {
		return "success"
	}
	return "failed"
}

func errorFromProbe(probe core.DockerContextProbeDTO) string {
	if probe.OK {
		return ""
	}
	return probe.Message
}

func mergeDockerContexts(items []core.DockerContextDTO, activeID string) []core.DockerContextDTO {
	seen := make(map[string]bool, len(items))
	result := make([]core.DockerContextDTO, 0, len(items))
	for _, item := range items {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		item.Current = item.ID == activeID
		result = append(result, item)
	}
	return result
}

func (a *App) syncComposeDockerEnvironment() {
	connection := a.docker.ActiveContext()
	env := []string{"DOCKER_HOST=" + normalizeComposeHost(connection.Host)}
	if connection.CaPath != "" || connection.CertPath != "" || connection.KeyPath != "" {
		certDir := filepath.Dir(firstNonEmpty(connection.CaPath, connection.CertPath, connection.KeyPath))
		env = append(env, "DOCKER_CERT_PATH="+certDir)
		if connection.SkipTLSVerify {
			env = append(env, "DOCKER_TLS_VERIFY=")
		} else {
			env = append(env, "DOCKER_TLS_VERIFY=1")
		}
	}
	a.compose.SetDockerEnvironment(env)
}

func (a *App) composeContextError() error {
	connection := a.docker.ActiveContext()
	parsed, err := url.Parse(connection.Host)
	if err != nil {
		return fmt.Errorf("当前 Docker Host 地址无效，Compose 不可用")
	}
	if parsed.Scheme == "ssh" {
		return fmt.Errorf("当前 SSH 连接使用 Coriva 原生通道，Compose 暂时仍依赖本机 Docker CLI，当前连接下不可用")
	}
	return nil
}

func normalizeComposeHost(host string) string {
	if strings.HasPrefix(host, "http://") {
		return "tcp://" + strings.TrimPrefix(host, "http://")
	}
	if strings.HasPrefix(host, "https://") {
		return "tcp://" + strings.TrimPrefix(host, "https://")
	}
	return host
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func dockerxDefaultHost() string {
	return dockerx.DefaultHost()
}

func okResult(message string) core.ActionResultDTO {
	return core.ActionResultDTO{OK: true, Message: message}
}

func failed(message string) core.ActionResultDTO {
	return core.ActionResultDTO{OK: false, Message: message}
}
