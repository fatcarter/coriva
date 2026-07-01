package dockerx

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"

	"github.com/docker/go-connections/tlsconfig"
	"github.com/moby/moby/client"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"

	"Coriva/internal/core"
)

func openEngineClient(connection core.DockerContextDTO, passphrase string) (*engineClient, error) {
	host := strings.TrimSpace(connection.Host)
	if host == "" {
		return nil, fmt.Errorf("Docker Host 不能为空")
	}
	parsed, err := url.Parse(host)
	if err != nil {
		return nil, fmt.Errorf("Docker Host 地址无效: %w", err)
	}

	switch parsed.Scheme {
	case "unix", "npipe":
		cli, err := client.New(client.WithHost(host), client.WithAPIVersionNegotiation())
		if err != nil {
			return nil, err
		}
		return &engineClient{Client: cli}, nil
	case "tcp", "http", "https":
		return openTCPEngineClient(connection)
	case "ssh":
		return openSSHEngineClient(connection, passphrase)
	default:
		return nil, fmt.Errorf("不支持的 Docker Host 协议: %s", parsed.Scheme)
	}
}

func openTCPEngineClient(connection core.DockerContextDTO) (*engineClient, error) {
	host := normalizeTCPHost(connection.Host)
	opts := []client.Opt{client.WithHost(host), client.WithAPIVersionNegotiation()}
	if shouldUseTLS(connection) {
		config, err := tlsconfig.Client(tlsconfig.Options{
			CAFile:             connection.CaPath,
			CertFile:           connection.CertPath,
			KeyFile:            connection.KeyPath,
			InsecureSkipVerify: connection.SkipTLSVerify,
			ExclusiveRootPools: strings.TrimSpace(connection.CaPath) != "",
			MinVersion:         tls.VersionTLS12,
		})
		if err != nil {
			return nil, fmt.Errorf("配置 Docker TLS 失败: %w", err)
		}
		opts = append([]client.Opt{
			client.WithHTTPClient(&http.Client{
				Transport: &http.Transport{TLSClientConfig: config},
			}),
		}, opts...)
	}
	cli, err := client.New(opts...)
	if err != nil {
		return nil, err
	}
	return &engineClient{Client: cli}, nil
}

func openSSHEngineClient(connection core.DockerContextDTO, passphrase string) (*engineClient, error) {
	parsed, err := url.Parse(connection.Host)
	if err != nil {
		return nil, fmt.Errorf("SSH Docker Host 地址无效: %w", err)
	}
	userName := parsed.User.Username()
	if userName == "" {
		current, err := user.Current()
		if err != nil {
			return nil, fmt.Errorf("读取当前系统用户失败: %w", err)
		}
		userName = current.Username
	}
	hostPort := parsed.Host
	if parsed.Port() == "" {
		hostPort = net.JoinHostPort(parsed.Hostname(), "22")
	}
	socketPath := parsed.Path
	if socketPath == "" || socketPath == "/" {
		socketPath = "/var/run/docker.sock"
	}

	authMethods, err := sshAuthMethods(connection.SSHKeyPath, passphrase)
	if err != nil {
		return nil, err
	}
	hostKeyCallback, err := hostKeyCallback()
	if err != nil {
		return nil, err
	}
	hostKeyAlgorithms := knownHostKeyAlgorithms(hostPort)
	sshClient, err := ssh.Dial("tcp", hostPort, &ssh.ClientConfig{
		User:              userName,
		Auth:              authMethods,
		HostKeyCallback:   hostKeyCallback,
		HostKeyAlgorithms: hostKeyAlgorithms,
		Timeout:           12 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("建立 SSH Docker 连接失败: %w", explainSSHError(err, hostPort, hostKeyAlgorithms))
	}

	dialContext := func(ctx context.Context, network string, address string) (net.Conn, error) {
		type dialResult struct {
			conn net.Conn
			err  error
		}
		done := make(chan dialResult, 1)
		go func() {
			conn, err := sshClient.Dial("unix", socketPath)
			done <- dialResult{conn: conn, err: err}
		}()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case result := <-done:
			if result.err != nil {
				return nil, fmt.Errorf("连接远端 Docker socket 失败: %w", result.err)
			}
			return result.conn, nil
		}
	}

	cli, err := client.New(
		client.WithHost("tcp://docker-ssh"),
		client.WithDialContext(dialContext),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		_ = sshClient.Close()
		return nil, err
	}
	return &engineClient{
		Client: cli,
		cleanup: func() {
			_ = sshClient.Close()
		},
	}, nil
}

