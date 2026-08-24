# macOS Application Adaptation Implementation Plan

> **For agentic workers:** REQUIRED: Use the test-driven-development workflow while executing this plan. Steps use checkbox syntax for tracking.

**Goal:** Add a macOS application discovery path that indexes .app bundles, includes LaunchServices/Spotlight results when available, launches indexed apps through the existing opaque-ID IPC flow, and presents the platform-appropriate shortcut label.

**Architecture:** Keep the existing Windows shortcut scanner unchanged. Add a focused macOS scanner that walks standard application directories and optionally queries mdfind; it returns the same ShortcutIndex shape so the existing opaque catalog and execution safety boundary are reused. The main process selects the scanner by process.platform, while Renderer behavior remains platform-neutral except for the Option/Alt display label.

**Tech Stack:** Electron, TypeScript, Node fs/promises and child_process, Vitest, React.

---

## Chunk 1: macOS application discovery

**Files:**
- Create: src/main/mac-application-index.ts
- Create: src/main/mac-application-index.test.ts

- [x] Write tests for standard roots, bundle discovery, nested folders, duplicate paths, and mdfind fallback behavior.
- [x] Run the focused test and verify it fails because the module is missing.
- [x] Implement the scanner with bounded recursion, entry limits, safe path filtering, and an injectable mdfind runner.
- [x] Run the focused test and verify it passes.

## Chunk 2: Main-process platform selection

**Files:**
- Modify: src/main/index.ts
- Create: src/main/platform-application-index.ts
- Create: src/main/platform-application-index.test.ts
- Create: src/shared/platform-hotkey.ts
- Create: src/shared/platform-hotkey.test.ts

- [x] Add platform-aware scanner selection while preserving the Windows desktop-path behavior.
- [x] Add a pure shared helper for the platform default accelerator and display label.
- [x] Update bootstrap to use the helper and keep existing indexed launch/opaque target behavior.
- [x] Run main-process tests and typecheck.

## Chunk 3: Renderer platform label and documentation

**Files:**
- Modify: src/renderer/src/settings/settings-page.tsx
- Modify: src/renderer/src/settings/settings-page.test.tsx
- Modify: docs/DEVELOPMENT_STATUS.md

- [x] Add a platform-specific Option/Alt shortcut label.
- [x] Add a renderer test for the platform label without changing settings behavior.
- [x] Document the implemented macOS application-index scope and remaining macOS release work.
- [x] Run the complete verification matrix: node tests, renderer tests, typecheck, build, lint, and diff check.
