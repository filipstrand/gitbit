---
name: clean-workspace
description: Clean GitBit local build artifacts and temporary files by removing dist outputs, dependencies, obsolete VSIX packages, and macOS metadata files. Use when the user asks to clean the repo, reset build outputs, or reclaim disk space.
---

# Clean Workspace

Use this skill to reset the repository to a fresh local state.

## Cleanup Targets

- `dist/`
- `out/` (if present)
- `node_modules/`
- old root `*.vsix` files not intended for retention (preserve the current tracked release VSIX unless asked otherwise)
- `.DS_Store` files

## Workflow

1. Show current state (`git status --short`).
2. Remove cleanup targets.
   - For VSIX files, prefer deleting old versions and keep the latest tracked release artifact.
3. Verify root contents and show final status.
4. Warn if any unexpected files remain.

## Notes

- Never use destructive git reset commands as part of cleanup.
- Cleanup changes are local file operations; commit only when explicitly requested.
