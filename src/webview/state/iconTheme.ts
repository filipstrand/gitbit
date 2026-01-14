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
};

// Lightweight, curated mapping for the webview file tree icons.
// Keep this small on purpose—add only what we actually care about.
export const iconTheme: SimpleIconTheme = {
  fileNames: {
    'dockerfile': 'devicon/devicon-docker.svg',
    'docker-compose.yml': 'devicon/devicon-docker.svg',
    'docker-compose.yaml': 'devicon/devicon-docker.svg',

    '.gitignore': 'devicon/devicon-git.svg',
    '.gitattributes': 'devicon/devicon-git.svg',
    '.gitmodules': 'devicon/devicon-git.svg',

    'package.json': 'devicon/devicon-nodejs.svg',
    'package-lock.json': 'devicon/devicon-npm.svg',
    'yarn.lock': 'devicon/devicon-yarn.svg',
    'pnpm-lock.yaml': 'devicon/devicon-pnpm.svg',
    'uv.lock': 'custom/lock.svg',
    'poetry.lock': 'custom/lock.svg',
    'cargo.lock': 'custom/lock.svg',

    // custom icons
    '.cursorrules': 'custom/cursorrules.svg',
    'makefile': 'custom/makefile.svg',
    'readme.md': 'custom/file-text-md.svg',
    'license': 'custom/file-text.svg',
    'license.md': 'custom/file-text-md.svg',
    'license.txt': 'custom/file-text-txt.svg',
    'changelog.md': 'custom/file-text-md.svg',
  },
  fileExtensions: {
    // code
    'ts': 'devicon/devicon-typescript.svg',
    'tsx': 'devicon/devicon-react.svg',
    'js': 'devicon/devicon-javascript.svg',
    'jsx': 'devicon/devicon-react.svg',
    'cjs': 'devicon/devicon-javascript.svg',
    'mjs': 'devicon/devicon-javascript.svg',
    'cts': 'devicon/devicon-typescript.svg',
    'mts': 'devicon/devicon-typescript.svg',

    'html': 'devicon/devicon-html5.svg',
    'css': 'devicon/devicon-css3.svg',
    'scss': 'devicon/devicon-sass.svg',
    'sass': 'devicon/devicon-sass.svg',
    'less': 'devicon/devicon-less.svg',

    'py': 'devicon/devicon-python.svg',
    'pyi': 'devicon/devicon-python.svg',
    'go': 'devicon/devicon-go.svg',
    'rs': 'devicon/devicon-rust.svg',
    'java': 'devicon/devicon-java.svg',
    'kt': 'devicon/devicon-kotlin.svg',
    'swift': 'devicon/devicon-swift.svg',

    'cs': 'devicon/devicon-csharp.svg',
    'cpp': 'devicon/devicon-cplusplus.svg',
    'cxx': 'devicon/devicon-cplusplus.svg',
    'cc': 'devicon/devicon-cplusplus.svg',
    'c': 'devicon/devicon-c.svg',

    'php': 'devicon/devicon-php.svg',
    'rb': 'devicon/devicon-ruby.svg',
    'scala': 'devicon/devicon-scala.svg',
    'vue': 'devicon/devicon-vuejs.svg',
    'svelte': 'devicon/devicon-svelte.svg',

    'tf': 'devicon/devicon-terraform.svg',
    'graphql': 'devicon/devicon-graphql.svg',

    // custom icons
    'md': 'custom/file-text-md.svg',
    'txt': 'custom/file-text-txt.svg',
    'log': 'custom/file-text-txt.svg',
    'csv': 'custom/file-text.svg',

    'json': 'custom/file-code.svg',
    'jsonc': 'custom/file-code.svg',
    'yaml': 'custom/yaml.svg',
    'yml': 'custom/yaml.svg',
    'toml': 'custom/toml.svg',
    'ini': 'custom/settings.svg',
    'env': 'custom/settings.svg',
    'lock': 'custom/lock.svg',

    'png': 'custom/file-image.svg',
    'jpg': 'custom/file-image.svg',
    'jpeg': 'custom/file-image.svg',
    'gif': 'custom/file-image.svg',
    'webp': 'custom/file-image.svg',
    'svg': 'custom/file-image.svg',
    'ico': 'custom/file-image.svg',

    'zip': 'custom/file-archive.svg',
    'tar': 'custom/file-archive.svg',
    'gz': 'custom/file-archive.svg',
    'bz2': 'custom/file-archive.svg',
    'xz': 'custom/file-archive.svg',
    '7z': 'custom/file-archive.svg',
    'rar': 'custom/file-archive.svg',

    'pdf': 'custom/file.svg',
  },
};

