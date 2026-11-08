// Visualizador de origem: assista a mídia, marque Entrada (I) e Saída (O) e leve só o trecho para a linha do tempo
import { store, bus } from './store.js';
import { el, icon, modal, fmtTime, clamp, dragHandler } from './util.js';
import { mediaUrl, runtime } from './media.js';
import { t } from './i18n.js';

export function openSource(m) {
  if (!m || m.type === 'image') return;
  const fps = store.p.settings.fps || 30;
  const url = mediaUrl(m);
  const isVideo = m.type === 'video';
  const media = el(isVideo ? 'video' : 'audio', { class: 'src-media', src: url, preload: 'auto', crossorigin: 'anonymous' });
  const dur = () => media.duration || m.duration || 1;
  let inP = m.srcIn ?? null, outP = m.srcOut ?? null;

  const cur = el('span', { class: 'accent mono' }, '00:00:00:00');
  const rangeLbl = el('span', { class: 'muted mono small' });
  const bar = el('div', { class: 'src-bar' });
  const fill = el('div', { class: 'src-range' });
  const head = el('div', { class: 'src-head' });
  const wave = el('canvas', { class: 'src-wave', width: 800, height: 40 });
  bar.append(wave, fill, head);

  const drawWave = () => {
    const rt = runtime.get(m.id);
    const x = wave.getContext('2d');
    x.clearRect(0, 0, 800, 40);
    if (!rt?.peaks) return;
    x.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 800; i++) {
      const v = rt.peaks[Math.floor((i / 800) * rt.peaks.length)] || 0;
      const h = Math.max(1, v * 36);
      x.fillRect(i, (40 - h) / 2, 1, h);
    }
  };
  const update = () => {
    const d = dur();
    cur.textContent = fmtTime(media.currentTime, fps);
    head.style.left = (media.currentTime / d) * 100 + '%';
    const a = inP ?? 0, b = outP ?? d;
    fill.style.left = (a / d) * 100 + '%';
    fill.style.width = Math.max(0, (b - a) / d) * 100 + '%';
    fill.classList.toggle('has', inP != null || outP != null);
    rangeLbl.textContent = `${t('Entrada')} ${fmtTime(a, fps)}  ·  ${t('Saída')} ${fmtTime(b, fps)}  ·  ${t('Duração')} ${fmtTime(b - a, fps)}`;
  };
  media.addEventListener('timeupdate', update);
  media.addEventListener('loadedmetadata', () => { media.currentTime = inP ?? 0; update(); drawWave(); });
  const loop = () => { if (!media.paused) { update(); if (outP != null && media.currentTime >= outP) { media.pause(); media.currentTime = outP; } } raf = requestAnimationFrame(loop); };
  let raf = requestAnimationFrame(loop);

  const seekFromEvent = (e) => { const r = bar.getBoundingClientRect(); media.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * dur(); update(); };
  bar.addEventListener('pointerdown', (e) => { seekFromEvent(e); dragHandler(e, seekFromEvent, null, 'ew-resize'); });

  const save = () => { m.srcIn = inP; m.srcOut = outP; store.dirty = true; };
  const markIn = () => { inP = media.currentTime; if (outP != null && outP <= inP) outP = null; save(); update(); };
  const markOut = () => { outP = media.currentTime; if (inP != null && inP >= outP) inP = null; save(); update(); };
  const clear = () => { inP = null; outP = null; save(); update(); };
  const playBtn = el('button', { class: 'play-btn', title: t('Reproduzir/Pausar (Espaço)'), html: icon('play', 18) });
  const toggle = () => { if (media.paused) { if (outP != null && media.currentTime >= outP - 0.02) media.currentTime = inP ?? 0; media.play(); } else media.pause(); };
  media.addEventListener('play', () => (playBtn.innerHTML = icon('pause', 18)));
  media.addEventListener('pause', () => (playBtn.innerHTML = icon('play', 18)));
  playBtn.addEventListener('click', toggle);
  const step = (n) => { media.pause(); media.currentTime = clamp(media.currentTime + n / fps, 0, dur()); update(); };

  // arrastar o trecho para a linha do tempo
  const dragItem = (only, label, ic) => {
    const d = el('div', { class: 'src-drag', draggable: 'true', title: t('Arraste para a linha do tempo'), html: icon(ic, 14) + `<span>${label}</span>` });
    d.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-astur', JSON.stringify({ kind: 'media', id: m.id, in: inP ?? 0, out: outP ?? dur(), only }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    return d;
  };
  const addNow = (only) => { bus.emit('source-add', { media: m, in: inP ?? 0, out: outP ?? dur(), only }); dlg.close(); };

  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'i') { e.preventDefault(); markIn(); }
    else if (k === 'o') { e.preventDefault(); markOut(); }
    else if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -fps : -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? fps : 1); }
    else if (k === 'x' && e.altKey) { e.preventDefault(); clear(); }
    else if (e.key === 'Enter' || k === ',') { e.preventDefault(); addNow(null); }
  };
  document.addEventListener('keydown', onKey);

  const body = el('div', { class: 'src' },
    el('div', { class: 'src-stage' + (isVideo ? '' : ' audio') }, isVideo ? media : el('div', { class: 'src-audio-ph', html: icon('music', 46) }, media)),
    bar,
    el('div', { class: 'src-ctrls' },
      cur,
      el('div', { class: 'grow' }),
      el('button', { class: 'icon-btn', title: t('Marcar entrada (I)'), onclick: markIn }, el('b', {}, '{')),
      el('button', { class: 'icon-btn', title: t('Quadro anterior (←)'), onclick: () => step(-1), html: icon('prev') }),
      playBtn,
      el('button', { class: 'icon-btn', title: t('Próximo quadro (→)'), onclick: () => step(1), html: icon('next') }),
      el('button', { class: 'icon-btn', title: t('Marcar saída (O)'), onclick: markOut }, el('b', {}, '}')),
      el('div', { class: 'grow' }),
      el('button', { class: 'chip-btn', title: 'Alt+X', onclick: clear }, t('Limpar marcas'))),
    el('div', { class: 'src-range-lbl' }, rangeLbl),
    el('div', { class: 'src-actions' },
      isVideo ? dragItem('video', t('Arrastar só vídeo'), 'video') : null,
      dragItem('audio', t('Arrastar só áudio'), 'music'),
      el('div', { class: 'grow' }),
      isVideo ? el('button', { class: 'btn', onclick: () => addNow('video') }, t('Inserir só vídeo')) : null,
      el('button', { class: 'btn', onclick: () => addNow('audio') }, t('Inserir só áudio')),
      el('button', { class: 'btn primary', onclick: () => addNow(null), html: icon('plus', 14) + `<span>${t('Inserir na linha do tempo')}</span>` })),
    el('div', { class: 'muted small' }, t('Atalhos: I = entrada, O = saída, Espaço = reproduzir, Enter = inserir no cursor.')));

  const dlg = modal({
    title: t('Visualizador de origem') + ' — ' + m.name, width: 'min(860px, calc(100vw - 40px))', body, className: 'src-modal',
    onClose: () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); media.pause(); media.removeAttribute('src'); media.load(); },
  });
  setTimeout(drawWave, 50);
}
