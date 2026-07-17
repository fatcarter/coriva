package core

// AppStatusDTO 描述客户端启动后需要展示的运行环境状态。
type AppStatusDTO struct {
	Docker        DockerStatusDTO   `json:"docker"`
	Compose       ComposeStatusDTO  `json:"compose"`
	ActiveContext DockerContextDTO  `json:"activeContext"`
	DatabasePath  string            `json:"databasePath"`
	AppDataPath   string            `json:"appDataPath"`
	Platform      string            `json:"platform"`
	GoVersion     string            `json:"goVersion"`
	RecentActions []RecentActionDTO `json:"recentActions"`
}

// DockerStatusDTO 描述本机 Docker Engine 的连接状态和版本信息。
type DockerStatusDTO struct {
	Connected     bool                 `json:"connected"`
	Host          string               `json:"host"`
	ContextID     string               `json:"contextId"`
	ContextName   string               `json:"contextName"`
	ServerVersion string               `json:"serverVersion"`
	APIVersion    string               `json:"apiVersion"`
	OS            string               `json:"os"`
	Architecture  string               `json:"architecture"`
	Containers    int                  `json:"containers"`
	Images        int                  `json:"images"`
	Parameters    []DockerParameterDTO `json:"parameters"`
	Error         string               `json:"error"`
}

// DockerParameterDTO 描述通过 Docker Engine SDK 读取到的原始参数。
type DockerParameterDTO struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// DockerContextDTO 描述 Coriva 可切换的 Docker 连接上下文。
type DockerContextDTO struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	Source           string `json:"source"`
	Host             string `json:"host"`
	NormalizedHost   string `json:"normalizedHost"`
	BridgeType       string `json:"bridgeType"`
	ConnectionStatus string `json:"connectionStatus"`
	ConnectionError  string `json:"connectionError"`
	LastCheckedAt    string `json:"lastCheckedAt"`
	CaPath           string `json:"caPath"`
	CertPath         string `json:"certPath"`
	KeyPath          string `json:"keyPath"`
	SSHKeyPath       string `json:"sshKeyPath"`
	SkipTLSVerify    bool   `json:"skipTlsVerify"`
	Current          bool   `json:"current"`
	ReadOnly         bool   `json:"readOnly"`
	Importable       bool   `json:"importable"`
	Error            string `json:"error"`
	UpdatedAt        string `json:"updatedAt"`
}

// SaveDockerContextRequestDTO 描述创建或更新 Docker 连接的请求。
type SaveDockerContextRequestDTO struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Host          string `json:"host"`
	CaPath        string `json:"caPath"`
	CertPath      string `json:"certPath"`
	KeyPath       string `json:"keyPath"`
	SSHKeyPath    string `json:"sshKeyPath"`
	SkipTLSVerify bool   `json:"skipTlsVerify"`
}

// DockerContextProbeDTO 描述 Docker context 连接测试结果。
type DockerContextProbeDTO struct {
	OK            bool   `json:"ok"`
	Message       string `json:"message"`
	BridgeType    string `json:"bridgeType"`
	ServerVersion string `json:"serverVersion"`
	APIVersion    string `json:"apiVersion"`
	OS            string `json:"os"`
	Architecture  string `json:"architecture"`
}

// SwitchDockerContextRequestDTO 描述切换 Docker 连接的请求。
type SwitchDockerContextRequestDTO struct {
	ID         string `json:"id"`
	Passphrase string `json:"passphrase"`
}

// ComposeStatusDTO 描述 Docker Compose V2 CLI 插件是否可用。
type ComposeStatusDTO struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Error     string `json:"error"`
}

// ActionResultDTO 是所有写操作统一返回结果，便于前端展示反馈。
type ActionResultDTO struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// ContainerQueryDTO 描述容器列表筛选条件。
type ContainerQueryDTO struct {
	Search string `json:"search"`
	All    bool   `json:"all"`
}

