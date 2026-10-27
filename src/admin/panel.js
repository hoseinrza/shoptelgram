/**
 * Web admin panel — a single-file, dependency-free Persian/RTL SPA.
 * Served at GET /admin with a strict CSP (inline style/script only,
 * connect-src 'self', img-src https:). All data flows through /admin/api/*,
 * which verifies the session cookie server-side on every request.
 *
 * Design system: dark slate/green theme (same palette as the original panel)
 * expressed as semantic CSS tokens, a right-side (RTL) sidebar layout with a
 * mobile drawer, and consistent hover/focus states. The font stack leads with
 * Vazirmatn and falls back to system fonts — the strict CSP forbids loading a
 * webfont from a CDN. Icons are Lucide (https://lucide.dev, ISC license)
 * embedded as inline SVG snippets for the same CSP reason.
 */

import { ORDER_STATUS } from '../messages.js';
import { LIMITS } from '../validate.js';
import { GATEWAY_META, GATEWAY_KEYS } from '../payments/config.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Inner markup of the Lucide icons used by the panel (lucide-static v1.62.0, ISC).
// Wrapped client-side by icon() with a shared viewBox/stroke so every glyph
// stays the same size, weight and color as its surrounding text.
const ICONS = {
  dashboard:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  store:
    '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
  package:
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  bag:
    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  megaphone:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  save:
    '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  trash:
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  filter: '<path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/>',
  logout:
    '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  wallet:
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  send:
    '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
};

export function panelHtml(env) {
  const shopName = env.SHOP_NAME || 'فروشگاه';
  const boot = JSON.stringify({
    shopName,
    // The web panel is Persian — embed the Persian labels only.
    statuses: Object.fromEntries(Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.fa])),
    broadcastChunk: LIMITS.broadcastChunk,
    broadcastMax: LIMITS.broadcast,
    gateways: GATEWAY_KEYS.map((k) => ({
      key: k,
      label: GATEWAY_META[k].label,
      fields: GATEWAY_META[k].fields.map((f) => ({
        key: f.key, label: f.label, required: !!f.required,
        secret: !!f.secret, type: f.type || 'text',
      })),
    })),
    titleMax: LIMITS.title,
    descMax: LIMITS.description,
    catMax: LIMITS.category,
  }).replace(/</g, '\\u003c'); // can't break out of the <script> block
  const iconsJson = JSON.stringify(ICONS).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<title>پنل مدیریت — ${esc(shopName)}</title>
