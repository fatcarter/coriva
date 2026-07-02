# Docker Pull 状态机设计

## 状态定义

Docker 镜像拉取过程被设计为一个完整的状态机，涵盖从开始到结束的所有阶段。

### 状态类型 (PullPhase)

```typescript
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
```

## 状态流转

### 正常流程

```
pending
  ↓
connecting
  ↓
resolving
  ↓
pulling_manifest
  ↓
downloading (多层并行)
  ↓
verifying_download
  ↓
extracting (多层并行)
  ↓
verifying_extract
  ↓
finalizing
  ↓
complete
```

### 异常流程

从任意状态都可以转换到：
- `cancelled` - 用户主动取消
- `failed` - 发生错误

## 状态说明

### 1. pending（等待中）
- **时机**: 任务刚创建，还未开始处理
- **用户看到**: "等待中"
- **颜色**: 灰色
- **进度条**: 无活动

### 2. connecting（连接中）
- **时机**: 正在连接到 Docker daemon
- **用户看到**: "连接中"
- **颜色**: 灰色
- **进度条**: 无活动

### 3. resolving（解析镜像）
- **时机**: 解析镜像名称，查找镜像在 registry 中的位置
- **用户看到**: "解析镜像"
- **颜色**: 紫色 `#8a5cff`
- **进度条**: 无活动

### 4. pulling_manifest（拉取清单）
- **时机**: 下载镜像的 manifest 文件（包含层信息）
- **用户看到**: "拉取清单"
- **颜色**: 紫色 `#8a5cff`
- **进度条**: 无活动

### 5. downloading（下载中）
- **时机**: 正在下载镜像层（可以多层并行下载）
- **用户看到**: "下载中"
- **颜色**: 蓝色 `#3a6fff`
- **进度条**: Download 进度条活跃，显示实时字节数和百分比

### 6. verifying_download（验证下载）
- **时机**: 下载完成后验证数据完整性（checksum）
- **用户看到**: "验证下载"
- **颜色**: 浅蓝色 `#4c8aff`
- **进度条**: Download 进度条满，可能有动画

### 7. extracting（解压中）
- **时机**: 解压下载的镜像层（可以多层并行解压）
- **用户看到**: "解压中"
- **颜色**: 青色 `#00d19c`
- **进度条**: Extract 进度条活跃，显示实时字节数和百分比

### 8. verifying_extract（验证解压）
- **时机**: 解压完成后验证文件系统完整性
- **用户看到**: "验证解压"
- **颜色**: 浅青色 `#2ec88c`
- **进度条**: Extract 进度条满，可能有动画

### 9. finalizing（最终处理）
- **时机**: 完成最后的清理工作，更新镜像元数据
- **用户看到**: "最终处理"
- **颜色**: 浅绿色 `#2eb478`
- **进度条**: 两条进度条都满

### 10. complete（完成）
- **时机**: 镜像拉取完全完成
- **用户看到**: "拉取完成"
- **颜色**: 绿色 `#2ea44f`
- **进度条**: 两条进度条都满，3秒后自动消失
- **卡片效果**: 绿色光晕覆盖整个卡片

### 11. cancelled（已取消）
- **时机**: 用户点击取消按钮
- **用户看到**: "已取消"
- **颜色**: 灰色
- **进度条**: 停止在当前位置

### 12. failed（失败）
- **时机**: 发生任何错误
- **用户看到**: "拉取失败" + 错误消息
- **颜色**: 红色 `#bd3c3c`
- **进度条**: 停止在当前位置
- **卡片效果**: 红色警告氛围

## 视觉设计

### 状态徽章颜色

| 状态 | 颜色主题 | 背景渐变 | 边框 | 阴影 |
|-----|---------|---------|------|-----|
| pending | 灰色 | `rgba(101, 113, 133, 0.22)` | `rgba(101, 113, 133, 0.42)` | 无 |
| connecting | 灰色 | 同 pending | 同 pending | 无 |
| resolving | 紫色 | `rgba(138, 92, 255, 0.28)` | `rgba(138, 92, 255, 0.58)` | 紫色光晕 |
| pulling_manifest | 紫色 | 同 resolving | 同 resolving | 紫色光晕 |
| downloading | 蓝色 | `rgba(58, 111, 255, 0.28)` | `rgba(76, 113, 255, 0.58)` | 蓝色光晕 |
| verifying_download | 浅蓝 | `rgba(76, 138, 255, 0.28)` | `rgba(76, 138, 255, 0.58)` | 浅蓝光晕 |
| extracting | 青色 | `rgba(0, 209, 156, 0.28)` | `rgba(0, 209, 156, 0.58)` | 青色光晕 |
| verifying_extract | 浅青 | `rgba(46, 200, 140, 0.28)` | `rgba(46, 200, 140, 0.58)` | 浅青光晕 |
| finalizing | 浅绿 | `rgba(46, 180, 120, 0.28)` | `rgba(46, 180, 120, 0.58)` | 浅绿光晕 |
| complete | 绿色 | `rgba(46, 164, 79, 0.32)` | `rgba(46, 164, 79, 0.62)` | 绿色光晕 |
| cancelled | 灰色 | `rgba(101, 113, 133, 0.28)` | `rgba(101, 113, 133, 0.48)` | 无 |
| failed | 红色 | `rgba(189, 60, 60, 0.32)` | `rgba(189, 60, 60, 0.62)` | 红色光晕 |

