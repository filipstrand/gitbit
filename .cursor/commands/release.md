# Release Command (`/release`)

Automate the release process for GitBit.

1. **Check Version & Changelog**:
    - Read the current version from `package.json`.
    - Ensure `CHANGELOG.md` has been updated with the latest changes for this version.
2. **Clean Old Builds**: Delete any existing `*.vsix` files in the root directory.
3. **Build & Package**:
    - Run `npm install` to ensure dependencies are up to date.
    - Run `npm run package` to compile and bundle the project.
    - Run `npx @vscode/vsce package` to generate the new `.vsix` file.
4. **Git Operations**:
    - Stage all changes: `git add .`
    - Commit the release: `git commit -m "Release v[version]"`
    - Tag the commit: `git tag v[version]`
5. **Summary**: Provide a summary of the release. Remind the user to upload the generated `.vsix` to GitHub Releases.
