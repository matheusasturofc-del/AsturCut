// Exportação de vídeo (gravação em tempo real do compositor + conversão com FFmpeg no desktop)
import { store } from './store.js';
import { t } from './i18n.js';
import { el, icon, modal, toast, fmtTime, fmtBytes, promptDialog } from './util.js';
import { fastSupported, fastExport, clearDecoded } from './fastExport.js';
import { renderFrame } from './compositor.js';
import { player, pause, syncMedia, draw } from './player.js';
import { allPlayers, exportAudioStream, audioCtx, isDesktop, api } from './media.js';
import { settings } from './settings.js';

const RES = [[480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '2K'], [2160, '4K']];

// predefinições de exportação
const PRESETS = [
  { id: 'yt1080', name: 'YouTube 1080p', res: 1080, format: 'mp4', quality: 'high' },
  { id: 'yt4k', name: 'YouTube 4K', res: 2160, format: 'mp4', quality: 'high' },
  { id: 'vertical', name: 'Reels / TikTok / Shorts', res: 1080, fps: 30, format: 'mp4', quality: 'high', aspect: '9:16' },
  { id: 'insta', name: 'Instagram feed', res: 1080, fps: 30, format: 'mp4', quality: 'medium' },
  { id: 'whats', name: 'WhatsApp (leve)', res: 720, fps: 30, format: 'mp4', quality: 'low' },
  { id: 'gif', name: 'GIF', res: 480, fps: 24, format: 'gif', quality: 'medium' },
  { id: 'mp3', name: 'Somente áudio', format: 'mp3' },
];

