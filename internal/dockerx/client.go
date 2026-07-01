package dockerx

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/client"

	"Coriva/internal/core"
)

const (
	connectKeyword = "CORIVA_DOCKER_CONNECT"
	actionKeyword  = "CORIVA_CONTAINER_ACTION"
	logKeyword     = "CORIVA_LOG_STREAM"

	defaultDockerHost = "unix:///var/run/docker.sock"
)

// Client 封装 Docker Engine SDK，并根据 Coriva 当前 context 打开 Docker 连接。
type Client struct {
	logger *slog.Logger

	mu         sync.RWMutex
	connection core.DockerContextDTO
	hostErr    error
	passphrase string
}

// New 创建 Docker 客户端封装。
func New(logger *slog.Logger) *Client {
	host, source, err := resolveDockerHost()
	if err != nil {
		logger.Warn("Docker 连接地址解析失败", "keyword", connectKeyword, "source", source, "error", err)
	} else {
		logger.Info("Docker 连接地址解析完成", "keyword", connectKeyword, "source", source, "host", host)
	}
	return &Client{
		logger: logger,
		connection: core.DockerContextDTO{
			ID:          "env",
			Name:        defaultContextName(source),
			Description: "Coriva 启动时从 Docker 环境变量或本机配置解析得到的连接。",
			Source:      source,
			Host:        host,
			Current:     true,
			ReadOnly:    true,
		},
		hostErr: err,
	}
}

// Host 返回当前 Docker daemon 地址。
func (c *Client) Host() string {
	return c.ActiveContext().Host
}

// DefaultHost 返回平台默认 Docker daemon 地址。
func DefaultHost() string {
	return defaultDockerHost
}

// ActiveContext 返回 Coriva 当前使用的 Docker 连接。
func (c *Client) ActiveContext() core.DockerContextDTO {
	c.mu.RLock()
	defer c.mu.RUnlock()
	connection := c.connection
	connection.Current = true
	return connection
}

// SetActiveContext 切换 Coriva 当前使用的 Docker 连接。
func (c *Client) SetActiveContext(connection core.DockerContextDTO, passphrase string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	connection.Current = true
	c.connection = connection
	c.hostErr = nil
	c.passphrase = passphrase
	c.logger.Info("切换 Docker 连接完成", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "source", connection.Source, "host", connection.Host)
}

