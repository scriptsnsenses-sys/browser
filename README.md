# DG Brows

**The web, gilded.** A private, black-and-gold browsing cockpit powered by the [Lightpanda](https://github.com/scriptsnsenses-sys/browser) engine.

DG Brows wraps the Lightpanda headless browser in a full browsing interface: spaces, tabs, an address bar with search suggestions, reader mode, bookmarks, history, quick access, a command palette, and a dockable workspace. It is a Node.js app that can run locally or in any Docker host, including Render.

---

## Highlights

- **Black & gold interface** with custom artwork, ambient gold light, grain, and a boot sequence.
- **Spaces** for separating work, research, and quiet browsing.
- **Tabs** with drag-to-reorder, duplicate, close-others, undo close, and per-tab history.
- **Omnibox** with local history/bookmark matching and DuckDuckGo suggestions (Bing fallback).
- **Reader mode** that extracts the article, strips clutter, and offers serif/sans, text size, and column width controls.
- **Command palette** (`Ctrl/Cmd K`) for navigation and actions.
- **History and bookmarks** with search, context menus, and JSON export/import.
- **PWA shell** with offline app assets and installable manifest.
- **Two engines**: Lightpanda when the binary is available, native HTTP fetch as a fallback.

---

## Architecture

```
Browser UI (public/)
   │
   ├── /p?url=...        Server-side page fetch
   │      ├── Lightpanda  fetch --dump html --wait-until networkidle
   │      └── HTTP fetch  native fetch fallback
   │      │
   │      ├── strips CSP / X-Frame-Options / meta refresh
   │      ├── injects <base> + a small navigation bridge
   │      └── served to a sandboxed <iframe>
   │
   ├── /api/reader        Lightpanda markdown --strip-mode clutter
   ├── /api/suggest       DuckDuckGo autocomplete → Bing fallback
   └── /api/health        Engine status
```

The iframe runs with `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"` and no `allow-same-origin`, so proxied pages cannot touch DG Brows storage or DOM. A tiny bridge handles title updates, link navigation, GET forms, and the `Ctrl+K` / `Ctrl+L` shortcuts.

---

## Quick start

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Without a Lightpanda binary, DG Brows automatically uses its HTTP fallback. For full rendering, install a Lightpanda build from the [fork's releases](https://github.com/scriptsnsenses-sys/browser/releases) and point the server at it:

```bash
# Linux / macOS
LIGHTPANDA_BIN=/path/to/lightpanda npm start

# Windows PowerShell
$env:LIGHTPANDA_BIN = "C:\path\to\lightpanda.exe"; npm start
```

The Docker image downloads the Lightpanda nightly binary during build, so production deployments get the full engine automatically.

### Tests

```bash
npm test
```

---

## Docker

```bash
docker build -t dg-brows .
docker run --rm -p 3000:3000 dg-brows
```

Then open `http://localhost:3000`.

The image:

- Is based on `node:22-bookworm-slim`.
- Downloads `lightpanda-x86_64-linux` (or `aarch64`) from the nightly release.
- Runs as the non-root `node` user.
- Exposes a `/healthz` health check.

---

## Deploy to Render

The DG Brows app lives on the `dg-brows` branch of this repository (`main` carries the Lightpanda engine source).

### Blueprint

1. In Render, choose **New → Blueprint** and select the repository.
2. Render reads `render.yaml` from the root of the branch you pick — select the `dg-brows` branch.
3. Render builds the Docker image and deploys it. Set `DG_BROWS_CORS_ORIGIN` to your frontend's origin (e.g. `https://dg-brows-frontend.vercel.app`).

### Manual web service

1. **New → Web Service**, connect the repository.
2. Branch: **`dg-brows`**.
3. Runtime: **Docker**.
4. Health check path: `/healthz`.
5. Add `NODE_ENV=production`, `DG_BROWS_ALLOW_PRIVATE=false`, and `DG_BROWS_CORS_ORIGIN` set to your frontend origin.
6. Deploy.

Free Render instances sleep when idle. The first request after sleep can take a while, and the Lightpanda binary is fetched at build time (not at runtime).

---

## Frontend

A standalone Next.js frontend lives in [dg-brows-frontend](https://github.com/scriptsnsenses-sys/dg-brows-frontend). It talks to this service's API (`/api/suggest`, `/api/reader`, `/api/health`) and embeds `/p?url=…` in a sandboxed viewer. Point it at this deployment with `NEXT_PUBLIC_API_URL`, and allow its origin here with `DG_BROWS_CORS_ORIGIN`.

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `LIGHTPANDA_BIN` | `lightpanda` | Path to the engine binary |
| `DG_BROWS_ALLOW_PRIVATE` | `true` unless production | Allow pages on private/local IPs. Keep `false` on the public internet. |
| `DG_BROWS_PAGE_TIMEOUT_MS` | `30000` | Page fetch timeout |
| `DG_BROWS_READER_TIMEOUT_MS` | `30000` | Reader extraction timeout |
| `DG_BROWS_MAX_PAGE_BYTES` | `4500000` | Page dump size cap |
| `DG_BROWS_MAX_READER_BYTES` | `2000000` | Reader dump size cap |
| `NODE_ENV` | — | Use `production` on hosts |
| `DG_BROWS_CORS_ORIGIN` | _(empty)_ | Comma-separated origins allowed to call the API cross-origin (e.g. `https://dg-brows-frontend.vercel.app`), or `*` for any. Empty disables CORS. Set this when the DG Brows frontend is hosted separately (e.g. Vercel). |

---

## Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /healthz` | Lightweight liveness check |
| `GET /api/health` | Version, uptime, and engine status (`?refresh=1` re-probes) |
| `GET /api/suggest?q=` | Search autocomplete |
| `GET /api/reader?url=` | Extracted, sanitized article JSON |
| `GET /p?url=` | Proxied page HTML for the sandboxed viewer |

---

## Security notes

- `assertPublicUrl` blocks loopback, private, link-local, and metadata addresses unless `DG_BROWS_ALLOW_PRIVATE` is enabled.
- Proxied pages are sandboxed without same-origin access and cannot read DG Brows local storage.
- Reader HTML is sanitized with `sanitize-html`; links and image sources are resolved and restricted to HTTP(S)/mailto.
- CSP on the app shell allows only same-origin scripts and connections.
- Rate limits protect `/p`, `/api/reader`, and `/api/suggest`.

DG Brows is a browsing shell, not an anonymity tool. Use a trusted network and your own judgment with untrusted pages.

---

## Known limitations

- Some sites detect headless browsers or block server-side fetching.
- JavaScript-heavy apps may behave differently when rendered by Lightpanda versus Chrome.
- The HTTP fallback returns raw HTML and does not render client-side JavaScript before the view loads.
- Authentication, cookies, and sessions are not persisted by the engine.
- Pages that hard-navigate via `window.location` may escape the bridge; the viewer is best for reading and link-driven browsing.

---

## Credits

Built on the [Lightpanda browser](https://github.com/scriptsnsenses-sys/browser) and its open-source engine. Interface, reader presentation, and DG Brows branding are original to this project.
