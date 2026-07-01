import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {
    Activity,
    Box,
    Boxes,
    CircleAlert,
    CircleCheck,
    ChevronDown,
    Cloud,
    Container,
    Database,
    Edit3,
    FolderPlus,
    HardDrive,
    Image,
    Layers,
    LoaderCircle,
    Network,
    Play,
    RefreshCw,
    RotateCcw,
    Search,
    Save,
    Square,
    Trash2,
    Terminal,
    Wifi,
    X,
} from 'lucide-react';
import './App.css';
import {
    AddComposeProject,
    ComposeDown,
    ComposeRestart,
    ComposeUp,
    DeleteDockerContext,
    GetAppStatus,
    ListDockerContexts,
    ListComposeProjects,
    ListContainers,
    ListImages,
    ListNetworks,
    ListVolumes,
    PullImage,
    RemoveContainer,
    RemoveImage,
    RestartContainer,
    SaveDockerContext,
    StartContainer,
    StopContainer,
    StopLogStream,
    SwitchDockerContext,
    StreamComposeLogs,
    StreamContainerLogs,
    TestDockerContext,
} from '../wailsjs/go/main/App';
import {EventsOff, EventsOn} from '../wailsjs/runtime/runtime';

type ViewKey = 'overview' | 'containers' | 'images' | 'compose' | 'volumes' | 'networks' | 'settings';

type AppStatus = {
    docker: DockerStatus;
    compose: ComposeStatus;
    activeContext: DockerContext;
    databasePath: string;
    appDataPath: string;
    platform: string;
    goVersion: string;
    recentActions: RecentAction[];
};

type DockerStatus = {
    connected: boolean;
    host: string;
    contextId: string;
    contextName: string;
    serverVersion: string;
    apiVersion: string;
    os: string;
    architecture: string;
    containers: number;
    images: number;
    parameters: DockerParameter[];
    error: string;
};

type DockerParameter = {
    key: string;
    value: string;
};

type DockerContext = {
    id: string;
    name: string;
    description: string;
    source: string;
    host: string;
    normalizedHost: string;
    bridgeType: string;
    connectionStatus: string;
    connectionError: string;
    lastCheckedAt: string;
    caPath: string;
    certPath: string;
    keyPath: string;
    sshKeyPath: string;
    skipTlsVerify: boolean;
    current: boolean;
    readOnly: boolean;
    importable: boolean;
    error: string;
    updatedAt: string;
};

type DockerContextForm = {
    id: string;
    name: string;
    description: string;
    host: string;
    caPath: string;
    certPath: string;
    keyPath: string;
    sshKeyPath: string;
    skipTlsVerify: boolean;
};

type DockerContextProbe = {
    ok: boolean;
    message: string;
    bridgeType: string;
    serverVersion: string;
    apiVersion: string;
    os: string;
    architecture: string;
};

type ComposeStatus = {
    available: boolean;
    version: string;
    error: string;
};

type RecentAction = {
    id: string;
    kind: string;
    target: string;
    status: string;
    message: string;
    createdAt: string;
};

type ActionResult = {
    ok: boolean;
    message: string;
};

type ContainerSummary = {
    id: string;
    shortId: string;
    name: string;
    image: string;
    command: string;
    state: string;
    status: string;
    createdAt: number;
    ports: string[];
    networks: string[];
    compose: string;
};

type ImageSummary = {
    id: string;
    shortId: string;
    repoTags: string[];
    repoDigests: string[];
    size: number;
    createdAt: number;
    containers: number;
};

type ComposeProject = {
    id: string;
    name: string;
    path: string;
    config: string;
    status: string;
    services: ComposeService[];
    updatedAt: string;
};

type ComposeService = {
    name: string;
    state: string;
    container: string;
    image: string;
};

type VolumeInfo = {
    name: string;
    driver: string;
    mountpoint: string;
    scope: string;
    labels: Record<string, string>;
};

type NetworkInfo = {
    id: string;
    name: string;
    driver: string;
    scope: string;
    labels: Record<string, string>;
};

type LogLineEvent = {
    subscriptionId: string;
    source: string;
    line: string;
    level: string;
    time: string;
};

type PullProgressEvent = {
    subscriptionId: string;
    reference: string;
    status: string;
    id: string;
    progress: string;
    error: string;
    done: boolean;
};

type ToastState = {
    kind: 'success' | 'error';
    message: string;
} | null;

type ConfirmDialog = {
    title: string;
    message: string;
    detail?: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
};

type ConfirmDialogState = ConfirmDialog | null;

type LogPanelState = {
    open: boolean;
    title: string;
    subscriptionId: string;
    lines: LogLineEvent[];
    paused: boolean;
};

const navigation = [
    {key: 'overview', label: '概览', icon: Activity},
    {key: 'containers', label: '容器', icon: Container},
    {key: 'images', label: '镜像', icon: Box},
    {key: 'compose', label: 'Compose', icon: Layers},
    {key: 'volumes', label: '数据卷', icon: HardDrive},
    {key: 'networks', label: '网络', icon: Network},
    {key: 'settings', label: '设置', icon: Database},
] as const;

