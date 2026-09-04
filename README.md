<div align="center">
  <img src="build/icon.png" alt="Quick Launcher icon" width="112" />

  <h1>Quick Launcher</h1>

  <p><strong>少一点寻找，多一点直达。</strong></p>
  <p>一个为 macOS 与 Windows 打造的快速启动器。<br />从应用、文件、网址到本地小工具，唤起窗口，输入，立即开始。</p>

  <p>
    <a href="https://github.com/xxxwonking/quick-launcher/actions/workflows/build.yml?query=branch%3Afeat%2Fm1-ui">
      <img src="https://github.com/xxxwonking/quick-launcher/actions/workflows/build.yml/badge.svg?branch=feat%2Fm1-ui" alt="CI status" />
    </a>
    <img src="https://img.shields.io/badge/macOS-ARM64-111827?style=flat-square" alt="macOS ARM64" />
    <img src="https://img.shields.io/badge/Windows-x64-111827?style=flat-square" alt="Windows x64" />
    <img src="https://img.shields.io/badge/Electron-43-111827?style=flat-square" alt="Electron 43" />
  </p>
</div>

<br />

> **核心入口**　macOS：`Option + Space`　·　Windows：`Alt + Space`

## 为什么是 Quick Launcher？

很多事情并不值得打开一个完整应用：启动软件、进入项目目录、搜索一个关键词、格式化一段 JSON，或者把刚刚复制的内容找回来。

Quick Launcher 把这些动作收进同一个轻量入口。它不要求你记住复杂菜单，也不依赖在线账户；只要唤起搜索框，输入你真正想做的事即可。

## 能力地图

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>⚡ 应用直达</h3>
      输入应用名称、别名、中文拼音或首字母，快速启动本机应用。
    </td>
    <td width="50%" valign="top">
      <h3>⌘ 文件与网址</h3>
      粘贴网址直接打开，输入文件或文件夹路径直接定位。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>⌕ 站点搜索</h3>
      用“关键词 + 内容”搜索抖音或自定义站点，例如 <code>b站 electron</code>。
    </td>
    <td width="50%" valign="top">
      <h3>⌗ 本地工具</h3>
      安全执行计算、单位转换、时间戳转换和常见文本处理。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>◌ 命令扩展</h3>
      创建固定网址、网页搜索、站点模板和应用参数命令。
    </td>
    <td width="50%" valign="top">
      <h3>◫ 本地优先</h3>
      设置、缓存、历史和图标都保存在本机，空输入默认保持干净。
    </td>
  </tr>
</table>

## 三步开始

### 1. 唤起

按下全局快捷键：

| 平台 | 默认快捷键 |
| --- | --- |
| macOS | `Option + Space` |
| Windows | `Alt + Space` |

快捷键可以在“设置 → 常规设置”中重新录入。录入支持修饰键、方向键、功能键、小键盘和 Windows `Win` 键；发生系统冲突时会保留原来的有效快捷键。

### 2. 输入

直接输入应用名、路径、网址或命令。列表支持方向键循环选择，`Enter` 执行，`Esc` 关闭。

### 3. 继续工作

搜索窗口会记住你的设置，但默认不会在空输入时塞入最近使用项目。需要时，可在设置中分别开启最近使用、剪贴板历史和最近文件。

## 常用输入示例

| 输入 | 结果 |
| --- | --- |
| `docker` | 启动 Docker |
| `微信` / `wx` / `weixin` | 按应用名称、别名或拼音检索本机应用 |
| `抖音 海贼王` | 在默认浏览器打开抖音搜索结果 |
| `https://example.com` | 直接打开网址 |
| `~/Downloads` | 打开本地目录 |
| `/Users/me/Projects/demo` | 打开 macOS 路径 |
| `C:\\Projects\\demo` | 打开 Windows 路径 |
| `vscode /Users/me/Projects/demo` | 使用 VS Code 打开项目目录 |
| `terminal C:\\Projects\\demo` | 在终端中打开 Windows 项目目录 |
| `1024*8` | 计算并复制结果 |
| `10gb to mb` | 单位换算并复制结果 |
| `timestamp 0` | 转换时间戳并复制 UTC 时间 |
| `json {"name":"quick"}` | 格式化 JSON 并复制 |
| `url编码 海贼王` | URL 编码并复制 |
| `base64 hello` | Base64 编码并复制 |
| `大写 hello` | 转换大小写并复制 |
| `锁屏` / `睡眠` / `截图` | 执行白名单内的系统操作 |

> 剪贴板处理命令不带内容时，会处理当前剪贴板；例如只输入 `json` 即可格式化当前剪贴板中的 JSON。

## 把任何网站变成快捷命令

进入 **设置 → 快捷命令 → 新增命令**，选择“站点搜索模板”，填入一个包含 `{query}` 的 HTTPS 地址：

| 关键词 | 搜索地址模板 |
| --- | --- |
| `b站` | `https://search.bilibili.com/all?keyword={query}` |
| `github` | `https://github.com/search?q={query}` |
| `知乎` | `https://www.zhihu.com/search?type=content&q={query}` |

保存后，输入：

```text
b站 海贼王
github electron
知乎 React
```

Quick Launcher 会对关键词进行 URL 编码，再交给默认浏览器打开。模板只接受 `http://` 或 `https://`，并且必须恰好包含一个 `{query}`，避免把不安全地址带入执行流程。

