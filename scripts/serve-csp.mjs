// Serves test/csp/ with a strict, nonce-only Content Security Policy (the kind Tauri apps send), so
// you can check the built component renders correctly where runtime <style> elements are blocked.
//
//   npm run build && npm run test:csp   → open http://127.0.0.1:5251/ (title and report say PASS or FAIL)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 5251;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path === '/' ? 'test/csp/index.html' : normalize(path).replace(/^[/\\]+/, '');
  if (file.startsWith('..')) { response.writeHead(403).end(); return; }
  try {
    let body = await readFile(join(root, file));
    const headers = { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    if (file.endsWith('.html')) {
      const nonce = randomBytes(16).toString('base64');
      body = body.toString().replaceAll('{{nonce}}', nonce);
      // 'unsafe-inline' is listed on purpose: browsers ignore it once a nonce is present, as in Tauri.
      headers['content-security-policy'] = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:`;
    }
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`strict-CSP check at http://127.0.0.1:${port}/`));
