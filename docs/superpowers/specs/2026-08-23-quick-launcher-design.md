# Quick Launcher 设计规格

- 日期：2026-08-23
- 状态：设计已确认
- 工作名称：Quick Launcher
- 首版定位：个人验证版本，完成后同时支持 Windows 与 macOS

## 1. 产品概述

Quick Launcher 是一个常驻后台的桌面快速启动器。用户通过全局快捷键打开搜索窗口，输入应用名称、拼音、快捷词或自定义参数命令，然后通过键盘立即执行。

核心体验：

1. Windows 默认使用 `Alt + Space`，macOS 默认使用 `Option + Space`。
2. 本地应用结果优先；网页搜索作为同一列表中的兜底动作。
3. 支持应用名、拼音全拼、拼音首字母、容错匹配和用户自定义快捷词。
4. 支持参数命令，例如 `llq 抖音` 使用默认搜索引擎搜索“抖音”。
5. 支持内置 `base.json` 模板和外部 `*.quickcmd.json` 命令包。
6. 窗口、搜索索引和搜索 Worker 常驻，追求预热后的即时响应。

### 1.1 术语

- “受控子窗口”：由同一主进程创建并登记的设置窗口、导入预览窗口或主进程系统选择器。
- “临时置顶”：搜索窗口显示期间启用 always-on-top，隐藏前立即关闭，不影响设置窗口和其他应用。
- “最近使用”：存在成功执行历史的应用，按最后成功时间降序排序。
- “浏览器打开成功”：操作系统接受默认浏览器打开请求；不保证远端页面加载成功。
- “应用启动成功”：平台启动 API 在 3 秒内接受目标；不等待第三方应用完成全部初始化。
- “首版”：M1、M2、M3 三个里程碑的总和；下一份实施计划只覆盖 M1。

## 2. 目标与非目标

### 2.1 首版目标

- 在 Windows 与 macOS 上通过全局快捷键快速唤起。
- 可靠地检测快捷键冲突，不在冲突状态下假装注册成功。
- 索引已安装的应用并缓存结果，不在输入时扫描磁盘。
- 支持应用搜索、应用快捷词、固定网址和参数化网页搜索。
- 提供设置界面管理快捷命令。
- 支持内置模板一键启用和外部 JSON 命令包的安全导入。
- 提供托盘、首次启动设置和用户确认后的开机自启。
- 在错误发生时继续保持后台主进程可用。

首版按三个可独立验收的里程碑交付：

- M1（Windows 核心）：常驻搜索窗口、全局快捷键、Windows 应用索引、搜索/命令匹配、网页兜底、设置和托盘。
- M2（macOS 适配）：macOS 应用索引、窗口定位/激活、快捷键与开机自启适配、未签名测试包。
- M3（命令包）：`*.quickcmd.json` 文件校验、导入预览、单实例转发和安装器文件关联。

M1 是第一可用切片；M2、M3 仍属于首版范围，但不要求在同一个迭代中同时完成。

### 2.2 首版非目标

- 不搜索文件或文件内容。
- 不执行 Shell、PowerShell、AppleScript、批处理或任意脚本。
- 不提供在线模板市场。
- 不提供账户、云同步或多人配置管理。
- 不提供自动更新服务。
- 不进行正式 macOS 签名、公证或 Mac App Store 发布。
- 不为首版引入 Rust；只有性能测试证明 JavaScript/TypeScript 搜索成为瓶颈时才考虑原生模块。
- 不在首版提供配置导出；导入格式保持可由第三方工具生成。

## 3. 平台与发布方式

### 3.1 技术路线

- Electron
- TypeScript
- Electron 主进程负责系统能力。
- Renderer 负责搜索与设置界面。
- 常驻 Worker 负责命令解析、匹配和排序。
- Preload 仅暴露白名单 IPC 接口。

### 3.2 平台范围

- Windows 11 22H2 或更高版本为首个实现和验证平台。
- macOS 13 Ventura 或更高版本在同一代码库上通过平台适配器实现，完成首版前必须通过验收。
- macOS 首版允许输出未签名的 `.dmg` 或 `.zip` 测试包；用户需要手动通过 Gatekeeper 放行。

Electron accelerator 使用平台明确映射：Windows 默认 `Alt+Space`，macOS 默认 `Alt+Space`（Electron 在 macOS 上映射为 Option）。如果系统或其他程序占用该组合，注册失败并进入首次设置引导；不自动静默替换组合。全局快捷键通常不要求额外系统权限；若系统拒绝窗口激活，设置页显示平台权限检查和重试入口。

### 3.3 发布范围

首版主要供产品拥有者个人使用。公开分发、签名和自动更新能力延后。M3 为了实现双击导入，使用内部测试安装包注册文件关联：Windows 通过 electron-builder `fileAssociations`，macOS 通过应用包 `CFBundleDocumentTypes`；这不等同于公开发布或正式签名。

## 4. 用户体验

### 4.1 首次启动

首次启动显示简短设置页：

1. 尝试注册平台默认快捷键。
2. 如果注册失败，显示冲突并要求重新录入；冲突快捷键不会被启用。
3. 询问是否开机自启，复选框默认勾选，但只有用户确认后才写入系统设置。
4. 默认网页搜索引擎为必应，可稍后改成百度、Google 或自定义模板。
5. 显示已检测应用可用的基础快捷模板，用户决定是否启用。

### 4.2 搜索窗口