func sshAuthMethods(keyPath string, passphrase string) ([]ssh.AuthMethod, error) {
	authMethods := make([]ssh.AuthMethod, 0, 2)
	if strings.TrimSpace(keyPath) != "" {
		signer, err := sshSignerFromFile(keyPath, passphrase)
		if err != nil {
			return nil, err
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if socket := strings.TrimSpace(os.Getenv("SSH_AUTH_SOCK")); socket != "" {
		conn, err := net.Dial("unix", socket)
		if err == nil {
			authMethods = append(authMethods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}
	if strings.TrimSpace(keyPath) == "" {
		signers, err := defaultSSHSigners(passphrase)
		if err != nil && len(authMethods) == 0 {
			return nil, err
		}
		for _, signer := range signers {
			authMethods = append(authMethods, ssh.PublicKeys(signer))
		}
	}
	if len(authMethods) == 0 {
		return nil, fmt.Errorf("未配置 SSH 私钥，且未发现可用 SSH Agent 或当前用户默认私钥")
	}
	return authMethods, nil
}

func sshSignerFromFile(keyPath string, passphrase string) (ssh.Signer, error) {
	content, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("读取 SSH 私钥失败: %w", err)
	}
	signer, err := ssh.ParsePrivateKey(content)
	if err == nil {
		return signer, nil
	}
	if strings.TrimSpace(passphrase) == "" {
		return nil, fmt.Errorf("SSH 私钥需要密码")
	}
	signer, err = ssh.ParsePrivateKeyWithPassphrase(content, []byte(passphrase))
	if err != nil {
		return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
	}
	return signer, nil
}

func defaultSSHSigners(passphrase string) ([]ssh.Signer, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("读取用户主目录失败: %w", err)
	}
	candidates := []string{
		filepath.Join(home, ".ssh", "id_ed25519"),
		filepath.Join(home, ".ssh", "id_rsa"),
		filepath.Join(home, ".ssh", "id_ecdsa"),
		filepath.Join(home, ".ssh", "id_ecdsa_sk"),
		filepath.Join(home, ".ssh", "id_ed25519_sk"),
	}
	signers := make([]ssh.Signer, 0, len(candidates))
	var encryptedKey bool
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err != nil {
			continue
		}
		signer, err := sshSignerFromFile(candidate, passphrase)
		if err == nil {
			signers = append(signers, signer)
			continue
		}
		if strings.Contains(err.Error(), "SSH 私钥需要密码") {
			encryptedKey = true
		}
	}
	if len(signers) == 0 && encryptedKey {
		return nil, fmt.Errorf("当前用户默认 SSH 私钥需要密码")
	}
	return signers, nil
}

func hostKeyCallback() (ssh.HostKeyCallback, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("读取用户主目录失败: %w", err)
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	callback, err := knownhosts.New(knownHostsPath)
	if err == nil {
		return callback, nil
	}
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("未找到 known_hosts，无法校验 SSH 主机指纹: %s", knownHostsPath)
	}
	return nil, fmt.Errorf("加载 known_hosts 失败: %w", err)
}

func knownHostKeyAlgorithms(hostPort string) []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	file, err := os.Open(filepath.Join(home, ".ssh", "known_hosts"))
	if err != nil {
		return nil
	}
	defer file.Close()

	knownHost := knownhosts.Normalize(hostPort)
	algorithms := make([]string, 0, 3)
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		_, hosts, pubKey, _, _, err := ssh.ParseKnownHosts(scanner.Bytes())
		if err != nil {
			continue
		}
		for _, host := range hosts {
			if host != knownHost {
				continue
			}
			algorithm := pubKey.Type()
			if !seen[algorithm] {
				seen[algorithm] = true
				algorithms = append(algorithms, algorithm)
			}
		}
	}
	return algorithms
}

func explainSSHError(err error, hostPort string, hostKeyAlgorithms []string) error {
	var keyErr *knownhosts.KeyError
	if !errors.As(err, &keyErr) {
		return err
	}
	if len(keyErr.Want) == 0 {
		return fmt.Errorf("known_hosts 中没有 %s 的主机指纹记录，请先使用系统 ssh 命令连接并确认指纹: %w", hostPort, err)
	}
	if len(hostKeyAlgorithms) == 0 {
		return fmt.Errorf("known_hosts 中存在 %s 的记录，但远端返回的主机指纹类型不匹配，请检查 ~/.ssh/known_hosts 是否包含当前 Host 和端口的最新指纹: %w", hostPort, err)
	}
	return fmt.Errorf("known_hosts 中存在 %s 的记录，但远端返回的主机指纹与已记录值不一致，请确认服务器主机密钥是否变更: %w", hostPort, err)
}

func normalizeTCPHost(host string) string {
	if strings.HasPrefix(host, "http://") {
		return "tcp://" + strings.TrimPrefix(host, "http://")
	}
	if strings.HasPrefix(host, "https://") {
		return "tcp://" + strings.TrimPrefix(host, "https://")
	}
	return host
}

func shouldUseTLS(connection core.DockerContextDTO) bool {
	host := strings.TrimSpace(connection.Host)
	return strings.HasPrefix(host, "https://") ||
		strings.TrimSpace(connection.CaPath) != "" ||
		strings.TrimSpace(connection.CertPath) != "" ||
		strings.TrimSpace(connection.KeyPath) != "" ||
		connection.SkipTLSVerify
}