// ContainerSummaryDTO 描述容器列表中单个容器的核心信息。
type ContainerSummaryDTO struct {
	ID        string `json:"id"`
	ShortID   string `json:"shortId"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	Command   string `json:"command"`
	State     string `json:"state"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"createdAt"`
	// StartedAt 记录容器最近一次进入运行态的 Unix 秒级时间戳，未知时为 0。
	StartedAt int64 `json:"startedAt"`
	// FinishedAt 记录容器最近一次退出运行态的 Unix 秒级时间戳，未知时为 0。
	FinishedAt int64    `json:"finishedAt"`
	Ports      []string `json:"ports"`
	Networks   []string `json:"networks"`
	Compose    string   `json:"compose"`
}

// ImageQueryDTO 描述镜像列表筛选条件。
type ImageQueryDTO struct {
	Search string `json:"search"`
}

// ImageSummaryDTO 描述本地镜像的核心信息。
type ImageSummaryDTO struct {
	ID          string   `json:"id"`
	ShortID     string   `json:"shortId"`
	RepoTags    []string `json:"repoTags"`
	RepoDigests []string `json:"repoDigests"`
	Size        int64    `json:"size"`
	CreatedAt   int64    `json:"createdAt"`
	Containers  int64    `json:"containers"`
}

// ImagePullRequestDTO 描述镜像拉取请求。
type ImagePullRequestDTO struct {
	Reference string `json:"reference"`
}

// ImageRunEnvDTO 描述从镜像运行容器时传入的单个环境变量。
type ImageRunEnvDTO struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ImageRunPortDTO 描述镜像声明端口和容器运行时端口发布关系。
type ImageRunPortDTO struct {
	ContainerPort string `json:"containerPort"`
	Protocol      string `json:"protocol"`
	HostIP        string `json:"hostIp"`
	HostPort      string `json:"hostPort"`
	Publish       bool   `json:"publish"`
}

// ImageRunConfigDTO 描述从 Docker image inspect 读取到的默认运行配置。
type ImageRunConfigDTO struct {
	ID           string            `json:"id"`
	Reference    string            `json:"reference"`
	RepoTags     []string          `json:"repoTags"`
	RepoDigests  []string          `json:"repoDigests"`
	Entrypoint   []string          `json:"entrypoint"`
	Command      []string          `json:"command"`
	Env          []ImageRunEnvDTO  `json:"env"`
	WorkingDir   string            `json:"workingDir"`
	User         string            `json:"user"`
	ExposedPorts []ImageRunPortDTO `json:"exposedPorts"`
	Volumes      []string          `json:"volumes"`
	OS           string            `json:"os"`
	Architecture string            `json:"architecture"`
	Size         int64             `json:"size"`
}

// ImageRunRequestDTO 描述根据镜像配置创建并启动容器的请求。
type ImageRunRequestDTO struct {
	Image             string            `json:"image"`
	Name              string            `json:"name"`
	Entrypoint        []string          `json:"entrypoint"`
	Command           []string          `json:"command"`
	Env               []ImageRunEnvDTO  `json:"env"`
	WorkingDir        string            `json:"workingDir"`
	User              string            `json:"user"`
	Ports             []ImageRunPortDTO `json:"ports"`
	Network           string            `json:"network"`
	RestartPolicy     string            `json:"restartPolicy"`
	RestartMaxRetries int               `json:"restartMaxRetries"`
	AutoRemove        bool              `json:"autoRemove"`
}

// ComposeProjectDTO 描述一个被 Coriva 记录的本地 Compose 项目。
type ComposeProjectDTO struct {
	ID        string              `json:"id"`
	Name      string              `json:"name"`
	Path      string              `json:"path"`
	Config    string              `json:"config"`
	Status    string              `json:"status"`
	Services  []ComposeServiceDTO `json:"services"`
	UpdatedAt string              `json:"updatedAt"`
}

// ComposeServiceDTO 描述 Compose 项目中的单个服务状态。
type ComposeServiceDTO struct {
	Name      string `json:"name"`
	State     string `json:"state"`
	Container string `json:"container"`
	Image     string `json:"image"`
}

// AddComposeProjectRequestDTO 描述添加 Compose 项目的请求。
type AddComposeProjectRequestDTO struct {
	Path string `json:"path"`
}

// VolumeDTO 描述 Docker volume 的只读信息。
type VolumeDTO struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	Scope      string            `json:"scope"`
	Labels     map[string]string `json:"labels"`
}

// NetworkDTO 描述 Docker network 列表中的核心信息。
type NetworkDTO struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Scope      string            `json:"scope"`
	CreatedAt  int64             `json:"createdAt"`
	Internal   bool              `json:"internal"`
	Attachable bool              `json:"attachable"`
	Ingress    bool              `json:"ingress"`
	ConfigOnly bool              `json:"configOnly"`
	EnableIPv4 bool              `json:"enableIpv4"`
	EnableIPv6 bool              `json:"enableIpv6"`
	Labels     map[string]string `json:"labels"`
	Options    map[string]string `json:"options"`
}

// NetworkKeyValueDTO 描述 Docker network 高级选项中的键值参数。
type NetworkKeyValueDTO struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// NetworkIPAMConfigDTO 描述 Docker network 的单段 IPAM 地址配置。
type NetworkIPAMConfigDTO struct {
	Subnet       string               `json:"subnet"`
	IPRange      string               `json:"ipRange"`
	Gateway      string               `json:"gateway"`
	AuxAddresses []NetworkKeyValueDTO `json:"auxAddresses"`
}

// NetworkCreateRequestDTO 描述创建 Docker network 的请求参数。
type NetworkCreateRequestDTO struct {
	Name        string                 `json:"name"`
	Driver      string                 `json:"driver"`
	Scope       string                 `json:"scope"`
	EnableIPv4  string                 `json:"enableIpv4"`
	EnableIPv6  string                 `json:"enableIpv6"`
	Internal    bool                   `json:"internal"`
	Attachable  bool                   `json:"attachable"`
	Ingress     bool                   `json:"ingress"`
	ConfigOnly  bool                   `json:"configOnly"`
	ConfigFrom  string                 `json:"configFrom"`
	Options     []NetworkKeyValueDTO   `json:"options"`
	Labels      []NetworkKeyValueDTO   `json:"labels"`
	IPAMDriver  string                 `json:"ipamDriver"`
	IPAMOptions []NetworkKeyValueDTO   `json:"ipamOptions"`
	IPAMConfigs []NetworkIPAMConfigDTO `json:"ipamConfigs"`
}

// NetworkInspectRequestDTO 描述读取 Docker network 详情的请求参数。
type NetworkInspectRequestDTO struct {
	ID      string `json:"id"`
	Scope   string `json:"scope"`
	Verbose bool   `json:"verbose"`
}

// NetworkConnectRequestDTO 描述将容器连接到 Docker network 的请求参数。
type NetworkConnectRequestDTO struct {
	NetworkID     string               `json:"networkId"`
	ContainerID   string               `json:"containerId"`
	Aliases       []string             `json:"aliases"`
	Links         []string             `json:"links"`
	IPv4Address   string               `json:"ipv4Address"`
	IPv6Address   string               `json:"ipv6Address"`
	LinkLocalIPs  []string             `json:"linkLocalIps"`
	DriverOptions []NetworkKeyValueDTO `json:"driverOptions"`
	GwPriority    int                  `json:"gwPriority"`
}

// NetworkDisconnectRequestDTO 描述将容器从 Docker network 断开的请求参数。
type NetworkDisconnectRequestDTO struct {
	NetworkID   string `json:"networkId"`
	ContainerID string `json:"containerId"`
	Force       bool   `json:"force"`
}

// NetworkPruneRequestDTO 描述清理未使用 Docker network 的筛选参数。
type NetworkPruneRequestDTO struct {
	Filters []NetworkKeyValueDTO `json:"filters"`
}

// NetworkIPAMDTO 描述 Docker network 详情中的 IPAM 配置。
type NetworkIPAMDTO struct {
	Driver  string                 `json:"driver"`
	Options map[string]string      `json:"options"`
	Configs []NetworkIPAMConfigDTO `json:"configs"`
}

// NetworkEndpointDTO 描述 Docker network 中已连接的容器端点。
type NetworkEndpointDTO struct {
	ContainerID string `json:"containerId"`
	Name        string `json:"name"`
	EndpointID  string `json:"endpointId"`
	MacAddress  string `json:"macAddress"`
	IPv4Address string `json:"ipv4Address"`
	IPv6Address string `json:"ipv6Address"`
}

// NetworkServiceDTO 描述 swarm network 中关联的服务信息。
type NetworkServiceDTO struct {
	ID           string   `json:"id"`
	VIP          string   `json:"vip"`
	Ports        []string `json:"ports"`
	LocalLBIndex int      `json:"localLbIndex"`
	TaskCount    int      `json:"taskCount"`
}

// NetworkInspectDTO 描述 Docker network inspect 的结构化详情和原始 JSON。
type NetworkInspectDTO struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Driver     string               `json:"driver"`
	Scope      string               `json:"scope"`
	CreatedAt  int64                `json:"createdAt"`
	Internal   bool                 `json:"internal"`
	Attachable bool                 `json:"attachable"`
	Ingress    bool                 `json:"ingress"`
	ConfigOnly bool                 `json:"configOnly"`
	EnableIPv4 bool                 `json:"enableIpv4"`
	EnableIPv6 bool                 `json:"enableIpv6"`
	ConfigFrom string               `json:"configFrom"`
	IPAM       NetworkIPAMDTO       `json:"ipam"`
	Options    map[string]string    `json:"options"`
	Labels     map[string]string    `json:"labels"`
	Containers []NetworkEndpointDTO `json:"containers"`
	Services   []NetworkServiceDTO  `json:"services"`
	RawJSON    string               `json:"rawJson"`
}

// LogStreamRequestDTO 描述日志流订阅请求。
type LogStreamRequestDTO struct {
	ID      string `json:"id"`
	Tail    int    `json:"tail"`
	Follow  bool   `json:"follow"`
	Service string `json:"service"`
}

// StreamSubscriptionDTO 描述后端创建的日志或进度订阅。
type StreamSubscriptionDTO struct {
	SubscriptionID string `json:"subscriptionId"`
}

// LogLineEvent 是后端推送给前端的日志行事件。
type LogLineEvent struct {
	SubscriptionID string `json:"subscriptionId"`
	Source         string `json:"source"`
	Line           string `json:"line"`
	Level          string `json:"level"`
	Time           string `json:"time"`
}

// PullProgressEvent 是镜像拉取期间推送给前端的进度事件。
type PullProgressEvent struct {
	SubscriptionID string `json:"subscriptionId"`
	Reference      string `json:"reference"`
	Status         string `json:"status"`
	ID             string `json:"id"`
	Progress       string `json:"progress"`
	Current        int64  `json:"current"`
	Total          int64  `json:"total"`
	Error          string `json:"error"`
	Done           bool   `json:"done"`
}

// RecentActionDTO 描述本地最近操作记录。
type RecentActionDTO struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Target    string `json:"target"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	CreatedAt string `json:"createdAt"`
}
