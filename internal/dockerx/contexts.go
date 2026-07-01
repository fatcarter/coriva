package dockerx

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"Coriva/internal/core"
)

// DiscoverCLIContexts 在本机 Docker CLI 存在时读取 CLI contexts，作为只读导入来源。
func DiscoverCLIContexts(ctx context.Context) []core.DockerContextDTO {
	dockerPath, err := exec.LookPath("docker")
	if err != nil {
		return nil
	}
	listCmd := exec.CommandContext(ctx, dockerPath, "context", "ls", "--format", "json")
	var listOut bytes.Buffer
	listCmd.Stdout = &listOut
	if err := listCmd.Run(); err != nil {
		return nil
	}

	names := make([]string, 0)
	current := ""
	for _, line := range strings.Split(strings.TrimSpace(listOut.String()), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var item struct {
			Name    string `json:"Name"`
			Current bool   `json:"Current"`
		}
		if err := json.Unmarshal([]byte(line), &item); err == nil && strings.TrimSpace(item.Name) != "" {
			names = append(names, item.Name)
			if item.Current {
				current = item.Name
			}
		}
	}
	if len(names) == 0 {
		return nil
	}

	args := append([]string{"context", "inspect", "--format", "json"}, names...)
	inspectCmd := exec.CommandContext(ctx, dockerPath, args...)
	var inspectOut bytes.Buffer
	inspectCmd.Stdout = &inspectOut
	if err := inspectCmd.Run(); err != nil {
		return nil
	}

	var metas []dockerContextMeta
	if err := json.Unmarshal(inspectOut.Bytes(), &metas); err != nil {
		return nil
	}
	result := make([]core.DockerContextDTO, 0, len(metas))
	for _, meta := range metas {
		endpoint := meta.Endpoints.Docker
		host := strings.TrimSpace(endpoint.Host)
		if host == "" && meta.Name == "default" {
			host = defaultDockerHost
		}
		if host == "" {
			continue
		}
		caPath, certPath, keyPath := cliTLSPaths(meta.Storage.TLSPath)
		result = append(result, core.DockerContextDTO{
			ID:            "cli:" + meta.Name,
			Name:          meta.Name,
			Description:   strings.TrimSpace(meta.Metadata.Description),
			Source:        "docker-cli",
			Host:          host,
			CaPath:        caPath,
			CertPath:      certPath,
			KeyPath:       keyPath,
			SkipTLSVerify: endpoint.SkipTLSVerify,
			Current:       meta.Name == current,
			ReadOnly:      true,
			Importable:    true,
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}

type dockerContextMeta struct {
	Name     string `json:"Name"`
	Metadata struct {
		Description string `json:"Description"`
	} `json:"Metadata"`
	Endpoints struct {
		Docker struct {
			Host          string `json:"Host"`
			SkipTLSVerify bool   `json:"SkipTLSVerify"`
		} `json:"docker"`
	} `json:"Endpoints"`
	Storage struct {
		TLSPath string `json:"TLSPath"`
	} `json:"Storage"`
}

func cliTLSPaths(root string) (string, string, string) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", "", ""
	}
	candidates := []string{root, filepath.Join(root, "docker")}
	var caPath, certPath, keyPath string
	for _, dir := range candidates {
		if caPath == "" {
			caPath = existingFile(filepath.Join(dir, "ca.pem"))
		}
		if certPath == "" {
			certPath = existingFile(filepath.Join(dir, "cert.pem"))
		}
		if keyPath == "" {
			keyPath = existingFile(filepath.Join(dir, "key.pem"))
		}
	}
	return caPath, certPath, keyPath
}

func existingFile(path string) string {
	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		return path
	}
	return ""
}