- 窗口在当前鼠标所在显示器的工作区水平居中，距离工作区顶部 18% 高度处显示；窗口宽度为工作区宽度的 42%，限制在 560--820 px，高度由结果数量决定但不超过工作区高度的 55%。
- 窗口无边框，显示时临时置顶，隐藏时解除置顶。
- 窗口在应用启动时预创建并保持隐藏，快捷键触发时不重新创建 Renderer。
- 每次重新打开默认清空上一次输入。
- `Esc` 或窗口失去焦点时隐藏。
- 打开设置页、导入预览或系统选择器时，不因这些受控子窗口失焦而误隐藏；只有焦点转移到非 Quick Launcher 窗口时才隐藏。
- 空输入显示最近使用的 8 个应用；没有历史时显示已启用的 `launch_app` 命令，按 keyword、显示名和稳定 ID 排序。

### 4.3 键盘和鼠标

- `↓` 选择下一项。
- `↑` 选择上一项。
- 首尾循环切换。
- 切换时输入框持续保持 DOM 焦点，用户可以立即继续输入。
- 选中项自动滚动到可见区域。
- `Enter` 执行当前选中结果。
- `Ctrl + Enter`（Windows）或 `Cmd + Enter`（macOS）直接网页搜索当前普通输入。
- `Esc` 隐藏窗口。
- 鼠标可悬停和点击结果，但界面不额外显示可点击的上下箭头按钮。

### 4.4 托盘

托盘菜单至少包括：

- 打开搜索
- 设置
- 刷新应用索引
- 开机自启开关
- 退出

关闭搜索窗口只是隐藏窗口；只有托盘“退出”才结束主进程。

## 5. 搜索与命令规则

### 5.1 输入规范化

普通搜索在匹配前执行：

- 使用 Unicode NFKC 规范化，将全角英数字转换为兼容形式。
- 去除首尾 Unicode 空白，内部连续空白折叠为一个 ASCII 空格。
- 使用 Unicode 小写折叠进行比较，但保留未经规范化的原始文本用于显示和网页查询。
- 支持中文应用名、拼音全拼和拼音首字母。
- 快捷词只能由 1--32 个 Unicode 字母、数字、汉字、连字符或下划线组成，不包含空白。
- 用户快捷词在“规范化后”的全局命令命名空间中唯一；应用命令、固定网址和参数命令不能共享同一个快捷词。
- 首版不实现引号、反斜杠转义或多参数语法。参数命令的第一个空格分隔快捷词与剩余完整参数。

### 5.2 命令类型

首版只允许三类动作：

1. `launch_app`：打开索引中已经识别的应用。
2. `open_url`：使用默认浏览器打开固定的 HTTP/HTTPS 地址。
3. `web_search`：把参数编码后填入搜索网址模板。

示例：

- `wx` → 打开微信。
- `cursor` → 打开 Cursor。
- `dy` → 打开固定的抖音网址。
- `llq 抖音` → 使用当前默认搜索引擎搜索“抖音”。

`llq` 与参数之间使用一个或多个空格，不使用字面量 `+`。输入只有 `llq` 或 `llq` 后只有空白时，结果列表返回不可执行的 `hint` 行“请输入搜索内容”。

### 5.3 命令模式

命令解析遵循确定性决策：

1. 取规范化输入的第一个 token。
2. 如果该 token 精确匹配一个已启用 `web_search` 快捷词，且分隔空白后的剩余参数非空，则进入参数命令模式。
3. 如果该 token 精确匹配参数命令但剩余参数为空（包括输入只有 `llq` 或只有空白），返回一个 `hint` 行。
4. 否则整个输入按普通搜索处理；参数命令前缀不参与模糊匹配。

由于快捷词全局唯一，同一输入不可能命中多个参数命令。进入参数命令模式后：

- `llq 抖音` 只显示参数命令动作，不混入普通应用结果。
- 参数保留用户输入内容，仅对搜索网址进行 URL 编码。
- 完整参数命令按 `Enter` 执行。

输入状态机：

| 状态 | 判定 | 结果 | `Enter` | `Ctrl/Cmd + Enter` |
| --- | --- | --- | --- | --- |
| `empty` | 规范化输入为空 | 最近使用/默认命令 | 执行选中项 | 无动作 |
| `command-prefix-no-arg` | 精确参数命令，无有效参数 | 单个不可执行 hint | 无动作 | 无动作 |
| `command-with-arg` | 精确参数命令且参数非空 | 单个参数命令 action | 搜索参数 | 同 `Enter`，只搜索参数 |
| `ordinary` | 其他非空输入 | 本地候选 + 网页兜底 | 执行选中项 | 执行网页兜底 |

### 5.4 普通搜索排序

匹配优先级不可跨级：

1. 参数命令。
2. 精确用户快捷词。
3. 精确应用名称。
4. 名称前缀、拼音全拼和拼音首字母。
5. 容错模糊匹配。
6. 网页兜底。

启动次数和最近启动时间只能调整同一匹配等级内部的顺序，不能让高频应用超过精确命令或精确名称。

最多显示 8 个本地候选。普通输入非空时，再追加 1 个网页兜底，因此总结果最多 9 项；没有本地候选时网页兜底成为第 1 项并自动选中。空输入不显示空白网页搜索动作。

精确快捷词与精确应用名称同时命中时，快捷词优先；多个应用显示名称相同时，先按同等级使用历史排序，再按稳定应用 ID 排序，确保结果可重复。

### 5.5 结果契约

SearchWorker 只返回以下判别联合：

