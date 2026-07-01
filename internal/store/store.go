package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"Coriva/internal/core"
)

const migrationKeyword = "CORIVA_SQLITE_MIGRATION"
const recentActionRetention = 100

// Store 负责 Coriva 本地数据的读写和迁移。
type Store struct {
	db      *sql.DB
	dbPath  string
	appPath string
	logger  *slog.Logger
}

// New 创建本地 SQLite 存储并执行前向迁移。
func New(ctx context.Context, logger *slog.Logger) (*Store, error) {
	appPath, err := appSupportPath()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(appPath, 0o755); err != nil {
		return nil, fmt.Errorf("创建应用数据目录失败: %w", err)
	}

	dbPath := filepath.Join(appPath, "coriva.db")
	logger.Info("开始初始化本地数据库", "keyword", migrationKeyword, "dbPath", dbPath)

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("打开 SQLite 数据库失败: %w", err)
	}
	db.SetMaxOpenConns(1)

	store := &Store{
		db:      db,
		dbPath:  dbPath,
		appPath: appPath,
		logger:  logger,
	}
	if err := store.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	logger.Info("本地数据库初始化完成", "keyword", migrationKeyword, "dbPath", dbPath)
	return store, nil
}

// Close 关闭底层数据库连接。
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// DBPath 返回 SQLite 数据库文件路径。
func (s *Store) DBPath() string {
	return s.dbPath
}

// AppPath 返回 Coriva 应用数据目录。
func (s *Store) AppPath() string {
	return s.appPath
}

// CredentialsPath 返回 Coriva 托管 Docker 凭据的目录。
func (s *Store) CredentialsPath() string {
	return filepath.Join(s.appPath, "docker-credentials")
}

// ActiveDockerContextID 返回 Coriva 当前选中的 Docker 连接 ID。
func (s *Store) ActiveDockerContextID(ctx context.Context) string {
	value, err := s.setting(ctx, "active_docker_context_id")
	if err != nil {
		s.logger.Warn("读取当前 Docker 连接设置失败", "keyword", migrationKeyword, "error", err)
		return ""
	}
	return value
}

// SaveActiveDockerContextID 保存 Coriva 当前选中的 Docker 连接 ID。
func (s *Store) SaveActiveDockerContextID(ctx context.Context, id string) error {
	return s.upsertSetting(ctx, "active_docker_context_id", strings.TrimSpace(id))
}

// ListDockerConnections 返回 Coriva 自有 Docker 连接列表。
func (s *Store) ListDockerConnections(ctx context.Context) ([]core.DockerContextDTO, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, description, host, normalized_host, bridge_type,
		       connection_status, connection_error, last_checked_at,
		       ca_path, cert_path, key_path, ssh_key_path, skip_tls_verify, updated_at
		FROM docker_connections
		WHERE deleted_at IS NULL
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("查询 Docker 连接失败: %w", err)
	}
	defer rows.Close()

	connections := make([]core.DockerContextDTO, 0)
	for rows.Next() {
		var item core.DockerContextDTO
		var skipTLSVerify int
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Description,
			&item.Host,
			&item.NormalizedHost,
			&item.BridgeType,
			&item.ConnectionStatus,
			&item.ConnectionError,
			&item.LastCheckedAt,
			&item.CaPath,
			&item.CertPath,
			&item.KeyPath,
			&item.SSHKeyPath,
			&skipTLSVerify,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("读取 Docker 连接失败: %w", err)
		}
		item.Source = "coriva"
		item.SkipTLSVerify = skipTLSVerify == 1
		connections = append(connections, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历 Docker 连接失败: %w", err)
	}
	return connections, nil
}

