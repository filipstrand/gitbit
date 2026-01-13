export type SimpleIconTheme = {
  /**
   * Lowercased exact file names (no path) -> icon filename in `media/icons/`
   * Examples: "dockerfile", "yarn.lock"
   */
  fileNames: Record<string, string>;
  /**
   * Lowercased file extensions (without leading dot) -> icon filename in `media/icons/`
   * Examples: "ts", "png"
   */
  fileExtensions: Record<string, string>;
  folder: string;
  folderExpanded?: string;
  file: string;
};

// Lightweight, curated mapping for the webview file tree icons.
// Keep this small on purpose—add only what we actually care about.
export const iconTheme: SimpleIconTheme = {
  folder: 'folder.svg',
  folderExpanded: 'folder.svg',
  file: 'text.svg',
  fileNames: {
    'dockerfile': 'docker.svg',
    '.dockerignore': 'ignored.svg',
    '.gitignore': 'gitignore.svg',
    '.gitattributes': 'gitignore.svg',
    '.gitmodules': 'gitignore.svg',
    '.editorconfig': 'editorConfig.svg',
    'readme': 'markdown.svg',
    'readme.md': 'markdown.svg',
    'license': 'text.svg',
    'package.json': 'json.svg',
    'package-lock.json': 'json.svg',
    'tsconfig.json': 'json.svg',
    'yarn.lock': 'yarn.svg',
    'pnpm-lock.yaml': 'pnpm.svg',
    'docker-compose.yml': 'dockerCompose.svg',
    'docker-compose.yaml': 'dockerCompose.svg',
    'makefile': 'makefile.svg',
    'cmakelists.txt': 'CMake.svg',
    'cargo.toml': 'cargo.svg',
    'cargo.lock': 'cargoLock.svg',
    'go.mod': 'gomodsum.svg',
    'go.sum': 'gomodsum.svg',
    '.eslintrc': 'eslint.svg',
    '.eslintrc.js': 'eslint.svg',
    '.eslintrc.cjs': 'eslint.svg',
    '.eslintrc.json': 'eslint.svg',
    '.eslintrc.yml': 'eslint.svg',
    '.eslintrc.yaml': 'eslint.svg',
  },
  fileExtensions: {
    // code
    'ts': 'typeScript.svg',
    'tsx': 'react.svg',
    'js': 'javaScript.svg',
    'jsx': 'react.svg',
    'cjs': 'javaScript.svg',
    'mjs': 'javaScript.svg',
    'cts': 'typeScript.svg',
    'mts': 'typeScript.svg',
    'json': 'json.svg',
    'md': 'markdown.svg',
    'mdx': 'mdx.svg',
    'yml': 'yaml.svg',
    'yaml': 'yaml.svg',
    'toml': 'toml.svg',
    'html': 'html.svg',
    'css': 'css.svg',
    'scss': 'scss.svg',
    'less': 'less.svg',
    'py': 'python.svg',
    'pyi': 'python.svg',
    'go': 'go.svg',
    'rs': 'rustFile.svg',
    'java': 'java.svg',
    'kt': 'kotlin.svg',
    'swift': 'swift.svg',
    'cs': 'cs.svg',
    'cpp': 'cpp.svg',
    'cxx': 'cpp.svg',
    'cc': 'cpp.svg',
    'c': 'c.svg',
    'h': 'h.svg',
    'hpp': 'h.svg',
    'sql': 'sql.svg',
    'php': 'php.svg',
    'rb': 'ruby.svg',
    'scala': 'scala.svg',
    'vue': 'vueJs.svg',
    'svelte': 'svelte.svg',
    'dockerfile': 'docker.svg',
    'tf': 'terraform.svg',
    'proto': 'protobuf.svg',
    'graphql': 'graphql.svg',
    'ipynb': 'jupyter.svg',
    // images / assets
    'png': 'image.svg',
    'jpg': 'image.svg',
    'jpeg': 'image.svg',
    'gif': 'image.svg',
    'webp': 'image.svg',
    'svg': 'image.svg',
  },
};

