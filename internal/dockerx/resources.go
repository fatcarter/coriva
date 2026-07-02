package dockerx

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/netip"
	"sort"
	"strings"
	"time"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/jsonstream"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"

	"Coriva/internal/core"
)

const networkKeyword = "CORIVA_NETWORK_ACTION"

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

// ListNetworks 返回本机 network 列表。
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
			ID:         item.ID,
			Name:       item.Name,
			Driver:     item.Driver,
			Scope:      item.Scope,
			CreatedAt:  unixTime(item.Created),
			Internal:   item.Internal,
			Attachable: item.Attachable,
			Ingress:    item.Ingress,
			ConfigOnly: item.ConfigOnly,
			EnableIPv4: item.EnableIPv4,
			EnableIPv6: item.EnableIPv6,
			Labels:     item.Labels,
			Options:    item.Options,
		})
	}
	sort.SliceStable(networks, func(i, j int) bool {
		return networks[i].Name < networks[j].Name
	})
	return networks, nil
}

// CreateNetwork 创建 Docker network，覆盖 docker network create 的核心 Engine 能力。
func (c *Client) CreateNetwork(ctx context.Context, request core.NetworkCreateRequestDTO) error {
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return fmt.Errorf("网络名称不能为空")
	}
	driver := strings.TrimSpace(request.Driver)
	if driver == "" {
		driver = "bridge"
	}
	enableIPv4, err := networkBoolPointer(request.EnableIPv4, "IPv4")
	if err != nil {
		return err
	}
	enableIPv6, err := networkBoolPointer(request.EnableIPv6, "IPv6")
	if err != nil {
		return err
	}
	ipam, err := networkIPAMFromRequest(request)
	if err != nil {
		return err
	}

	c.logger.Info("开始创建网络", "keyword", networkKeyword, "networkName", name, "driver", driver, "scope", request.Scope)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	result, err := cli.NetworkCreate(ctx, name, client.NetworkCreateOptions{
		Driver:     driver,
		Scope:      strings.TrimSpace(request.Scope),
		EnableIPv4: enableIPv4,
		EnableIPv6: enableIPv6,
		IPAM:       ipam,
		Internal:   request.Internal,
		Attachable: request.Attachable,
		Ingress:    request.Ingress,
		ConfigOnly: request.ConfigOnly,
		ConfigFrom: strings.TrimSpace(request.ConfigFrom),
		Options:    keyValuesToMap(request.Options),
		Labels:     keyValuesToMap(request.Labels),
	})
	if err != nil {
		c.logger.Error("创建网络失败", "keyword", networkKeyword, "networkName", name, "driver", driver, "error", err)
		return fmt.Errorf("创建网络失败: %w", err)
	}
	c.logger.Info("创建网络完成", "keyword", networkKeyword, "networkName", name, "networkID", result.ID, "warnings", strings.Join(result.Warning, "; "))
	return nil
}

// InspectNetwork 读取 Docker network 详情，并同时返回 Docker Engine 原始 JSON。
func (c *Client) InspectNetwork(ctx context.Context, request core.NetworkInspectRequestDTO) (core.NetworkInspectDTO, error) {
	networkID := strings.TrimSpace(request.ID)
	if networkID == "" {
		return core.NetworkInspectDTO{}, fmt.Errorf("网络 ID 不能为空")
	}

	c.logger.Info("开始读取网络详情", "keyword", networkKeyword, "networkID", networkID, "scope", request.Scope, "verbose", request.Verbose)
	cli, err := c.open()
	if err != nil {
		return core.NetworkInspectDTO{}, err
	}
	defer cli.Close()

	result, err := cli.NetworkInspect(ctx, networkID, client.NetworkInspectOptions{
		Scope:   strings.TrimSpace(request.Scope),
		Verbose: request.Verbose,
	})
	if err != nil {
		c.logger.Error("读取网络详情失败", "keyword", networkKeyword, "networkID", networkID, "error", err)
		return core.NetworkInspectDTO{}, fmt.Errorf("读取网络详情失败: %w", err)
	}
	detail := networkInspectDTO(result.Network, result.Raw)
	c.logger.Info("读取网络详情完成", "keyword", networkKeyword, "networkID", detail.ID, "networkName", detail.Name, "containers", len(detail.Containers), "services", len(detail.Services))
	return detail, nil
}