// UpsertDockerConnection 保存或更新 Coriva 自有 Docker 连接。
func (s *Store) UpsertDockerConnection(ctx context.Context, connection core.DockerContextDTO) (core.DockerContextDTO, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	connection.ID = strings.TrimSpace(connection.ID)
	if connection.ID == "" {
		connection.ID = uuid.NewString()
	}
	connection.Name = strings.TrimSpace(connection.Name)
	connection.Description = strings.TrimSpace(connection.Description)
	connection.Host = strings.TrimSpace(connection.Host)
	connection.CaPath = strings.TrimSpace(connection.CaPath)
	connection.CertPath = strings.TrimSpace(connection.CertPath)
	connection.KeyPath = strings.TrimSpace(connection.KeyPath)
	connection.SSHKeyPath = strings.TrimSpace(connection.SSHKeyPath)
	connection.Source = "coriva"
	connection.UpdatedAt = now
	connection.NormalizedHost = strings.TrimSpace(connection.NormalizedHost)
	connection.BridgeType = strings.TrimSpace(connection.BridgeType)
	connection.ConnectionStatus = strings.TrimSpace(connection.ConnectionStatus)
	connection.ConnectionError = strings.TrimSpace(connection.ConnectionError)
	connection.LastCheckedAt = strings.TrimSpace(connection.LastCheckedAt)

	if connection.Name == "" {
		return core.DockerContextDTO{}, fmt.Errorf("Docker 连接名称不能为空")
	}
	if connection.Host == "" {
		return core.DockerContextDTO{}, fmt.Errorf("Docker Host 不能为空")
	}
	if connection.NormalizedHost == "" {
		return core.DockerContextDTO{}, fmt.Errorf("Docker Host 规范化值不能为空")
	}
	if connection.BridgeType == "" {
		connection.BridgeType = "remote"
	}
	if connection.ConnectionStatus == "" {
		connection.ConnectionStatus = "unchecked"
	}
	if err := s.ensureUniqueDockerConnectionHost(ctx, connection.ID, connection.Host, connection.NormalizedHost); err != nil {
		return core.DockerContextDTO{}, err
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO docker_connections (
			id, name, description, host, normalized_host, bridge_type,
			connection_status, connection_error, last_checked_at,
			ca_path, cert_path, key_path, ssh_key_path, skip_tls_verify,
			is_default, created_at, updated_at, deleted_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			host = excluded.host,
			normalized_host = excluded.normalized_host,
			bridge_type = excluded.bridge_type,
			connection_status = excluded.connection_status,
			connection_error = excluded.connection_error,
			last_checked_at = excluded.last_checked_at,
			ca_path = excluded.ca_path,
			cert_path = excluded.cert_path,
			key_path = excluded.key_path,
			ssh_key_path = excluded.ssh_key_path,
			skip_tls_verify = excluded.skip_tls_verify,
			updated_at = excluded.updated_at,
			deleted_at = NULL
	`, connection.ID, connection.Name, connection.Description, connection.Host, connection.NormalizedHost, connection.BridgeType,
		connection.ConnectionStatus, connection.ConnectionError, connection.LastCheckedAt,
		connection.CaPath, connection.CertPath, connection.KeyPath, connection.SSHKeyPath, boolInt(connection.SkipTLSVerify), now, now)
	if err != nil {
		return core.DockerContextDTO{}, fmt.Errorf("保存 Docker 连接失败: %w", err)
	}
	return connection, nil
}

// UpdateDockerConnectionProbe 写入 Docker context 最近一次连接检测结果。
func (s *Store) UpdateDockerConnectionProbe(ctx context.Context, id string, status string, message string, checkedAt string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("Docker 连接 ID 不能为空")
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE docker_connections
		SET connection_status = ?, connection_error = ?, last_checked_at = ?, updated_at = ?
		WHERE id = ? AND deleted_at IS NULL
	`, strings.TrimSpace(status), strings.TrimSpace(message), strings.TrimSpace(checkedAt), time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return fmt.Errorf("更新 Docker 连接检测结果失败: %w", err)
	}
	return nil
}

// DeleteDockerConnection 逻辑删除 Coriva 自有 Docker 连接。
func (s *Store) DeleteDockerConnection(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("Docker 连接 ID 不能为空")
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE docker_connections
		SET deleted_at = ?, updated_at = ?
		WHERE id = ? AND deleted_at IS NULL
	`, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return fmt.Errorf("删除 Docker 连接失败: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("确认 Docker 连接删除结果失败: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("Docker 连接不存在或已删除: %s", id)
	}
	return nil
}

// UpsertComposeProject 保存或更新本地 Compose 项目。
func (s *Store) UpsertComposeProject(ctx context.Context, name string, path string, config string) (core.ComposeProjectDTO, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	existing, err := s.composeProjectByPath(ctx, path)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return core.ComposeProjectDTO{}, err
	}

	if existing.ID != "" {
		_, err = s.db.ExecContext(ctx, `
			UPDATE compose_projects
			SET name = ?, config_path = ?, updated_at = ?, deleted_at = NULL
			WHERE id = ?
		`, name, config, now, existing.ID)
		if err != nil {
			return core.ComposeProjectDTO{}, fmt.Errorf("更新 Compose 项目失败: %w", err)
		}
		existing.Name = name
		existing.Config = config
		existing.UpdatedAt = now
		return existing, nil
	}

	project := core.ComposeProjectDTO{
		ID:        uuid.NewString(),
		Name:      name,
		Path:      path,
		Config:    config,
		Status:    "unknown",
		UpdatedAt: now,
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO compose_projects (id, name, project_path, config_path, created_at, updated_at, deleted_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL)
	`, project.ID, project.Name, project.Path, project.Config, now, now)
	if err != nil {
		return core.ComposeProjectDTO{}, fmt.Errorf("保存 Compose 项目失败: %w", err)
	}
	return project, nil
}