### 进度条行为

#### Download 进度条（蓝色）
- **激活状态**: downloading, verifying_download
- **颜色**: `#3a6fff → #5b8cff → #7ba8ff`
- **发光效果**: 流动光效，2秒循环
- **显示内容**: `123.4 MB / 256.8 MB` + `48%`

#### Extract 进度条（青色）
- **激活状态**: extracting, verifying_extract
- **颜色**: `#00d19c → #2de0b2 → #5cefca`
- **发光效果**: 流动光效，2秒循环
- **显示内容**: `89.2 MB / 256.8 MB` + `35%`

## 状态转换触发

### Docker SDK 事件映射

| Docker 事件 | 转换到状态 |
|-----------|----------|
| `"Waiting"` | `pending` |
| `"Pulling from..."` | `resolving` |
| `"Pulling fs layer"` | `pulling_manifest` |
| `"Downloading"` | `downloading` |
| `"Download complete"` | `verifying_download` |
| `"Extracting"` | `extracting` |
| `"Pull complete"` | `complete` |
| `"Already exists"` | `complete` |

### 错误处理

任何包含以下关键词的事件都会导致状态变为 `failed`：
- `"error"`
- `"failed"`
- `"timeout"`

## 实现细节

### 层级进度聚合

每个镜像由多个层（layer）组成，每层独立追踪进度：

```typescript
layerProgress: {
  'sha256:abc123': {
    downloadCurrent: 12345678,
    downloadTotal: 50000000,
    downloadDone: false,
    extractCurrent: 0,
    extractTotal: 0,
    extractDone: false
  },
  // ... 更多层
}
```

聚合规则：
- `downloadingCurrent` = ∑(min(layer.downloadCurrent, layer.downloadTotal))
- `downloadingTotal` = ∑(layer.downloadTotal)
- `extractingCurrent` = ∑(min(layer.extractCurrent, layer.extractTotal))
- `extractingTotal` = ∑(layer.extractTotal)

### 总体进度计算

```typescript
overallProgress = 
  if extractingTotal > 0:
    extractingCurrent / extractingTotal
  else if downloadingTotal > 0:
    downloadingCurrent / downloadingTotal
  else:
    0.06  // 显示最小进度避免空白
```

### 自动消失逻辑

当任务状态为 `complete` 且没有错误时：
1. 等待 3 秒
2. 设置 `removing: true`
3. 触发退出动画（0.28 秒）
4. 从列表中移除

用户可以在此期间查看完成的任务详情。

## 使用示例

### 典型成功流程

```
1. 用户输入 "nginx:latest" 并点击"拉取"
2. 状态: pending → connecting (显示"连接中"，灰色徽章)
3. 状态: connecting → resolving (显示"解析镜像"，紫色徽章)
4. 状态: resolving → pulling_manifest (显示"拉取清单"，紫色徽章)
5. 状态: pulling_manifest → downloading (显示"下载中"，蓝色徽章，Download进度条开始填充)
6. Download进度: 0% → 48% → 100% (显示实时字节数)
7. 状态: downloading → verifying_download (显示"验证下载"，浅蓝徽章)
8. 状态: verifying_download → extracting (显示"解压中"，青色徽章，Extract进度条开始填充)
9. Extract进度: 0% → 35% → 100% (显示实时字节数)
10. 状态: extracting → verifying_extract (显示"验证解压"，浅青徽章)
11. 状态: verifying_extract → finalizing (显示"最终处理"，浅绿徽章)
12. 状态: finalizing → complete (显示"拉取完成"，绿色徽章，卡片绿色光晕)
13. 3秒后优雅退出
```

### 错误流程

```
1. 状态: downloading (下载中)
2. 网络错误发生
3. 状态: downloading → failed (显示"拉取失败"，红色徽章，红色卡片)
4. 显示错误消息: "network timeout"
5. 不会自动消失，等待用户手动处理
```

### 取消流程

```
1. 状态: downloading (下载中，进度48%)
2. 用户点击取消按钮
3. 状态: downloading → cancelled (显示"已取消"，灰色徽章)
4. 进度条停在48%
5. 3秒后优雅退出
```