// Status 获取 Docker daemon 状态，用于应用启动诊断。
func (c *Client) Status(ctx context.Context) core.DockerStatusDTO {
	connection := c.ActiveContext()
	status := core.DockerStatusDTO{
		Host:        connection.Host,
		ContextID:   connection.ID,
		ContextName: connection.Name,
	}
	cli, err := c.open()
	if err != nil {
		status.Error = err.Error()
		c.logger.Warn("Docker 客户端初始化失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}
	defer cli.Close()

	version, err := cli.ServerVersion(ctx, client.ServerVersionOptions{})
	if err != nil {
		status.Error = fmt.Sprintf("无法连接 Docker: %v", err)
		c.logger.Warn("Docker daemon 连接失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}

	infoResult, err := cli.Info(ctx, client.InfoOptions{})
	if err != nil {
		status.Error = fmt.Sprintf("读取 Docker 信息失败: %v", err)
		c.logger.Warn("Docker 信息读取失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}
	info := infoResult.Info

	status.Connected = true
	status.ServerVersion = version.Version
	status.APIVersion = version.APIVersion
	status.OS = info.OSType
	status.Architecture = info.Architecture
	status.Containers = info.Containers
	status.Images = info.Images
	status.Parameters = dockerStatusParameters(version, info)
	c.logger.Info("Docker daemon 连接成功", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "serverVersion", status.ServerVersion, "apiVersion", status.APIVersion)
	return status
}

// ProbeContext 使用传入连接读取 Docker daemon 基本信息，不切换当前活动连接。
func (c *Client) ProbeContext(ctx context.Context, connection core.DockerContextDTO, passphrase string) core.DockerStatusDTO {
	status := core.DockerStatusDTO{
		Host:        connection.Host,
		ContextID:   connection.ID,
		ContextName: connection.Name,
	}
	cli, err := openEngineClient(connection, passphrase)
	if err != nil {
		status.Error = err.Error()
		c.logger.Warn("Docker context 连接测试初始化失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}
	defer cli.Close()

	version, err := cli.ServerVersion(ctx, client.ServerVersionOptions{})
	if err != nil {
		status.Error = fmt.Sprintf("无法连接 Docker: %v", err)
		c.logger.Warn("Docker context 连接测试失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}
	infoResult, err := cli.Info(ctx, client.InfoOptions{})
	if err != nil {
		status.Error = fmt.Sprintf("读取 Docker 信息失败: %v", err)
		c.logger.Warn("Docker context 信息读取失败", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "error", err)
		return status
	}

	status.Connected = true
	status.ServerVersion = version.Version
	status.APIVersion = version.APIVersion
	status.OS = infoResult.Info.OSType
	status.Architecture = infoResult.Info.Architecture
	status.Containers = infoResult.Info.Containers
	status.Images = infoResult.Info.Images
	status.Parameters = dockerStatusParameters(version, infoResult.Info)
	c.logger.Info("Docker context 连接测试成功", "keyword", connectKeyword, "contextID", connection.ID, "contextName", connection.Name, "host", connection.Host, "serverVersion", status.ServerVersion, "apiVersion", status.APIVersion)
	return status
}

// ListContainers 返回本机容器列表。
func (c *Client) ListContainers(ctx context.Context, query core.ContainerQueryDTO) ([]core.ContainerSummaryDTO, error) {
	cli, err := c.open()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	result, err := cli.ContainerList(ctx, client.ContainerListOptions{All: query.All, Size: false})
	if err != nil {
		c.logger.Warn("容器列表读取失败", "keyword", actionKeyword, "error", err)
		return nil, fmt.Errorf("读取容器列表失败: %w", err)
	}

	containers := make([]core.ContainerSummaryDTO, 0, len(result.Items))
	search := strings.ToLower(strings.TrimSpace(query.Search))
	for _, item := range result.Items {
		summary := core.ContainerSummaryDTO{
			ID:        item.ID,
			ShortID:   shortID(item.ID),
			Name:      firstContainerName(item.Names),
			Image:     item.Image,
			Command:   item.Command,
			State:     string(item.State),
			Status:    item.Status,
			CreatedAt: item.Created,
			Ports:     formatPorts(item.Ports),
			Networks:  networkNames(item.NetworkSettings),
			Compose:   item.Labels["com.docker.compose.project"],
		}
		if matchesContainer(summary, search) {
			containers = append(containers, summary)
		}
	}
	sort.SliceStable(containers, func(i, j int) bool {
		return containers[i].CreatedAt > containers[j].CreatedAt
	})
	return containers, nil
}

// StartContainer 启动指定容器。
func (c *Client) StartContainer(ctx context.Context, id string) error {
	c.logger.Info("开始启动容器", "keyword", actionKeyword, "containerID", id)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()
	_, err = cli.ContainerStart(ctx, id, client.ContainerStartOptions{})
	if err != nil {
		c.logger.Error("启动容器失败", "keyword", actionKeyword, "containerID", id, "error", err)
		return fmt.Errorf("启动容器失败: %w", err)
	}
	c.logger.Info("启动容器完成", "keyword", actionKeyword, "containerID", id)
	return nil
}

// StopContainer 停止指定容器，默认等待 10 秒。
func (c *Client) StopContainer(ctx context.Context, id string) error {
	c.logger.Info("开始停止容器", "keyword", actionKeyword, "containerID", id)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()
	timeout := 10
	_, err = cli.ContainerStop(ctx, id, client.ContainerStopOptions{Timeout: &timeout})
	if err != nil {
		c.logger.Error("停止容器失败", "keyword", actionKeyword, "containerID", id, "error", err)
		return fmt.Errorf("停止容器失败: %w", err)
	}
	c.logger.Info("停止容器完成", "keyword", actionKeyword, "containerID", id)
	return nil
}

// RestartContainer 重启指定容器，默认等待 10 秒。
func (c *Client) RestartContainer(ctx context.Context, id string) error {
	c.logger.Info("开始重启容器", "keyword", actionKeyword, "containerID", id)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()
	timeout := 10
	_, err = cli.ContainerRestart(ctx, id, client.ContainerRestartOptions{Timeout: &timeout})
	if err != nil {
		c.logger.Error("重启容器失败", "keyword", actionKeyword, "containerID", id, "error", err)
		return fmt.Errorf("重启容器失败: %w", err)
	}
	c.logger.Info("重启容器完成", "keyword", actionKeyword, "containerID", id)
	return nil
}

// RemoveContainer 删除指定容器。
func (c *Client) RemoveContainer(ctx context.Context, id string, force bool) error {
	c.logger.Info("开始删除容器", "keyword", actionKeyword, "containerID", id, "force", force)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()
	_, err = cli.ContainerRemove(ctx, id, client.ContainerRemoveOptions{Force: force, RemoveVolumes: false})
	if err != nil {
		c.logger.Error("删除容器失败", "keyword", actionKeyword, "containerID", id, "force", force, "error", err)
		return fmt.Errorf("删除容器失败: %w", err)
	}
	c.logger.Info("删除容器完成", "keyword", actionKeyword, "containerID", id, "force", force)
	return nil
}

// StreamContainerLogs 读取容器日志并逐行回调，直到上下文取消或流结束。
func (c *Client) StreamContainerLogs(ctx context.Context, id string, tail int, follow bool, emit func(core.LogLineEvent)) error {
	c.logger.Info("开始订阅容器日志", "keyword", logKeyword, "containerID", id, "tail", tail, "follow", follow)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	if tail <= 0 {
		tail = 200
	}
	stream, err := cli.ContainerLogs(ctx, id, client.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     follow,
		Timestamps: true,
		Tail:       fmt.Sprintf("%d", tail),
	})
	if err != nil {
		c.logger.Error("订阅容器日志失败", "keyword", logKeyword, "containerID", id, "error", err)
		return fmt.Errorf("订阅容器日志失败: %w", err)
	}
	defer stream.Close()

	return scanLines(ctx, stream, func(line string) {
		emit(core.LogLineEvent{
			Source: "container",
			Line:   stripDockerLogHeader(line),
			Level:  "info",
			Time:   time.Now().Format(time.RFC3339),
		})
	})
}

type engineClient struct {
	*client.Client
	cleanup func()
}

func (e *engineClient) Close() error {
	err := e.Client.Close()
	if e.cleanup != nil {
		e.cleanup()
	}
	return err
}

func (c *Client) open() (*engineClient, error) {
	c.mu.RLock()
	connection := c.connection
	hostErr := c.hostErr
	passphrase := c.passphrase
	c.mu.RUnlock()

	if hostErr != nil {
		return nil, hostErr
	}
	return openEngineClient(connection, passphrase)
}

func dockerStatusParameters(version any, info any) []core.DockerParameterDTO {
	parameters := make([]core.DockerParameterDTO, 0, 96)
	flattenDockerParameter("Version", version, &parameters)
	flattenDockerParameter("Info", info, &parameters)
	sort.SliceStable(parameters, func(i, j int) bool {
		return parameters[i].Key < parameters[j].Key
	})
	return parameters
}

func flattenDockerParameter(prefix string, value any, parameters *[]core.DockerParameterDTO) {
	if prefix == "" || value == nil {
		return
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		*parameters = append(*parameters, core.DockerParameterDTO{Key: prefix, Value: fmt.Sprint(value)})
		return
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		*parameters = append(*parameters, core.DockerParameterDTO{Key: prefix, Value: string(encoded)})
		return
	}
	flattenDockerJSONValue(prefix, decoded, parameters)
}

func flattenDockerJSONValue(prefix string, value any, parameters *[]core.DockerParameterDTO) {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			flattenDockerJSONValue(prefix+"."+key, typed[key], parameters)
		}
	case []any:
		if len(typed) == 0 {
			*parameters = append(*parameters, core.DockerParameterDTO{Key: prefix, Value: "[]"})
			return
		}
		for index, item := range typed {
			flattenDockerJSONValue(prefix+"["+strconv.Itoa(index)+"]", item, parameters)
		}
	default:
		*parameters = append(*parameters, core.DockerParameterDTO{Key: prefix, Value: dockerParameterValue(typed)})
	}
}

func dockerParameterValue(value any) string {
	if value == nil {
		return "null"
	}
	typed := reflect.ValueOf(value)
	if typed.IsValid() && typed.Kind() == reflect.Float64 {
		number := value.(float64)
		if number == float64(int64(number)) {
			return strconv.FormatInt(int64(number), 10)
		}
	}
	switch current := value.(type) {
	case string:
		if strings.TrimSpace(current) == "" {
			return "-"
		}
		return current
	case bool:
		return strconv.FormatBool(current)
	default:
		return fmt.Sprint(current)
	}
}

func resolveDockerHost() (string, string, error) {
	host := strings.TrimSpace(os.Getenv("DOCKER_HOST"))
	if host != "" {
		return host, "DOCKER_HOST", nil
	}

	configDir, err := dockerConfigDir()
	if err != nil {
		return "", "DOCKER_CONFIG", err
	}

	contextName := strings.TrimSpace(os.Getenv("DOCKER_CONTEXT"))
	if contextName != "" {
		return dockerHostFromContextOrDefault(configDir, contextName, "DOCKER_CONTEXT")
	}

	contextName, err = currentDockerContext(configDir)
	if err != nil {
		return "", "docker-config", err
	}
	if contextName != "" {
		return dockerHostFromContextOrDefault(configDir, contextName, "docker-config")
	}

	return defaultDockerHost, "default", nil
}

func dockerConfigDir() (string, error) {
	if dir := strings.TrimSpace(os.Getenv("DOCKER_CONFIG")); dir != "" {
		return dir, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("读取用户主目录失败: %w", err)
	}
	return filepath.Join(home, ".docker"), nil
}

func dockerHostFromContextOrDefault(configDir string, contextName string, source string) (string, string, error) {
	contextName = strings.TrimSpace(contextName)
	if contextName == "" || contextName == "default" {
		return defaultDockerHost, source, nil
	}
	host, err := dockerHostFromContext(configDir, contextName)
	if err != nil {
		return "", source, err
	}
	return host, source, nil
}

func currentDockerContext(configDir string) (string, error) {
	configPath := filepath.Join(configDir, "config.json")
	file, err := os.Open(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf("读取 Docker 配置失败: %w", err)
	}
	defer file.Close()

	var config struct {
		CurrentContext string `json:"currentContext"`
	}
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		return "", fmt.Errorf("解析 Docker 配置失败: %w", err)
	}
	return strings.TrimSpace(config.CurrentContext), nil
}

func dockerHostFromContext(configDir string, contextName string) (string, error) {
	metaRoot := filepath.Join(configDir, "contexts", "meta")
	entries, err := os.ReadDir(metaRoot)
	if err != nil {
		return "", fmt.Errorf("读取 Docker context 目录失败: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		host, matched, err := dockerHostFromContextMeta(filepath.Join(metaRoot, entry.Name(), "meta.json"), contextName)
		if err != nil {
			return "", err
		}
		if matched {
			return host, nil
		}
	}
	return "", fmt.Errorf("未找到 Docker context: %s", contextName)
}

func dockerHostFromContextMeta(path string, contextName string) (string, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("读取 Docker context 元数据失败: %w", err)
	}
	defer file.Close()

	var meta struct {
		Name      string `json:"Name"`
		Endpoints map[string]struct {
			Host string `json:"Host"`
		} `json:"Endpoints"`
	}
	if err := json.NewDecoder(file).Decode(&meta); err != nil {
		return "", false, fmt.Errorf("解析 Docker context 元数据失败: %w", err)
	}
	if meta.Name != contextName {
		return "", false, nil
	}
	endpoint, ok := meta.Endpoints["docker"]
	if !ok || strings.TrimSpace(endpoint.Host) == "" {
		return "", true, fmt.Errorf("Docker context 缺少 docker endpoint: %s", contextName)
	}
	return strings.TrimSpace(endpoint.Host), true, nil
}

func defaultContextName(source string) string {
	source = strings.TrimSpace(source)
	if source == "" || source == "default" {
		return "Local Docker"
	}
	return "Docker " + source
}

func scanLines(ctx context.Context, reader io.Reader, emit func(string)) error {
	scanner := bufio.NewScanner(reader)
	buffer := make([]byte, 0, 1024*1024)
	scanner.Buffer(buffer, 4*1024*1024)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			emit(scanner.Text())
		}
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		return err
	}
	return ctx.Err()
}
