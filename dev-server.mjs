import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const publicPaths = new Set(['/', '/index.html', '/styles.css', '/app.js']);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!publicPaths.has(pathname)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(5173, '127.0.0.1', () => console.log('http://127.0.0.1:5173'));
