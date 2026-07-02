# Coriva

Coriva 是一款面向开发者的现代容器管理平台，基于 Wails、Go 和 React 构建，优先覆盖多 Docker context 的日常管理场景。当前版本聚焦桌面端体验：快速查看 Docker 服务器信息、切换 Docker 连接、管理容器和镜像、维护本地 Compose 项目，并在界面内查看实时日志。

## 功能范围

- **环境概览**：展示当前 Docker context、Docker Engine、Docker Compose V2、Docker 所在服务器关键信息、最近操作状态，以及通过 Docker Engine SDK 读取到的 Docker 参数列表；服务器信息固定展示 12 个字段，区域高度按固定行数计算。
- **多 context 管理**：支持左下角快速切换 Docker 连接，在设置页手动维护 Context，并按规范化 Host 防止重复 URI；删除连接时会先确认，成功后以过渡动画移出列表。
- **容器管理**：支持容器列表、搜索、启动、停止、重启、确认删除和日志订阅；每次进入容器页或点击右上角刷新时，运行中容器置顶并按启动时间正序排列，停止容器按停止时间正序排列；搜索和生命周期操作不再重排列表；停止、重启和删除会先展示确认提示，运行中容器删除会在确认后强制停止并删除，删除成功后以过渡动画移出列表。
- **镜像管理**：支持镜像列表、搜索、无默认值的镜像拉取输入、按拉取任务聚合的进度条、取消拉取和确认删除；删除成功后以过渡动画移出列表。
- **Compose 管理**：支持添加本地 Compose 项目、读取服务状态、启动、停止、重启和日志订阅。
- **资源管理**：提供 Docker volume 只读列表；Docker network 支持列表、搜索、创建、详情、连接容器、断开容器、删除和清理未使用网络，并支持 labels、driver options、IPAM、filter 等高级参数。
- **本地记录**：使用 SQLite 保存 Compose 项目和最近操作，最近操作仅保留最新 100 条，所有本地表均包含逻辑删除字段。

## 技术栈

- 桌面框架：Wails v2
- 后端：Go 1.26
- 前端：React、TypeScript、Vite
- Docker 集成：Docker Engine SDK、Go SSH/TLS 连接、Docker Compose V2 CLI 降级能力
- 本地存储：SQLite（`modernc.org/sqlite`）

## 目录结构

```text
.
├── app.go                 # Wails 后端门面，负责向前端暴露应用能力
├── main.go                # Wails 应用入口和前端资源嵌入配置
├── internal/
│   ├── core/              # 前后端共享 DTO
│   ├── dockerx/           # Docker Engine SDK 封装
│   ├── composex/          # Docker Compose V2 CLI 封装
│   └── store/             # 本地 SQLite 存储和迁移
├── frontend/              # React 前端工程
├── build/                 # Wails 平台构建资源，不包含最终构建输出
└── wails.json             # Wails 项目配置
```

## 环境要求

- macOS、Windows 或 Linux 桌面环境。
- Go 1.26 或兼容版本。
- Node.js 与 npm。
- Wails CLI。
- Docker Desktop 或本机 Docker daemon。
- Docker Compose V2 CLI 插件。

Coriva 不依赖本机 Docker CLI 完成核心资源管理。容器、镜像、数据卷、网络操作和概览中的 Docker daemon 参数均通过 Docker Engine SDK 连接当前选中的 Coriva context，支持以下 Host 类型：

- `unix://`：本机或可访问的 Unix socket。
- `npipe://`：Windows named pipe。
- `tcp://`、`http://`、`https://`：Docker Remote API，可配置 TLS CA、客户端证书、客户端私钥和是否跳过服务端证书校验。
- `ssh://`：通过 Go SSH 连接远端 Docker socket，支持托管私钥、SSH Agent 和当前用户默认私钥；加密私钥的密码仅在切换时输入并在内存中使用，不写入数据库。主机指纹使用 `~/.ssh/known_hosts` 校验，并优先沿用该 Host 已记录的 key 类型，避免与 OpenSSH 默认协商顺序不一致。

首次启动时如果尚未选择 Coriva context，会按 `DOCKER_HOST`、`DOCKER_CONTEXT`、Docker `currentContext` 和默认 socket 解析一个只读启动连接。Coriva 不再读取 Docker CLI context 列表，也不会把 CLI contexts 自动加入 Coriva 自维护列表；需要长期保留的连接请在设置页手动新增。Coriva 切换 context 不会执行 `docker context use`，也不会修改系统 Docker CLI 的 `currentContext`。

Context 维护入口位于设置页。新增或编辑连接时，Coriva 会规范化 Host 并校验重复 URI；保存后立即执行一次连接检测，检测失败也允许保存，并记录失败信息。`unix://`、`npipe://`、`localhost`、`127.0.0.0/8` 和 `::1` 会标记为 `local bridge`，其他地址标记为 `remote bridge`。

删除 Coriva 自有 Docker 连接时，前端会先展示确认提示。用户确认后目标删除按钮会进入不可点击的 loading 状态；后端确认删除成功后，前端再将该连接以过渡动画移出列表。后端会校验 SQLite 逻辑删除实际影响行数，避免连接不存在或已删除时仍返回成功。

