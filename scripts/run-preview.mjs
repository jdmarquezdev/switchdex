import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const translationServer = fileURLToPath(new URL('../server/translation-api.ts', import.meta.url));
const distDir = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const publicPort = Number(process.env.PREVIEW_PORT || 4321);
const translationPort = Number(process.env.TRANSLATION_API_PORT || 8787);
const tsxBin = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const translation = spawn(process.execPath, [tsxBin, translationServer], { env: environment, stdio: 'inherit' });
let shuttingDown = false;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

async function resolveStaticPath(url) {
  const pathname = decodeURIComponent(new URL(url || '/', 'http://preview.local').pathname);
  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const candidate = resolve(distDir, `.${relative}`);
  if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) return undefined;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) return resolve(candidate, 'index.html');
  } catch {
    return undefined;
  }
  return undefined;
}

function proxyApi(incoming, outgoing) {
  const proxied = proxyRequest({
    hostname: '127.0.0.1',
    port: translationPort,
    path: incoming.url,
    method: incoming.method,
    headers: incoming.headers
  }, (response) => {
    outgoing.writeHead(response.statusCode || 502, response.headers);
    response.pipe(outgoing);
  });
  proxied.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('Translation service is starting. Try again in a moment.');
  });
  incoming.pipe(proxied);
}

async function serveStatic(incoming, outgoing) {
  let filePath;
  try { filePath = await resolveStaticPath(incoming.url); } catch { filePath = undefined; }
  const status = filePath ? 200 : 404;
  filePath ||= resolve(distDir, '404.html');
  outgoing.writeHead(status, {
    'content-type': contentTypes[extname(filePath).toLocaleLowerCase()] || 'application/octet-stream',
    'x-content-type-options': 'nosniff'
  });
  if (incoming.method === 'HEAD') return outgoing.end();
  createReadStream(filePath).on('error', () => outgoing.end('Not found')).pipe(outgoing);
}

const server = createServer((incoming, outgoing) => {
  if (incoming.url?.startsWith('/api/')) return proxyApi(incoming, outgoing);
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    outgoing.writeHead(405, { allow: 'GET, HEAD' });
    return outgoing.end();
  }
  void serveStatic(incoming, outgoing);
});

server.listen(publicPort, '127.0.0.1', () => console.log(`[preview] site and translation API on http://localhost:${publicPort}`));

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  if (translation.exitCode === null && translation.signalCode === null) translation.kill();
  const timeout = setTimeout(() => process.exit(code), 3_000);
  translation.once('exit', () => {
    clearTimeout(timeout);
    process.exit(code);
  });
}

translation.on('error', (error) => {
  console.error(`[preview] translation service: ${error.message}`);
  shutdown(1);
});
translation.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[preview] translation service stopped unexpectedly (${signal || code || 0})`);
    shutdown(code || 1);
  }
});
server.on('error', (error) => {
  console.error(`[preview] static server: ${error.message}`);
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
