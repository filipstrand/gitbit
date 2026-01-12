const fs = require('fs');
const path = require('path');

function copyFileSync(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  const root = path.resolve(__dirname, '..');

  const srcDir = path.join(root, 'node_modules', '@vscode', 'codicons', 'dist');
  const outDir = path.join(root, 'dist', 'codicons');

  if (!fs.existsSync(srcDir)) {
    console.error(`[copy-codicons] Missing source directory: ${srcDir}`);
    process.exit(1);
  }

  // Minimal set needed by codicon.css.
  const files = ['codicon.css', 'codicon.ttf'];
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dst = path.join(outDir, f);
    if (!fs.existsSync(src)) {
      console.error(`[copy-codicons] Missing file: ${src}`);
      process.exit(1);
    }
    copyFileSync(src, dst);
  }
}

main();

