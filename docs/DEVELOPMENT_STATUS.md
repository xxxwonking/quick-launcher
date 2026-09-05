# Quick Launcher 开发进度

更新时间：2026-09-04

## 当前阶段

当前位于 Windows M1 核心启动器阶段，工作分支为 `feat/m1-ui`。代码已经具备可运行的 Electron/React 基础和真实 Windows 应用索引闭环，当前提交用于同步已完成部分。

## 已完成

- Electron + React + TypeScript + Tailwind 基础工程和 Windows PowerShell 开发命令。
- 沙箱 preload、`contextIsolation`、关闭 `nodeIntegration`，Renderer 只获得白名单 `window.launcher` API。
- 无边框常驻搜索窗口、独立设置窗口、托盘入口、Esc 隐藏和重新唤起时自动聚焦。
- 全局快捷键注册与冲突状态；首选快捷键冲突时不再静默替换备用组合。设置页录入使用物理键位解析，兼容 macOS Option 变音输入、Windows Win 键、空格、方向键、功能键、标点和小键盘，并拒绝仅修饰键、重复事件及不支持的 accelerator。
- 系统浅色/深色主题、自定义主题偏好和系统主题变化监听。
- 搜索运行时索引中的应用名、别名、中文拼音全拼、拼音首字母，并对全角字符和连续 Unicode 空白做归一化；同时支持精确/前缀/包含及受控 Damerau-Levenshtein 容错匹配（短查询不启用模糊匹配）、内置 `setting`/`tutorial` 命令、`抖音 <关键词>` 站内搜索和网页兜底；`llq` 缺少关键词时显示不可执行提示，输入限制为 512 个 Unicode 字符；不再使用静态演示应用作为回退。
- 快捷命令新增可配置站点搜索模板：模板必须是 HTTP(S) 且恰好包含一个 `{query}`，例如关键词 `b站` 配合 `https://search.bilibili.com/all?keyword={query}` 后，可输入 `b站 海贼王`。
- 输入 HTTP(S) 网址可直接打开；输入 macOS、Windows 绝对路径或 `~/` 路径可直接打开文件/文件夹。
- 本地生产力命令支持安全算术（不使用 `eval`）、`10gb to mb` 数据单位换算、`timestamp 0` 时间戳转换，以及 JSON 格式化、URL 编解码、严格 Base64 编解码和大小写转换；Base64 解码会拒绝非法字符、错误填充和无法通过规范化校验的输入，结果写入剪贴板。
- 浏览器打开失败时提供绑定当前窗口、5 分钟过期且只能消费一次的复制网址 token；最终 URL 只在主进程内部写入剪贴板，Renderer 不接收或提交原始 URL。
- 应用参数命令支持 `vscode <绝对路径>`、`terminal <绝对路径>`；系统白名单操作支持 `锁屏`、`睡眠`、`截图`、`系统设置`，不会执行任意 shell 文本。
- `↑`/`↓` 循环选择、输入框持续聚焦、Enter 执行、Ctrl/Cmd+Enter 网页搜索、Esc 关闭；查询变化时会在首帧同步重置选中项，避免旧的精确匹配短暂闪烁。
- 下一步/上一步/跳过/完成的漫游式教程，并支持键盘操作。
- Windows 桌面和 Start Menu 快捷方式索引：桌面使用系统真实桌面路径且只扫描顶层，Start Menu 支持受限递归扫描。
- Windows 应用索引进一步合并注册表 App Paths（32/64 位视图）、`Get-StartApps` 的合法 AppUserModelID，以及 Program Files/用户程序目录中的独立 `.exe`；每个来源独立失败可降级，扫描深度和数量有上限，PowerShell 只执行固定查询。合法 Store 应用通过固定的 `explorer.exe shell:AppsFolder\\<AUMID>` 激活。
- 索引结果只向 Renderer 暴露 `shortcut:<hash>` opaque ID、名称、别名和拼音；真实路径只保留在主进程。
- 应用索引支持 `app-index.json` 原子缓存：启动时优先加载上一次有效快照并立即提供搜索结果，随后后台扫描发布新快照；缓存限制 10 MiB/20,000 条记录，损坏或超深 JSON 会隔离为 `.corrupt-*` 文件，不影响用户配置。
- indexed 应用执行、路径失败提示、索引刷新后的 Renderer 更新，以及 E2E 模式的副作用隔离。
- 原子 settings JSON 写入、Bing/Baidu/Google/custom 搜索引擎的数据模型和网页 URL 安全校验。
- 自定义搜索引擎模板支持本地编辑，只有失焦或按 Enter 且模板完整有效时才写入配置，避免输入半成品 URL 时被主进程校验重置。
- 设置页面已支持常规、快捷命令、外观、教程分区；快捷键录入、开机启动、搜索引擎和自定义模板均通过主进程 IPC 持久化。
- 设置页会对旧版本或字段不完整的配置快照补齐默认值，避免新增开关出现受控状态异常；主进程诊断日志统一写入 stderr。
- 开机启动配置会在调用系统 API 后校验登录项状态；macOS 返回 `requires-approval` 时回滚配置并提示用户到系统设置的“登录项”中批准，不再把系统拒绝误报为成功。
- 最近使用显示已加入设置项，默认关闭；关闭时搜索框空输入保持空列表，开启后展示成功使用过的应用。最近使用仅持久化 opaque ID，启动或刷新目录后从当前应用目录重新恢复并清理失效记录，不保存真实路径。
- 自定义命令支持新增、编辑、启用/禁用、删除，启用后立即合并到搜索目录并支持固定网址、网页搜索或参数化站点搜索。
- 剪贴板历史默认关闭并由用户主动开启；最近文件历史默认开启。两类历史都只保存在本机、去重并限制条数，可通过 `剪贴板历史` 或 `最近文件` 找回，也可在设置中按类型清空。
- macOS 应用索引适配：扫描 `/Applications`、`~/Applications`、`/System/Applications`，并只合并位于这些根目录下的 Spotlight `.app`，过滤嵌套 Helper 和 `/System/Library` 内部代理；Bundle ID 在 Spotlight `mdls` 不可用时回退读取应用包内的 `Info.plist`，兼容未被 Spotlight 索引的 Wrapper 应用。
- macOS 图标加载会优先读取 `Info.plist` 中声明的图标资源，将 Electron 无法直接解码的 iPhone/iPad 兼容应用 PNG 通过 `sips` 规范化并缓存，并按资源优先级保留多个候选图标，单个损坏时继续尝试后续资源；图标加载使用有界并发、合并同一路径的并发请求且失败项可在刷新时重试，首批文本目录先发布、图标在后台补齐，并用刷新代数丢弃过期结果；应用退出前会等待已开始的图标任务结束，避免缓存目录被并发写入。Windows 优先读取 `.lnk` 记录的图标路径，商店应用会尝试通过 `shell:AppsFolder` 的 AUMID 读取图标，再回退到目标程序和快捷方式本身；下发 Renderer 前限制为有限大小的图片 Data URL，异常格式回退到字标。
- macOS Bundle 图标读取失败时会回退 Electron 系统图标接口，覆盖没有独立 `.icns` 文件的兼容应用。
- 当操作系统和应用包都无法提供可解码图标时，搜索结果会显示应用名缩写字标作为可区分的视觉兜底；Renderer 在图片数据解码失败时也会切换到该字标，不再让所有应用都显示同一个代码图标或破损图片。
- 托盘图标使用与安装包一致的完整彩色 Quick Launcher 图标；开发环境、macOS 和 Windows 打包环境均优先读取资源文件，资源损坏时安全回退；macOS 传入 Tray 前会将高清应用图标适配为 18×18 菜单栏图标并关闭模板渲染，避免原始 1024×1024 资源撑大状态栏项目或变成白色方块。
- macOS 使用与 Windows 相同的 opaque 应用 ID 和主进程启动路径；设置页将快捷键显示为 `Option + Space`。
- 基础软件模板目录已加入严格校验的数据层，开发环境和正式打包均会读取 `resources/catalog/base.json`；模板别名会合并到 macOS/Windows 应用索引，平台标识暂为后续精确匹配预留。
- 内置软件模板已扩展 Slack、Discord、Obsidian、Notion、Spotify、Figma、iTerm2、Terminal、Safari、Firefox、Brave、Raycast、Alfred、IINA、Proxyman、Tailscale、JetBrains Toolbox、Xcode、Cherry Studio、活动监视器、Docker 和 QQ，继续使用 Bundle ID、exe 名称及 AppUserModelID 的精确匹配，不会凭模板制造虚假搜索结果。
- 设置页新增“软件模板”分区，支持查看内置模板、显示支持平台、一键启用/关闭和手动刷新应用索引；状态持久化到本地设置，并在变更后立即刷新应用索引。
- 软件模板列表复用本地应用索引的真实图标缓存，后台加载及刷新完成后自动更新；关闭模板别名仍显示已匹配的图标，未安装、提取失败或图片解码失败时保留首字占位。
- 图标匹配所需的 Bundle ID、exe 发布者等身份信息按全部模板采集，搜索别名仍只合并已启用模板，避免关闭别名后刷新索引导致图标丢失；Windows 主进程集成测试覆盖这一流程。
- 移除 VS Code、微信的历史硬编码别名，模板别名统一由已启用且身份匹配的模板提供；关闭模板后仍保留软件原名及通用拼音匹配。软件模板页区分加载中、加载失败和真正空列表，提供失败重试入口。
- 应用模板平台信号已参与匹配：macOS 读取应用 Bundle ID，Windows 读取 `.lnk` 的真实目标 exe 名称；元数据仅在主进程用于匹配，不会下发给 Renderer。
- Windows 模板匹配会优先使用精确 AppUserModelID；模板一旦声明 AUMID 就要求扫描结果提供且精确匹配，模板声明 publisher 时要求 exe 与 publisher 同时精确匹配，并对命中模板 exe 的 Windows 文件版本信息补充 CompanyName，读取失败时安全降级。
- 命令包导入已支持 `.quickcmd.json` 的严格校验、文件选择、只读预览、ID/关键词冲突处理、内置/包内应用模板和 `launch_app`；包快照会原子保存版本与 SHA-256 digest，重复导入、同版本内容冲突、降级和升级均有明确状态，升级会替换包所属命令并保留旧配置的原子性；用户手动编辑过的包命令会转为用户命令并在升级时保留，预览页会展示应用/命令变更摘要，并在应用模板尚未匹配本机索引时提示“待发现应用”。
- 命令包预览支持“重新定位”未发现的应用：设置页只提交受校验的应用引用，主进程通过系统文件选择器接受 Windows `.exe/.lnk` 或 macOS `.app`，验证可读性后将绑定原子保存到 `user.json.appBindings`；手动绑定优先于自动扫描，路径不会暴露给 Renderer。
- 应用绑定会在启动、应用刷新和命令执行前检查目标是否仍存在且可读；失效绑定从可启动索引中排除，并提示用户在命令包预览中重新定位。手动绑定的 Windows 应用即使缺少扫描元数据，也会保留对应模板别名。
- 命令包文件关联已写入 macOS/Windows 打包元数据；主进程支持 macOS `open-file` 和 Windows 第二实例参数接收，并通过待处理 IPC 将文件交给设置页预览。
- 命令包启动参数解析已抽成跨平台校验函数：忽略 Electron 启动 flag，大小写不敏感识别 `.quickcmd.json`，同时保留 Windows/macOS 绝对路径和开发环境相对路径。
- 文件搜索已接入受限后台索引：默认扫描桌面、文档、下载目录，跳过隐藏和生成目录，结果数量与递归深度受控；真实路径留在主进程，支持打开文件与文件夹。
- 文件搜索目录可在设置中通过系统目录选择器配置，配置由主进程校验并持久化；目录变更后会立即重建文件索引，清空配置即可恢复默认目录。
- 文件搜索目录也会被监听，新增、删除或修改文件后经 250ms 防抖更新索引；可定位的文件事件只增量更新受影响路径，系统未提供文件名时自动回退到完整扫描；清空自定义目录会让扫描和监听一致恢复桌面、文档、下载三个默认目录；监听范围随设置目录变更而安全替换，退出时统一清理。
- 应用索引会监听 macOS 应用目录和 Windows 快捷方式/程序目录，变更经过 250ms 防抖后自动刷新；监听器运行中遇到目录删除或权限错误时会提交未知变化并触发完整刷新，同时每 2 秒尝试重新挂载失效或启动时缺失的目录，缺失或无权限目录会被隔离，退出时统一关闭监听器。
- GitHub Actions 已加入跨平台质量与打包流水线：Linux 执行质量门禁，macOS 真实生成 ARM64 dmg/zip，Windows runner 真实生成 x64 NSIS 安装包并上传产物。

