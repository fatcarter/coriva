package dockerx

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"Coriva/internal/core"
)

func TestResolveDockerHostPrefersDockerHost(t *testing.T) {
	configDir := t.TempDir()
	writeDockerConfig(t, configDir, "colima")
	writeDockerContext(t, configDir, "colima", "unix:///tmp/colima.sock")

	t.Setenv("DOCKER_CONFIG", configDir)
	t.Setenv("DOCKER_HOST", "unix:///tmp/custom.sock")
	t.Setenv("DOCKER_CONTEXT", "")

	host, source, err := resolveDockerHost()
	if err != nil {
		t.Fatalf("resolveDockerHost() error = %v", err)
	}
	if host != "unix:///tmp/custom.sock" {
		t.Fatalf("host = %q, want %q", host, "unix:///tmp/custom.sock")
	}
	if source != "DOCKER_HOST" {
		t.Fatalf("source = %q, want %q", source, "DOCKER_HOST")
	}
}

func TestResolveDockerHostUsesDockerContext(t *testing.T) {
	configDir := t.TempDir()
	writeDockerConfig(t, configDir, "default")
	writeDockerContext(t, configDir, "colima", "unix:///Users/test/.colima/default/docker.sock")

	t.Setenv("DOCKER_CONFIG", configDir)
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "colima")

	host, source, err := resolveDockerHost()
	if err != nil {
		t.Fatalf("resolveDockerHost() error = %v", err)
	}
	if host != "unix:///Users/test/.colima/default/docker.sock" {
		t.Fatalf("host = %q, want colima socket", host)
	}
	if source != "DOCKER_CONTEXT" {
		t.Fatalf("source = %q, want %q", source, "DOCKER_CONTEXT")
	}
}

func TestResolveDockerHostUsesCurrentContext(t *testing.T) {
	configDir := t.TempDir()
	writeDockerConfig(t, configDir, "colima")
	writeDockerContext(t, configDir, "colima", "unix:///Users/test/.colima/default/docker.sock")

	t.Setenv("DOCKER_CONFIG", configDir)
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")

	host, source, err := resolveDockerHost()
	if err != nil {
		t.Fatalf("resolveDockerHost() error = %v", err)
	}
	if host != "unix:///Users/test/.colima/default/docker.sock" {
		t.Fatalf("host = %q, want colima socket", host)
	}
	if source != "docker-config" {
		t.Fatalf("source = %q, want %q", source, "docker-config")
	}
}

func TestResolveDockerHostFallsBackForDefaultContext(t *testing.T) {
	configDir := t.TempDir()
	writeDockerConfig(t, configDir, "default")

	t.Setenv("DOCKER_CONFIG", configDir)
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")

	host, source, err := resolveDockerHost()
	if err != nil {
		t.Fatalf("resolveDockerHost() error = %v", err)
	}
	if host != defaultDockerHost {
		t.Fatalf("host = %q, want %q", host, defaultDockerHost)
	}
	if source != "docker-config" {
		t.Fatalf("source = %q, want %q", source, "docker-config")
	}
}

func TestDockerTimestampUnix(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  int64
	}{
		{name: "RFC3339Nano", value: "2026-07-02T08:09:10.123456789Z", want: 1782979750},
		{name: "empty", value: "", want: 0},
		{name: "zero", value: "0001-01-01T00:00:00Z", want: 0},
		{name: "invalid", value: "not-a-time", want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := dockerTimestampUnix(tt.value); got != tt.want {
				t.Fatalf("dockerTimestampUnix(%q) = %d, want %d", tt.value, got, tt.want)
			}
		})
	}
}

func TestNetworkBoolPointer(t *testing.T) {
	tests := []struct {
		name      string
		value     string
		wantNil   bool
		wantValue bool
		wantErr   bool
	}{
		{name: "default", value: "default", wantNil: true},
		{name: "empty", value: "", wantNil: true},
		{name: "enabled", value: "enabled", wantValue: true},
		{name: "disabled", value: "disabled", wantValue: false},
		{name: "invalid", value: "maybe", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := networkBoolPointer(tt.value, "IPv4")
			if tt.wantErr {
				if err == nil {
					t.Fatalf("networkBoolPointer(%q) expected error", tt.value)
				}
				return
			}
			if err != nil {
				t.Fatalf("networkBoolPointer(%q) error = %v", tt.value, err)
			}
			if tt.wantNil {
				if got != nil {
					t.Fatalf("networkBoolPointer(%q) = %v, want nil", tt.value, *got)
				}
				return
			}
			if got == nil || *got != tt.wantValue {
				t.Fatalf("networkBoolPointer(%q) = %v, want %v", tt.value, got, tt.wantValue)
			}
		})
	}
}

func TestKeyValuesToMap(t *testing.T) {
	got := keyValuesToMap([]core.NetworkKeyValueDTO{
		{Key: " app ", Value: " coriva "},
		{Key: "", Value: "ignored"},
		{Key: "tier", Value: "dev"},
		{Key: "tier", Value: "prod"},
	})
	want := map[string]string{"app": "coriva", "tier": "prod"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("keyValuesToMap() = %#v, want %#v", got, want)
	}
}

