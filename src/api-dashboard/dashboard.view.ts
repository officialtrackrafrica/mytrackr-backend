import type { DashboardData } from './dashboard.service';
import type { Integration } from '../integrations/entities/integration.entity';

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const e = escapeHtml;
const base = '/api/dashboard';
const date = (value: unknown) =>
  value && !Number.isNaN(new Date(String(value)).getTime())
    ? new Date(String(value)).toLocaleString('en-GB', {
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: 'short',
      }) + ' UTC'
    : 'Not yet';
const number = (value: unknown) => Number(value || 0).toLocaleString('en-GB');
const money = (amount: unknown, currency: string) =>
  `${e(currency)} ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hidden = (csrf: string) =>
  `<input type="hidden" name="csrf" value="${e(csrf)}">`;
const link = (section: string, id?: string) =>
  section === 'guides'
    ? '/developers/guides'
    : `${base}${section === 'overview' ? '' : '/' + section}${id ? '?integrationId=' + encodeURIComponent(id) : ''}`;
const badge = (
  value: string,
  good = value === 'active' || value === 'delivered' || value === 'order.paid',
) =>
  `<span class="badge ${good ? 'good' : 'neutral'}">${e(value.replace(/_/g, ' '))}</span>`;
const empty = (title: string, copy: string, action = '') =>
  `<div class="empty"><span class="empty-icon" aria-hidden="true">⌘</span><h3>${title}</h3><p>${copy}</p>${action}</div>`;
const button = (href: string, label: string, secondary = false) =>
  `<a class="button ${secondary ? 'secondary' : ''}" href="${e(href)}">${label}</a>`;

export const dashboardCss = `
.brand-mark{overflow:hidden;background:#fff!important;display:grid;place-items:center;flex-shrink:0}.brand-mark img{display:block;width:32px;height:32px;max-width:100%;object-fit:contain}
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#182c3d;background:#f5f7fa;font-size:14px;line-height:1.55;color-scheme:light}*{box-sizing:border-box}body{margin:0}a{color:#087c62;text-underline-offset:3px}button,input,select,textarea{font:inherit}button,a,input,select,textarea{outline-offset:4px}button:focus-visible,a:focus-visible{outline:3px solid #27b698}button{cursor:pointer}.shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh}.sidebar{background:#101f2d;color:#b5c2cd;padding:29px 22px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}.brand{color:#fff;font-size:23px;font-weight:800;letter-spacing:-1px;text-decoration:none;display:flex;align-items:center;gap:10px}.brand-mark{background:#1cc293;color:#102e27;border-radius:9px;width:32px;height:32px;text-align:center;font-size:24px;line-height:30px}.workspace{font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#7b919f;margin:37px 12px 12px}.sidebar nav{display:grid;gap:6px}.sidebar nav a{color:#b5c2cd;text-decoration:none;padding:11px 12px;border-radius:7px;display:flex;gap:13px;align-items:center;font-weight:500}.sidebar nav a:hover{background:#1b3042;color:white}.sidebar nav a[aria-current=page]{background:#193c39;color:#7ce1be}.nav-icon{font-family:monospace;font-size:18px;width:20px;text-align:center}.sidebar-bottom{margin-top:auto;padding-top:30px;font-size:12px}.sidebar-bottom p{overflow-wrap:anywhere}.sidebar-bottom button{border:1px solid #3c4c59;background:transparent;color:#d6dfe6;width:100%;padding:9px;border-radius:6px}.topbar{background:#fff;border-bottom:1px solid #e3e9ef;padding:19px 38px;display:flex;justify-content:space-between;align-items:center;gap:15px}.topbar small{color:#788794}.account{display:flex;align-items:center;gap:10px}.avatar{background:#e2f3ed;color:#12745c;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700}.content{max-width:1400px;margin:auto;padding:34px 38px 60px}.page-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:27px}.eyebrow{font-size:11px;letter-spacing:1.7px;text-transform:uppercase;font-weight:700;color:#788a99;margin:0 0 8px}h1{font-size:29px;line-height:1.2;letter-spacing:-.8px;margin:0 0 10px;font-weight:700}h2{font-size:17px;margin:0 0 6px;letter-spacing:-.2px}h3{margin:0 0 8px;font-size:15px}p{margin:7px 0 16px}.muted,.hint{color:#738391}.hint{font-size:12px}.button,button.primary{display:inline-flex;align-items:center;justify-content:center;background:#0b8768;color:#fff;border:1px solid #0b8768;border-radius:7px;font-weight:600;text-decoration:none;padding:10px 16px;gap:8px;white-space:nowrap}.button:hover,button.primary:hover{background:#076c53}.button.secondary,button.secondary{background:#fff;color:#304759;border:1px solid #d7e0e8;border-radius:7px;padding:9px 14px;text-decoration:none;font-weight:600}.button.small{font-size:12px;padding:6px 10px}button:disabled{opacity:.6;cursor:wait}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px;margin-bottom:25px}.stat,.panel{background:#fff;border:1px solid #e0e7ee;border-radius:10px;box-shadow:0 2px 3px #152d4003}.stat{padding:20px}.stat p{font-size:12px;color:#738391;margin:0 0 9px}.stat strong{font-size:29px;display:block;letter-spacing:-1px}.stat small{display:block;color:#82919c;margin-top:10px;font-size:11px}.panel{margin-bottom:22px;overflow:hidden}.panel-header{padding:20px 23px;border-bottom:1px solid #edf1f4;display:flex;justify-content:space-between;align-items:center;gap:14px}.panel-header p{margin:4px 0 0;font-size:12px;color:#738391}.panel-body{padding:24px}.columns{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);gap:22px}.badge{font-size:11px;display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:5px;white-space:nowrap;font-weight:600}.badge.good{color:#087454;background:#e3f6ee}.badge.neutral{color:#6f6d58;background:#f4f2e9}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}th{background:#fbfcfd;color:#738391;text-transform:uppercase;letter-spacing:.6px;font-size:10px;font-weight:600;text-align:left}td,th{padding:14px 22px;border-bottom:1px solid #eef2f5}tbody tr:last-child td{border-bottom:0}td strong{display:block;font-size:13px;font-weight:600}td small{color:#81919e}.right{text-align:right}.actions{display:flex;gap:7px}.empty{text-align:center;padding:42px 20px;color:#738391;white-space:normal}.empty h3{color:#263b4c;font-size:17px}.empty p{max-width:430px;margin:8px auto 20px}.empty-icon{display:grid;place-items:center;width:43px;height:43px;margin:0 auto 16px;background:#eff5f5;color:#168369;border-radius:12px;font-size:23px}.notice{border:1px solid #c4e6da;background:#edf9f3;color:#205c47;border-radius:8px;padding:15px 19px;margin-bottom:23px}.notice.warning{background:#fff8e8;border-color:#eddfba;color:#7b5b1e}.notice.error{background:#fff0ed;border-color:#f0cec5;color:#8c3827}.notice p:last-child{margin-bottom:0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}label{display:block;font-size:12px;font-weight:600;color:#344f62}label .hint{display:block;font-weight:400;margin-top:5px}input,textarea,select{display:block;width:100%;margin:7px 0 0;border:1px solid #ccd9e3;background:#fff;color:#1c3649;border-radius:6px;padding:10px 11px;min-height:42px}textarea{resize:vertical;min-height:105px}input:focus,textarea:focus,select:focus{border-color:#0b8768;outline:2px solid #0b876820}.full{grid-column:1/-1}.form-footer{margin-top:23px;display:flex;justify-content:flex-end;gap:10px}.key-row{padding:19px 0;border-bottom:1px solid #ecf0f4}.key-row:first-child{padding-top:0}.key-row:last-child{border-bottom:0;padding-bottom:0}.key-value{display:flex;gap:10px;align-items:center;margin-top:9px}.key-value code{flex:1;overflow-wrap:anywhere;background:#f4f7fa;border:1px solid #e2e9ef;padding:12px;border-radius:6px;font-size:12px}.key-value button{flex-shrink:0}code,pre{font-family:"SFMono-Regular",Consolas,monospace}pre{background:#102332;color:#c5e8dc;border-radius:8px;padding:20px;font-size:12px;line-height:1.8;overflow:auto;margin:15px 0}pre code{color:inherit}.steps{list-style:none;counter-reset:step;padding:0;margin:0}.steps li{counter-increment:step;position:relative;padding:2px 0 22px 39px}.steps li:before{content:counter(step);position:absolute;left:0;background:#e9f4ef;border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-size:11px;color:#087454;font-weight:700}.steps p{font-size:12px;color:#738391;margin:5px 0 0}.currency-row{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid #edf1f4;gap:20px}.currency-row:last-child{border:0}.currency-row span{font-size:12px;color:#738391}.currency-row strong{font-size:21px}.danger{border-color:#edd7d1}.danger button{background:#ad4339;color:white;border:0;border-radius:6px;padding:10px 15px;font-weight:600}.check{display:flex;align-items:center;gap:8px}.check input{width:16px;min-height:auto;margin:0}.pagination{padding:16px 22px;display:flex;align-items:center;justify-content:space-between;font-size:12px;gap:12px;border-top:1px solid #edf1f4}.integration-picker{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}.integration-picker a{font-size:12px;text-decoration:none;border:1px solid #dce5ed;padding:7px 11px;border-radius:6px;background:white}.integration-picker a.selected{border-color:#0b8768;color:#087454;background:#eaf6f0}.auth-layout{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}.auth-intro{background:#102332;color:#fff;padding:65px;display:flex;flex-direction:column;justify-content:center}.auth-intro h1{font-size:44px;line-height:1.2;max-width:440px;margin-top:65px}.auth-intro p{color:#9fb7c6;max-width:400px;font-size:16px;line-height:1.8}.auth-form{display:grid;place-items:center;padding:40px}.auth-card{width:min(410px,100%)}.auth-card form{display:grid;gap:18px;margin:27px 0}.auth-card button{width:100%}.footer-note{font-size:11px;color:#8796a3;margin-top:30px}.secret textarea{font-family:Consolas,monospace;font-size:13px}.secret .actions{margin-top:12px}.section-label{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d909e;margin-bottom:20px}.plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}.price{font-size:29px;font-weight:700;letter-spacing:-1px}.price small{font-size:12px;font-weight:400;letter-spacing:0;color:#738391}.features{padding-left:18px;color:#647d8b;font-size:12px}.features li{margin-bottom:9px}details summary{cursor:pointer;font-weight:600}details[open] summary{margin-bottom:22px}.login-links{display:flex;justify-content:space-between;font-size:12px}#copy-status{min-height:20px;font-size:12px;color:#087454}.error-card{max-width:570px;margin:12vh auto;padding:30px}.screen-reader{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(min-width:1500px){.content{padding-top:45px}}@media(max-width:1100px){.stats{grid-template-columns:repeat(2,1fr)}.columns{grid-template-columns:1fr}.sidebar{width:210px}.shell{grid-template-columns:210px minmax(0,1fr)}.content{padding:26px 23px}.topbar{padding:17px 23px}}@media(max-width:720px){.shell{display:block}.sidebar{width:auto;height:auto;position:static;padding:18px}.sidebar nav{display:flex;overflow:auto;gap:4px}.sidebar nav a{padding:8px 10px;font-size:12px;white-space:nowrap}.sidebar .workspace,.sidebar .nav-icon{display:none}.sidebar .brand{margin-bottom:16px}.sidebar-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:12px}.sidebar-bottom p{margin:0}.sidebar-bottom button{width:auto}.content{padding:25px 16px}.topbar{padding:13px 16px;font-size:12px}.topbar small{display:none}.page-heading{align-items:flex-start;flex-direction:column;gap:8px}h1{font-size:26px}.stats{gap:10px}.stat{padding:15px}.stat strong{font-size:25px}.form-grid{grid-template-columns:1fr}.full{grid-column:auto}.panel-header,.panel-body{padding:18px}.auth-layout{display:block}.auth-intro{padding:28px}.auth-intro h1{font-size:28px;margin-top:26px}.auth-intro p{font-size:13px}.auth-form{padding:28px 20px}.key-value{align-items:stretch;flex-direction:column}.pagination{flex-wrap:wrap}.account span:last-child{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}@media print{.sidebar,.topbar,.button,button{display:none}.shell{display:block}.content{padding:0}.panel{break-inside:avoid}}
/* MyTrackr brand and responsive navigation. */
:root{--brand-blue:#135ed6;--brand-lime:#cae596;--brand-ink:#142e50;background:#f5f7fc;color:#203650}
a{color:var(--brand-blue)}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--brand-blue);outline-offset:4px}
.sidebar,.auth-intro{background:#102c55}.sidebar{border-right:1px solid #23416b}.sidebar nav a{color:#c5d3e8;min-height:46px}.sidebar nav a:hover{background:#214273}.sidebar nav a[aria-current=page]{background:var(--brand-lime);color:#213b1d}.workspace{color:#a6bddc}.sidebar-bottom button{border-color:#5c7496;color:#fff;min-height:44px}.brand-mark{width:40px;height:40px;border-radius:10px}.brand-mark img{width:40px;height:40px}.avatar{background:#edf4df;color:#36581a}.button,button.primary{background:var(--brand-blue);border-color:var(--brand-blue);min-height:44px}.button:hover,button.primary:hover{background:#1049ae}.button.secondary:hover,button.secondary:hover{background:#eff4fc;color:#214577}.badge.good{color:#35551e;background:#edf5dc}.empty-icon,.steps li:before{background:#eaf0fc;color:var(--brand-blue)}.notice{background:#f1f7e7;border-color:#d7e8b9;color:#344d26}.integration-picker a.selected{background:#edf3ff;border-color:var(--brand-blue);color:#174da0}input:focus,textarea:focus,select:focus{border-color:var(--brand-blue);outline:2px solid #135ed625}pre{background:#102c55;color:#e1edff}#copy-status{color:#285aaf}.auth-intro p{color:#c0cfe4}.auth-intro h1{color:#fff}.auth-intro h1:after{content:'';display:block;width:64px;height:5px;background:var(--brand-lime);border-radius:4px;margin-top:28px}.stat:first-child{border-top:3px solid var(--brand-blue)}.stat:nth-child(2){border-top:3px solid var(--brand-lime)}.actions,.form-footer{flex-wrap:wrap}.shell>div,.content,.panel,.columns>*{min-width:0}.muted,.hint,.footer-note{overflow-wrap:anywhere}.mobile-dashboard-header{display:none}.table-scroll{overscroll-behavior-x:contain}.error-card{margin:12vh auto}
@media(max-width:720px){
.sidebar{display:none}.mobile-dashboard-header{display:flex;position:sticky;top:0;z-index:30;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#102c55;border-bottom:3px solid var(--brand-lime)}.mobile-dashboard-header .brand{font-size:21px;letter-spacing:-.7px}.mobile-dashboard-header .brand-mark{width:36px;height:36px}.mobile-dashboard-header .brand-mark img{width:36px;height:36px}.mobile-dashboard-menu summary{display:flex;align-items:center;gap:9px;color:white;border:1px solid #6b81a1;border-radius:8px;padding:9px 12px;min-height:44px;font-size:13px;list-style:none;cursor:pointer}.mobile-dashboard-menu summary::-webkit-details-marker{display:none}.menu-glyph{width:16px;height:12px;border-top:2px solid currentColor;border-bottom:2px solid currentColor;position:relative}.menu-glyph:after{content:'';position:absolute;top:4px;left:0;width:16px;border-top:2px solid currentColor}.mobile-dashboard-menu[open] summary{margin-bottom:0;background:#cae596;color:#203b1b;border-color:#cae596}.mobile-dashboard-panel{position:absolute;top:100%;left:12px;right:12px;max-height:calc(100dvh - 90px);overflow-y:auto;background:white;color:#203650;border:1px solid #d9e3ef;box-shadow:0 18px 38px #102c5530;border-radius:0 0 14px 14px;padding:18px}.mobile-dashboard-panel .workspace{color:#6d7f96;margin:0 10px 12px;font-size:10px}.mobile-dashboard-panel nav{display:grid;gap:5px}.mobile-dashboard-panel nav a{display:flex;align-items:center;gap:12px;min-height:46px;padding:10px 12px;border-radius:8px;color:#3b526e;text-decoration:none;font-weight:600}.mobile-dashboard-panel nav a[aria-current=page]{background:#edf3ff;color:#135ed6;box-shadow:inset 3px 0 #135ed6}.mobile-dashboard-panel nav a:hover{background:#f0f5e5}.mobile-dashboard-panel .sidebar-bottom{display:block;border-top:1px solid #e1e8f2;margin-top:15px;padding:15px 0 0}.mobile-dashboard-panel .sidebar-bottom p{margin:0 0 10px;color:#677c94}.mobile-dashboard-panel .sidebar-bottom button{width:100%;color:#294970;background:#f5f8fc;border:1px solid #d5dfed}.topbar{padding:13px 18px;gap:12px;align-items:center}.topbar>div:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48%}.account{gap:7px;min-width:0}.account span:last-child{max-width:145px}.content{padding:25px 18px 40px}.page-heading{gap:16px;margin-bottom:22px}.page-heading .button{width:100%}.page-heading>div{width:100%}.page-heading p{margin-bottom:0;font-size:13px;line-height:1.65}h1{font-size:27px}.panel{border-radius:12px;margin-bottom:18px}.panel-header{flex-wrap:wrap;align-items:flex-start;gap:12px}.panel-header,.panel-body{padding:18px}.panel-header h2{font-size:16px}.panel-header .button{min-height:40px}.stats{gap:12px}.stat{padding:15px 13px;border-radius:12px}.stat strong{font-size:24px;overflow-wrap:anywhere}.stat small{line-height:1.5}.form-grid{gap:18px}.form-grid label{font-size:13px}input,textarea,select{font-size:16px;min-height:46px}.hint{font-size:12px;line-height:1.65}.form-footer>*{width:100%}.form-footer{margin-top:20px}.key-value code{min-width:0;font-size:12px}.key-value button{width:100%;min-height:44px}.secret .actions>*{width:100%;white-space:normal;text-align:center}.secret textarea{font-size:13px}.actions{gap:9px}.pagination{padding:15px 18px;align-items:flex-start;gap:14px}.pagination .actions{width:100%}.pagination .actions>*{flex:1}.integration-picker{gap:8px}.integration-picker a{padding:10px 12px;min-height:44px;max-width:100%;overflow-wrap:anywhere}.plan-grid{grid-template-columns:minmax(0,1fr);gap:15px}.currency-row{gap:12px;flex-wrap:wrap}.currency-row strong{font-size:20px}.notice{padding:15px;line-height:1.7}.table-scroll{background:linear-gradient(90deg,#fff 30%,#ffffff00),linear-gradient(270deg,#fff 30%,#ffffff00),linear-gradient(90deg,#102c5518,#ffffff00),linear-gradient(270deg,#102c5518,#ffffff00);background-position:left,right,left,right;background-size:30px 100%,30px 100%,12px 100%,12px 100%;background-repeat:no-repeat;background-attachment:local,local,scroll,scroll}td,th{padding:13px 16px}.auth-intro{padding:25px 22px}.auth-intro h1{font-size:30px;margin-top:30px}.auth-intro p{font-size:14px;line-height:1.7}.auth-intro .footer-note{display:none}.auth-form{padding:30px 22px 40px}.login-links{flex-wrap:wrap;gap:14px}.error-card{margin:40px 18px;padding:24px}.error-card .actions>*{width:100%}
}
@media(prefers-reduced-motion:no-preference){.button,.sidebar nav a,.mobile-dashboard-panel nav a{transition:background .15s ease}}
`;

function document(title: string, body: string, nonce: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(title)} · MyTrackr Developers</title><link rel="stylesheet" href="${base}/assets/dashboard.css"></head><body>${body}<script nonce="${e(nonce)}">
document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{if(form.dataset.confirm&&!window.confirm(form.dataset.confirm)){event.preventDefault();return;}form.querySelectorAll('button[type="submit"]').forEach(button=>{button.disabled=true;button.textContent='Please wait…';});}));
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{const target=document.getElementById(button.dataset.copy);try{await navigator.clipboard.writeText(target.value||target.textContent);document.getElementById('copy-status').textContent='Copied to clipboard.';}catch{document.getElementById('copy-status').textContent='Clipboard unavailable. Select the value and copy it manually.';}}));
document.querySelectorAll('[data-mobile-navigation]').forEach(menu=>{document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});});
window.addEventListener('pagehide',()=>{document.querySelectorAll('.secret textarea').forEach(secret=>secret.value='');});window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
</script></body></html>`;
}

export function loginPage(csrf: string, nonce: string) {
  return document(
    'Sign in',
    `<main class="auth-layout"><section class="auth-intro"><a class="brand" href="${base}"><span class="brand-mark"><img src="/developers/assets/mytrackr-logo.png" alt="" width="44" height="44"></span>mytrackr<span class="hint"> / developers</span></a><h1>Your website.<br>Your data.<br>Connected.</h1><p>Bring your website’s orders and payments into one financial picture. Build, connect, and manage your integration from here.</p><p class="footer-note">MYTRACKR DEVELOPER PLATFORM</p></section><section class="auth-form"><div class="auth-card"><p class="eyebrow">Developer dashboard</p><h1>Welcome back</h1><p class="muted">Sign in with your MyTrackr account.</p><form method="post" action="${base}/login">${hidden(csrf)}<label>Email address<input type="email" name="email" autocomplete="username" maxlength="254" required autofocus></label><label>Password<input type="password" name="password" autocomplete="current-password" maxlength="256" required></label><button type="submit" class="primary">Sign in to your dashboard <span aria-hidden="true">→</span></button></form><p class="hint">Use your existing verified email account. Google-only accounts need a password set through MyTrackr’s account recovery flow before using this dashboard.</p><a href="/developers/guides">Read the integration guides →</a><p class="footer-note">Your credentials stay on your server. Secret API keys are never included in website code.</p></div></section></main>`,
    nonce,
  );
}

export function errorPage(status: number, message: string, nonce: string) {
  return document(
    'Unable to continue',
    `<main class="panel error-card"><p class="eyebrow">Request ${status}</p><h1>Let’s try that again</h1><p>${e(message)}</p><div class="actions">${button(base, 'Back to dashboard')}${button(base + '/login', 'Sign in', true)}</div><p class="hint">If you just created or rotated a key and lost the response, rotate it again after signing in. Existing secrets cannot be recovered.</p></main>`,
    nonce,
  );
}

function integrationForm(csrf: string, current?: Integration) {
  return `<form method="post" action="${base}/integrations${current ? '/' + e(current.id) + '/settings' : ''}">${hidden(csrf)}<div class="form-grid"><label>Integration name<input name="name" value="${e(current?.name)}" placeholder="My storefront" maxlength="120" required></label><label>Platform<select name="platform">${['custom', 'react', 'wordpress'].map((value) => `<option value="${value}" ${current?.platform === value ? 'selected' : ''}>${value === 'custom' ? 'Custom / other' : value === 'react' ? 'React' : 'WordPress'}</option>`).join('')}</select></label><label class="full">Allowed website origins<textarea name="allowedOrigins" placeholder="https://yourwebsite.com&#10;https://www.yourwebsite.com" maxlength="4096">${e(current?.allowedOrigins?.join('\n'))}</textarea><span class="hint">One HTTPS origin per line, up to 20. An empty list allows public configuration from any origin; it does not grant access to private APIs.</span></label><label>Redirect URL <span class="hint">Optional website callback</span><input type="url" name="redirectUrl" value="${e(current?.redirectUrl)}" placeholder="https://yourwebsite.com/callback" maxlength="2048"></label><label>Webhook endpoint <span class="hint">Optional public HTTPS endpoint</span><input type="url" name="webhookUrl" value="${e(current?.webhookUrl)}" placeholder="https://yourwebsite.com/webhooks/mytrackr" maxlength="2048"></label></div><div class="form-footer"><button class="primary" type="submit">${current ? 'Save settings' : 'Create integration'}</button></div></form>`;
}

function sensitiveForm(
  csrf: string,
  current: Integration,
  action: 'rotate-key' | 'revoke' | 'rotate-webhook-secret',
) {
  const rotate = action !== 'revoke';
  const credential =
    action === 'rotate-webhook-secret'
      ? 'webhook signing secret'
      : 'secret API key';
  const warning = rotate
    ? `Rotate this ${credential}? The current ${credential} will stop working immediately.`
    : 'Revoke this integration? Its API key and public config will stop working.';
  return `<form method="post" action="${base}/integrations/${e(current.id)}/${action}" data-confirm="${e(warning)}">${hidden(csrf)}<div class="form-grid"><label>Confirm your password<input type="password" name="password" autocomplete="current-password" maxlength="256" required></label><label class="check full"><input type="checkbox" name="confirmation" value="confirm" required>I understand ${rotate ? `the old ${credential} will stop working immediately` : 'this integration will be permanently disabled'}.</label></div><div class="form-footer"><button type="submit" class="${rotate ? 'primary' : ''}">${rotate ? `Rotate ${credential}` : 'Revoke integration'}</button></div></form>`;
}

function picker(data: DashboardData, section: string) {
  if (!data.integrations.length) return '';
  const candidates =
    data.selected &&
    !data.integrations.some((item) => item.id === data.selected?.id)
      ? [data.selected, ...data.integrations]
      : data.integrations;
  return `<nav class="integration-picker" aria-label="Choose integration">${candidates.map((item) => `<a class="${data.selected?.id === item.id ? 'selected' : ''}" href="${e(link(section, item.id))}">${e(item.name)}</a>`).join('')}</nav>`;
}

function pages(
  section: string,
  page: number,
  total: number,
  size: number,
  id?: string,
) {
  const count = Math.max(1, Math.ceil(total / size));
  const url = (p: number) => `${link(section, id)}${id ? '&' : '?'}page=${p}`;
  return `<div class="pagination"><span>${number(total)} record${total === 1 ? '' : 's'} · Page ${page} of ${count}</span><div class="actions">${page > 1 ? button(url(page - 1), '← Previous', true) : ''}${page < count ? button(url(page + 1), 'Next →', true) : ''}</div></div>`;
}

function eventTable(data: DashboardData) {
  if (!data.records.length)
    return empty(
      'No events received yet',
      'Your incoming order and payment events will appear here after your server sends them.',
      button(link('docs'), 'View setup guide', true),
    );
  return `<div class="table-scroll"><table><thead><tr><th>Event / reference</th><th>Status</th><th>Amount</th><th>Received</th></tr></thead><tbody>${data.records.map((event) => `<tr><td><strong>${e(event.externalId)}</strong><small>${e(event.id)}</small></td><td>${badge(event.event)}</td><td>${money(event.amount, event.currency)}</td><td>${e(date(event.createdAt))}</td></tr>`).join('')}</tbody></table></div>`;
}

function overview(data: DashboardData) {
  const entitled = data.subscription.hasActiveSubscription;
  return `<div class="stats"><article class="stat"><p>Total integrations</p><strong>${number(data.integrationCount)}</strong><small>Across your websites</small></article><article class="stat"><p>Enabled integrations</p><strong>${number(data.activeCount)}</strong><small>Subscription access still applies</small></article><article class="stat"><p>Events received</p><strong>${number(data.eventCount)}</strong><small>All time · accepted events</small></article><article class="stat"><p>Current plan</p><strong>${e(data.subscription.activePlan?.name || 'No plan')}</strong><small>${entitled ? 'Subscription active' : 'Choose a plan to start connecting'}</small></article></div><div class="columns"><section class="panel"><div class="panel-header"><div><h2>Website activity</h2><p>Payments received this month, grouped by currency</p></div>${badge('Month to date', true)}</div><div class="panel-body">${data.currencies.length ? data.currencies.map((row) => `<div class="currency-row"><div><span>${e(row.currency)} · ${number(row.count)} events</span><br><strong>${money(row.paid, row.currency)}</strong></div><div class="right"><span>Refunds</span><br>${money(row.refunded, row.currency)}</div></div>`).join('') : empty('Your activity starts here', 'Connect a website and send your first event. Real revenue and refund totals will appear here.')}</div></section><section class="panel"><div class="panel-header"><h2>Your integration checklist</h2></div><div class="panel-body"><ol class="steps"><li><h3>Activate website access</h3><p>Choose a Web plan or another plan with website linking.</p></li><li><h3>Create your integration</h3><p>Register your website and configure its allowed origins.</p></li><li><h3>Connect your server</h3><p>Save the secret key in your server environment and send your first event.</p></li></ol>${button(link('docs'), 'Read the setup guide', true)}</div></section></div><section class="panel"><div class="panel-header"><div><h2>Recent events</h2><p>The latest events accepted from your integrations</p></div><a href="${link('events')}">View all →</a></div>${eventTable(data)}</section>`;
}

function integrationsPage(
  data: DashboardData,
  csrf: string,
  canManage: boolean,
) {
  return `<section class="panel"><div class="panel-header"><div><h2>Your integrations</h2><p>Manage the websites connected to your business</p></div>${badge(`${data.integrationCount} total`, true)}</div>${data.integrations.length ? `<div class="table-scroll"><table><thead><tr><th>Website</th><th>Platform</th><th>Status</th><th>Last API activity</th><th>Manage</th></tr></thead><tbody>${data.integrations.map((item) => `<tr><td><strong>${e(item.name)}</strong><small>${e(item.allowedOrigins[0] || 'No origin restriction')}</small></td><td>${e(item.platform)}</td><td>${badge(item.isActive ? 'enabled' : 'revoked', item.isActive)}</td><td>${e(date(item.lastUsedAt))}</td><td><div class="actions">${button(link('keys', item.id), 'Keys', true)}${button(link('settings', item.id), 'Settings', true)}</div></td></tr>`).join('')}</tbody></table></div>${pages('integrations', data.integrationPage, data.integrationCount, data.size)}` : empty('Connect your first website', 'Create an integration to receive a public key and a server-side secret key.')}</section>${canManage && data.business ? `<section class="panel" id="create"><div class="panel-body"><details ${data.integrationCount === 0 ? 'open' : ''}><summary>Create a new integration</summary>${integrationForm(csrf)}</details></div></section>` : ''}`;
}

function keysPage(data: DashboardData, csrf: string, canManage: boolean) {
  const item = data.selected;
  if (!item)
    return empty(
      'No integration selected',
      'Create an integration before managing API keys.',
      button(link('integrations'), 'View integrations'),
    );
  return `${picker(data, 'keys')}<section class="panel"><div class="panel-header"><div><h2>${e(item.name)} · API credentials</h2><p>Use the public key in your website. Keep the secret key on your server.</p></div>${badge(item.isActive ? 'enabled' : 'revoked', item.isActive)}</div><div class="panel-body"><div class="key-row"><h3>Public key</h3><p class="hint">Identifies your integration. It cannot authenticate private API calls.</p><div class="key-value"><code id="public-key">${e(item.publicKey)}</code><button type="button" class="secondary" data-copy="public-key">Copy public key</button></div></div><div class="key-row"><h3>Secret API key</h3><p class="hint">Only the prefix is retained for display. Generate a replacement if you no longer have the key.</p><div class="key-value"><code>${e(item.apiKeyPrefix)}••••••••••••••••••••</code></div></div></div></section>${canManage && item.isActive ? `<section class="panel"><div class="panel-header"><div><h2>Rotate secret key</h2><p>Your existing key stops working immediately. Update your server after rotating.</p></div></div><div class="panel-body">${sensitiveForm(csrf, item, 'rotate-key')}</div></section>` : '<div class="notice warning">An active website-linking subscription and enabled integration are required to rotate keys.</div>'}`;
}

function settingsPage(data: DashboardData, csrf: string, canManage: boolean) {
  const item = data.selected;
  if (!item)
    return empty(
      'No integration selected',
      'Create an integration to configure your website.',
      button(link('integrations'), 'View integrations'),
    );
  return `${picker(data, 'settings')}<section class="panel"><div class="panel-header"><div><h2>${e(item.name)} · Website settings</h2><p>Manage allowed origins and callbacks</p></div></div><div class="panel-body">${canManage && item.isActive ? integrationForm(csrf, item) : '<p>This integration is read-only. An active website-linking subscription and enabled integration are required to change settings.</p>'}</div></section>${item.isActive ? `<section class="panel danger"><div class="panel-header"><div><h2>Revoke integration</h2><p>Disable this integration and its API key. This dashboard cannot reactivate a revoked integration.</p></div></div><div class="panel-body">${sensitiveForm(csrf, item, 'revoke')}</div></section>` : '<div class="notice warning">This integration has been revoked. Create a new integration to reconnect your website.</div>'}`;
}

function webhookPage(data: DashboardData, csrf: string, canManage: boolean) {
  return `${picker(data, 'webhooks')}<section class="panel"><div class="panel-header"><div><h2>Webhook deliveries</h2><p>${data.selected ? e(data.selected.name) : 'Select an integration'} · Outbound lifecycle and event notifications</p></div>${data.selected?.webhookUrl ? badge('Endpoint configured', true) : badge('No endpoint')}</div>${data.records.length ? `<div class="table-scroll"><table><thead><tr><th>Event / delivery</th><th>Status</th><th>Retries</th><th>Created</th><th>Last processed</th><th>Action</th></tr></thead><tbody>${data.records.map((row) => `<tr><td><strong>${e(row.event)}</strong><small>${e(row.id)}</small></td><td>${badge(row.status)}</td><td>${number(row.retryCount)}</td><td>${e(date(row.createdAt))}</td><td>${e(date(row.processedAt))}</td><td>${row.status === 'failed' && row.retryCount < 5 && data.selected?.isActive ? `<form method="post" action="${base}/integrations/${e(data.selected.id)}/webhooks/${e(row.id)}/retry" data-confirm="Retry this delivery? Your endpoint must deduplicate the delivery ID.">${hidden(csrf)}<button type="submit" class="secondary">Retry delivery</button></form>` : '—'}</td></tr>`).join('')}</tbody></table></div>${pages('webhooks', data.recordPage, data.recordCount, data.size, data.selected?.id)}` : empty('No webhook deliveries yet', data.selected?.webhookUrl ? 'Deliveries will appear here when your integration creates an outbound notification.' : 'Add a public HTTPS webhook endpoint in your integration settings.', data.selected ? button(link('settings', data.selected.id), 'Configure endpoint', true) : '')}</section><div class="notice"><h3>Verify every notification</h3><p>Verify the <code>x-mytrackr-signature</code> header as <code>sha256=HMAC_SHA256(raw request body, your signing secret)</code> using a timing-safe comparison. Deduplicate <code>x-mytrackr-delivery-id</code> before applying changes, then return a 2xx response. Retries retain the original delivery ID.</p></div>${canManage && data.selected?.isActive ? `<section class="panel"><div class="panel-header"><div><h2>Webhook signing secret</h2><p>Each new integration receives its own signing secret. Generate a replacement if yours is missing or was created before individual secrets were introduced.</p></div></div><div class="panel-body"><p class="hint">Rotating a signing secret takes effect immediately, including retries. Update your webhook receiver before processing new deliveries.</p>${sensitiveForm(csrf, data.selected, 'rotate-webhook-secret')}</div></section>` : ''}`;
}

function billingPage(data: DashboardData, csrf: string, canManage: boolean) {
  return `<section class="panel"><div class="panel-header"><h2>Subscription access</h2>${badge(data.subscription.hasActiveSubscription ? 'active' : 'inactive', data.subscription.hasActiveSubscription)}</div><div class="panel-body"><h2>${e(data.subscription.activePlan?.name || 'No active subscription')}</h2><p class="muted">${data.subscription.expiresAt ? 'Current period ends ' + e(date(data.subscription.expiresAt)) : 'Your plan controls access to website linking and private integration APIs.'}</p>${data.subscription.cancelAtPeriodEnd ? '<div class="notice warning">Automatic renewal is disabled. Access continues until the current period ends.</div>' : ''}</div></section><div class="plan-grid">${data.plans
    .map(
      (plan) =>
        `<section class="panel"><div class="panel-body"><p class="eyebrow">${e(plan.name)}</p><div class="price">${money(plan.price, plan.currency)} <small>/ ${e(plan.interval)}</small></div><p class="hint">Website integration access included</p><ul class="features">${(
          plan.features || []
        )
          .filter((feature) => !/^[a-z0-9_]+$/.test(feature))
          .slice(0, 5)
          .map((feature) => `<li>${e(feature)}</li>`)
          .join(
            '',
          )}</ul>${canManage ? '<p class="hint">Your current subscription includes website access.</p>' : plan.slug === 'web' ? `<form method="post" action="${base}/checkout" target="_blank" rel="noopener">${hidden(csrf)}<input type="hidden" name="planSlug" value="web"><button type="submit" class="primary">Subscribe to Web ↗</button><p class="hint">Checkout opens in a new tab. Return here and reload after payment.</p></form>` : '<p class="hint">Manage this plan in the MyTrackr app.</p>'}</div></section>`,
    )
    .join(
      '',
    )}</div><section class="panel"><div class="panel-header"><div><h2>Already completed payment?</h2><p>If access has not updated, verify your Paystack payment reference.</p></div></div><div class="panel-body"><form method="post" action="${base}/verify-payment">${hidden(csrf)}<label>Payment reference<input name="reference" maxlength="160" pattern="[A-Za-z0-9_-]+" placeholder="sub_…" required></label><div class="form-footer"><button type="submit" class="primary">Verify payment</button></div></form></div></section>`;
}

function docsPage() {
  return `<div class="columns"><section class="panel"><div class="panel-header"><h2>Send your first event</h2>${badge('Server-side only', true)}</div><div class="panel-body"><p class="muted">Store your secret key as <code>MYTRACKR_API_KEY</code> in your server environment. Replace <code>MYTRACKR_API_URL</code> with this backend’s HTTPS origin.</p><pre><code>curl -X POST "$MYTRACKR_API_URL/integrations/events" \\
  -H "Content-Type: application/json" \\
  -H "x-mytrackr-api-key: $MYTRACKR_API_KEY" \\
  -d '{
    "event": "order.paid",
    "externalId": "store-order-1001-paid",
    "orderId": "1001",
    "amount": 25000,
    "currency": "NGN",
    "occurredAt": "REPLACE_WITH_ISO_8601_TIMESTAMP"
  }'</code></pre><p class="hint">Amounts use major currency units (for example, 25000 means NGN 25,000). Use a stable, unique externalId per event; resending that ID returns duplicate: true.</p><h3>Check the connection</h3><pre><code>curl "$MYTRACKR_API_URL/integrations/private/config" \\
  -H "x-mytrackr-api-key: $MYTRACKR_API_KEY"</code></pre><p>${button('/developers/guides', 'Browse platform guides', true)} ${button('/developers/integrations', 'API integration reference', true)} ${button('/swagger', 'API reference', true)}</p></div></section><section class="panel"><div class="panel-header"><h2>Before you go live</h2></div><div class="panel-body"><ol class="steps"><li><h3>Activate a subscription</h3><p>Private APIs need an active plan with website linking.</p></li><li><h3>Protect your secret key</h3><p>Never put it in React bundles, browser storage, source control, or URLs. Use your backend or WordPress server.</p></li><li><h3>Handle errors explicitly</h3><p>401: missing credentials. 403: invalid key or expired access. 429: back off before retrying. Keep the same externalId on event retries.</p></li><li><h3>Send real lifecycle events</h3><p>Supported events: order.paid, order.refunded, order.cancelled, payment.failed. Sending an event can create finance records; there is no isolated sandbox mode.</p></li><li><h3>Verify notifications</h3><p>Use HTTPS, verify signatures with your configured signing secret, and deduplicate delivery IDs before processing.</p></li></ol></div></section></div>`;
}

export function dashboardPage(options: {
  section: string;
  data: DashboardData;
  csrf: string;
  nonce: string;
  email: string;
  canManage: boolean;
  secret?: string;
  webhookSecret?: string;
  secretIntegrationId?: string;
  message?: string;
}) {
  const { section, data, csrf, nonce, email, canManage } = options;
  const titles: Record<string, [string, string]> = {
    overview: [
      'Overview',
      'A clear view of your website integrations and activity.',
    ],
    integrations: [
      'Integrations',
      'Connect your websites and manage their configuration.',
    ],
    keys: ['API keys', 'Secure credentials for your website and server.'],
    settings: [
      'Integration settings',
      'Configure your website’s connection to MyTrackr.',
    ],
    events: ['Events', 'Order and payment events received from your websites.'],
    webhooks: ['Webhooks', 'Track outbound notifications to your website.'],
    billing: [
      'Billing & plans',
      'Manage access to the website integration platform.',
    ],
    docs: ['Get started', 'Everything you need to connect your website.'],
  };
  const [title, subtitle] = titles[section];
  const nav = [
    ['overview', '◫', 'Overview'],
    ['integrations', '⊞', 'Integrations'],
    ['keys', '⚿', 'API keys'],
    ['events', '↗', 'Events'],
    ['webhooks', '⌁', 'Webhooks'],
    ['billing', '▤', 'Billing & plans'],
    ['guides', '⌘', 'Guides'],
  ];
  const pageContents =
    section === 'overview'
      ? overview(data)
      : section === 'integrations'
        ? integrationsPage(data, csrf, canManage)
        : section === 'keys'
          ? keysPage(data, csrf, canManage)
          : section === 'settings'
            ? settingsPage(data, csrf, canManage)
            : section === 'webhooks'
              ? webhookPage(data, csrf, canManage)
              : section === 'billing'
                ? billingPage(data, csrf, canManage)
                : section === 'docs'
                  ? docsPage()
                  : `${picker(data, 'events')}<section class="panel"><div class="panel-header"><div><h2>Received events</h2><p>${data.selected ? e(data.selected.name) : 'All integrations'}</p></div></div>${eventTable(data)}${pages('events', data.recordPage, data.recordCount, data.size, data.selected?.id)}</section>`;
  const contents = `${options.webhookSecret ? `<section class="notice secret" role="status"><h2>Save your webhook signing secret</h2><p>Shown only once. Store this in your webhook receiver to verify MyTrackr signatures.</p><label for="one-time-webhook-secret">Webhook signing secret</label><textarea id="one-time-webhook-secret" readonly spellcheck="false" autocomplete="off">${e(options.webhookSecret)}</textarea><div class="actions"><button type="button" class="secondary" data-copy="one-time-webhook-secret">Copy signing secret</button></div></section>` : ''}${pageContents}`;
  return document(
    title,
    `<header class="mobile-dashboard-header"><a class="brand" href="${base}"><span class="brand-mark"><img src="/developers/assets/mytrackr-logo.png" alt="" width="36" height="36"></span>mytrackr</a><details class="mobile-dashboard-menu" data-mobile-navigation><summary><span class="menu-glyph" aria-hidden="true"></span>Menu</summary><div class="mobile-dashboard-panel"><p class="workspace">Developer workspace</p><nav aria-label="Mobile dashboard">${nav.map(([key, icon, label]) => `<a href="${link(key)}" ${section === key || (section === 'settings' && key === 'integrations') ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</a>`).join('')}</nav><div class="sidebar-bottom"><p>Secure developer access</p><form method="post" action="${base}/logout">${hidden(csrf)}<button type="submit">Sign out</button></form></div></div></details></header><div class="shell"><aside class="sidebar"><a class="brand" href="${base}"><span class="brand-mark"><img src="/developers/assets/mytrackr-logo.png" alt="" width="44" height="44"></span>mytrackr</a><p class="workspace">Developer workspace</p><nav aria-label="Dashboard">${nav.map(([key, icon, label]) => `<a href="${link(key)}" ${section === key || (section === 'settings' && key === 'integrations') ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</a>`).join('')}</nav><div class="sidebar-bottom"><p>Secure developer access</p><form method="post" action="${base}/logout">${hidden(csrf)}<button type="submit">Sign out</button></form></div></aside><div><header class="topbar"><div>${e(data.business?.name || 'Your workspace')} <small> / Developer platform</small></div><div class="account"><span class="avatar">${e(email.slice(0, 1).toUpperCase() || 'M')}</span><span>${e(email)}</span></div></header><main class="content"><div class="page-heading"><div><p class="eyebrow">Developer platform</p><h1>${title}</h1><p class="muted">${subtitle}</p></div>${section !== 'integrations' ? button(link('integrations'), '+ New integration') : ''}</div>${options.message ? `<div class="notice" role="status">${e(options.message)}</div>` : ''}${!data.business ? '<div class="notice warning">Finish setting up your business in the MyTrackr app before creating an integration.</div>' : ''}${!canManage && section !== 'billing' ? `<div class="notice warning">An active plan with website linking is required to create integrations or use private APIs. <a href="${link('billing')}">View plans →</a></div>` : ''}${options.secret ? `<section class="notice secret" role="status"><h2>Save your new secret API key</h2><p>This key is shown only once. Store it securely on your server before leaving this page.</p><label for="one-time-secret">Secret API key</label><textarea id="one-time-secret" readonly spellcheck="false" autocomplete="off">${e(options.secret)}</textarea><div class="actions"><button type="button" class="secondary" data-copy="one-time-secret">Copy secret key</button>${button(link('keys', options.secretIntegrationId), 'I’ve saved my key', true)}</div></section>` : ''}${contents}<p id="copy-status" role="status" aria-live="polite"></p><p class="footer-note">MyTrackr Developers · All activity shown is from your account · Times are displayed in UTC</p></main></div></div>`,
    nonce,
  );
}