<style>
  /* ---- design tokens ---- */
  :root{
    --bg:#0f172a;
    --surface:#1e293b;
    --surface-2:#273449;
    --surface-hover:#2e3d58;
    --border:#334155;
    --border-soft:rgba(51,65,85,.55);
    --text:#e2e8f0;
    --text-2:#b7c3d6;
    --muted:#8da0ba;
    --primary:#22c55e;
    --primary-hover:#34d570;
    --primary-ink:#052e16;
    --primary-soft:rgba(34,197,94,.14);
    --success:#4ade80;
    --success-soft:rgba(74,222,128,.14);
    --warning:#f59e0b;
    --warning-soft:rgba(245,158,11,.13);
    --danger:#ef4444;
    --danger-soft:rgba(239,68,68,.12);
    --info:#38bdf8;
    --info-soft:rgba(56,189,248,.13);
    --radius:14px;
    --radius-sm:10px;
    --radius-xs:8px;
    --shadow:0 1px 2px rgba(2,6,23,.45),0 4px 14px rgba(2,6,23,.22);
    --font:'Vazirmatn','Vazirmatn UI FD','IRANSansX',system-ui,'Segoe UI',Tahoma,sans-serif;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);
    font-size:15px;line-height:1.75}
  ::selection{background:var(--primary);color:var(--primary-ink)}
  :focus-visible{outline:2px solid var(--primary);outline-offset:2px}
  button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
  h1,h2,h3{line-height:1.5}
  .muted{color:var(--muted);font-size:.85rem}
  .num{font-variant-numeric:tabular-nums}
  .ic{width:1.15em;height:1.15em;flex:none;display:inline-block;vertical-align:-.2em}

  /* ---- buttons ---- */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;
    padding:.5rem 1rem;border-radius:var(--radius-xs);border:1px solid var(--border);
    background:var(--surface-2);font-size:.9rem;font-weight:500;white-space:nowrap;
    transition:background .15s,border-color .15s,color .15s}
  .btn:hover{background:var(--surface-hover);border-color:#3f5375}
  .btn:active{transform:translateY(1px)}
  .btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
  .btn.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-ink);font-weight:700}
  .btn.primary:hover{background:var(--primary-hover);border-color:var(--primary-hover)}
  .btn.danger{background:transparent;border-color:rgba(239,68,68,.5);color:var(--danger)}
  .btn.danger:hover{background:var(--danger-soft);border-color:var(--danger)}
  .btn.warn{background:transparent;border-color:rgba(245,158,11,.5);color:var(--warning)}
  .btn.warn:hover{background:var(--warning-soft);border-color:var(--warning)}
  .btn.wide{width:100%;margin-top:1.2rem}
  .icon-btn{width:34px;height:34px;padding:0;border-radius:var(--radius-xs);
    display:inline-flex;align-items:center;justify-content:center;
    border:1px solid transparent;color:var(--muted);
    transition:background .15s,color .15s,border-color .15s}
  .icon-btn:hover{background:var(--surface-2);color:var(--text)}
  .icon-btn:active{transform:translateY(1px)}
  .icon-btn:disabled{opacity:.45;cursor:not-allowed}
  .icon-btn.primary{color:var(--primary)}
  .icon-btn.primary:hover{background:var(--primary-soft);color:var(--primary)}
  .icon-btn.warn{color:var(--warning)}
  .icon-btn.warn:hover{background:var(--warning-soft);color:var(--warning)}
  .icon-btn.danger{color:var(--danger)}
  .icon-btn.danger:hover{background:var(--danger-soft);color:var(--danger)}

  /* ---- layout: sidebar + main (RTL: sidebar on the right) ---- */
  .app{display:flex;min-height:100vh}
  .sidebar{width:256px;flex:none;display:flex;flex-direction:column;padding:1rem .85rem;
    background:var(--surface);border-inline-end:1px solid var(--border);
    position:sticky;top:0;height:100vh;overflow-y:auto}
  .brand{display:flex;align-items:center;gap:.7rem;padding:.35rem .45rem 1rem;
    border-bottom:1px solid var(--border);margin-bottom:.7rem}
  .brand-icon{width:42px;height:42px;border-radius:12px;background:var(--primary-soft);
    color:var(--primary);display:inline-flex;align-items:center;justify-content:center;flex:none}
  .brand-icon .ic{width:22px;height:22px;vertical-align:middle}
  .brand h1{font-size:.98rem;margin:0;line-height:1.5;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .brand small{color:var(--muted);font-size:.72rem;font-weight:400}
  .nav{display:flex;flex-direction:column;gap:.3rem}
  .nav button{display:flex;align-items:center;gap:.7rem;width:100%;text-align:start;
    padding:.58rem .75rem;border-radius:var(--radius-sm);color:var(--text-2);
    font-size:.92rem;font-weight:500;transition:background .15s,color .15s}
  .nav button:hover{background:var(--surface-2);color:var(--text)}
  .nav button.active{background:var(--primary-soft);color:var(--primary);font-weight:700}
  .nav .spacer{flex:1;min-height:.5rem}
  .nav .out{color:var(--muted)}
  .nav .out:hover{background:var(--danger-soft);color:var(--danger)}
  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:.7rem;
    padding:.75rem 1.4rem;background:rgba(15,23,42,.85);
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
    border-bottom:1px solid var(--border)}
  .topbar h2{margin:0;font-size:1.02rem;font-weight:700}
  .menu-btn{display:none}
  .content{padding:1.4rem;width:100%;max-width:1080px;margin:0 auto}

  /* ---- cards, stats, notes ---- */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
    padding:1.1rem 1.2rem;margin-bottom:1rem;box-shadow:var(--shadow)}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:.85rem;margin-bottom:1rem}
  .stat{display:flex;align-items:center;gap:.85rem;background:var(--surface);
    border:1px solid var(--border);border-radius:var(--radius);padding:.95rem 1rem;
    box-shadow:var(--shadow)}
  .stat.hl{border-color:rgba(34,197,94,.45)}
  .stat .num{font-size:1.3rem;font-weight:800;line-height:1.4}
  .stat .lbl{color:var(--muted);font-size:.78rem}
  .chip{width:44px;height:44px;border-radius:12px;display:inline-flex;flex:none;
    align-items:center;justify-content:center}
  .chip .ic{width:21px;height:21px;vertical-align:middle}
  .chip.green{background:var(--primary-soft);color:var(--primary)}
  .chip.blue{background:var(--info-soft);color:var(--info)}
  .chip.amber{background:var(--warning-soft);color:var(--warning)}
  .note{display:flex;gap:.7rem;align-items:flex-start;font-size:.88rem;color:var(--text-2)}
  .note>.ic{color:var(--info);flex:none;margin-top:.35rem}
  .note .btn{margin-top:.6rem}

  /* ---- tables ---- */
  .table-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:.9rem;min-width:640px}
  thead th{color:var(--muted);font-weight:600;font-size:.75rem;text-align:start;
    padding:.5rem .6rem;border-bottom:1px solid var(--border);white-space:nowrap}
  tbody td{padding:.6rem;border-bottom:1px solid var(--border-soft);
    text-align:start;vertical-align:middle}
  tbody tr:last-child td{border-bottom:0}
  tbody tr:hover td{background:rgba(148,163,184,.05)}
  .p-title{display:flex;align-items:center;gap:.7rem;font-weight:600}
  .p-title small{display:block;color:var(--muted);font-weight:400;font-size:.74rem;line-height:1.6}
  .thumb{width:48px;height:48px;object-fit:cover;border-radius:var(--radius-xs);
    border:1px solid var(--border);flex:none;display:block}
  .ph{width:48px;height:48px;border-radius:var(--radius-xs);border:1px dashed var(--border);
    display:inline-flex;align-items:center;justify-content:center;color:var(--muted);flex:none}
  .acts{display:flex;gap:.15rem}
  .cell-in{padding:.35rem .5rem;font-size:.88rem;text-align:center}
  .w-price{width:112px}
  .w-stock{width:78px}

  /* ---- pills & status colors ---- */
  .pill{display:inline-flex;align-items:center;border-radius:999px;padding:.14rem .7rem;
    font-size:.75rem;font-weight:600;border:1px solid var(--border);color:var(--text-2);
    background:var(--surface-2);white-space:nowrap}
  .pill.on,.pill.shipped{background:var(--primary-soft);color:var(--primary);border-color:rgba(34,197,94,.4)}
  .pill.off,.pill.cancelled{background:var(--danger-soft);color:var(--danger);border-color:rgba(239,68,68,.4)}
  .pill.pending{background:var(--warning-soft);color:var(--warning);border-color:rgba(245,158,11,.4)}
  .pill.confirmed{background:var(--info-soft);color:var(--info);border-color:rgba(56,189,248,.4)}
  .pill.done{background:var(--success-soft);color:var(--success);border-color:rgba(74,222,128,.4)}
  .t-confirmed{border-color:rgba(56,189,248,.5);color:var(--info)}
  .t-cancelled{border-color:rgba(239,68,68,.5);color:var(--danger)}
  .t-shipped,.t-done{border-color:rgba(34,197,94,.5);color:var(--primary)}

  /* ---- forms ---- */
  label{display:block;color:var(--text-2);font-size:.8rem;font-weight:500;margin:.7rem 0 .3rem}
  input,textarea{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);
    border-radius:var(--radius-xs);padding:.5rem .7rem;font:inherit;font-size:.92rem;
    transition:border-color .15s,box-shadow .15s}
  input:hover,textarea:hover{border-color:#3f5375}
  input:focus,textarea:focus{outline:none;border-color:var(--primary);
    box-shadow:0 0 0 3px var(--primary-soft)}
  input::placeholder,textarea::placeholder{color:var(--muted)}
  textarea{min-height:120px;resize:vertical}
  .field-row{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
  .row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
  .row .grow{flex:1;min-width:140px}
  .toolbar{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
  .form-card{border:1px solid var(--border);border-radius:var(--radius-sm);
    background:var(--bg);padding:1rem 1.1rem;margin-top:.9rem}
  .form-head{display:flex;align-items:center;gap:.55rem;font-size:.95rem;font-weight:700}
  .form-head>.ic{color:var(--primary)}
  .form-head .icon-btn{margin-inline-start:auto}
  .err{display:inline-flex;align-items:center;gap:.4rem;color:var(--danger);
    font-size:.82rem;margin:.4rem 0 0}

  /* ---- chips (order filters) ---- */
  .chips{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.9rem}
  .chips .lbl-ic{display:inline-flex;align-items:center;gap:.4rem;color:var(--muted);
    font-size:.82rem;margin-inline-end:.25rem}
  .chips button{border-radius:999px;padding:.3rem .85rem;font-size:.82rem;
    border:1px solid var(--border);background:var(--surface);color:var(--text-2);
    transition:background .15s,border-color .15s,color .15s}
  .chips button:hover{border-color:#3f5375;color:var(--text)}
  .chips button.active{background:var(--primary);border-color:var(--primary);
    color:var(--primary-ink);font-weight:700}

  /* ---- order detail ---- */
  .detail{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);
    padding:.9rem 1rem;margin:.4rem .2rem;font-size:.88rem}
  .kv{display:flex;justify-content:space-between;gap:1rem;padding:.3rem 0;
    border-bottom:1px dashed var(--border-soft)}
  .kv>span{color:var(--muted);flex:none}
  .kv>b{font-weight:600;text-align:start;word-break:break-word}
  .lines{margin:.65rem 0;border:1px solid var(--border-soft);border-radius:var(--radius-xs);overflow:hidden}
  .line{display:flex;justify-content:space-between;gap:1rem;padding:.4rem .65rem;
    border-bottom:1px solid var(--border-soft)}
  .line:last-child{border-bottom:0}
  .line:nth-child(odd){background:rgba(148,163,184,.04)}
  .trans{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:.75rem}
  .trans>span{color:var(--muted);font-size:.82rem}
  .exp .ic{transition:transform .2s}
  tr.open .exp .ic{transform:rotate(180deg)}

  /* ---- broadcast ---- */
  .bar{height:8px;background:var(--surface-2);border-radius:999px;overflow:hidden;margin-top:.9rem}
  .bar>div{height:100%;background:var(--primary);border-radius:999px;transition:width .3s}
  .done-msg{display:flex;align-items:center;gap:.4rem;color:var(--success);
    font-weight:600;margin:.7rem 0 0;font-size:.9rem}

  /* ---- pager ---- */
  .pager{display:flex;gap:.5rem;justify-content:center;align-items:center;margin-top:.9rem}
  .pager .btn{padding:.32rem .8rem;font-size:.85rem}

  /* ---- empty state, spinner ---- */
  .empty{display:flex;flex-direction:column;align-items:center;gap:.6rem;
    padding:2.4rem 1rem;color:var(--muted);text-align:center;font-size:.9rem}
  .empty .ic{width:34px;height:34px;opacity:.55}
  .spinner{display:flex;flex-direction:column;align-items:center;gap:.7rem;
    padding:3.2rem 0;color:var(--muted);font-size:.9rem}
  .spin{animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){
    .spin{animation:none}
    *,*::before,*::after{transition:none!important}
  }

  /* ---- toast ---- */
  #toast{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%) translateY(12px);
    opacity:0;pointer-events:none;display:flex;align-items:center;gap:.55rem;
    background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);
    padding:.6rem 1rem;z-index:60;max-width:min(92vw,480px);box-shadow:var(--shadow);
    font-size:.9rem;transition:opacity .2s,transform .2s}
  #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  #toast.err{border-color:rgba(239,68,68,.55)}
  #toast.err .ic{color:var(--danger)}
  #toast.ok .ic{color:var(--success)}

  /* ---- confirm modal ---- */
  #modal{position:fixed;inset:0;z-index:70;display:flex;align-items:center;
    justify-content:center;padding:1rem;background:rgba(2,6,23,.62);
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
  #modal[hidden]{display:none}
  .modal-card{background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);padding:1.2rem 1.3rem;max-width:400px;width:100%;box-shadow:var(--shadow)}
  .modal-card h3{margin:0 0 .35rem;font-size:1rem}
  .modal-card p{margin:0 0 1.1rem;color:var(--text-2);font-size:.88rem}
  .modal-actions{display:flex;gap:.6rem}

  /* ---- login ---- */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
  .login{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);padding:2rem 1.6rem 1.8rem;box-shadow:var(--shadow)}
  .login .brand-icon{display:flex;margin:0 auto 1rem;width:54px;height:54px;border-radius:16px}
  .login .brand-icon .ic{width:26px;height:26px}
  .login h1{text-align:center;font-size:1.22rem;margin:0}
  .login .sub{text-align:center;color:var(--muted);font-size:.85rem;margin:.15rem 0 .9rem}

  /* ---- mobile drawer ---- */
  .scrim{display:none}
  @media (max-width:920px){
    .menu-btn{display:inline-flex}
    .sidebar{position:fixed;top:0;bottom:0;right:0;z-index:40;height:auto;
      transform:translateX(105%);transition:transform .25s ease;box-shadow:var(--shadow)}
    .sidebar.open{transform:translateX(0)}
    .scrim{position:fixed;inset:0;z-index:30;background:rgba(2,6,23,.55);
      opacity:0;pointer-events:none;transition:opacity .2s}
    .scrim.show{opacity:1;pointer-events:auto}
    .content{padding:1rem}
    .topbar{padding:.65rem 1rem}
  }
  @media (max-width:560px){
    .field-row{grid-template-columns:1fr}
    .card{padding:.9rem}
  }
