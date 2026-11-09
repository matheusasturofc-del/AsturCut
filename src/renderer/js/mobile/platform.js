// Ponte do AsturCut com o Android (Capacitor). Script clássico: roda antes dos módulos do editor
// e cria window.astur com a mesma "cara" da versão de PC, usando o plugin nativo AsturNative.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var N = C.Plugins.AsturNative;
  if (!N) return;
  var REPO = 'matheusasturofc-del/AsturCut';

  // bibliotecas de IA: baixadas só quando o recurso é usado (APK leve)
  window.ASTUR_VENDOR = {
    transformers: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
    mediapipe: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/',
  };
  document.documentElement.classList.add('is-mobile-app');

  function toB64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // grava um arquivo grande na galeria em pedaços
  async function saveBytes(name, mime, bytes, onProgress) {
    var r = await N.startSave({ name: name, mime: mime });
    var CH = 768 * 1024;
    try {
      for (var o = 0; o < bytes.length; o += CH) {
        await N.writeChunk({ id: r.id, data: toB64(bytes.subarray(o, o + CH)) });
        if (onProgress) onProgress(Math.min(1, (o + CH) / bytes.length));
      }
      var f = await N.finishSave({ id: r.id });
      return f.uri;
    } catch (e) {
      try { await N.cancelSave({ id: r.id }); } catch (e2) {}
      throw e;
    }
  }

  // aviso enquanto o Android copia os arquivos escolhidos para dentro do app
  var busy = null;
  var BUSY_TEXT = { pt: 'Copiando os arquivos para o AsturCut...', en: 'Copying files into AsturCut...', es: 'Copiando los archivos a AsturCut...' };
  function showBusy() {
    if (busy) return;
    var lang = (localStorage.getItem('asturcut.lang') || 'pt');
    busy = document.createElement('div');
    busy.className = 'm-busy';
    busy.innerHTML = '<div class="m-busy-box"><i></i><span></span></div>';
    busy.querySelector('span').textContent = BUSY_TEXT[lang] || BUSY_TEXT.pt;
    document.body.appendChild(busy);
  }
  function hideBusy() { if (busy) { busy.remove(); busy = null; } }
  try { N.addListener('importStart', showBusy); } catch (e) {}
  async function pick(kind) {
    try { return (await N.pickMedia({ kind: kind })).files || []; } finally { hideBusy(); }
  }

  var info = null;
  var rtExport = null; // exportação em tempo real (plano B)

  window.astur = {
    isDesktop: true,
    isMobile: true,
    setZoom: function () {},
    minimize: function () {}, maximize: function () {}, close: function () {}, forceClose: function () {}, toggleFullscreen: function () {},
    info: async function () {
      if (!info) info = await N.info().catch(function () { return {}; });
      return Object.assign({ platform: 'android', installerLang: null }, info);
    },
    setLang: function () {},
    bootStep: function () {},
    ready: function () {},
    checkUpdate: async function () {
      var cur = (await window.astur.info()).version || '0';
      var r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return { ok: false, status: r.status, current: cur };
      var j = await r.json();
      var apk = (j.assets || []).find(function (a) { return /\.apk$/i.test(a.name); });
      return {
        ok: true, current: cur, version: String(j.tag_name || '').replace(/^v/i, ''), name: j.name || j.tag_name,
        notes: j.body || '', date: j.published_at, page: j.html_url, download: apk ? apk.browser_download_url : j.html_url,
      };
    },
    importMedia: function () { return pick('media'); },
    importFonts: function () { return pick('font'); },
    describeFiles: async function (paths) {
      return (paths || []).map(function (p) { var n = String(p).split('/').pop(); var nm = n.replace(/^\d+_\d+_/, ''); return { path: p, name: nm, size: 0, ext: (nm.split('.').pop() || '').toLowerCase() }; });
    },
    // grava um arquivo (ex.: narração) dentro do app e devolve o caminho
    saveMedia: async function (name, bytes) {
      var r = await N.startSave({ name: name, mime: 'application/octet-stream', target: 'app' });
      var CH = 768 * 1024;
      for (var o = 0; o < bytes.length; o += CH) await N.writeChunk({ id: r.id, data: toB64(bytes.subarray(o, o + CH)) });
      return (await N.finishSave({ id: r.id })).uri;
    },
    pathForFile: function () { return ''; },
    mediaUrl: function (p) { return location.origin + '/_astur_media/?p=' + encodeURIComponent(p); },
    saveProject: async function (o) {
      var r = await N.saveProject({ path: o.saveAs ? null : (o.filePath || null), name: (o.data && o.data.name) || 'Projeto', data: JSON.stringify(o.data) });
      return r.path;
    },
    openProject: async function (filePath) {
      if (!filePath) return null;
      var r = await N.readText({ path: filePath });
      return { filePath: filePath, data: JSON.parse(r.text) };
    },
    showItem: function (p) { return N.share({ path: p }); },
    openFile: function (p) { return N.open({ path: p }); },
    openExternal: function (url) { return N.openUrl({ url: url }); },
    saveBytes: saveBytes,
    // plano B (MediaRecorder em tempo real): salva o WebM direto na galeria
    exportChoose: async function (o) { return (o.name || 'video') + '.' + (o.format === 'webm' ? 'webm' : 'mp4'); },
    exportBegin: async function () { rtExport = []; return true; },
    exportChunk: async function (buf) { if (rtExport) rtExport.push(new Uint8Array(buf)); return true; },
    exportEnd: async function (o) {
      var parts = rtExport || []; rtExport = null;
      if (o.cancel) return null;
      var len = parts.reduce(function (s, p) { return s + p.length; }, 0);
      var all = new Uint8Array(len), off = 0;
      parts.forEach(function (p) { all.set(p, off); off += p.length; });
      var name = String(o.outPath || 'video.webm').replace(/\.mp4$/i, '.webm');
      return saveBytes(name, 'video/webm', all);
    },
    on: function () { return function () {}; },
  };

  // botão "voltar" do Android: fecha janelas/painéis antes de sair
  window.asturBack = function () {
    var ov = document.querySelectorAll('.modal-overlay');
    if (ov.length) { var last = ov[ov.length - 1]; var x = last.querySelector('.modal-head .icon-btn'); if (x && !last.querySelector('.no-close')) x.click(); return true; }
    var menu = document.querySelector('.ctx-menu, .dropdown, .context-menu');
    if (menu) { menu.remove(); return true; }
    if (window.__asturMobileBack && window.__asturMobileBack()) return true;
    return false;
  };
})();
