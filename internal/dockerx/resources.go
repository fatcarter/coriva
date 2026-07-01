package dockerx

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/jsonstream"
	"github.com/moby/moby/client"

	"Coriva/internal/core"
)

// ListImages 返回本地镜像列表。
func (c *Client) ListImages(ctx context.Context, query core.ImageQueryDTO) ([]core.ImageSummaryDTO, error) {
	cli, err := c.open()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	result, err := cli.ImageList(ctx, client.ImageListOptions{})
	if err != nil {
		c.logger.Warn("镜像列表读取失败", "keyword", actionKeyword, "error", err)
		return nil, fmt.Errorf("读取镜像列表失败: %w", err)
	}

	search := strings.ToLower(strings.TrimSpace(query.Search))
	images := make([]core.ImageSummaryDTO, 0, len(result.Items))
	for _, item := range result.Items {
		summary := core.ImageSummaryDTO{
			ID:          item.ID,
			ShortID:     shortID(strings.TrimPrefix(item.ID, "sha256:")),
			RepoTags:    item.RepoTags,
			RepoDigests: item.RepoDigests,
			Size:        item.Size,
			CreatedAt:   item.Created,
			Containers:  item.Containers,
		}
		if matchesImage(summary, search) {
			images = append(images, summary)
		}
	}
	sort.SliceStable(images, func(i, j int) bool {
		return images[i].CreatedAt > images[j].CreatedAt
	})
	return images, nil
}

// PullImage 拉取镜像，并通过回调推送实时进度。
func (c *Client) PullImage(ctx context.Context, reference string, emit func(core.PullProgressEvent)) error {
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return fmt.Errorf("镜像名称不能为空")
	}

	c.logger.Info("开始拉取镜像", "keyword", actionKeyword, "image", reference)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	response, err := cli.ImagePull(ctx, reference, client.ImagePullOptions{})
	if err != nil {
		c.logger.Error("镜像拉取请求失败", "keyword", actionKeyword, "image", reference, "error", err)
		return fmt.Errorf("拉取镜像失败: %w", err)
	}
	defer response.Close()

	for message, err := range response.JSONMessages(ctx) {
		if err != nil {
			c.logger.Error("镜像拉取进度读取失败", "keyword", actionKeyword, "image", reference, "error", err)
			return fmt.Errorf("读取镜像拉取进度失败: %w", err)
		}
		emit(pullEventFromMessage(reference, message))
	}

	emit(core.PullProgressEvent{
		Reference: reference,
		Status:    "镜像拉取完成",
		Done:      true,
	})
	c.logger.Info("镜像拉取完成", "keyword", actionKeyword, "image", reference)
	return nil
}

// RemoveImage 删除本地镜像。
func (c *Client) RemoveImage(ctx context.Context, id string, force bool) error {
	c.logger.Info("开始删除镜像", "keyword", actionKeyword, "imageID", id, "force", force)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	_, err = cli.ImageRemove(ctx, id, client.ImageRemoveOptions{Force: force, PruneChildren: true})
	if err != nil {
		c.logger.Error("删除镜像失败", "keyword", actionKeyword, "imageID", id, "force", force, "error", err)
		return fmt.Errorf("删除镜像失败: %w", err)
	}
	c.logger.Info("删除镜像完成", "keyword", actionKeyword, "imageID", id, "force", force)
	return nil
}

// ListVolumes 返回本机 volume 只读列表。
func (c *Client) ListVolumes(ctx context.Context) ([]core.VolumeDTO, error) {
	cli, err := c.open()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	result, err := cli.VolumeList(ctx, client.VolumeListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取数据卷失败: %w", err)
	}
	volumes := make([]core.VolumeDTO, 0, len(result.Items))
	for _, item := range result.Items {
		volumes = append(volumes, core.VolumeDTO{
			Name:       item.Name,
			Driver:     item.Driver,
			Mountpoint: item.Mountpoint,
			Scope:      item.Scope,
			Labels:     item.Labels,
		})
	}
	sort.SliceStable(volumes, func(i, j int) bool {
		return volumes[i].Name < volumes[j].Name
	})
	return volumes, nil
}