</style>
</head>
<body>
<div id="app">
  <div class="spinner">
    <svg class="ic spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    در حال بارگذاری…
  </div>
</div>
<div id="toast" role="status" aria-live="polite"></div>
<div id="modal" hidden>
  <div class="modal-back" id="modal-back"></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-msg">
    <h3 id="modal-title"></h3>
    <p id="modal-msg"></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">انصراف</button>
      <button class="btn danger" id="modal-ok"></button>
    </div>
  </div>
</div>
<script>
'use strict';
const BOOT = ${boot};
const ICONS = ${iconsJson};
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\\d/g, (d) => FA[d]);
const money = (n) => fa(String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('app');
let toastTimer;

// Lucide wrapper: one shared viewBox/stroke so all glyphs match in size and weight.
const icon = (name, cls) =>
  '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';

const STATUS = BOOT.statuses;
// The fa labels carry emoji prefixes meant for the bot chat — strip them here.
const statusFa = (s) => String(STATUS[s] || s).replace(/^[^\\p{L}\\p{N}#]+/u, '');

function toast(msg, isErr) {
  const el = document.getElementById('toast');
  el.innerHTML = icon(isErr ? 'alert' : 'check') + '<span>' + esc(msg) + '</span>';
  el.className = isErr ? 'err show' : 'ok show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401) { renderLogin(); throw new Error('unauthorized'); }
  if (!res.ok || !data || data.ok === false) {
    const msg = data && data.issues ? Object.values(data.issues).join(' | ') : (data && data.error) || ('خطا ' + res.status);
    throw new Error(msg);
  }
  return data;
}

// ---- confirm modal ---------------------------------------------------------
function confirmModal({ title, message, okLabel = 'تأیید', danger = true }) {
  return new Promise((resolve) => {
    const m = document.getElementById('modal');
    const ok = document.getElementById('modal-ok');
    const cancel = document.getElementById('modal-cancel');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-msg').textContent = message;
    ok.textContent = okLabel;
    ok.className = 'btn ' + (danger ? 'danger' : 'primary');
    m.hidden = false;
    const prevFocus = document.activeElement;
    ok.focus();
    const close = (val) => {
      m.hidden = true;
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    document.getElementById('modal-back').onclick = () => close(false);
  });
}

// ---- login ----------------------------------------------------------
function renderLogin(err) {
  app.innerHTML =
    '<div class="login-wrap"><div class="login">' +
    '<span class="brand-icon">' + icon('lock') + '</span>' +
    '<h1>پنل مدیریت</h1>' +
    '<p class="sub">' + esc(BOOT.shopName) + '</p>' +
    '<label for="pw">رمز پنل مدیریت</label>' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="••••••••">' +
    (err ? '<p class="err">' + icon('alert') + '<span>' + esc(err) + '</span></p>' : '') +
    '<button class="btn primary wide" id="go">ورود</button></div></div>';
  const submit = async () => {
    const btn = document.getElementById('go');
    btn.disabled = true;
    try {
      await api('/admin/login', { method: 'POST', body: { password: document.getElementById('pw').value } });
      route('dash');
    } catch (e) { if (e.message !== 'unauthorized') renderLogin(e.message); }
  };
  document.getElementById('go').onclick = submit;
  document.getElementById('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  document.getElementById('pw').focus();
}

// ---- shell ----------------------------------------------------------
const TABS = [
  ['dash', 'dashboard', 'داشبورد'],
  ['products', 'package', 'محصولات'],
  ['orders', 'bag', 'سفارش‌ها'],
  ['broadcast', 'megaphone', 'پیام همگانی'],
  ['payment', 'card', 'درگاه پرداخت'],
];
const PAGE_TITLES = { dash: 'داشبورد', products: 'محصولات', orders: 'سفارش‌ها', broadcast: 'پیام همگانی', payment: 'درگاه پرداخت' };

function shell(tab, contentHtml) {
  app.innerHTML =
    '<div class="app">' +
      '<div class="scrim" id="scrim"></div>' +
      '<aside class="sidebar" id="sidebar">' +
        '<div class="brand"><span class="brand-icon">' + icon('store') + '</span>' +
        '<div><h1>' + esc(BOOT.shopName) + '</h1><small>پنل مدیریت</small></div></div>' +
        '<nav class="nav" aria-label="بخش‌های پنل">' +
          TABS.map(([id, ic, lbl]) =>
            '<button data-t="' + id + '" class="' + (id === tab ? 'active' : '') + '"' +
            (id === tab ? ' aria-current="page"' : '') + '>' + icon(ic) + lbl + '</button>').join('') +
          '<div class="spacer"></div>' +
          '<button class="out" id="out">' + icon('logout') + 'خروج از حساب</button>' +
        '</nav>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<button class="icon-btn menu-btn" id="menu" aria-label="باز کردن منو" title="منو">' + icon('menu') + '</button>' +
          '<h2>' + PAGE_TITLES[tab] + '</h2>' +
        '</header>' +
        '<main class="content" id="view">' + contentHtml + '</main>' +
      '</div>' +
    '</div>';
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const setOpen = (open) => { sidebar.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  document.getElementById('menu').onclick = () => setOpen(!sidebar.classList.contains('open'));
  scrim.onclick = () => setOpen(false);
  document.querySelectorAll('.nav button[data-t]').forEach((b) => (b.onclick = () => route(b.dataset.t)));
  document.getElementById('out').onclick = async () => {
    await fetch('/admin/logout', { method: 'POST' });
    renderLogin();
  };
}

const spinner = '<div class="spinner">' + icon('loader', 'spin') + '<span>در حال بارگذاری…</span></div>';

async function route(tab) {
  const view = document.getElementById('view');
  if (view) view.innerHTML = spinner;
  try {
    if (tab === 'dash') return await viewDash();
    if (tab === 'products') return await viewProducts(1);
    if (tab === 'orders') return await viewOrders(1, '');
    if (tab === 'broadcast') return await viewBroadcast();
    if (tab === 'payment') return await viewPayment();
  } catch (e) {
    if (e.message !== 'unauthorized') toast(e.message, true);
  }
}

// ---------- dashboard ----------
async function viewDash() {
  const { stats: s } = await api('/admin/api/stats');
  shell('dash',
    '<div class="stats">' +
      stat('package', 'green', s.products, 'محصولات') +
      stat('check', 'blue', s.activeProducts, 'فعال و موجود') +
      stat('bag', 'amber', s.orders, 'سفارش‌ها') +
      stat('clock', 'amber', s.pendingOrders, 'در انتظار تأیید') +
      stat('users', 'blue', s.users, 'کاربران') +
      '<div class="stat hl"><span class="chip green">' + icon('wallet') + '</span>' +
      '<div><div class="num">' + money(s.revenue) + '</div><div class="lbl">مجموع فروش (تومان)</div></div></div>' +
    '</div>' +
    '<div class="card note">' + icon('info') + '<div>' +
    'سفارش‌های «در انتظار تأیید» را بررسی و تأیید کنید؛ هماهنگی پرداخت فعلاً دستی است.' +
    '<br><button class="btn" id="go-pending">' + icon('clock') + 'مشاهده سفارش‌های در انتظار</button>' +
    '</div></div>');
  document.getElementById('go-pending').onclick = () => viewOrders(1, 'pending');
  function stat(ic, tone, n, l) {
    return '<div class="stat"><span class="chip ' + tone + '">' + icon(ic) + '</span>' +
      '<div><div class="num">' + fa(n) + '</div><div class="lbl">' + esc(l) + '</div></div></div>';
  }
}

// ---------- products ----------
let productFormOpen = false;
async function viewProducts(page) {
  const data = await api('/admin/api/products?page=' + page);
  const rows = data.items.map((p) => productRow(p)).join('');
  shell('products',
    '<div class="card"><div class="toolbar">' +
    '<button class="btn primary" id="add">' + icon('plus') + (productFormOpen ? 'بستن فرم' : 'افزودن محصول') + '</button>' +
    '<span class="muted num">مجموع: ' + fa(data.total) + ' محصول</span></div>' +
    '<div id="form">' + (productFormOpen ? productForm() : '') + '</div></div>' +
    '<div class="card"><div class="table-wrap"><table>' +
    '<thead><tr><th>محصول</th><th>قیمت (تومان)</th><th>موجودی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty">' + icon('package') +
      '<div>محصولی ثبت نشده است. اولین محصول را با دکمهٔ «افزودن محصول» اضافه کنید.</div></div></td></tr>') +
    '</tbody></table></div>' + pager(data.page, data.pages, (p) => viewProducts(p)) + '</div>');
  document.getElementById('add').onclick = () => { productFormOpen = !productFormOpen; viewProducts(page); };
  if (productFormOpen) bindProductForm(page);
  bindRows(page);
  bindPager(page, data.pages, (p) => viewProducts(p));
}
function productRow(p) {
  const photo = p.photo && /^https?:/.test(p.photo)
    ? '<img class="thumb" src="' + esc(p.photo) + '" alt="تصویر ' + esc(p.title) + '">'
    : '<span class="ph">' + icon('image') + '</span>';
  return '<tr data-id="' + p.id + '" data-title="' + esc(p.title) + '">' +
    '<td><div class="p-title">' + photo + '<div>' + esc(p.title) +
    (p.category ? '<small>' + esc(p.category) + '</small>' : '') + '</div></div></td>' +
    '<td><input class="cell-in w-price" inputmode="numeric" data-f="price" aria-label="قیمت ' + esc(p.title) + '" value="' + p.price + '"></td>' +
    '<td><input class="cell-in w-stock" inputmode="numeric" data-f="stock" aria-label="موجودی ' + esc(p.title) + '" value="' + p.stock + '"></td>' +
    '<td><span class="pill ' + (p.active ? 'on">فعال' : 'off">غیرفعال') + '</span></td>' +
    '<td><div class="acts">' +
    '<button class="icon-btn primary" data-act="save" title="ذخیره تغییرات" aria-label="ذخیره تغییرات ' + esc(p.title) + '">' + icon('save') + '</button>' +
    '<button class="icon-btn ' + (p.active ? 'warn' : 'primary') + '" data-act="toggle" title="' + (p.active ? 'غیرفعال کردن' : 'فعال کردن') + '" aria-label="' + (p.active ? 'غیرفعال کردن ' : 'فعال کردن ') + esc(p.title) + '">' + icon('power') + '</button>' +
    '<button class="icon-btn danger" data-act="del" title="حذف" aria-label="حذف ' + esc(p.title) + '">' + icon('trash') + '</button>' +
    '</div></td></tr>';
}
function productForm() {
  return '<div class="form-card">' +
    '<div class="form-head">' + icon('plus') + 'افزودن محصول جدید' +
    '<button class="icon-btn" id="f-close" title="بستن فرم" aria-label="بستن فرم">' + icon('close') + '</button></div>' +
    '<div class="field-row"><div><label for="f-title">نام محصول *</label><input id="f-title" maxlength="' + BOOT.titleMax + '"></div>' +
    '<div><label for="f-cat">دسته‌بندی</label><input id="f-cat" maxlength="' + BOOT.catMax + '"></div></div>' +
    '<div class="field-row"><div><label for="f-price">قیمت (تومان) *</label><input id="f-price" inputmode="numeric"></div>' +
    '<div><label for="f-stock">موجودی *</label><input id="f-stock" inputmode="numeric"></div></div>' +
    '<label for="f-desc">توضیحات</label><textarea id="f-desc" maxlength="' + BOOT.descMax + '" rows="3"></textarea>' +
    '<label for="f-photo">آدرس عکس (اختیاری، https)</label><input id="f-photo" dir="ltr" placeholder="https://…">' +
    '<div class="row" style="margin-top:.9rem"><button class="btn primary" id="f-save">' + icon('save') + 'ذخیره محصول</button>' +
    '<span id="f-err" class="err"></span></div></div>';
}
function bindProductForm(page) {
  document.getElementById('f-save').onclick = async () => {
    try {
      await api('/admin/api/products', { method: 'POST', body: {
        title: v('f-title'), price: v('f-price'), stock: v('f-stock'),
        category: v('f-cat'), description: v('f-desc'), photo: v('f-photo'),
      }});
      toast('محصول ذخیره شد.');
      productFormOpen = false;
      viewProducts(page);
    } catch (e) {
      const el = document.getElementById('f-err');
      if (el) el.innerHTML = icon('alert') + '<span>' + esc(e.message) + '</span>';
    }
  };
  document.getElementById('f-close').onclick = () => { productFormOpen = false; viewProducts(page); };
  function v(id) { return document.getElementById(id).value.trim(); }
}
function bindRows(page) {
  document.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const field = (f) => tr.querySelector('[data-f="' + f + '"]').value.trim();
    const save = tr.querySelector('[data-act="save"]');
    tr.querySelectorAll('[data-f]').forEach((inp) =>
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); }));
    save.onclick = async () => {
      try {
        await api('/admin/api/products/' + id, { method: 'PATCH', body: { price: field('price'), stock: field('stock') }});
        toast('به‌روزرسانی شد.');
      } catch (e) { toast(e.message, true); }
    };
    tr.querySelector('[data-act="toggle"]').onclick = async () => {
      try {
        const { product } = await api('/admin/api/products/' + id, {
          method: 'PATCH', body: { active: tr.querySelector('.pill').classList.contains('off') },
        });
        toast(product.active ? 'محصول فعال شد.' : 'محصول غیرفعال شد.');
        viewProducts(page);
      } catch (e) { toast(e.message, true); }
    };
    tr.querySelector('[data-act="del"]').onclick = async () => {
      const ok = await confirmModal({
        title: 'حذف محصول',
        message: 'محصول «' + tr.dataset.title + '» برای همیشه حذف می‌شود و از سبد خرید همهٔ کاربران هم پاک می‌شود. مطمئنید؟',
        okLabel: 'حذف کن',
      });
      if (!ok) return;
      try {
        await api('/admin/api/products/' + id, { method: 'DELETE' });
        toast('محصول حذف شد.');
        viewProducts(page);
      } catch (e) { toast(e.message, true); }
    };
  });
}