## 自定义命令

除了站点搜索，还可以创建：

- **固定网址**：输入 `docs`，打开项目文档。
- **网页搜索**：创建一个 `搜索` 命令，将后续内容交给 Bing、百度、Google 或自定义搜索引擎。
- **应用参数**：把命令绑定到应用模板，例如用项目目录启动编辑器。
- **应用启动**：为已发现或手动重新定位的本机应用设置更易记的关键词。

命令启用后会立即合并到搜索目录；禁用、编辑和删除也都可以在设置中完成。

## 命令包：把快捷入口带到团队或另一台电脑

Quick Launcher 使用 `.quickcmd.json` 作为命令包文件扩展名。命令包可以携带：

- 固定网址和站点搜索命令
- 软件模板及平台匹配信息
- 启动应用命令

导入时会先显示预览，再处理关键词冲突、命令替换或跳过。包版本和 SHA-256 摘要会被记录，重复导入、降级和同版本内容冲突都会被明确拦截。

应用路径不会下发到 Renderer；如果包中的应用在当前电脑未找到，可以在预览页使用“重新定位”选择本机应用。命令包文件也已写入 macOS 和 Windows 安装包的文件关联配置。

## 图标与跨平台适配

Quick Launcher 会尽量使用操作系统提供的真实应用图标：

- **macOS**：读取应用 Bundle 中声明的 `.icns` 或 PNG 图标，并兼容一部分 iPhone/iPad Wrapper 应用。
- **Windows**：优先读取 `.lnk` 的图标，再尝试 Store 应用、目标程序和快捷方式本身。
- **缓存与降级**：图标会在后台补齐并缓存；单个图标损坏时继续尝试其他候选。操作系统完全无法提供可解码图标时，会显示应用名称缩写，而不是让所有应用共用一个错误图标。
- **Quick Launcher 自身**：同一套图标用于设置页、托盘和安装包。

某些未针对桌面系统发布的 iOS/iPadOS 兼容应用，内部资源由系统资产目录或权限保护，macOS 仍可能无法导出原始图标。这是系统资源访问限制，不是数据库缺失；应用本身仍可被检索和启动。

## 本地数据与安全边界

项目不需要数据库服务或在线账户。设置、应用索引缓存、活动历史和用户命令都以受限的本地 JSON 形式保存。

- Renderer 只接收经过校验的 opaque ID、标题、别名和图标数据，真实路径保留在主进程。
- preload 使用白名单 API，Renderer 不直接获得 Node.js 能力。
- 网址只允许 HTTP(S)；系统操作采用固定白名单，不执行任意 shell 文本。
- 文件搜索有递归深度、结果数量和隐藏目录限制。
- 命令包有大小、深度、字段、版本和摘要校验。

## 开发

### 环境要求

- Node.js `>=22.12.0`
- pnpm `>=10.18.3`
- macOS 或 Windows（用于对应平台的真实应用索引和打包验收）

### 本地运行

```bash
git clone https://github.com/xxxwonking/quick-launcher.git
cd quick-launcher
pnpm install
pnpm dev
```

### 质量检查

```bash
pnpm test                    # Node 与 Renderer 单元测试
pnpm run typecheck           # TypeScript 类型检查
pnpm run lint                # ESLint
pnpm run test:e2e            # Electron Playwright E2E
pnpm run build               # Electron 生产构建
```

### 打包

```bash
pnpm run dist:mac            # macOS ARM64：DMG + ZIP
pnpm run dist:win            # Windows x64：NSIS 安装包
pnpm run dist:mac:universal  # macOS Universal：DMG + ZIP
```

打包产物会写入 `release/`。当前 macOS 配置使用 ARM64 目标，并关闭了本地代码签名；正式分发前还需要配置开发者签名、公证和自动更新服务。

## 项目结构

```text
quick-launcher/
├── src/main/              # Electron 主进程、索引、缓存、原生能力
├── src/preload/            # Renderer 与主进程之间的白名单桥接
├── src/renderer/           # React 搜索窗口、设置页与教程
├── src/shared/             # IPC、命令、设置和目录模型
├── resources/catalog/      # 内置软件模板
├── build/                  # macOS / Windows / 通用图标资源
├── tests/e2e/              # Electron Playwright 端到端测试
└── electron-builder.yml   # 跨平台打包与文件关联配置
```

## 当前状态与路线

当前版本是可运行的预览版，核心搜索、应用索引、图标加载、快捷命令和跨平台打包链路已经建立。

后续工作包括：

- 更多 Windows/macOS 软件模板
- Windows 文件关联和应用重新定位的真实机器验收
- macOS 快捷键冲突、多显示器和窗口激活的实机验收
- macOS 签名、公证、自动更新和公开发布流程

AI 翻译快捷命令暂不接入，等待模型、费用和隐私策略确定后再实现。

## 相关文档

- [开发状态与验收记录](docs/DEVELOPMENT_STATUS.md)
- [macOS 图标与站点快捷命令计划](docs/superpowers/plans/2026-08-24-icon-and-site-shortcuts.md)
- [命令包功能计划](docs/superpowers/plans/2026-09-03-command-package-completion.md)

<br />

<div align="center">
  <sub>Built for the moments between intention and action.</sub>
</div>
