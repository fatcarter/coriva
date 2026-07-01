# Coriva

Coriva 是一款面向开发者的现代容器管理平台，专注于提供快速、简洁、直观的 Docker 管理体验。

## 版本号规范

Coriva 使用开源项目通用的语义化版本规则（Semantic Versioning，SemVer），版本格式为 `MAJOR.MINOR.PATCH`：

- `MAJOR`：存在不兼容的公开 API、配置、数据结构或用户工作流破坏性变更时递增。
- `MINOR`：新增向后兼容的功能、页面、能力或公开行为时递增。
- `PATCH`：修复缺陷、优化样式、补充文档、调整内部实现且不改变兼容行为时递增。
- 预发布版本使用 `MAJOR.MINOR.PATCH-alpha.N`、`MAJOR.MINOR.PATCH-beta.N` 或 `MAJOR.MINOR.PATCH-rc.N`。

## 版本递增要求

每次修改代码、资源、配置或文档时，必须同步检查是否需要递增版本号：

- 任何会进入仓库的代码或文档修改，都至少递增 `PATCH`。
- 新增用户可见功能或向后兼容能力时递增 `MINOR`，并将 `PATCH` 归零。
- 破坏兼容性时递增 `MAJOR`，并将 `MINOR`、`PATCH` 归零。
- 仅修改构建产物、生成文件或本地临时文件时，不应单独递增版本号。
- 不允许一次任务中多次重复递增版本；按该任务最终变更的最高影响级别递增一次。

当前版本号必须在以下位置保持一致：

- `frontend/package.json` 的 `version`
- `frontend/package-lock.json` 根节点和根 package 的 `version`
- `wails.json` 的 `info.productVersion`

完成任务前需要确认这些位置的版本一致，并在最终总结中说明本次版本递增结果。
