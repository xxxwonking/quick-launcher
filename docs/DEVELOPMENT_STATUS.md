# Quick Launcher 开发进度

更新时间：2026-08-23

## 当前阶段

当前位于 Windows M1 核心启动器阶段，工作分支为 `feat/m1-ui`。代码已经具备可运行的 Electron/React 基础和真实 Windows 应用索引闭环，当前提交用于同步已完成部分。

## 已完成

- Electron + React + TypeScript + Tailwind 基础工程和 Windows PowerShell 开发命令。
- 沙箱 preload、`contextIsolation`、关闭 `nodeIntegration`，Renderer 只获得白名单 `window.launcher` API。
- 无边框常驻搜索窗口、独立设置窗口、托盘入口、Esc 隐藏和重新唤起时自动聚焦。
- 全局快捷键注册与冲突状态；首选快捷键冲突时不再静默替换备用组合。
- 系统浅色/深色主题、自定义主题偏好和系统主题变化监听。
- 搜索应用名、别名、中文拼音全拼、拼音首字母、内置 `setting`/`tutorial` 命令和网页兜底。
- `↑`/`↓` 循环选择、输入框持续聚焦、Enter 执行、Ctrl/Cmd+Enter 网页搜索、Esc 关闭。
- 下一步/上一步/跳过/完成的漫游式教程，并支持键盘操作。
- Windows 桌面和 Start Menu 快捷方式索引：桌面使用系统真实桌面路径且只扫描顶层，Start Menu 支持受限递归扫描。
- 索引结果只向 Renderer 暴露 `shortcut:<hash>` opaque ID、名称、别名和拼音；真实路径只保留在主进程。
- indexed 应用执行、路径失败提示、索引刷新后的 Renderer 更新，以及 E2E 模式的副作用隔离。
- 原子 settings JSON 写入、Bing/Baidu/Google/custom 搜索引擎的数据模型和网页 URL 安全校验。

## 验证结果

本阶段已通过：

- Node 单元测试
- Renderer 单元测试
- TypeScript 类型检查
- Electron 生产构建
- Electron Playwright E2E：隐藏/重新唤起、焦点、独立设置窗口、preload 安全边界和网页搜索 IPC
- `git diff --check`

最终提交前会再次运行完整验证矩阵，以提交输出为准。

## 尚未完成

以下是下一阶段工作，不应视为当前已完成能力：

- 设置页真正可编辑的快捷键录入、冲突重试和保存流程。
- 搜索引擎选择器与自定义模板编辑 UI 接入主进程设置 IPC。
- 自定义命令 CRUD：新增、编辑、启用、禁用、删除和配置版本冲突处理。
- `resources/catalog/base.json` 基础软件快捷键模板。
- 用户一键导入命令包、导入预览/冲突处理，以及导入后修改快捷搜索。
- 首次启动引导完成状态的持久化。
- 文件搜索。当前 M1 只做内存中的应用索引；文件搜索计划使用后台增量索引和受控结果上限，避免每次输入扫描磁盘。
- macOS 适配、签名、公证、自动更新和公开发布流程。

## 远端同步

已配置：`git@github.com:xxxwonking/quick-launcher.git`。当前代码将提交到 `feat/m1-ui` 分支；后续可在 GitHub 上创建 Pull Request 合并到 `master`。
