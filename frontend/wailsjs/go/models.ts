export namespace core {
	
	export class ActionResultDTO {
	    ok: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ActionResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	    }
	}
	export class AddComposeProjectRequestDTO {
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new AddComposeProjectRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	    }
	}
	export class RecentActionDTO {
	    id: string;
	    kind: string;
	    target: string;
	    status: string;
	    message: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentActionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.target = source["target"];
	        this.status = source["status"];
	        this.message = source["message"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class DockerContextDTO {
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
	
	    static createFrom(source: any = {}) {
	        return new DockerContextDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.source = source["source"];
	        this.host = source["host"];
	        this.normalizedHost = source["normalizedHost"];
	        this.bridgeType = source["bridgeType"];
	        this.connectionStatus = source["connectionStatus"];
	        this.connectionError = source["connectionError"];
	        this.lastCheckedAt = source["lastCheckedAt"];
	        this.caPath = source["caPath"];
	        this.certPath = source["certPath"];
	        this.keyPath = source["keyPath"];
	        this.sshKeyPath = source["sshKeyPath"];
	        this.skipTlsVerify = source["skipTlsVerify"];
	        this.current = source["current"];
	        this.readOnly = source["readOnly"];
	        this.importable = source["importable"];
	        this.error = source["error"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ComposeStatusDTO {
	    available: boolean;
	    version: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ComposeStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.version = source["version"];
	        this.error = source["error"];
	    }
	}
	export class DockerParameterDTO {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new DockerParameterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class DockerStatusDTO {
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
	    parameters: DockerParameterDTO[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new DockerStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.host = source["host"];
	        this.contextId = source["contextId"];
	        this.contextName = source["contextName"];
	        this.serverVersion = source["serverVersion"];
	        this.apiVersion = source["apiVersion"];
	        this.os = source["os"];
	        this.architecture = source["architecture"];
	        this.containers = source["containers"];
	        this.images = source["images"];
	        this.parameters = this.convertValues(source["parameters"], DockerParameterDTO);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppStatusDTO {
	    docker: DockerStatusDTO;
	    compose: ComposeStatusDTO;
	    activeContext: DockerContextDTO;
	    databasePath: string;
	    appDataPath: string;
	    platform: string;
	    goVersion: string;
	    recentActions: RecentActionDTO[];
	
	    static createFrom(source: any = {}) {
	        return new AppStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.docker = this.convertValues(source["docker"], DockerStatusDTO);
	        this.compose = this.convertValues(source["compose"], ComposeStatusDTO);
	        this.activeContext = this.convertValues(source["activeContext"], DockerContextDTO);
	        this.databasePath = source["databasePath"];
	        this.appDataPath = source["appDataPath"];
	        this.platform = source["platform"];
	        this.goVersion = source["goVersion"];
	        this.recentActions = this.convertValues(source["recentActions"], RecentActionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ComposeServiceDTO {
	    name: string;
	    state: string;
	    container: string;
	    image: string;
	
	    static createFrom(source: any = {}) {
	        return new ComposeServiceDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.state = source["state"];
	        this.container = source["container"];
	        this.image = source["image"];
	    }
	}
	export class ComposeProjectDTO {
	    id: string;
	    name: string;
	    path: string;
	    config: string;
	    status: string;
	    services: ComposeServiceDTO[];
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ComposeProjectDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.config = source["config"];
	        this.status = source["status"];
	        this.services = this.convertValues(source["services"], ComposeServiceDTO);
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class ContainerQueryDTO {
	    search: string;
	    all: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ContainerQueryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.search = source["search"];
	        this.all = source["all"];
	    }
	}
	export class ContainerSummaryDTO {
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
	
	    static createFrom(source: any = {}) {
	        return new ContainerSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.shortId = source["shortId"];
	        this.name = source["name"];
	        this.image = source["image"];
	        this.command = source["command"];
	        this.state = source["state"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.ports = source["ports"];
	        this.networks = source["networks"];
	        this.compose = source["compose"];
	    }
	}
	
	export class DockerContextProbeDTO {
	    ok: boolean;
	    message: string;
	    bridgeType: string;
	    serverVersion: string;
	    apiVersion: string;
	    os: string;
	    architecture: string;
	
	    static createFrom(source: any = {}) {
	        return new DockerContextProbeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	        this.bridgeType = source["bridgeType"];
	        this.serverVersion = source["serverVersion"];
	        this.apiVersion = source["apiVersion"];
	        this.os = source["os"];
	        this.architecture = source["architecture"];
	    }
	}
	
	
	export class ImagePullRequestDTO {
	    reference: string;
	
	    static createFrom(source: any = {}) {
	        return new ImagePullRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reference = source["reference"];
	    }
	}
	export class ImageQueryDTO {
	    search: string;
	
	    static createFrom(source: any = {}) {
	        return new ImageQueryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.search = source["search"];
	    }
	}
	export class ImageRunPortDTO {
	    containerPort: string;
	    protocol: string;
	    hostIp: string;
	    hostPort: string;
	    publish: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImageRunPortDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.containerPort = source["containerPort"];
	        this.protocol = source["protocol"];
	        this.hostIp = source["hostIp"];
	        this.hostPort = source["hostPort"];
	        this.publish = source["publish"];
	    }
	}
	export class ImageRunEnvDTO {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new ImageRunEnvDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class ImageRunConfigDTO {
	    id: string;
	    reference: string;
	    repoTags: string[];
	    repoDigests: string[];
	    entrypoint: string[];
	    command: string[];
	    env: ImageRunEnvDTO[];
	    workingDir: string;
	    user: string;
	    exposedPorts: ImageRunPortDTO[];
	    volumes: string[];
	    os: string;
	    architecture: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new ImageRunConfigDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.reference = source["reference"];
	        this.repoTags = source["repoTags"];
	        this.repoDigests = source["repoDigests"];
	        this.entrypoint = source["entrypoint"];
	        this.command = source["command"];
	        this.env = this.convertValues(source["env"], ImageRunEnvDTO);
	        this.workingDir = source["workingDir"];
	        this.user = source["user"];
	        this.exposedPorts = this.convertValues(source["exposedPorts"], ImageRunPortDTO);
	        this.volumes = source["volumes"];
	        this.os = source["os"];
	        this.architecture = source["architecture"];
	        this.size = source["size"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class ImageRunRequestDTO {
	    image: string;
	    name: string;
	    entrypoint: string[];
	    command: string[];
	    env: ImageRunEnvDTO[];
	    workingDir: string;
	    user: string;
	    ports: ImageRunPortDTO[];
	    network: string;
	    restartPolicy: string;
	    restartMaxRetries: number;
	    autoRemove: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImageRunRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.image = source["image"];
	        this.name = source["name"];
	        this.entrypoint = source["entrypoint"];
	        this.command = source["command"];
	        this.env = this.convertValues(source["env"], ImageRunEnvDTO);
	        this.workingDir = source["workingDir"];
	        this.user = source["user"];
	        this.ports = this.convertValues(source["ports"], ImageRunPortDTO);
	        this.network = source["network"];
	        this.restartPolicy = source["restartPolicy"];
	        this.restartMaxRetries = source["restartMaxRetries"];
	        this.autoRemove = source["autoRemove"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImageSummaryDTO {
	    id: string;
	    shortId: string;
	    repoTags: string[];
	    repoDigests: string[];
	    size: number;
	    createdAt: number;
	    containers: number;
	
	    static createFrom(source: any = {}) {
	        return new ImageSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.shortId = source["shortId"];
	        this.repoTags = source["repoTags"];
	        this.repoDigests = source["repoDigests"];
	        this.size = source["size"];
	        this.createdAt = source["createdAt"];
	        this.containers = source["containers"];
	    }
	}
	export class LogStreamRequestDTO {
	    id: string;
	    tail: number;
	    follow: boolean;
	    service: string;
	
	    static createFrom(source: any = {}) {
	        return new LogStreamRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.tail = source["tail"];
	        this.follow = source["follow"];
	        this.service = source["service"];
	    }
	}
	export class NetworkKeyValueDTO {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkKeyValueDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class NetworkConnectRequestDTO {
	    networkId: string;
	    containerId: string;
	    aliases: string[];
	    links: string[];
	    ipv4Address: string;
	    ipv6Address: string;
	    linkLocalIps: string[];
	    driverOptions: NetworkKeyValueDTO[];
	    gwPriority: number;
	
	    static createFrom(source: any = {}) {
	        return new NetworkConnectRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.networkId = source["networkId"];
	        this.containerId = source["containerId"];
	        this.aliases = source["aliases"];
	        this.links = source["links"];
	        this.ipv4Address = source["ipv4Address"];
	        this.ipv6Address = source["ipv6Address"];
	        this.linkLocalIps = source["linkLocalIps"];
	        this.driverOptions = this.convertValues(source["driverOptions"], NetworkKeyValueDTO);
	        this.gwPriority = source["gwPriority"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NetworkIPAMConfigDTO {
	    subnet: string;
	    ipRange: string;
	    gateway: string;
	    auxAddresses: NetworkKeyValueDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NetworkIPAMConfigDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subnet = source["subnet"];
	        this.ipRange = source["ipRange"];
	        this.gateway = source["gateway"];
	        this.auxAddresses = this.convertValues(source["auxAddresses"], NetworkKeyValueDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NetworkCreateRequestDTO {
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
	    options: NetworkKeyValueDTO[];
	    labels: NetworkKeyValueDTO[];
	    ipamDriver: string;
	    ipamOptions: NetworkKeyValueDTO[];
	    ipamConfigs: NetworkIPAMConfigDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NetworkCreateRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.scope = source["scope"];
	        this.enableIpv4 = source["enableIpv4"];
	        this.enableIpv6 = source["enableIpv6"];
	        this.internal = source["internal"];
	        this.attachable = source["attachable"];
	        this.ingress = source["ingress"];
	        this.configOnly = source["configOnly"];
	        this.configFrom = source["configFrom"];
	        this.options = this.convertValues(source["options"], NetworkKeyValueDTO);
	        this.labels = this.convertValues(source["labels"], NetworkKeyValueDTO);
	        this.ipamDriver = source["ipamDriver"];
	        this.ipamOptions = this.convertValues(source["ipamOptions"], NetworkKeyValueDTO);
	        this.ipamConfigs = this.convertValues(source["ipamConfigs"], NetworkIPAMConfigDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NetworkDTO {
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
	
	    static createFrom(source: any = {}) {
	        return new NetworkDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.scope = source["scope"];
	        this.createdAt = source["createdAt"];
	        this.internal = source["internal"];
	        this.attachable = source["attachable"];
	        this.ingress = source["ingress"];
	        this.configOnly = source["configOnly"];
	        this.enableIpv4 = source["enableIpv4"];
	        this.enableIpv6 = source["enableIpv6"];
	        this.labels = source["labels"];
	        this.options = source["options"];
	    }
	}
	export class NetworkDisconnectRequestDTO {
	    networkId: string;
	    containerId: string;
	    force: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NetworkDisconnectRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.networkId = source["networkId"];
	        this.containerId = source["containerId"];
	        this.force = source["force"];
	    }
	}
	export class NetworkEndpointDTO {
	    containerId: string;
	    name: string;
	    endpointId: string;
	    macAddress: string;
	    ipv4Address: string;
	    ipv6Address: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkEndpointDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.containerId = source["containerId"];
	        this.name = source["name"];
	        this.endpointId = source["endpointId"];
	        this.macAddress = source["macAddress"];
	        this.ipv4Address = source["ipv4Address"];
	        this.ipv6Address = source["ipv6Address"];
	    }
	}
	
	export class NetworkIPAMDTO {
	    driver: string;
	    options: Record<string, string>;
	    configs: NetworkIPAMConfigDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NetworkIPAMDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.driver = source["driver"];
	        this.options = source["options"];
	        this.configs = this.convertValues(source["configs"], NetworkIPAMConfigDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NetworkServiceDTO {
	    id: string;
	    vip: string;
	    ports: string[];
	    localLbIndex: number;
	    taskCount: number;
	
	    static createFrom(source: any = {}) {
	        return new NetworkServiceDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.vip = source["vip"];
	        this.ports = source["ports"];
	        this.localLbIndex = source["localLbIndex"];
	        this.taskCount = source["taskCount"];
	    }
	}
	export class NetworkInspectDTO {
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
	    configFrom: string;
	    ipam: NetworkIPAMDTO;
	    options: Record<string, string>;
	    labels: Record<string, string>;
	    containers: NetworkEndpointDTO[];
	    services: NetworkServiceDTO[];
	    rawJson: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkInspectDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.scope = source["scope"];
	        this.createdAt = source["createdAt"];
	        this.internal = source["internal"];
	        this.attachable = source["attachable"];
	        this.ingress = source["ingress"];
	        this.configOnly = source["configOnly"];
	        this.enableIpv4 = source["enableIpv4"];
	        this.enableIpv6 = source["enableIpv6"];
	        this.configFrom = source["configFrom"];
	        this.ipam = this.convertValues(source["ipam"], NetworkIPAMDTO);
	        this.options = source["options"];
	        this.labels = source["labels"];
	        this.containers = this.convertValues(source["containers"], NetworkEndpointDTO);
	        this.services = this.convertValues(source["services"], NetworkServiceDTO);
	        this.rawJson = source["rawJson"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NetworkInspectRequestDTO {
	    id: string;
	    scope: string;
	    verbose: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NetworkInspectRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scope = source["scope"];
	        this.verbose = source["verbose"];
	    }
	}
	
	export class NetworkPruneRequestDTO {
	    filters: NetworkKeyValueDTO[];
	
	    static createFrom(source: any = {}) {
	        return new NetworkPruneRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filters = this.convertValues(source["filters"], NetworkKeyValueDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SaveDockerContextRequestDTO {
	    id: string;
	    name: string;
	    description: string;
	    host: string;
	    caPath: string;
	    certPath: string;
	    keyPath: string;
	    sshKeyPath: string;
	    skipTlsVerify: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SaveDockerContextRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.host = source["host"];
	        this.caPath = source["caPath"];
	        this.certPath = source["certPath"];
	        this.keyPath = source["keyPath"];
	        this.sshKeyPath = source["sshKeyPath"];
	        this.skipTlsVerify = source["skipTlsVerify"];
	    }
	}
	export class StreamSubscriptionDTO {
	    subscriptionId: string;
	
	    static createFrom(source: any = {}) {
	        return new StreamSubscriptionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.subscriptionId = source["subscriptionId"];
	    }
	}
	export class SwitchDockerContextRequestDTO {
	    id: string;
	    passphrase: string;
	
	    static createFrom(source: any = {}) {
	        return new SwitchDockerContextRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.passphrase = source["passphrase"];
	    }
	}
	export class VolumeDTO {
	    name: string;
	    driver: string;
	    mountpoint: string;
	    scope: string;
	    labels: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new VolumeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.mountpoint = source["mountpoint"];
	        this.scope = source["scope"];
	        this.labels = source["labels"];
	    }
	}

}

