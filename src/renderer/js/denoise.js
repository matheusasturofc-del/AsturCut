// Reduzir ruído (redução espectral): aprende o "som do fundo" nos trechos mais silenciosos
// e tira esse chiado/zumbido de todo o áudio do clipe. Gera um áudio novo (o original não muda).
import { store, bus } from './store.js';
import { el, modal, toast, clamp } from './util.js';
import { t } from './i18n.js';
import { pause } from './player.js';
import { api, importPaths } from './media.js';
import { decodeMedia, wavFromBuffer } from './fastExport.js';
import { srcOffset } from './keyframes.js';

// FFT complexa in-place (radix-2)
function makeFft(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return (re, im, inv) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = inv ? sin[k * step] : -sin[k * step];
          const a = i + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// processa um canal; strength: 0..1
async function denoiseChannel(x, strength, onP) {
  const N = 2048, H = 512, B = N / 2 + 1;
  const fft = makeFft(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const frames = Math.max(1, Math.ceil((x.length + N) / H));
  const re = new Float64Array(N), im = new Float64Array(N);
  // 1) espectro de magnitude de cada quadro (para achar o perfil de ruído)
  const mags = new Array(frames), energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * H - N / 2;
    for (let i = 0; i < N; i++) { const s = x[o + i] || 0; re[i] = s * win[i]; im[i] = 0; }
    fft(re, im, false);
    const m = new Float32Array(B); let e = 0;
    for (let k = 0; k < B; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k] * m[k]; }
    mags[f] = m; energy[f] = e;
    if (f % 400 === 0) { onP(0.4 * f / frames); await tick(); }
  }
  const order = [...energy.keys()].sort((a, b) => energy[a] - energy[b]);
  const nq = Math.max(3, Math.floor(frames * 0.12));
  const noise = new Float64Array(B);
  for (let q = 0; q < nq; q++) { const m = mags[order[q]]; for (let k = 0; k < B; k++) noise[k] += m[k]; }
  for (let k = 0; k < B; k++) noise[k] = (noise[k] / nq) * (1.3 + strength * 1.7);
  const floor = Math.pow(10, -(8 + strength * 22) / 20);
  // 2) ganho por faixa, suavizado no tempo, e reconstrução (overlap-add)
  const out = new Float32Array(x.length), norm = new Float32Array(x.length);
  const g = new Float64Array(B).fill(1), gs = new Float64Array(B);
  for (let f = 0; f < frames; f++) {
    const o = f * H - N / 2;
    for (let i = 0; i < N; i++) { const s = x[o + i] || 0; re[i] = s * win[i]; im[i] = 0; }
    fft(re, im, false);
    const m = mags[f];
    for (let k = 0; k < B; k++) {
      const target = Math.max(floor, 1 - noise[k] / Math.max(1e-9, m[k]));
      g[k] += (target - g[k]) * (target > g[k] ? 0.7 : 0.25); // abre rápido, fecha devagar
    }
    for (let k = 0; k < B; k++) gs[k] = (g[Math.max(0, k - 1)] + 2 * g[k] + g[Math.min(B - 1, k + 1)]) / 4;
    for (let k = 0; k < B; k++) { re[k] *= gs[k]; im[k] *= gs[k]; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
    fft(re, im, true);
    for (let i = 0; i < N; i++) { const p = o + i; if (p >= 0 && p < out.length) { out[p] += re[i] * win[i]; norm[p] += win[i] * win[i]; } }
    if (f % 400 === 0) { onP(0.4 + 0.6 * f / frames); await tick(); }
  }
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return out;
}

export function denoiseDialog(c = store.primarySelected()) {
  const pick = c && (c.type === 'audio' || c.type === 'video') ? c : null;
  if (!pick) { toast(t('Selecione um vídeo ou áudio com fala'), 'error'); return; }
  if (!api?.saveMedia) { toast(t('Reduzir ruído não está disponível aqui'), 'error'); return; }
  let level = 0.55;
  const chips = el('div', { class: 'chips' }, [[0.3, 'Leve'], [0.55, 'Médio'], [0.85, 'Forte']].map(([v, n]) => { const b = el('button', { class: 'chip' + (v === level ? ' on' : ''), onclick: () => { level = v; chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, t(n)); return b; }));
  modal({
    title: t('Reduzir ruído'), width: 460,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Tira chiado, zumbido de ventilador/ar-condicionado e ruído de fundo da voz. Funciona melhor quando o vídeo tem alguns momentos de silêncio. O arquivo original não é alterado.')),
      el('b', {}, t('Intensidade')), chips),
    actions: [{ label: t('Cancelar') }, { label: t('Reduzir ruído'), primary: true, onClick: () => { runDenoise(pick, level); } }],
  });
}

async function runDenoise(c, strength) {
  pause();
  const group = store.linked(c);
  const src = group.find((x) => x.type === 'audio') || group.find((x) => x.type === 'video' && !x.audioDetached) || c;
  const m = store.media(src.mediaId);
  const bar = el('div', { class: 'progress-fill' });
  const dlg = modal({ title: t('Reduzindo ruído...'), width: 400, className: 'no-close', body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar)), actions: [] });
  try {
    const buf = await decodeMedia(m);
    if (!buf) throw new Error(t('não consegui ler o áudio'));
    const sr = buf.sampleRate;
    const a = Math.floor((src.in || 0) * sr), b = Math.min(buf.length, Math.ceil(((src.in || 0) + srcOffset(src, src.duration)) * sr));
    const chs = buf.numberOfChannels > 1 ? 2 : 1;
    const outBuf = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: 2, sampleRate: sr });
    for (let ch = 0; ch < chs; ch++) {
      const x = buf.getChannelData(ch).subarray(a, b);
      const y = await denoiseChannel(x, strength, (p) => { bar.style.width = Math.round(((ch + p) / chs) * 100) + '%'; });
      outBuf.copyToChannel(y, ch);
      if (chs === 1) outBuf.copyToChannel(y, 1);
    }
    const wav = wavFromBuffer(outBuf);
    const name = (m.name || 'audio').replace(/\.[^.]+$/, '') + ' (' + t('sem ruído') + ').wav';
    const path = await api.saveMedia(name, new Uint8Array(wav));
    const [nm] = await importPaths([path]);
    if (!nm) throw new Error('import');
    nm.name = name;
    store.batch('denoise', () => {
      let target = src;
      if (src.type === 'video') { store.detachAudio(src.id); target = store.linked(src).find((x) => x.type === 'audio' && x !== src) || null; }
      if (!target) return;
      target.mediaId = nm.id; target.in = 0; target.speed = +(srcOffset(src, src.duration) / Math.max(0.01, src.duration)).toFixed(4) || 1;
      if (target.kf) delete target.kf.speed;
    });
    bus.emit('media');
    toast(t('Ruído reduzido! Compare tocando o clipe.'), 'success', 3500);
  } catch (e) { console.error(e); toast(t('Não foi possível reduzir o ruído: {m}', { m: String(e.message || e).slice(0, 120) }), 'error'); }
  finally { dlg.close(); }
}
