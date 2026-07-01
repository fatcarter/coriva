package composex

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"Coriva/internal/core"
)

const (
	statusKeyword = "CORIVA_COMPOSE_STATUS"
	actionKeyword = "CORIVA_COMPOSE_ACTION"
	logKeyword    = "CORIVA_LOG_STREAM"
)

var composeFiles = []string{
	"compose.yaml",
	"compose.yml",
	"docker-compose.yaml",
	"docker-compose.yml",
}

// Runner 负责调用 Docker Compose V2 CLI 插件。
type Runner struct {
	logger *slog.Logger
	envMu  sync.RWMutex
	env    []string
}

// New 创建 Compose 执行器。
func New(logger *slog.Logger) *Runner {
	return &Runner{logger: logger}
}

// SetDockerEnvironment 设置 Compose CLI 调用使用的 Docker 环境变量。
func (r *Runner) SetDockerEnvironment(env []string) {
	r.envMu.Lock()
	defer r.envMu.Unlock()
	r.env = append([]string(nil), env...)
}

// Status 检查 Docker Compose V2 CLI 插件状态。
func (r *Runner) Status(ctx context.Context) core.ComposeStatusDTO {
	output, err := r.run(ctx, "", "docker", "compose", "version", "--short")
	if err != nil {
		r.logger.Warn("Docker Compose 插件不可用", "keyword", statusKeyword, "error", err)
		return core.ComposeStatusDTO{
			Available: false,
			Error:     "Docker Compose V2 插件不可用，请先安装或启动 Docker Desktop。",
		}
	}
	version := strings.TrimSpace(output)
	r.logger.Info("Docker Compose 插件可用", "keyword", statusKeyword, "version", version)
	return core.ComposeStatusDTO{
		Available: true,
		Version:   version,
	}
}

// ResolveProjectPath 校验并解析用户选择的 Compose 项目目录。
func (r *Runner) ResolveProjectPath(path string) (string, string, string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", "", "", fmt.Errorf("Compose 项目路径不能为空")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", "", "", fmt.Errorf("解析 Compose 项目路径失败: %w", err)
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "", "", "", fmt.Errorf("Compose 项目路径不存在: %w", err)
	}
	if !info.IsDir() {
		abs = filepath.Dir(abs)
	}

	config, err := findComposeFile(abs)
	if err != nil {
		return "", "", "", err
	}
	name := filepath.Base(abs)
	if name == "." || name == string(filepath.Separator) {
		name = "compose-project"
	}
	return name, abs, config, nil
}

// LoadServices 读取 Compose 项目的服务状态。
func (r *Runner) LoadServices(ctx context.Context, project core.ComposeProjectDTO) core.ComposeProjectDTO {
	output, err := r.run(ctx, project.Path, "docker", "compose", "-f", project.Config, "ps", "--all", "--format", "json")
	if err != nil {
		project.Status = "unavailable"
		r.logger.Warn("读取 Compose 服务状态失败", "keyword", statusKeyword, "projectID", project.ID, "projectPath", project.Path, "error", err)
		return project
	}
	services := parseComposeServices(output)
	project.Services = services
	project.Status = summarizeServices(services)
	return project
}

