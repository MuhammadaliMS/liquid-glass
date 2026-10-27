// Build the demo site for zerowing.in/glass: the page, its assets and the component script,
// laid out exactly as a visitor's site would use them (<script src="liquid-glass.js">).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, '.deploy/site');
const glass = path.join(out, 'glass');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(glass, { recursive: true });
// Version the page's own assets so a new deploy never pairs fresh page code with a cached script.
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stamp = `${version}-${Date.now().toString(36)}`;
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('src="liquid-glass.js"', `src="liquid-glass.js?v=${stamp}"`)
  .replace('href="site/site.css"', `href="site/site.css?v=${stamp}"`)
  .replace('src="site/site.js"', `src="site/site.js?v=${stamp}"`);
fs.writeFileSync(path.join(glass, 'index.html'), page);
fs.cpSync(path.join(root, 'site'), path.join(glass, 'site'), { recursive: true });
fs.copyFileSync(path.join(root, 'dist/liquid-glass.js'), path.join(glass, 'liquid-glass.js'));
// Any site may load the script and the sample backdrops (WebGL needs CORS for images).
fs.writeFileSync(path.join(out, '_headers'), [
  '/glass/liquid-glass.js',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=3600',
  '/glass/site/backdrops/*',
  '  Access-Control-Allow-Origin: *',
  '',
].join('\n'));
const size = fs.statSync(path.join(glass, 'liquid-glass.js')).size;
console.log(`site built in .deploy/site/glass (liquid-glass.js ${(size / 1024).toFixed(1)} KB)`);