// ConnectNetwork 将容器连接到 Docker network。
func (c *Client) ConnectNetwork(ctx context.Context, request core.NetworkConnectRequestDTO) error {
	networkID := strings.TrimSpace(request.NetworkID)
	containerID := strings.TrimSpace(request.ContainerID)
	if networkID == "" {
		return fmt.Errorf("网络 ID 不能为空")
	}
	if containerID == "" {
		return fmt.Errorf("容器 ID 不能为空")
	}
	endpoint, err := networkEndpointFromRequest(request)
	if err != nil {
		return err
	}

	c.logger.Info("开始连接容器到网络", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	_, err = cli.NetworkConnect(ctx, networkID, client.NetworkConnectOptions{
		Container:      containerID,
		EndpointConfig: endpoint,
	})
	if err != nil {
		c.logger.Error("连接容器到网络失败", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID, "error", err)
		return fmt.Errorf("连接容器到网络失败: %w", err)
	}
	c.logger.Info("连接容器到网络完成", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID)
	return nil
}

// DisconnectNetwork 将容器从 Docker network 断开。
func (c *Client) DisconnectNetwork(ctx context.Context, request core.NetworkDisconnectRequestDTO) error {
	networkID := strings.TrimSpace(request.NetworkID)
	containerID := strings.TrimSpace(request.ContainerID)
	if networkID == "" {
		return fmt.Errorf("网络 ID 不能为空")
	}
	if containerID == "" {
		return fmt.Errorf("容器 ID 不能为空")
	}

	c.logger.Info("开始断开容器网络", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID, "force", request.Force)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	_, err = cli.NetworkDisconnect(ctx, networkID, client.NetworkDisconnectOptions{Container: containerID, Force: request.Force})
	if err != nil {
		c.logger.Error("断开容器网络失败", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID, "force", request.Force, "error", err)
		return fmt.Errorf("断开容器网络失败: %w", err)
	}
	c.logger.Info("断开容器网络完成", "keyword", networkKeyword, "networkID", networkID, "containerID", containerID, "force", request.Force)
	return nil
}

// RemoveNetwork 删除 Docker network；force 为 true 时兼容 docker network rm --force 的不存在即成功语义。
func (c *Client) RemoveNetwork(ctx context.Context, id string, force bool) error {
	networkID := strings.TrimSpace(id)
	if networkID == "" {
		return fmt.Errorf("网络 ID 不能为空")
	}
	if protectedNetworkName(networkID) {
		return fmt.Errorf("系统网络 %s 不允许删除", networkID)
	}

	c.logger.Info("开始删除网络", "keyword", networkKeyword, "networkID", networkID, "force", force)
	cli, err := c.open()
	if err != nil {
		return err
	}
	defer cli.Close()

	inspectResult, inspectErr := cli.NetworkInspect(ctx, networkID, client.NetworkInspectOptions{})
	if inspectErr == nil && protectedNetworkName(inspectResult.Network.Name) {
		return fmt.Errorf("系统网络 %s 不允许删除", inspectResult.Network.Name)
	}

	_, err = cli.NetworkRemove(ctx, networkID, client.NetworkRemoveOptions{})
	if err != nil {
		if force && cerrdefs.IsNotFound(err) {
			c.logger.Info("网络不存在，按强制删除语义返回成功", "keyword", networkKeyword, "networkID", networkID, "force", force)
			return nil
		}
		c.logger.Error("删除网络失败", "keyword", networkKeyword, "networkID", networkID, "force", force, "error", err)
		return fmt.Errorf("删除网络失败: %w", err)
	}
	c.logger.Info("删除网络完成", "keyword", networkKeyword, "networkID", networkID, "force", force)
	return nil
}

// PruneNetworks 清理所有未使用的 Docker network。
func (c *Client) PruneNetworks(ctx context.Context, request core.NetworkPruneRequestDTO) ([]string, error) {
	filters := filtersFromKeyValues(request.Filters)
	c.logger.Info("开始清理未使用网络", "keyword", networkKeyword, "filters", len(request.Filters))
	cli, err := c.open()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	result, err := cli.NetworkPrune(ctx, client.NetworkPruneOptions{Filters: filters})
	if err != nil {
		c.logger.Error("清理未使用网络失败", "keyword", networkKeyword, "filters", len(request.Filters), "error", err)
		return nil, fmt.Errorf("清理未使用网络失败: %w", err)
	}
	deleted := append([]string(nil), result.Report.NetworksDeleted...)
	sort.Strings(deleted)
	c.logger.Info("清理未使用网络完成", "keyword", networkKeyword, "deleted", len(deleted))
	return deleted, nil
}

func networkBoolPointer(value string, label string) (*bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "default":
		return nil, nil
	case "enabled", "enable", "true", "1":
		enabled := true
		return &enabled, nil
	case "disabled", "disable", "false", "0":
		disabled := false
		return &disabled, nil
	default:
		return nil, fmt.Errorf("%s 开关值无效: %s", label, value)
	}
}

