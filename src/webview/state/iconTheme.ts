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
    'dockerfile': 'devicon-docker.svg',
    'docker-compose.yml': 'devicon-docker.svg',
    'docker-compose.yaml': 'devicon-docker.svg',

    '.gitignore': 'devicon-git.svg',
    '.gitattributes': 'devicon-git.svg',
    '.gitmodules': 'devicon-git.svg',

    'package.json': 'devicon-nodejs.svg',
    'package-lock.json': 'devicon-npm.svg',
    'yarn.lock': 'devicon-yarn.svg',
    'pnpm-lock.yaml': 'devicon-pnpm.svg',
    'uv.lock': 'lucide:lock',
    'poetry.lock': 'lucide:lock',
    'cargo.lock': 'lucide:lock',

    // generic (Lucide)
    'readme.md': 'lucide:file-text',
    'license': 'lucide:file-text',
    'license.md': 'lucide:file-text',
    'license.txt': 'lucide:file-text',
    'changelog.md': 'lucide:file-text',
  },
  fileExtensions: {
    // code
    'ts': 'devicon-typescript.svg',
    'tsx': 'devicon-react.svg',
    'js': 'devicon-javascript.svg',
    'jsx': 'devicon-react.svg',
    'cjs': 'devicon-javascript.svg',
    'mjs': 'devicon-javascript.svg',
    'cts': 'devicon-typescript.svg',
    'mts': 'devicon-typescript.svg',

    'html': 'devicon-html5.svg',
    'css': 'devicon-css3.svg',
    'scss': 'devicon-sass.svg',
    'sass': 'devicon-sass.svg',
    'less': 'devicon-less.svg',

    'py': 'devicon-python.svg',
    'pyi': 'devicon-python.svg',
    'go': 'devicon-go.svg',
    'rs': 'devicon-rust.svg',
    'java': 'devicon-java.svg',
    'kt': 'devicon-kotlin.svg',
    'swift': 'devicon-swift.svg',

    'cs': 'devicon-csharp.svg',
    'cpp': 'devicon-cplusplus.svg',
    'cxx': 'devicon-cplusplus.svg',
    'cc': 'devicon-cplusplus.svg',
    'c': 'devicon-c.svg',

    'php': 'devicon-php.svg',
    'rb': 'devicon-ruby.svg',
    'scala': 'devicon-scala.svg',
    'vue': 'devicon-vuejs.svg',
    'svelte': 'devicon-svelte.svg',

    'tf': 'devicon-terraform.svg',
    'graphql': 'devicon-graphql.svg',

    // generic (Lucide)
    'md': 'lucide:file-text',
    'txt': 'lucide:file-text',
    'log': 'lucide:file-text',
    'csv': 'lucide:file-text',

    'json': 'lucide:file-code',
    'jsonc': 'lucide:file-code',
    'yaml': 'lucide:settings',
    'yml': 'lucide:settings',
    'toml': 'lucide:settings',
    'ini': 'lucide:settings',
    'env': 'lucide:settings',
    'lock': 'lucide:lock',

    'png': 'lucide:file-image',
    'jpg': 'lucide:file-image',
    'jpeg': 'lucide:file-image',
    'gif': 'lucide:file-image',
    'webp': 'lucide:file-image',
    'svg': 'lucide:file-image',
    'ico': 'lucide:file-image',

    'zip': 'lucide:file-archive',
    'tar': 'lucide:file-archive',
    'gz': 'lucide:file-archive',
    'bz2': 'lucide:file-archive',
    'xz': 'lucide:file-archive',
    '7z': 'lucide:file-archive',
    'rar': 'lucide:file-archive',

    'pdf': 'lucide:file',
  },
};

