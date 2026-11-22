/**
 * A tiny dependency-free HTML page shell shared by the teacher pages.
 *
 * Every page here is served by the plugin's own Host routes, so it is same
 * origin and the browser can call the plugin's `/tiku-weekly/api/*` directly
 * with a normal `fetch`. The data it presents is always HTML-escaped.
 */

/**
 * The page follows the host's own tokens where they exist, so opening the
 * wizard from DSH does not feel like jumping to another product. Every
 * `var(--dsw-…, fallback)` keeps a readable fallback for a page opened on its
 * own, outside the app.
 */
const CSS = `
:root{
  color-scheme:light dark;
  --bg:var(--dsw-alias-bg-base, #f6f7f9);
  --panel:var(--dsw-alias-bg-layer-1, #ffffff);
  --line:var(--dsw-alias-border-l2, #e3e6ea);
  --text:var(--dsw-alias-label-primary, #1b1f26);
  --muted:var(--dsw-alias-label-secondary, #6b7280);
  --faint:var(--dsw-alias-label-tertiary, #8a919c);
  --brand:var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb);
  --brand-weak:var(--dsw-alias-bg-module-platform, #eff4ff);
  --on-brand:var(--dsw-alias-label-on-color, #ffffff);
  --ok:var(--dsw-static-green-500, #15803d);
  --ok-weak:var(--dsw-static-green-500-a12, #ecfdf3);
  --warn:var(--dsw-static-amber-600, #b45309);
  --warn-weak:var(--dsw-static-amber-100, #fffbeb);
  --err:var(--dsw-static-red-500, #b91c1c);
  --err-weak:var(--dsw-static-red-400-a12, #fef2f2);
  --radius:10px;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1);
  --font:var(--dsw-font-family, -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif);
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{padding-top:32px;background:var(--bg);color:var(--text);font:14px/1.55 var(--font)}
a{color:var(--brand)}
h1,h2,h3{margin:0}
.top{position:sticky;top:32px;z-index:20;overflow:hidden;background:var(--panel);border-bottom:1px solid var(--line);padding:10px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.top,.top *{-webkit-app-region:no-drag;app-region:no-drag}
.top .field{display:flex;flex-direction:column;gap:3px;min-width:150px}
label{font-size:12px;color:var(--muted)}
select,input,textarea,button{font:inherit;color:inherit}
select,input[type=text],input[type=password],input[type=datetime-local],input[type=number],input[type=url],textarea{
  background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:13px;min-height:32px}
select:focus,input:focus,textarea:focus{outline:2px solid var(--brand-weak);border-color:var(--brand)}
button{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;min-height:32px}
button:hover:not(:disabled){border-color:var(--brand)}
button.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand);font-weight:600}
button.secondary{background:var(--panel);border-color:var(--line);color:var(--text)}
button.busy{cursor:progress;opacity:.75}
button.primary:hover:not(:disabled){filter:brightness(1.05)}
button:disabled{opacity:.45;cursor:not-allowed}
.who{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-left:auto}
.pill{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line)}
.pill.ok{background:var(--ok-weak);color:var(--ok);border-color:transparent}
.pill.warn{background:var(--warn-weak);color:var(--warn);border-color:transparent}
.pill.err{background:var(--err-weak);color:var(--err);border-color:transparent}
.pill.brand{background:var(--brand-weak);color:var(--brand);border-color:transparent}
.wrap{max-width:1180px;margin:0 auto;padding:18px 20px 64px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px;margin-bottom:16px}
.card h2{font-size:15px;margin-bottom:4px}
.card .hint{color:var(--muted);font-size:12.5px;margin:2px 0 14px}
.grid{display:grid;gap:12px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:820px){.g2,.g3{grid-template-columns:1fr}.top{position:static}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.fieldrow{display:flex;flex-direction:column;gap:4px;min-width:0}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
textarea{width:100%;min-height:70px;resize:vertical}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}
td.mono,.mono{font-family:var(--mono);font-size:12px;word-break:break-all}
.banner{border-radius:var(--radius);padding:10px 12px;font-size:13px;margin-bottom:12px;display:none}
.banner.show{display:block}
.banner.err{background:var(--err-weak);color:var(--err)}
.banner.warn{background:var(--warn-weak);color:var(--warn)}
.busy .top::after{content:"";position:absolute;left:0;bottom:-1px;height:2px;width:100%;background:linear-gradient(90deg,transparent,var(--brand),transparent);animation:tkwBar 1.1s linear infinite}
@keyframes tkwBar{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
.banner.ok{background:var(--ok-weak);color:var(--ok)}
/* steps */
.steps{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 10px;background:var(--panel);border-bottom:1px solid var(--line);margin:0 auto 0;max-width:none}
.stepbtn{padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;font-size:13px;text-align:left;box-shadow:inset 3px 0 0 transparent,0 0 0 1px transparent}
.stepbtn.on{background:var(--brand-weak);border-color:var(--brand);border-left-width:4px;font-weight:600}
.pane{display:none}
.pane.active{display:block}
/* question picker */
.qlist{max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.q{display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);align-items:flex-start}
.q:last-child{border-bottom:0}
.q .body{flex:1;min-width:0}
.q .meta{color:var(--muted);font-size:12px}
.chip{display:inline-block;padding:0 6px;border-radius:6px;background:var(--brand-weak);color:var(--brand);font-size:11px;margin-left:4px}
.picked{display:flex;flex-direction:column;gap:6px}
.picked .row{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
.picked .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drop{border:2px dashed var(--line);border-radius:var(--radius);padding:22px;text-align:center;color:var(--muted);cursor:pointer}
.drop.over{border-color:var(--brand);background:var(--brand-weak);color:var(--brand)}
.drop strong{color:var(--text);display:block;margin-bottom:4px}
.kv{display:grid;grid-template-columns:120px 1fr;gap:4px 10px;font-size:13px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;word-break:break-all}
.st{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:1px 8px;border-radius:999px}
.st.waiting{background:var(--bg);color:var(--muted)}
.st.running{background:var(--brand-weak);color:var(--brand)}
.st.ok{background:var(--ok-weak);color:var(--ok)}
.st.failed{background:var(--err-weak);color:var(--err)}
.st.undone{background:var(--warn-weak);color:var(--warn)}
.locked{opacity:.5;pointer-events:none}
.note{font-size:12px;color:var(--muted);margin-top:6px}
.empty{padding:10px;color:var(--faint);font-size:12.5px}
details summary{cursor:pointer;font-size:12.5px;color:var(--muted)}
details[open] summary{margin-bottom:6px}
.danger{color:var(--err)}
pre{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto;font-size:12px;max-height:260px}
`;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render one complete page. `body` is already-escaped markup. */
export function page({ title, subtitle = '', body, script = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body data-tiku-weekly-page="1">
${body}
<script>${script}</script>
</body>
</html>`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
