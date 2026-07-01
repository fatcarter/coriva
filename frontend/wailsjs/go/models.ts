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
	export class NetworkDTO {
	    id: string;
	    name: string;
	    driver: string;
	    scope: string;
	    labels: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new NetworkDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.scope = source["scope"];
	        this.labels = source["labels"];
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