export function openExportDialog() {
  const dur = store.duration();
  if (dur <= 0) { toast('A linha do tempo está vazia — adicione clipes antes de exportar.', 'error'); return; }
  pause();
  const st = store.p.settings;
  const fast = fastSupported();
  const last = settings.get('exportLast') || {};
  const opts = {
    name: store.p.name || 'video',
    res: Math.min(st.width, st.height) >= 1080 ? 1080 : Math.min(st.width, st.height),
    fps: st.fps,
    format: isDesktop ? 'mp4' : 'webm',
    quality: 'high',
    range: 'all',
    mode: fast ? (last.mode || 'fast') : 'realtime',
  };
  const rg = store.p.range;
  const hasRange = rg && (rg.in != null || rg.out != null);
  const rIn = hasRange ? (rg.in ?? 0) : 0, rOut = hasRange ? Math.min(rg.out ?? dur, dur) : dur;
  if (hasRange) opts.range = 'io';
  const expDur = () => (opts.range === 'io' ? Math.max(0.1, rOut - rIn) : dur);
  const est = el('div', { class: 'muted small' });
  const warn = el('div', { class: 'exp-warn small', style: { display: 'none' } });
  const sizeFor = () => {
    const k = Math.min(st.width, st.height);
    const W = Math.round(st.width * opts.res / k / 2) * 2, H = Math.round(st.height * opts.res / k / 2) * 2;
    return { W, H };
  };
  const note = el('span', {});
  let activePreset = null;
  const updateEst = () => {
    const { W, H } = sizeFor();
    const mbps = bitrate(W, H, opts.quality) / 1e6;
    est.textContent = opts.format === 'mp3'
      ? t('Somente áudio · duração {d}', { d: fmtTime(expDur(), opts.fps) })
      : t('{w}×{h} · {fps} fps · duração {d} · tamanho estimado ~{size}', { w: W, h: H, fps: opts.fps, d: fmtTime(expDur(), opts.fps), size: fmtBytes(mbps * 1e6 / 8 * expDur() * (opts.format === 'mp4' ? 0.7 : 1)) });
    note.textContent = t(opts.mode === 'fast'
      ? 'Modo rápido: o áudio é mixado na hora e o vídeo é codificado direto pela placa de vídeo quando possível.'
      : 'A exportação é feita em tempo real: deixe o AsturCut aberto até terminar.');
    for (const b of presetRow.children) b.classList.toggle('on', b.dataset.id === activePreset);
  };
  const field = (label, ctrl) => el('div', { class: 'exp-field' }, el('label', {}, label), ctrl);
  const selects = {};
  const sel = (key, list) => {
    const s = el('select', { class: 'select' }, list.map(([v, n]) => el('option', { value: v, selected: String(opts[key]) === String(v) }, n)));
    s.addEventListener('change', () => { opts[key] = isNaN(+s.value) ? s.value : +s.value; activePreset = null; if (key === 'mode') saveLast(); updateEst(); });
    selects[key] = s;
    return s;
  };
  const saveLast = () => settings.set('exportLast', { ...(settings.get('exportLast') || {}), mode: opts.mode });
  const name = el('input', { class: 'input', value: opts.name });
  name.addEventListener('input', () => (opts.name = name.value));
  const formats = isDesktop
    ? [['mp4', 'MP4 (H.264) — recomendado'], ['webm', 'WebM (VP9)'], ['mov', 'MOV (H.264)'], ['gif', 'GIF animado'], ['mp3', 'Somente áudio (MP3)']]
    : [['webm', 'WebM (VP9)']];
  const applyPreset = (pr) => {
    for (const k of ['res', 'fps', 'format', 'quality']) {
      if (pr[k] == null) continue;
      if (k === 'format' && !formats.some(([v]) => v === pr[k])) continue;
      opts[k] = pr[k];
      if (selects[k]) selects[k].value = String(pr[k]);
    }
    activePreset = pr.id;
    const aspect = st.width / st.height;
    if (pr.aspect === '9:16' && aspect > 0.7) { warn.textContent = t('Dica: este projeto é horizontal. Para Reels/TikTok/Shorts, crie o projeto no formato 9:16.'); warn.style.display = ''; }
    else warn.style.display = 'none';
    updateEst();
  };
  const custom = () => settings.get('exportPresets') || [];
  const presetRow = el('div', { class: 'chips exp-presets' });
  const fillPresets = () => {
    presetRow.innerHTML = '';
    const list = isDesktop ? PRESETS : PRESETS.filter((p) => p.format === 'mp4').map((p) => ({ ...p, format: 'webm' }));
    for (const pr of list) presetRow.append(el('button', { class: 'chip', 'data-id': pr.id, onclick: () => applyPreset(pr) }, pr.name));
    for (const pr of custom()) {
      const b = el('button', { class: 'chip no-tr', 'data-id': pr.id, title: t('Clique com o botão direito para apagar'), onclick: () => applyPreset(pr) }, pr.name);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); settings.set('exportPresets', custom().filter((x) => x.id !== pr.id)); fillPresets(); });
      presetRow.append(b);
    }
    presetRow.append(el('button', { class: 'chip-btn', onclick: async () => {
      const n = await promptDialog(t('Nome da predefinição'), t('Minha predefinição'));
      if (!n) return;
      const pr = { id: 'c' + Date.now(), name: n, res: opts.res, fps: opts.fps, format: opts.format, quality: opts.quality };
      settings.set('exportPresets', [...custom(), pr]);
      activePreset = pr.id;
      fillPresets(); updateEst();
    } }, '+ ' + t('Salvar atual')));
  };
  fillPresets();
  const preview = el('canvas', { class: 'exp-preview', width: 320, height: Math.round(320 * st.height / st.width) });
  try { renderFrame(preview.getContext('2d'), Math.min(store.time, dur - 0.01)); } catch {}
  const body = el('div', { class: 'exp-grid' },
    el('div', { class: 'exp-left' }, preview, el('div', { class: 'muted small center' }, 'Capa / prévia')),
    el('div', { class: 'exp-right' },
      el('div', { class: 'exp-sub' }, 'Predefinições'),
      presetRow,
      field('Nome', name),
      field('Resolução', sel('res', RES)),
      field('Taxa de quadros', sel('fps', [[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']])),
      field('Formato', sel('format', formats)),
      hasRange ? field('Intervalo', sel('range', [['all', 'Linha do tempo inteira'], ['io', `${t('Entrada → Saída')} (${fmtTime(rIn, opts.fps)} – ${fmtTime(rOut, opts.fps)})`]])) : null,
      field('Qualidade', sel('quality', [['low', 'Baixa (arquivo menor)'], ['medium', 'Recomendada'], ['high', 'Alta'], ['max', 'Máxima']])),
      fast ? field('Modo', sel('mode', [['fast', 'Rápido (recomendado)'], ['realtime', 'Tempo real (compatível)']])) : null,
      est,
      warn,
      el('div', { class: 'exp-note' }, el('span', { html: icon('info', 14) }), note),
    ));
  updateEst();
  modal({
    title: 'Exportar', width: 760, body,
    actions: [
      { label: 'Cancelar' },
      { label: 'Exportar', primary: true, onClick: () => { const { W, H } = sizeFor(); startExport({ ...opts, W, H, start: opts.range === 'io' ? rIn : 0, duration: expDur() }); } },
    ],
  });
}

function bitrate(W, H, q) {
  const base = { low: 4e6, medium: 8e6, high: 14e6, max: 28e6 }[q] || 10e6;
  return Math.round(base * (W * H) / (1920 * 1080));
}

async function startExport(o) {
  let outPath = null;
  if (isDesktop) {
    outPath = await api.exportChoose({ name: o.name, format: o.format });
    if (!outPath) return;
  }
  audioCtx();
  const canvas = document.createElement('canvas');
  canvas.width = o.W; canvas.height = o.H;
  const ctx = canvas.getContext('2d', { alpha: false });

  // UI de progresso
  const prevC = el('canvas', { class: 'exp-preview', width: 320, height: Math.round(320 * o.H / o.W) });
  const bar = el('div', { class: 'progress-fill' });
  const label = el('div', { class: 'muted small' }, 'Preparando...');
  let cancelled = false;
  const m = modal({
    title: 'Exportando...', width: 460, className: 'no-close',
    body: el('div', { class: 'exp-progress' }, prevC, el('div', { class: 'progress' }, bar), label),
    actions: [{ label: 'Cancelar', danger: true, keepOpen: true, onClick: () => { cancelled = true; } }],
    onClose: () => { cancelled = true; },
  });
  const setP = (p, txt) => { bar.style.width = Math.round(p * 100) + '%'; if (txt) label.textContent = txt; };

  if (o.mode === 'fast' && isDesktop && fastSupported()) {
    const pctx0 = prevC.getContext('2d');
    let lastPv = 0;
    const ui = {
      setP, cancelled: () => cancelled,
      preview: (cv) => { const n = performance.now(); if (n - lastPv > 150) { pctx0.drawImage(cv, 0, 0, prevC.width, prevC.height); lastPv = n; } },
    };
    const prevTime = store.time;
    const t0 = performance.now();
    let off = null;
    try {
      off = api.on('export:progress', (p) => setP(0.93 + p * 0.07, t('Finalizando o arquivo... {p}%', { p: Math.round(p * 100) })));
      const result = await fastExport({ ...o, bitrate: bitrate(o.W, o.H, o.quality) }, outPath, ui, t);
      off(); off = null;
      m.close();
      if (!result) { toast('Exportação cancelada', 'info'); return; }
      done(result, (performance.now() - t0) / 1000);
      return;
    } catch (e) {
      console.error(e);
      if (off) off();
      if (cancelled) { m.close(); return; }
      toast(t('O modo rápido falhou neste computador — exportando em tempo real.'), 'info');
      setP(0, t('Preparando...'));
    } finally {
      clearDecoded();
      store.time = prevTime;
      draw();
    }
  }

  player.exporting = true;
  const prevTime = store.time;
  for (const p of allPlayers().values()) p.el.pause();

  const vStream = canvas.captureStream(0);
  const vTrack = vStream.getVideoTracks()[0];
  const tracks = [vTrack, ...exportAudioStream().getAudioTracks()];
  const stream = new MediaStream(tracks);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate(o.W, o.H, o.quality), audioBitsPerSecond: 192000 });
  const chunks = [];
  let writeChain = Promise.resolve();
  if (isDesktop) await api.exportBegin();
  rec.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    if (isDesktop) writeChain = writeChain.then(async () => api.exportChunk(await e.data.arrayBuffer()));
    else chunks.push(e.data);
  };
  const stopped = new Promise((res) => (rec.onstop = res));

  // pré-carregamento: posiciona mídias no início
  const T0 = o.start || 0;
  syncMedia(T0, false);
  setP(0, 'Carregando mídias...');
  await new Promise((r) => setTimeout(r, 700));
  renderFrame(ctx, T0);

  rec.start(1000);
  const t0 = performance.now();
  const pctx = prevC.getContext('2d');
  let lastPrev = 0;
  await new Promise((resolve) => {
    const frameDur = 1000 / o.fps;
    let next = performance.now();
    const tick = () => {
      if (cancelled) return resolve();
      const now = performance.now();
      const tt = (now - t0) / 1000;
      if (tt >= o.duration) { store.time = T0 + o.duration; renderFrame(ctx, T0 + o.duration - 0.001); vTrack.requestFrame?.(); return resolve(); }
      store.time = T0 + tt;
      syncMedia(T0 + tt, true);
      if (now >= next) {
        next += frameDur;
        if (now - next > frameDur * 3) next = now + frameDur;
        renderFrame(ctx, T0 + tt);
        vTrack.requestFrame?.();
        if (now - lastPrev > 120) { pctx.drawImage(canvas, 0, 0, prevC.width, prevC.height); lastPrev = now; }
        setP(tt / o.duration * (o.format === 'webm' || !isDesktop ? 1 : 0.8), t('Gravando {a} / {b}', { a: fmtTime(tt, o.fps), b: fmtTime(o.duration, o.fps) }));
      }
      setTimeout(tick, 4);
    };
    tick();
  });
  rec.stop();
  await stopped;
  await writeChain;
  for (const p of allPlayers().values()) p.el.pause();
  player.exporting = false;
  store.time = prevTime;

  try {
    if (cancelled) {
      if (isDesktop) await api.exportEnd({ cancel: true });
      m.close();
      toast('Exportação cancelada', 'info');
      return;
    }
    if (isDesktop) {
      setP(0.8, o.format === 'webm' ? 'Salvando...' : 'Convertendo com FFmpeg...');
      const off = api.on('export:progress', (p) => setP(0.8 + p * 0.2, t('Convertendo... {p}%', { p: Math.round(p * 100) })));
      const result = await api.exportEnd({ outPath, format: o.format, quality: o.quality, fps: o.fps, duration: o.duration });
      off();
      m.close();
      done(result);
    } else {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `${o.name || 'video'}.webm` });
      document.body.append(a); a.click(); a.remove();
      m.close();
      done(null);
    }
  } catch (e) {
    m.close();
    console.error(e);
    modal({ title: 'Erro na exportação', body: el('pre', { class: 'error-pre' }, String(e.message || e)), actions: [{ label: 'OK', primary: true }] });
  } finally {
    draw();
  }
}

function done(path, secs) {
  modal({
    title: 'Exportação concluída', width: 440,
    body: el('div', { class: 'done-box' }, el('div', { class: 'done-icon', html: icon('check', 36) }), el('div', {}, 'Seu vídeo foi exportado com sucesso!'),
      secs ? el('div', { class: 'muted small' }, t('Feito em {s}', { s: fmtTime(secs, 1, false) })) : null,
      path ? el('div', { class: 'muted small path' }, path) : null),
    actions: [
      path ? { label: 'Abrir pasta', onClick: () => api.showItem(path) } : null,
      { label: 'Fechar', primary: true },
    ].filter(Boolean),
  });
  void settings;
}
