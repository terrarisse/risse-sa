/* ═══════════════════════════════════════════════════════════════
   Risse S.A. — Fonctions communes à toutes les pages (commun.js)
   1. Pas de zoom de la page sur téléphone (pincement, double-tap)
   2. Boîte de confirmation aux couleurs de l'app

   ── 2. Boîte de confirmation ──
   Remplace la fenêtre grise du navigateur (« terrarisse.github.io indique… »)
   par une boîte aux couleurs de l'app. Téléphone et PC.

   Utilisation :  if (!(await rsConfirm('Supprimer cette note ?'))) return;
   Options     :  rsConfirm(msg, { ok:'Supprimer', cancel:'Annuler', danger:true, icon:'🗑' })
   ═══════════════════════════════════════════════════════════════ */
/* ── 1. Bloquer le zoom de la page (téléphone) ──────────────────
   Les zooms propres à l'app (PDF du Carnet, Coteur, devis) restent possibles :
   ils sont gérés par l'app elle-même, pas par le navigateur. */
(function () {
  var st = document.createElement('style');
  st.textContent = 'html,body{touch-action:pan-x pan-y;-webkit-text-size-adjust:100%;text-size-adjust:100%;}';
  (document.head || document.documentElement).appendChild(st);
  // iPhone / iPad (Safari) : ignore user-scalable=no, on bloque ses gestes de zoom
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
})();

(function () {
  'use strict';
  var CSS = '' +
    '.rsc-ov{position:fixed;inset:0;z-index:100000;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:20px;' +
      'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:rscFade .15s ease-out;font-family:Inter,system-ui,sans-serif;}' +
    '.rsc-box{background:#fff;border-radius:20px;width:min(380px,100%);padding:26px 22px 20px;text-align:center;' +
      'box-shadow:0 24px 64px rgba(0,0,0,.35);animation:rscPop .18s cubic-bezier(.2,.9,.3,1.2);}' +
    '.rsc-ic{width:60px;height:60px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:28px;background:#EEF2FF;}' +
    '.rsc-ic.danger{background:#FEECEC;}' +
    '.rsc-title{font-size:17px;font-weight:700;color:#1A2340;line-height:1.3;letter-spacing:-.2px;}' +
    '.rsc-msg{font-size:13.5px;color:#4A5878;line-height:1.5;margin-top:8px;white-space:pre-line;}' +
    '.rsc-btns{display:flex;gap:10px;margin-top:22px;}' +
    '.rsc-btns button{flex:1;border:none;border-radius:12px;padding:14px 10px;font:700 15px Inter,system-ui,sans-serif;cursor:pointer;transition:filter .12s,transform .08s;}' +
    '.rsc-btns button:active{transform:scale(.97);}' +
    '.rsc-btns button:hover{filter:brightness(.95);}' +
    '.rsc-cancel{background:#EAECF4;color:#4A5878;}' +
    '.rsc-ok{background:#1B3A6B;color:#fff;}' +
    '.rsc-ok.danger{background:#E53935;}' +
    '.rsc-btns button:focus-visible{outline:3px solid #F0A500;outline-offset:2px;}' +
    '@keyframes rscFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes rscPop{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:none}}';

  function injectCss() {
    if (document.getElementById('rsc-style')) return;
    var st = document.createElement('style');
    st.id = 'rsc-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  window.rsConfirm = function (message, opts) {
    opts = opts || {};
    injectCss();
    var text = String(message || '');
    var lines = text.split('\n');
    var title = lines.shift();
    var body = lines.join('\n').trim();
    var danger = opts.danger != null ? opts.danger : /supprim|effac|irréversible|réinitialis|toutes les données/i.test(text);
    var okLabel = opts.ok || (/effac/i.test(title) ? 'Effacer' : /supprim/i.test(title) ? 'Supprimer' : 'Valider');
    var icon = opts.icon || (danger ? '🗑️' : '❓');
    if (danger && !body && !opts.noHint) body = 'Cette action est définitive.';

    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var ov = document.createElement('div');
      ov.className = 'rsc-ov';
      ov.innerHTML =
        '<div class="rsc-box" role="alertdialog" aria-modal="true" aria-labelledby="rsc-t">' +
          '<div class="rsc-ic' + (danger ? ' danger' : '') + '">' + icon + '</div>' +
          '<div class="rsc-title" id="rsc-t">' + esc(title) + '</div>' +
          (body ? '<div class="rsc-msg">' + esc(body) + '</div>' : '') +
          '<div class="rsc-btns">' +
            '<button type="button" class="rsc-cancel">' + esc(opts.cancel || 'Annuler') + '</button>' +
            '<button type="button" class="rsc-ok' + (danger ? ' danger' : '') + '">' + esc(okLabel) + '</button>' +
          '</div>' +
        '</div>';

      function done(v) {
        window.removeEventListener('keydown', onKey, true);
        ov.remove();
        try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) {}
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); done(true); }
        else if (e.key === 'Tab') {
          // garder le focus dans la boîte
          e.preventDefault();
          (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
        }
      }
      var okBtn = ov.querySelector('.rsc-ok'), cancelBtn = ov.querySelector('.rsc-cancel');
      okBtn.onclick = function (e) { e.stopPropagation(); done(true); };
      cancelBtn.onclick = function (e) { e.stopPropagation(); done(false); };
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
      window.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      okBtn.focus({ preventScroll: true });
    });
  };
})();