// ListComposeProjects 返回未逻辑删除的 Compose 项目。
func (s *Store) ListComposeProjects(ctx context.Context) ([]core.ComposeProjectDTO, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, project_path, config_path, updated_at
		FROM compose_projects
		WHERE deleted_at IS NULL
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("查询 Compose 项目失败: %w", err)
	}
	defer rows.Close()

	var projects []core.ComposeProjectDTO
	for rows.Next() {
		var project core.ComposeProjectDTO
		if err := rows.Scan(&project.ID, &project.Name, &project.Path, &project.Config, &project.UpdatedAt); err != nil {
			return nil, fmt.Errorf("读取 Compose 项目失败: %w", err)
		}
		project.Status = "unknown"
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历 Compose 项目失败: %w", err)
	}
	return projects, nil
}

// ComposeProjectByID 根据 ID 查询未逻辑删除的 Compose 项目。
func (s *Store) ComposeProjectByID(ctx context.Context, id string) (core.ComposeProjectDTO, error) {
	var project core.ComposeProjectDTO
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, project_path, config_path, updated_at
		FROM compose_projects
		WHERE id = ? AND deleted_at IS NULL
	`, id).Scan(&project.ID, &project.Name, &project.Path, &project.Config, &project.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return core.ComposeProjectDTO{}, fmt.Errorf("Compose 项目不存在: %s", id)
		}
		return core.ComposeProjectDTO{}, fmt.Errorf("查询 Compose 项目失败: %w", err)
	}
	project.Status = "unknown"
	return project, nil
}

// RecordAction 写入最近操作，方便用户回看关键动作。
func (s *Store) RecordAction(ctx context.Context, kind string, target string, status string, message string) {
	if s == nil || s.db == nil {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO recent_actions (id, kind, target, status, message, created_at, deleted_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL)
	`, uuid.NewString(), kind, target, status, message, now)
	if err != nil {
		s.logger.Warn("记录最近操作失败", "keyword", migrationKeyword, "kind", kind, "target", target, "error", err)
		return
	}
	if err := s.pruneRecentActions(ctx, recentActionRetention); err != nil {
		s.logger.Warn("清理最近操作旧记录失败", "keyword", migrationKeyword, "retention", recentActionRetention, "error", err)
	}
}

// ListRecentActions 返回最近操作记录。
func (s *Store) ListRecentActions(ctx context.Context, limit int) []core.RecentActionDTO {
	if limit <= 0 {
		limit = recentActionRetention
	}
	if limit > recentActionRetention {
		limit = recentActionRetention
	}
	if err := s.pruneRecentActions(ctx, recentActionRetention); err != nil {
		s.logger.Warn("清理最近操作旧记录失败", "keyword", migrationKeyword, "retention", recentActionRetention, "error", err)
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, target, status, message, created_at
		FROM recent_actions
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		s.logger.Warn("查询最近操作失败", "keyword", migrationKeyword, "error", err)
		return nil
	}
	defer rows.Close()

	actions := make([]core.RecentActionDTO, 0, limit)
	for rows.Next() {
		var action core.RecentActionDTO
		if err := rows.Scan(&action.ID, &action.Kind, &action.Target, &action.Status, &action.Message, &action.CreatedAt); err != nil {
			s.logger.Warn("读取最近操作失败", "keyword", migrationKeyword, "error", err)
			continue
		}
		actions = append(actions, action)
	}
	return actions
}

// pruneRecentActions 逻辑删除超过保留数量的旧操作，避免本地操作日志无限增长。
func (s *Store) pruneRecentActions(ctx context.Context, retention int) error {
	if retention <= 0 {
		retention = recentActionRetention
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `
		UPDATE recent_actions
		SET deleted_at = ?
		WHERE deleted_at IS NULL
			AND id NOT IN (
				SELECT id
				FROM recent_actions
				WHERE deleted_at IS NULL
				ORDER BY created_at DESC
				LIMIT ?
			)
	`, now, retention)
	if err != nil {
		return fmt.Errorf("逻辑删除最近操作旧记录失败: %w", err)
	}
	return nil
}

