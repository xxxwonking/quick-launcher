+# Settings 页面配置实现计划

> **For agentic workers:** REQUIRED: Use the test-driven-development workflow while executing this plan. Steps use checkbox syntax for tracking.

**Goal:** 将 Quick Launcher 当前 Settings 页面从静态展示升级为可持久化、可验证、可即时生效的配置界面。

**Architecture:** 主进程继续作为设置和命令配置的唯一写入方，通过白名单 IPC 暴露设置快照、设置更新和用户命令 CRUD。Renderer 使用分区导航渲染常规、快捷命令、外观和教程页面；命令保存后重新合并到搜索目录并广播给搜索窗口。导入包、基础模板、应用绑定等规格中的 M3 能力明确留在后续范围。

**Tech Stack:** Electron, React, TypeScript, Vitest, React Testing Library, atomic JSON persistence.

---

## Chunk 1: Settings and command contracts

**Files:**
- Create: src/shared/launcher-settings.ts
- Create: src/shared/launcher-command.ts
- Modify: src/shared/launcher-ipc.ts
- Create: src/main/user-command-store.ts
- Create: src/main/user-command-store.test.ts

- [x] Define runtime-safe settings and user-command DTOs.
- [x] Write failing tests for command validation, atomic persistence, and malformed data recovery.
- [x] Implement the command store.
- [x] Run focused tests and verify green.

## Chunk 2: Main-process IPC and live catalog integration

**Files:**
- Modify: src/main/settings-store.ts
- Modify: src/main/index.ts
- Modify: src/main/app-catalog.ts
- Modify: src/shared/launcher-item.ts
- Modify: src/preload/index.ts
- Modify: src/renderer/src/global.d.ts
- Create/modify: main IPC tests

- [x] Add get/update settings IPC with hotkey conflict handling, autostart safety, search-engine validation, and persistence.
- [x] Add user command list/create/update/toggle/delete IPC with runtime validation.
- [x] Add open-url actions and merge enabled user commands into the launcher catalog.
- [x] Broadcast the new catalog after command mutations.
- [x] Test IPC payload rejection, settings updates, and command-driven search execution.

## Chunk 3: Renderer Settings pages

**Files:**
- Modify: src/renderer/src/app.tsx
- Modify: src/renderer/src/settings/settings-page.tsx
- Modify: src/renderer/src/settings/settings-page.test.tsx
- Modify: src/renderer/src/styles.css

- [x] Add working navigation between General, Commands, Appearance, and Tutorial sections.
- [x] Add shortcut recording/status, autostart toggle, search-engine selector, and custom template editing.
- [x] Add command list, add/edit form, enable/disable, and delete flow with validation/error feedback.
- [x] Keep theme and guided tutorial behavior intact.
- [x] Test all user-facing settings interactions.

## Chunk 4: Verification and handoff

**Files:**
- Modify: docs/DEVELOPMENT_STATUS.md

- [x] Run node tests, renderer tests, typecheck, build, lint, and diff check.
- [x] Audit each current Settings page requirement against implementation and tests.
- [x] Update development status with completed settings scope and explicit follow-ups.
