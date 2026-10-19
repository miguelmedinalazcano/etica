// Complemento de PowerPoint «Ética · resultados en directo».
// Cada diapositiva guarda qué vista muestra (ajuste «vista»). En la presentación solo se ve el gráfico en vivo;
// en modo edición aparece «Cambiar vista» para elegir otra.
(function () {
  var VIEWS = [
    ['encuesta', 'Encuesta: contador'], ['canales', 'Así os informáis'], ['casos', 'Casos A–D'], ['experimento', 'Experimento'],
    ['anunciantes', 'Anunciantes'], ['d5', 'Debate 5'], ['d_final', 'Debate final'], ['auto', 'Automático (sigue la consola)'], ['qr', 'QR para entrar']
  ];
  var qs = new URLSearchParams(location.search);
  var resolveView, settled = false, current = null, inOffice = false;
  var view = new Promise(function (r) { resolveView = r; });
  function settle(v) { if (settled) return; settled = true; current = v || qs.get('vista') || 'auto'; resolveView(current); }
  window.__ADDIN__ = { view: view };
  setTimeout(function () { settle(null); }, 3000); // fuera de PowerPoint no hay Office: se usa ?vista=

  function save(v) {
    current = v;
    try { Office.context.document.settings.set('vista', v); Office.context.document.settings.saveAsync(); } catch (e) {}
    if (window.__pantalla) window.__pantalla.setView(v);
  }
  function openPicker() {
    var old = document.querySelector('.pick'); if (old) old.remove();
    var box = document.createElement('div'); box.className = 'pick';
    var html = '<b>¿Qué muestra esta diapositiva?</b><div class="opts">';
    VIEWS.forEach(function (v) { html += '<button type="button" data-v="' + v[0] + '"' + (v[0] === current ? ' class="cur"' : '') + '>' + v[1] + '</button>'; });
    box.innerHTML = html + '</div>';
    box.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; save(b.dataset.v); box.remove(); });
    document.body.appendChild(box);
  }
  function refreshMode() {
    if (!inOffice) return;
    Office.context.document.getActiveViewAsync(function (r) {
      var edit = r.status === 'succeeded' && r.value === 'edit';
      var gear = document.getElementById('gear'); if (gear) gear.hidden = !edit;
      if (!edit) { var p = document.querySelector('.pick'); if (p) p.remove(); }
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var gear = document.getElementById('gear');
    if (gear) gear.addEventListener('click', openPicker);
  });
  if (window.Office && Office.onReady) {
    Office.onReady(function (info) {
      inOffice = !!(info && info.host);
      var saved = null;
      try { saved = inOffice ? Office.context.document.settings.get('vista') : null; } catch (e) {}
      settle(saved);
      if (!inOffice) return;
      refreshMode();
      try { Office.context.document.addHandlerAsync(Office.EventType.ActiveViewChanged, refreshMode); } catch (e) {}
      if (!saved) Office.context.document.getActiveViewAsync(function (r) { if (r.status === 'succeeded' && r.value === 'edit') openPicker(); });
    });
  }
})();
