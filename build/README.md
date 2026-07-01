# build 目录说明

`build/` 用于保存 Wails 构建所需的平台资源和打包配置。这里的文件会参与 macOS、Windows 等平台的应用构建，属于产品构建配置，应保留在仓库中。

## 需要保留的内容

- `appicon.png`：应用基础图标资源。
- `darwin/Info.plist`：macOS 生产构建使用的应用信息。
- `darwin/Info.dev.plist`：macOS 开发模式使用的应用信息。
- `windows/icon.ico`：Windows 应用图标。
- `windows/info.json`：Windows 应用和安装包元信息。
- `windows/wails.exe.manifest`：Windows 应用 manifest。
- `windows/installer/`：Windows 安装包脚本和辅助文件。

## 不应提交的内容

- `build/bin/`：`wails build` 生成的应用包和二进制文件。
- 临时签名文件、构建日志、测试输出和平台缓存。

这些生成产物已经写入根目录 `.gitignore`。如需重新生成应用包，请在项目根目录执行：

```bash
wails build
```

构建完成后只保留源配置和平台资源，不要将 `build/bin/` 提交到仓库。