```ts
type SearchItem =
  | { kind: 'action'; actionId: string; title: string; subtitle: string; iconRef?: string; executable: true }
  | { kind: 'web-fallback'; query: string; title: string; executable: true }
  | { kind: 'hint'; code: 'missing-argument' | 'empty-state'; title: string; executable: false }

interface SearchResponse {
  queryId: number
  snapshotVersion: number
  items: SearchItem[]
}
```

`SearchSnapshot` 是主进程与 Worker 之间传输的纯数据 DTO：

```ts
interface SearchSnapshot {
  configVersion: number
  applications: Array<{ actionId: string; displayName: string; aliases: string[]; pinyin: string; initials: string[]; iconRef?: string }>
  commands: Array<{ actionId: string; keyword: string; type: 'launch_app' | 'open_url' | 'web_search'; title: string; targetRef: string }>
  usage: Record<string, { count: number; lastUsedAt: string | null }>
}
```

快照只包含已验证的内部 action ID 和脱敏显示数据，不包含可执行绝对路径；ActionService 通过 action ID 回查主进程注册表。

### 5.6 过期查询与快照

每次查询包含单调递增的 `queryId`，每个命令快照包含单调递增的 `snapshotVersion`。Renderer 只接受同时匹配当前查询和当前快照的结果；较慢返回的旧查询或旧配置结果被丢弃，避免快速输入或导入配置时列表回跳。

Worker 异常退出时由 `SearchWorkerSupervisor` 创建新 Worker，清空待处理请求，以最新快照重新预热并重放当前输入一次。恢复期间 Renderer 显示非阻塞的“正在恢复搜索”状态，主进程继续运行。

### 5.7 固定匹配算法与空状态 fixture

拼音由固定版本的 `pinyin-pro` 词典生成；多音字取词典默认读音，不做上下文猜测。模糊匹配使用归一化字符串的 Damerau-Levenshtein 距离：查询长度 1--3 时只接受距离 0，长度 4--7 接受距离不超过 1，长度 8 及以上接受距离不超过 2；距离不满足阈值的候选不进入模糊等级。匹配分数依次比较等级、编辑距离、匹配字段优先级（keyword > displayName > pinyin > initials）、使用次数降序、最近时间降序、稳定 ID 升序。

固定 fixture：

| 输入 | 结果（按顺序） |
| --- | --- |
| 空字符串 | 最近使用应用（无历史时为已启用命令，再按显示名升序）；无网页项 |
| `wx`，用户命令 `wx -> 微信` | 微信 action；网页 fallback |
| `weixn`，无快捷词 | 微信 fuzzy action；网页 fallback |
| `llq` | `hint(missing-argument)`；无网页 fallback |
| `llq   抖音` | web-search action（参数为“抖音”）；无其他结果 |
| `cursor` 同时是用户 keyword 和应用名 | 用户 keyword action；应用名 action 作为下一匹配等级 |

“最近使用”定义为 `usage.json` 中成功执行次数大于 0 的条目，按最近时间降序、稳定 ID 升序；没有历史时“已启用命令”按 keyword 升序后再按显示名升序。

## 6. 总体架构

模块责任表：

| 模块 | 读取 | 唯一写入/副作用 | 输出 |
| --- | --- | --- | --- |
| SettingsStore | `settings.json` | `settings.json`、快捷键/自启协调 | 设置快照 |
| ConfigStore | `user.json` | `user.json` 事务 | 带 configVersion 的用户配置 |
| UsageStore | `usage.json` | `usage.json` | 使用历史快照 |
| ApplicationIndexer | 平台来源、`app-index.json` | `app-index.json`、目录监听 | 应用快照 |
| CommandRegistry | base、用户配置、应用/历史快照 | 无文件写入 | SearchSnapshot |
| PackageImporter | opaque import token、Schema | 无直接文件写入 | ConfigStore patch/预览 |
| SearchWorkerSupervisor | SearchSnapshot | Worker 生命周期 | SearchResponse |
| ActionService | 已注册动作 | 启动应用/浏览器、写 UsageStore | 执行结果 |

CommandRegistry 是纯合并层，PackageImporter 是纯校验/变更集生成层；只有表中 owner 能写对应文件。

### 6.1 Electron 主进程

主进程是唯一能够调用系统能力和修改持久化配置的进程。

#### HotkeyManager

职责：

- 注册、注销和测试全局快捷键。
- 使用 Electron 注册结果判断冲突。
- 保存快捷键前再次实际注册验证。
- 快捷键改变失败时保持上一组有效设置。

规范接口：

```ts
register(accelerator: string): HotkeyRegistrationResult
replace(previous: string, next: string): HotkeyRegistrationResult
unregisterAll(): void
```

`replace` 使用双阶段交换：先尝试注册 `next`，成功后再注销 `previous`；如果 `next` 失败，保留 `previous` 的注册和持久化值不变。退出或系统注销时统一注销当前有效组合。

#### WindowController

职责：

- 创建并预热搜索窗口。
- 在快捷键触发时选择当前鼠标所在显示器并定位窗口。
- 执行显示、置前、激活和聚焦流程。
- 管理失焦隐藏、临时置顶和设置/导入子窗口。

聚焦顺序：

1. 显示 BrowserWindow。
2. 请求系统将窗口置前并激活。
3. 聚焦 BrowserWindow 和 webContents。
4. 通知 Renderer 清空输入并聚焦搜索框。
5. Renderer 在下一动画帧验证焦点，必要时只重试一次。

不得无限循环抢夺焦点。普通快捷键冲突应在注册阶段解决，而不是靠持续抢焦点掩盖。

