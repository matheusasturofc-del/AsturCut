// Legendas automáticas: transcreve a fala com Whisper (no próprio computador) e cria clipes de texto sincronizados
import { store, bus, defaultText } from './store.js';
import { el, modal, toast, clamp, uid, fmtBytes, icon, fmtTime } from './util.js';
import { FONTS } from './library.js';
import { ANIM_IN } from './lib/animations.js';
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

export function createClips(caps, o) {
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
    const words = c.text.karaoke?.words || c.text.karaokeWords || null;
    c.text = { ...text, content: c.text.content, karaokeWords: words || undefined };
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
// áudio só de um clipe (e o áudio vinculado a ele), do início ao fim do clipe
async function audioForClip(c) {
  const ids = new Set(store.linked(c).map((x) => x.id));
  const buf = await renderAudioOffline(c.start, c.duration, null, { sampleRate: 16000, channels: 1, filter: (x) => ids.has(x.id) });
  clearDecoded();
  return buf.getChannelData(0);
}
// clipes com fala para "cada clipe separado" (um por grupo vinculado)
function speechClips(onlySelected) {
  const pool = (onlySelected && store.selectedClips().length ? store.selectedClips() : store.p.clips).filter((c) => c.type === 'video' || c.type === 'audio');
  const seen = new Set(), out = [];
  for (const c of pool.sort((a, b) => a.start - b.start)) {
    if (seen.has(c.id)) continue;
    const g = store.linked(c); g.forEach((x) => seen.add(x.id));
    const src = g.find((x) => x.type === 'audio') || g.find((x) => x.type === 'video' && !x.audioDetached && (x.volume ?? 1) > 0);
    if (src) out.push(src);
  }
  return out;
}

// ---------- diálogo ----------
export function openCaptionsDialog(forClips = null) {
  if (forClips && forClips.length) store.select(forClips.map((c) => c.id));
  if (!store.p.clips.some((c) => c.type === 'audio' || c.type === 'video')) { toast(t('Adicione um vídeo ou áudio com fala na linha do tempo'), 'error'); return; }
  const saved = settings.get('captionOpts') || {};
  const hasSel = store.selectedClips().some((c) => c.type === 'audio' || c.type === 'video');
  const o = {
    source: hasSel ? (store.selectedClips().filter((c) => c.type === 'video' || c.type === 'audio').length > 1 ? 'each-selected' : 'selected') : 'all',
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
      field('Áudio', sel('source', [['all', 'Todo o áudio junto (uma legenda só)'], ['each', 'Cada clipe separado (estilo próprio por clipe)'], ...(hasSel ? [['selected', 'Só os clipes selecionados'], ['each-selected', 'Cada clipe selecionado separado']] : [])])),
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
    const t0 = performance.now();
    const transcribe = (audio, base, span) => new Promise((resolve, reject) => {
      const words = [];
      const w = getWorker();
      w.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'download') setP(0.05 + (d.loaded / d.total) * 0.25, t('Baixando a IA de legendas (só na primeira vez)... {a} de {b}', { a: fmtBytes(d.loaded), b: fmtBytes(d.total) }));
        else if (d.type === 'status') setP(Math.max(base, 0.3), d.device === 'webgpu' ? t('Carregando a IA (placa de vídeo)...') : t('Carregando a IA...'));
        else if (d.type === 'progress') setP(base + (d.i / d.n) * span, t('Ouvindo e escrevendo... parte {a} de {b}', { a: d.i + 1, b: d.n }));
        else if (d.type === 'segment') {
          words.push(...d.words);
          live.textContent = d.words.map((x) => x.text).join('').trim().slice(-160);
        } else if (d.type === 'done') resolve(words);
        else if (d.type === 'error') reject(new Error(d.message));
      };
      w.onerror = (e) => reject(new Error(e.message || 'worker'));
      w.postMessage({ audio, model: MODELS[o.quality].id, language: o.lang || null, vendor: window.ASTUR_VENDOR?.transformers || null }, [audio.buffer]);
    });
    let total = 0;
    if (o.source === 'each' || o.source === 'each-selected') {
      // cada clipe vira um grupo de legendas independente (dá para estilizar separado)
      const list = speechClips(o.source === 'each-selected');
      if (!list.length) { m.close(); toast(t('Adicione um vídeo ou áudio com fala na linha do tempo'), 'error'); return; }
      if (o.replace) { store.begin(); store.p.clips = store.p.clips.filter((c) => !c.autoCaption); store.commit('captions'); }
      for (let i = 0; i < list.length && !cancelled; i++) {
        const c = list[i];
        label.textContent = t('Clipe {a} de {b}: preparando o áudio...', { a: i + 1, b: list.length });
        const audio = await audioForClip(c);
        if (cancelled) return;
        const words = (await transcribe(audio, 0.3 + (i / list.length) * 0.68, 0.68 / list.length)).map((x) => ({ ...x, start: x.start + c.start, end: x.end + c.start }))
          .filter((x) => x.start < c.start + c.duration);
        const caps = buildCaptions(words, o.length);
        if (caps.length) { createClips(caps, { ...o, replace: false }); total += caps.length; }
      }
    } else {
      const audio = await audioForAsr(o.source === 'selected');
      if (cancelled) return;
      const words = await transcribe(audio, 0.32, 0.66);
      if (cancelled) return;
      const caps = buildCaptions(words, o.length);
      if (caps.length) { createClips(caps, o); total = caps.length; }
    }
    if (cancelled) return;
    m.close();
    if (!total) { toast(t('Não encontrei fala no áudio'), 'info'); return; }
    toast(t('{n} legendas criadas em {s} s — clique em uma para editar o texto', { n: total, s: Math.round((performance.now() - t0) / 1000) }), 'success', 4500);
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

// ---------- personalizar legendas (todas de uma vez, como nos editores de celular) ----------
const groupClips = (g) => store.p.clips.filter((c) => c.autoCaption === g).sort((a, b) => a.start - b.start);
function applyAll(g, fn, final = true) {
  if (final) store.begin();
  for (const c of groupClips(g)) fn(c);
  if (final) store.commit('captions-style'); else store.touch();
}
const ctl = (label, input) => el('div', { class: 'cp-row' }, el('label', {}, t(label)), input);
function range(min, max, step, val, onInput) {
  const r = el('input', { type: 'range', min, max, step, value: val, class: 'cp-range' });
  const v = el('span', { class: 'cp-val' }, String(val));
  r.addEventListener('pointerdown', () => store.begin());
  r.addEventListener('input', () => { v.textContent = r.value; onInput(+r.value, false); });
  r.addEventListener('change', () => { store.commit('captions-style'); });
  return el('div', { class: 'cp-rangewrap' }, r, v);
}
function colorIn(val, onChange) {
  const i = el('input', { type: 'color', class: 'color', value: val });
  i.addEventListener('input', () => onChange(i.value, false));
  i.addEventListener('change', () => onChange(i.value, true));
  i.addEventListener('pointerdown', () => store.begin());
  return i;
}
function sw(on, onChange) { return el('button', { class: 'switch' + (on ? ' on' : ''), onclick: () => onChange(!on) }, el('span')); }

export function captionsPanel(sel) {
  const g = sel.autoCaption;
  const tx = sel.text;
  const k = tx.karaoke || null;
  const box = el('div', { class: 'cp' });
  const set = (patch) => (c) => Object.assign(c.text, patch);
  // estilos prontos
  box.append(el('div', { class: 'cp-title' }, t('Estilo das legendas')),
    el('div', { class: 'cap-styles' }, CAPTION_STYLES.map((st) => el('button', { class: 'cap-style', onclick: () => restyleCaptions(g, st.id) }, t(st.name)))));
  // texto
  const fonts = (FONTS || []).map((f) => f.family).sort((a, b) => a.localeCompare(b));
  const fontSel = el('select', { class: 'select' }, fonts.map((f) => el('option', { value: f, selected: f === tx.font, style: { fontFamily: `"${f}"` } }, f)));
  fontSel.addEventListener('change', () => applyAll(g, set({ font: fontSel.value })));
  box.append(el('div', { class: 'cp-title' }, t('Texto')),
    ctl('Fonte', fontSel),
    ctl('Tamanho', range(20, 200, 1, tx.size, (v, f) => applyAll(g, set({ size: v }), f))),
    ctl('Cor', colorIn(tx.color, (v, f) => applyAll(g, set({ color: v }), f))),
    ctl('Negrito', sw(tx.bold, (v) => applyAll(g, set({ bold: v })))),
    ctl('Maiúsculas', sw(tx.uppercase, (v) => applyAll(g, set({ uppercase: v })))),
    ctl('Espaçamento', range(-5, 30, 1, tx.letterSpacing || 0, (v, f) => applyAll(g, set({ letterSpacing: v }), f))));
  // destaque da palavra falada (karaokê)
  box.append(el('div', { class: 'cp-title' }, t('Destaque da palavra falada')),
    ctl('Ativar', sw(!!k, (v) => applyAll(g, (c) => {
      if (v) { const n = c.text.content.split(/\s+/).filter(Boolean).length; const per = c.duration / Math.max(1, n); c.text.karaoke = { color: '#ffd400', words: c.text.karaokeWords || Array.from({ length: n }, (_, i) => [+(i * per).toFixed(3), +((i + 1) * per).toFixed(3)]) }; }
      else { if (c.text.karaoke) c.text.karaokeWords = c.text.karaoke.words; delete c.text.karaoke; }
    }))));
  if (k) {
    const modeSel = el('select', { class: 'select' }, [['word', 'Só a palavra atual'], ['fill', 'Preencher até a palavra']].map(([v, n]) => el('option', { value: v, selected: (k.mode || 'word') === v }, t(n))));
    modeSel.addEventListener('change', () => applyAll(g, (c) => { if (c.text.karaoke) c.text.karaoke.mode = modeSel.value === 'fill' ? 'fill' : undefined; }));
    box.append(
      ctl('Cor do destaque', colorIn(k.color || '#ffd400', (v, f) => applyAll(g, (c) => { if (c.text.karaoke) c.text.karaoke.color = v; }, f))),
      ctl('Modo', modeSel),
      ctl('Caixa atrás da palavra', sw(!!k.box, (v) => applyAll(g, (c) => { if (c.text.karaoke) { c.text.karaoke.box = v; c.text.karaoke.ink = v ? '#0b0b0d' : undefined; } }))),
      ctl('Palavra cresce (pop)', sw(!!k.pop, (v) => applyAll(g, (c) => { if (c.text.karaoke) c.text.karaoke.pop = v; }))));
  }
  // contorno, sombra e fundo
  box.append(el('div', { class: 'cp-title' }, t('Contorno, sombra e fundo')),
    ctl('Contorno', colorIn(tx.stroke || '#000000', (v, f) => applyAll(g, set({ stroke: v }), f))),
    ctl('Espessura', range(0, 20, 1, tx.strokeWidth || 0, (v, f) => applyAll(g, set({ strokeWidth: v }), f))),
    ctl('Sombra', sw(!!tx.shadow, (v) => applyAll(g, set({ shadow: v, shadowColor: '#000000', shadowBlur: 10, shadowX: 0, shadowY: 4 })))),
    ctl('Brilho (neon)', range(0, 40, 1, tx.glow || 0, (v, f) => applyAll(g, set({ glow: v }), f))),
    ctl('Cor do brilho', colorIn(tx.glowColor || '#22d3ee', (v, f) => applyAll(g, set({ glowColor: v }), f))),
    ctl('Fundo', sw(!!tx.bg, (v) => applyAll(g, set({ bg: v })))));
  if (tx.bg) box.append(
    ctl('Cor do fundo', colorIn(tx.bgColor || '#000000', (v, f) => applyAll(g, set({ bgColor: v }), f))),
    ctl('Opacidade', range(0, 100, 1, Math.round((tx.bgOpacity ?? 0.6) * 100), (v, f) => applyAll(g, set({ bgOpacity: v / 100 }), f))),
    ctl('Arredondar', range(0, 40, 1, tx.bgRadius ?? 12, (v, f) => applyAll(g, set({ bgRadius: v }), f))));
  // posição e animação
  const animSel = el('select', { class: 'select' }, [['', t('Nenhuma')], ...ANIM_IN.map((a) => [a.id, t(a.name)])].map(([v, n]) => el('option', { value: v, selected: (sel.animIn?.id || '') === v }, n)));
  animSel.addEventListener('change', () => applyAll(g, (c) => { c.animIn = animSel.value ? { id: animSel.value, dur: Math.min(0.35, c.duration / 2), speed: 1 } : null; }));
  box.append(el('div', { class: 'cp-title' }, t('Posição e animação')),
    ctl('Altura na tela', range(-45, 45, 1, Math.round((sel.transform.y || 0) * 100), (v, f) => applyAll(g, (c) => { c.transform.y = v / 100; }, f))),
    el('div', { class: 'chips' }, [['Em cima', -0.36], ['Centro', 0], ['Embaixo', 0.36]].map(([n, y]) => el('button', { class: 'chip', onclick: () => applyAll(g, (c) => { c.transform.y = y; }) }, t(n)))),
    ctl('Animação de entrada', animSel));
  // editar os textos em lista
  const list = el('div', { class: 'cp-list' });
  for (const c of groupClips(g)) {
    const ta = el('textarea', { class: 'cp-text no-tr', rows: 1 }, c.text.content);
    ta.addEventListener('focus', () => { store.setTime(c.start + 0.01); });
    ta.addEventListener('change', () => { store.begin(); c.text.content = ta.value; c.name = ta.value.replace(/\n/g, ' ').slice(0, 40); store.commit('caption-text'); });
    list.append(el('div', { class: 'cp-item' + (c.id === sel.id ? ' on' : '') }, el('span', { class: 'cp-time' }, fmtTime(c.start, 30, false)), ta,
      el('button', { class: 'icon-btn xs', title: t('Excluir'), onclick: () => store.deleteClips([c.id]), html: icon('trash', 12) })));
  }
  box.append(el('div', { class: 'cp-title' }, t('Editar textos ({n})', { n: groupClips(g).length })), list,
    el('div', { class: 'btn-row' }, el('button', { class: 'btn sm danger', onclick: () => { const ids = groupClips(g).map((c) => c.id); store.deleteClips(ids); } }, t('Apagar todas as legendas'))));
  return box;
}
