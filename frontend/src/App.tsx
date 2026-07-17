import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {
    Activity,
    Box,
    Boxes,
    CircleAlert,
    CircleCheck,
    CircleHelp,
    ChevronDown,
    Cloud,
    Container,
    Database,
    Edit3,
    FolderPlus,
    HardDrive,
    Layers,
    LoaderCircle,
    Network,
    Play,
    Plus,
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
import {CustomSelect} from './components/CustomSelect';
import type {SelectOption} from './components/CustomSelect';
import {Modal} from './components/Modal';
import {
    AddComposeProject,
    CancelImagePull,
    ConnectNetwork,
    ComposeDown,
    ComposeRestart,
    ComposeUp,
    CreateNetwork,
    DeleteDockerContext,
    DisconnectNetwork,
    GetAppStatus,
    InspectNetwork,
    InspectImageRunConfig,
    ListDockerContexts,
    ListComposeProjects,
    ListContainers,
    ListImages,
    ListNetworks,
    ListVolumes,
    PruneNetworks,
    PullImage,
    RemoveContainer,
    RemoveImage,
    RemoveNetwork,
    RestartContainer,
    RunImage,
    SaveDockerContext,
    StartContainer,
    StopContainer,
    StopLogStream,
    SwitchDockerContext,
    StreamComposeLogs,
    StreamContainerLogs,
    TestDockerContext,
} from '../wailsjs/go/main/App';
import {core} from '../wailsjs/go/models';
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

type DockerParameterLookup = (...keys: string[]) => string;

type ServerInfoField = {
    label: string;
    resolve: (status: AppStatus | null, value: DockerParameterLookup) => string;
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
    startedAt: number;
    finishedAt: number;
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

type ImageRunEnv = {
    key: string;
    value: string;
};

type ImageRunPort = {
    containerPort: string;
    protocol: string;
    hostIp: string;
    hostPort: string;
    publish: boolean;
};

type ImageRunConfig = {
    id: string;
    reference: string;
    repoTags: string[];
    repoDigests: string[];
    entrypoint: string[];
    command: string[];
    env: ImageRunEnv[];
    workingDir: string;
    user: string;
    exposedPorts: ImageRunPort[];
    volumes: string[];
    os: string;
    architecture: string;
    size: number;
};

type ImageRunForm = {
    image: string;
    name: string;
    entrypoint: string;
    command: string;
    env: ImageRunEnv[];
    workingDir: string;
    user: string;
    ports: ImageRunPort[];
    network: string;
    restartPolicy: string;
    restartMaxRetries: string;
    autoRemove: boolean;
};

type ImageRunRequest = {
    image: string;
    name: string;
    entrypoint: string[];
    command: string[];
    env: ImageRunEnv[];
    workingDir: string;
    user: string;
    ports: ImageRunPort[];
    network: string;
    restartPolicy: string;
    restartMaxRetries: number;
    autoRemove: boolean;
};

type ImageRunPanelState = {
    image: ImageSummary;
    config: ImageRunConfig;
    form: ImageRunForm;
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
    createdAt: number;
    internal: boolean;
    attachable: boolean;
    ingress: boolean;
    configOnly: boolean;
    enableIpv4: boolean;
    enableIpv6: boolean;
    labels: Record<string, string>;
    options: Record<string, string>;
};

type NetworkKeyValue = {
    key: string;
    value: string;
};

type NetworkIPAMConfig = {
    subnet: string;
    ipRange: string;
    gateway: string;
    auxAddresses: NetworkKeyValue[];
};

type NetworkCreateForm = {
    name: string;
    driver: string;
    scope: string;
    enableIpv4: string;
    enableIpv6: string;
    internal: boolean;
    attachable: boolean;
    ingress: boolean;
    configOnly: boolean;
    configFrom: string;
    options: NetworkKeyValue[];
    labels: NetworkKeyValue[];
    ipamDriver: string;
    ipamOptions: NetworkKeyValue[];
    ipamConfigs: NetworkIPAMConfig[];
};

type NetworkCreateRequest = NetworkCreateForm;

type NetworkConnectForm = {
    networkId: string;
    containerId: string;
    aliases: string;
    links: string;
    ipv4Address: string;
    ipv6Address: string;
    linkLocalIps: string;
    driverOptions: NetworkKeyValue[];
    gwPriority: string;
};

type NetworkConnectRequest = {
    networkId: string;
    containerId: string;
    aliases: string[];
    links: string[];
    ipv4Address: string;
    ipv6Address: string;
    linkLocalIps: string[];
    driverOptions: NetworkKeyValue[];
    gwPriority: number;
};

type NetworkDisconnectForm = {
    networkId: string;
    containerId: string;
    force: boolean;
};

type NetworkDisconnectRequest = NetworkDisconnectForm;

type NetworkPruneForm = {
    filters: NetworkKeyValue[];
};

type NetworkInspectInfo = NetworkInfo & {
    configFrom: string;
    ipam: {
        driver: string;
        options: Record<string, string>;
        configs: NetworkIPAMConfig[];
    };
    containers: NetworkEndpointInfo[];
    services: NetworkServiceInfo[];
    rawJson: string;
};

type NetworkEndpointInfo = {
    containerId: string;
    name: string;
    endpointId: string;
    macAddress: string;
    ipv4Address: string;
    ipv6Address: string;
};

type NetworkServiceInfo = {
    id: string;
    vip: string;
    ports: string[];
    localLbIndex: number;
    taskCount: number;
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
    current: number;
    total: number;
    error: string;
    done: boolean;
};

type PullPhase =
    | 'pending'           // 等待开始
    | 'connecting'        // 连接 Docker daemon
    | 'resolving'         // 解析镜像引用
    | 'pulling_manifest'  // 拉取 manifest
    | 'downloading'       // 下载层
    | 'verifying_download'// 验证下载完整性
    | 'extracting'        // 解压层
    | 'verifying_extract' // 验证解压完整性
    | 'finalizing'        // 完成最后处理
    | 'complete'          // 完成
    | 'cancelled'         // 已取消
    | 'failed';           // 失败

type PullTaskState = {
    subscriptionId: string;
    reference: string;
    phase: PullPhase;
    layerProgress: Record<string, {
        downloadCurrent: number;
        downloadTotal: number;
        downloadDone: boolean;
        extractCurrent: number;
        extractTotal: number;
        extractDone: boolean;
    }>;
    downloadingCurrent: number;
    downloadingTotal: number;
    extractingCurrent: number;
    extractingTotal: number;
    completedCurrent: number;
    completedTotal: number;
    error: string;
    done: boolean;
    cancelled: boolean;
    removing: boolean;
    updatedAt: number;
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

type RemovableRowKind = 'container' | 'image' | 'context' | 'network';

const ROW_EXIT_ANIMATION_MS = 280;
const NETWORK_PRUNE_HELP = '删除未被容器使用的 Docker 网络；已连接容器的网络不会被清理，可用 Filters 缩小范围。';

const SERVER_INFO_FIELDS: ServerInfoField[] = [
    {label: '服务器', resolve: (_status, value) => value('Info.Name') || '-'},
    {label: 'Docker Host', resolve: (status) => status?.docker.host || '-'},
    {label: 'Context', resolve: (status) => status?.activeContext?.name || status?.docker.contextName || '-'},
    {label: '系统', resolve: (status, value) => value('Info.OperatingSystem') || status?.docker.os || '-'},
    {label: '内核', resolve: (_status, value) => value('Info.KernelVersion') || '-'},
    {label: '架构', resolve: (status, value) => value('Info.Architecture', 'Version.Arch') || status?.docker.architecture || '-'},
    {label: 'CPU', resolve: (_status, value) => value('Info.NCPU') || '-'},
    {label: '内存', resolve: (_status, value) => formatParameterBytes(value('Info.MemTotal'))},
    {label: '存储驱动', resolve: (_status, value) => value('Info.Driver') || '-'},
    {label: 'Cgroup', resolve: (_status, value) => [value('Info.CgroupDriver'), value('Info.CgroupVersion')].filter((item) => item && item !== '-').join(' / ') || '-'},
    {label: 'Docker', resolve: (status, value) => value('Version.Version', 'Info.ServerVersion') || status?.docker.serverVersion || status?.docker.error || '-'},
    {label: 'API', resolve: (status, value) => value('Version.APIVersion') || status?.docker.apiVersion || '-'},
];

const SERVER_INFO_ROW_COUNT = SERVER_INFO_FIELDS.length;

const navigation = [
    {key: 'overview', label: '概览', icon: Activity},
    {key: 'containers', label: '容器', icon: Container},
    {key: 'images', label: '镜像', icon: Box},
    {key: 'compose', label: 'Compose', icon: Layers},
    {key: 'volumes', label: '数据卷', icon: HardDrive},
    {key: 'networks', label: '网络', icon: Network},
    {key: 'settings', label: '设置', icon: Database},
] as const;

const DEFAULT_TOGGLE_OPTIONS = [
    {value: 'default', label: '默认'},
    {value: 'enabled', label: '启用'},
    {value: 'disabled', label: '禁用'},
] satisfies SelectOption[];

const RESTART_POLICY_OPTIONS = [
    {value: 'no', label: 'no'},
    {value: 'always', label: 'always'},
    {value: 'unless-stopped', label: 'unless-stopped'},
    {value: 'on-failure', label: 'on-failure'},
] satisfies SelectOption[];

const PORT_PROTOCOL_OPTIONS = [
    {value: 'tcp', label: 'tcp'},
    {value: 'udp', label: 'udp'},
    {value: 'sctp', label: 'sctp'},
] satisfies SelectOption[];

function removableRowKey(kind: RemovableRowKind, id: string) {
    return `${kind}:${id}`;
}

function App() {
    const [activeView, setActiveView] = useState<ViewKey>('overview');
    const [status, setStatus] = useState<AppStatus | null>(null);
    const [dockerContexts, setDockerContexts] = useState<DockerContext[]>([]);
    const [containers, setContainers] = useState<ContainerSummary[]>([]);
    const [images, setImages] = useState<ImageSummary[]>([]);
    const [composeProjects, setComposeProjects] = useState<ComposeProject[]>([]);
    const [exitingRows, setExitingRows] = useState<Set<string>>(new Set());
    const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
    const [networks, setNetworks] = useState<NetworkInfo[]>([]);
    const [containerSearch, setContainerSearch] = useState('');
    const [imageSearch, setImageSearch] = useState('');
    const [networkSearch, setNetworkSearch] = useState('');
    const [imageReference, setImageReference] = useState('');
    const [imageRunPanel, setImageRunPanel] = useState<ImageRunPanelState | null>(null);
    const [composePath, setComposePath] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState('');
    const [toast, setToast] = useState<ToastState>(null);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
    const [contextPanelOpen, setContextPanelOpen] = useState(false);
    const [contextPanelMounted, setContextPanelMounted] = useState(false);
    const [contextPanelClosing, setContextPanelClosing] = useState(false);
    const [contextForm, setContextForm] = useState<DockerContextForm | null>(null);
    const [pullTasks, setPullTasks] = useState<Record<string, PullTaskState>>({});
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
    const pullDismissTimersRef = useRef<Record<string, number>>({});
    const rowExitTimersRef = useRef<number[]>([]);
    const activeViewRef = useRef<ViewKey>(activeView);
    const previousActiveViewRef = useRef<ViewKey>(activeView);
    const containerEntrySortPendingRef = useRef(false);
    const containerEntrySortedRef = useRef(false);

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
                ListContainers({search: '', all: true}),
                ListImages({search: imageSearch}),
                ListComposeProjects(),
                ListVolumes(),
                ListNetworks(),
            ]);
            const nextContainers = settledValue(containerList, []) as ContainerSummary[];
            setContainers((current) => (
                activeViewRef.current === 'containers' && containerEntrySortedRef.current
                    ? preserveContainerOrder(current, nextContainers)
                    : nextContainers
            ));
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
    }, [imageSearch, showToast]);

    useEffect(() => {
        const previousActiveView = previousActiveViewRef.current;
        activeViewRef.current = activeView;
        if (activeView === 'containers' && previousActiveView !== 'containers') {
            containerEntrySortPendingRef.current = true;
            containerEntrySortedRef.current = false;
        }
        if (activeView !== 'containers') {
            containerEntrySortPendingRef.current = false;
            containerEntrySortedRef.current = false;
        }
        previousActiveViewRef.current = activeView;
    }, [activeView]);

    useEffect(() => {
        if (activeView !== 'containers' || loading || !containerEntrySortPendingRef.current) {
            return;
        }
        // 容器页进入和手动刷新会消费一次排序，其他列表更新保留用户正在查看的顺序。
        setContainers((current) => sortContainersForEntry(current));
        containerEntrySortPendingRef.current = false;
        containerEntrySortedRef.current = true;
    }, [activeView, loading]);

    const refreshCurrentView = useCallback(async () => {
        if (activeViewRef.current === 'containers') {
            containerEntrySortPendingRef.current = true;
            containerEntrySortedRef.current = false;
        }
        await refreshAll();
    }, [refreshAll]);

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
            setPullTasks((current) => updatePullTasks(current, event));
            if (event.done && event.error) {
                showToast('error', event.error);
            }
            if (event.done && event.status === 'cancelled') {
                showToast('success', '镜像拉取已取消');
            }
            if (event.done && !event.error && event.status !== 'cancelled') {
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
        const timers = pullDismissTimersRef.current;
        const taskList = Object.values(pullTasks);
        for (const task of taskList) {
            const dismissKey = `${task.subscriptionId}:dismiss`;
            const removeKey = `${task.subscriptionId}:remove`;
            if ((task.done || task.cancelled) && !task.error && !task.removing && !timers[dismissKey]) {
                timers[dismissKey] = window.setTimeout(() => {
                    setPullTasks((current) => ({
                        ...current,
                        [task.subscriptionId]: {
                            ...current[task.subscriptionId],
                            removing: true,
                        }
                    }));
                    delete timers[dismissKey];
                    timers[removeKey] = window.setTimeout(() => {
                        setPullTasks((current) => {
                            const next = {...current};
                            delete next[task.subscriptionId];
                            return next;
                        });
                        delete timers[removeKey];
                    }, 260);
                }, 3000);
            }
            if ((!task.done && !task.cancelled) || task.error) {
                if (timers[dismissKey]) {
                    window.clearTimeout(timers[dismissKey]);
                    delete timers[dismissKey];
                }
                if (timers[removeKey]) {
                    window.clearTimeout(timers[removeKey]);
                    delete timers[removeKey];
                }
            }
        }
        return () => undefined;
    }, [pullTasks]);

    useEffect(() => {
        return () => {
            if (contextPanelCloseTimerRef.current) {
                window.clearTimeout(contextPanelCloseTimerRef.current);
            }
            for (const timer of Object.values(pullDismissTimersRef.current)) {
                window.clearTimeout(timer);
            }
            for (const timer of rowExitTimersRef.current) {
                window.clearTimeout(timer);
            }
        };
    }, []);

    const animateRowExit = useCallback((key: string, removeFromList: () => void) => {
        return new Promise<void>((resolve) => {
            setExitingRows((current) => new Set(current).add(key));
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const duration = reduceMotion ? 0 : ROW_EXIT_ANIMATION_MS;
            const timer = window.setTimeout(() => {
                removeFromList();
                setExitingRows((current) => {
                    const next = new Set(current);
                    next.delete(key);
                    return next;
                });
                rowExitTimersRef.current = rowExitTimersRef.current.filter((item) => item !== timer);
                resolve();
            }, duration);
            rowExitTimersRef.current.push(timer);
        });
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

    const runDeleteAction = useCallback(async (key: string, exitKey: string, action: () => Promise<ActionResult>, removeFromList: () => void) => {
        setBusyKey(key);
        try {
            const result = await action();
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                await animateRowExit(exitKey, removeFromList);
                await refreshAll();
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    }, [animateRowExit, refreshAll, showToast]);

    const runContainerLifecycleAction = useCallback(async (key: string, id: string, action: () => Promise<ActionResult>, nextState: string) => {
        setBusyKey(key);
        try {
            const result = await action();
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                setContainers((current) => current.map((container) => (
                    container.id === id ? {...container, state: nextState, status: result.message} : container
                )));
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    }, [showToast]);

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

        const activePullCount = Object.values(pullTasks).filter(task => !task.done && !task.cancelled && !task.error).length;
        const MAX_CONCURRENT_PULLS = 3;

        if (activePullCount >= MAX_CONCURRENT_PULLS) {
            showToast('error', `最多同时进行 ${MAX_CONCURRENT_PULLS} 个镜像拉取任务`);
            return;
        }

        setBusyKey('pull-image');
        try {
            const subscription = await PullImage({reference: imageReference.trim()});
            const subscriptionId = (subscription as {subscriptionId: string}).subscriptionId;
            setPullTasks((current) => ({
                ...current,
                [subscriptionId]: {
                    subscriptionId,
                    reference: imageReference.trim(),
                    phase: 'connecting',
                    layerProgress: {},
                    downloadingCurrent: 0,
                    downloadingTotal: 0,
                    extractingCurrent: 0,
                    extractingTotal: 0,
                    completedCurrent: 0,
                    completedTotal: 0,
                    error: '',
                    done: false,
                    cancelled: false,
                    removing: false,
                    updatedAt: Date.now(),
                }
            }));
            showToast('success', '已开始拉取镜像');
            setImageReference('');
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const openImageRun = async (image: ImageSummary) => {
        const reference = imageReferenceForRun(image);
        setBusyKey(`image-run-inspect-${image.id}`);
        try {
            const config = await InspectImageRunConfig(reference) as ImageRunConfig;
            setImageRunPanel({
                image,
                config,
                form: imageRunFormFromConfig(config),
            });
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const submitImageRun = async () => {
        if (!imageRunPanel) {
            return;
        }
        const request = normalizeImageRunRequest(imageRunPanel.form);
        if (!request.image) {
            showToast('error', '镜像名称不能为空');
            return;
        }
        if (request.autoRemove && request.restartPolicy !== 'no') {
            showToast('error', '自动删除不能同时配置重启策略');
            return;
        }
        setBusyKey('image-run-submit');
        try {
            const result = await RunImage(core.ImageRunRequestDTO.createFrom(request));
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                setImageRunPanel(null);
                setActiveView('containers');
                await refreshAll();
            }
        } catch (error) {
            showToast('error', readableError(error));
        } finally {
            setBusyKey('');
        }
    };

    const cancelPullImage = async (subscriptionId: string) => {
        const task = pullTasks[subscriptionId];

        // 如果任务已经失败或已取消，直接移除而不调用后端
        if (task && (task.error || task.cancelled)) {
            setPullTasks((current) => {
                const next = {...current};
                if (next[subscriptionId]) {
                    next[subscriptionId] = {...next[subscriptionId], removing: true};
                }
                return next;
            });
            setTimeout(() => {
                setPullTasks((current) => {
                    const next = {...current};
                    delete next[subscriptionId];
                    return next;
                });
            }, 280);
            return;
        }

        // 正常取消正在进行的任务
        setBusyKey(`pull-cancel-${subscriptionId}`);
        try {
            const result = await CancelImagePull(subscriptionId);
            showToast(result.ok ? 'success' : 'error', result.message);
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
                void runDeleteAction(
                    `context-delete-${context.id}`,
                    removableRowKey('context', context.id),
                    () => DeleteDockerContext(context.id),
                    () => setDockerContexts((current) => current.filter((item) => item.id !== context.id)),
                );
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

    const createNetwork = async (request: NetworkCreateRequest) => {
        if (!request.name.trim()) {
            showToast('error', '请输入网络名称');
            return false;
        }
        setBusyKey('network-create');
        try {
            const result = await CreateNetwork(core.NetworkCreateRequestDTO.createFrom(normalizeNetworkCreateRequest(request)));
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                await refreshAll();
            }
            return result.ok;
        } catch (error) {
            showToast('error', readableError(error));
            return false;
        } finally {
            setBusyKey('');
        }
    };

    const inspectNetwork = async (network: NetworkInfo, verbose: boolean) => {
        setBusyKey(`network-inspect-${network.id}`);
        try {
            return await InspectNetwork({id: network.id, scope: '', verbose}) as NetworkInspectInfo;
        } catch (error) {
            showToast('error', readableError(error));
            return null;
        } finally {
            setBusyKey('');
        }
    };

    const connectNetwork = async (request: NetworkConnectRequest) => {
        if (!request.containerId.trim()) {
            showToast('error', '请选择容器');
            return false;
        }
        setBusyKey(`network-connect-${request.networkId}`);
        try {
            const result = await ConnectNetwork(core.NetworkConnectRequestDTO.createFrom(request));
            showToast(result.ok ? 'success' : 'error', result.message);
            if (result.ok) {
                await refreshAll();
            }
            return result.ok;
        } catch (error) {
            showToast('error', readableError(error));
            return false;
        } finally {
            setBusyKey('');
        }
    };

    const disconnectNetwork = (request: NetworkDisconnectRequest, networkName: string, containerName: string) => {
        requestConfirm({
            title: '断开网络',
            message: `确认断开 ${containerName || request.containerId} 与 ${networkName}？`,
            detail: request.force ? '将使用强制断开，容器网络连接会立即移除。' : '容器会从该网络移除，运行中的连接可能中断。',
            confirmLabel: request.force ? '强制断开' : '断开',
            danger: true,
            onConfirm: () => {
                void runAction(`network-disconnect-${request.networkId}`, () => DisconnectNetwork(request));
            },
        });
    };

    const removeNetwork = (network: NetworkInfo) => {
        requestConfirm({
            title: '删除网络',
            message: `确认删除网络 ${network.name}？`,
            detail: '如果网络仍被容器或服务使用，Docker 会拒绝删除。',
            confirmLabel: '删除',
            danger: true,
            onConfirm: () => {
                void runDeleteAction(
                    `network-remove-${network.id}`,
                    removableRowKey('network', network.id),
                    () => RemoveNetwork(network.id, false),
                    () => setNetworks((current) => current.filter((item) => item.id !== network.id)),
                );
            },
        });
    };

    const pruneNetworks = (request: NetworkPruneForm) => {
        requestConfirm({
            title: '清理网络',
            message: '确认清理未使用的网络？',
            detail: 'Docker 会删除当前未被容器使用的自定义网络。',
            confirmLabel: '清理',
            danger: true,
            onConfirm: () => {
                void runAction('network-prune', () => PruneNetworks(core.NetworkPruneRequestDTO.createFrom({filters: cleanKeyValues(request.filters)})));
            },
        });
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
        <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${status?.platform.startsWith('darwin/') ? 'macos-titlebar' : ''}`}>
            <div className="window-drag-strip" aria-hidden="true"/>
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{cursor: 'pointer'}} title={sidebarCollapsed ? '展开' : '收起'}>
                        <Boxes size={18}/>
                    </div>
                    <div>
                        <strong>Coriva</strong>
                        <span>{currentContext?.name || 'Docker'}</span>
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
                    <button className="icon-button" onClick={refreshCurrentView} disabled={loading} type="button" title="刷新">
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
                        exitingRows={exitingRows}
                        onLogs={openContainerLogs}
                        onStart={(item) => runContainerLifecycleAction(`container-start-${item.id}`, item.id, () => StartContainer(item.id), 'running')}
                        onStop={(item) => {
                            requestConfirm({
                                title: '停止容器',
                                message: `确认停止容器 ${item.name}？`,
                                detail: '停止会中断容器内正在运行的进程，请确认业务可以中断。',
                                confirmLabel: '停止',
                                danger: true,
                                onConfirm: () => {
                                    void runContainerLifecycleAction(`container-stop-${item.id}`, item.id, () => StopContainer(item.id), 'exited');
                                },
                            });
                        }}
                        onRestart={(item) => {
                            requestConfirm({
                                title: '重启容器',
                                message: `确认重启容器 ${item.name}？`,
                                detail: '重启会短暂中断容器服务，并重新创建运行进程。',
                                confirmLabel: '重启',
                                danger: true,
                                onConfirm: () => {
                                    void runContainerLifecycleAction(`container-restart-${item.id}`, item.id, () => RestartContainer(item.id), 'running');
                                },
                            });
                        }}
                        onRemove={(item) => {
                            const force = item.state === 'running';
                            requestConfirm({
                                title: '删除容器',
                                message: `确认删除容器 ${item.name}？`,
                                detail: force ? '该容器正在运行，确认后会强制停止并删除。' : '删除后容器记录将不可恢复，数据卷不会自动删除。',
                                confirmLabel: force ? '强制删除' : '删除',
                                danger: true,
                                onConfirm: () => {
                                    void runDeleteAction(
                                        `container-remove-${item.id}`,
                                        removableRowKey('container', item.id),
                                        () => RemoveContainer(item.id, force),
                                        () => setContainers((current) => current.filter((container) => container.id !== item.id)),
                                    );
                                },
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
                        pullTasks={Object.values(pullTasks).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)}
                        busyKey={busyKey}
                        exitingRows={exitingRows}
                        onPull={pullImage}
                        onCancelPull={cancelPullImage}
                        onRun={openImageRun}
                        onRemove={(item) => {
                            const label = imageLabel(item);
                            requestConfirm({
                                title: '删除镜像',
                                message: `确认删除镜像 ${label}？`,
                                detail: '如果镜像正在被容器使用，Docker 会拒绝删除。',
                                confirmLabel: '删除',
                                danger: true,
                                onConfirm: () => {
                                    void runDeleteAction(
                                        `image-remove-${item.id}`,
                                        removableRowKey('image', item.id),
                                        () => RemoveImage(item.id, false),
                                        () => setImages((current) => current.filter((image) => image.id !== item.id)),
                                    );
                                },
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
                {activeView === 'networks' && (
                    <NetworksView
                        networks={networks}
                        containers={containers}
                        search={networkSearch}
                        setSearch={setNetworkSearch}
                        busyKey={busyKey}
                        exitingRows={exitingRows}
                        onCreate={createNetwork}
                        onInspect={inspectNetwork}
                        onConnect={connectNetwork}
                        onDisconnect={disconnectNetwork}
                        onRemove={removeNetwork}
                        onPrune={pruneNetworks}
                    />
                )}
                {activeView === 'settings' && (
                    <SettingsView
                        status={status}
                        contexts={dockerContexts}
                        form={contextForm}
                        setForm={setContextForm}
                        busyKey={busyKey}
                        exitingRows={exitingRows}
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

            {imageRunPanel && (
                <ImageRunDialog
                    panel={imageRunPanel}
                    networks={networks}
                    busy={busyKey === 'image-run-submit'}
                    onChange={(form) => setImageRunPanel((current) => current ? {...current, form} : current)}
                    onClose={() => setImageRunPanel(null)}
                    onSubmit={submitImageRun}
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
    const recentActionGroups = useMemo(() => groupRecentActions(status?.recentActions || []), [status?.recentActions]);
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
                    {loading && <SkeletonRows count={SERVER_INFO_ROW_COUNT} className="overview-info-skeleton"/>}
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
                        <div className="activity-list" aria-label="最近操作">
                            {recentActionGroups.map((group) => (
                                <section className="activity-day" key={group.key}>
                                    <div className="activity-date">{group.label}</div>
                                    <div className="activity-day-rows">
                                        {group.actions.map((action) => (
                                            <div className="activity-row" key={action.id}>
                                                <StatusDot state={action.status === 'success' ? 'running' : 'error'}/>
                                                <div>
                                                    <strong>{action.message}</strong>
                                                    <span>{action.kind} · {action.target}</span>
                                                </div>
                                                <time dateTime={action.createdAt}>{formatTime(action.createdAt)}</time>
                                            </div>
                                        ))}
                                    </div>
                                </section>
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
    exitingRows: Set<string>;
    onLogs: (container: ContainerSummary) => void;
    onStart: (container: ContainerSummary) => void;
    onStop: (container: ContainerSummary) => void;
    onRestart: (container: ContainerSummary) => void;
    onRemove: (container: ContainerSummary) => void;
}) {
    const filtered = filterContainers(props.containers, props.search);
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
                    {filtered.length ? filtered.map((item) => (
                        <div className={`table-row containers ${props.exitingRows.has(removableRowKey('container', item.id)) ? 'removing' : ''}`} key={item.id}>
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
    pullTasks: PullTaskState[];
    busyKey: string;
    exitingRows: Set<string>;
    onPull: () => void;
    onCancelPull: (subscriptionId: string) => void;
    onRun: (image: ImageSummary) => void;
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
            {!!props.pullTasks.length && (
                <div className="progress-strip">
                    {props.pullTasks.map((task) => (
                        <PullTaskRow
                            key={task.subscriptionId}
                            task={task}
                            busy={props.busyKey === `pull-cancel-${task.subscriptionId}`}
                            onCancel={() => props.onCancelPull(task.subscriptionId)}
                        />
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
                        <div className={`table-row images ${props.exitingRows.has(removableRowKey('image', item.id)) ? 'removing' : ''}`} key={item.id}>
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
                                <ActionButton title="运行" busy={props.busyKey === `image-run-inspect-${item.id}`} onClick={() => props.onRun(item)} icon={<Play size={15}/>}/>
                                <ActionButton danger title="删除" busy={props.busyKey === `image-remove-${item.id}`} onClick={() => props.onRemove(item)} icon={<Trash2 size={15}/>}/>
                            </div>
                        </div>
                    )) : <EmptyState title="没有镜像" body="拉取镜像后会显示在这里。"/>}
                </div>
            </div>
        </section>
    );
}

function ImageRunDialog({panel, networks, busy, onChange, onClose, onSubmit}: {
    panel: ImageRunPanelState;
    networks: NetworkInfo[];
    busy: boolean;
    onChange: (form: ImageRunForm) => void;
    onClose: () => void;
    onSubmit: () => void;
}) {
    const {form, config, image} = panel;
    const update = (patch: Partial<ImageRunForm>) => onChange({...form, ...patch});
    const networkOptions = imageRunNetworkOptions(networks);
    const autoRemove = form.autoRemove;
    return (
        <div
            className="confirm-backdrop"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                    onClose();
                }
            }}
        >
            <section className="network-dialog image-run-dialog" role="dialog" aria-modal="true" aria-labelledby="image-run-title">
                <div className="network-form-title">
                    <div>
                        <h2 id="image-run-title">运行容器</h2>
                        <span className="muted" title={imageLabel(image)}>{imageLabel(image)}</span>
                    </div>
                    <button className="icon-button" onClick={onClose} type="button" title="关闭">
                        <X size={15}/>
                    </button>
                </div>

                <div className="image-run-summary">
                    <InfoRow label="镜像 ID" value={config.id ? truncateMiddle(config.id, 18, 12) : '-'}/>
                    <InfoRow label="平台" value={[config.os, config.architecture].filter(Boolean).join('/') || '-'}/>
                    <InfoRow label="大小" value={formatBytes(config.size)}/>
                </div>

                <div className="network-form-grid">
                    <label>
                        <span>容器名</span>
                        <input value={form.name} onChange={(event) => update({name: event.target.value})} placeholder="可选"/>
                    </label>
                    <label>
                        <span>网络</span>
                        <CustomSelect
                            value={form.network}
                            options={[
                                {value: '', label: '默认'},
                                ...networkOptions.map((network) => ({value: network, label: network})),
                            ]}
                            onChange={(network) => update({network})}
                            ariaLabel="网络"
                        />
                    </label>
                    <label>
                        <span>重启策略</span>
                        <CustomSelect
                            value={autoRemove ? 'no' : form.restartPolicy}
                            disabled={autoRemove}
                            options={RESTART_POLICY_OPTIONS}
                            onChange={(restartPolicy) => update({restartPolicy})}
                            ariaLabel="重启策略"
                        />
                    </label>
                    {form.restartPolicy === 'on-failure' && !autoRemove && (
                        <label>
                            <span>重试次数</span>
                            <input value={form.restartMaxRetries} onChange={(event) => update({restartMaxRetries: event.target.value})} inputMode="numeric"/>
                        </label>
                    )}
                    <label>
                        <span>工作目录</span>
                        <input value={form.workingDir} onChange={(event) => update({workingDir: event.target.value})}/>
                    </label>
                    <label>
                        <span>用户</span>
                        <input value={form.user} onChange={(event) => update({user: event.target.value})}/>
                    </label>
                    <label className="context-checkbox">
                        <input
                            type="checkbox"
                            checked={form.autoRemove}
                            onChange={(event) => update({
                                autoRemove: event.target.checked,
                                restartPolicy: event.target.checked ? 'no' : form.restartPolicy,
                            })}
                        />
                        <span>Auto remove</span>
                    </label>
                </div>

                <div className="image-run-section">
                    <label>
                        <span>Entrypoint</span>
                        <textarea value={form.entrypoint} onChange={(event) => update({entrypoint: event.target.value})} rows={3}/>
                    </label>
                    <label>
                        <span>命令参数</span>
                        <textarea value={form.command} onChange={(event) => update({command: event.target.value})} rows={3}/>
                    </label>
                </div>

                <KeyValueEditor title="环境变量" items={form.env} onChange={(env) => update({env})}/>
                <ImageRunPortEditor ports={form.ports} onChange={(ports) => update({ports})}/>

                {!!config.volumes?.length && (
                    <div className="image-run-volumes">
                        <span>镜像卷</span>
                        <div>
                            {config.volumes.map((volume) => <code key={volume}>{volume}</code>)}
                        </div>
                    </div>
                )}

                <div className="context-form-actions">
                    <button onClick={onSubmit} disabled={busy} type="button">
                        {busy ? <LoaderCircle size={15} className="spin"/> : <Play size={15}/>}
                        运行
                    </button>
                    <button onClick={onClose} type="button">取消</button>
                </div>
            </section>
        </div>
    );
}

function ImageRunPortEditor({ports, onChange}: {
    ports: ImageRunPort[];
    onChange: (ports: ImageRunPort[]) => void;
}) {
    const rows = ports.length ? ports : [emptyImageRunPort()];
    const update = (index: number, patch: Partial<ImageRunPort>) => {
        onChange(rows.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
    };
    const remove = (index: number) => {
        onChange(rows.filter((_, itemIndex) => itemIndex !== index));
    };
    return (
        <div className="image-run-port-editor">
            <div className="kv-editor-head">
                <span>端口</span>
                <button className="action-button" onClick={() => onChange([...rows, emptyImageRunPort()])} type="button" title="新增">
                    <Plus size={14}/>
                </button>
            </div>
            <div className="image-run-port-rows">
                {rows.map((port, index) => (
                    <div className="image-run-port-row" key={`run-port-${index}`}>
                        <label className="context-checkbox">
                            <input type="checkbox" checked={port.publish} onChange={(event) => update(index, {publish: event.target.checked})}/>
                            <span>发布</span>
                        </label>
                        <input value={port.containerPort} onChange={(event) => update(index, {containerPort: event.target.value})} placeholder="80"/>
                        <CustomSelect
                            value={port.protocol || 'tcp'}
                            options={PORT_PROTOCOL_OPTIONS}
                            onChange={(protocol) => update(index, {protocol})}
                            ariaLabel={`端口 ${index + 1} 协议`}
                        />
                        <input value={port.hostIp} disabled={!port.publish} onChange={(event) => update(index, {hostIp: event.target.value})} placeholder="Host IP"/>
                        <input value={port.hostPort} disabled={!port.publish} onChange={(event) => update(index, {hostPort: event.target.value})} placeholder="随机"/>
                        <button className="action-button" onClick={() => remove(index)} type="button" title="移除">
                            <X size={14}/>
                        </button>
                    </div>
                ))}
            </div>
        </div>
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

function NetworksView(props: {
    networks: NetworkInfo[];
    containers: ContainerSummary[];
    search: string;
    setSearch: (value: string) => void;
    busyKey: string;
    exitingRows: Set<string>;
    onCreate: (request: NetworkCreateRequest) => Promise<boolean>;
    onInspect: (network: NetworkInfo, verbose: boolean) => Promise<NetworkInspectInfo | null>;
    onConnect: (request: NetworkConnectRequest) => Promise<boolean>;
    onDisconnect: (request: NetworkDisconnectRequest, networkName: string, containerName: string) => void;
    onRemove: (network: NetworkInfo) => void;
    onPrune: (request: NetworkPruneForm) => void;
}) {
    const [createOpen, setCreateOpen] = useState(false);
    const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
    const [createForm, setCreateForm] = useState<NetworkCreateForm>(emptyNetworkCreateForm());
    const [connectForm, setConnectForm] = useState<NetworkConnectForm | null>(null);
    const [disconnectForm, setDisconnectForm] = useState<NetworkDisconnectForm | null>(null);
    const [pruneOpen, setPruneOpen] = useState(false);
    const [pruneForm, setPruneForm] = useState<NetworkPruneForm>(emptyNetworkPruneForm());
    const [networkContainersPanel, setNetworkContainersPanel] = useState<NetworkInfo | null>(null);
    const [inspectPanel, setInspectPanel] = useState<{ network: NetworkInfo; detail: NetworkInspectInfo; verbose: boolean } | null>(null);

    const visibleNetworks = useMemo(() => filterNetworks(props.networks, props.search), [props.networks, props.search]);
    const networkContainersByName = useMemo(() => {
        const containersByName = new Map<string, ContainerSummary[]>();
        props.containers.forEach((container) => {
            const networkNames = new Set((container.networks || []).map((name) => name.trim()).filter(Boolean));
            networkNames.forEach((name) => {
                containersByName.set(name, [...(containersByName.get(name) || []), container]);
            });
        });
        return containersByName;
    }, [props.containers]);

    const submitCreate = async () => {
        const ok = await props.onCreate(createForm);
        if (ok) {
            setCreateForm(emptyNetworkCreateForm());
            setCreateAdvancedOpen(false);
            setCreateOpen(false);
        }
    };

    const openInspect = async (network: NetworkInfo, verbose = inspectPanel?.verbose || false) => {
        const detail = await props.onInspect(network, verbose);
        if (detail) {
            setInspectPanel({network, detail, verbose});
        }
    };

    const submitConnect = async () => {
        if (!connectForm) {
            return;
        }
        const ok = await props.onConnect(networkConnectRequestFromForm(connectForm));
        if (ok) {
            setConnectForm(null);
        }
    };

    const submitDisconnect = () => {
        if (!disconnectForm) {
            return;
        }
        const network = props.networks.find((item) => item.id === disconnectForm.networkId);
        const container = props.containers.find((item) => item.id === disconnectForm.containerId);
        props.onDisconnect(disconnectForm, network?.name || disconnectForm.networkId, container?.name || disconnectForm.containerId);
        setDisconnectForm(null);
    };

    return (
        <section className="network-stack">
            <div className="network-toolbar">
                <Toolbar search={props.search} setSearch={props.setSearch} placeholder="搜索网络、驱动、作用域或标签"/>
                <div className="network-toolbar-actions">
                    <button className="primary-button" onClick={() => setCreateOpen((current) => !current)} type="button">
                        <FolderPlus size={15}/>
                        新建
                    </button>
                    <button className="context-manage-button" onClick={() => setPruneOpen((current) => !current)} type="button">
                        <Trash2 size={15}/>
                        清理
                    </button>
                </div>
            </div>

            {createOpen && (
                <div
                    className="confirm-backdrop"
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target) {
                            setCreateOpen(false);
                        }
                    }}
                >
                    <section className="network-dialog network-create-dialog network-form" role="dialog" aria-modal="true" aria-labelledby="network-create-title">
                        <div className="network-form-title">
                            <h2 id="network-create-title">新建网络</h2>
                            <button className="icon-button" onClick={() => setCreateOpen(false)} type="button" title="关闭">
                                <X size={15}/>
                            </button>
                        </div>
                        <div className="network-form-grid">
                            <label>
                                <span>名称</span>
                                <input value={createForm.name} onChange={(event) => setCreateForm({...createForm, name: event.target.value})}/>
                            </label>
                            <label>
                                <span>Driver</span>
                                <input value={createForm.driver} onChange={(event) => setCreateForm({...createForm, driver: event.target.value})} placeholder="bridge"/>
                            </label>
                            <label>
                                <span>Scope</span>
                                <input value={createForm.scope} onChange={(event) => setCreateForm({...createForm, scope: event.target.value})} placeholder="local"/>
                            </label>
                            <label>
                                <span>IPv4</span>
                                <CustomSelect
                                    value={createForm.enableIpv4}
                                    options={DEFAULT_TOGGLE_OPTIONS}
                                    onChange={(enableIpv4) => setCreateForm({...createForm, enableIpv4})}
                                    ariaLabel="IPv4"
                                />
                            </label>
                            <label>
                                <span>IPv6</span>
                                <CustomSelect
                                    value={createForm.enableIpv6}
                                    options={DEFAULT_TOGGLE_OPTIONS}
                                    onChange={(enableIpv6) => setCreateForm({...createForm, enableIpv6})}
                                    ariaLabel="IPv6"
                                />
                            </label>
                            <label className="context-checkbox">
                                <input type="checkbox" checked={createForm.internal} onChange={(event) => setCreateForm({...createForm, internal: event.target.checked})}/>
                                <span>Internal</span>
                            </label>
                            <label className="context-checkbox">
                                <input type="checkbox" checked={createForm.attachable} onChange={(event) => setCreateForm({...createForm, attachable: event.target.checked})}/>
                                <span>Attachable</span>
                            </label>
                            <label className="context-checkbox">
                                <input type="checkbox" checked={createForm.ingress} onChange={(event) => setCreateForm({...createForm, ingress: event.target.checked})}/>
                                <span>Ingress</span>
                            </label>
                            <label className="context-checkbox">
                                <input type="checkbox" checked={createForm.configOnly} onChange={(event) => setCreateForm({...createForm, configOnly: event.target.checked})}/>
                                <span>Config only</span>
                            </label>
                        </div>

                        <button className="advanced-toggle" onClick={() => setCreateAdvancedOpen((current) => !current)} type="button">
                            <ChevronDown size={15} className={createAdvancedOpen ? 'expanded' : ''}/>
                            高级参数
                        </button>

                        {createAdvancedOpen && (
                            <div className="network-advanced">
                                <label>
                                    <span>Config from</span>
                                    <input value={createForm.configFrom} onChange={(event) => setCreateForm({...createForm, configFrom: event.target.value})}/>
                                </label>
                                <label>
                                    <span>IPAM driver</span>
                                    <input value={createForm.ipamDriver} onChange={(event) => setCreateForm({...createForm, ipamDriver: event.target.value})} placeholder="default"/>
                                </label>
                                <KeyValueEditor title="Labels" items={createForm.labels} onChange={(labels) => setCreateForm({...createForm, labels})}/>
                                <KeyValueEditor title="Driver options" items={createForm.options} onChange={(options) => setCreateForm({...createForm, options})}/>
                                <KeyValueEditor title="IPAM options" items={createForm.ipamOptions} onChange={(ipamOptions) => setCreateForm({...createForm, ipamOptions})}/>
                                <NetworkIPAMConfigEditor
                                    configs={createForm.ipamConfigs}
                                    onChange={(ipamConfigs) => setCreateForm({...createForm, ipamConfigs})}
                                />
                            </div>
                        )}

                        <div className="context-form-actions">
                            <button onClick={submitCreate} disabled={props.busyKey === 'network-create'} type="button">
                                {props.busyKey === 'network-create' ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>}
                                创建
                            </button>
                            <button onClick={() => setCreateForm(emptyNetworkCreateForm())} type="button">重置</button>
                        </div>
                    </section>
                </div>
            )}

            {pruneOpen && (
                <div className="network-form compact panel network-prune-panel">
                    <div className="network-form-title">
                        <div className="network-form-heading">
                            <h2>清理网络</h2>
                            <span className="title-help-icon" tabIndex={0} data-tooltip={NETWORK_PRUNE_HELP} aria-label={NETWORK_PRUNE_HELP}>
                                <CircleHelp size={15}/>
                            </span>
                        </div>
                        <button className="icon-button" onClick={() => setPruneOpen(false)} type="button" title="关闭">
                            <X size={15}/>
                        </button>
                    </div>
                    <KeyValueEditor title="Filters" items={pruneForm.filters} onChange={(filters) => setPruneForm({filters})}/>
                    <div className="context-form-actions">
                        <button onClick={() => props.onPrune(pruneForm)} disabled={props.busyKey === 'network-prune'} type="button">
                            {props.busyKey === 'network-prune' ? <LoaderCircle size={15} className="spin"/> : <Trash2 size={15}/>}
                            清理
                        </button>
                    </div>
                </div>
            )}

            <section className="resource-table scrollable">
                <div className="table-head networks">
                    <span>名称</span>
                    <span>Driver</span>
                    <span>作用域</span>
                    <span>容器</span>
                    <span>标记</span>
                    <span>ID</span>
                    <span>操作</span>
                </div>
                <div className="table-body">
                    {visibleNetworks.length ? visibleNetworks.map((network) => (
                        <div className={`table-row networks ${props.exitingRows.has(removableRowKey('network', network.id)) ? 'removing' : ''}`} key={network.id}>
                            <div className="resource-name">
                                <Network size={16}/>
                                <div>
                                    <strong title={network.name}>{network.name}</strong>
                                    <span>{formatEpoch(network.createdAt)}</span>
                                </div>
                            </div>
                            <span>{network.driver || '-'}</span>
                            <span>{network.scope || '-'}</span>
                            <button
                                className="network-container-count"
                                onClick={() => setNetworkContainersPanel(network)}
                                type="button"
                                title={`${networkContainersByName.get(network.name)?.length || 0} 个容器已连接`}
                            >
                                {networkContainersByName.get(network.name)?.length || 0}
                            </button>
                            <span className="muted" title={networkFlags(network).join(', ') || '-'}>{networkFlags(network).join(' / ') || '-'}</span>
                            <span className="muted">{network.id.slice(0, 12)}</span>
                            <div className="row-actions">
                                <ActionButton title="详情" busy={props.busyKey === `network-inspect-${network.id}`} onClick={() => void openInspect(network, false)} icon={<Terminal size={15}/>}/>
                                <ActionButton title="连接" busy={props.busyKey === `network-connect-${network.id}`} onClick={() => setConnectForm(emptyNetworkConnectForm(network.id))} icon={<Network size={15}/>}/>
                                <ActionButton title="断开" onClick={() => setDisconnectForm(emptyNetworkDisconnectForm(network.id))} icon={<X size={15}/>}/>
                                <ActionButton danger disabled={protectedNetwork(network)} title={protectedNetwork(network) ? '系统网络不可删除' : '删除'} busy={props.busyKey === `network-remove-${network.id}`} onClick={() => props.onRemove(network)} icon={<Trash2 size={15}/>}/>
                            </div>
                        </div>
                    )) : <EmptyState title="没有网络" body="Docker network 会显示在这里。"/>}
                </div>
            </section>

            {connectForm && (
                <NetworkConnectDialog
                    form={connectForm}
                    setForm={setConnectForm}
                    containers={props.containers}
                    networkName={props.networks.find((item) => item.id === connectForm.networkId)?.name || connectForm.networkId}
                    busy={props.busyKey === `network-connect-${connectForm.networkId}`}
                    onSubmit={submitConnect}
                />
            )}

            {disconnectForm && (
                <NetworkDisconnectDialog
                    form={disconnectForm}
                    setForm={setDisconnectForm}
                    containers={connectedContainersForNetwork(props.containers, props.networks.find((item) => item.id === disconnectForm.networkId)?.name || '')}
                    networkName={props.networks.find((item) => item.id === disconnectForm.networkId)?.name || disconnectForm.networkId}
                    onSubmit={submitDisconnect}
                />
            )}

            {networkContainersPanel && (
                <NetworkContainersDialog
                    network={networkContainersPanel}
                    containers={networkContainersByName.get(networkContainersPanel.name) || []}
                    busyKey={props.busyKey}
                    onClose={() => setNetworkContainersPanel(null)}
                    onDisconnect={(container) => {
                        props.onDisconnect(
                            {networkId: networkContainersPanel.id, containerId: container.id, force: false},
                            networkContainersPanel.name,
                            container.name,
                        );
                    }}
                />
            )}

            {inspectPanel && (
                <NetworkInspectPanel
                    panel={inspectPanel}
                    busy={props.busyKey === `network-inspect-${inspectPanel.network.id}`}
                    onRefresh={(verbose) => void openInspect(inspectPanel.network, verbose)}
                    onClose={() => setInspectPanel(null)}
                />
            )}
        </section>
    );
}

function NetworkContainersDialog({network, containers, busyKey, onClose, onDisconnect}: {
    network: NetworkInfo;
    containers: ContainerSummary[];
    busyKey: string;
    onClose: () => void;
    onDisconnect: (container: ContainerSummary) => void;
}) {
    return (
        <div
            className="confirm-backdrop"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                    onClose();
                }
            }}
        >
            <section className="network-dialog network-containers-dialog" role="dialog" aria-modal="true" aria-labelledby="network-containers-title">
                <div className="network-form-title">
                    <div>
                        <h2 id="network-containers-title">{network.name}</h2>
                        <span className="muted">{containers.length} 个容器已连接</span>
                    </div>
                    <button className="icon-button" onClick={onClose} type="button" title="关闭">
                        <X size={15}/>
                    </button>
                </div>

                <div className="network-container-list">
                    {containers.length ? containers.map((container) => (
                        <div className="network-container-row" key={container.id}>
                            <Container size={15}/>
                            <div>
                                <strong title={container.name}>{container.name}</strong>
                                <span title={container.image}>{container.image || '-'}</span>
                            </div>
                            <Badge tone={container.state === 'running' ? 'green' : container.state === 'paused' ? 'amber' : 'neutral'}>
                                {container.state || '-'}
                            </Badge>
                            <span className="muted">{container.shortId || container.id.slice(0, 12)}</span>
                            <ActionButton
                                danger
                                title="断开"
                                busy={busyKey === `network-disconnect-${network.id}`}
                                onClick={() => onDisconnect(container)}
                                icon={<X size={15}/>}
                            />
                        </div>
                    )) : <EmptyState title="没有容器" body="当前没有容器连接到此网络。"/>}
                </div>
            </section>
        </div>
    );
}

function KeyValueEditor({title, items, onChange}: {
    title: string;
    items: NetworkKeyValue[];
    onChange: (items: NetworkKeyValue[]) => void;
}) {
    const rows = items.length ? items : [{key: '', value: ''}];
    const update = (index: number, patch: Partial<NetworkKeyValue>) => {
        onChange(rows.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
    };
    const remove = (index: number) => {
        onChange(rows.filter((_, itemIndex) => itemIndex !== index));
    };
    return (
        <div className="kv-editor">
            <div className="kv-editor-head">
                <span>{title}</span>
                <button className="action-button" onClick={() => onChange([...rows, {key: '', value: ''}])} type="button" title="新增">
                    <FolderPlus size={14}/>
                </button>
            </div>
            <div className="kv-editor-rows">
                {rows.map((item, index) => (
                    <div className="kv-row" key={`${title}-${index}`}>
                        <input value={item.key} onChange={(event) => update(index, {key: event.target.value})} placeholder="key"/>
                        <input value={item.value} onChange={(event) => update(index, {value: event.target.value})} placeholder="value"/>
                        <button className="action-button" onClick={() => remove(index)} type="button" title="移除">
                            <X size={14}/>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NetworkIPAMConfigEditor({configs, onChange}: {
    configs: NetworkIPAMConfig[];
    onChange: (configs: NetworkIPAMConfig[]) => void;
}) {
    const update = (index: number, patch: Partial<NetworkIPAMConfig>) => {
        onChange(configs.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
    };
    return (
        <div className="ipam-editor">
            <div className="kv-editor-head">
                <span>IPAM configs</span>
                <button className="action-button" onClick={() => onChange([...configs, emptyNetworkIPAMConfig()])} type="button" title="新增">
                    <FolderPlus size={14}/>
                </button>
            </div>
            {configs.map((config, index) => (
                <div className="ipam-config" key={index}>
                    <div className="ipam-config-head">
                        <strong>Config {index + 1}</strong>
                        <button className="action-button" onClick={() => onChange(configs.filter((_, itemIndex) => itemIndex !== index))} type="button" title="移除">
                            <X size={14}/>
                        </button>
                    </div>
                    <div className="network-form-grid">
                        <label>
                            <span>Subnet</span>
                            <input value={config.subnet} onChange={(event) => update(index, {subnet: event.target.value})} placeholder="172.30.0.0/16"/>
                        </label>
                        <label>
                            <span>IP range</span>
                            <input value={config.ipRange} onChange={(event) => update(index, {ipRange: event.target.value})} placeholder="172.30.5.0/24"/>
                        </label>
                        <label>
                            <span>Gateway</span>
                            <input value={config.gateway} onChange={(event) => update(index, {gateway: event.target.value})} placeholder="172.30.0.1"/>
                        </label>
                    </div>
                    <KeyValueEditor title="Aux addresses" items={config.auxAddresses} onChange={(auxAddresses) => update(index, {auxAddresses})}/>
                </div>
            ))}
        </div>
    );
}

function NetworkConnectDialog({form, setForm, containers, networkName, busy, onSubmit}: {
    form: NetworkConnectForm;
    setForm: React.Dispatch<React.SetStateAction<NetworkConnectForm | null>>;
    containers: ContainerSummary[];
    networkName: string;
    busy: boolean;
    onSubmit: () => void;
}) {
    const update = (patch: Partial<NetworkConnectForm>) => setForm((current) => current ? {...current, ...patch} : current);
    return (
        <Modal
            title="连接网络"
            description={networkName}
            className="network-connect-dialog"
            onClose={() => setForm(null)}
            footer={(close) => (
                <>
                    <button className="dialog-button" onClick={close} type="button">取消</button>
                    <button className="dialog-button confirm" onClick={onSubmit} disabled={busy || !form.containerId} type="button">
                        {busy ? <LoaderCircle size={15} className="spin"/> : <Network size={15}/>}
                        连接
                    </button>
                </>
            )}
        >
            <div className="network-form-grid">
                <label className="form-wide">
                    <span>容器</span>
                    <CustomSelect
                        value={form.containerId}
                        options={containers.map((container) => ({value: container.id, label: container.name}))}
                        onChange={(containerId) => update({containerId})}
                        ariaLabel="容器"
                        placeholder="选择容器"
                    />
                </label>
                <label>
                    <span>IPv4</span>
                    <input value={form.ipv4Address} onChange={(event) => update({ipv4Address: event.target.value})}/>
                </label>
                <label>
                    <span>IPv6</span>
                    <input value={form.ipv6Address} onChange={(event) => update({ipv6Address: event.target.value})}/>
                </label>
                <label>
                    <span>Aliases</span>
                    <input value={form.aliases} onChange={(event) => update({aliases: event.target.value})} placeholder="api, backend"/>
                </label>
                <label>
                    <span>Links</span>
                    <input value={form.links} onChange={(event) => update({links: event.target.value})} placeholder="db:db"/>
                </label>
                <label>
                    <span>Link-local IPs</span>
                    <input value={form.linkLocalIps} onChange={(event) => update({linkLocalIps: event.target.value})}/>
                </label>
                <label>
                    <span>GW priority</span>
                    <input value={form.gwPriority} onChange={(event) => update({gwPriority: event.target.value})} inputMode="numeric"/>
                </label>
            </div>
            <KeyValueEditor title="Driver options" items={form.driverOptions} onChange={(driverOptions) => update({driverOptions})}/>
        </Modal>
    );
}

function NetworkDisconnectDialog({form, setForm, containers, networkName, onSubmit}: {
    form: NetworkDisconnectForm;
    setForm: React.Dispatch<React.SetStateAction<NetworkDisconnectForm | null>>;
    containers: ContainerSummary[];
    networkName: string;
    onSubmit: () => void;
}) {
    const update = (patch: Partial<NetworkDisconnectForm>) => setForm((current) => current ? {...current, ...patch} : current);
    return (
        <Modal
            title="断开网络"
            description={networkName}
            className="network-disconnect-dialog"
            onClose={() => setForm(null)}
            footer={(close) => (
                <>
                    <button className="dialog-button" onClick={close} type="button">取消</button>
                    <button className="dialog-button confirm danger" onClick={onSubmit} disabled={!form.containerId} type="button">
                        <X size={15}/>
                        断开
                    </button>
                </>
            )}
        >
            <div className="network-form-grid">
                <label className="form-wide">
                    <span>容器</span>
                    <CustomSelect
                        value={form.containerId}
                        options={containers.map((container) => ({value: container.id, label: container.name}))}
                        onChange={(containerId) => update({containerId})}
                        ariaLabel="容器"
                        placeholder="选择容器"
                    />
                </label>
                <label className="context-checkbox form-wide">
                    <input type="checkbox" checked={form.force} onChange={(event) => update({force: event.target.checked})}/>
                    <span>Force</span>
                </label>
            </div>
        </Modal>
    );
}

function NetworkInspectPanel({panel, busy, onRefresh, onClose}: {
    panel: { network: NetworkInfo; detail: NetworkInspectInfo; verbose: boolean };
    busy: boolean;
    onRefresh: (verbose: boolean) => void;
    onClose: () => void;
}) {
    const detail = panel.detail;
    return (
        <aside className="network-inspect-panel">
            <div className="log-head">
                <div>
                    <strong>{detail.name}</strong>
                    <span>{detail.id.slice(0, 12)}</span>
                </div>
                <div className="log-actions">
                    <button onClick={() => onRefresh(!panel.verbose)} disabled={busy} type="button">
                        {busy ? '读取中' : panel.verbose ? '普通' : 'Verbose'}
                    </button>
                    <button onClick={onClose} type="button">关闭</button>
                </div>
            </div>
            <div className="network-inspect-body">
                <div className="network-detail-grid">
                    <InfoRow label="Driver" value={detail.driver || '-'}/>
                    <InfoRow label="Scope" value={detail.scope || '-'}/>
                    <InfoRow label="Created" value={formatEpoch(detail.createdAt)}/>
                    <InfoRow label="IPv4/IPv6" value={`${detail.enableIpv4 ? 'on' : 'off'} / ${detail.enableIpv6 ? 'on' : 'off'}`}/>
                    <InfoRow label="Flags" value={networkFlags(detail).join(' / ') || '-'}/>
                    <InfoRow label="Config from" value={detail.configFrom || '-'}/>
                    <InfoRow label="IPAM" value={detail.ipam?.driver || '-'}/>
                </div>
                <NetworkMapBlock title="Labels" values={detail.labels}/>
                <NetworkMapBlock title="Options" values={detail.options}/>
                <NetworkIPAMBlock configs={detail.ipam?.configs || []}/>
                <div className="network-section">
                    <h2>Containers</h2>
                    <div className="network-endpoints">
                        {detail.containers.length ? detail.containers.map((endpoint) => (
                            <div className="network-endpoint" key={endpoint.endpointId || endpoint.containerId}>
                                <strong title={endpoint.name}>{endpoint.name}</strong>
                                <span>{endpoint.ipv4Address || '-'}</span>
                                <span>{endpoint.ipv6Address || '-'}</span>
                                <small>{endpoint.containerId.slice(0, 12)}</small>
                            </div>
                        )) : <span className="muted">-</span>}
                    </div>
                </div>
                {detail.services.length > 0 && (
                    <div className="network-section">
                        <h2>Services</h2>
                        <div className="network-endpoints">
                            {detail.services.map((service) => (
                                <div className="network-endpoint" key={service.id}>
                                    <strong title={service.id}>{service.id}</strong>
                                    <span>{service.vip || '-'}</span>
                                    <span>{service.ports.join(', ') || '-'}</span>
                                    <small>{service.taskCount} tasks</small>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="network-section">
                    <h2>JSON</h2>
                    <pre className="network-raw-json">{detail.rawJson || '{}'}</pre>
                </div>
            </div>
        </aside>
    );
}

function NetworkMapBlock({title, values}: { title: string; values: Record<string, string> }) {
    const entries = Object.entries(values || {});
    return (
        <div className="network-section">
            <h2>{title}</h2>
            <div className="network-map-list">
                {entries.length ? entries.map(([key, value]) => (
                    <div className="parameter-row" key={key}>
                        <span title={key}>{key}</span>
                        <strong title={value}>{value}</strong>
                    </div>
                )) : <span className="muted">-</span>}
            </div>
        </div>
    );
}

function NetworkIPAMBlock({configs}: { configs: NetworkIPAMConfig[] }) {
    return (
        <div className="network-section">
            <h2>IPAM configs</h2>
            <div className="network-map-list">
                {configs.length ? configs.map((config, index) => (
                    <div className="parameter-row" key={index}>
                        <span>{config.subnet || '-'}</span>
                        <strong>{[config.ipRange, config.gateway].filter(Boolean).join(' / ') || '-'}</strong>
                    </div>
                )) : <span className="muted">-</span>}
            </div>
        </div>
    );
}

function SettingsView(props: {
    status: AppStatus | null;
    contexts: DockerContext[];
    form: DockerContextForm | null;
    setForm: (form: DockerContextForm | null) => void;
    busyKey: string;
    exitingRows: Set<string>;
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
                            <div className={`context-maintenance-row ${context.current ? 'active' : ''} ${props.exitingRows.has(removableRowKey('context', context.id)) ? 'removing' : ''}`} key={context.id}>
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

                </div>
            </div>

            {form && (
                <Modal
                    title={form.id ? '编辑 Context' : '新增 Context'}
                    description={form.id ? form.name : 'Docker 连接'}
                    className="context-editor-dialog"
                    onClose={() => setForm(null)}
                    footer={(close) => (
                        <>
                            <button className="dialog-button" onClick={close} type="button">取消</button>
                            <button className="dialog-button confirm" onClick={props.onSave} disabled={props.busyKey === 'context-save'} type="button">
                                {props.busyKey === 'context-save' ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>}
                                保存
                            </button>
                        </>
                    )}
                >
                    <div className="network-form-grid context-editor-form">
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
                    </div>
                </Modal>
            )}
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

function PullTaskRow({task, busy, onCancel}: {
    task: PullTaskState;
    busy: boolean;
    onCancel: () => void;
}) {
    const downloadingRatio = ratio(task.downloadingCurrent, task.downloadingTotal);
    const extractingRatio = ratio(task.extractingCurrent, task.extractingTotal);
    const totalRatio = overallPullRatio(task);
    const statusLabel = pullTaskStatusLabel(task);
    const statusTone = pullStatusTone(task);

    const downloadBytes = formatBytes(task.downloadingCurrent);
    const downloadTotalBytes = formatBytes(task.downloadingTotal);
    const extractBytes = formatBytes(task.extractingCurrent);
    const extractTotalBytes = formatBytes(task.extractingTotal);

    const showCancelButton = !task.done && !task.cancelled;
    const showCloseButton = task.error || task.cancelled;

    return (
        <div className={`pull-task ${task.error ? 'error' : task.done ? 'done' : ''} ${task.removing ? 'removing' : ''}`}>
            <div className="pull-task-header">
                <div className="pull-task-info">
                    <div className="pull-task-title">
                        <Box size={14}/>
                        <strong title={task.reference}>{task.reference}</strong>
                    </div>
                    <span className={`pull-status-badge ${statusTone}`}>{statusLabel}</span>
                </div>
                <div className="pull-task-actions">
                    <span className="pull-overall-progress">{Math.round(totalRatio * 100)}%</span>
                    {showCancelButton && (
                        <button className="pull-cancel-button" onClick={onCancel} disabled={busy} type="button" title="取消拉取">
                            {busy ? <LoaderCircle size={14} className="spin"/> : <X size={14}/>}
                        </button>
                    )}
                    {showCloseButton && (
                        <button className="pull-close-button" onClick={onCancel} type="button" title="关闭">
                            <X size={14}/>
                        </button>
                    )}
                </div>
            </div>

            <div className="pull-progress-container">
                <div className="pull-progress-bar download-bar">
                    <div className="progress-label">
                        <span className="label-text">Downloading</span>
                        <span className="label-value">{downloadBytes} / {downloadTotalBytes}</span>
                        <span className="label-percent">{Math.round(downloadingRatio * 100)}%</span>
                    </div>
                    <div className="progress-track">
                        <div
                            className="progress-fill download-fill"
                            style={{width: `${downloadingRatio * 100}%`}}
                        >
                            <div className="progress-glow"/>
                        </div>
                    </div>
                </div>

                <div className="pull-progress-bar extract-bar">
                    <div className="progress-label">
                        <span className="label-text">Extracting</span>
                        <span className="label-value">{extractBytes} / {extractTotalBytes}</span>
                        <span className="label-percent">{Math.round(extractingRatio * 100)}%</span>
                    </div>
                    <div className="progress-track">
                        <div
                            className="progress-fill extract-fill"
                            style={{width: `${extractingRatio * 100}%`}}
                        >
                            <div className="progress-glow"/>
                        </div>
                    </div>
                </div>
            </div>

            {task.error && (
                <div className="pull-task-error">
                    <CircleAlert size={12}/>
                    <span>{task.error}</span>
                </div>
            )}
        </div>
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

function ActionButton({title, icon, onClick, busy, danger, disabled}: {
    title: string;
    icon: React.ReactNode;
    onClick: () => void;
    busy?: boolean;
    danger?: boolean;
    disabled?: boolean;
}) {
    return (
        <button className={`action-button ${danger ? 'danger' : ''}`} onClick={onClick} disabled={busy || disabled} type="button" title={title}>
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

function SkeletonRows({count, className}: { count: number; className?: string }) {
    return (
        <div className={`skeleton-list ${className || ''}`}>
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

function updatePullTasks(current: Record<string, PullTaskState>, event: PullProgressEvent) {
    const subscriptionId = event.subscriptionId;
    if (!subscriptionId) {
        return current;
    }
    const previous = current[subscriptionId] || {
        subscriptionId,
        reference: event.reference || '未知镜像',
        phase: 'pending' as PullPhase,
        layerProgress: {},
        downloadingCurrent: 0,
        downloadingTotal: 0,
        extractingCurrent: 0,
        extractingTotal: 0,
        completedCurrent: 0,
        completedTotal: 0,
        error: '',
        done: false,
        cancelled: false,
        removing: false,
        updatedAt: 0,
    };
    const next = {
        ...previous,
        layerProgress: {...previous.layerProgress},
        reference: event.reference || previous.reference,
        updatedAt: Date.now(),
    };

    const status = normalizePullStatus(event.status);

    // 处理层级进度
    if (event.id) {
        const layer = next.layerProgress[event.id] || {
            downloadCurrent: 0,
            downloadTotal: 0,
            downloadDone: false,
            extractCurrent: 0,
            extractTotal: 0,
            extractDone: false,
        };
        if (status === 'downloading') {
            layer.downloadCurrent = Math.max(event.current || 0, layer.downloadCurrent, 0);
            layer.downloadTotal = Math.max(event.total || 0, layer.downloadTotal, 0);
        } else if (status === 'extracting') {
            layer.downloadDone = true;
            if (layer.downloadTotal > 0) {
                layer.downloadCurrent = layer.downloadTotal;
            }
            layer.extractCurrent = Math.max(event.current || 0, layer.extractCurrent, 0);
            layer.extractTotal = Math.max(event.total || 0, layer.extractTotal, 0);
            // 关键修复：如果 extractTotal 为 0，使用 downloadTotal 作为 extractTotal
            // 因为解压的总大小通常等于下载的大小
            if (layer.extractTotal === 0 && layer.downloadTotal > 0) {
                layer.extractTotal = layer.downloadTotal;
            }
        } else if (status === 'complete') {
            layer.downloadDone = true;
            layer.extractDone = true;
            if (layer.downloadTotal > 0) {
                layer.downloadCurrent = layer.downloadTotal;
            }
            if (layer.extractTotal > 0) {
                layer.extractCurrent = layer.extractTotal;
            } else if (layer.downloadTotal > 0) {
                // 如果 extractTotal 仍为 0，使用 downloadTotal
                layer.extractTotal = layer.downloadTotal;
                layer.extractCurrent = layer.downloadTotal;
            }
        }
        next.layerProgress[event.id] = layer;
        const summary = summarizePullLayers(next.layerProgress);
        next.downloadingCurrent = summary.downloadingCurrent;
        next.downloadingTotal = summary.downloadingTotal;
        next.extractingCurrent = summary.extractingCurrent;
        next.extractingTotal = summary.extractingTotal;
    }

    // 更新阶段状态 - 根据聚合进度决定，而不是单个事件
    // 这样可以避免当某些层在下载、某些层在解压时产生的状态抖动
    const hasDownloadingLayers = Object.values(next.layerProgress).some(l => !l.downloadDone);
    const hasExtractingLayers = Object.values(next.layerProgress).some(l => l.downloadDone && !l.extractDone);
    const allLayersComplete = Object.values(next.layerProgress).length > 0 &&
                               Object.values(next.layerProgress).every(l => l.extractDone);

    // 只在明确的非层级状态时更新
    if (status === 'resolving') {
        next.phase = 'resolving';
    } else if (status === 'pulling_manifest') {
        next.phase = 'pulling_manifest';
    } else if (status === 'verifying_download') {
        next.phase = 'verifying_download';
    } else if (status === 'verifying_extract') {
        next.phase = 'verifying_extract';
    } else if (status === 'finalizing') {
        next.phase = 'finalizing';
    } else if (status === 'complete') {
        next.phase = next.done ? 'complete' : 'finalizing';
        next.completedCurrent += 1;
        next.completedTotal = Math.max(next.completedTotal, next.completedCurrent);
    } else if (status === 'cancelled') {
        next.phase = 'cancelled';
        next.cancelled = true;
    } else if (status === 'connecting') {
        next.phase = 'connecting';
    } else if (status === 'pending') {
        next.phase = previous.phase === 'pending' || previous.phase === 'connecting' ? previous.phase : 'pending';
    } else if (status === 'downloading' || status === 'extracting') {
        // 对于 downloading 和 extracting，使用聚合状态判断
        // 优先级：extracting > downloading
        if (hasExtractingLayers) {
            next.phase = 'extracting';
        } else if (hasDownloadingLayers) {
            next.phase = 'downloading';
        } else if (allLayersComplete) {
            next.phase = 'verifying_extract';
        }
    }

    if (event.error) {
        next.error = event.error;
        next.done = true;
        next.phase = 'failed';
    }

    if (event.done) {
        next.done = true;
        if (status === 'cancelled') {
            next.cancelled = true;
            next.phase = 'cancelled';
        } else if (!next.error) {
            next.phase = 'complete';
            next.completedTotal = Math.max(next.completedTotal, next.completedCurrent, 1);
            next.completedCurrent = next.completedTotal;
        }
    }

    return {
        ...current,
        [subscriptionId]: next,
    };
}

function summarizePullLayers(layerProgress: Record<string, {
    downloadCurrent: number;
    downloadTotal: number;
    downloadDone: boolean;
    extractCurrent: number;
    extractTotal: number;
    extractDone: boolean;
}>) {
    let downloadingCurrent = 0;
    let downloadingTotal = 0;
    let extractingCurrent = 0;
    let extractingTotal = 0;
    for (const layer of Object.values(layerProgress)) {
        if (layer.downloadTotal > 0) {
            downloadingCurrent += Math.min(layer.downloadCurrent, layer.downloadTotal);
            downloadingTotal += layer.downloadTotal;
        }
        if (layer.extractTotal > 0) {
            extractingCurrent += Math.min(layer.extractCurrent, layer.extractTotal);
            extractingTotal += layer.extractTotal;
        }
    }
    return {downloadingCurrent, downloadingTotal, extractingCurrent, extractingTotal};
}

function normalizePullStatus(status: string): PullPhase | string {
    const value = status.trim().toLowerCase();
    if (!value) {
        return 'pending';
    }

    // 完成状态
    if (value.includes('pull complete') || value.includes('already exists') || value === '镜像拉取完成') {
        return 'complete';
    }

    // 下载相关
    if (value.includes('downloading')) {
        return 'downloading';
    }
    if (value.includes('download complete') || value.includes('downloaded')) {
        return 'verifying_download';
    }

    // 解压相关
    if (value.includes('extracting')) {
        return 'extracting';
    }
    if (value.includes('extract complete') || value.includes('extracted')) {
        return 'verifying_extract';
    }

    // 验证相关
    if (value.includes('verifying') || value.includes('checking')) {
        if (value.includes('download')) {
            return 'verifying_download';
        }
        if (value.includes('extract')) {
            return 'verifying_extract';
        }
        return 'verifying_extract';
    }

    // Manifest 相关
    if (value.includes('pulling') && (value.includes('manifest') || value.includes('fs layer'))) {
        return 'pulling_manifest';
    }

    // 解析相关
    if (value.includes('resolving') || value.includes('resolve')) {
        return 'resolving';
    }

    // 连接相关
    if (value.includes('connecting') || value.includes('waiting')) {
        return 'connecting';
    }

    // 等待和排队
    if (value.includes('waiting') || value.includes('queued') || value.includes('pending')) {
        return 'pending';
    }

    // 取消状态
    if (value.includes('cancelled') || value.includes('canceled')) {
        return 'cancelled';
    }

    // 最终处理
    if (value.includes('finalizing') || value.includes('finishing')) {
        return 'finalizing';
    }

    // 失败状态
    if (value.includes('failed') || value.includes('error')) {
        return 'failed';
    }

    return value;
}

function overallPullRatio(task: PullTaskState) {
    const download = ratio(task.downloadingCurrent, task.downloadingTotal);
    const extract = ratio(task.extractingCurrent, task.extractingTotal);
    if (task.done && !task.error && !task.cancelled) {
        return 1;
    }
    if (extract > 0) {
        return extract;
    }
    if (download > 0) {
        return download;
    }
    return 0.06;
}

function pullStatusTone(task: PullTaskState): string {
    if (task.error || task.phase === 'failed') {
        return 'error';
    }
    if (task.cancelled || task.phase === 'cancelled') {
        return 'cancelled';
    }
    if (task.done || task.phase === 'complete') {
        return 'done';
    }
    if (task.phase === 'pending' || task.phase === 'connecting') {
        return 'pending';
    }
    if (task.phase === 'resolving' || task.phase === 'pulling_manifest') {
        return 'resolving';
    }
    if (task.phase === 'downloading') {
        return 'downloading';
    }
    if (task.phase === 'verifying_download') {
        return 'verifying-download';
    }
    if (task.phase === 'extracting') {
        return 'extracting';
    }
    if (task.phase === 'verifying_extract') {
        return 'verifying-extract';
    }
    if (task.phase === 'finalizing') {
        return 'finalizing';
    }
    return 'pending';
}

function pullTaskStatusLabel(task: PullTaskState): string {
    if (task.error || task.phase === 'failed') {
        return '拉取失败';
    }
    if (task.cancelled || task.phase === 'cancelled') {
        return '已取消';
    }
    if (task.done || task.phase === 'complete') {
        return '拉取完成';
    }
    if (task.phase === 'pending') {
        return '等待中';
    }
    if (task.phase === 'connecting') {
        return '连接中';
    }
    if (task.phase === 'resolving') {
        return '解析镜像';
    }
    if (task.phase === 'pulling_manifest') {
        return '拉取清单';
    }
    if (task.phase === 'downloading') {
        return '下载中';
    }
    if (task.phase === 'verifying_download') {
        return '验证下载';
    }
    if (task.phase === 'extracting') {
        return '解压中';
    }
    if (task.phase === 'verifying_extract') {
        return '验证解压';
    }
    if (task.phase === 'finalizing') {
        return '最终处理';
    }
    return '处理中';
}

function formatPullProgress(current: number, total: number) {
    if (total <= 0) {
        return '--';
    }
    return `${Math.round(ratio(current, total) * 100)}%`;
}

function ratio(current: number, total: number) {
    if (!total || total <= 0) {
        return 0;
    }
    return Math.min(Math.max(current / total, 0), 1);
}

function dockerServerInfoRows(status: AppStatus | null) {
    const params = status?.docker.parameters || [];
    const value = (...keys: string[]) => dockerParameterValue(params, keys);
    return SERVER_INFO_FIELDS.map((field) => ({label: field.label, value: field.resolve(status, value)}));
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

function sortContainersForEntry(containers: ContainerSummary[]) {
    return containers
        .map((container, index) => ({container, index}))
        .sort((left, right) => {
            const stateOrder = containerStateOrder(left.container) - containerStateOrder(right.container);
            if (stateOrder !== 0) {
                return stateOrder;
            }
            const timeOrder = containerEntrySortTime(left.container) - containerEntrySortTime(right.container);
            if (timeOrder !== 0) {
                return timeOrder;
            }
            return left.index - right.index;
        })
        .map(({container}) => container);
}

function preserveContainerOrder(current: ContainerSummary[], incoming: ContainerSummary[]) {
    const incomingById = new Map(incoming.map((container) => [container.id, container]));
    const ordered: ContainerSummary[] = [];
    for (const container of current) {
        const nextContainer = incomingById.get(container.id);
        if (nextContainer) {
            ordered.push(nextContainer);
            incomingById.delete(container.id);
        }
    }
    return [...ordered, ...incoming.filter((container) => incomingById.has(container.id))];
}

function containerStateOrder(container: ContainerSummary) {
    return container.state === 'running' ? 0 : 1;
}

function containerEntrySortTime(container: ContainerSummary) {
    const primaryTime = container.state === 'running' ? container.startedAt : container.finishedAt;
    return positiveEpoch(primaryTime) || positiveEpoch(container.createdAt) || Number.MAX_SAFE_INTEGER;
}

function positiveEpoch(value: number) {
    return Number.isFinite(value) && value > 0 ? value : 0;
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

function filterNetworks(networks: NetworkInfo[], search: string) {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
        return networks;
    }
    return networks.filter((item) => [
        item.id,
        item.name,
        item.driver,
        item.scope,
        ...Object.keys(item.labels || {}),
        ...Object.values(item.labels || {}),
    ].some((field) => field?.toLowerCase().includes(keyword)));
}

function emptyNetworkCreateForm(): NetworkCreateForm {
    return {
        name: '',
        driver: 'bridge',
        scope: '',
        enableIpv4: 'default',
        enableIpv6: 'default',
        internal: false,
        attachable: false,
        ingress: false,
        configOnly: false,
        configFrom: '',
        options: [],
        labels: [],
        ipamDriver: '',
        ipamOptions: [],
        ipamConfigs: [],
    };
}

function emptyNetworkIPAMConfig(): NetworkIPAMConfig {
    return {
        subnet: '',
        ipRange: '',
        gateway: '',
        auxAddresses: [],
    };
}

function emptyNetworkConnectForm(networkId: string): NetworkConnectForm {
    return {
        networkId,
        containerId: '',
        aliases: '',
        links: '',
        ipv4Address: '',
        ipv6Address: '',
        linkLocalIps: '',
        driverOptions: [],
        gwPriority: '',
    };
}

function emptyNetworkDisconnectForm(networkId: string): NetworkDisconnectForm {
    return {
        networkId,
        containerId: '',
        force: false,
    };
}

function emptyNetworkPruneForm(): NetworkPruneForm {
    return {
        filters: [],
    };
}

function emptyImageRunPort(): ImageRunPort {
    return {
        containerPort: '',
        protocol: 'tcp',
        hostIp: '',
        hostPort: '',
        publish: false,
    };
}

function imageRunFormFromConfig(config: ImageRunConfig): ImageRunForm {
    return {
        image: config.reference || config.repoTags?.[0] || config.repoDigests?.[0] || config.id,
        name: '',
        entrypoint: joinRunArgs(config.entrypoint),
        command: joinRunArgs(config.command),
        env: (config.env || []).map((item) => ({key: item.key, value: item.value})),
        workingDir: config.workingDir || '',
        user: config.user || '',
        ports: (config.exposedPorts || []).map((port) => ({
            containerPort: port.containerPort,
            protocol: port.protocol || 'tcp',
            hostIp: '',
            hostPort: '',
            publish: false,
        })),
        network: '',
        restartPolicy: 'no',
        restartMaxRetries: '',
        autoRemove: false,
    };
}

function normalizeImageRunRequest(form: ImageRunForm): ImageRunRequest {
    const retries = Number.parseInt(form.restartMaxRetries, 10);
    return {
        image: form.image.trim(),
        name: form.name.trim(),
        entrypoint: splitRunArgs(form.entrypoint),
        command: splitRunArgs(form.command),
        env: cleanImageRunEnv(form.env),
        workingDir: form.workingDir.trim(),
        user: form.user.trim(),
        ports: cleanImageRunPorts(form.ports),
        network: form.network.trim(),
        restartPolicy: form.autoRemove ? 'no' : (form.restartPolicy || 'no'),
        restartMaxRetries: Number.isFinite(retries) ? retries : 0,
        autoRemove: form.autoRemove,
    };
}

function cleanImageRunEnv(items: ImageRunEnv[]) {
    return items
        .map((item) => ({key: item.key.trim(), value: item.value}))
        .filter((item) => item.key || item.value.trim());
}

function cleanImageRunPorts(items: ImageRunPort[]) {
    return items
        .map((item) => ({
            containerPort: item.containerPort.trim(),
            protocol: (item.protocol || 'tcp').trim(),
            hostIp: item.hostIp.trim(),
            hostPort: item.hostPort.trim(),
            publish: item.publish,
        }))
        .filter((item) => item.containerPort || item.hostIp || item.hostPort || item.publish);
}

function joinRunArgs(items: string[]) {
    return (items || []).join('\n');
}

function splitRunArgs(value: string) {
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function imageRunNetworkOptions(networks: NetworkInfo[]) {
    const values = new Set(['bridge', 'host', 'none']);
    networks
        .map((network) => network.name)
        .filter(Boolean)
        .forEach((name) => values.add(name));
    return Array.from(values);
}

function normalizeNetworkCreateRequest(form: NetworkCreateForm): NetworkCreateRequest {
    return {
        ...form,
        name: form.name.trim(),
        driver: form.driver.trim(),
        scope: form.scope.trim(),
        configFrom: form.configFrom.trim(),
        options: cleanKeyValues(form.options),
        labels: cleanKeyValues(form.labels),
        ipamDriver: form.ipamDriver.trim(),
        ipamOptions: cleanKeyValues(form.ipamOptions),
        ipamConfigs: form.ipamConfigs
            .map((config) => ({
                subnet: config.subnet.trim(),
                ipRange: config.ipRange.trim(),
                gateway: config.gateway.trim(),
                auxAddresses: cleanKeyValues(config.auxAddresses),
            }))
            .filter((config) => Boolean(config.subnet || config.ipRange || config.gateway || config.auxAddresses.length)),
    };
}

function networkConnectRequestFromForm(form: NetworkConnectForm): NetworkConnectRequest {
    const parsedPriority = Number(form.gwPriority);
    return {
        networkId: form.networkId,
        containerId: form.containerId,
        aliases: splitList(form.aliases),
        links: splitList(form.links),
        ipv4Address: form.ipv4Address.trim(),
        ipv6Address: form.ipv6Address.trim(),
        linkLocalIps: splitList(form.linkLocalIps),
        driverOptions: cleanKeyValues(form.driverOptions),
        gwPriority: Number.isFinite(parsedPriority) ? parsedPriority : 0,
    };
}

function cleanKeyValues(items: NetworkKeyValue[]) {
    return items
        .map((item) => ({key: item.key.trim(), value: item.value.trim()}))
        .filter((item) => item.key || item.value);
}

function splitList(value: string) {
    return value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function protectedNetwork(network: NetworkInfo) {
    return ['bridge', 'host', 'none'].includes(network.name);
}

function networkFlags(network: Pick<NetworkInfo, 'internal' | 'attachable' | 'ingress' | 'configOnly' | 'enableIpv4' | 'enableIpv6'>) {
    const flags: string[] = [];
    if (network.internal) {
        flags.push('internal');
    }
    if (network.attachable) {
        flags.push('attachable');
    }
    if (network.ingress) {
        flags.push('ingress');
    }
    if (network.configOnly) {
        flags.push('config-only');
    }
    if (network.enableIpv6) {
        flags.push('ipv6');
    }
    if (!network.enableIpv4) {
        flags.push('no-ipv4');
    }
    return flags;
}

function connectedContainersForNetwork(containers: ContainerSummary[], networkName: string) {
    if (!networkName) {
        return [];
    }
    return containers.filter((container) => container.networks?.includes(networkName));
}

async function closeLogPanel(subscriptionId: string) {
    if (subscriptionId) {
        await StopLogStream(subscriptionId);
    }
}

function imageLabel(image: ImageSummary) {
    return image.repoTags?.find((tag) => tag !== '<none>:<none>') || image.repoDigests?.[0] || image.shortId;
}

function imageReferenceForRun(image: ImageSummary) {
    return image.repoTags?.find((tag) => tag !== '<none>:<none>') || image.repoDigests?.[0] || image.id || image.shortId;
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

function groupRecentActions(actions: RecentAction[]) {
    const groups = new Map<string, {key: string; label: string; actions: RecentAction[]}>();
    actions.forEach((action) => {
        const date = new Date(action.createdAt);
        const key = Number.isNaN(date.getTime()) ? 'unknown' : localDateKey(date);
        const group = groups.get(key);
        if (group) {
            group.actions.push(action);
            return;
        }
        groups.set(key, {
            key,
            label: key === 'unknown' ? '日期未知' : recentActionDateLabel(date),
            actions: [action],
        });
    });
    return Array.from(groups.values());
}

function localDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function recentActionDateLabel(date: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const dayDistance = Math.round((today.getTime() - target.getTime()) / 86_400_000);
    if (dayDistance === 0) {
        return '今天';
    }
    if (dayDistance === 1) {
        return '昨天';
    }
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
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
