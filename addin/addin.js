// Complemento de PowerPoint «Ética · resultados en directo».
// Cada diapositiva guarda qué vista muestra (ajuste «vista»). En la presentación solo se ve el gráfico en vivo;
// en modo edición aparece «Cambiar vista» para elegir otra.
// El gráfico (/pantalla/?embed) se carga en un marco de ancho fijo (DESIGN_W) y se escala con transform para
// encajar en el recuadro. Así en modo presentación, donde PowerPoint dibuja el complemento en una ventana más
// pequeña, ninguna letra queda por debajo del tamaño mínimo del navegador (que la agrandaba y lo descolocaba todo).
(function () {
  var VIEWS = [
    ['encuesta', 'Encuesta: contador'], ['canales', 'Así os informáis'], ['casos', 'Casos A–D'], ['experimento', 'Experimento'],
    ['anunciantes', 'Anunciantes'], ['d5', 'Debate 5'], ['d_final', 'Debate final'], ['auto', 'Automático (sigue la consola)'], ['qr', 'QR para entrar']
  ];
  var DESIGN_W = 1600;
  var qs = new URLSearchParams(location.search);
  var resolveView, settled = false, current = null, inOffice = false;
  var view = new Promise(function (r) { resolveView = r; });
  function settle(v) { if (settled) return; settled = true; current = v || qs.get('vista') || 'auto'; resolveView(current); show(current); }

  function frame() { return document.getElementById('view'); }
  // Ancho fijo y alto según la forma del recuadro; si el contenido crece (letra más grande de lo previsto), se encoge todo.
  function layout() {
    var f = frame(); if (!f || !innerWidth || !innerHeight) return;
    var s = innerWidth / DESIGN_W, h = Math.round(innerHeight / s);
    var need = h;
    try { var d = f.contentDocument; if (d && d.documentElement) need = Math.max(h, d.documentElement.scrollHeight); } catch (e) {}
    var k = Math.min(s, innerHeight / need);
    f.style.width = DESIGN_W + 'px'; f.style.height = need + 'px';
    f.style.transform = 'scale(' + k + ')';
    f.style.left = Math.round((innerWidth - DESIGN_W * k) / 2) + 'px';
  }
  function show(v) {
    var f = frame(); if (!f) return;
    var extra = ['local', 'demo'].filter(function (p) { return qs.has(p); }).map(function (p) { return '&' + p; }).join('');
    f.src = '../pantalla/?embed&vista=' + encodeURIComponent(v) + extra;
    layout();
  }
  addEventListener('resize', layout);
  document.addEventListener('DOMContentLoaded', function () { var f = frame(); if (f) f.addEventListener('load', layout); if (settled) show(current); layout(); });
  setInterval(layout, 1500); // por si el contenido cambia de alto con los votos
  setTimeout(function () { settle(null); }, 3000); // fuera de PowerPoint no hay Office: se usa ?vista=

  function save(v) {
    current = v;
    try { Office.context.document.settings.set('vista', v); Office.context.document.settings.saveAsync(); } catch (e) {}
    show(v);
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