function App() {
    const [activeView, setActiveView] = useState<ViewKey>('overview');
    const [status, setStatus] = useState<AppStatus | null>(null);
    const [dockerContexts, setDockerContexts] = useState<DockerContext[]>([]);
    const [containers, setContainers] = useState<ContainerSummary[]>([]);
    const [images, setImages] = useState<ImageSummary[]>([]);
    const [composeProjects, setComposeProjects] = useState<ComposeProject[]>([]);
    const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
    const [networks, setNetworks] = useState<NetworkInfo[]>([]);
    const [containerSearch, setContainerSearch] = useState('');
    const [imageSearch, setImageSearch] = useState('');
    const [imageReference, setImageReference] = useState('');
    const [composePath, setComposePath] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState('');
    const [toast, setToast] = useState<ToastState>(null);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
    const [contextPanelOpen, setContextPanelOpen] = useState(false);
    const [contextPanelMounted, setContextPanelMounted] = useState(false);
    const [contextPanelClosing, setContextPanelClosing] = useState(false);
    const [contextForm, setContextForm] = useState<DockerContextForm | null>(null);
    const [pullEvents, setPullEvents] = useState<PullProgressEvent[]>([]);
    const [logPanel, setLogPanel] = useState<LogPanelState>({
        open: false,
        title: '',
        subscriptionId: '',
        lines: [],
        paused: false,
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const contextDockRef = useRef<HTMLDivElement | null>(null);
    const settingsContextRef = useRef<HTMLDivElement | null>(null);
    const contextPanelCloseTimerRef = useRef<number | null>(null);

    const showToast = useCallback((kind: 'success' | 'error', message: string) => {
        setToast({kind, message});
        window.setTimeout(() => setToast(null), 3200);
    }, []);

    const requestConfirm = useCallback((dialog: ConfirmDialog) => {
        setConfirmDialog(dialog);
    }, []);

    const openContextPanel = useCallback(() => {
        if (contextPanelCloseTimerRef.current) {
            window.clearTimeout(contextPanelCloseTimerRef.current);
            contextPanelCloseTimerRef.current = null;
        }
        setContextPanelMounted(true);
        setContextPanelClosing(false);
        setContextPanelOpen(true);
    }, []);

    const closeContextPanel = useCallback(() => {
        if (!contextPanelMounted && !contextPanelOpen) {
            return;
        }
        if (contextPanelCloseTimerRef.current) {
            window.clearTimeout(contextPanelCloseTimerRef.current);
        }
        setContextPanelOpen(false);
        setContextPanelClosing(true);
        contextPanelCloseTimerRef.current = window.setTimeout(() => {
            setContextPanelMounted(false);
            setContextPanelClosing(false);
            contextPanelCloseTimerRef.current = null;
        }, 180);
    }, [contextPanelMounted, contextPanelOpen]);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        try {
            const [appStatus, contextList] = await Promise.all([
                GetAppStatus(),
                ListDockerContexts(),
            ]);
            setStatus(appStatus as AppStatus);
            setDockerContexts((contextList ?? []) as DockerContext[]);

            const [containerList, imageList, projectList, volumeList, networkList] = await Promise.allSettled([
                ListContainers({search: containerSearch, all: true}),
                ListImages({search: imageSearch}),
                ListComposeProjects(),
                ListVolumes(),
                ListNetworks(),
            ]);
            setContainers(settledValue(containerList, []) as ContainerSummary[]);
            setImages(settledValue(imageList, []) as ImageSummary[]);
            setComposeProjects(settledValue(projectList, []) as ComposeProject[]);
            setVolumes(settledValue(volumeList, []) as VolumeInfo[]);
            setNetworks(settledValue(networkList, []) as NetworkInfo[]);
            const failedResult = [containerList, imageList, projectList, volumeList, networkList].find((result) => result.status === 'rejected');
            if (failedResult?.status === 'rejected') {
                showToast('error', readableError(failedResult.reason));
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setLoading(false);
        }
    }, [containerSearch, imageSearch, showToast]);

    useEffect(() => {
        void refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        EventsOn('coriva:log-line', (event: LogLineEvent) => {
            setLogPanel((current) => {
                if (!current.open || current.subscriptionId !== event.subscriptionId || current.paused) {
                    return current;
                }
                return {
                    ...current,
                    lines: [...current.lines.slice(-599), event],
                };
            });
        });

        EventsOn('coriva:pull-progress', (event: PullProgressEvent) => {
            setPullEvents((current) => [event, ...current].slice(0, 8));
            if (event.done && event.error) {
                showToast('error', event.error);
            }
            if (event.done && !event.error) {
                showToast('success', event.status || '镜像拉取完成');
                void refreshAll();
            }
        });

        return () => {
            EventsOff('coriva:log-line');
            EventsOff('coriva:pull-progress');
        };
    }, [refreshAll, showToast]);

    useEffect(() => {
        if (!contextPanelMounted || contextPanelClosing) {
            return;
        }
        const closeContextPanelByPointer = (event: MouseEvent) => {
            if (contextDockRef.current?.contains(event.target as Node)) {
                return;
            }
            closeContextPanel();
        };
        const closeContextPanelByEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeContextPanel();
            }
        };
        document.addEventListener('mousedown', closeContextPanelByPointer);
        document.addEventListener('keydown', closeContextPanelByEsc);
        return () => {
            document.removeEventListener('mousedown', closeContextPanelByPointer);
            document.removeEventListener('keydown', closeContextPanelByEsc);
        };
    }, [closeContextPanel, contextPanelClosing, contextPanelMounted]);

    useEffect(() => {
        return () => {
            if (contextPanelCloseTimerRef.current) {
                window.clearTimeout(contextPanelCloseTimerRef.current);
            }
        };
    }, []);

    const runAction = useCallback(async (key: string, action: () => Promise<ActionResult>, refresh = true) => {
        setBusyKey(key);
        try {
            const result = await action();
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok && refresh) {
                await refreshAll();
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    }, [refreshAll, showToast]);

    const openContainerLogs = useCallback(async (container: ContainerSummary) => {
        await closeLogPanel(logPanel.subscriptionId);
        try {
            const subscription = await StreamContainerLogs({id: container.id, tail: 200, follow: true, service: ''});
            setLogPanel({
                open: true,
                title: `${container.name} 日志`,
                subscriptionId: subscription.subscriptionId,
                lines: [],
                paused: false,
            });
        } catch (error) {
            showToast('error', readableError(error));
        }
    }, [logPanel.subscriptionId, showToast]);

    const openComposeLogs = useCallback(async (project: ComposeProject) => {
        await closeLogPanel(logPanel.subscriptionId);
        try {
            const subscription = await StreamComposeLogs({id: project.id, tail: 200, follow: true, service: ''});
            setLogPanel({
                open: true,
                title: `${project.name} 日志`,
                subscriptionId: subscription.subscriptionId,
                lines: [],
                paused: false,
            });
        } catch (error) {
            showToast('error', readableError(error));
        }
    }, [logPanel.subscriptionId, showToast]);

    const closeLogs = useCallback(async () => {
        await closeLogPanel(logPanel.subscriptionId);
        setLogPanel({open: false, title: '', subscriptionId: '', lines: [], paused: false});
    }, [logPanel.subscriptionId]);

    const addComposeProject = async () => {
        if (!composePath.trim()) {
            showToast('error', '请输入 Compose 项目目录');
            return;
        }
        setBusyKey('add-compose');
        try {
            await AddComposeProject({path: composePath.trim()});
            setComposePath('');
            showToast('success', 'Compose 项目已添加');
            await refreshAll();
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const pullImage = async () => {
        if (!imageReference.trim()) {
            showToast('error', '请输入镜像名称');
            return;
        }
        setBusyKey('pull-image');
        try {
            await PullImage({reference: imageReference.trim()});
            showToast('success', '已开始拉取镜像');
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const currentContext = useMemo(() => {
        return status?.activeContext || dockerContexts.find((item) => item.current) || dockerContexts[0] || null;
    }, [dockerContexts, status]);

    const switchDockerContext = async (context: DockerContext, passphrase = '') => {
        setBusyKey(`context-switch-${context.id}`);
        try {
            const result = await SwitchDockerContext({id: context.id, passphrase});
            if (!result.ok && result.message.includes('SSH 私钥需要密码') && !passphrase) {
                const value = window.prompt('请输入 SSH 私钥密码');
                if (value) {
                    await switchDockerContext(context, value);
                    return;
                }
            }
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                closeContextPanel();
                await refreshAll();
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const openContextSettings = useCallback(() => {
        setActiveView('settings');
        closeContextPanel();
        window.setTimeout(() => {
            settingsContextRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 80);
    }, [closeContextPanel]);

    const saveDockerContext = async () => {
        if (!contextForm) {
            return;
        }
        if (!contextForm.name.trim() || !contextForm.host.trim()) {
            showToast('error', '请输入名称和 Host');
            return;
        }
        setBusyKey('context-save');
        try {
            const saved = await SaveDockerContext(contextForm);
            const savedContext = saved as DockerContext;
            setContextForm(null);
            if (savedContext.connectionStatus === 'failed') {
                showToast('error', `Docker 连接已保存，${bridgeLabel(savedContext.bridgeType)} 连接失败：${savedContext.connectionError || '未知错误'}`);
            } else {
                showToast('success', 'Docker 连接已保存并连接成功');
            }
            await refreshAll();
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const deleteDockerContext = async (context: DockerContext) => {
        requestConfirm({
            title: '删除 Docker 连接',
            message: `确认删除 ${context.name}？`,
            detail: '只会删除 Coriva 保存的连接配置，不会修改 Docker CLI context。',
            confirmLabel: '删除',
            danger: true,
            onConfirm: () => {
                void (async () => {
                    setBusyKey(`context-delete-${context.id}`);
                    try {
                        const result = await DeleteDockerContext(context.id);
                        showToast(result.ok ? 'success' : 'error', result.message);
                        if (result.ok) {
                            await refreshAll();
                        }
                    } catch (error) {
                        showToast('error', readableError(error));
                    } finally {
                        setBusyKey('');
                    }
                })();
            }
        });
    };

    const testDockerContext = async (context: DockerContext) => {
        setBusyKey(`context-test-${context.id}`);
        try {
            const probe = await TestDockerContext(context.id) as DockerContextProbe;
            showToast(probe.ok ? 'success' : 'error', contextProbeMessage(probe));
            await refreshAll();
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const runningContainers = useMemo(() => containers.filter((item) => item.state === 'running').length, [containers]);
    const stoppedContainers = Math.max(containers.length - runningContainers, 0);
    const currentContextFailed = Boolean(
        currentContext?.connectionStatus === 'failed' ||
        currentContext?.connectionError ||
        currentContext?.error ||
        (status && !status.docker.connected)
    );
    const currentContextReady = Boolean(status?.docker.connected) && !currentContextFailed;
    const currentContextTooltip = currentContextFailed
        ? currentContext?.connectionError || currentContext?.error || status?.docker.error || '当前 Docker 连接异常'
        : currentContext?.bridgeType ? bridgeLabel(currentContext.bridgeType) : '当前 Docker 连接正常';

    return (
        <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{cursor: 'pointer'}} title={sidebarCollapsed ? '展开' : '收起'}>
                        <Boxes size={18}/>
                    </div>
                    <div>
                        <strong>Coriva</strong>
                        <span>Local Docker</span>
                    </div>
                </div>
                <nav className="nav-list">
                    {navigation.map(({key, label, icon: Icon}) => (
                        <button
                            key={key}
                            className={`nav-item ${activeView === key ? 'active' : ''}`}
                            onClick={() => setActiveView(key)}
                            type="button"
                            title={label}
                        >
                            <Icon size={17}/>
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>
                <div className="context-dock" ref={contextDockRef}>
                    {contextPanelMounted && (
                        <DockerContextPanel
                            contexts={dockerContexts}
                            busyKey={busyKey}
                            onSwitch={switchDockerContext}
                            onManage={openContextSettings}
                            onClose={closeContextPanel}
                            closing={contextPanelClosing}
                        />
                    )}
                    <button
                        className={`daemon-card ${currentContextReady ? 'ready' : 'warning'}`}
                        onClick={() => contextPanelMounted && !contextPanelClosing ? closeContextPanel() : openContextPanel()}
                        type="button"
                        title={currentContextTooltip}
                    >
                        {currentContextReady ? <CircleCheck size={17}/> : <CircleAlert size={17}/>}
                        <div>
                            <strong>{currentContext?.name || (currentContextReady ? '环境就绪' : '需要处理')}</strong>
                            <span>{currentContext?.host || status?.docker.host || '检测中'}</span>
                        </div>
                        <ChevronDown size={15}/>
                    </button>
                </div>
            </aside>

            <main className="workspace">
                <header className="topbar">
                    <div>
                        <p className="section-kicker">macOS desktop client</p>
                        <h1>{viewTitle(activeView)}</h1>
                    </div>
                    <button className="icon-button" onClick={refreshAll} disabled={loading} type="button" title="刷新">
                        <RefreshCw size={17} className={loading ? 'spin' : ''}/>
                    </button>
                </header>

                {activeView === 'overview' && (
                    <OverviewView
                        status={status}
                        loading={loading}
                        containers={containers.length}
                        runningContainers={runningContainers}
                        stoppedContainers={stoppedContainers}
                        images={images.length}
                    />
                )}

                {activeView === 'containers' && (
                    <ContainersView
                        containers={containers}
                        search={containerSearch}
                        setSearch={setContainerSearch}
                        busyKey={busyKey}
                        onLogs={openContainerLogs}
                        onStart={(item) => runAction(`container-start-${item.id}`, () => StartContainer(item.id))}
                        onStop={(item) => runAction(`container-stop-${item.id}`, () => StopContainer(item.id))}
                        onRestart={(item) => runAction(`container-restart-${item.id}`, () => RestartContainer(item.id))}
                        onRemove={(item) => {
                            const force = item.state === 'running';
                            requestConfirm({
                                title: '删除容器',
                                message: `确认删除容器 ${item.name}？`,
                                detail: force ? '该容器正在运行，确认后会强制停止并删除。' : '删除后容器记录将不可恢复，数据卷不会自动删除。',
                                confirmLabel: force ? '强制删除' : '删除',
                                danger: true,
                                onConfirm: () => void runAction(`container-remove-${item.id}`, () => RemoveContainer(item.id, force)),
                            });
                        }}
                    />
                )}

                {activeView === 'images' && (
                    <ImagesView
                        images={images}
                        search={imageSearch}
                        setSearch={setImageSearch}
                        imageReference={imageReference}
                        setImageReference={setImageReference}
                        pullEvents={pullEvents}
                        busyKey={busyKey}
                        onPull={pullImage}
                        onRemove={(item) => {
                            const label = imageLabel(item);
                            requestConfirm({
                                title: '删除镜像',
                                message: `确认删除镜像 ${label}？`,
                                detail: '如果镜像正在被容器使用，Docker 会拒绝删除。',
                                confirmLabel: '删除',
                                danger: true,
                                onConfirm: () => void runAction(`image-remove-${item.id}`, () => RemoveImage(item.id, false)),
                            });
                        }}
                    />
                )}

                {activeView === 'compose' && (
                    <ComposeView
                        projects={composeProjects}
                        composePath={composePath}
                        setComposePath={setComposePath}
                        busyKey={busyKey}
                        onAdd={addComposeProject}
                        onLogs={openComposeLogs}
                        onUp={(project) => runAction(`compose-up-${project.id}`, () => ComposeUp(project.id))}
                        onDown={(project) => runAction(`compose-down-${project.id}`, () => ComposeDown(project.id))}
                        onRestart={(project) => runAction(`compose-restart-${project.id}`, () => ComposeRestart(project.id))}
                    />
                )}

                {activeView === 'volumes' && <VolumesView volumes={volumes}/>}
                {activeView === 'networks' && <NetworksView networks={networks}/>}
                {activeView === 'settings' && (
                    <SettingsView
                        status={status}
                        contexts={dockerContexts}
                        form={contextForm}
                        setForm={setContextForm}
                        busyKey={busyKey}
                        onSave={saveDockerContext}
                        onDelete={deleteDockerContext}
                        onTest={testDockerContext}
                        contextSectionRef={settingsContextRef}
                    />
                )}
            </main>

            {logPanel.open && (
                <LogPanel
                    panel={logPanel}
                    setPanel={setLogPanel}
                    onClose={closeLogs}
                />
            )}

            {confirmDialog && (
                <ConfirmDialog
                    dialog={confirmDialog}
                    onClose={() => setConfirmDialog(null)}
                />
            )}

            {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
        </div>
    );
}

function DockerContextPanel(props: {
    contexts: DockerContext[];
    busyKey: string;
    onSwitch: (context: DockerContext) => void;
    onManage: () => void;
    onClose: () => void;
    closing: boolean;
}) {
    return (
        <div className={`context-panel ${props.closing ? 'closing' : ''}`}>
            <div className="context-panel-head">
                <strong>Docker contexts</strong>
                <div className="context-head-actions">
                    <button className="context-manage-button" onClick={props.onManage} type="button">
                        <Database size={15}/>
                        管理
                    </button>
                    <button className="action-button" onClick={props.onClose} type="button" title="关闭">
                        <X size={15}/>
                    </button>
                </div>
            </div>

            <div className="context-list">
                {props.contexts.length ? props.contexts.map((context) => (
                    <div className={`context-row ${context.current ? 'active' : ''}`} key={context.id}>
                        <button onClick={() => props.onSwitch(context)} disabled={props.busyKey === `context-switch-${context.id}`} type="button">
                            <StatusDot state={contextStatusState(context)}/>
                            <span>
                                <strong>{context.name}</strong>
                                <small>{context.host}</small>
                            </span>
                        </button>
                        <div className="context-row-actions">
                            <ContextBridgeIcon context={context}/>
                            {props.busyKey === `context-switch-${context.id}` && <LoaderCircle size={15} className="spin muted-icon"/>}
                        </div>
                    </div>
                )) : <EmptyState title="没有连接" body="新增 Docker 连接后会显示在这里。"/>}
            </div>
        </div>
    );
}

function OverviewView(props: {
    status: AppStatus | null;
    loading: boolean;
    containers: number;
    runningContainers: number;
    stoppedContainers: number;
    images: number;
}) {
    const {status, loading, containers, runningContainers, stoppedContainers, images} = props;
    const serverInfoRows = dockerServerInfoRows(status);
    return (
        <section className="view-stack">
            <div className="metric-grid">
                <MetricCard label="容器" value={containers} detail={`${runningContainers} 运行 · ${stoppedContainers} 停止`}/>
                <MetricCard label="镜像" value={images} detail="本地缓存"/>
                <MetricCard label="Docker" value={status?.docker.connected ? '在线' : '离线'} detail={status?.docker.serverVersion || 'daemon 不可用'}/>
                <MetricCard label="Compose" value={status?.compose.available ? '可用' : '缺失'} detail={status?.compose.version || 'V2 插件未就绪'}/>
            </div>

            <div className="status-grid">
                <section className="panel">
                    <div className="panel-title">
                        <Container size={18}/>
                        <h2>服务器信息</h2>
                    </div>
                    {loading && <SkeletonRows count={4}/>}
                    {!loading && (
                        <div className="info-list">
                            {serverInfoRows.map((row) => (
                                <InfoRow key={row.label} label={row.label} value={row.value}/>
                            ))}
                        </div>
                    )}
                </section>

                <section className="panel">
                    <div className="panel-title">
                        <Terminal size={18}/>
                        <h2>最近操作</h2>
                    </div>
                    {status?.recentActions?.length ? (
                        <div className="activity-list">
                            {status.recentActions.map((action) => (
                                <div className="activity-row" key={action.id}>
                                    <StatusDot state={action.status === 'success' ? 'running' : 'error'}/>
                                    <div>
                                        <strong>{action.message}</strong>
                                        <span>{action.kind} · {action.target}</span>
                                    </div>
                                    <time>{formatTime(action.createdAt)}</time>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="暂无操作记录" body="启动、停止、拉取等动作会显示在这里。"/>
                    )}
                </section>
            </div>

            <section className="panel docker-parameters-panel">
                <div className="panel-title">
                    <Database size={18}/>
                    <h2>Docker 参数</h2>
                </div>
                {loading && <SkeletonRows count={6}/>}
                {!loading && status?.docker.parameters?.length ? (
                    <div className="parameter-list">
                        {status.docker.parameters.map((item) => (
                            <div className="parameter-row" key={item.key}>
                                <span title={item.key}>{item.key}</span>
                                <strong title={item.value}>{item.value}</strong>
                            </div>
                        ))}
                    </div>
                ) : !loading && (
                    <EmptyState title="暂无参数" body={status?.docker.error || 'Docker SDK 暂未返回参数。'}/>
                )}
            </section>
        </section>
    );
}

function ContainersView(props: {
    containers: ContainerSummary[];
    search: string;
    setSearch: (value: string) => void;
    busyKey: string;
    onLogs: (container: ContainerSummary) => void;
    onStart: (container: ContainerSummary) => void;
    onStop: (container: ContainerSummary) => void;
    onRestart: (container: ContainerSummary) => void;
    onRemove: (container: ContainerSummary) => void;
}) {
    const filtered = filterContainers(props.containers, props.search);
    // 运行中的容器置顶
    const sorted = [...filtered].sort((a, b) => {
        if (a.state === 'running' && b.state !== 'running') return -1;
        if (a.state !== 'running' && b.state === 'running') return 1;
        return 0;
    });
    return (
        <section className="view-stack">
            <Toolbar search={props.search} setSearch={props.setSearch} placeholder="搜索容器、镜像、Compose"/>
            <div className="resource-table scrollable">
                <div className="table-head containers">
                    <span>容器</span>
                    <span>状态</span>
                    <span>端口</span>
                    <span>网络</span>
                    <span>操作</span>
                </div>
                <div className="table-body">
                    {sorted.length ? sorted.map((item) => (
                        <div className="table-row containers" key={item.id}>
                            <div className="resource-name">
                                <StatusDot state={item.state}/>
                                <div>
                                    <strong title={item.name}>{item.name}</strong>
                                    <span title={item.image}>{item.image}</span>
                                </div>
                            </div>
                            <div>
                                <Badge tone={item.state === 'running' ? 'green' : 'neutral'}>{item.state}</Badge>
                                <small title={item.status}>{item.status}</small>
                            </div>
                            <span className="muted" title={item.ports?.join(', ') || '未暴露'}>{item.ports?.join(', ') || '未暴露'}</span>
                            <span className="muted" title={item.networks?.join(', ') || '默认'}>{item.networks?.join(', ') || '默认'}</span>
                            <div className="row-actions">
                                <ActionButton title="日志" onClick={() => props.onLogs(item)} icon={<Terminal size={15}/>}/>
                                {item.state === 'running' ? (
                                    <ActionButton title="停止" busy={props.busyKey === `container-stop-${item.id}`} onClick={() => props.onStop(item)} icon={<Square size={15}/>}/>
                                ) : (
                                    <ActionButton title="启动" busy={props.busyKey === `container-start-${item.id}`} onClick={() => props.onStart(item)} icon={<Play size={15}/>}/>
                                )}
                                <ActionButton title="重启" busy={props.busyKey === `container-restart-${item.id}`} onClick={() => props.onRestart(item)} icon={<RotateCcw size={15}/>}/>
                                <ActionButton danger title="删除" busy={props.busyKey === `container-remove-${item.id}`} onClick={() => props.onRemove(item)} icon={<Trash2 size={15}/>}/>
                            </div>
                        </div>
                    )) : <EmptyState title="没有容器" body="启动 Docker 或 Compose 项目后会出现在这里。"/>}
                </div>
            </div>
        </section>
    );
}

function ImagesView(props: {
    images: ImageSummary[];
    search: string;
    setSearch: (value: string) => void;
    imageReference: string;
    setImageReference: (value: string) => void;
    pullEvents: PullProgressEvent[];
    busyKey: string;
    onPull: () => void;
    onRemove: (image: ImageSummary) => void;
}) {
    const filtered = filterImages(props.images, props.search);
    return (
        <section className="view-stack">
            <div className="split-toolbar">
                <Toolbar search={props.search} setSearch={props.setSearch} placeholder="搜索镜像、标签、摘要"/>
                <div className="inline-form">
                    <input value={props.imageReference} onChange={(event) => props.setImageReference(event.target.value)} placeholder="nginx:latest"/>
                    <button className="primary-button" onClick={props.onPull} disabled={props.busyKey === 'pull-image'} type="button">
                        {props.busyKey === 'pull-image' ? <LoaderCircle size={15} className="spin"/> : <Play size={15}/>}
                        拉取
                    </button>
                </div>
            </div>
            {!!props.pullEvents.length && (
                <div className="progress-strip">
                    {props.pullEvents.map((event, index) => (
                        <div key={`${event.subscriptionId}-${index}`} className={event.error ? 'progress-item error' : 'progress-item'}>
                            <span>{event.reference}</span>
                            <strong>{event.error || event.status || '拉取中'}</strong>
                            <em>{event.progress}</em>
                        </div>
                    ))}
                </div>
            )}
            <div className="resource-table scrollable">
                <div className="table-head images">
                    <span>镜像</span>
                    <span>大小</span>
                    <span>容器</span>
                    <span>创建</span>
                    <span>操作</span>
                </div>
                <div className="table-body">
                    {filtered.length ? filtered.map((item) => (
                        <div className="table-row images" key={item.id}>
                            <div className="resource-name">
                                <Box size={17}/>
                                <div>
                                    <strong title={imageLabel(item)}>{imageLabel(item)}</strong>
                                    <span title={item.shortId}>{item.shortId}</span>
                                </div>
                            </div>
                            <span>{formatBytes(item.size)}</span>
                            <span>{item.containers < 0 ? '-' : item.containers}</span>
                            <span className="muted">{formatEpoch(item.createdAt)}</span>
                            <div className="row-actions">
                                <ActionButton danger title="删除" busy={props.busyKey === `image-remove-${item.id}`} onClick={() => props.onRemove(item)} icon={<Trash2 size={15}/>}/>
                            </div>
                        </div>
                    )) : <EmptyState title="没有镜像" body="拉取镜像后会显示在这里。"/>}
                </div>
            </div>
        </section>
    );
}

function ComposeView(props: {
    projects: ComposeProject[];
    composePath: string;
    setComposePath: (value: string) => void;
    busyKey: string;
    onAdd: () => void;
    onLogs: (project: ComposeProject) => void;
    onUp: (project: ComposeProject) => void;
    onDown: (project: ComposeProject) => void;
    onRestart: (project: ComposeProject) => void;
}) {
    if (!props.projects) {
        return (
            <section className="view-stack">
                <div className="compose-add">
                    <FolderPlus size={18}/>
                    <input value={props.composePath} onChange={(event) => props.setComposePath(event.target.value)} placeholder="/Users/me/project"/>
                    <button className="primary-button" onClick={props.onAdd} disabled={props.busyKey === 'add-compose'} type="button">
                        {props.busyKey === 'add-compose' ? <LoaderCircle size={15} className="spin"/> : <FolderPlus size={15}/>}
                        添加项目
                    </button>
                </div>
                <EmptyState title="没有 Compose 项目" body="添加包含 compose.yaml 的本地目录。"/>
            </section>
        );
    }
    return (
        <section className="view-stack">
            <div className="compose-add">
                <FolderPlus size={18}/>
                <input value={props.composePath} onChange={(event) => props.setComposePath(event.target.value)} placeholder="/Users/me/project"/>
                <button className="primary-button" onClick={props.onAdd} disabled={props.busyKey === 'add-compose'} type="button">
                    {props.busyKey === 'add-compose' ? <LoaderCircle size={15} className="spin"/> : <FolderPlus size={15}/>}
                    添加项目
                </button>
            </div>
            <div className="compose-grid">
                {props.projects.length ? props.projects.map((project) => (
                    <article className="compose-card" key={project.id}>
                        <div className="compose-card-head">
                            <div>
                                <h2>{project.name}</h2>
                                <p>{project.path}</p>
                            </div>
                            <Badge tone={project.status === 'running' ? 'green' : project.status === 'partial' ? 'amber' : 'neutral'}>
                                {project.status}
                            </Badge>
                        </div>
                        <div className="service-list">
                            {project.services?.length ? project.services.map((service) => (
                                <div className="service-row" key={`${project.id}-${service.name}`}>
                                    <StatusDot state={service.state}/>
                                    <strong>{service.name}</strong>
                                    <span>{service.image || service.container}</span>
                                </div>
                            )) : <span className="muted">尚未创建服务</span>}
                        </div>
                        <div className="compose-actions">
                            <button onClick={() => props.onLogs(project)} type="button"><Terminal size={15}/>日志</button>
                            <button onClick={() => props.onUp(project)} disabled={props.busyKey === `compose-up-${project.id}`} type="button"><Play size={15}/>Up</button>
                            <button onClick={() => props.onDown(project)} disabled={props.busyKey === `compose-down-${project.id}`} type="button"><Square size={15}/>Down</button>
                            <button onClick={() => props.onRestart(project)} disabled={props.busyKey === `compose-restart-${project.id}`} type="button"><RotateCcw size={15}/>重启</button>
                        </div>
                    </article>
                )) : <EmptyState title="没有 Compose 项目" body="添加包含 compose.yaml 的本地目录。"/>}
            </div>
        </section>
    );
}

function VolumesView({volumes}: { volumes: VolumeInfo[] }) {
    return (
        <section className="resource-table scrollable">
            <div className="table-head simple">
                <span>名称</span>
                <span>驱动</span>
                <span>作用域</span>
                <span>挂载点</span>
            </div>
            <div className="table-body">
                {volumes.length ? volumes.map((volume) => (
                    <div className="table-row simple" key={volume.name}>
                        <strong className="middle-ellipsis" title={volume.name}>{truncateMiddle(volume.name, 14, 10)}</strong>
                        <span>{volume.driver}</span>
                        <span>{volume.scope}</span>
                        <span className="muted middle-ellipsis" title={volume.mountpoint}>{truncateMiddle(volume.mountpoint, 20, 16)}</span>
                    </div>
                )) : <EmptyState title="没有数据卷" body="Docker volume 会显示在这里。"/>}
            </div>
        </section>
    );
}

function NetworksView({networks}: { networks: NetworkInfo[] }) {
    return (
        <section className="resource-table scrollable">
            <div className="table-head simple">
                <span>名称</span>
                <span>驱动</span>
                <span>作用域</span>
                <span>ID</span>
            </div>
            <div className="table-body">
                {networks.length ? networks.map((network) => (
                    <div className="table-row simple" key={network.id}>
                        <strong>{network.name}</strong>
                        <span>{network.driver}</span>
                        <span>{network.scope}</span>
                        <span className="muted">{network.id.slice(0, 12)}</span>
                    </div>
                )) : <EmptyState title="没有网络" body="Docker network 会显示在这里。"/>}
            </div>
        </section>
    );
}

function SettingsView(props: {
    status: AppStatus | null;
    contexts: DockerContext[];
    form: DockerContextForm | null;
    setForm: (form: DockerContextForm | null) => void;
    busyKey: string;
    onSave: () => void;
    onDelete: (context: DockerContext) => void;
    onTest: (context: DockerContext) => void;
    contextSectionRef: RefObject<HTMLDivElement | null>;
}) {
    const {status, form, setForm} = props;
    const activeContext = status?.activeContext || props.contexts.find((context) => context.current) || null;
    const updateForm = (patch: Partial<DockerContextForm>) => {
        if (form) {
            setForm({...form, ...patch});
        }
    };

    return (
        <section className="settings-stack">
            <div className="settings-grid">
                <div className="panel context-maintenance settings-block-wide" ref={props.contextSectionRef}>
                    <div className="panel-title context-maintenance-title">
                        <Database size={18}/>
                        <h2>Context 维护</h2>
                        <button className="primary-button" onClick={() => setForm(emptyDockerContextForm())} type="button">
                            <FolderPlus size={15}/>
                            新增
                        </button>
                    </div>

                    <div className="context-maintenance-list">
                        {props.contexts.length ? props.contexts.map((context) => (
                            <div className={`context-maintenance-row ${context.current ? 'active' : ''}`} key={context.id}>
                                <div className="context-maintenance-main">
                                    <StatusDot state={contextStatusState(context)}/>
                                    <div>
                                        <strong title={context.name}>{context.name}</strong>
                                        <span title={context.host}>{context.host}</span>
                                        {context.connectionError && <small title={context.connectionError}>{context.connectionError}</small>}
                                    </div>
                                </div>
                                <div className="context-maintenance-meta">
                                    <ContextBridgeIcon context={context}/>
                                    <span className="muted" title={context.lastCheckedAt || ''}>{formatDateTime(context.lastCheckedAt)}</span>
                                </div>
                                <div className="row-actions">
                                    <ActionButton title="测试" busy={props.busyKey === `context-test-${context.id}`} onClick={() => props.onTest(context)} icon={<RefreshCw size={15}/>}/>
                                    <ActionButton title="编辑" onClick={() => setForm(formFromDockerContext(context))} icon={<Edit3 size={15}/>}/>
                                    <ActionButton danger title="删除" busy={props.busyKey === `context-delete-${context.id}`} onClick={() => props.onDelete(context)} icon={<Trash2 size={15}/>}/>
                                </div>
                            </div>
                        )) : <EmptyState title="没有连接" body="新增 Docker 连接后会显示在这里。"/>}
                    </div>

                    {form && (
                        <div className="settings-context-form">
                            <label>
                                <span>名称</span>
                                <input value={form.name} onChange={(event) => updateForm({name: event.target.value})}/>
                            </label>
                            <label>
                                <span>Docker Host</span>
                                <input value={form.host} onChange={(event) => updateForm({host: event.target.value})} placeholder="unix:///var/run/docker.sock"/>
                            </label>
                            <label className="form-wide">
                                <span>说明</span>
                                <input value={form.description} onChange={(event) => updateForm({description: event.target.value})}/>
                            </label>
                            <label>
                                <span>CA 路径</span>
                                <input value={form.caPath} onChange={(event) => updateForm({caPath: event.target.value})}/>
                            </label>
                            <label>
                                <span>证书路径</span>
                                <input value={form.certPath} onChange={(event) => updateForm({certPath: event.target.value})}/>
                            </label>
                            <label>
                                <span>TLS 私钥</span>
                                <input value={form.keyPath} onChange={(event) => updateForm({keyPath: event.target.value})}/>
                            </label>
                            <label>
                                <span>SSH 私钥</span>
                                <input value={form.sshKeyPath} onChange={(event) => updateForm({sshKeyPath: event.target.value})}/>
                            </label>
                            <label className="context-checkbox form-wide">
                                <input type="checkbox" checked={form.skipTlsVerify} onChange={(event) => updateForm({skipTlsVerify: event.target.checked})}/>
                                <span>跳过 TLS 校验</span>
                            </label>
                            <div className="context-form-actions form-wide">
                                <button onClick={props.onSave} disabled={props.busyKey === 'context-save'} type="button">
                                    {props.busyKey === 'context-save' ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>}
                                    保存
                                </button>
                                <button onClick={() => setForm(null)} type="button">取消</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="panel settings-block">
                    <div className="panel-title">
                        <Activity size={18}/>
                        <h2>连接状态</h2>
                    </div>
                    <div className="settings-summary-list">
                        <InfoRow label="当前" value={activeContext?.name || '-'}/>
                        <InfoRow label="Bridge" value={activeContext?.bridgeType ? bridgeLabel(activeContext.bridgeType) : '-'}/>
                        <InfoRow label="Docker" value={status?.docker.connected ? status.docker.serverVersion || '在线' : status?.docker.error || '离线'}/>
                        <InfoRow label="Compose" value={status?.compose.available ? status.compose.version || '可用' : status?.compose.error || '不可用'}/>
                    </div>
                </div>

                <div className="panel settings-block">
                    <div className="panel-title">
                        <Network size={18}/>
                        <h2>连接规则</h2>
                    </div>
                    <div className="settings-rule-list">
                        <div>
                            <strong>Host 去重</strong>
                            <span>相同 URI 只保留一条连接。</span>
                        </div>
                        <div>
                            <strong>本机识别</strong>
                            <span>本机地址使用 local bridge。</span>
                        </div>
                        <div>
                            <strong>失败保存</strong>
                            <span>连接失败仍可保存并提示错误。</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function LogPanel({panel, setPanel, onClose}: {
    panel: LogPanelState;
    setPanel: React.Dispatch<React.SetStateAction<LogPanelState>>;
    onClose: () => void;
}) {
    const visibleLines = panel.lines;
    return (
        <aside className="log-panel">
            <div className="log-head">
                <div>
                    <strong>{panel.title}</strong>
                    <span>{visibleLines.length} 行</span>
                </div>
                <div className="log-actions">
                    <button onClick={() => setPanel((current) => ({...current, paused: !current.paused}))} type="button">
                        {panel.paused ? '继续' : '暂停'}
                    </button>
                    <button onClick={() => setPanel((current) => ({...current, lines: []}))} type="button">清空</button>
                    <button onClick={onClose} type="button">关闭</button>
                </div>
            </div>
            <pre className="log-body">
                {visibleLines.length ? visibleLines.map((line, index) => (
                    <code key={`${line.time}-${index}`} className={line.level === 'error' ? 'error' : ''}>
                        {line.line}
                    </code>
                )) : <code>等待日志输出...</code>}
            </pre>
        </aside>
    );
}

function ConfirmDialog({dialog, onClose}: { dialog: ConfirmDialog; onClose: () => void }) {
    const confirm = () => {
        dialog.onConfirm();
        onClose();
    };

    return (
        <div
            className="confirm-backdrop"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                    onClose();
                }
            }}
        >
            <section className={`confirm-dialog ${dialog.danger ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
                <div className="confirm-icon">
                    <CircleAlert size={18}/>
                </div>
                <div className="confirm-content">
                    <h2 id="confirm-title">{dialog.title}</h2>
                    <p id="confirm-message">{dialog.message}</p>
                    {dialog.detail && <small>{dialog.detail}</small>}
                </div>
                <div className="confirm-actions">
                    <button className="dialog-button" onClick={onClose} type="button">
                        {dialog.cancelLabel || '取消'}
                    </button>
                    <button className={`dialog-button confirm ${dialog.danger ? 'danger' : ''}`} onClick={confirm} type="button">
                        {dialog.confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}

function Toolbar({search, setSearch, placeholder}: { search: string; setSearch: (value: string) => void; placeholder: string }) {
    return (
        <div className="toolbar">
            <Search size={16}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder}/>
        </div>
    );
}

function MetricCard({label, value, detail}: { label: string; value: string | number; detail: string }) {
    return (
        <article className="metric-card">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </article>
    );
}

function InfoRow({label, value}: { label: string; value: string }) {
    return (
        <div className="info-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function StatusDot({state}: { state: string }) {
    const className = state === 'running' || state === 'success' ? 'running' : state === 'error' || state === 'failed' ? 'error' : 'stopped';
    return <span className={`status-dot ${className}`}/>;
}

function Badge({children, tone}: { children: React.ReactNode; tone: 'green' | 'amber' | 'neutral' }) {
    return <span className={`badge ${tone}`}>{children}</span>;
}

function ContextBridgeIcon({context}: { context: DockerContext }) {
    const failed = context.connectionStatus === 'failed' || context.connectionError || context.error;
    const bridge = context.bridgeType === 'local' ? 'local' : 'remote';
    const Icon = failed ? CircleAlert : bridge === 'local' ? Wifi : Cloud;
    const title = failed ? (context.connectionError || context.error || 'Docker context 连接失败') : bridgeLabel(bridge);
    return (
        <span className={`bridge-badge ${failed ? 'failed' : bridge}`} title={title}>
            <Icon size={15}/>
        </span>
    );
}

function ActionButton({title, icon, onClick, busy, danger}: {
    title: string;
    icon: React.ReactNode;
    onClick: () => void;
    busy?: boolean;
    danger?: boolean;
}) {
    return (
        <button className={`action-button ${danger ? 'danger' : ''}`} onClick={onClick} disabled={busy} type="button" title={title}>
            {busy ? <LoaderCircle size={15} className="spin"/> : icon}
        </button>
    );
}

function EmptyState({title, body}: { title: string; body: string }) {
    return (
        <div className="empty-state">
            <CircleAlert size={20}/>
            <strong>{title}</strong>
            <span>{body}</span>
        </div>
    );
}

function SkeletonRows({count}: { count: number }) {
    return (
        <div className="skeleton-list">
            {Array.from({length: count}).map((_, index) => <span key={index}/>)}
        </div>
    );
}

function viewTitle(view: ViewKey) {
    const item = navigation.find((entry) => entry.key === view);
    return item?.label || '概览';
}

function contextStatusState(context: DockerContext) {
    if (context.current) {
        return 'success';
    }
    if (context.connectionStatus === 'failed' || context.error || context.connectionError) {
        return 'error';
    }
    if (context.connectionStatus === 'success') {
        return 'running';
    }
    return 'idle';
}

function contextProbeMessage(probe: DockerContextProbe) {
    const bridge = bridgeLabel(probe.bridgeType);
    if (!probe.ok) {
        return `${bridge} 连接失败：${probe.message || '未知错误'}`;
    }
    const version = probe.serverVersion ? ` Docker ${probe.serverVersion}` : '';
    const api = probe.apiVersion ? ` / API ${probe.apiVersion}` : '';
    const platform = [probe.os, probe.architecture].filter(Boolean).join('/');
    return `${bridge} 连接成功${version}${api}${platform ? ` / ${platform}` : ''}`;
}

function bridgeLabel(value: string) {
    return value === 'local' ? 'local bridge' : 'remote bridge';
}

function dockerServerInfoRows(status: AppStatus | null) {
    const params = status?.docker.parameters || [];
    const value = (...keys: string[]) => dockerParameterValue(params, keys);
    const memory = value('Info.MemTotal');
    return [
        {label: '服务器', value: value('Info.Name') || '-'},
        {label: 'Docker Host', value: status?.docker.host || '-'},
        {label: 'Context', value: status?.activeContext?.name || status?.docker.contextName || '-'},
        {label: '系统', value: value('Info.OperatingSystem') || status?.docker.os || '-'},
        {label: '内核', value: value('Info.KernelVersion') || '-'},
        {label: '架构', value: value('Info.Architecture', 'Version.Arch') || status?.docker.architecture || '-'},
        {label: 'CPU', value: value('Info.NCPU') || '-'},
        {label: '内存', value: formatParameterBytes(memory)},
        {label: '存储驱动', value: value('Info.Driver') || '-'},
        {label: 'Cgroup', value: [value('Info.CgroupDriver'), value('Info.CgroupVersion')].filter((item) => item && item !== '-').join(' / ') || '-'},
        {label: 'Docker', value: value('Version.Version', 'Info.ServerVersion') || status?.docker.serverVersion || status?.docker.error || '-'},
        {label: 'API', value: value('Version.APIVersion') || status?.docker.apiVersion || '-'},
    ];
}

function dockerParameterValue(parameters: DockerParameter[], keys: string[]) {
    for (const key of keys) {
        const item = parameters.find((parameter) => parameter.key === key);
        if (item?.value && item.value !== 'null') {
            return item.value;
        }
    }
    return '';
}

function filterContainers(containers: ContainerSummary[], search: string) {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
        return containers;
    }
    return containers.filter((item) => [item.name, item.image, item.state, item.status, item.compose, item.id].some((field) => field?.toLowerCase().includes(keyword)));
}

function filterImages(images: ImageSummary[], search: string) {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
        return images;
    }
    return images.filter((item) => [item.id, item.shortId, ...item.repoTags, ...item.repoDigests].some((field) => field?.toLowerCase().includes(keyword)));
}

async function closeLogPanel(subscriptionId: string) {
    if (subscriptionId) {
        await StopLogStream(subscriptionId);
    }
}

function imageLabel(image: ImageSummary) {
    return image.repoTags?.find((tag) => tag !== '<none>:<none>') || image.repoDigests?.[0] || image.shortId;
}

function truncateMiddle(value: string, head = 24, tail = 18) {
    const normalized = value?.trim() || '-';
    if (normalized.length <= head + tail + 3) {
        return normalized;
    }
    return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
}

function emptyDockerContextForm(): DockerContextForm {
    return {
        id: '',
        name: '',
        description: '',
        host: '',
        caPath: '',
        certPath: '',
        keyPath: '',
        sshKeyPath: '',
        skipTlsVerify: false,
    };
}

function formFromDockerContext(context: DockerContext): DockerContextForm {
    return {
        id: context.id,
        name: context.name,
        description: context.description,
        host: context.host,
        caPath: context.caPath,
        certPath: context.certPath,
        keyPath: context.keyPath,
        sshKeyPath: context.sshKeyPath,
        skipTlsVerify: context.skipTlsVerify,
    };
}

function formatBytes(value: number) {
    if (!value || value < 0) {
        return '-';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatParameterBytes(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return value || '-';
    }
    return formatBytes(parsed);
}

function formatEpoch(value: number) {
    if (!value) {
        return '-';
    }
    return new Intl.DateTimeFormat('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(value * 1000));
}

function formatTime(value: string) {
    if (!value) {
        return '-';
    }
    return new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit'}).format(new Date(value));
}

function formatDateTime(value: string) {
    if (!value) {
        return '未检测';
    }
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T) {
    return result.status === 'fulfilled' ? result.value : fallback;
}

function readableError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return '操作失败';
}

export default App;
