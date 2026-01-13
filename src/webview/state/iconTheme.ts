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
  },
  fileExtensions: {
    // code
    'ts': 'typeScript.svg',
    'tsx': 'react.svg',
    'js': 'javaScript.svg',
    'jsx': 'react.svg',
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
    // images / assets
    'png': 'image.svg',
    'jpg': 'image.svg',
    'jpeg': 'image.svg',
    'gif': 'image.svg',
    'webp': 'image.svg',
    'svg': 'image.svg',
  },
};

