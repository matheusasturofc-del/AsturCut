// Legendas automáticas: transcreve a fala com Whisper (no próprio computador) e cria clipes de texto sincronizados
import { store, bus, defaultText } from './store.js';
import { el, modal, toast, clamp, uid, fmtBytes, icon } from './util.js';
import { t, LANG } from './i18n.js';
import { renderAudioOffline, clearDecoded } from './fastExport.js';
import { settings } from './settings.js';
import { drawText } from './compositor.js';

const MODELS = {
  fast: { id: 'Xenova/whisper-base', size: '~150 MB' },
  precise: { id: 'Xenova/whisper-small', size: '~250 MB' },
};

// estilos prontos de legenda
export const CAPTION_STYLES = [
  { id: 'classic', name: 'Clássica', t: { font: 'Montserrat', size: 62, color: '#ffffff', bold: true, stroke: '#000000', strokeWidth: 5 } },
  { id: 'highlight', name: 'Destaque', t: { font: 'Montserrat', size: 78, color: '#ffffff', bold: true, uppercase: true, stroke: '#000000', strokeWidth: 7 }, karaoke: { color: '#ffd400' } },
  { id: 'pop', name: 'Pop', t: { font: 'Montserrat', size: 74, color: '#ffffff', bold: true, uppercase: true, stroke: '#000000', strokeWidth: 4, shadow: true, shadowBlur: 0, shadowX: 0, shadowY: 6 }, karaoke: { color: '#1ccfdc', box: true, ink: '#0b0b0d' } },
  { id: 'box', name: 'Com fundo', t: { font: 'Inter', size: 54, color: '#ffffff', bold: true, bg: true, bgColor: '#000000', bgOpacity: 0.7, bgPadding: 18, bgRadius: 10 } },
  { id: 'neon', name: 'Neon', t: { font: 'Bebas Neue', size: 96, color: '#ffffff', bold: false, uppercase: true, glow: 18, glowColor: '#22d3ee', letterSpacing: 2 }, karaoke: { color: '#a5f3fc', mode: 'fill' } },
  { id: 'simple', name: 'Simples', t: { font: 'Inter', size: 52, color: '#ffffff', bold: false, shadow: true, shadowBlur: 10, shadowX: 0, shadowY: 3, shadowColor: '#000000' } },
];

const LENGTHS = { short: { chars: 16, dur: 1.6 }, normal: { chars: 34, dur: 3.2 }, long: { chars: 64, dur: 5 } };

// agrupa palavras em legendas
export function buildCaptions(words, length = 'normal') {
  const L = LENGTHS[length] || LENGTHS.normal;
  const out = [];
  let cur = null;
  for (const w of words) {
    const txt = (w.text || '').trim();
    if (!txt) continue;
    const gap = cur ? w.start - cur.end : 0;
    const len = cur ? cur.text.length + 1 + txt.length : txt.length;
    if (!cur || gap > 0.7 || len > L.chars || w.end - cur.start > L.dur || /[.!?…]$/.test(cur.text)) {
      if (cur) out.push(cur);
      cur = { text: txt, start: w.start, end: Math.max(w.end, w.start + 0.05), words: [[w.start, w.end]] };
    } else {
      cur.text += ' ' + txt;
      cur.end = Math.max(cur.end, w.end);
      cur.words.push([w.start, w.end]);
    }
  }
  if (cur) out.push(cur);
  for (let i = 0; i < out.length; i++) {
    const c = out[i], next = out[i + 1];
    c.end = Math.max(c.end + 0.2, c.start + 0.6);                  // fica um pouquinho mais na tela
    if (next) c.end = Math.min(c.end, next.start - 0.01);
    if (next && next.start - c.end < 0.35) c.end = next.start - 0.01; // emenda quando é quase contínuo
    if (length === 'long' && c.text.length > LENGTHS.normal.chars) {  // duas linhas
      const ws = c.text.split(' ');
      let best = 1, bd = Infinity;
      for (let k = 1; k < ws.length; k++) { const a = ws.slice(0, k).join(' ').length; const d = Math.abs(a - (c.text.length - a)); if (d < bd) { bd = d; best = k; } }
      c.text = ws.slice(0, best).join(' ') + '\n' + ws.slice(best).join(' ');
    }
  }
  return out;
}

// estilo + posição -> propriedades do texto/transform
function styleProps(styleId, pos) {
  const st = CAPTION_STYLES.find((s) => s.id === styleId) || CAPTION_STYLES[0];
  const vertical = store.p.settings.height > store.p.settings.width;
  const y = pos === 'middle' ? 0.12 : pos === 'top' ? -0.36 : vertical ? 0.26 : 0.36;
  return { text: { ...defaultText(), ...st.t }, karaoke: st.karaoke || null, y };
}

