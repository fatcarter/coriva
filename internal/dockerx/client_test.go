package dockerx

import (
	"os"
	"path/filepath"
	"testing"
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