func networkIPAMFromRequest(request core.NetworkCreateRequestDTO) (*network.IPAM, error) {
	driver := strings.TrimSpace(request.IPAMDriver)
	options := keyValuesToMap(request.IPAMOptions)
	configs := make([]network.IPAMConfig, 0, len(request.IPAMConfigs))
	for index, item := range request.IPAMConfigs {
		config, empty, err := networkIPAMConfigFromRequest(item)
		if err != nil {
			return nil, fmt.Errorf("第 %d 段 IPAM 配置无效: %w", index+1, err)
		}
		if !empty {
			configs = append(configs, config)
		}
	}
	if driver == "" && len(options) == 0 && len(configs) == 0 {
		return nil, nil
	}
	return &network.IPAM{
		Driver:  driver,
		Options: options,
		Config:  configs,
	}, nil
}

func networkIPAMConfigFromRequest(item core.NetworkIPAMConfigDTO) (network.IPAMConfig, bool, error) {
	var config network.IPAMConfig
	empty := true
	if value := strings.TrimSpace(item.Subnet); value != "" {
		prefix, err := netip.ParsePrefix(value)
		if err != nil {
			return network.IPAMConfig{}, false, fmt.Errorf("subnet 不是有效 CIDR: %w", err)
		}
		config.Subnet = prefix
		empty = false
	}
	if value := strings.TrimSpace(item.IPRange); value != "" {
		prefix, err := netip.ParsePrefix(value)
		if err != nil {
			return network.IPAMConfig{}, false, fmt.Errorf("ip-range 不是有效 CIDR: %w", err)
		}
		config.IPRange = prefix
		empty = false
	}
	if value := strings.TrimSpace(item.Gateway); value != "" {
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return network.IPAMConfig{}, false, fmt.Errorf("gateway 不是有效 IP: %w", err)
		}
		config.Gateway = addr
		empty = false
	}
	auxAddresses := make(map[string]netip.Addr)
	for _, pair := range item.AuxAddresses {
		key := strings.TrimSpace(pair.Key)
		value := strings.TrimSpace(pair.Value)
		if key == "" && value == "" {
			continue
		}
		if key == "" || value == "" {
			return network.IPAMConfig{}, false, fmt.Errorf("aux-address 必须同时包含名称和 IP")
		}
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return network.IPAMConfig{}, false, fmt.Errorf("aux-address %s 不是有效 IP: %w", key, err)
		}
		auxAddresses[key] = addr
		empty = false
	}
	if len(auxAddresses) > 0 {
		config.AuxAddress = auxAddresses
	}
	return config, empty, nil
}

func networkEndpointFromRequest(request core.NetworkConnectRequestDTO) (*network.EndpointSettings, error) {
	aliases := trimStrings(request.Aliases)
	links := trimStrings(request.Links)
	driverOptions := keyValuesToMap(request.DriverOptions)
	linkLocalIPs := make([]netip.Addr, 0, len(request.LinkLocalIPs))
	for _, value := range request.LinkLocalIPs {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return nil, fmt.Errorf("link-local-ip 不是有效 IP: %w", err)
		}
		linkLocalIPs = append(linkLocalIPs, addr)
	}

	ipamConfig := &network.EndpointIPAMConfig{LinkLocalIPs: linkLocalIPs}
	hasIPAM := len(linkLocalIPs) > 0
	if value := strings.TrimSpace(request.IPv4Address); value != "" {
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return nil, fmt.Errorf("IPv4 地址无效: %w", err)
		}
		ipamConfig.IPv4Address = addr
		hasIPAM = true
	}
	if value := strings.TrimSpace(request.IPv6Address); value != "" {
		addr, err := netip.ParseAddr(value)
		if err != nil {
			return nil, fmt.Errorf("IPv6 地址无效: %w", err)
		}
		ipamConfig.IPv6Address = addr
		hasIPAM = true
	}

	if len(aliases) == 0 && len(links) == 0 && len(driverOptions) == 0 && !hasIPAM && request.GwPriority == 0 {
		return nil, nil
	}
	endpoint := &network.EndpointSettings{
		Aliases:    aliases,
		Links:      links,
		DriverOpts: driverOptions,
		GwPriority: request.GwPriority,
	}
	if hasIPAM {
		endpoint.IPAMConfig = ipamConfig
	}
	return endpoint, nil
}

