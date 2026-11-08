// Gravar tela, webcam e microfone (narração) direto no AsturCut
import { store, bus } from './store.js';
import { el, icon, modal, toast } from './util.js';
import { t } from './i18n.js';
import { api, isDesktop, importPaths } from './media.js';
import { settings } from './settings.js';

const stopAll = (s) => s && s.getTracks().forEach((tr) => tr.stop());
const mimeFor = (video) => (video
  ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  : ['audio/webm;codecs=opus', 'audio/webm']).find((m) => MediaRecorder.isTypeSupported(m));

async function listDevices() {
  // pede permissão rapidinho para os nomes dos dispositivos aparecerem
  for (const c of [{ audio: true }, { video: true }]) {
    try { stopAll(await navigator.mediaDevices.getUserMedia(c)); } catch {}
  }
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return { cams: all.filter((d) => d.kind === 'videoinput'), mics: all.filter((d) => d.kind === 'audioinput') };
}

export async function openRecorder() {
  if (!isDesktop || !api.recSources) { toast(t('A gravação de tela funciona no aplicativo para PC'), 'error'); return; }
  const info = await api.info();
  const saved = settings.get('recOpts') || {};
  const o = {
    mode: saved.mode || 'screen', // screen | window | camera
    source: null,
    cam: saved.cam,
    mic: saved.mic,
    systemAudio: saved.systemAudio ?? info.platform === 'win32',
    countdown: saved.countdown ?? true,
    hide: saved.hide ?? true,
  };
  let sources = [];
  let camStream = null, micStream = null, meterRaf = 0, meterCtx = null;

  const grid = el('div', { class: 'rec-grid' });
  const camPrev = el('video', { class: 'rec-cam', muted: true, autoplay: true, playsinline: true });
  const meter = el('div', { class: 'rec-meter' }, el('i'));
  const camSel = el('select', { class: 'select' });
  const micSel = el('select', { class: 'select' });
  const tabs = el('div', { class: 'segmented rec-tabs' });

  const fillGrid = () => {
    grid.innerHTML = '';
    if (o.mode === 'camera') { grid.append(el('div', { class: 'rec-empty' }, el('span', { html: icon('webcam', 30) }), el('div', {}, t('Só a webcam (sem gravar a tela)')))); return; }
    const list = sources.filter((s) => (o.mode === 'screen' ? s.screen : !s.screen));
    if (!list.length) { grid.append(el('div', { class: 'rec-empty' }, t('Não consegui listar as telas deste computador. Você ainda pode gravar só a webcam.'))); return; }
    if (!list.some((s) => s.id === o.source)) o.source = list[0].id;
    for (const s of list) {
      grid.append(el('button', { class: 'rec-src' + (s.id === o.source ? ' on' : ''), title: s.name, onclick: () => { o.source = s.id; fillGrid(); } },
        s.thumb ? el('img', { src: s.thumb }) : el('div', { class: 'rec-noimg', html: icon(s.screen ? 'screen' : 'layout', 26) }),
        el('span', { class: 'no-tr' }, s.screen && list.length === 1 ? t('Tela inteira') : s.name)));
    }
  };
  const fillTabs = () => {
    tabs.innerHTML = '';
    for (const [v, n, ic] of [['screen', 'Tela inteira', 'screen'], ['window', 'Uma janela', 'layout'], ['camera', 'Só webcam', 'webcam']]) {
      tabs.append(el('button', { class: o.mode === v ? 'on' : '', onclick: () => { o.mode = v; fillTabs(); fillGrid(); }, html: icon(ic, 14) + `<span>${t(n)}</span>` }));
    }
  };
  const startCamPreview = async () => {
    stopAll(camStream); camStream = null;
    camPrev.srcObject = null;
    camPrev.parentElement?.classList.toggle('off', !o.cam);
    if (!o.cam) return;
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: o.cam }, width: 1280, height: 720 } }); camPrev.srcObject = camStream; } catch { toast(t('Não consegui abrir a webcam'), 'error'); }
  };
  const startMicMeter = async () => {
    cancelAnimationFrame(meterRaf);
    stopAll(micStream); micStream = null;
    meter.firstChild.style.width = '0%';
    if (!o.mic) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.mic === 'default' ? undefined : { exact: o.mic } } });
      meterCtx = meterCtx || new AudioContext();
      const an = meterCtx.createAnalyser(); an.fftSize = 512;
      meterCtx.createMediaStreamSource(micStream).connect(an);
      const d = new Float32Array(an.fftSize);
      const loop = () => { an.getFloatTimeDomainData(d); let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); meter.firstChild.style.width = Math.min(100, p * 140) + '%'; meterRaf = requestAnimationFrame(loop); };
      loop();
    } catch { toast(t('Não consegui abrir o microfone'), 'error'); }
  };
  const cleanup = () => { cancelAnimationFrame(meterRaf); stopAll(camStream); stopAll(micStream); try { meterCtx?.close(); } catch {} };

  const sw = (key, label) => {
    const b = el('button', { class: 'switch' + (o[key] ? ' on' : ''), onclick: () => { o[key] = !o[key]; b.classList.toggle('on', o[key]); } }, el('span'));
    return el('div', { class: 'rec-opt' }, el('span', {}, t(label)), b);
  };
  const body = el('div', { class: 'rec-dlg' },
    el('div', { class: 'rec-left' }, tabs, grid),
    el('div', { class: 'rec-right' },
      el('div', { class: 'rec-label' }, el('span', { html: icon('webcam', 14) }), t('Webcam')), camSel,
      el('div', { class: 'rec-camwrap' }, camPrev),
      el('div', { class: 'rec-label' }, el('span', { html: icon('mic', 14) }), t('Microfone (narração)')), micSel, meter,
      info.platform === 'win32' ? sw('systemAudio', 'Gravar o som do computador') : null,
      sw('countdown', 'Contagem regressiva (3 s)'),
      sw('hide', 'Minimizar o AsturCut ao gravar'),
      el('div', { class: 'muted small' }, t('Para parar: botão Parar na barra flutuante ou Ctrl+Shift+F9.')),
    ));
  let started = false;
  const m = modal({
    title: t('Gravar tela e webcam'), width: 820, body,
    onClose: () => { if (!started) cleanup(); },
    actions: [
      { label: t('Cancelar') },
      { label: t('Começar a gravar'), primary: true, onClick: () => {
        if (o.mode !== 'camera' && !o.source) { toast(t('Escolha a tela ou janela'), 'error'); return false; }
        if (o.mode === 'camera' && !o.cam) { toast(t('Escolha uma webcam'), 'error'); return false; }
        settings.set('recOpts', { mode: o.mode, cam: o.cam, mic: o.mic, systemAudio: o.systemAudio, countdown: o.countdown, hide: o.hide });
        started = true;
        cancelAnimationFrame(meterRaf);
        startRecording(o, camStream, micStream).finally(() => { try { meterCtx?.close(); } catch {} });
      } },
    ],
  });
  fillTabs();
  grid.append(el('div', { class: 'rec-empty' }, t('Procurando telas e janelas...')));
  const [srcs, dev] = await Promise.all([api.recSources().catch(() => []), listDevices()]);
  sources = srcs;
  fillGrid();
  camSel.append(el('option', { value: '' }, t('Sem webcam')), ...dev.cams.map((d, i) => el('option', { value: d.deviceId, class: 'no-tr' }, d.label || `Webcam ${i + 1}`)));
  micSel.append(el('option', { value: '' }, t('Sem microfone')), ...dev.mics.filter((d) => d.deviceId !== 'communications').map((d, i) => el('option', { value: d.deviceId, class: 'no-tr' }, d.deviceId === 'default' ? t('Padrão do sistema') : (d.label || `Mic ${i + 1}`))));
  if (o.cam == null || ![...camSel.options].some((x) => x.value === o.cam)) o.cam = dev.cams[0]?.deviceId || '';
  if (o.mic == null || ![...micSel.options].some((x) => x.value === o.mic)) o.mic = dev.mics[0]?.deviceId || '';
  camSel.value = o.cam; micSel.value = o.mic;
  camSel.onchange = () => { o.cam = camSel.value; startCamPreview(); };
  micSel.onchange = () => { o.mic = micSel.value; startMicMeter(); };
  startCamPreview();
  startMicMeter();
  void m;
}