func (s *Store) composeProjectByPath(ctx context.Context, path string) (core.ComposeProjectDTO, error) {
	var project core.ComposeProjectDTO
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, project_path, config_path, updated_at
		FROM compose_projects
		WHERE project_path = ?
	`, path).Scan(&project.ID, &project.Name, &project.Path, &project.Config, &project.UpdatedAt)
	return project, err
}

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY, -- 迁移版本号，确保每次结构变更只执行一次。
			description TEXT NOT NULL, -- 迁移说明，便于排查本地数据库结构来源。
			applied_at TEXT NOT NULL, -- 迁移执行时间，使用 UTC RFC3339 字符串。
			deleted_at TEXT -- 逻辑删除时间，迁移记录默认不删除，仅满足统一软删除规范。
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			id TEXT PRIMARY KEY, -- 配置项唯一标识。
			key TEXT NOT NULL UNIQUE, -- 配置键名，供客户端稳定读取。
			value TEXT NOT NULL, -- 配置值，使用字符串保存以兼容后续 JSON 配置。
			created_at TEXT NOT NULL, -- 创建时间。
			updated_at TEXT NOT NULL, -- 更新时间。
			deleted_at TEXT -- 逻辑删除时间，为空表示配置仍有效。
		)`,
		`CREATE TABLE IF NOT EXISTS docker_connections (
			id TEXT PRIMARY KEY, -- Docker 连接记录唯一标识。
			name TEXT NOT NULL, -- 连接名称，供左下角连接切换器展示。
			description TEXT NOT NULL DEFAULT '', -- 连接说明，便于区分远程环境用途。
			host TEXT NOT NULL, -- Docker daemon 地址。
			normalized_host TEXT NOT NULL DEFAULT '', -- 规范化后的 Docker daemon 地址，用于防止重复 URI。
			bridge_type TEXT NOT NULL DEFAULT 'remote', -- 连接桥接类型，local 表示本机桥接，remote 表示远端桥接。
			connection_status TEXT NOT NULL DEFAULT 'unchecked', -- 最近一次连接检测状态，unchecked、success 或 failed。
			connection_error TEXT NOT NULL DEFAULT '', -- 最近一次连接检测失败原因，成功时为空。
			last_checked_at TEXT NOT NULL DEFAULT '', -- 最近一次连接检测时间，使用 UTC RFC3339 字符串。
			ca_path TEXT NOT NULL DEFAULT '', -- TLS CA 证书在 Coriva 应用目录中的托管路径。
			cert_path TEXT NOT NULL DEFAULT '', -- TLS 客户端证书在 Coriva 应用目录中的托管路径。
			key_path TEXT NOT NULL DEFAULT '', -- TLS 客户端私钥在 Coriva 应用目录中的托管路径。
			ssh_key_path TEXT NOT NULL DEFAULT '', -- SSH 私钥在 Coriva 应用目录中的托管路径。
			skip_tls_verify INTEGER NOT NULL DEFAULT 0, -- 是否跳过 TLS 服务端证书校验，1 表示跳过。
			is_default INTEGER NOT NULL DEFAULT 0, -- 是否为默认连接，1 表示默认。
			created_at TEXT NOT NULL, -- 创建时间。
			updated_at TEXT NOT NULL, -- 更新时间。
			deleted_at TEXT -- 逻辑删除时间，为空表示连接仍有效。
		)`,
		`CREATE TABLE IF NOT EXISTS compose_projects (
			id TEXT PRIMARY KEY, -- Compose 项目唯一标识。
			name TEXT NOT NULL, -- 项目名称，默认取目录名。
			project_path TEXT NOT NULL UNIQUE, -- Compose 项目目录路径。
			config_path TEXT NOT NULL, -- Compose 配置文件路径。
			created_at TEXT NOT NULL, -- 创建时间。
			updated_at TEXT NOT NULL, -- 更新时间。
			deleted_at TEXT -- 逻辑删除时间，为空表示项目仍显示。
		)`,
		`CREATE TABLE IF NOT EXISTS pinned_resources (
			id TEXT PRIMARY KEY, -- 固定资源唯一标识。
			resource_type TEXT NOT NULL, -- 资源类型，例如 container、image、compose。
			resource_id TEXT NOT NULL, -- 资源在 Docker 或 Coriva 内的标识。
			label TEXT NOT NULL, -- 前端展示名称。
			created_at TEXT NOT NULL, -- 创建时间。
			updated_at TEXT NOT NULL, -- 更新时间。
			deleted_at TEXT -- 逻辑删除时间，为空表示仍固定。
		)`,
		`CREATE TABLE IF NOT EXISTS recent_actions (
			id TEXT PRIMARY KEY, -- 操作记录唯一标识。
			kind TEXT NOT NULL, -- 操作类型，例如 start_container、compose_up。
			target TEXT NOT NULL, -- 操作对象名称或 ID。
			status TEXT NOT NULL, -- 操作结果，success 或 failed。
			message TEXT NOT NULL, -- 操作结果说明，供界面展示。
			created_at TEXT NOT NULL, -- 操作发生时间。
			deleted_at TEXT -- 逻辑删除时间，为空表示仍可展示。
		)`,
		`CREATE INDEX IF NOT EXISTS idx_compose_projects_deleted_updated ON compose_projects (deleted_at, updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_recent_actions_deleted_created ON recent_actions (deleted_at, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_docker_connections_deleted_updated ON docker_connections (deleted_at, updated_at)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_docker_connections_normalized_host_active ON docker_connections (normalized_host) WHERE deleted_at IS NULL AND normalized_host <> ''`,
		`INSERT OR IGNORE INTO schema_migrations (version, description, applied_at, deleted_at)
		 VALUES (1, '初始化 Coriva 本地数据表', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL)`,
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			s.logger.Error("本地数据库迁移失败", "keyword", migrationKeyword, "error", err)
			return fmt.Errorf("执行 SQLite 迁移失败: %w", err)
		}
	}
	if err := s.ensureDockerConnectionColumns(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Store) setting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `
		SELECT value
		FROM settings
		WHERE key = ? AND deleted_at IS NULL
	`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

