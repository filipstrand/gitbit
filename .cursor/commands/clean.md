# Clean Command (`/clean`)

Reset the workspace to a fresh state by removing build artifacts and dependencies.

1. **Remove Artifacts**: Delete `dist/`, `out/`, and any `*.vsix` files.
2. **Remove Dependencies**: Delete `node_modules/`.
3. **OS Cleanup**: Remove `.DS_Store` and other temporary files.
4. **Final Check**: Run `ls -a` to confirm the root directory is clean.