// ---------- orders ----------
async function viewOrders(page, status) {
  const qs = '/admin/api/orders?page=' + page + (status ? '&status=' + status : '');
  const data = await api(qs);
  const chips = [''].concat(Object.keys(STATUS));
  const chipHtml =
    '<span class="lbl-ic">' + icon('filter') + 'فیلتر وضعیت:</span>' +
    chips.map((s) =>
      '<button data-s="' + s + '" class="' + (s === status ? 'active' : '') + '">' + (s ? statusFa(s) : 'همه') + '</button>').join('');
  const rows = data.items.map((o) => orderRow(o)).join('');
  shell('orders',
    '<div class="chips">' + chipHtml + '</div>' +
    '<div class="card"><div class="table-wrap"><table>' +
    '<thead><tr><th>شماره</th><th>مشتری</th><th>مبلغ (تومان)</th><th>وضعیت</th><th>تاریخ</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="6"><div class="empty">' + icon('bag') + '<div>سفارشی با این فیلتر یافت نشد.</div></div></td></tr>') +
    '</tbody></table></div>' + pager(data.page, data.pages, (p) => viewOrders(p, status)) + '</div>');
  document.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => viewOrders(1, b.dataset.s)));
  bindOrderRows(status);
  bindPager(page, data.pages, (p) => viewOrders(p, status));
}
function fmtDate(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
function orderRow(o) {
  return '<tr data-id="' + o.id + '" data-status="' + o.status + '">' +
    '<td class="num">#' + fa(o.id) + '</td>' +
    '<td>' + esc(o.customer.name) + '</td>' +
    '<td class="num">' + money(o.total) + '</td>' +
    '<td><span class="pill ' + o.status + '">' + statusFa(o.status) + '</span></td>' +
    '<td class="muted num">' + fmtDate(o.createdAt) + '</td>' +
    '<td><button class="icon-btn exp" data-act="expand" title="جزئیات سفارش" aria-label="نمایش جزئیات سفارش #' + fa(o.id) + '">' + icon('chevDown') + '</button></td></tr>' +
    '<tr class="detail-row" style="display:none"><td colspan="6"><div class="detail" id="d-' + o.id + '"></div></td></tr>';
}
async function bindOrderRows(status) {
  document.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="expand"]').onclick = async () => {
      const detailTr = tr.nextElementSibling;
      if (detailTr.style.display !== 'none') { detailTr.style.display = 'none'; tr.classList.remove('open'); return; }
      detailTr.style.display = '';
      tr.classList.add('open');
      const div = document.getElementById('d-' + id);
      div.innerHTML = '<div class="spinner">' + icon('loader', 'spin') + '<span>در حال بارگذاری…</span></div>';
      try {
        const { order: o } = await api('/admin/api/order/' + id);
        const allowed = (await api('/admin/api/transitions/' + o.status)).transitions;
        div.innerHTML =
          '<div class="kv"><span>مشتری</span><b>' + esc(o.customer.name) + '</b></div>' +
          '<div class="kv"><span>تلفن</span><b dir="ltr" class="num">' + esc(o.customer.phone) + '</b></div>' +
          '<div class="kv"><span>آدرس</span><b>' + esc(o.customer.address) + '</b></div>' +
          '<div class="lines">' +
          o.lines.map((l) => '<div class="line"><span>' + esc(l.title) + '</span><span class="num">' + fa(l.qty) + ' × ' + money(l.price) + '</span></div>').join('') +
          '</div>' +
          '<div class="kv"><span>جمع کل</span><b class="num">' + money(o.total) + ' تومان</b></div>' +
          (allowed.length
            ? '<div class="trans"><span>تغییر وضعیت:</span>' +
              allowed.map((s) => '<button class="btn t-' + s + '" data-to="' + s + '">' + statusFa(s) + '</button>').join('') +
              '</div>'
            : '');
        div.querySelectorAll('[data-to]').forEach((b) => {
          b.onclick = async () => {
            try {
              await api('/admin/api/order/' + id + '/status', { method: 'PATCH', body: { status: b.dataset.to } });
              toast('وضعیت سفارش به‌روزرسانی شد.');
              viewOrders(1, status);
            } catch (e) { toast(e.message, true); }
          };
        });
      } catch (e) { div.textContent = e.message; }
    };
  });
}