Compose 管理当前仍使用 Docker Compose V2 CLI 作为降级能力。Coriva 会为 CLI 注入当前 context 的 `DOCKER_HOST`、`DOCKER_CERT_PATH` 和 `DOCKER_TLS_VERIFY`，但在本机无 Docker CLI/Compose 插件或当前连接为 Coriva 原生 SSH 通道时，Compose 状态会显示不可用。

## 本地开发

安装前端依赖：

```bash
cd frontend
npm install
```

启动 Wails 开发模式：

```bash
wails dev
```

开发模式会启动 Vite 热更新服务，并由 Wails 将 Go 方法绑定到前端。浏览器调试入口由 Wails 提供，默认地址为 `http://localhost:34115`。

## 构建

生产构建使用：

```bash
wails build
```

构建期间会生成 `frontend/dist/` 和 `build/bin/`。这两个目录属于本地生成产物，已在 `.gitignore` 中忽略，不应提交到仓库。

## 验证

推荐在提交前执行：

```bash
npm --prefix frontend run build
go test ./...
```

`main.go` 使用 `//go:embed all:frontend/dist` 嵌入前端构建结果，因此执行 `go test ./...` 前需要先生成 `frontend/dist/`。如果只是验证非入口包，可以执行：

```bash
go test ./internal/...
```

## Wails 后端 API

前端通过 Wails 调用 `App` 暴露的方法：

| 方法 | 说明 |
| --- | --- |
| `GetAppStatus` | 读取 Docker、Compose、最近操作状态、Docker 服务器信息和 Docker Engine SDK 参数列表 |
| `ListDockerContexts` | 查询 Coriva 自维护 Docker contexts 和当前只读启动连接，不自动同步本机 Docker CLI contexts |
| `SaveDockerContext` | 新增或更新 Docker 连接，复制 TLS/SSH 凭据到应用目录，并记录保存后的连接检测结果 |
| `TestDockerContext` | 主动检测指定 Docker context，返回 bridge 类型、连接状态、Engine 版本和错误信息 |
| `SwitchDockerContext` | 切换 Coriva 当前 Docker context，不修改系统 Docker CLI 配置 |
| `DeleteDockerContext` | 逻辑删除 Coriva 自有 Docker 连接，并校验删除结果 |
| `ListContainers` | 查询容器列表，支持搜索和是否包含停止容器，并返回容器创建、启动和停止时间 |
| `StartContainer` / `StopContainer` / `RestartContainer` / `RemoveContainer` | 执行容器生命周期操作，启动、停止和重启成功后前端仅更新当前行状态且不改变当前列表顺序，停止、重启和删除前由前端展示确认提示 |
| `StreamContainerLogs` / `StopLogStream` | 订阅或停止容器日志流 |
| `ListImages` / `PullImage` / `CancelImagePull` / `RemoveImage` | 查询、拉取、取消拉取或删除镜像，删除前由前端展示确认提示 |
| `ListComposeProjects` / `AddComposeProject` | 查询或添加本地 Compose 项目 |
| `ComposeUp` / `ComposeDown` / `ComposeRestart` | 管理 Compose 项目生命周期 |
| `StreamComposeLogs` | 订阅 Compose 项目日志流 |
| `ListVolumes` | 只读查询数据卷 |
| `ListNetworks` | 查询 Docker 网络列表 |
| `CreateNetwork` / `InspectNetwork` / `ConnectNetwork` / `DisconnectNetwork` / `RemoveNetwork` / `PruneNetworks` | 管理 Docker 网络，覆盖 Docker network create、inspect、connect、disconnect、rm 和 prune 的核心 Engine 能力 |

后端向前端推送的事件：

| 事件 | 说明 |
| --- | --- |
| `coriva:log-line` | 容器或 Compose 日志行 |
| `coriva:pull-progress` | 镜像拉取进度 |

## 本地数据

Coriva 在用户应用数据目录下创建 SQLite 数据库：

```text
~/Library/Application Support/Coriva/coriva.db
```

当前本地表包括：

- `schema_migrations`：记录数据库迁移版本。
- `settings`：预留应用配置。
- `docker_connections`：保存 Coriva 自有 Docker 连接，包括 Host、规范化 Host、local/remote bridge 类型、最近连接检测结果、TLS/SSH 凭据托管路径、说明和 TLS 校验策略。
- `compose_projects`：保存用户添加的 Compose 项目。
- `pinned_resources`：预留固定资源。
- `recent_actions`：记录最近关键操作，仅保留最新 100 条未删除记录。

所有表均包含 `deleted_at` 字段，用于逻辑删除。

## 日志与排障

后端日志使用结构化字段输出，并为核心业务流保留稳定检索关键字：

- `CORIVA_DOCKER_CONNECT`：Docker daemon 连接诊断。
- `CORIVA_DOCKER_CONTEXT`：Docker context 保存、切换和恢复。
- `CORIVA_CONTAINER_ACTION`：容器和镜像操作。
- `CORIVA_NETWORK_ACTION`：Docker network 创建、详情、连接、断开、删除和清理操作。
- `CORIVA_COMPOSE_STATUS`：Compose 插件与服务状态读取。
- `CORIVA_COMPOSE_ACTION`：Compose 生命周期操作。
- `CORIVA_LOG_STREAM`：容器和 Compose 日志订阅。
- `CORIVA_SQLITE_MIGRATION`：SQLite 初始化、迁移和最近操作记录。

排查问题时优先按关键字、资源 ID、项目 ID 或镜像名称过滤日志。