function countdown(n) {
  return new Promise((res) => {
    const box = el('div', { class: 'rec-count' }, el('div', {}, String(n)));
    document.body.append(box);
    let k = n;
    const step = () => {
      k--;
      if (k <= 0) { box.remove(); res(); return; }
      box.firstChild.textContent = String(k);
      box.firstChild.style.animation = 'none'; void box.offsetWidth; box.firstChild.style.animation = '';
      setTimeout(step, 1000);
    };
    setTimeout(step, 1000);
  });
}

async function startRecording(o, camStream, micStream) {
  let screen = null;
  try {
    if (o.mode !== 'camera') {
      await api.recSelect({ id: o.source, systemAudio: o.systemAudio });
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: !!o.systemAudio });
    }
  } catch (e) {
    console.error(e);
    stopAll(camStream); stopAll(micStream);
    toast(t('Não foi possível gravar a tela'), 'error');
    return;
  }
  if (o.countdown) await countdown(3);
  const parts = []; // { kind, rec, chunks }
  const mk = (kind, stream, video) => {
    const rec = new MediaRecorder(stream, { mimeType: mimeFor(video), videoBitsPerSecond: kind === 'screen' ? 12e6 : 6e6, audioBitsPerSecond: 160000 });
    const p = { kind, rec, chunks: [] };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) p.chunks.push(e.data); };
    parts.push(p);
  };
  if (screen) mk('screen', screen, true);
  if (camStream) {
    const s = !screen && micStream ? new MediaStream([...camStream.getVideoTracks(), ...micStream.getAudioTracks()]) : camStream;
    mk('camera', s, true);
  }
  if (micStream && (screen || !camStream)) mk('mic', micStream, false);
  if (!parts.length) { toast(t('Nada para gravar'), 'error'); return; }

  const t0 = performance.now();
  let pausedAt = 0, pausedTotal = 0, paused = false;
  parts.forEach((p) => p.rec.start(1000));
  await api.recStarted({ hide: !!screen && o.hide });
  const secs = () => ((paused ? pausedAt : performance.now()) - t0 - pausedTotal) / 1000;
  const tick = setInterval(() => api.recTick({ secs: secs(), paused }), 400);
  let resolveStop;
  const stopped = new Promise((r) => (resolveStop = r));
  const off = api.on('rec:control', (what) => {
    if (what === 'pause' && !paused) { paused = true; pausedAt = performance.now(); parts.forEach((p) => p.rec.state === 'recording' && p.rec.pause()); }
    else if (what === 'resume' && paused) { paused = false; pausedTotal += performance.now() - pausedAt; parts.forEach((p) => p.rec.state === 'paused' && p.rec.resume()); }
    else if (what === 'stop') resolveStop();
  });
  // se o usuário parar o compartilhamento pela barra do sistema
  screen?.getVideoTracks()[0]?.addEventListener('ended', () => resolveStop());
  await stopped;
  off();
  clearInterval(tick);
  await Promise.all(parts.map((p) => new Promise((r) => { if (p.rec.state === 'inactive') return r(); p.rec.onstop = r; p.rec.stop(); })));
  stopAll(screen); stopAll(camStream); stopAll(micStream);
  await api.recStopped();
  await saveAndPlace(parts);
}

