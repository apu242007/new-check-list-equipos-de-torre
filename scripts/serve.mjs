import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    res
      .writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(content);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(4173, '127.0.0.1', () => console.log('Vista local: http://localhost:4173'));