#### ApplicationIndexer

职责：

- 加载和保存 `app-index.json`。
- 启动时立即提供缓存快照。
- 在后台扫描系统应用来源。
- 监听相关应用目录变化，经过防抖后增量刷新。
- 扫描失败时保留旧缓存。

平台适配器接口：

```ts
interface ApplicationSource {
  scan(): Promise<DiscoveredApplication[]>
  watch(onChange: () => void): Disposable
}

interface LaunchTarget {
  kind: 'windows-shortcut' | 'windows-uwp' | 'macos-bundle'
  stableId: string
  displayName: string
  canLaunch(): Promise<boolean>
  launch(): Promise<LaunchResult>
}
```

平台适配器：

- Windows：开始菜单快捷方式和已解析的 App Paths；UWP/Store 只纳入拥有可验证 AppUserModelID 的条目，使用 `shell:AppsFolder\\<AUMID>` 启动。
- macOS：`/Applications`、`~/Applications` 和 LaunchServices 可识别的 `.app` Bundle，使用 Bundle ID 或已验证 Bundle URL 启动。

应用记录使用稳定平台标识，如 Windows AppUserModelID/已解析快捷方式信息或 macOS Bundle ID。路径只属于机器缓存，不写进官方模板。每个启动目标必须先通过 `canLaunch()`；失效目标返回 `APP_NOT_FOUND`，启动调用超过 3 秒返回 `APP_LAUNCH_TIMEOUT`。

#### CommandRegistry

职责：

- 加载 `base.json` 和 `user.json`。
- 将基础模板、导入模板、用户修改和应用索引解析为统一命令快照。
- 保证快捷词不区分大小写地唯一。
- 在配置改变后向 SearchWorker 推送新快照。

有效配置优先级：

1. 用户显式修改。
2. 用户确认导入的模板副本。
3. 内置基础模板默认值。

`base.json` 更新不能覆盖已经写入 `user.json` 的用户字段。

#### PackageImporter

职责：

- 接收设置页选择、拖放或系统双击传入的 `*.quickcmd.json`。
- 检查扩展名、文件大小、JSON 语法、Schema 版本和动作安全性。
- 生成只读导入预览，不直接写配置。
- 处理逐项“替换、重命名、跳过”。
- 用户确认后将变更提交给 `ConfigStore`，由唯一持久化 owner 一次性原子写入 `user.json`。

如果目标应用当前未安装，允许导入模板，但命令标记为“应用不可用”，不会执行；用户可以稍后重新扫描或通过主进程系统选择器重新定位已索引应用。

“重新定位应用”只允许由主进程打开系统文件选择器：Windows 过滤 `.exe` 或已验证的快捷方式目标，macOS 过滤 `.app` Bundle。主进程检查所选目标是本地普通文件/Bundle、可读、平台格式正确，并用对应的 `appRef` 生成或更新 `app-index.json` 中的用户覆盖记录；失败时不改变旧记录。Renderer 只能提交内部 `appRef`，不能提交路径。

#### ActionService

职责：

- 根据内部动作 ID 启动应用。
- 使用默认浏览器打开固定网址。
- 使用配置的搜索模板生成并打开网页搜索网址。
- 记录成功启动的使用次数与最近时间。

Renderer 不得提交任意可执行路径或任意系统命令。它只能请求执行 CommandRegistry 已注册的动作 ID 和已验证参数。执行错误使用固定枚举：`APP_NOT_FOUND`、`APP_TARGET_INVALID`、`APP_LAUNCH_FAILED`、`APP_LAUNCH_TIMEOUT`、`BROWSER_OPEN_FAILED`、`INVALID_ACTION`；动作参数最长 512 个 Unicode 字符，应用启动超时为 3 秒。

#### SettingsStore

职责：

- 读取、验证、迁移和原子保存设置。
- 管理快捷键、开机自启、搜索引擎和窗口偏好，唯一写入 `settings.json`。
- 写入前创建 `settings.json.bak`，并负责 Schema 迁移和恢复。

#### ConfigStore

`ConfigStore` 是用户命令配置的唯一持久化 owner。它独占 `user.json` 的读取、迁移、事务写入、备份和恢复；`PackageImporter`、CommandRegistry 和设置 UI 不得直接写文件。

- 写入目标：`user.json` 与 `user.json.bak`。
- 事务接口：`prepareImport()`、`commitUserConfig()`、`rollback()`。
- 同一时刻只允许一个写事务；后到的导入请求排队或失败并提示重试。
- 用户命令删除通过 `disabledCommandIds` tombstone 表示，避免内置 `base.json` 更新后重新出现。

#### UsageStore

`UsageStore` 独占 `usage.json`，保存成功执行次数和最近执行时间。历史损坏只重建为空，不影响设置、用户命令或应用索引。

#### AutostartAdapter

平台适配器只接收布尔值并返回明确错误码：`AUTOSTART_ENABLED`、`AUTOSTART_DISABLED`、`AUTOSTART_PERMISSION_DENIED`。SettingsStore 只有在适配器成功后才保存新状态。

平台能力统一错误码：

