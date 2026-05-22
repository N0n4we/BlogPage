import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const startTime = Date.now();

/** Resolve manifest path: env override > /var/www/n0n4w3.cn (prod) > dist/ (build) > public/ (dev) */
function resolveManifestPath() {
  if (process.env.MANIFEST_PATH) return process.env.MANIFEST_PATH;
  const paths = [
    '/var/www/n0n4w3.cn/blogs/manifest.json',           // prod rsync target
    path.resolve(__dirname, '../dist/blogs/manifest.json'),   // build output
    path.resolve(__dirname, '../public/blogs/manifest.json'), // dev
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[1]; // default to dist path for error message
}

const MANIFEST_PATH = resolveManifestPath();

function checkManifest() {
  try {
    const data = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    JSON.parse(data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function handleHealth(_req, res) {
  const manifestCheck = checkManifest();
  const allHealthy = manifestCheck.ok;

  const body = JSON.stringify({
    status: allHealthy ? 'ok' : 'degraded',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      manifest: {
        status: manifestCheck.ok ? 'ok' : 'fail',
        ...(manifestCheck.error ? { error: manifestCheck.error } : {}),
      },
    },
  });

  res.writeHead(allHealthy ? 200 : 503, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    handleHealth(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[health-server] Port ${PORT} already in use`);
    process.exit(1);
  }
  console.error('[health-server]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[health-server] Uncaught exception:', err);
});

server.listen(PORT, () => {
  console.log(`[health-server] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[health-server] PID: ${process.pid}`);
  console.log(`[health-server] Manifest: ${MANIFEST_PATH}`);
});
