// Captura telas reais do AsturCut (1600x900 @2x) e as posições dos elementos para destaque no vídeo
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/shots';
const DEMO = __dirname + '/../demo';
fs.mkdirSync(OUT, { recursive: true });
const meta = {};

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('asturcut.lang', 'pt');
    localStorage.setItem('asturcut.settings.v1', JSON.stringify({ recent: [] }));
  });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(1200);
  const wait = (ms) => p.waitForTimeout(ms);

  async function shot(name, sels = {}) {
    await wait(350);
    const boxes = {};
    for (const [k, sel] of Object.entries(sels)) {
      const loc = p.locator(sel).first();
      try { const bb = await loc.boundingBox({ timeout: 1500 }); if (bb) boxes[k] = [bb.x, bb.y, bb.width, bb.height]; } catch {}
    }
    await p.screenshot({ path: `${OUT}/${name}.png` });
    meta[name] = { file: `${name}.png`, w: 1600, h: 900, boxes };
    console.log('shot', name, Object.keys(boxes).join(','));
  }

  // ---------- Tela inicial ----------
  await shot('home', { hero: '.hero', chips: '.hero-chips', quick: '.quick-row', recent: '.proj-empty', side: '.home-side', lang: '.hs-lang-wrap', nav: '.hs-nav', personalize: '.hs-bottom .hs-item' });
  await p.click('.hs-item:nth-child(3)');
  await wait(800);
  await shot('templates', { grid: '.tpl-grid', first: '.tpl:nth-child(1)', slideshow: '.tpl:nth-child(2)', reels: '.tpl:nth-child(3)' });

  // ---------- Editor vazio ----------
  await p.click('.hs-item:nth-child(1)');
  await wait(300);
  await p.click('.hero-main');
  await wait(600);
  await p.fill('.np-name', 'Meu primeiro vídeo');
  await p.click('.np-more summary');
  await wait(300);
  await shot('newproject', { modal: '.np-modal', name: '.np-name', formats: '.np-formats', res: '.np-chips', fps: '.np-two', preview: '.np-right', more: '.np-more', create: '.modal-foot .btn.primary' });
  await p.click('.modal-foot .btn.primary');
  await wait(600);
  await shot('editor-empty', { library: '#panel-library', player: '#panel-player', inspector: '#panel-inspector', timeline: '#panel-timeline', titlebar: '#titlebar', export: '.tb-btn.export', tabs: '.lib-tabs', import: '.import-zone' });

  // ---------- Importar ----------
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.import-btn')]);
  await fc.setFiles([`${DEMO}/Gradiente neon.webm`, `${DEMO}/Fractal zoom.webm`, `${DEMO}/Celulas vivas.webm`, `${DEMO}/Narracao teste.mp3`]);
  await wait(4000);
  await p.evaluate(() => { const st = window.__store; st.p.bins = [{ id: 'bin_broll', name: 'B-roll' }, { id: 'bin_audio', name: 'Áudio' }]; window.__app.openTab('media'); });
  await wait(400);
  await shot('media', { grid: '#panel-library .grid', bins: '.bin-tile', bar: '.media-bar', sort: '.media-bar-row select', views: '.media-bar-row', tile: '.grid .tile:not(.bin-tile)' });

  // visualizador de origem
  await p.hover('.grid .tile:not(.bin-tile) >> nth=1');
  await p.click('.grid .tile:not(.bin-tile) >> nth=1 >> .tile-src');
  await wait(1200);
  await p.evaluate(() => { const v = document.querySelector('.src-media'); v.currentTime = 1.5; });
  await wait(300); await p.keyboard.press('i');
  await p.evaluate(() => { const v = document.querySelector('.src-media'); v.currentTime = 5; });
  await wait(500); await p.keyboard.press('o');
  await wait(300);
  await shot('source', { stage: '.src-stage', bar: '.src-bar', marks: '.src-ctrls', drags: '.src-drag', insert: '.src-actions .btn.primary', modal: '.src-modal' });
  await p.keyboard.press('Escape');

  // ---------- Montagem na linha do tempo ----------
  await p.evaluate(() => {
    const st = window.__store;
    const m = st.p.media;
    // adiciona os três vídeos na trilha principal + música
    const add = window.__test_add;
  });
  for (const i of [0, 1, 2]) { await p.$$eval('.grid .tile:not(.bin-tile) .tile-add', (n, i) => n[i].click(), i); await wait(250); }
  await p.$$eval('.grid .tile:not(.bin-tile) .tile-add', (n) => n[3].click());
  await wait(500);
  await p.evaluate(() => {
    const st = window.__store;
    st.p.media.forEach((m, i) => { if (i < 3) m.binId = 'bin_broll'; else m.binId = 'bin_audio'; });
    const v = st.p.clips.filter((c) => c.type === 'video');
    st.select(v[0].id); st.p.clips.find((c) => c.id === v[0].id).label = '#8b5cf6';
    v[1].label = '#14b8a6'; v[2].label = '#f59e0b';
    v[1].transitionIn = { id: 'fade', dur: 0.8 };
    v[2].transitionIn = { id: 'whip', dur: 0.8 };
    st.setTime(2.2);
    st.commit('demo');
    window.__app.openTab('media');
  });
  await wait(800);
  await p.click('#tl-zoom');
  await p.evaluate(() => { document.querySelector('#panel-timeline .icon-btn[title*="Ajustar"]').click(); });
  await wait(600);
  await shot('timeline', { timeline: '#panel-timeline', toolbar: '.tl-toolbar', split: '.tl-toolbar .icon-btn[title*="Dividir"]', ripple: '.tl-toolbar .icon-btn[title*="ripple"]', forward: '#tl-mode-forward', blade: '#tl-mode-blade', clips: '.tl-track.main', junction: '.tl-junction.has', audio: '.tl-track.audio', magnet: '#tl-magnet', zoom: '#tl-zoom', mixerBtn: '.tl-toolbar .icon-btn[title*="ixer"]', heads: '.tl-track.main .tl-track-head', ruler: '.tl-ruler-lane' });

  // clique direito em clipe (menu com rótulo)
  const clipBox = await p.locator('.tl-track.main .tl-clip').nth(1).boundingBox();
  await p.mouse.click(clipBox.x + 40, clipBox.y + 20, { button: 'right' });
  await wait(300);
  await p.hover('.ctx-item:has-text("Rótulo")');
  await wait(400);
  await shot('clipmenu', { menu: '.ctx-menu', label: '.ctx-item:has-text("Rótulo")', sub: '.ctx-menu.sub', ripple: '.ctx-item:has-text("ripple")', speed: '.ctx-item:has-text("Velocidade e duração")' });
  await p.keyboard.press('Escape'); await p.mouse.click(800, 880);

  // ---------- Texto ----------
  await p.evaluate(() => { window.__store.setTime(0.6); window.__app.openTab('text'); });
  await wait(300);
  await shot('text-lib', { grid: '#panel-library .grid', add: '.lib-content .btn.primary', nav: '.lib-nav' });
  await p.dblclick('#panel-library .grid .tile:nth-child(8)');
  await wait(400);
  await p.evaluate(() => { const st = window.__store; const c = st.primarySelected(); st.updateClip(c.id, { text: { content: 'MEU PRIMEIRO VÍDEO' }, animIn: { id: 'pop', dur: 0.6 } }); st.setTime(1.6); });
  await wait(600);
  await shot('text-edit', { box: '.sel-box', inspector: '#panel-inspector', textarea: '.insp-body textarea', font: '.font-select', player: '#panel-player', textclip: '.tl-clip.text' });

  // ---------- Keyframes ----------
  await p.evaluate(() => { const st = window.__store; const c = st.p.clips.filter((x) => x.type === 'video')[0]; st.select(c.id); st.setTime(0.2); });
  await wait(300);
  await p.click('.insp-tab:has-text("Vídeo")');
  await p.evaluate(() => {
    const st = window.__store; const c = st.primarySelected();
    c.kf = { scale: [{ t: 0, v: 1, e: 'ease' }, { t: 3, v: 1.35, e: 'linear' }] };
    st.commit('kf'); st.setTime(c.start + 3);
  });
  await wait(700);
  await shot('keyframes', { transform: '.prop-section:has-text("Transformar")', watch: '.prop-row.animated .kf-ctrl', kfsec: '.prop-section:has-text("Keyframes")', diamonds: '.tl-clip.selected', ease: '.prop-section:has-text("Keyframes") select' });

  // ---------- Efeitos, transições, filtros, animações, stickers ----------
  await p.evaluate(() => window.__app.openTab('effects'));
  await wait(500);
  await p.hover('#panel-library .grid .tile:nth-child(17) canvas');
  await wait(900);
  await shot('effects', { grid: '#panel-library .grid', nav: '.lib-nav', tile: '#panel-library .grid .tile:nth-child(17)', search: '.lib-search' });
  await p.evaluate(() => { window.__app.openTab('transitions'); });
  await wait(500);
  await p.hover('#panel-library .grid .tile:nth-child(16) canvas');
  await wait(900);
  await shot('transitions', { grid: '#panel-library .grid', tile: '#panel-library .grid .tile:nth-child(16)', junction: '.tl-junction.has' });
  await p.evaluate(() => { const st = window.__store; const c = st.p.clips.filter((x) => x.type === 'video')[1]; st.select(c.id); st.setTime(c.start + 1.5); window.__app.openTab('filters'); });
  await wait(600);
  await shot('filters', { grid: '#panel-library .grid', active: '#panel-library .grid .tile:nth-child(3)' });
  await p.click('#panel-library .grid .tile:nth-child(3)');
  await wait(600);
  await shot('filters-applied', { player: '#panel-player', grid: '#panel-library .grid' });
  await p.evaluate(() => window.__app.openTab('anims'));
  await wait(500);
  await shot('anims', { grid: '#panel-library .grid', nav: '.lib-nav' });
  await p.evaluate(() => window.__app.openTab('stickers'));
  await wait(400);
  await shot('stickers', { grid: '.emoji-grid', nav: '.lib-nav' });
  await p.evaluate(() => window.__app.openTab('fonts'));
  await wait(700);
  await shot('fonts', { list: '.font-list', import: '.lib-content .row .btn', nav: '.lib-nav' });

  // ---------- Áudio ----------
  await p.evaluate(() => window.__app.openTab('audio'));
  await wait(500);
  await shot('audio-lib', { list: '.audio-list', nav: '.lib-nav', play: '.aud-play' });
  await p.evaluate(() => { const st = window.__store; const a = st.p.clips.find((c) => c.type === 'audio'); st.select(a.id); });
  await wait(200);
  await p.keyboard.press('g');
  await wait(400);
  await shot('gain', { modal: '.modal', presets: '.dlg-presets' });
  await p.click('.dlg-presets .chip:nth-child(2)'); await p.click('.modal-foot .btn.primary');
  await wait(300);
  await p.click('.tl-toolbar .icon-btn[title*="ixer"]');
  await wait(400);
  await p.evaluate(() => { const s = document.querySelector('.mix-fx select'); s.value = 'voice'; s.dispatchEvent(new Event('change')); });
  await wait(600);
  await shot('mixer', { strips: '.mix-strips', fx: '.mix-fx', eq: '.fx-block:nth-of-type(1)', curve: '.eq-curve', preset: '.mix-fx select', comp: '.fx-block:has-text("Compressor")', denoise: '.fx-block:has-text("Redução de ruído")', fader: '.mix-strip.active .mix-body' });
  await p.keyboard.press('Escape');

  // ---------- Cor ----------
  await p.evaluate(() => { const st = window.__store; const c = st.p.clips.filter((x) => x.type === 'video')[0]; c.adjust.shadows = 30; c.adjust.highlights = -25; c.adjust.saturation = 20; st.select(c.id); st.setTime(c.start + 2); st.commit('cor'); });
  await wait(300);
  await p.click('.insp-tab:has-text("Ajuste")');
  await wait(600);
  await shot('color', { tools: '.color-tools', wb: '.color-tools .btn:nth-child(1)', compare: '.color-tools .btn:nth-child(2)', tones: '.prop-section:has-text("Tons")', light: '.prop-section:has-text("Luz")' });

  // velocidade
  await p.keyboard.press('Control+r');
  await wait(400);
  await shot('speed', { modal: '.modal', dlg: '.dlg' });
  await p.keyboard.press('Escape');

  // ---------- Personalização ----------
  await p.keyboard.press('Control+,');
  await wait(500);
  await shot('custom-theme', { themes: '.theme-grid', colors: '.cust-pane h3:nth-of-type(2)', lang: '.cust-pane select.no-tr', nav: '.cust-nav' });
  await p.click('.cust-tab:nth-child(2)');
  await wait(400);
  await shot('custom-layout', { layouts: '.layout-grid', tip: '.cust-tip' });
  await p.click('.cust-tab:nth-child(4)');
  await wait(400);
  await shot('custom-keys', { keys: '.keys', reset: '.keys-head .btn' });
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__app.settings.useTheme('roxo'));
  await wait(500);
  await shot('theme-purple', { player: '#panel-player', titlebar: '#titlebar' });
  await p.evaluate(() => window.__app.settings.useTheme('claro'));
  await wait(500);
  await shot('theme-light', {});
  await p.evaluate(() => window.__app.settings.useTheme('astur'));
  await wait(300);
  // maximizar timeline
  await p.hover('#panel-timeline'); await p.keyboard.press('`');
  await wait(500);
  await shot('maximize', { timeline: '#panel-timeline' });
  await p.keyboard.press('`');
  await wait(300);

  // ---------- Exportar ----------
  await p.evaluate(() => { const st = window.__store; st.clearSelection(); st.setTime(2); });
  await p.keyboard.press('Control+e');
  await wait(700);
  await shot('export', { modal: '.modal', preview: '.exp-preview', fields: '.exp-right', button: '.modal-foot .btn.primary', note: '.exp-note' });
  await p.keyboard.press('Escape');

  // tela inicial com projeto (continuar editando)
  await p.evaluate(() => window.__app.showHome());
  await wait(500);
  await shot('home-continue', { cont: '.hs-continue', hero: '.hero' });

  // trilha sonora gerada pelo próprio AsturCut
  const wav = await p.evaluate(async () => {
    const mod = await import('./js/lib/sfx.js');
    const out = {};
    for (const id of ['lofi', 'upbeat', 'whoosh', 'pop', 'ding']) {
      const r = await mod.renderSfx(id);
      const buf = new Uint8Array(await r.blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      out[id] = btoa(s);
    }
    return out;
  });
  fs.mkdirSync(__dirname + '/audio', { recursive: true });
  for (const [k, v] of Object.entries(wav)) fs.writeFileSync(`${__dirname}/audio/${k}.wav`, Buffer.from(v, 'base64'));

  fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
  console.log('errors:', errs);
  await b.close();
})();
