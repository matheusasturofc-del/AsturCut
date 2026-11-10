// Edição por texto (como a edição baseada em texto do Premiere): transcreve a fala,
// você apaga palavras no texto e o vídeo é cortado junto
import { store, bus } from './store.js';
import { el, modal, toast, clamp, fmtTime } from './util.js';
import { t, LANG } from './i18n.js';
import { pause } from './player.js';
import { settings } from './settings.js';
import { audioForClip, speechClips, transcribeAudio, stopTranscribe } from './captions.js';
import { groupsFrom, apply as applyCuts } from './silence.js';

const FILLERS = new Set(['é', 'éé', 'ééé', 'ã', 'ãh', 'ãã', 'ah', 'ahn', 'hã', 'hum', 'humm', 'hmm', 'hm', 'mm', 'uh', 'uhm', 'umm', 'eh', 'er', 'erm', 'tipo', 'né', 'eee', 'aaa', 'ehh', 'eeh', 'o sea']);
const norm = (w) => w.toLowerCase().replace(/[.,!?¿¡;:"'()…«»-]/g, '').trim();
const spd = (c) => c.speed || 1;
const toTl = (c, s) => c.start + (s - (c.in || 0)) / spd(c);

function visibleWords(c) {
  const tr = c.transcript;
  if (!tr || !tr.words) return [];
  const a = c.in || 0, b = a + c.duration * spd(c);
  return tr.words.filter((w) => w.s >= a - 0.05 && w.e <= b + 0.05);
}

async function transcribeClip(c, o, setStatus) {
  const audio = await audioForClip(c);
  const words = await transcribeAudio(audio, o, (kind, p, msg) => setStatus(msg));
  c.transcript = { lang: o.lang || '', words: words.filter((w) => w.text && w.text.trim()).map((w) => ({ w: w.text.trim(), s: +((c.in || 0) + w.start * spd(c)).toFixed(3), e: +((c.in || 0) + w.end * spd(c)).toFixed(3) })) };
  store.dirty = true;
}

export function textEditDialog() {
  pause();
  const sel = store.selectedClips();
  const list = speechClips(!!sel.length);
  if (!list.length) { toast(t('Adicione um vídeo ou áudio com fala na linha do tempo'), 'error'); return; }
  const saved = settings.get('captionOpts') || {};
  const o = { lang: saved.lang || ({ pt: 'portuguese', en: 'english', es: 'spanish' }[LANG] || ''), quality: saved.quality || 'precise', pauses: false };
  const cut = new Map(); // clipId -> Set(índice da palavra)
  let anchor = null, dragging = false, dragMode = true;
  const body = el('div', { class: 'te-body' });
  const status = el('div', { class: 'muted small te-status' });
  const info = el('span', { class: 'muted small' });
  const langSel = el('select', { class: 'select sm', onchange: () => { o.lang = langSel.value; } }, [['portuguese', 'Português'], ['english', 'English'], ['spanish', 'Español'], ['', t('Detectar automaticamente')]].map(([v, n]) => el('option', { value: v, selected: v === o.lang }, n)));
  const selected = new Set(); // "clipId:i"
  const keyOf = (c, i) => c.id + ':' + i;

  const render = () => {
    body.innerHTML = '';
    let need = 0;
    for (const c of list) {
      const words = visibleWords(c);
      const head = el('div', { class: 'te-head' }, el('b', {}, c.name || t('Clipe')), el('span', { class: 'muted small' }, ' ' + fmtTime(c.start)));
      const para = el('div', { class: 'te-para' });
      if (!c.transcript) {
        need++;
        para.append(el('span', { class: 'muted small' }, t('Ainda não transcrito.')), ' ', el('button', { class: 'btn sm', onclick: () => run([c]) }, t('Transcrever este clipe')));
      } else if (!words.length) para.append(el('span', { class: 'muted small' }, t('Sem fala neste trecho.')));
      const set = cut.get(c.id) || new Set();
      const all = c.transcript ? c.transcript.words : [];
      words.forEach((w) => {
        const i = all.indexOf(w);
        const k = keyOf(c, i);
        const sp = el('span', { class: 'te-w' + (set.has(i) ? ' cut' : '') + (selected.has(k) ? ' sel' : '') + (FILLERS.has(norm(w.w)) ? ' filler' : ''), title: fmtTime(toTl(c, w.s)) }, w.w + ' ');
        sp.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (e.shiftKey && anchor && anchor.c === c) selectRange(c, anchor.i, i);
          else { if (!e.ctrlKey && !e.metaKey) selected.clear(); selected.has(k) ? selected.delete(k) : selected.add(k); anchor = { c, i }; }
          dragging = true; dragMode = true;
          store.setTime(toTl(c, w.s) + 0.001);
          paint();
        });
        sp.addEventListener('mouseenter', () => { if (dragging && anchor && anchor.c === c) { selectRange(c, anchor.i, i); paint(); } });
        sp.dataset.k = k;
        para.append(sp);
      });
      body.append(el('div', { class: 'te-clip' }, head, para));
    }
    paint();
    transBtn.style.display = need ? '' : 'none';
  };
  const selectRange = (c, a, b) => { selected.clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(keyOf(c, i)); };
  const paint = () => {
    body.querySelectorAll('.te-w').forEach((n) => {
      const [cid, i] = n.dataset.k.split(':');
      n.classList.toggle('sel', selected.has(n.dataset.k));
      n.classList.toggle('cut', !!cut.get(cid)?.has(+i));
    });
    let n = 0, secs = 0;
    for (const c of list) { const s = cut.get(c.id); if (!s) continue; for (const i of s) { const w = c.transcript.words[i]; if (w) { n++; secs += (w.e - w.s) / spd(c); } } }
    info.textContent = n ? t('{n} palavra(s) para cortar (~{s} s)', { n, s: secs.toFixed(1) }) : '';
    applyBtn.disabled = !n && !o.pauses;
  };
  const markSel = (on) => {
    for (const k of selected) { const [cid, i] = k.split(':'); if (!cut.has(cid)) cut.set(cid, new Set()); on ? cut.get(cid).add(+i) : cut.get(cid).delete(+i); }
    selected.clear(); paint();
  };
  const selectFillers = () => {
    let n = 0;
    for (const c of list) for (const w of visibleWords(c)) if (FILLERS.has(norm(w.w))) { const i = c.transcript.words.indexOf(w); if (!cut.has(c.id)) cut.set(c.id, new Set()); cut.get(c.id).add(i); n++; }
    paint();
    toast(n ? t('{n} vício(s) de linguagem marcados para cortar', { n }) : t('Nenhum vício de linguagem encontrado'), n ? 'success' : 'info');
  };
  const run = async (clips) => {
    transBtn.disabled = true;
    try {
      for (let i = 0; i < clips.length; i++) {
        status.textContent = t('Transcrevendo {a} de {b}...', { a: i + 1, b: clips.length });
        await transcribeClip(clips[i], o, (msg) => { status.textContent = `${t('Transcrevendo {a} de {b}...', { a: i + 1, b: clips.length })} ${msg || ''}`.slice(0, 160); });
      }
      status.textContent = t('Pronto! Selecione palavras e aperte Delete para cortar.');
    } catch (e) { console.error(e); status.textContent = t('Erro ao transcrever: {m}', { m: String(e.message || e).slice(0, 140) }); }
    transBtn.disabled = false;
    render();
  };
  const doApply = () => {
    const groups = [], ranges = [];
    for (const c of list) {
      if (!store.clip(c.id)) continue;
      const set = cut.get(c.id) || new Set();
      const words = visibleWords(c);
      const r = [];
      words.forEach((w, k) => {
        const i = c.transcript.words.indexOf(w);
        if (set.has(i)) r.push([toTl(c, w.s) - 0.02, toTl(c, w.e) + 0.02]);
        if (o.pauses && k > 0) {
          const p = words[k - 1];
          const gap = (w.s - p.e) / spd(c);
          if (gap > 1) r.push([toTl(c, p.e) + 0.18, toTl(c, w.s) - 0.18]);
        }
      });
      if (!r.length) continue;
      r.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const x of r) { const last = merged[merged.length - 1]; if (last && x[0] - last[1] < 0.12) last[1] = Math.max(last[1], x[1]); else merged.push([...x]); }
      const lo = c.start, hi = c.start + c.duration;
      const g = groupsFrom([c])[0];
      if (!g) continue;
      groups.push(g); ranges.push(merged.map(([a, b]) => [clamp(a, lo, hi), clamp(b, lo, hi)]).filter(([a, b]) => b - a > 0.03));
    }
    if (!groups.length) { toast(t('Nada para cortar'), 'info'); return false; }
    // de trás para frente na linha do tempo
    const order = groups.map((g, i) => i).sort((a, b) => groups[b].src.start - groups[a].src.start);
    const res = applyCuts(order.map((i) => groups[i]), order.map((i) => ranges[i]), true, 'text-edit');
    toast(t('{n} corte(s) feitos — {s} s removidos', { n: res.count, s: res.removed.toFixed(1) }), 'success', 4000);
  };

  const transBtn = el('button', { class: 'btn sm primary', onclick: () => run(list.filter((c) => !c.transcript)) }, t('Transcrever tudo'));
  const applyBtn = el('button', { class: 'btn primary', onclick: () => { if (doApply() !== false) dlg.close(); } }, t('Aplicar cortes'));
  const pausesCb = el('input', { type: 'checkbox', onchange: () => { o.pauses = pausesCb.checked; paint(); } });
  const tools = el('div', { class: 'te-tools' },
    langSel, transBtn,
    el('button', { class: 'btn sm', title: 'Delete', onclick: () => markSel(true) }, '✂ ' + t('Cortar selecionadas')),
    el('button', { class: 'btn sm', onclick: () => markSel(false) }, t('Manter selecionadas')),
    el('button', { class: 'btn sm', onclick: selectFillers }, t('Marcar vícios (é, ãh, tipo...)')),
    el('label', { class: 'te-check' }, pausesCb, ' ' + t('Cortar pausas maiores que 1 s')));
  const dlg = modal({
    title: t('Editar pelo texto'), width: 820,
    body: el('div', { class: 'dlg te' },
      el('div', { class: 'muted small' }, t('A fala vira texto. Clique numa palavra para ir até ela; arraste ou use Shift para selecionar um trecho e aperte Delete para cortar do vídeo — como editar um documento.')),
      tools, status, body),
    actions: [{ label: t('Cancelar'), onClick: () => stopTranscribe() }],
    onClose: () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mouseup', onUp); },
  });
  const foot = dlg.box.querySelector('.modal-foot');
  if (foot) { foot.prepend(info); foot.append(applyBtn); info.style.marginRight = 'auto'; }
  const onKey = (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); markSel(true); }
  };
  const onUp = () => { dragging = false; };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mouseup', onUp);
  void dragMode; void bus;
  render();
  if (list.every((c) => c.transcript)) status.textContent = t('Selecione palavras e aperte Delete para cortar.');
}