| 适配器 | 成功 | 可恢复失败 | 不可用/拒绝 |
| --- | --- | --- | --- |
| HotkeyAdapter | `REGISTERED` | `CONFLICT` | `PERMISSION_DENIED`、`INVALID_ACCELERATOR` |
| ApplicationSource | `SCAN_OK`、`WATCHING` | `SCAN_STALE` | `SOURCE_UNAVAILABLE` |
| LaunchTarget | `LAUNCHED` | `APP_NOT_FOUND`、`APP_LAUNCH_TIMEOUT` | `APP_TARGET_INVALID`、`APP_LAUNCH_FAILED` |
| AutostartAdapter | `AUTOSTART_ENABLED`、`AUTOSTART_DISABLED` | `AUTOSTART_RETRY` | `AUTOSTART_PERMISSION_DENIED` |
| BrowserAdapter | `BROWSER_OPENED` | `BROWSER_OPEN_FAILED` | `URL_REJECTED` |

平台适配器必须有可注入的 fake 实现，单元和集成测试不得依赖真实注册表、LaunchServices、默认浏览器或登录项。

### 6.2 SearchWorker

SearchWorker 由主进程通过 Node.js `worker_threads` 创建并常驻，持有预处理后的内存索引。Renderer 不直接创建或管理 Worker；`SearchWorkerSupervisor` 负责生命周期、消息队列和异常恢复。

职责：

- 输入规范化。
- 参数命令识别。
- 应用名、拼音、首字母、快捷词和模糊匹配。
- 按不可跨级规则排序。
- 应用同等级使用历史加权。
- 返回最多 8 个本地候选和网页兜底描述。

规范接口：

```ts
replaceSnapshot(snapshot: { version: number; data: SearchSnapshot }): void
query(request: { queryId: number; snapshotVersion: number; text: string; limit: number }): Promise<SearchResponse>
```

快照替换确认成功后，CommandRegistry 才发布新的 `snapshotVersion` 给 Renderer。Worker 崩溃时 Supervisor 拒绝并清空未完成 Promise，创建新 Worker，加载最新快照，然后只重放 Renderer 当前输入；最多连续重启 3 次，仍失败时退化到主线程的“精确快捷词/精确应用名”最小搜索并显示故障提示。

### 6.3 Renderer

Renderer 分为搜索窗口和设置/导入界面。

搜索窗口只负责：

- 收集输入。
- 发送查询。
- 渲染结果。
- 维护选中项。
- 处理键盘和鼠标交互。
- 请求执行内部动作 ID。

设置界面至少包含：

- 常规：快捷键、开机自启、搜索引擎。
- 快捷命令：新增、编辑、禁用和删除。
- 基础模板：显示已检测应用可用模板并一键启用。
- 导入：文件选择、拖放导入和导入状态。
- 关于：版本和本地日志入口。

Renderer 开启 context isolation，关闭 Node integration，不直接访问文件系统、注册表、进程启动或系统 Shell。

### 6.4 Preload 与 IPC

Preload 暴露小而稳定的白名单接口，例如：

```ts
launcher.search(query)
launcher.execute(actionId, args)
launcher.executeWebFallback(query)
launcher.getSettings()
launcher.updateSettings(patch)
launcher.chooseImportFile()
launcher.previewImport(importToken)
launcher.commitImport(decisions)
launcher.chooseApplicationTarget(appRef)
launcher.refreshApplications()
```

主进程对所有 IPC 参数做运行时校验，不能依赖 Renderer 的 TypeScript 类型作为安全边界。系统文件选择器由主进程打开，并返回随机、单次使用、5 分钟过期的 opaque token；Renderer 不获得真实路径。拖放文件先经过主进程的规范化、普通文件检查、后缀和大小校验，再换取同类 token。

## 7. 数据文件

运行时数据保存在 Electron `userData` 目录，而不是安装目录。发布包内的 `base.json` 位于应用资源目录，只读。用户目录文件布局固定为：

```text
userData/
  settings.json       # SettingsStore 唯一 owner
  settings.json.bak
  user.json            # ConfigStore 唯一 owner
  user.json.bak
  usage.json           # UsageStore 唯一 owner
  app-index.json       # ApplicationIndexer 唯一 owner，可重建
  logs/
```

任何模块不得越过 owner 直接修改另一模块的文件。

### 7.1 base.json

`base.json` 随应用发布在 `resources/catalog/base.json`，只读且带版本。它保存稳定应用识别规则与建议快捷词，不保存用户机器上的绝对路径。`catalogVersion` 只在发布新应用包时变化；首版没有在线更新目录。

```json
{
  "schemaVersion": 1,
  "catalogVersion": "2026.08",
  "apps": [
    {
      "id": "wechat",
      "displayName": "微信",
      "defaultAliases": ["wx", "wechat"],
      "platforms": {
        "windows": {
          "executables": ["WeChat.exe"],
          "publishers": ["Tencent"]
        },
        "macos": {
          "bundleIds": ["com.tencent.xinWeChat"]
        }
      }
    }
  ],
  "commands": [
    {
      "id": "default-web-search",
      "keyword": "llq",
      "type": "web_search",
      "engine": "default"
    }
  ]
}
```

应用匹配可以综合多个信号评分，不能仅凭通用可执行文件名静默绑定错误应用。

基础目录与外部包共用的应用模板契约：

```ts
interface AppTemplate {
  id: string
  displayName: string
  defaultAliases: string[]
  platforms: {
    windows?: { executables?: string[]; publishers?: string[]; appUserModelIds?: string[] }
    macos?: { bundleIds: string[] }
  }
}
```

模板 `id` 遵循命令 ID 字符规则；`displayName` 为 1--128 字符；别名最多 8 个且均遵循 keyword 规则；每个平台识别数组最多 16 项。所有对象未知字段拒绝。外部包可选携带最多 50 个 `apps` 模板，`appRef` 必须指向同包模板或内置 `base.json` 中的应用 ID；模板只提供识别信号，不得提供绝对路径或启动参数。

