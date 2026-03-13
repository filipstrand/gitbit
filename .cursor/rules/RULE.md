# GitBit Project Rules

## Commands

- `npm install`: Install dependencies
- `npm run compile`: Compile TypeScript source
- `npm run bundle:webview`: Bundle the React webview with esbuild
- `npm run package`: Complete build (compile + bundle + codicons)
- `npx @vscode/vsce package`: Package into a `.vsix` file
- `npm run dev`: Start watch mode for both extension and webview

## Release Process

When performing a release:
1. Ensure `package.json` has the correct version.
2. Ensure `CHANGELOG.md` reflects the changes in the new version.
3. Use the project release skill at `.cursor/skills/release-workflow/SKILL.md`.
4. The process must:
    - Delete any existing `.vsix` files.
    - Build and package the extension.
    - Commit and tag the changes (including the versioned release `.vsix` artifact).
    - Remind the user to upload the `.vsix` to GitHub Releases.

## Project Structure

- `src/extension/`: VS Code extension source (TypeScript)
- `src/webview/`: React-based webview source
- `dist/`: Build output (ignored by git, except for releases)
- `media/`: Icons and static assets