func networkInspectDTO(item network.Inspect, raw json.RawMessage) core.NetworkInspectDTO {
	containers := make([]core.NetworkEndpointDTO, 0, len(item.Containers))
	for id, endpoint := range item.Containers {
		containers = append(containers, core.NetworkEndpointDTO{
			ContainerID: id,
			Name:        endpoint.Name,
			EndpointID:  endpoint.EndpointID,
			MacAddress:  endpoint.MacAddress.String(),
			IPv4Address: prefixString(endpoint.IPv4Address),
			IPv6Address: prefixString(endpoint.IPv6Address),
		})
	}
	sort.SliceStable(containers, func(i, j int) bool {
		return containers[i].Name < containers[j].Name
	})

	services := make([]core.NetworkServiceDTO, 0, len(item.Services))
	for id, service := range item.Services {
		services = append(services, core.NetworkServiceDTO{
			ID:           id,
			VIP:          addrString(service.VIP),
			Ports:        append([]string(nil), service.Ports...),
			LocalLBIndex: service.LocalLBIndex,
			TaskCount:    len(service.Tasks),
		})
	}
	sort.SliceStable(services, func(i, j int) bool {
		return services[i].ID < services[j].ID
	})

	return core.NetworkInspectDTO{
		ID:         item.ID,
		Name:       item.Name,
		Driver:     item.Driver,
		Scope:      item.Scope,
		CreatedAt:  unixTime(item.Created),
		Internal:   item.Internal,
		Attachable: item.Attachable,
		Ingress:    item.Ingress,
		ConfigOnly: item.ConfigOnly,
		EnableIPv4: item.EnableIPv4,
		EnableIPv6: item.EnableIPv6,
		ConfigFrom: item.ConfigFrom.Network,
		IPAM:       networkIPAMDTO(item.IPAM),
		Options:    item.Options,
		Labels:     item.Labels,
		Containers: containers,
		Services:   services,
		RawJSON:    formattedRawJSON(raw, item),
	}
}

func networkIPAMDTO(item network.IPAM) core.NetworkIPAMDTO {
	configs := make([]core.NetworkIPAMConfigDTO, 0, len(item.Config))
	for _, config := range item.Config {
		auxAddresses := make([]core.NetworkKeyValueDTO, 0, len(config.AuxAddress))
		for key, value := range config.AuxAddress {
			auxAddresses = append(auxAddresses, core.NetworkKeyValueDTO{Key: key, Value: addrString(value)})
		}
		sort.SliceStable(auxAddresses, func(i, j int) bool {
			return auxAddresses[i].Key < auxAddresses[j].Key
		})
		configs = append(configs, core.NetworkIPAMConfigDTO{
			Subnet:       prefixString(config.Subnet),
			IPRange:      prefixString(config.IPRange),
			Gateway:      addrString(config.Gateway),
			AuxAddresses: auxAddresses,
		})
	}
	return core.NetworkIPAMDTO{
		Driver:  item.Driver,
		Options: item.Options,
		Configs: configs,
	}
}

func keyValuesToMap(items []core.NetworkKeyValueDTO) map[string]string {
	values := make(map[string]string)
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		values[key] = strings.TrimSpace(item.Value)
	}
	if len(values) == 0 {
		return nil
	}
	return values
}

func filtersFromKeyValues(items []core.NetworkKeyValueDTO) client.Filters {
	filters := make(client.Filters)
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		value := strings.TrimSpace(item.Value)
		if key == "" || value == "" {
			continue
		}
		filters = filters.Add(key, value)
	}
	return filters
}

func trimStrings(items []string) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		value := strings.TrimSpace(item)
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func protectedNetworkName(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "bridge", "host", "none":
		return true
	default:
		return false
	}
}

func unixTime(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.Unix()
}

func addrString(value netip.Addr) string {
	if !value.IsValid() {
		return ""
	}
	return value.String()
}

func prefixString(value netip.Prefix) string {
	if !value.IsValid() {
		return ""
	}
	return value.String()
}

func formattedRawJSON(raw json.RawMessage, fallback any) string {
	if len(raw) == 0 {
		encoded, err := json.MarshalIndent(fallback, "", "  ")
		if err != nil {
			return ""
		}
		return string(encoded)
	}
	var buffer bytes.Buffer
	if err := json.Indent(&buffer, raw, "", "  "); err != nil {
		return string(raw)
	}
	return buffer.String()
}

func pullEventFromMessage(reference string, message jsonstream.Message) core.PullProgressEvent {
	event := core.PullProgressEvent{
		Reference: reference,
		Status:    message.Status,
		ID:        message.ID,
	}
	if message.Progress != nil {
		event.Current = message.Progress.Current
		event.Total = message.Progress.Total
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