### 7.2 user.json

`user.json` 保存用户确认后的有效配置：

- 已启用基础模板。
- 已导入外部模板的副本。
- 用户修改的快捷词。
- 用户创建的固定网址和参数命令。
- 命令启用状态和来源信息。

`user.json` 的顶层契约为：

```json
{
  "schemaVersion": 1,
  "configVersion": 1,
  "commands": [],
  "enabledBaseAppIds": [],
  "disabledCommandIds": [],
  "importedPackages": {}
}
```

`commands` 中的用户命令完全覆盖同 ID 的基础模板；`disabledCommandIds` 是删除/禁用基础命令的 tombstone。ConfigStore 使用 `commit(expectedConfigVersion, patch)` 比较并交换；版本不匹配返回 `CONFIG_CONFLICT`，调用方重新加载并让用户重试。成功写入时递增 `configVersion`，采用“写临时文件 → 刷新 → 原子替换”，保留上次有效备份，然后发布同版本的命令快照。

命令 Schema：`commands` 是数组，最多 1,000 项；每项必须符合 §7.4 的 `QuickCommand`，未知字段拒绝。`enabledBaseAppIds` 和 `disabledCommandIds` 是唯一字符串数组，`importedPackages` 的 key 是 `packageId`，value 为 `{version: string, importedAt: string}`。数组不允许重复值，所有时间使用 ISO 8601 UTC。基础模板命令与用户命令合并后再做一次全局 keyword 唯一性校验；冲突会让提交失败并返回 `KEYWORD_CONFLICT`。

`settings.json` 的顶层契约为：

```json
{
  "schemaVersion": 1,
  "hotkey": { "accelerator": "Alt+Space" },
  "autostart": false,
  "searchEngine": { "kind": "bing", "template": null },
  "window": { "width": 680 }
}
```

未知字段拒绝，缺失字段使用明确默认值；`schemaVersion` 只允许 1，未来迁移必须以纯函数将旧对象转换为新对象并先写备份。`settings.json` 不保存命令、应用路径或使用历史。

### 7.3 app-index.json

`app-index.json` 是可重建缓存，保存：

- 内部应用 ID。
- 平台稳定标识。
- 显示名称。
- 启动目标。
- 图标缓存引用。
- 扫描来源与更新时间。

缓存损坏或版本不兼容时直接重建，不影响 `user.json`。ApplicationIndexer 是 `app-index.json` 的唯一写 owner；缓存写入同样使用临时文件和原子替换。

### 7.4 外部 `*.quickcmd.json`

首版使用扩展名严格为 `*.quickcmd.json` 的单一 JSON 文件，不支持内嵌脚本、二进制文件或压缩资源。文件大小上限 256 KiB，最大 JSON 深度 8，最多 100 条命令，任意字符串最长 512 个 Unicode 字符。

```json
{
  "schemaVersion": 1,
  "packageId": "example.wechat-shortcuts",
  "name": "微信快捷命令",
  "version": "1.0.0",
  "apps": [],
  "commands": [
    {
      "id": "open-wechat",
      "keyword": "wx",
      "type": "launch_app",
      "appRef": "wechat"
    }
  ]
}
```

包顶层允许字段为 `schemaVersion`、`packageId`、`name`、`version`、可选 `apps` 和 `commands`；`apps` 最多 50 项，使用 §7.1 的 `AppTemplate` 契约。允许字段由下面的判别联合严格定义，未知字段拒绝：

```ts
type QuickCommand =
  | { id: string; keyword: string; type: 'launch_app'; appRef: string; title?: string }
  | { id: string; keyword: string; type: 'open_url'; url: string; title?: string }
  | { id: string; keyword: string; type: 'web_search'; engine: 'default' | 'bing' | 'baidu' | 'google'; title?: string }
  | { id: string; keyword: string; type: 'web_search'; engine: 'custom'; template: string; title?: string }
```

约束：`id` 为 1--96 个 ASCII 字母、数字、`.`、`_` 或 `-`，包内唯一；`keyword` 遵循 §5.1；`url` 必须是 HTTP/HTTPS 且不含控制字符；`template` 必须是 HTTP/HTTPS 且恰好包含一个 `{query}`；包名、版本和 `packageId` 必填，版本使用 SemVer；Schema 版本只接受 `1`。所有对象等价于 JSON Schema 的 `additionalProperties: false`。未知字段、重复 ID、重复快捷词、未知 `appRef` 格式或其他动作类型直接拒绝。外部包不得声明任意绝对可执行路径、命令行参数、脚本或动态模块。

重复导入同一 `packageId` 和相同版本默认显示“已导入”，不重复写入；更高版本仅在用户确认后合并；更低版本拒绝并提示已存在更新版本。导入预览只接受主进程通过真实路径读取的文件，Renderer 不能传入 `file://` 或网络 URL；路径必须解析为本地普通文件并在 256 KiB 限制内。

## 8. 导入流程

### 8.1 入口

- 设置页选择文件。
- 拖入设置或导入区域。
- 双击已建立文件关联的 `*.quickcmd.json`。

应用使用单实例锁：

- 已运行时，新的文件打开请求转发给现有主进程。
- Windows 处理第二实例参数。
- macOS 处理系统 open-file 事件。

### 8.2 预览与冲突

导入流程：

