import {readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const read = path => readFileSync(resolve(root, path), 'utf8');
export const manifest = JSON.parse(read('src/manifest.json'));
export const assemble = paths => paths.map(read).join('');
export const digest = text => createHash('sha256').update(text).digest('hex');

export function build() {
  const javascript = assemble(manifest.javascript);
  const styles = assemble(manifest.styles);
  new vm.Script(javascript, {filename: 'app.js'});
  const jsPath = `assets/app.${digest(javascript).slice(0, 12)}.js`;
  const cssPath = `assets/app.${digest(styles).slice(0, 12)}.css`;
  mkdirSync(resolve(root, 'assets'), {recursive: true});
  for (const file of readdirSync(resolve(root, 'assets'))) {
    if (/^app\.[a-f0-9]{12}\.(js|css)$/.test(file)) unlinkSync(resolve(root, 'assets', file));
  }
  writeFileSync(resolve(root, jsPath), javascript);
  writeFileSync(resolve(root, cssPath), styles);
  const html = read('src/index.html').replace('{{APP_CSS}}', `./${cssPath}`).replace('{{APP_JS}}', `./${jsPath}`);
  if (/\{\{APP_/.test(html)) throw new Error('Unresolved asset path');
  writeFileSync(resolve(root, 'index.html'), html);
  writeFileSync(resolve(root, 'push-connection.js'), read('src/js/push-connection.js'));
  return {jsPath, cssPath, javascript, styles};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {jsPath, cssPath} = build();
  console.log(`Built ${jsPath} and ${cssPath}`);
}