// ---------- broadcast ----------
async function viewBroadcast() {
  const { stats } = await api('/admin/api/stats');
  const users = stats.users;
  shell('broadcast',
    '<div class="card">' +
    '<div class="form-head">' + icon('megaphone') + 'ارسال پیام همگانی</div>' +
    '<p class="muted">این پیام برای <b class="num">' + fa(users) + '</b> کاربر ثبت‌شده ارسال می‌شود و به‌صورت متن ساده (بدون HTML) تحویل داده می‌شود.</p>' +
    '<label for="bc-text">متن پیام</label>' +
    '<textarea id="bc-text" maxlength="' + BOOT.broadcastMax + '"></textarea>' +
    '<div class="row" style="margin-top:.9rem">' +
    '<button class="btn primary" id="bc-send">' + icon('send') + 'ارسال پیام</button>' +
    '<span class="muted num" id="bc-count"></span>' +
    '<span id="bc-err" class="err"></span></div>' +
    '<div id="bc-progress"></div></div>' +
    '<div class="card note">' + icon('info') + '<div>هر بار ' + fa(BOOT.broadcastChunk) +
    ' گیرنده پردازش می‌شود (محدودیت پلن رایگان Workers). اگر همهٔ ارسال‌ها در یک مرحله انجام نشود، دکمهٔ «ادامه ارسال» ظاهر می‌شود.</div></div>');
  const ta = document.getElementById('bc-text');
  const counter = document.getElementById('bc-count');
  const upd = () => (counter.textContent = fa(ta.value.length) + ' / ' + fa(BOOT.broadcastMax) + ' نویسه');
  ta.addEventListener('input', upd); upd();
  document.getElementById('bc-send').onclick = async () => {
    const btn = document.getElementById('bc-send');
    const errEl = document.getElementById('bc-err');
    try {
      errEl.textContent = '';
      if (!ta.value.trim()) { errEl.textContent = 'متن پیام را وارد کنید.'; return; }
      if (users > 0) {
        const ok = await confirmModal({
          title: 'ارسال پیام همگانی',
          message: 'این پیام برای ' + fa(users) + ' کاربر ارسال می‌شود و قابل بازگشت نیست. ادامه می‌دهید؟',
          okLabel: 'ارسال کن',
          danger: false,
        });
        if (!ok) return;
      }
      btn.disabled = true;
      renderProgress(await api('/admin/api/broadcast', { method: 'POST', body: { text: ta.value } }));
    } catch (e) { if (errEl) errEl.textContent = e.message; }
    finally { btn.disabled = false; }
  };
  function renderProgress(res) {
    const el = document.getElementById('bc-progress');
    if (!el) return;
    if (!res.broadcast) {
      el.innerHTML = '<div class="empty">' + icon('users') + '<div>کاربری برای ارسال وجود ندارد.</div></div>';
      return;
    }
    const b = res.broadcast;
    const pct = b.total ? Math.round(((b.sent + b.failed) / b.total) * 100) : 100;
    el.innerHTML =
      '<div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><div style="width:' + pct + '%"></div></div>' +
      '<p class="muted num">ارسال‌شده: ' + fa(b.sent + b.failed) + ' از ' + fa(b.total) +
      ' — موفق: ' + fa(b.sent) + ' | ناموفق: ' + fa(b.failed) + '</p>' +
      (res.done ? '<p class="done-msg">' + icon('check') + 'ارسال پیام تمام شد.</p>'
        : '<button class="btn warn" id="bc-cont">' + icon('send') + 'ادامه ارسال</button>');
    const cont = document.getElementById('bc-cont');
    if (cont) cont.onclick = async () => {
      try {
        cont.disabled = true;
        renderProgress(await api('/admin/api/broadcast-continue', { method: 'POST', body: { id: b.id } }));
      } catch (e) { toast(e.message, true); }
    };
  }
}


