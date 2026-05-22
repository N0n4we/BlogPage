# PRD: Health Check API Endpoint

**Issue:** [#7 — Health check API endpoint](https://github.com/n0n4w3/BlogPage/issues/7)

**Status:** Ready for implementation

## Problem Statement

The blog currently serves as a purely static SPA — Vite builds to HTML/JS/CSS, nginx serves it, zero backend logic. However, the nginx config already includes a proxy rule forwarding `/api/` requests to `http://127.0.0.1:3001`, and the Vite dev server proxies `/api` → `localhost:3001` for development parity. This infrastructure is primed for a backend, but currently nothing listens on port 3001, so any `/api/` request either hangs (development) or returns 502 Bad Gateway (production).

A health check endpoint at `GET /api/health` solves several problems:

- **Operational visibility**: Without a health endpoint, there is no programmatic way to verify the server is alive, the blog manifest is readable, or the deployment is healthy after a push.
- **Foundation for monitoring**: Issue #8 (uptime monitoring + status page) depends on this endpoint as its primary probe target.
- **Dev/prod parity**: The proxy infrastructure is wired but unused. Running a minimal server on 3001 makes the dev proxy work as intended and closes the gap between development and production environments.
- **Deployment confidence**: After `deploy.sh` runs (rsync + server restart), a quick `curl /api/health` confirms the server started successfully.

## User Stories

| ID | User Story |
|----|-----------|
| US-1 | As a **deployer**, I want to verify the server is running after deployment so I can detect startup failures immediately. |
| US-2 | As an **uptime monitor** (Uptime Kuma), I want a lightweight JSON endpoint that returns `200 OK` when the server is healthy so I can track availability over time. |
| US-3 | As a **developer**, I want the health endpoint to report critical dependency status (blog manifest readable) so I know if the blog content serving is intact. |
| US-4 | As a **developer**, I want a `package.json` script to start the server so I can run it alongside `npm run dev` in development. |
| US-5 | As an **SRE**, I want the endpoint to return `503 Service Unavailable` with error details when a critical dependency fails so monitoring alerts on degraded state. |
| US-6 | As a **reader**, I want the health endpoint to have zero impact on blog page load time — it runs on a separate port/process. |

## Technical Design

### Architecture Overview

A lightweight Node.js HTTP server running on port 3001, serving a single route `GET /api/health`. The server uses Node's built-in `http` module (no Express dependency needed for one route) to keep the dependency footprint minimal. In production, nginx proxies `/api/` → `http://127.0.0.1:3001`. In development, Vite's dev server proxies `/api` → `http://localhost:3001`.

```
┌──────────────┐       /api/*        ┌──────────────┐
│   Browser    │ ──────────────────▶  │   nginx      │
│              │      :443 → :3001    │  (prod)      │
└──────────────┘                      └──────┬───────┘
                                             │ proxy_pass
                                             ▼
                                     ┌──────────────┐      ┌──────────────────┐
                                     │ Health Server │─────▶│ public/blogs/    │
                                     │  :3001        │      │ manifest.json    │
                                     │  GET /api/health     (dependency check)
                                     └──────────────┘
```

### Server: `server/index.js` (ESM)

Using Node.js built-in `http` module to avoid adding Express as a dependency for a single route.

```javascript
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const MANIFEST_PATH = path.resolve(__dirname, '../public/blogs/manifest.json');
const startTime = Date.now();

function checkManifest() {
  try {
    const data = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    JSON.parse(data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function handleHealth(req, res) {
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

server.listen(PORT, () => {
  console.log(`[health-server] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[health-server] PID: ${process.pid}`);
});
```

### API Specification

**Endpoint:** `GET /api/health`

**Success Response (200):**

```json
{
  "status": "ok",
  "uptime": 84231,
  "timestamp": "2026-05-22T08:30:00.000Z",
  "checks": {
    "manifest": {
      "status": "ok"
    }
  }
}
```

**Degraded Response (503):**

```json
{
  "status": "degraded",
  "uptime": 120,
  "timestamp": "2026-05-22T08:30:00.000Z",
  "checks": {
    "manifest": {
      "status": "fail",
      "error": "ENOENT: no such file or directory, open '.../public/blogs/manifest.json'"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` if all checks pass, `"degraded"` if any check fails |
| `uptime` | number | Server uptime in seconds since process start |
| `timestamp` | string | ISO 8601 timestamp of the response |
| `checks` | object | Per-dependency check results |
| `checks.manifest.status` | string | `"ok"` if manifest is readable + valid JSON, `"fail"` otherwise |
| `checks.manifest.error` | string | Error message if manifest check fails (absent on success) |

### Response Headers

| Header | Value | Rationale |
|--------|-------|-----------|
| `Content-Type` | `application/json` | Standard JSON response |
| `Cache-Control` | `no-store` | Never cache health check results |
| `Access-Control-Allow-Origin` | `*` | Allows browser-based health checks (e.g., from status page) |

### Dependency Check: Blog Manifest

The health endpoint validates that `public/blogs/manifest.json` is:

1. **Readable** — the file exists and can be opened by the Node.js process
2. **Parseable** — the file contents are valid JSON

This check ensures the blog content pipeline is intact. If the manifest is missing or corrupted, the blog cannot list posts, making the site effectively broken even if the server process is running.

Future checks could include:
- Can the blog `.md` files listed in the manifest be read?
- Is the built `dist/` directory present and non-empty?
- Is the APlayer audio file reachable?

### Process Lifecycle

In production, the server runs as a managed process:

- **PM2** (recommended): `pm2 start server/index.js --name blog-health` with `--watch` for auto-restart
- **systemd** (alternative): Service unit at `/etc/systemd/system/blog-health.service`

Both approaches provide:
- Automatic restart on crash
- Logging (stdout/stderr) to journal or PM2 logs
- Startup on system boot

### Existing Proxy Infrastructure (Already Configured)

**nginx.conf** (production):
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

This already routes all `/api/` requests to `localhost:3001`. No nginx changes needed for the health endpoint.

**vite.config.ts** (development):
```typescript
server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
}
```

The dev proxy already forwards `/api/*` to `localhost:3001`. No Vite config changes needed.

## Expanded Acceptance Criteria

### Functional

- [ ] AC-1: `GET /api/health` returns HTTP 200 with JSON body when all checks pass
- [ ] AC-2: `GET /api/health` returns HTTP 503 with JSON body when a check fails
- [ ] AC-3: Response includes `status`, `uptime`, `timestamp`, and `checks` fields
- [ ] AC-4: `uptime` is a positive integer representing seconds since server start
- [ ] AC-5: `timestamp` is a valid ISO 8601 string
- [ ] AC-6: `checks.manifest.status` is `"ok"` when manifest is readable and valid JSON
- [ ] AC-7: `checks.manifest.status` is `"fail"` with an `error` field when manifest is missing or invalid
- [ ] AC-8: Server responds to `GET /api/health` only; other routes return 404

### Development

- [ ] AC-9: `npm run server` starts the health server (from package.json scripts)
- [ ] AC-10: Server logs startup message with port and PID on stdout
- [ ] AC-11: Vite dev proxy works — `curl localhost:5173/api/health` returns the response proxied to `localhost:3001`
- [ ] AC-12: Server runs on `PORT` env var if set (e.g., `PORT=3002 npm run server`)
- [ ] AC-13: Default port is 3001

### Production

- [ ] AC-14: nginx proxy passes through `GET /api/health` to the server correctly
- [ ] AC-15: Response includes `Cache-Control: no-store` header
- [ ] AC-16: Server starts in under 200ms (cold start)
- [ ] AC-17: Server responds in under 50ms (local, no network overhead)
- [ ] AC-18: Process can be managed by PM2 or systemd

### Error Handling

- [ ] AC-19: If `public/blogs/manifest.json` does not exist, returns 503 with manifest check failure
- [ ] AC-20: If `public/blogs/manifest.json` contains invalid JSON, returns 503 with manifest check failure
- [ ] AC-21: Invalid routes (e.g., `GET /api/not-health`, `POST /api/health`) return 404
- [ ] AC-22: Uncaught exceptions do not crash the server (add `process.on('uncaughtException')` handler that logs and keeps running)

## Implementation Plan

### Files to Create

| File | Purpose |
|------|---------|
| `server/index.js` | Health check HTTP server (Node.js built-in `http` module, route handling, dependency checks) |

### Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `"server": "node server/index.js"` script entry |
| `deploy.sh.template` | Add PM2 restart step for the health server after rsync |
| `nginx.conf` | Add documentation comments explaining the `/api/` proxy and health endpoint |

### Step-by-Step

1. **Create `server/index.js`** — Write the HTTP server with:
   - `http.createServer()` with request routing
   - `GET /api/health` handler with manifest check
   - 200/503 response logic
   - CORS headers
   - `no-store` cache header
   - Startup log with port and PID
   - Graceful error handling (`uncaughtException` handler)

2. **Update `package.json`** — Add `"server": "node server/index.js"` to scripts

3. **Update `deploy.sh.template`** — Add after rsync:
   ```bash
   pm2 restart blog-health || pm2 start server/index.js --name blog-health
   ```
   This ensures the server restarts with the new code after deployment.

4. **Update `nginx.conf`** — Add comments documenting the proxy block:
   ```nginx
   # API 代理到健康检查后端 (localhost:3001)
   # GET /api/health returns JSON with status, uptime, timestamp, and dependency checks
   ```

5. **Test in development** — Verify with `npm run server` in one terminal, `npm run dev` in another, then `curl localhost:5173/api/health`

6. **Verify production proxy** — After deployment, `curl https://n0n4w3.cn/api/health` returns the health JSON

### Code Review Checklist

- [ ] Server uses Node.js built-in `http` module (no Express dependency)
- [ ] Graceful handling of manifest read failure (try/catch)
- [ ] CORS headers present (`Access-Control-Allow-Origin: *`)
- [ ] `Cache-Control: no-store` on all responses
- [ ] `uncaughtException` handler prevents crash on unexpected errors
- [ ] Port configurable via `PORT` env var with 3001 default
- [ ] Server correctly resolves the manifest path relative to `server/` directory
- [ ] 404 returned for non-health routes
- [ ] `package.json` script name matches convention (`server` is clear and concise)

## Risks and Dependencies

### Process Management

| Risk | Severity | Mitigation |
|------|----------|------------|
| Server crashes and stays down until manual restart | High | Use PM2 or systemd for auto-restart on crash. Both provide restart policies (`restart-delay`, `max-restarts`) |
| Server doesn't start on system boot | Medium | PM2 `pm2 startup` or systemd `WantedBy=multi-user.target` ensures boot-time start |
| No process monitoring — silent failures | Medium | PM2 `--monitor` or health endpoint itself (self-referential check). Uptime Kuma (issue #8) will monitor this endpoint externally |

### Port Conflict

| Risk | Severity | Mitigation |
|------|----------|------------|
| Port 3001 already in use by another process | Medium | Server logs clear error; `PORT` env var allows overriding. Add port conflict detection: `server.on('error', ...)` handles `EADDRINUSE` |
| Multiple instances of the server started | Low | PM2 cluster mode or accidental double-start — PM2 prevents duplicate named processes; `server.on('listening')` logs the port for debugging |
| Firewall blocks port 3001 | Low | Port is only accessed via localhost (nginx proxy or Vite dev proxy). No external exposure needed |

### Security

| Risk | Severity | Mitigation |
|------|----------|------------|
| Information disclosure via health endpoint | Low | Endpoint only returns uptime, timestamp, and manifest readability status. No secrets, no file contents, no PII. This is standard health check information |
| Unauthenticated access to health endpoint | Low | Endpoint is intentionally public (used by external uptime monitors). If internal-only access is needed later, add an nginx `allow/deny` rule or API key middleware |
| CORS `*` allows cross-origin reads | Low | The endpoint returns only public information (uptime, status). No sensitive data. If needed, restrict to `n0n4w3.cn` and `status.n0n4w3.cn` |
| Directory traversal via manifest path | Low | Path is hardcoded relative to `__dirname`. No user input accepted. Server has no file serving route — only `/api/health` responds |

### Attack Surface

The server exposes a single endpoint:

- **No input parsing** — no query strings, no path parameters, no request body parsing
- **No dependencies** — built-in `http` module only, zero npm dependencies for the server
- **No file serving** — only reads `manifest.json` internally; never serves files to clients
- **No state mutation** — purely read-only; no database, no writes, no side effects

This makes the attack surface essentially zero beyond what Node.js's HTTP parser exposes.

### Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Node.js 18+ | Runtime | Project uses Node.js for dev; ensure production server has Node.js 18+ (LTS) |
| `public/blogs/manifest.json` | Internal | Generated by Vite's blog manifest plugin during build. In production, built from `dist/blogs/manifest.json` — the manifest path must match deployment layout |
| PM2 or systemd | Process management | Not strictly required (server works standalone), but strongly recommended for production reliability |
| nginx proxy | Infrastructure | Already configured. No changes needed |
| Uptime Kuma (issue #8) | Downstream consumer | Will use this endpoint as the primary monitor target |

### Deployment Considerations

The manifest path resolution needs care for production:

- **Development**: `public/blogs/manifest.json` (source)
- **Build output**: `dist/blogs/manifest.json` (Vite `writeBundle` hook generates it)
- **Production (deploy.sh)**: rsync copies `dist/` → `/var/www/n0n4w3.cn`

The health server resolves manifest relative to its own location. If the server runs from the repo root, `../public/blogs/manifest.json` works in dev. In production, the manifest lives at `/var/www/n0n4w3.cn/blogs/manifest.json` (after rsync of `dist/`). Two options:

1. **Build-time config**: Set `MANIFEST_PATH` via env var during deploy
2. **Production symlink**: Create a symlink or adjust path resolution to look at `../dist/blogs/manifest.json` relative to server location

**Recommendation**: Use a `MANIFEST_PATH` env var with a sensible default, and set it in the deploy script or PM2 ecosystem file. The server code should first try `public/blogs/manifest.json` (dev), then fall back to `dist/blogs/manifest.json` (build), and finally accept an explicit env override.

## Future Considerations

- **Health check expansion**: Add more dependency checks (disk space, blog .md file count, APlayer audio file reachability, API response time)
- **Metrics endpoint**: Add `GET /api/metrics` exposing Prometheus-style counters (request count, uptime in seconds, check pass/fail counts)
- **Graceful shutdown**: Handle `SIGTERM`/`SIGINT` to close connections cleanly, log shutdown, and exit with code 0 (improves PM2/systemd lifecycle)
- **Rate limiting**: If the endpoint is exposed publicly, add basic rate limiting to prevent abuse (though it's intentionally lightweight)
- **Health check in deploy pipeline**: Add `curl --retry 5 --retry-delay 2 https://n0n4w3.cn/api/health` after deploy to automatically roll back on failure
- **WebSocket support**: If future endpoints need real-time updates (e.g., live visitor count), the server could be upgraded to support WebSocket connections

## Glossary

| Term | Definition |
|------|-----------|
| **Health check** | A lightweight endpoint that reports whether a service is alive and functioning correctly |
| **PM2** | Process manager for Node.js applications with auto-restart, clustering, and monitoring |
| **systemd** | Linux init system and service manager; can manage Node.js processes via service units |
| **502 Bad Gateway** | HTTP status code nginx returns when upstream server (port 3001) is unreachable |
| **503 Service Unavailable** | HTTP status code indicating the server is running but a dependency is failing |
| **CORS** | Cross-Origin Resource Sharing — browser security mechanism; `Access-Control-Allow-Origin` controls which origins can read the response |
