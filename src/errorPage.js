function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderErrorPage({ title, message, detail, url, status = 502 }) {
  const safeTitle = escapeHtml(title || 'This page could not be opened');
  const safeMessage = escapeHtml(message || 'The page could not be loaded.');
  const safeDetail = detail ? escapeHtml(detail) : '';
  const safeUrl = escapeHtml(url || '');
  const pageUrl = JSON.stringify(url || '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} — DG Brows</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@700;800&family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: dark;
    --gold: #e8c47a;
    --gold-soft: #f4e0ac;
    --ink: #f8f4e9;
    --muted: #a29d90;
    --line: rgba(232,196,122,.18);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: grid;
    place-items: center;
    padding: 28px;
    background:
      radial-gradient(700px 420px at 50% -10%, rgba(232,196,122,.13), transparent 65%),
      radial-gradient(600px 400px at 85% 85%, rgba(232,196,122,.06), transparent 60%),
      #050504;
    color: var(--ink);
    font-family: Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { width: min(620px, 100%); text-align: center; }
  .mark {
    width: 96px; height: 96px; border-radius: 24px; object-fit: cover;
    border: 1px solid var(--line);
    box-shadow: 0 0 60px rgba(232,196,122,.18);
    margin-bottom: 30px;
  }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 9px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px; letter-spacing: .2em; text-transform: uppercase;
    color: var(--gold); margin-bottom: 18px;
  }
  .eyebrow::before, .eyebrow::after {
    content: ""; width: 26px; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(232,196,122,.5));
  }
  .eyebrow::after { background: linear-gradient(90deg, rgba(232,196,122,.5), transparent); }
  h1 {
    font-family: "Inter Tight", Inter, sans-serif;
    font-size: clamp(34px, 6vw, 52px);
    line-height: 1.02; letter-spacing: -.04em; font-weight: 800;
    margin: 0 0 16px;
  }
  h1 em {
    font-family: "Instrument Serif", Georgia, serif;
    font-style: italic; font-weight: 400; color: var(--gold);
    letter-spacing: -.02em;
  }
  .message { color: var(--muted); font-size: 15.5px; line-height: 1.7; margin: 0 auto 8px; max-width: 440px; }
  .detail {
    margin: 22px auto 0; max-width: 520px; padding: 13px 16px;
    border: 1px solid rgba(255,255,255,.06); border-radius: 12px;
    background: rgba(255,255,255,.025);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11.5px; line-height: 1.6; color: #8d887d;
    overflow-wrap: anywhere;
  }
  .url {
    margin-top: 10px; font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px; color: #6e6a61; overflow-wrap: anywhere;
  }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 30px; }
  button, a.action {
    appearance: none; border-radius: 11px; padding: 12px 20px; cursor: pointer;
    font: inherit; font-size: 13.5px; font-weight: 600; text-decoration: none;
    display: inline-flex; align-items: center; justify-content: center;
    transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
  }
  .primary {
    border: 1px solid transparent; color: #100d06;
    background: linear-gradient(135deg, #f7e3ab, #e8c47a 45%, #c49b51);
    box-shadow: 0 8px 28px rgba(232,196,122,.18);
  }
  .primary:hover { transform: translateY(-1px); box-shadow: 0 12px 34px rgba(232,196,122,.28); }
  .ghost {
    border: 1px solid rgba(255,255,255,.1); color: var(--ink);
    background: rgba(255,255,255,.03);
  }
  .ghost:hover { border-color: rgba(232,196,122,.35); background: rgba(232,196,122,.06); }
  .code {
    margin-top: 36px; font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; color: #5c584f;
  }
</style>
</head>
<body>
  <main class="wrap">
    <img class="mark" src="/assets/dg-brows-mark.png" alt="DG Brows">
    <div class="eyebrow">${status === 429 ? 'Slow down, gently' : 'Navigation interrupted'}</div>
    <h1>This page slipped <em>through.</em></h1>
    <p class="message">${safeMessage}</p>
    ${safeDetail ? `<div class="detail">${safeDetail}</div>` : ''}
    ${safeUrl ? `<div class="url">${safeUrl}</div>` : ''}
    <div class="actions">
      <button class="primary" id="retry" type="button">Try again</button>
      <button class="ghost" id="home" type="button">Back to start</button>
      ${safeUrl ? `<a class="ghost action" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open original</a>` : ''}
    </div>
    <div class="code">DG Brows · ${status}</div>
  </main>
  <script>
    (function () {
      var PAGE_URL = ${pageUrl};
      function send(message) {
        try { parent.postMessage(Object.assign({ __dgb: 1 }, message), '*'); } catch (error) {}
      }
      send({ type: 'pageerror', status: ${Number(status) || 502}, message: ${JSON.stringify(message || '')}, url: PAGE_URL });
      var retry = document.getElementById('retry');
      if (retry) retry.addEventListener('click', function () { location.reload(); });
      var home = document.getElementById('home');
      if (home) home.addEventListener('click', function () { send({ type: 'home' }); });
    })();
  </script>
</body>
</html>`;
}