func (s *Store) upsertSetting(ctx context.Context, key string, value string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO settings (id, key, value, created_at, updated_at, deleted_at)
		VALUES (?, ?, ?, ?, ?, NULL)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at,
			deleted_at = NULL
	`, uuid.NewString(), key, value, now, now)
	if err != nil {
		return fmt.Errorf("保存本地设置失败: %w", err)
	}
	return nil
}

func (s *Store) ensureDockerConnectionColumns(ctx context.Context) error {
	columns := map[string]string{
		"description":       "TEXT NOT NULL DEFAULT ''",
		"normalized_host":   "TEXT NOT NULL DEFAULT ''",
		"bridge_type":       "TEXT NOT NULL DEFAULT 'remote'",
		"connection_status": "TEXT NOT NULL DEFAULT 'unchecked'",
		"connection_error":  "TEXT NOT NULL DEFAULT ''",
		"last_checked_at":   "TEXT NOT NULL DEFAULT ''",
		"ca_path":           "TEXT NOT NULL DEFAULT ''",
		"cert_path":         "TEXT NOT NULL DEFAULT ''",
		"key_path":          "TEXT NOT NULL DEFAULT ''",
		"ssh_key_path":      "TEXT NOT NULL DEFAULT ''",
		"skip_tls_verify":   "INTEGER NOT NULL DEFAULT 0",
	}
	for name, definition := range columns {
		if err := s.ensureColumn(ctx, "docker_connections", name, definition); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ensureUniqueDockerConnectionHost(ctx context.Context, id string, host string, normalizedHost string) error {
	var existingID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id
		FROM docker_connections
		WHERE id <> ?
		  AND deleted_at IS NULL
		  AND (
		    normalized_host = ?
		    OR (normalized_host = '' AND host = ?)
		  )
		LIMIT 1
	`, id, normalizedHost, host).Scan(&existingID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("检查 Docker Host 重复失败: %w", err)
	}
	return fmt.Errorf("Docker Host 已存在，不能重复添加: %s", normalizedHost)
}

func (s *Store) ensureColumn(ctx context.Context, table string, column string, definition string) error {
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info("+table+")")
	if err != nil {
		return fmt.Errorf("读取表结构失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return fmt.Errorf("解析表结构失败: %w", err)
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("遍历表结构失败: %w", err)
	}
	_, err = s.db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	if err != nil {
		return fmt.Errorf("补齐表字段失败: %w", err)
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func appSupportPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("读取用户主目录失败: %w", err)
	}
	return filepath.Join(home, "Library", "Application Support", "Coriva"), nil
}