1. 读取并校验文件。
2. 展示包名、版本、命令数量和每项动作。
3. 标出目标应用是否已识别。
4. 标出命令 ID 冲突和快捷词冲突。
5. 对每个冲突选择替换、重命名或跳过；重命名必须再次通过 keyword 规则和全局唯一性校验。
6. 再次校验最终组合及 `configVersion`。
7. 用户确认后由 ConfigStore 原子提交。
8. 刷新 CommandRegistry 和 SearchWorker，立即生效。

取消、校验失败或写入失败时，现有配置完全不变。

### 8.3 文件关联与安全边界

文件关联只由 M3 测试安装包声明；裸源码运行不自动修改系统关联。第二实例的主进程入口可以接收操作系统传入的本地路径，但必须先完成普通文件、规范化绝对路径和 `*.quickcmd.json` 后缀校验，再转换为一次性 import token；该路径不会通过 IPC 暴露给 Renderer。导入预览不执行文件内容，也不加载包内资源。

导入和用户配置中的机器路径永不写回包文件或基础目录。

## 9. 网页搜索

- 默认搜索引擎为必应。
- 设置页允许切换百度、Google 或自定义搜索模板。
- 自定义模板必须是 HTTP/HTTPS URL，并且包含唯一的 `{query}` 占位符。
- 查询参数使用 UTF-8 `encodeURIComponent` 语义，空格编码为 `%20`，再替换模板中唯一的 `{query}`；不得对完整 URL 二次编码。
- 普通搜索的网页兜底使用原始用户文本，不使用内部规范化后的拼音或小写文本。
- 浏览器打开失败时提供复制最终网址的操作。

## 10. 错误处理

### 10.1 快捷键冲突

- 注册失败立即显示冲突。
- 不保存或启用无效组合。
- 提供重新录入和测试。

### 10.2 应用不可用

- 结果显示“应用不可用”。
- 不尝试执行失效目标。
- 提供“重新定位应用”“刷新索引”和“移除命令”。

### 10.3 启动失败

- 显示可理解的错误信息和 §6.1 定义的固定错误码。
- 对仍存在的文件目标提供“打开所在位置”。
- 失败不增加使用次数。

### 10.4 导入失败

- JSON 语法错误显示行列信息。
- Schema 错误显示字段路径。
- 不兼容版本说明支持范围。
- 不安全动作直接拒绝整个包。
- 任何失败都不写入部分配置。

### 10.5 配置损坏

- 优先从上一个有效备份恢复。
- 无有效备份时保留损坏文件副本并建立空配置。
- `app-index.json` 单独重建，不影响用户命令。

### 10.6 索引失败

- 保留并继续使用旧缓存。
- 通过托盘通知提示用户稍后重试。
- 记录本地日志，但主进程继续运行。

### 10.7 浏览器失败

- 显示默认浏览器不可用。
- 提供复制搜索网址。
- 搜索窗口或托盘仍保持可用。

索引、Worker、浏览器、应用启动、导入或单个配置文件错误不得使常驻主进程退出；主进程未捕获异常由顶层故障处理器记录并执行一次受控重启。10 分钟内连续重启 3 次后停止自动重启并显示恢复说明，避免无限重启循环。

## 11. 安全与隐私

- Renderer 使用 `contextIsolation: true` 和 `nodeIntegration: false`。
- IPC 使用明确通道和运行时 Schema 校验。
- 外部包只允许声明受控动作，不能执行代码。
- 启动应用依赖内部已解析动作 ID，不能由 Renderer 注入任意路径。
- URL 限制为 HTTP/HTTPS，禁止 `file:`、`javascript:`、`data:` 等协议。
- 首版不上传查询、应用列表、快捷词或使用历史。
- 只有用户明确执行网页搜索时，查询才发送给对应搜索引擎。
- 日志默认保存在本机；单文件最大 5 MB，最多保留 3 个文件。查询只记录长度、状态和不可逆摘要，不记录完整文本；导入路径只记录文件名摘要，不记录用户目录。

## 12. 性能设计与验收

### 12.1 热路径原则

- 搜索窗口只创建一次。
- 搜索索引常驻内存。
- 输入期间不访问磁盘、不扫描应用、不读取大型配置。
- 应用图标提前缓存或延迟加载，不阻塞首批文本结果。
- 后台索引使用独立异步任务，不能阻塞 Electron 主线程。

### 12.2 性能测量协议

基线设备：Windows 11 22H2、Intel i5-1135G7、16 GB RAM、SSD；macOS 13 Ventura、Apple M1、16 GB RAM。每个平台使用固定 fixture：500 个应用、2,000 个命令别名、8 个结果上限。预热定义为窗口已创建、Worker 已加载快照且连续 3 次查询成功；冷启动单独记录，不纳入热路径百分位。

事件边界：

- `hotkey_received`：主进程收到快捷键回调的单调时钟时间。
- `window_visible`：BrowserWindow 可见且首个搜索窗口绘制事件上报的时间。
- `query_sent`：Renderer 发送带 queryId 的 IPC 时间。
- `results_painted`：Renderer 完成当前结果列表 DOM 更新并下一帧确认的时间。

每个场景采集 200 个样本，丢弃前 10 个预热样本；百分位使用 nearest-rank（`ceil(p * n)`）计算。构建生成 `artifacts/performance.json`，包含设备、OS、fixture hash、样本和 P50/P95。失败门槛：快捷键到窗口可见 P50 ≤ 50 ms 且 P95 ≤ 100 ms；输入到结果绘制 P95 ≤ 50 ms。任一门槛失败，性能验收失败并保留报告。

首次启动允许在缓存加载后后台扫描应用，但搜索窗口必须先可用。