// ---------- payment gateways ----------
async function viewPayment() {
  const { config } = await api('/admin/api/payment-config');
  shell('payment',
    '<div class="card">' +
    '<div class="form-head">' + icon('card') + 'درگاه پرداخت آنلاین</div>' +
    '<p class="muted">اعتبارنامهٔ هر درگاه را پر کنید تا در صفحهٔ تسویه به مشتری نمایش داده شود. مقادیر مخفی به‌صورت ماسک‌شده نشان داده می‌شوند؛ اگر تغییری ندهید همان مقدار قبلی حفظ می‌شود.</p>' +
    '<div class="row">' +
    '<div class="grow"><label>درگاه پیش‌فرض</label><select id="pc-DEFAULT">' +
    '<option value="">— انتخاب نشده —</option>' +
    BOOT.gateways.map((g) => '<option value="' + g.key + '"' + (config.DEFAULT === g.key ? ' selected' : '') + '>' + esc(g.label) + '</option>').join('') +
    '</select></div>' +
    '<div class="grow"><label>واحد پول فروشگاه</label><select id="pc-CURRENCY">' +
    '<option value="IRT"' + (config.CURRENCY === 'IRT' ? ' selected' : '') + '>تومان (IRT)</option>' +
    '<option value="IRR"' + (config.CURRENCY === 'IRR' ? ' selected' : '') + '>ریال (IRR)</option>' +
    '</select></div></div>' +
    '<div class="row">' +
    '<div class="grow"><label>مدت اعتبار لینک پرداخت (دقیقه)</label><input id="pc-TOKEN_TTL_MINUTES" inputmode="numeric" value="' + esc(config.TOKEN_TTL_MINUTES) + '"></div>' +
    '<div class="grow"><label>تایم‌اوت تماس با درگاه (ثانیه)</label><input id="pc-BANK_TIMEOUT" inputmode="numeric" value="' + esc(config.BANK_TIMEOUT) + '"></div></div>' +
    '<label>کارت کارت‌به‌کارت (جایگزین وقتی هیچ درگاهی تنظیم نشده)</label>' +
    '<input id="pc-MANUAL_CARD" dir="ltr" placeholder="6037-9911-1111-1111" value="' + esc(config.MANUAL_CARD || '') + '">' +
    '<div class="row" style="margin-top:.9rem"><button class="btn primary" id="pc-save">' + icon('check') + 'ذخیره پیکربندی</button>' +
    '<span id="pc-err" class="err"></span></div></div>' +

    BOOT.gateways.map((g) => paymentGatewayCard(g, config)).join('') +

    '<div class="card note">' + icon('info') + '<div>پس از ذخیره، درگاه‌های کامل‌شده بلافاصله در انتخاب درگاه مشتری ظاهر می‌شوند. برای درگاه‌های شاپرک، اعتبارنامه‌ها را از پنل بانک/شاپرک خود بگیرید. Hyperswitch برای پرداخت‌های بین‌المللی است و به نرخ تبدیل (FX_TOMAN_PER_UNIT) هم نیاز دارد.</div></div>');

  document.getElementById('pc-save').onclick = async () => {
    const errEl = document.getElementById('pc-err');
    errEl.textContent = '';
    const body = {
      DEFAULT: val('pc-DEFAULT'),
      CURRENCY: val('pc-CURRENCY'),
      TOKEN_TTL_MINUTES: val('pc-TOKEN_TTL_MINUTES'),
      BANK_TIMEOUT: val('pc-BANK_TIMEOUT'),
      MANUAL_CARD: val('pc-MANUAL_CARD'),
      GATEWAYS: {},
    };
    for (const g of BOOT.gateways) {
      const cfg = {};
      for (const f of g.fields) {
        const el = document.getElementById('pc-' + g.key + '-' + f.key);
        if (!el) continue;
        cfg[f.key] = f.type === 'boolean' ? el.checked : el.value.trim();
      }
      body.GATEWAYS[g.key] = cfg;
    }
    try {
      const res = await api('/admin/api/payment-config', { method: 'POST', body });
      toast('پیکربندی پرداخت ذخیره شد.');
      viewPayment.__last = res.config;
    } catch (e) {
      errEl.textContent = e.message;
    }
  };
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
}

