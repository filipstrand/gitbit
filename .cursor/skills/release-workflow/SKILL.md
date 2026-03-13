---
name: release-workflow
description: Prepare and package a GitBit release by validating version/changelog, rebuilding artifacts, generating a versioned VSIX, and optionally committing/tagging release changes. Use when the user asks to release, package for marketplace, or publish a new version.
---

# Release Workflow

Use this skill for GitBit release prep.

## Steps

1. Read `package.json` and `CHANGELOG.md`.
2. Verify the target version exists in `CHANGELOG.md`.
3. Remove old root `*.vsix` artifacts before creating a new one.
4. Build release assets:
   - `npm install`
   - `npm run package`
5. Create VSIX using the version from `package.json`:
   - `npx @vscode/vsce package --out gitbit-<version>.vsix`
6. If requested, create git release commit/tag:
   - stage intended files, including `gitbit-<version>.vsix`
   - commit as `Release v<version>`
   - create lightweight tag `v<version>`
   - do not push unless explicitly requested

## Output

Report:
- resolved version
- generated VSIX path
- whether the VSIX was staged/committed
- whether commit/tag were created
- any follow-up actions (e.g., run GitHub release workflow)
