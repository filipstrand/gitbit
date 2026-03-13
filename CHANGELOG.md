# Changelog

## 0.3.2

- Global commit placement: branch lists are now compact to reduce noise, showing local/remote counts and only a short preview with a `+N more` suffix.

## 0.3.1

- Global search: selecting a commit now opens a right-pane commit placement view with a base-branch selector and branch containment verdict.
- Global search: added a vertical mini graph (latest at top) to quickly inspect where a selected commit sits across branches.
- Search: commit search now matches author name/email.
- UI polish: removed time fields from the new global placement pane to reduce clutter.

## 0.3.0

- Toolbar UX: Fetch is now an icon-only refresh control to reduce visual noise while keeping the same behavior.
- Repo selector: shows an upstream update indicator when the checked-out branch has newer commits available upstream.
- Repo metadata: refresh/fetch now updates upstream-behind status used by the repo dropdown indicator.

## 0.2.5

- Commit UX: commit/amend now run on the first click by defaulting to all changed files when no explicit file selection exists.
- Hook errors: improved commit failure details by surfacing both stdout and stderr from failed hook runs (for clearer `ruff`/pre-commit output).
- Context menu: keep primary and submenu popups within the viewport near bottom/right edges.
- Repo UX: branch favorites typing fix for package builds and general behavior test coverage improvements.

## 0.2.4

- Custom Icon Refresh: Replaced Lucide icons with custom-designed icons for generic files, folders, and specific configuration files (like `.cursorrules`, `makefile`, `yaml`, etc.) for a more unique and polished look.
- Clean Licensing: Removed Lucide library and updated third-party notices to reflect the new custom icon set.

## 0.2.3

- Native UI: Replaced checkboxes with native-styled VS Code checkboxes for a more integrated feel.
- Icon Refresh: Replaced all language/tool icons with Devicon (colorful) and generic file/folder icons with Lucide (clean line art).
- Button Styling: Updated "Commit", "Amend", and "Squash" buttons to be more muted and blend better with the VS Code UI.
- File tree UX: Folder collapse/expand state is preserved per view (committed details + squash preview) across selection/refresh.
- File list UX: Added a Collapse/Expand-all toggle in Squash Preview to quickly collapse or expand folders.

## 0.2.2

- Branch filtering: when filtering on `HEAD` / a branch, show the full merged history (not just `--first-parent`) so merged-in branch commits are visible.
- File icons: expanded curated icon mapping to cover Python (and other common file types) correctly.
- File list UX: clicking a file now always opens the file; diffs are only opened via the dedicated diff icon/button (no surprise diff tabs).

## 0.2.1

- Merge commits: show changed files correctly when selecting a merge commit.
- Commit context menu: add tag, delete tags via flyout submenu (only shown when tags exist), and reset soft moved above branch actions.
- Push: tag-aware flow (offers pushing only new tags when branch is up to date).
- Commit UI: Option/Alt toggles “(without checks)” and commits with `--no-verify`; hook failure banner clears on outside click / editor click.
- Diff: floating window behavior improved so closing it doesn’t leave a stray diff tab behind.

## 0.2.0

- Commit graph context menu overhaul (grouping + orange/green tone highlights).
- Commit graph tag actions: add tag, delete tags via flyout submenu, and tag-aware push (push tags even when branch is up to date).
- Drop commits (single or multi-select) with confirmation + automatic rollback on failure.
- Reveal-in-Finder folder action in file lists (details + squash preview), with fallback to nearest existing parent folder.
- Uncommitted changes: discard icon always visible per file; commit button selects all on first click when message is present.
- Diff opens in a floating window; closing the floating window no longer leaves a stray diff tab behind.
- Merge commits now show changed files reliably in the details pane.
- Reduced icon payload: removed duplicate `*.svg.svg` icon files and replaced the huge JetBrains icon mapping with a lightweight curated map.
- Copy icon to copy commit title/subject in the right-hand details view.
- Move mode: clicking in the editor now cancels move mode (equivalent to Escape).

## 0.1.1

- Generalize commit error handling UI (red border/background for any failure).
- Improved commit error copy-to-clipboard functionality.
- Removed internal debug logs and specialized linter logic for a cleaner public release.

## 0.1.0

- Initial public release.
- Repo selector: show current branch next to each repo name.
- Create new branch automatically checks out the branch after creation.
- Squash now prompts for the new commit message.
- Bundled Codicon icons for context menus.