async function saveAndPlace(parts) {
  const label = el('div', { class: 'muted small' }, t('Salvando a gravação...'));
  const m = modal({ title: t('Gravação'), width: 380, className: 'no-close', body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress indet' }, el('div', { class: 'progress-fill' })), label) });
  try {
    const stamp = new Date().toLocaleString('sv-SE').replace(/:/g, '-').slice(0, 19);
    const names = { screen: t('tela'), camera: t('webcam'), mic: t('narração') };
    const files = {};
    for (const p of parts) {
      const blob = new Blob(p.chunks, { type: p.rec.mimeType });
      files[p.kind] = await api.recSave({ name: `${stamp} ${names[p.kind]}`, buffer: await blob.arrayBuffer() });
    }
    label.textContent = t('Adicionando à linha do tempo...');
    const media = await importPaths(Object.values(files));
    const byPath = (p) => media.find((x) => x.path === p);
    place({ screen: byPath(files.screen), camera: byPath(files.camera), mic: byPath(files.mic) });
    m.close();
    toast(t('Gravação adicionada à linha do tempo'), 'success', 3500);
  } catch (e) {
    console.error(e);
    m.close();
    toast(t('Não foi possível salvar a gravação'), 'error');
  }
}

function place({ screen, camera, mic }) {
  const main = store.mainTrack();
  const start = store.clipsOn(main.id).reduce((mx, c) => Math.max(mx, c.start + c.duration), 0);
  const dur = Math.max(screen?.duration || 0, camera?.duration || 0, mic?.duration || 0) || 1;
  store.begin();
  if (screen) store.addClip({ trackId: main.id, type: 'video', mediaId: screen.id, name: screen.name, start, duration: screen.duration || dur, in: 0 }, { commit: false });
  if (camera) {
    if (screen) {
      const tr = store.findTrackFor('video', start, start + (camera.duration || dur));
      store.addClip({ trackId: tr.id, type: 'video', mediaId: camera.id, name: camera.name, start, duration: camera.duration || dur, in: 0, volume: 0,
        transform: { x: 0.36, y: 0.33, scale: 0.26, rotation: 0, opacity: 1 } }, { commit: false });
    } else store.addClip({ trackId: main.id, type: 'video', mediaId: camera.id, name: camera.name, start, duration: camera.duration || dur, in: 0 }, { commit: false });
  }
  if (mic) {
    let tr = store.p.tracks.find((x) => x.type === 'audio' && x.narration && store.isFree(x.id, start, start + (mic.duration || dur)));
    if (!tr) { tr = store.addTrack('audio', null, t('Narração')); tr.narration = true; }
    store.addClip({ trackId: tr.id, type: 'audio', mediaId: mic.id, name: mic.name, start, duration: mic.duration || dur, in: 0 }, { commit: false });
  }
  store.commit('record');
  store.setTime(start);
  bus.emit('selection');
}