function paymentGatewayCard(g, config) {
  const cfg = config.GATEWAYS?.[g.key] || {};
  const inputs = g.fields.map((f) => {
    const v = cfg[f.key] ?? '';
    const req = f.required ? ' <span class="req">*</span>' : '';
    if (f.type === 'boolean') {
      return '<label class="chk"><input type="checkbox" id="pc-' + g.key + '-' + f.key + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }
    const input = '<input id="pc-' + g.key + '-' + f.key + '" dir="ltr"' +
      (f.secret ? ' type="password" autocomplete="off"' : '') +
      ' value="' + esc(v) + '">';
    return '<div><label>' + esc(f.label) + req + '</label>' + input + '</div>';
  }).join('');
  const ready = g.fields.filter((f) => f.required).every((f) => f.type === 'boolean' ? cfg[f.key] : (cfg[f.key] ?? '') !== '');
  return '<div class="card"><div class="form-head">' + icon('card') + esc(g.label) +
    (ready ? ' <span class="pill on">آماده</span>' : ' <span class="pill off">تنظیم نشده</span>') + '</div>' +
    '<div class="row">' + inputs + '</div></div>';
}

// ---------- shared widgets ----------
function pager(page, pages, go) {
  if (pages <= 1) return '';
  return '<div class="pager">' +
    (page > 1 ? '<button class="btn" data-p="' + (page - 1) + '">' + icon('chevRight') + 'قبلی</button>' : '') +
    '<span class="muted num">صفحه ' + fa(page) + ' از ' + fa(pages) + '</span>' +
    (page < pages ? '<button class="btn" data-p="' + (page + 1) + '">بعدی' + icon('chevLeft') + '</button>' : '') +
    '</div>';
}
function bindPager(page, pages, go) {
  if (pages <= 1) return;
  document.querySelectorAll('.pager button').forEach((b) => (b.onclick = () => go(Number(b.dataset.p))));
}

// ---------- boot ----------
(async function boot() {
  try {
    await api('/admin/api/session');
    route('dash');
  } catch { /* 401 already rendered the login screen */ }
})();
</script>
</body>
</html>`;
}
