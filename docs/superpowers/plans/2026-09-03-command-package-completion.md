# Command Package Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 `.quickcmd.json` 的应用模板、`launch_app`、package 版本/digest 升级和重启后恢复闭环。

**Architecture:** 保持主进程作为本地配置和应用目标的唯一 owner。共享层只负责严格解析、规范化和引用校验；导入器负责将包快照与当前配置生成预览；持久化层原子保存 package snapshot 与用户命令；主进程在应用索引刷新后用内置/包内模板解析 `appRef`，Renderer 只接收 opaque 应用目标 ID。导入提交使用当前命令存储的串行原子写入路径，升级失败不改变旧命令和旧快照。

**Tech Stack:** Electron main process, React/TypeScript renderer, Vitest, Playwright E2E, atomic JSON persistence.

---

## Chunk 1: Strict package model

### Task 1: Extend package schema and parser

**Files:**
- Modify: `src/shared/command-package.ts`
- Modify: `src/shared/base-catalog.ts`
- Test: `src/shared/command-package.test.ts`

- [x] **Step 1: Write failing tests** for package-local `apps`, `launch_app`, appRef format, unknown fields, missing platform signal, duplicate app IDs/aliases, max counts, and JSON depth.
- [x] **Step 2: Run the focused parser tests and confirm they fail for the missing app model.**
- [x] **Step 3: Implement the shared `AppTemplate`/`PackageCommand` union and strict limits without accepting paths, launch arguments, scripts, or unknown keys.**
- [x] **Step 4: Re-run focused parser tests and the existing base catalog tests.**

## Chunk 2: Version and digest snapshots

### Task 2: Add package snapshot persistence and upgrade diff

**Files:**
- Modify: `src/shared/launcher-command.ts`
- Modify: `src/main/command-package-importer.ts`
- Modify: `src/main/user-command-store.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/settings/settings-page.tsx`
- Test: `src/main/command-package-importer.test.ts`
- Test: `src/main/user-command-store.test.ts`
- Test: `src/renderer/src/settings/settings-page.test.tsx`

- [x] **Step 1: Write failing tests** for same-version/same-digest idempotency, same-version/different-digest collision, lower-version rejection, and higher-version app/command add-update-delete previews.
- [x] **Step 2: Run focused tests and verify the version semantics are absent.**
- [x] **Step 3: Persist normalized imported package snapshots with digest using an atomic write.**
- [x] **Step 4: Generate an explicit preview for app and command changes; require a complete user decision before commit.**
- [x] **Step 5: Re-run focused tests and verify failed upgrades leave the previous snapshot/config unchanged.**

## Chunk 3: App references and launch execution

### Task 3: Resolve package-local applications through the indexed catalog

**Files:**
- Modify: `src/main/indexed-application-catalog.ts`
- Modify: `src/main/app-catalog.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/launcher-item.ts`
- Test: `src/main/indexed-application-catalog.test.ts`
- Test: `src/main/indexed-application-execution.test.ts`
- Test: `src/main/app-catalog.test.ts`

- [x] **Step 1: Write failing tests** for package-local app aliases, valid/invalid `appRef`, unresolved app targets, and opaque `launch-indexed` execution.
- [x] **Step 2: Run focused tests and confirm package app references are not currently resolved.**
- [x] **Step 3: Merge enabled base templates and imported package templates for matching only; map package references to stable internal IDs without exposing paths or metadata.**
- [x] **Step 4: Add `launch_app` conversion and execute only when the current indexed application matches the template.**
- [x] **Step 5: Re-run main execution tests, including stale target and failed launch behavior.**

## Chunk 4: Restart and import entry points

### Task 4: Restore package snapshots and support file association entry points

**Files:**
- Modify: `src/main/index.ts`
- Modify: `electron-builder.yml`
- Modify: `src/shared/launcher-ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/e2e/launcher-window.spec.ts`
- Test: `src/main/bootstrap-readiness.test.ts`

- [x] **Step 1: Write tests** for restoring package commands after reload, cold-start file association, and rejecting stale package versions.
- [x] **Step 2: Implement startup restoration and `open-file`/Windows second-instance routing through the existing main-process import session.**
- [x] **Step 3: Add development-safe electron-builder file association metadata for `*.quickcmd.json`.**
- [x] **Step 4: Add E2E coverage for first import entry and restart-visible command behavior.**

## Chunk 5: Verification and documentation

### Task 5: Verify the complete command package contract

**Files:**
- Modify: `docs/DEVELOPMENT_STATUS.md`
- Test: all existing Node/Renderer/E2E suites

- [x] **Step 1: Run `pnpm test` and inspect all failures.**
- [x] **Step 2: Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, and `pnpm test:e2e`.**
- [x] **Step 3: Run `git diff --check` and confirm no Quick Launcher/Electron process remains.**
- [x] **Step 4: Update the status document with the current verification evidence.**