func TestFiltersFromKeyValues(t *testing.T) {
	got := filtersFromKeyValues([]core.NetworkKeyValueDTO{
		{Key: "label", Value: "app=coriva"},
		{Key: "label", Value: "stage=dev"},
		{Key: "until", Value: "24h"},
		{Key: "", Value: "ignored"},
	})
	want := map[string]map[string]bool{
		"label": {"app=coriva": true, "stage=dev": true},
		"until": {"24h": true},
	}
	if !reflect.DeepEqual(map[string]map[string]bool(got), want) {
		t.Fatalf("filtersFromKeyValues() = %#v, want %#v", got, want)
	}
}

func TestNetworkIPAMFromRequest(t *testing.T) {
	got, err := networkIPAMFromRequest(core.NetworkCreateRequestDTO{
		IPAMDriver: "default",
		IPAMOptions: []core.NetworkKeyValueDTO{
			{Key: "foo", Value: "bar"},
		},
		IPAMConfigs: []core.NetworkIPAMConfigDTO{
			{
				Subnet:  "172.30.0.0/16",
				IPRange: "172.30.5.0/24",
				Gateway: "172.30.0.1",
				AuxAddresses: []core.NetworkKeyValueDTO{
					{Key: "router", Value: "172.30.0.2"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("networkIPAMFromRequest() error = %v", err)
	}
	if got == nil {
		t.Fatalf("networkIPAMFromRequest() = nil")
	}
	if got.Driver != "default" || got.Options["foo"] != "bar" {
		t.Fatalf("networkIPAMFromRequest() driver/options = %#v", got)
	}
	if len(got.Config) != 1 {
		t.Fatalf("networkIPAMFromRequest() config length = %d, want 1", len(got.Config))
	}
	config := got.Config[0]
	if config.Subnet.String() != "172.30.0.0/16" || config.IPRange.String() != "172.30.5.0/24" || config.Gateway.String() != "172.30.0.1" {
		t.Fatalf("networkIPAMFromRequest() config = %#v", config)
	}
	if config.AuxAddress["router"].String() != "172.30.0.2" {
		t.Fatalf("networkIPAMFromRequest() aux = %#v", config.AuxAddress)
	}
}

func TestNetworkIPAMFromRequestRejectsInvalidCIDR(t *testing.T) {
	_, err := networkIPAMFromRequest(core.NetworkCreateRequestDTO{
		IPAMConfigs: []core.NetworkIPAMConfigDTO{{Subnet: "172.30.0.1"}},
	})
	if err == nil {
		t.Fatalf("networkIPAMFromRequest() expected error")
	}
}

func TestNetworkEndpointFromRequest(t *testing.T) {
	got, err := networkEndpointFromRequest(core.NetworkConnectRequestDTO{
		Aliases:       []string{" api ", ""},
		Links:         []string{"db:db"},
		IPv4Address:   "172.30.0.20",
		IPv6Address:   "2001:db8::20",
		LinkLocalIPs:  []string{"169.254.1.20"},
		DriverOptions: []core.NetworkKeyValueDTO{{Key: "com.example.mode", Value: "fast"}},
		GwPriority:    10,
	})
	if err != nil {
		t.Fatalf("networkEndpointFromRequest() error = %v", err)
	}
	if got == nil {
		t.Fatalf("networkEndpointFromRequest() = nil")
	}
	if !reflect.DeepEqual(got.Aliases, []string{"api"}) || !reflect.DeepEqual(got.Links, []string{"db:db"}) {
		t.Fatalf("networkEndpointFromRequest() aliases/links = %#v/%#v", got.Aliases, got.Links)
	}
	if got.DriverOpts["com.example.mode"] != "fast" || got.GwPriority != 10 {
		t.Fatalf("networkEndpointFromRequest() options = %#v priority=%d", got.DriverOpts, got.GwPriority)
	}
	if got.IPAMConfig == nil || got.IPAMConfig.IPv4Address.String() != "172.30.0.20" || got.IPAMConfig.IPv6Address.String() != "2001:db8::20" {
		t.Fatalf("networkEndpointFromRequest() ipam = %#v", got.IPAMConfig)
	}
	if len(got.IPAMConfig.LinkLocalIPs) != 1 || got.IPAMConfig.LinkLocalIPs[0].String() != "169.254.1.20" {
		t.Fatalf("networkEndpointFromRequest() link local = %#v", got.IPAMConfig.LinkLocalIPs)
	}
}

func writeDockerConfig(t *testing.T, configDir string, currentContext string) {
	t.Helper()
	content := []byte(`{"currentContext":"` + currentContext + `"}`)
	if err := os.WriteFile(filepath.Join(configDir, "config.json"), content, 0o644); err != nil {
		t.Fatalf("write docker config: %v", err)
	}
}

func writeDockerContext(t *testing.T, configDir string, name string, host string) {
	t.Helper()
	contextDir := filepath.Join(configDir, "contexts", "meta", name)
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		t.Fatalf("create context dir: %v", err)
	}
	content := []byte(`{"Name":"` + name + `","Endpoints":{"docker":{"Host":"` + host + `","SkipTLSVerify":false}}}`)
	if err := os.WriteFile(filepath.Join(contextDir, "meta.json"), content, 0o644); err != nil {
		t.Fatalf("write context meta: %v", err)
	}
}