function createClips(caps, o) {
  store.begin();
  // remove legendas automáticas anteriores
  if (o.replace) store.p.clips = store.p.clips.filter((c) => !c.autoCaption);
  let track = store.p.tracks.find((tr) => tr.captions && tr.type === 'video');
  if (!track) { track = store.addTrack('video', 0, t('Legendas')); track.captions = true; }
  const busy = (c) => store.p.clips.some((x) => x.trackId === track.id && x.start < c.end - 1e-3 && x.start + x.duration > c.start + 1e-3);
  if (caps.some(busy)) { track = store.addTrack('video', 0, t('Legendas')); track.captions = true; }
  const { text, karaoke, y } = styleProps(o.style, o.pos);
  const group = uid('cap');
  for (const c of caps) {
    const tx = { ...text, content: c.text };
    if (karaoke) tx.karaoke = { ...karaoke, words: c.words.map(([s, e]) => [+(s - c.start).toFixed(3), +(e - c.start).toFixed(3)]) };
    store.addClip({
      trackId: track.id, type: 'text', name: c.text.replace(/\n/g, ' ').slice(0, 40), text: tx,
      start: +c.start.toFixed(3), duration: +(c.end - c.start).toFixed(3),
      transform: { x: 0, y, scale: 1, rotation: 0, opacity: 1 },
      autoCaption: group,
    }, { select: false, commit: false });
  }
  store.removeEmptyTracks();
  store.commit('captions');
  bus.emit('selection');
}

// muda o estilo de todas as legendas de um grupo
export function restyleCaptions(group, styleId) {
  const { text, karaoke } = styleProps(styleId, 'bottom');
  store.begin();
  for (const c of store.p.clips) {
    if (c.autoCaption !== group) continue;
    const words = c.text.karaoke?.words || null;
    c.text = { ...text, content: c.text.content };
    if (karaoke && words) c.text.karaoke = { ...karaoke, words };
  }
  store.commit('captions-style');
}

// ---------- áudio para o Whisper (16 kHz mono) ----------
async function audioForAsr(onlySelected) {
  const sel = new Set(store.selectedClips().flatMap((c) => store.linked(c)).map((c) => c.id));
  const dur = store.duration();
  const buf = await renderAudioOffline(0, dur, null, {
    sampleRate: 16000, channels: 1,
    filter: onlySelected && sel.size ? (c) => sel.has(c.id) : null,
  });
  clearDecoded();
  return buf.getChannelData(0);
}

