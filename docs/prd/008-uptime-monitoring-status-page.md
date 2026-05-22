# PRD: Uptime Monitoring + status.n0n4w3.cn Status Page

**Issue:** [#8 — Uptime monitoring + status.n0n4w3.cn status page](https://github.com/n0n4w3/BlogPage/issues/8)

**Status:** Ready for implementation

## Problem Statement

The blog at [n0n4w3.cn](https://n0n4w3.cn) currently has no visibility into its own availability. When the site goes down — whether from a server crash, DNS misconfiguration, certificate expiry, or deployment error — there is no alerting mechanism and no historical record of outages. Readers encountering errors have no way to check if the issue is widespread or local.

A public-facing status dashboard at `status.n0n4w3.cn` solves this: it provides real-time monitoring, historical latency charts, an incident timeline, and a trust signal for visitors. The status page itself is hosted on a lightweight monitoring tool (Uptime Kuma) so it remains accessible even if the main blog goes down — as long as the server stays reachable.

Without this, the blog operates blind: outages go undetected until a reader reports them or the author notices manually, and there is no postmortem record to identify recurring issues.

## User Stories

| ID | User Story |
|----|-----------|
| US-1 | As the **site author**, I want automated uptime monitoring so I know immediately (via notification or dashboard glance) if the blog goes down. |
| US-2 | As a **reader**, I want to visit `status.n0n4w3.cn` and see whether the blog is currently up, degraded, or down. |
| US-3 | As a **reader**, I want to see response latency charts (24h / 7d / 30d) so I can assess whether the site has been slow recently. |
| US-4 | As a **reader**, I want an incident/outage timeline to understand the blog's reliability history. |
| US-5 | As the **site author**, I want the status page to have a dark theme consistent with the blog's Gruvbox palette so the brand feels cohesive. |
| US-6 | As the **site author**, I want to embed a small status badge on the blog (e.g., in the footer) that shows "All Systems Operational" or "Degraded" at a glance. |
| US-7 | As the **site author**, I want the monitoring service to survive server restarts automatically (Docker restart policy). |
| US-8 | As a **reader**, I want the status page to load over HTTPS with a valid certificate. |

## Technical Design

### Architecture Overview

The monitoring stack consists of Uptime Kuma running in Docker on the same server as the blog. Uptime Kuma provides:

- A built-in HTTP monitor that pings the blog's health endpoint
- A public-facing status page with configurable theme
- Latency charting (24h / 7d / 30d) via Chart.js
- Incident history based on monitor state transitions
- An embeddable status badge SVG/JSON endpoint

```
                         Internet
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         n0n4w3.cn    status.n0n4w3.cn   DNS
         (main blog)   (Uptime Kuma)     (A/CNAME records)
              │             │
              │    ┌────────┴────────┐
              │    │  Docker         │
              │    │  restart:always │
              │    │  ┌───────────┐  │
              │    │  │ Uptime    │  │
              │    │  │ Kuma      │  │
              │    │  │ :3001     │  │
              │    │  └─────┬─────┘  │
              │    └────────┴────────┘
              │             │
              │   monitor pings
              ▼   /api/health    ▼
         nginx :443         nginx :443
         (main site)        (status subdomain)
              │                    │
              ▼                    ▼
         Express API          Uptime Kuma
         :3001 → /api/health  :3002 (Docker host mapped)
         (from #7)
```

### Uptime Kuma via Docker

**Docker Compose service definition** (`/opt/uptime-kuma/docker-compose.yml` on server):

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: always
    ports:
      - "127.0.0.1:3002:3001"
    volumes:
      - ./data:/app/data
    environment:
      - UPTIME_KUMA_PORT=3001
      - UPTIME_KUMA_HOST=0.0.0.0
```

**Key decisions:**

- **`restart: always`** — ensures the container survives server reboots and Docker daemon restarts
- **Bind to `127.0.0.1:3002`** — Uptime Kuma listens on localhost only; nginx reverse-proxies the public subdomain to it
- **Named volume mount** — persists monitor configuration, theme settings, and incident history across container rebuilds
- **Official image** — `louislam/uptime-kuma:1` is the stable 1.x line from the project maintainer; using the `:1` tag pins the major version for predictable upgrades

**Alternative: standalone `docker run`:**

```bash
docker run -d \
  --restart always \
  --name uptime-kuma \
  -p 127.0.0.1:3002:3001 \
  -v /var/lib/uptime-kuma-data:/app/data \
  louislam/uptime-kuma:1
```

### DNS Configuration

| Record | Type | Value | TTL | Notes |
|--------|------|-------|-----|-------|
| `status.n0n4w3.cn` | CNAME | `n0n4w3.cn` | 300 (5 min) | Follows root domain; auto-updates if server IP changes |
| — or — | — | — | — | — |
| `status.n0n4w3.cn` | A | `<server-ip>` | 300 (5 min) | Direct A record, independent of root |

**Recommendation:** Use a CNAME to `n0n4w3.cn` — keeps DNS configuration DRY. If the server IP changes, only the root A record needs updating. Verify propagation with `dig status.n0n4w3.cn +short` before proceeding.

### Monitor Configuration (Inside Uptime Kuma)

After Uptime Kuma is running, create a monitor via the web UI:

| Field | Value |
|-------|-------|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | n0n4w3.cn |
| **URL** | `https://n0n4w3.cn/api/health` |
| **Interval** | 60 seconds |
| **Retries** | 2 |
| **Resend Notification** | Every 30 minutes (if still down) |
| **Expected Status Code** | 200 |

**HTTP monitor behaviour:**

- Sends GET to `https://n0n4w3.cn/api/health` every 60s
- Marks as **UP** if status code ≥200 and <400
- Marks as **DOWN** after 2 consecutive failures (retries + 1)
- Records response time in ms for latency charts
- Triggers notifications on state transitions (UP→DOWN, DOWN→UP)

### Public Status Page Theme (Gruvbox Dark)

Uptime Kuma's public status page supports custom CSS injection. The theme must match the blog's existing Gruvbox palette from `src/styles.css`.

**CSS overrides to paste into Uptime Kuma Settings → Appearance:**

```css
/* ── Uptime Kuma Gruvbox Dark Theme ────────────────── */

:root {
  /* Backgrounds */
  --status-page-bg: #282828;           /* Gruvbox dark0 */
  --status-page-text-color: #ebdbb2;   /* Gruvbox light1 */
  --status-page-header-bg: #1d2021;    /* Gruvbox dark0_hard */
  --status-page-header-text-color: #ebdbb2;

  /* Cards */
  --card-bg: #1d2021;
  --card-shadow: rgba(0, 0, 0, 0.3);
  --card-border-radius: 8px;

  /* Status indicator colours (Gruvbox accents) */
  --up-color: #b8bb26;        /* Gruvbox green */
  --down-color: #fb4934;      /* Gruvbox red */
  --degraded-color: #fabd2f;  /* Gruvbox yellow */
  --pending-color: #83a598;   /* Gruvbox blue */

  /* Chart colours */
  --chart-line-color: #8ec07c;             /* Gruvbox aqua */
  --chart-fill-color: rgba(142, 192, 124, 0.2);
  --chart-point-up-color: #b8bb26;
  --chart-point-down-color: #fb4934;

  /* Typography (match blog) */
  --font-family: 'JetBrains Mono', 'Courier New', monospace;
  --font-size: 14px;

  /* Links */
  --link-color: #83a598;        /* Gruvbox blue */
  --link-hover-color: #8ec07c;  /* Gruvbox aqua */

  /* Incident timeline */
  --incident-bg: #1d2021;
  --incident-border: #504945;   /* Gruvbox dark3 */
  --incident-title-color: #ebdbb2;
  --incident-description-color: #a89984; /* Gruvbox light4 */
}

/* Body */
body {
  background: var(--status-page-bg);
  color: var(--status-page-text-color);
  font-family: var(--font-family);
  font-size: var(--font-size);
}

/* Cards */
.card, .monitor-card, .incident-card {
  background: var(--card-bg);
  border: 1px solid var(--incident-border);
  border-radius: var(--card-border-radius);
  box-shadow: var(--card-shadow);
}

/* Links */
a { color: var(--link-color); }
a:hover { color: var(--link-hover-color); }

/* Status badges */
.uptime-bar { border-radius: 4px; }
```

**Implementation steps in UI:**

1. Access Uptime Kuma web UI → Settings → Appearance
2. Paste the custom CSS above into the "Custom CSS" field
3. Set the page title to "n0n4w3.cn Status"
4. Enable "Public status page" and set the slug (e.g., `status`)

**Custom logo / header text:**
Replace the default Uptime Kuma logo with a text header:

```
n0n4w3.cn ● Status
```

Styled using the existing `'JetBrains Mono', monospace` font stack to match the blog's prose. A `Groutpix Flow` display font for the title would align with the blog's header style but requires a web font import — defer to a future iteration.

### Latency Charts

Uptime Kuma's public status page renders latency charts using Chart.js by default. The monitor data produces three time windows:

| Chart | Time Range | Data Points |
|-------|-----------|-------------|
| **Last 24 hours** | Past 24h | ~1,440 (one per minute at 60s interval) |
| **Last 7 days** | Past 7d | ~10,080, aggregated into hourly averages |
| **Last 30 days** | Past 30d | ~43,200, aggregated into 2-hour or daily averages |

Charts are auto-generated by Uptime Kuma — no custom charting code needed. CSS customisation (above) controls the colour palette. Charts update in real-time via WebSocket connection.

### Incident History

Uptime Kuma automatically records incidents when a monitor transitions between states:

- **UP → DOWN:** Creates an incident entry with start timestamp
- **DOWN → UP:** Closes the incident entry with end timestamp and calculates duration
- **UP → DEGRADED → UP:** Records brief degradation windows if configured

Incidents display on the public status page in reverse chronological order:

- Incident title (auto-generated from monitor name + "Outage #N")
- Duration (e.g., "2 hours 15 minutes")
- Status (Resolved / Ongoing)
- Timestamps (start and end)

Manual incident entries can also be created for planned maintenance windows.

### Embeddable Status Badge

Uptime Kuma provides an SVG badge endpoint:

```
https://status.n0n4w3.cn/api/badge/<monitor-id>/status?style=flat&label=n0n4w3.cn
```

This returns an SVG badge showing "UP" (green), "DOWN" (red), or "DEGRADED" (yellow) that can be embedded in the blog footer.

**Integration in `src/components/Footer.ts`:**

```tsx
{/* Optional status badge */}
<a
  href="https://status.n0n4w3.cn"
  target="_blank"
  rel="noopener noreferrer"
  className="status-badge"
>
  <img
    src="https://status.n0n4w3.cn/api/badge/1/status?style=flat&label=n0n4w3.cn"
    alt="n0n4w3.cn status"
    height="20"
  />
</a>
```

The monitor ID is the auto-incremented integer ID assigned when the monitor is created (typically `1` for the first monitor). Verify the badge URL after setup by visiting it directly in a browser.

### Notification Channels

Configuring at least one notification channel is critical for proactive alerting:

| Channel | Setup Complexity | Reliability | Notes |
|---------|-----------------|-------------|-------|
| Telegram | Low | High | Bot API + chat ID; push notifications on mobile |
| Discord  | Low | High | Webhook URL; instant |
| Email (SMTP) | Medium | Medium | Depends on email deliverability; SMTP credentials needed |
| Webhook | Medium | High | Can chain to PagerDuty, OpsGenie, etc. |

**Recommended:** Telegram — free, reliable push notifications with zero configuration overhead beyond creating a bot token.

### Let's Encrypt SSL via nginx Reverse Proxy

**Existing nginx infrastructure** (from `nginx.conf`): the main site terminates SSL with Let's Encrypt. The status subdomain follows the same pattern.

#### SSL Certificate Strategy

**Option A: Wildcard certificate** `*.n0n4w3.cn` (recommended)

```bash
certbot certonly --manual --preferred-challenges dns \
  -d "*.n0n4w3.cn" -d "n0n4w3.cn"
```

Requires a DNS TXT record for `_acme-challenge.n0n4w3.cn` during issuance. Covers all current and future subdomains with one cert. Renewal also requires DNS challenge — consider automating with a DNS plugin (`certbot-dns-cloudflare`, `certbot-dns-route53`, etc.).

**Option B: Separate cert for `status.n0n4w3.cn`**

```bash
certbot certonly --webroot -w /var/www/status.n0n4w3.cn \
  -d status.n0n4w3.cn
```
Simpler webroot challenge but adds a renewal task and another cert to manage.

**Recommendation:** Option A (wildcard) if the DNS provider supports automated ACL for TXT records; otherwise Option B for simplicity.

#### nginx Server Block for status Subdomain

```nginx
# /etc/nginx/site-enabled/status.n0n4w3.cn

server {
    if ($host = status.n0n4w3.cn) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name status.n0n4w3.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name status.n0n4w3.cn;

    # Using wildcard cert from main site
    ssl_certificate /etc/letsencrypt/live/n0n4w3.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n0n4w3.cn/privkey.pem;

    # Proxy to Uptime Kuma
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (Uptime Kuma uses WebSocket for live updates)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Key nginx details:**

- **HTTP/2** (`http2` flag) — reduces latency for Chart.js asset loading on the status page
- **WebSocket proxy headers** — mandatory for Uptime Kuma's live status updates (without these, charts and status won't update in real-time)
- **`proxy_pass http://127.0.0.1:3002`** — matches the Docker port mapping from the Uptime Kuma container
- **SSL certificate reuse** — sharing the wildcard cert path with the main site's nginx config (`/etc/letsencrypt/live/n0n4w3.cn/`)

## Expanded Acceptance Criteria

### DNS & Network

- [ ] AC-1: `status.n0n4w3.cn` resolves to the blog server IP (via A or CNAME)
- [ ] AC-2: DNS record propagates and is reachable from external networks
- [ ] AC-3: `status.n0n4w3.cn` loads over HTTPS with a valid Let's Encrypt certificate (no warnings)
- [ ] AC-4: HTTP → HTTPS redirect works (`http://status.n0n4w3.cn` redirects to `https://status.n0n4w3.cn`)

### Monitoring

- [ ] AC-5: Uptime Kuma monitor pings `https://n0n4w3.cn/api/health` every 60 seconds
- [ ] AC-6: The monitor correctly reports the blog status as UP when health endpoint returns 200
- [ ] AC-7: The monitor transitions to DOWN after 3 consecutive failures (2 retries + 1)
- [ ] AC-8: The monitor returns to UP when the health endpoint recovers
- [ ] AC-9: Response latency is recorded in milliseconds for each successful ping
- [ ] AC-10: At least one notification channel is configured and fires on state transitions

### Status Page Visual

- [ ] AC-11: The public status page at `status.n0n4w3.cn/status` displays current status with a colour indicator (green/red/yellow)
- [ ] AC-12: Latency charts render for 24h, 7d, and 30d time windows
- [ ] AC-13: The page follows the Gruvbox dark palette (`#282828` background, `#ebdbb2` text)
- [ ] AC-14: The page title reads "n0n4w3.cn Status"
- [ ] AC-15: Font matches the blog's monospace stack (`JetBrains Mono`)
- [ ] AC-16: The page is responsive and readable on mobile (320px+)

### Incident History

- [ ] AC-17: Outage incidents are automatically recorded with start timestamp
- [ ] AC-18: Resolved incidents show end timestamp and duration
- [ ] AC-19: The incident timeline is visible on the public status page

### Infrastructure Resilience

- [ ] AC-20: Docker container runs with `restart: always` policy
- [ ] AC-21: Data persists across container restarts (volume mount)
- [ ] AC-22: Container survives server reboot

### Embed Badge (Optional)

- [ ] AC-23: The status badge SVG endpoint returns a valid SVG image
- [ ] AC-24: The badge is embeddable in the blog footer as an `<img>` tag
- [ ] AC-25: The badge updates in real-time as monitor status changes

## Implementation Plan

### Phase 1: Prerequisites

1. **Verify #7 health endpoint** — Confirm `https://n0n4w3.cn/api/health` returns `200 OK` with a predictable response body (e.g., `{"status":"ok","timestamp":...}`). If #7 is not deployed yet, this PRD can be authored independently, but deployment must wait until the endpoint is live.

2. **Ensure Docker is available** on the server:
   ```bash
   docker --version
   docker info
   ```
   If Docker is not installed:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable --now docker
   ```

3. **Create data directory** for Uptime Kuma persistence:
   ```bash
   sudo mkdir -p /opt/uptime-kuma/data
   ```

### Phase 2: DNS Configuration

4. **Add DNS record** for `status.n0n4w3.cn`:
   - Log in to DNS provider
   - Add CNAME record: `status → n0n4w3.cn` (or A record pointing to server IP)
   - Set TTL to 300 seconds (5 minutes) for quick iteration
   - Verify propagation:
     ```bash
     dig status.n0n4w3.cn +short
     nslookup status.n0n4w3.cn
     ```

### Phase 3: SSL Certificate

5. **Option A — Wildcard cert** (recommended):
   ```bash
   sudo certbot certonly --manual --preferred-challenges dns \
     -d "*.n0n4w3.cn" -d "n0n4w3.cn"
   ```
   Follow prompt to add DNS TXT record for `_acme-challenge.n0n4w3.cn`.

   **Option B — Separate cert:**
   ```bash
   sudo mkdir -p /var/www/status.n0n4w3.cn
   sudo certbot certonly --webroot -w /var/www/status.n0n4w3.cn \
     -d status.n0n4w3.cn
   ```

6. **Test certificate renewal:**
   ```bash
   sudo certbot renew --dry-run
   ```

### Phase 4: Docker + Uptime Kuma

7. **Create docker-compose.yml** at `/opt/uptime-kuma/docker-compose.yml` with the config from the Technical Design section

8. **Start the container:**
   ```bash
   cd /opt/uptime-kuma && docker compose up -d
   ```

9. **Verify container is running:**
   ```bash
   docker ps --filter name=uptime-kuma
   curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002
   docker compose logs --tail 10
   ```

### Phase 5: nginx Configuration

10. **Create nginx server block** at `/etc/nginx/site-enabled/status.n0n4w3.cn` with the config from the Technical Design section

11. **Test and reload nginx:**
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```

12. **Verify external access:**
    ```bash
    curl -s -o /dev/null -w "%{http_code}" https://status.n0n4w3.cn
    ```

### Phase 6: Uptime Kuma Setup (Web UI)

13. **Access admin panel:**
    - Browse to `https://status.n0n4w3.cn`
    - Complete first-run wizard (create admin account with strong password)

14. **Create the monitor:**
    - Navigate to Monitor → Add New Monitor
    - Type: HTTP(s)
    - URL: `https://n0n4w3.cn/api/health`
    - Friendly name: "n0n4w3.cn"
    - Interval: 60 seconds
    - Retries: 2
    - Click Save

15. **Configure the public status page:**
    - Settings → Appearance
    - Paste Gruvbox dark CSS customisations
    - Set page title: "n0n4w3.cn Status"
    - Enable public status page, slug: `status`

### Phase 7: Notifications

16. **Configure notification channel** (Telegram recommended):
    - Create a Telegram bot via [@BotFather](https://t.me/BotFather)
    - Get bot token and chat ID
    - Enter in Uptime Kuma → Settings → Notifications → Telegram

17. **Test notifications:**
    - Temporarily stop the health server or blog
    - Verify notification arrives within 2 minutes
    - Restart and verify recovery notification

### Phase 8: Embed Badge (Optional)

18. **Get badge endpoint:**
    - Visit `https://status.n0n4w3.cn/api/badge/1/status` in browser
    - Verify SVG renders correctly

19. **Add badge to blog footer** (`src/components/Footer.ts`):
    ```tsx
    {/* Status badge */}
    <a href="https://status.n0n4w3.cn" target="_blank" rel="noopener noreferrer">
      <img src="https://status.n0n4w3.cn/api/badge/1/status?style=flat" alt="Status" height="20" />
    </a>
    ```

## Files to Create / Modify

| File | Location | Action | Purpose |
|------|----------|--------|---------|
| `docker-compose.yml` | `/opt/uptime-kuma/` on server | Create | Uptime Kuma service definition with restart policy |
| `/etc/nginx/site-enabled/status.n0n4w3.cn` | Server | Create | nginx reverse proxy for status subdomain |
| `src/components/Footer.tsx` | Repo | Modify (optional) | Add status badge embed |
| `deploy.sh.template` | Repo | Modify (optional) | Add status subdomain deployment notes |

## Risks and Dependencies

### Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| [#7 — Health check API endpoint](https://github.com/n0n4w3/BlogPage/issues/7) | Internal | Not implemented | The uptime monitor needs a health endpoint to ping. **PRD can be authored independently**, but deployment must wait until #7 is live. For testing, point at `https://n0n4w3.cn/` temporarily. |
| Docker Engine | External | Not verified | Must be available on server. Install via `get.docker.com` if missing. |
| Let's Encrypt certbot | External | Not verified | Install via `apt install certbot` or `snap install certbot --classic` if missing. |
| DNS provider API | External | N/A | Must support CNAME or A record for subdomain. |

### Deployment Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| #7 health endpoint not deployed | High | PRD is independently authorable. Monitor deployment is gated on #7 being live. |
| DNS propagation delay | Medium | Use low TTL (300s). Add DNS record early in Phase 2. Verify with `dig` before SSL setup. |
| SSL certificate issuance failure | Medium | Use wildcard cert to avoid per-subdomain issues. Fall back to existing cert (browser shows hostname mismatch — acceptable for testing only). |
| Docker not installed | Medium | Document as prerequisite. Auto-install script available. |
| Port conflict (3002 in use) | Low | Use a different port (e.g., 3003) and update nginx `proxy_pass`. |
| WebSocket proxy misconfigured | Low | Ensure nginx includes `proxy_set_header Upgrade $http_upgrade` and `Connection "upgrade"`. Without these, live updates break. |
| Uptime Kuma data loss on rebuild | Low | Data persisted via Docker volume. Verify volume directory exists and has correct permissions. |
| Wildcard cert renewal (DNS challenge) | Medium | `--manual` mode requires manual DNS entry on renewal. Use a DNS plugin (`certbot-dns-<provider>`) for automated renewal. |

### Security Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Uptime Kuma exposed directly (not through nginx) | Medium | Docker binds to `127.0.0.1:3002`, not `0.0.0.0:3002`. Only nginx via proxy_pass can reach it. |
| Admin dashboard accessible without auth | High | Uptime Kuma enforces authentication on first-run. Use a strong password. |
| Public status page leaks internal info | Low | Status page only shows UP/DOWN status, latency, and incident history. No internal paths or error messages exposed. |

### Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Container resource exhaustion | Low | Uptime Kuma is lightweight (~100MB RAM idle). Set `--memory=256m` Docker limit if needed. |
| Status page goes down with server | Low | The status page runs on the same server as the blog. Acceptable cost-saving trade-off; incident timeline captures the outage after recovery. |
| Certificate renewal breaks status page | Low | Certbot auto-renews via systemd timer. Wildcard cert with DNS challenge needs automation setup. |

## Glossary

| Term | Definition |
|------|-----------|
| **Uptime Kuma** | Open-source, self-hosted uptime monitoring tool with status pages, notifications, and latency charts (Node.js + Vue.js). |
| **Health endpoint** | A lightweight HTTP endpoint (e.g., `GET /api/health`) returning 200 to signal the application is running correctly. |
| **Status page** | A public web page displaying real-time operational status of services with uptime/downtime indicators and charts. |
| **Reverse proxy** | An nginx server that forwards HTTPS requests for a subdomain to an internal service (Uptime Kuma on localhost:3002). |
| **Restart policy** | Docker container setting (`restart: always`) ensuring the container restarts after any stop, including server reboot. |
| **Incident** | A recorded period of downtime or degraded service, automatically created by Uptime Kuma on UP→DOWN transitions. |
| **Status badge** | A small SVG image showing current monitor status (UP/DOWN/DEGRADED), embeddable in websites and READMEs. |
| **Wildcard certificate** | An SSL/TLS certificate covering a domain and all subdomains (e.g., `*.n0n4w3.cn`). |
| **WebSocket** | Real-time bidirectional communication protocol; used by Uptime Kuma for live status page updates. |

## Future Considerations

- **Notifications**: Configure additional notification channels (Telegram, Discord, Slack) for real-time outage alerts beyond email
- **Multiple monitors**: Add monitors for SSL certificate expiry (`tcp://n0n4w3.cn:443`), DNS resolution, and disk space
- **Maintenance mode**: Uptime Kuma supports planned maintenance windows to suppress alerts during deployments
- **API access**: Uptime Kuma exposes a REST API (`/api/status`) that the blog's frontend could consume for inline status display
- **Auto-deployment**: Add Uptime Kuma setup steps to `deploy.sh.template` or a separate `deploy-status.sh`
- **Multi-region**: Deploy a second Uptime Kuma instance on a different provider for cross-region health checks
- **Metric export**: Export uptime metrics to Prometheus for Grafana dashboard integration
