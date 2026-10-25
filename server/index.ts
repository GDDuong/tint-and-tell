import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { attachGameServer } from './socket.ts';

const root = join(import.meta.dirname, '..', 'dist');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

attachGameServer(server);
const port = Number(process.env.PORT) || 5173;
server.listen(port, () => console.log(`Tint & Tell listening on ${port}`));