// ListNetworks 返回本机 network 只读列表。
func (c *Client) ListNetworks(ctx context.Context) ([]core.NetworkDTO, error) {
	cli, err := c.open()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	result, err := cli.NetworkList(ctx, client.NetworkListOptions{})
	if err != nil {
		return nil, fmt.Errorf("读取网络失败: %w", err)
	}
	networks := make([]core.NetworkDTO, 0, len(result.Items))
	for _, item := range result.Items {
		networks = append(networks, core.NetworkDTO{
			ID:     item.ID,
			Name:   item.Name,
			Driver: item.Driver,
			Scope:  item.Scope,
			Labels: item.Labels,
		})
	}
	sort.SliceStable(networks, func(i, j int) bool {
		return networks[i].Name < networks[j].Name
	})
	return networks, nil
}

func pullEventFromMessage(reference string, message jsonstream.Message) core.PullProgressEvent {
	event := core.PullProgressEvent{
		Reference: reference,
		Status:    message.Status,
		ID:        message.ID,
	}
	if message.Progress != nil {
		event.Progress = formatProgress(message.Progress.Current, message.Progress.Total, message.Progress.Units)
	}
	if message.Error != nil {
		event.Error = message.Error.Message
		event.Done = true
	}
	return event
}

func formatProgress(current int64, total int64, units string) string {
	if current <= 0 && total <= 0 {
		return ""
	}
	if units == "" || units == "bytes" {
		return fmt.Sprintf("%s / %s", formatBytes(current), formatBytes(total))
	}
	if total > 0 {
		return fmt.Sprintf("%d / %d %s", current, total, units)
	}
	return fmt.Sprintf("%d %s", current, units)
}

func formatBytes(value int64) string {
	if value <= 0 {
		return "0 B"
	}
	const unit = 1024
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(value)
	index := 0
	for size >= unit && index < len(units)-1 {
		size /= unit
		index++
	}
	if index == 0 {
		return fmt.Sprintf("%d %s", value, units[index])
	}
	return fmt.Sprintf("%.1f %s", size, units[index])
}

func firstContainerName(names []string) string {
	if len(names) == 0 {
		return "未命名容器"
	}
	return strings.TrimPrefix(names[0], "/")
}

func shortID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}

func formatPorts(ports []container.PortSummary) []string {
	formatted := make([]string, 0, len(ports))
	for _, port := range ports {
		if port.PublicPort > 0 {
			formatted = append(formatted, fmt.Sprintf("%s:%d->%d/%s", port.IP, port.PublicPort, port.PrivatePort, port.Type))
			continue
		}
		formatted = append(formatted, fmt.Sprintf("%d/%s", port.PrivatePort, port.Type))
	}
	return formatted
}

func networkNames(settings *container.NetworkSettingsSummary) []string {
	if settings == nil || len(settings.Networks) == 0 {
		return nil
	}
	names := make([]string, 0, len(settings.Networks))
	for name := range settings.Networks {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func matchesContainer(container core.ContainerSummaryDTO, search string) bool {
	if search == "" {
		return true
	}
	fields := []string{container.ID, container.ShortID, container.Name, container.Image, container.State, container.Status, container.Compose}
	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), search) {
			return true
		}
	}
	return false
}

func matchesImage(image core.ImageSummaryDTO, search string) bool {
	if search == "" {
		return true
	}
	fields := []string{image.ID, image.ShortID}
	fields = append(fields, image.RepoTags...)
	fields = append(fields, image.RepoDigests...)
	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), search) {
			return true
		}
	}
	return false
}

func stripDockerLogHeader(line string) string {
	// Docker raw logs 在 TTY 关闭时可能带有 8 字节 stream header，这里保守清理不可见前缀，避免 UI 出现控制字符。
	return strings.TrimLeft(line, "\x00\x01\x02\x03\x04\x05\x06\x07\b\t")
}

func logAndEmitError(logger *slog.Logger, subscriptionID string, source string, err error, emit func(core.LogLineEvent)) {
	logger.Warn("日志流结束并返回错误", "keyword", logKeyword, "subscriptionID", subscriptionID, "source", source, "error", err)
	emit(core.LogLineEvent{
		SubscriptionID: subscriptionID,
		Source:         source,
		Line:           err.Error(),
		Level:          "error",
		Time:           time.Now().Format(time.RFC3339),
	})
}