## 13. 测试策略

### 13.1 单元测试

- 输入规范化。
- 拼音全拼和首字母生成。
- 快捷词唯一性。
- 参数命令解析。
- 不可跨级排序。
- 同等级历史加权。
- 网页 URL 编码。
- `base.json`、`user.json` 和 `*.quickcmd.json` Schema 校验。
- 导入冲突的替换、重命名和跳过。
- 原子配置写入和备份恢复。
- 空输入、无参数 `llq`、Unicode NFKC、快捷词/应用名碰撞、Damerau-Levenshtein 阈值和固定 fixture。
- `settings.json`、`user.json`、`app-index.json` 和 `*.quickcmd.json` 的版本、大小、深度、未知字段和迁移。

### 13.2 集成测试

- 主进程与 SearchWorker 快照同步。
- Preload 白名单与 IPC 参数拒绝。
- 应用缓存加载后后台刷新。
- 合法和非法包导入事务。
- 单实例文件打开转发。
- 应用启动成功、不可用和失败路径。
- 搜索引擎切换与自定义模板。
- ConfigStore 版本冲突、事务回滚、Worker 崩溃重启与快照重放。
- 主进程文件选择器 token 的单次使用、过期和路径验证。
- fake Hotkey/Application/Autostart/Browser adapter 的全部错误枚举。

### 13.3 Electron 端到端测试

- 快捷键触发搜索窗口。
- 输入框获得并保持焦点。
- `↑/↓` 连续切换、首尾循环和自动滚动。
- `Enter` 执行选中动作。
- `Ctrl/Cmd + Enter` 网页兜底。
- `Esc` 和失焦隐藏。
- 导入预览与冲突选择。
- 设置修改后无需重启立即生效。
- 首次启动完成/跳过、自启失败提示、托盘菜单和受控子窗口失焦例外。
- 重新定位应用只通过系统选择器完成，成功更新索引，失败保持旧记录。

### 13.4 手动平台验收

Windows 11 22H2+ 与 macOS 13 Ventura+（最低支持版本和当前构建版本各一台）分别验证：

- 默认快捷键正常和冲突场景。
- 多显示器定位与焦点。
- 路径包含空格和非 ASCII 字符的应用。
- 应用安装、卸载和索引刷新。
- 开机自启开启与关闭。
- 系统默认浏览器不可用。
- macOS 未签名包的手动放行说明。
- M3 测试安装包的 `*.quickcmd.json` 文件关联、单实例转发、卸载后关联清理。

### 13.5 稳定性

- 索引失败、浏览器失败和应用启动失败时主进程保持运行。
- 快速连续输入不会显示过期结果。
- 高频显示/隐藏不会增加窗口实例或 Worker 数量。
- 配置写入被中断后能够恢复上一个有效版本。
- Worker 连续重启 3 次后的降级搜索和故障提示。
- 日志轮转上限 5 MB、最多保留 3 个文件，且不写入完整查询文本。

## 14. 文件搜索的未来扩展

文件搜索明确不属于首版，也不在首版代码中提前实现 Provider 抽象。未来单独设计时必须使用系统索引，而不是每次查询遍历磁盘：

- Windows：优先 Windows Search，可选 Everything 适配器。
- macOS：Spotlight。
- 默认只按文件名和路径搜索。
- 全文内容搜索作为单独开关。
- 支持限制目录，并默认排除缓存、系统目录、`node_modules` 等高噪声位置。
- 查询防抖、取消旧请求、限制首批结果数量。

该能力需要独立规格、性能基线和隐私设置；本规格只记录方向，不产生首版任务。

## 15. 实施边界与顺序

本轮 `writing-plans` 只为 M1 生成实施计划；M2、M3 在 M1 验收后分别生成计划，避免一个计划同时承担全部平台和分发集成。

### M1：Windows 核心启动器

入口：规格及 Schema 已确认。出口：Windows 上完成快捷键 → 聚焦窗口 → 缓存应用搜索 → 启动应用/网页兜底的最小垂直切片，并通过热路径性能门槛。包含设置、托盘、开机自启、基础模板和手动命令 CRUD；不包含外部包导入、系统文件关联或 macOS 实现。

### M2：macOS 平台适配

入口：M1 的平台接口契约测试通过。出口：macOS 13+ 完成应用索引、Bundle 启动、Option+Space 冲突处理、窗口激活、登录项与未签名测试包，并复用同一搜索/配置核心。

### M3：命令包导入

入口：M1/M2 的 ConfigStore、CommandRegistry 和设置窗口稳定。出口：设置页选择/拖放导入、冲突预览、包更新语义、单实例转发和测试安装包文件关联在两平台验收通过。

所有里程碑保持模块接口清晰，避免将平台扫描、搜索排序、持久化和 UI 状态堆叠在同一文件中。

## 16. 最终验收条件

首版完成必须同时满足：

- Windows 与 macOS 均能注册可用快捷键并处理冲突。
- 预热性能达到第 12 节指标。
- 应用名、拼音、首字母、容错、快捷词和参数命令均通过测试。
- `↑/↓` 切换不丢失输入焦点。
- 网页兜底和 `llq <关键词>` 行为正确。
- 内置模板和外部命令包能够安全导入并处理冲突。
- 用户修改不会被 `base.json` 更新覆盖。
- 配置损坏和索引失败能够恢复或降级。
- 非法外部包不能执行脚本、Shell 或任意程序路径。
- 所有已确认的异常均不会导致常驻主进程退出。