// Up 启动 Compose 项目。
func (r *Runner) Up(ctx context.Context, project core.ComposeProjectDTO) error {
	r.logger.Info("开始启动 Compose 项目", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	_, err := r.run(ctx, project.Path, "docker", "compose", "-f", project.Config, "up", "-d")
	if err != nil {
		r.logger.Error("启动 Compose 项目失败", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path, "error", err)
		return fmt.Errorf("启动 Compose 项目失败: %w", err)
	}
	r.logger.Info("启动 Compose 项目完成", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	return nil
}

// Down 停止并移除 Compose 项目资源。
func (r *Runner) Down(ctx context.Context, project core.ComposeProjectDTO) error {
	r.logger.Info("开始停止 Compose 项目", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	_, err := r.run(ctx, project.Path, "docker", "compose", "-f", project.Config, "down")
	if err != nil {
		r.logger.Error("停止 Compose 项目失败", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path, "error", err)
		return fmt.Errorf("停止 Compose 项目失败: %w", err)
	}
	r.logger.Info("停止 Compose 项目完成", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	return nil
}

// Restart 重启 Compose 项目。
func (r *Runner) Restart(ctx context.Context, project core.ComposeProjectDTO) error {
	r.logger.Info("开始重启 Compose 项目", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	_, err := r.run(ctx, project.Path, "docker", "compose", "-f", project.Config, "restart")
	if err != nil {
		r.logger.Error("重启 Compose 项目失败", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path, "error", err)
		return fmt.Errorf("重启 Compose 项目失败: %w", err)
	}
	r.logger.Info("重启 Compose 项目完成", "keyword", actionKeyword, "projectID", project.ID, "projectPath", project.Path)
	return nil
}

// StreamLogs 订阅 Compose 项目日志。
func (r *Runner) StreamLogs(ctx context.Context, project core.ComposeProjectDTO, service string, tail int, emit func(core.LogLineEvent)) error {
	if tail <= 0 {
		tail = 200
	}
	args := []string{"compose", "-f", project.Config, "logs", "--no-color", "--timestamps", "--tail", fmt.Sprintf("%d", tail), "-f"}
	if strings.TrimSpace(service) != "" {
		args = append(args, service)
	}
	r.logger.Info("开始订阅 Compose 日志", "keyword", logKeyword, "projectID", project.ID, "projectPath", project.Path, "service", service)

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = project.Path
	cmd.Env = append(os.Environ(), r.dockerEnvironment()...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("创建 Compose 日志 stdout 管道失败: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("创建 Compose 日志 stderr 管道失败: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动 Compose 日志订阅失败: %w", err)
	}

	done := make(chan error, 2)
	scan := func(source string, scanner *bufio.Scanner) {
		for scanner.Scan() {
			emit(core.LogLineEvent{
				Source: source,
				Line:   scanner.Text(),
				Level:  "info",
				Time:   time.Now().Format(time.RFC3339),
			})
		}
		done <- scanner.Err()
	}

	stdoutScanner := bufio.NewScanner(stdout)
	stderrScanner := bufio.NewScanner(stderr)
	stdoutScanner.Buffer(make([]byte, 0, 1024*1024), 4*1024*1024)
	stderrScanner.Buffer(make([]byte, 0, 1024*1024), 4*1024*1024)
	go scan("compose", stdoutScanner)
	go scan("compose-error", stderrScanner)

	var scanErr error
	for i := 0; i < 2; i++ {
		if err := <-done; err != nil && scanErr == nil {
			scanErr = err
		}
	}
	waitErr := cmd.Wait()
	if scanErr != nil {
		return fmt.Errorf("读取 Compose 日志失败: %w", scanErr)
	}
	if waitErr != nil && ctx.Err() == nil {
		return fmt.Errorf("Compose 日志订阅异常结束: %w", waitErr)
	}
	return ctx.Err()
}

func (r *Runner) run(ctx context.Context, dir string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), r.dockerEnvironment()...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("%s", message)
	}
	return stdout.String(), nil
}

func (r *Runner) dockerEnvironment() []string {
	r.envMu.RLock()
	defer r.envMu.RUnlock()
	return append([]string(nil), r.env...)
}

func findComposeFile(dir string) (string, error) {
	for _, name := range composeFiles {
		path := filepath.Join(dir, name)
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return path, nil
		}
	}
	return "", fmt.Errorf("未找到 compose.yaml、compose.yml、docker-compose.yaml 或 docker-compose.yml")
}

type composePSItem struct {
	Service string `json:"Service"`
	Name    string `json:"Name"`
	State   string `json:"State"`
	Image   string `json:"Image"`
}

func parseComposeServices(output string) []core.ComposeServiceDTO {
	output = strings.TrimSpace(output)
	if output == "" {
		return nil
	}

	var items []composePSItem
	if strings.HasPrefix(output, "[") {
		_ = json.Unmarshal([]byte(output), &items)
	} else {
		for _, line := range strings.Split(output, "\n") {
			var item composePSItem
			if err := json.Unmarshal([]byte(line), &item); err == nil {
				items = append(items, item)
			}
		}
	}

	services := make([]core.ComposeServiceDTO, 0, len(items))
	for _, item := range items {
		service := item.Service
		if service == "" {
			service = item.Name
		}
		services = append(services, core.ComposeServiceDTO{
			Name:      service,
			State:     strings.ToLower(item.State),
			Container: item.Name,
			Image:     item.Image,
		})
	}
	sort.SliceStable(services, func(i, j int) bool {
		return services[i].Name < services[j].Name
	})
	return services
}

func summarizeServices(services []core.ComposeServiceDTO) string {
	if len(services) == 0 {
		return "idle"
	}
	running := 0
	for _, service := range services {
		if service.State == "running" {
			running++
		}
	}
	if running == len(services) {
		return "running"
	}
	if running > 0 {
		return "partial"
	}
	return "stopped"
}

// NewSubscriptionID 生成日志和进度流的订阅标识。
func NewSubscriptionID() string {
	return uuid.NewString()
}
