# Icon Reliability and Site Search Templates Implementation Plan

> **For agentic workers:** REQUIRED: Use test-driven development for each behavior change and run verification before reporting completion.

**Goal:** Improve cross-platform application reliability and add a safe productivity-command layer: configurable site search, URL/path recognition, calculations, clipboard tools, application arguments, system actions, and local history. Translation is explicitly excluded.

**Architecture:** Keep application discovery, icon extraction, and search-command parsing as separate pure or narrowly scoped modules. The renderer sends only a command identifier plus query; the main process resolves the saved template and constructs the final URL so arbitrary renderer-provided URLs are never trusted.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright.

---

## Task 1: Filter macOS application discovery

**Files:**
- Modify: `src/main/mac-application-index.ts`
- Test: `src/main/mac-application-index.test.ts`

- [x] Add failing tests for nested helper apps and `/System/Library` Spotlight results.
- [x] Implement path filtering that accepts only top-level bundles beneath configured application roots.
- [x] Run the focused application-index tests.

## Task 2: Make icon loading resilient and bounded

**Files:**
- Modify: `src/main/mac-icon-cache.ts`
- Modify: `src/main/application-icons.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/mac-icon-cache.test.ts`
- Test: `src/main/application-icons.test.ts`

- [x] Add failing tests for iPhone/iPad-compatible PNG icons that Electron cannot decode directly.
- [x] Convert undecodable macOS images through `sips`, cache the PNG result, and retry failed loads on later refreshes.
- [x] Add failing tests for bounded icon-loading concurrency and preserve result order.
- [x] Implement a small concurrency pool to avoid conversion timeouts.

## Task 3: Improve Windows shortcut icon sources

**Files:**
- Modify: `src/main/application-icon-loader.ts`
- Test: `src/main/application-icon-loader.test.ts`

- [x] Add failing tests that prefer a shortcut's explicit icon path and fall back to its target.
- [x] Implement ordered, deduplicated icon candidates for Windows shortcuts.

## Task 4: Add configurable site-search shortcuts

**Files:**
- Modify: `src/shared/launcher-command.ts`
- Modify: `src/shared/launcher-item.ts`
- Modify: `src/main/user-command-store.ts`
- Modify: `src/main/app-catalog.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/search/search-catalog.ts`
- Modify: `src/renderer/src/settings/settings-page.tsx`
- Test: related main and renderer unit tests

- [x] Add failing validation tests for HTTP(S) templates containing exactly one `{query}` placeholder.
- [x] Add failing search tests for `<keyword> <query>` and an empty-query hint.
- [x] Add the `site-search` command type, settings controls, safe main-process resolution, and URL encoding.
- [x] Run focused command-store, catalog, search, and settings tests.

## Task 5: Document and verify

**Files:**
- Modify: `README.md` or the existing command documentation where appropriate.

- [x] Document site-search template configuration and icon behavior.
- [x] Run all unit tests, Electron end-to-end tests, type checking, linting, and production build.
- [x] Review the final diff for unrelated or destructive changes. Git commit is intentionally deferred until explicitly requested.

## Task 6: Recognize URLs and local paths

**Files:**
- Modify: `src/shared/launcher-item.ts`
- Modify: `src/renderer/src/search/search-catalog.ts`
- Modify: `src/main/app-catalog.ts`
- Modify: `src/main/index.ts`
- Test: related search and execution tests

- [x] Add failing tests for pasted HTTP(S) URLs and absolute platform paths.
- [x] Add safe action parsing and main-process execution without accepting shell commands.

## Task 7: Add local calculation and clipboard transformations

**Files:**
- Add: `src/renderer/src/search/productivity-commands.ts`
- Modify: `src/renderer/src/search/search-catalog.ts`
- Modify: main/preload IPC files for clipboard reads and writes
- Test: focused parser and renderer tests

- [x] Add failing tests for arithmetic, data-unit conversion, timestamp conversion, JSON formatting, URL/Base64 encoding, and case conversion.
- [x] Implement deterministic parsers without `eval` and expose copyable result actions.

## Task 8: Add application arguments and safe system actions

**Files:**
- Modify: shared action types, renderer search parsing, and main execution
- Test: focused parser and execution tests

- [x] Add application argument actions for VS Code and Terminal with validated existing paths.
- [x] Add fixed whitelist actions for lock screen, sleep, screenshot, and system settings on macOS/Windows.

## Task 9: Add local clipboard and recent-file history

**Files:**
- Add: `src/main/activity-history.ts`
- Modify: settings schema/UI, IPC contracts, preload bridge, catalog/search UI
- Test: store, IPC, and search tests

- [x] Persist bounded, deduplicated local history with clipboard history opt-in.
- [x] Add settings switches and search commands for viewing/reusing recent clipboard and file entries.
