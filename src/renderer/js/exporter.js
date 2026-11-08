// Exportação de vídeo (gravação em tempo real do compositor + conversão com FFmpeg no desktop)
import { store } from './store.js';
import { el, icon, modal, toast, fmtTime, fmtBytes } from './util.js';
import { renderFrame } from './compositor.js';
import { player, pause, syncMedia, draw } from './player.js';
import { allPlayers, exportAudioStream, audioCtx, isDesktop, api } from './media.js';
import { settings } from './settings.js';

const RES = [[480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '2K'], [2160, '4K']];

export function openExportDialog() {
  const dur = store.duration();
  if (dur <= 0) { toast('A linha do tempo está vazia — adicione clipes antes de exportar.', 'error'); return; }
  pause();
  const st = store.p.settings;
  const opts = {
    name: store.p.name || 'video',
    res: Math.min(st.width, st.height) >= 1080 ? 1080 : Math.min(st.width, st.height),
    fps: st.fps,
    format: isDesktop ? 'mp4' : 'webm',
    quality: 'high',
  };
  const est = el('div', { class: 'muted small' });
  const sizeFor = () => {
    const k = Math.min(st.width, st.height);
    const W = Math.round(st.width * opts.res / k / 2) * 2, H = Math.round(st.height * opts.res / k / 2) * 2;
    return { W, H };
  };
  const updateEst = () => {
    const { W, H } = sizeFor();
    const mbps = bitrate(W, H, opts.quality) / 1e6;
    est.textContent = `${W}×${H} · ${opts.fps} fps · duração ${fmtTime(dur, opts.fps)} · tamanho estimado ~${fmtBytes(mbps * 1e6 / 8 * dur * (opts.format === 'mp4' ? 0.7 : 1))}`;
  };
  const field = (label, ctrl) => el('div', { class: 'exp-field' }, el('label', {}, label), ctrl);
  const sel = (key, list) => {
    const s = el('select', { class: 'select' }, list.map(([v, n]) => el('option', { value: v, selected: String(opts[key]) === String(v) }, n)));
    s.addEventListener('change', () => { opts[key] = isNaN(+s.value) ? s.value : +s.value; updateEst(); });
    return s;
  };
  const name = el('input', { class: 'input', value: opts.name });
  name.addEventListener('input', () => (opts.name = name.value));
  const formats = isDesktop
    ? [['mp4', 'MP4 (H.264) — recomendado'], ['webm', 'WebM (VP9)'], ['mov', 'MOV (H.264)'], ['gif', 'GIF animado'], ['mp3', 'Somente áudio (MP3)']]
    : [['webm', 'WebM (VP9)']];
  const preview = el('canvas', { class: 'exp-preview', width: 320, height: Math.round(320 * st.height / st.width) });
  try { renderFrame(preview.getContext('2d'), Math.min(store.time, dur - 0.01)); } catch {}
  const body = el('div', { class: 'exp-grid' },
    el('div', { class: 'exp-left' }, preview, el('div', { class: 'muted small center' }, 'Capa / prévia')),
    el('div', { class: 'exp-right' },
      field('Nome', name),
      field('Resolução', sel('res', RES)),
      field('Taxa de quadros', sel('fps', [[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']])),
      field('Formato', sel('format', formats)),
      field('Qualidade', sel('quality', [['low', 'Baixa (arquivo menor)'], ['medium', 'Recomendada'], ['high', 'Alta'], ['max', 'Máxima']])),
      est,
      el('div', { class: 'exp-note' }, el('span', { html: icon('info', 14) }), el('span', {}, 'A exportação é feita em tempo real: deixe o AsturCut aberto até terminar.')),
    ));
  updateEst();
  modal({
    title: 'Exportar', width: 720, body,
    actions: [
      { label: 'Cancelar' },
      { label: 'Exportar', primary: true, onClick: () => { const { W, H } = sizeFor(); startExport({ ...opts, W, H, duration: dur }); } },
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
  syncMedia(0, false);
  setP(0, 'Carregando mídias...');
  await new Promise((r) => setTimeout(r, 700));
  renderFrame(ctx, 0);

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
      const t = (now - t0) / 1000;
      if (t >= o.duration) { store.time = o.duration; renderFrame(ctx, o.duration - 0.001); vTrack.requestFrame?.(); return resolve(); }
      store.time = t;
      syncMedia(t, true);
      if (now >= next) {
        next += frameDur;
        if (now - next > frameDur * 3) next = now + frameDur;
        renderFrame(ctx, t);
        vTrack.requestFrame?.();
        if (now - lastPrev > 120) { pctx.drawImage(canvas, 0, 0, prevC.width, prevC.height); lastPrev = now; }
        setP(t / o.duration * (o.format === 'webm' || !isDesktop ? 1 : 0.8), `Gravando ${fmtTime(t, o.fps)} / ${fmtTime(o.duration, o.fps)}`);
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
      const off = api.on('export:progress', (p) => setP(0.8 + p * 0.2, `Convertendo... ${Math.round(p * 100)}%`));
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

function done(path) {
  modal({
    title: 'Exportação concluída', width: 440,
    body: el('div', { class: 'done-box' }, el('div', { class: 'done-icon', html: icon('check', 36) }), el('div', {}, 'Seu vídeo foi exportado com sucesso!'), path ? el('div', { class: 'muted small path' }, path) : null),
    actions: [
      path ? { label: 'Abrir pasta', onClick: () => api.showItem(path) } : null,
      { label: 'Fechar', primary: true },
    ].filter(Boolean),
  });
  void settings;
}