## 验证结果

本阶段已通过：

- Node 单元测试
- Renderer 单元测试
- TypeScript 类型检查
- Electron 生产构建
- Electron Playwright E2E：隐藏/重新唤起、焦点、独立设置窗口、preload 安全边界、网页搜索 IPC、命令包文件关联入口、冷启动导入和重启恢复
- macOS 与 Windows CI 会额外执行 Electron E2E；macOS 覆盖窗口尺寸、真实应用图标补齐，Windows 覆盖设置窗口、应用模板刷新、命令包导入/恢复和 preload 安全边界。
- `git diff --check`

最终提交前会再次运行完整验证矩阵，以提交输出为准。

## 尚未完成

以下是下一阶段工作，不应视为当前已完成能力：

- 更多 Windows/macOS 软件模板内容。
- 命令包文件关联的 Windows 实机验收，以及 Windows runner 上的实际安装后文件关联验收。
- 应用重新定位的真实 Windows/macOS 文件选择器验收，以及不同系统权限策略下的绑定恢复流程。
- AI 翻译快捷命令暂不实现，等待后续确定模型接入、费用和隐私策略。
- macOS 其余适配验收：真实 macOS 快捷键冲突、窗口激活、多显示器行为、签名、公证、自动更新和公开发布流程。

## 远端同步

已配置：`git@github.com:xxxwonking/quick-launcher.git`。当前代码将提交到 `feat/m1-ui` 分支；后续可在 GitHub 上创建 Pull Request 合并到 `master`。