// ---------- diálogo ----------
export function openCaptionsDialog() {
  if (!store.p.clips.some((c) => c.type === 'audio' || c.type === 'video')) { toast(t('Adicione um vídeo ou áudio com fala na linha do tempo'), 'error'); return; }
  const saved = settings.get('captionOpts') || {};
  const hasSel = store.selectedClips().some((c) => c.type === 'audio' || c.type === 'video');
  const o = {
    source: hasSel ? 'selected' : 'all',
    lang: saved.lang || ({ pt: 'portuguese', en: 'english', es: 'spanish' }[LANG] || ''),
    quality: saved.quality || 'precise',
    style: saved.style || 'highlight',
    length: saved.length || (store.p.settings.height > store.p.settings.width ? 'short' : 'normal'),
    pos: saved.pos || 'bottom',
    replace: true,
  };
  const field = (label, ctrl) => el('div', { class: 'exp-field' }, el('label', {}, label), ctrl);
  const sel = (key, list) => {
    const s = el('select', { class: 'select' }, list.map(([v, n]) => el('option', { value: v, selected: o[key] === v }, n)));
    s.addEventListener('change', () => { o[key] = s.value; drawPrev(); });
    return s;
  };
  const prev = el('canvas', { class: 'cap-prev', width: 560, height: 200 });
  const styleRow = el('div', { class: 'cap-styles' }, CAPTION_STYLES.map((s) => el('button', { class: 'cap-style' + (s.id === o.style ? ' on' : ''), 'data-id': s.id, onclick: () => { o.style = s.id; styleRow.querySelectorAll('.cap-style').forEach((b) => b.classList.toggle('on', b.dataset.id === s.id)); drawPrev(); } }, s.name)));
  // prévia animada do estilo
  let raf = 0;
  const sample = { pt: 'Legendas automáticas no AsturCut', en: 'Automatic captions in AsturCut', es: 'Subtítulos automáticos en AsturCut' }[LANG] || 'Legendas automáticas no AsturCut';
  function drawPrev() {
    cancelAnimationFrame(raf);
    const ctx = prev.getContext('2d');
    const { text, karaoke } = styleProps(o.style, 'middle');
    const words = sample.split(' ');
    const loop = (ts) => {
      const k = Math.floor(ts / 450) % (words.length + 2);
      ctx.fillStyle = '#26262a'; ctx.fillRect(0, 0, prev.width, prev.height);
      const g = ctx.createLinearGradient(0, 0, prev.width, prev.height); g.addColorStop(0, 'rgba(28,207,220,.25)'); g.addColorStop(1, 'rgba(91,43,255,.3)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, prev.width, prev.height);
      const S = 0.42;
      const tx = { ...text, content: o.length === 'short' ? words.slice(0, 2).join(' ') : sample };
      if (karaoke) tx.karaoke = { ...karaoke, words: tx.content.split(' ').map((_, i) => [i * 0.45, i * 0.45 + 0.4]) };
      ctx.save();
      ctx.translate(prev.width / 2, prev.height / 2);
      drawText(ctx, tx, S, { chars: 1, words: 1 }, k * 0.45 + 0.01);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  const body = el('div', { class: 'cap-dlg' },
    el('div', { class: 'cap-intro' }, el('span', { html: icon('captions', 18) }), el('span', {}, t('O AsturCut ouve a fala do vídeo e cria as legendas sozinho. Tudo roda no seu computador — nada é enviado para a internet.'))),
    prev,
    el('div', { class: 'exp-sub' }, 'Estilo'),
    styleRow,
    el('div', { class: 'cap-grid' },
      field('Idioma da fala', sel('lang', [['portuguese', 'Português'], ['english', 'English'], ['spanish', 'Español'], ['', t('Detectar automaticamente')]])),
      field('Áudio', sel('source', [['all', 'Todo o áudio da linha do tempo'], ...(hasSel ? [['selected', 'Só os clipes selecionados']] : [])])),
      field('Tamanho', sel('length', [['short', 'Curta (1–3 palavras, estilo TikTok)'], ['normal', 'Normal (1 linha)'], ['long', 'Longa (até 2 linhas)']])),
      field('Posição', sel('pos', [['bottom', 'Embaixo'], ['middle', 'Centro'], ['top', 'Em cima']])),
      field('Precisão', sel('quality', [['precise', t('Alta — recomendado ({s})', { s: MODELS.precise.size })], ['fast', t('Rápida ({s})', { s: MODELS.fast.size })]])),
    ),
    el('div', { class: 'muted small' }, t('Na primeira vez o modelo de IA é baixado (uma vez só). Depois funciona até sem internet.')),
  );
  modal({
    title: t('Legendas automáticas'), width: 640, body, onClose: () => cancelAnimationFrame(raf),
    actions: [
      { label: t('Cancelar') },
      { label: t('Gerar legendas'), primary: true, onClick: () => { settings.set('captionOpts', { lang: o.lang, quality: o.quality, style: o.style, length: o.length, pos: o.pos }); runCaptions(o); } },
    ],
  });
  drawPrev();
}

let worker = null;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./ai/asr-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

async function runCaptions(o) {
  const bar = el('div', { class: 'progress-fill' });
  const label = el('div', { class: 'muted small' }, t('Preparando o áudio...'));
  const live = el('div', { class: 'cap-live' });
  let cancelled = false;
  const m = modal({
    title: t('Gerando legendas...'), width: 480, className: 'no-close',
    body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar), label, live),
    actions: [{ label: t('Cancelar'), danger: true, onClick: () => { cancelled = true; if (worker) { worker.terminate(); worker = null; } } }],
    onClose: () => { if (!cancelled) { cancelled = true; if (worker) { worker.terminate(); worker = null; } } },
  });
  const setP = (p, txt) => { bar.style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (txt) label.textContent = txt; };
  try {
    setP(0.02);
    const audio = await audioForAsr(o.source === 'selected');
    if (cancelled) return;
    const words = [];
    const w = getWorker();
    const t0 = performance.now();
    await new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'download') setP(0.05 + (d.loaded / d.total) * 0.25, t('Baixando a IA de legendas (só na primeira vez)... {a} de {b}', { a: fmtBytes(d.loaded), b: fmtBytes(d.total) }));
        else if (d.type === 'status') setP(0.3, d.device === 'webgpu' ? t('Carregando a IA (placa de vídeo)...') : t('Carregando a IA...'));
        else if (d.type === 'progress') setP(0.32 + (d.i / d.n) * 0.66, t('Ouvindo e escrevendo... parte {a} de {b}', { a: d.i + 1, b: d.n }));
        else if (d.type === 'segment') {
          words.push(...d.words);
          live.textContent = d.words.map((x) => x.text).join('').trim().slice(-160);
        } else if (d.type === 'done') resolve();
        else if (d.type === 'error') reject(new Error(d.message));
      };
      w.onerror = (e) => reject(new Error(e.message || 'worker'));
      w.postMessage({ audio, model: MODELS[o.quality].id, language: o.lang || null }, [audio.buffer]);
    });
    if (cancelled) return;
    m.close();
    const caps = buildCaptions(words, o.length);
    if (!caps.length) { toast(t('Não encontrei fala no áudio'), 'info'); return; }
    createClips(caps, o);
    toast(t('{n} legendas criadas em {s} s — clique em uma para editar o texto', { n: caps.length, s: Math.round((performance.now() - t0) / 1000) }), 'success', 4500);
  } catch (e) {
    if (cancelled) return;
    m.close();
    console.error(e);
    const msg = String(e.message || e);
    modal({
      title: t('Não foi possível gerar as legendas'),
      body: el('div', { class: 'dlg' },
        el('div', {}, /fetch|network|Failed to fetch|ERR_/i.test(msg) ? t('Não consegui baixar a IA. Verifique sua internet e tente de novo (só precisa na primeira vez).') : t('Algo deu errado ao transcrever o áudio.')),
        el('pre', { class: 'error-pre' }, msg.slice(0, 600))),
      actions: [{ label: 'OK', primary: true }],
    });
  }
}
