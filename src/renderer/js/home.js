// Tela inicial do AsturCut: criar projeto, começar rápido, projetos recentes e modelos prontos
import { store, bus } from './store.js';
import { $, el, icon, contextMenu, fmtShort } from './util.js';
import { settings } from './settings.js';
import { importViaDialog, addBackground, drawBackground, isDesktop, api } from './media.js';
import { addMedia, addText, addShape, addSticker, applyEffect, addAudio } from './actions.js';
import { newProject, openProject, getRecent, removeRecent, getRecovery, recover, clearRecovery } from './projects.js';
import { openCustomize } from './customize.js';
import { t, LANG, LANGS, locale, saveLang } from './i18n.js';
import { toast, confirmDialog } from './util.js';

let page = 'home';
let query = '';

export function isHomeVisible() { return document.body.classList.contains('home-mode'); }

export function showHome(p = 'home') {
  page = p;
  document.body.classList.add('home-mode');
  render();
}
export function hideHome() {
  document.body.classList.remove('home-mode');
  bus.emit('editor-shown');
}

bus.on('enter-editor', hideHome);
bus.on('recent', () => { if (isHomeVisible()) render(); });

// ---------- Modelos prontos ----------
const at = (time) => store.setTime(time);
const TEMPLATES = [
  {
    id: 'intro', name: 'Intro animada', desc: 'Título com gradiente, animação e efeito sonoro', aspect: '16:9',
    preview: (x, W, H) => { drawBackground(x, { kind: 'grad', colors: ['#1ccfdc', '#5b2bff'] }, W, H); txt(x, t('SEU TÍTULO'), W / 2, H * 0.47, `${H * 0.2}px "Bebas Neue"`, '#fff'); txt(x, t('Seu subtítulo aqui'), W / 2, H * 0.64, `500 ${H * 0.07}px Montserrat`, 'rgba(255,255,255,.85)'); sparkles(x, W, H); },
    async build() {
      const bg = addMedia(await addBackground('grad:#1ccfdc:#5b2bff'));
      store.updateClip(bg.id, { effects: [{ id: 'kenburns', intensity: 0.6 }] });
      at(0.2);
      const ti = addText('title');
      store.updateClip(ti.id, { text: { content: t('SEU TÍTULO'), size: 200 }, duration: 4.6, animIn: { id: 'pop', dur: 0.7 }, animOut: { id: 'fade', dur: 0.5 }, transform: { y: -0.04 } });
      at(0.6);
      const sub = addText('default');
      store.updateClip(sub.id, { text: { content: t('Seu subtítulo aqui'), size: 54, bold: false }, duration: 4.2, animIn: { id: 'slideU', dur: 0.8 }, animOut: { id: 'fade', dur: 0.5 }, transform: { y: 0.15 } });
      at(0);
      const fx = applyEffect('sparkle', { asLayer: true });
      if (fx) store.updateClip(fx.id, { duration: 5 });
      await addAudio('whoosh');
    },
  },
  {
    id: 'slideshow', name: 'Slideshow de fotos', desc: 'Escolha suas fotos: transições e música automáticas', aspect: '16:9',
    preview: (x, W, H) => { x.fillStyle = '#15151a'; x.fillRect(0, 0, W, H); const cols = [['#f7971e', '#ffd200'], ['#11998e', '#38ef7d'], ['#ee0979', '#ff6a00']]; cols.forEach((c, i) => { x.save(); x.translate(W * (0.3 + i * 0.2), H * 0.5); x.rotate((i - 1) * 0.12); const w = W * 0.34, h = H * 0.56; x.fillStyle = '#fff'; x.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 18); const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); x.fillStyle = g; x.fillRect(-w / 2, -h / 2, w, h); x.restore(); }); },
    async build() {
      toast(t('Escolha as fotos do slideshow'), 'info');
      const files = (await importViaDialog()) || [];
      const pics = files.filter((m) => m.type === 'image' || m.type === 'video');
      if (!pics.length) return;
      const trans = ['fade', 'pushL', 'zoomIn', 'iris', 'slideOver', 'wipeR'];
      const clips = [];
      for (const m of pics) {
        const c = addMedia(m);
        if (m.type === 'image') store.updateClip(c.id, { duration: 3, effects: [{ id: 'kenburns', intensity: 0.5 }] });
        clips.push(c);
      }
      store.applyMagnet();
      let tt = 0;
      for (const c of store.clipsOn(store.mainTrack().id)) { c.start = tt; tt += c.duration; }
      clips.forEach((c, i) => { if (i > 0) store.updateClip(c.id, { transitionIn: { id: trans[i % trans.length], dur: 0.8 } }); });
      at(0);
      const mus = await addAudio('lofi');
      const total = store.duration();
      if (mus) store.updateClip(mus.id, { duration: Math.min(mus.duration, total), fadeOut: 1.5 });
    },
  },
  {
    id: 'reels', name: 'Reels com legenda', desc: 'Vídeo vertical 9:16 com legenda em destaque', aspect: '9:16',
    preview: (x, W, H) => { x.fillStyle = '#101014'; x.fillRect(0, 0, W, H); const pw = H * 0.86 * 9 / 16, ph = H * 0.86; x.save(); x.translate((W - pw) / 2, H * 0.07); x.beginPath(); x.roundRect(0, 0, pw, ph, 10); x.clip(); drawBackground(x, { kind: 'sunset', colors: [] }, pw, ph); x.font = `800 ${ph * 0.075}px Montserrat`; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(t('LEGENDA EM DESTAQUE').split(' ')[0], pw / 2, ph * 0.8); x.fillStyle = '#ffe600'; x.fillText(t('LEGENDA EM DESTAQUE').split(' ')[0], pw / 2, ph * 0.8); x.restore(); },
    async build() {
      addMedia(await addBackground('sunset:'));
      at(0);
      const c = addText('caption');
      store.updateClip(c.id, { duration: 5, animIn: { id: 'pop', dur: 0.4 } });
      toast(t('Importe seu vídeo e coloque-o na trilha principal'), 'info', 4000);
    },
  },
  {
    id: 'channel', name: 'Abertura de canal', desc: 'Título neon com botão Inscrever-se', aspect: '16:9',
    preview: (x, W, H) => { drawBackground(x, { kind: 'radial', colors: ['#1ccfdc', '#04161a'] }, W, H); x.shadowColor = '#1ccfdc'; x.shadowBlur = 16; txt(x, t('MEU CANAL'), W / 2, H * 0.42, `700 ${H * 0.15}px Audiowide`, '#e6fdff'); x.shadowBlur = 0; x.fillStyle = '#e62117'; x.beginPath(); x.roundRect(W / 2 - W * 0.18, H * 0.6, W * 0.36, H * 0.13, 6); x.fill(); txt(x, t('INSCREVER-SE'), W / 2, H * 0.67, `700 ${H * 0.055}px Montserrat`, '#fff'); },
    async build() {
      addMedia(await addBackground('radial:#1ccfdc:#04161a'));
      at(0.2);
      const ti = addText('neonblue');
      store.updateClip(ti.id, { text: { content: t('MEU CANAL') }, duration: 4.8, animIn: { id: 'zoomIn', dur: 0.8 }, transform: { y: -0.1 } });
      at(1.2);
      const s = addShape('subscribe');
      store.updateClip(s.id, { duration: 3.8, animIn: { id: 'pop', dur: 0.5 }, animLoop: { id: 'pulse', speed: 1 }, transform: { y: 0.22, scale: 0.7 } });
      await addAudio('pop');
    },
  },
  {
    id: 'birthday', name: 'Aniversário', desc: 'Confete, texto festivo e música animada', aspect: '16:9',
    preview: (x, W, H) => { drawBackground(x, { kind: 'grad', colors: ['#8e2de2', '#ee0979'] }, W, H); const cs = ['#ffd166', '#06d6a0', '#118ab2', '#fff']; for (let i = 0; i < 40; i++) { x.fillStyle = cs[i % 4]; x.fillRect((i * 97) % W, (i * 53) % H, 5, 3); } x.fillStyle = '#ff2d87'; x.beginPath(); x.roundRect(W * 0.17, H * 0.38, W * 0.66, H * 0.24, 20); x.fill(); txt(x, t('Feliz aniversário!'), W / 2, H * 0.5, `700 ${H * 0.1}px Fredoka`, '#fff'); },
    async build() {
      const bg = addMedia(await addBackground('grad:#8e2de2:#4a00e0'));
      store.updateClip(bg.id, { duration: 6 });
      at(0.3);
      const ti = addText('pinkbox');
      store.updateClip(ti.id, { text: { content: t('Feliz aniversário!') }, duration: 5.7, animIn: { id: 'elastic', dur: 0.9 }, animLoop: { id: 'float', speed: 1 } });
      at(0.8);
      const s1 = addSticker('🎂'); store.updateClip(s1.id, { duration: 5.2, transform: { x: -0.33, y: 0.25, scale: 0.8 }, animIn: { id: 'drop', dur: 0.8 } });
      const s2 = addSticker('🎉'); store.updateClip(s2.id, { duration: 5.2, transform: { x: 0.33, y: -0.25, scale: 0.8 }, animIn: { id: 'pop', dur: 0.6 }, animLoop: { id: 'wiggle', speed: 1 } });
      at(0);
      const fx = applyEffect('confetti', { asLayer: true });
      if (fx) store.updateClip(fx.id, { duration: 6 });
      const mus = await addAudio('upbeat');
      if (mus) store.updateClip(mus.id, { duration: 6, fadeOut: 1 });
    },
  },
  {
    id: 'quote', name: 'Citação', desc: 'Frase elegante sobre fundo escuro', aspect: '16:9',
    preview: (x, W, H) => { drawBackground(x, { kind: 'grad', colors: ['#0f2027', '#2c5364'] }, W, H); const lines = t('"A criatividade é a inteligência\nse divertindo."').split('\n'); lines.forEach((l, i) => txt(x, l, W / 2, H * (0.45 + i * 0.13), `italic 700 ${H * 0.085}px "Playfair Display"`, '#f4f1ea')); },
    async build() {
      const bg = addMedia(await addBackground('grad:#0f2027:#2c5364'));
      store.updateClip(bg.id, { duration: 6, effects: [{ id: 'grain', intensity: 0.3 }, { id: 'kenburns', intensity: 0.4 }] });
      at(0.4);
      const ti = addText('elegant');
      store.updateClip(ti.id, { text: { content: t('"A criatividade é a inteligência\nse divertindo."'), size: 88 }, duration: 5.4, animIn: { id: 'blurIn', dur: 1.2 }, animOut: { id: 'fade', dur: 0.8 } });
      at(0);
      const mus = await addAudio('ambient');
      if (mus) store.updateClip(mus.id, { duration: 6, fadeIn: 1, fadeOut: 1.5 });
    },
  },
];

function txt(x, s, cx, cy, font, color) { x.font = font; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, cx, cy); }
function sparkles(x, W, H) { x.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 14; i++) { const px = (i * 131) % W, py = (i * 71) % H, s = 2 + (i % 3); x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill(); } }

async function useTemplate(tp) {
  const ok = await newProject({ name: t(tp.name), aspect: tp.aspect });
  if (!ok) return;
  try { await tp.build(); } catch (e) { console.error(e); }
  store.setTime(0);
  store.clearSelection();
  bus.emit('fit-timeline');
}

// ---------- Renderização ----------
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? t('Bom dia') : h < 18 ? t('Boa tarde') : t('Boa noite');
}

function relDate(d) {
  const day = 86400000;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (d >= start.getTime()) return t('Hoje') + ' · ' + new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (d >= start.getTime() - day) return t('Ontem');
  return new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function render() {
  const view = $('#home-view');
  view.innerHTML = '';
  view.append(sidebar(), el('div', { class: 'home-main' }, el('div', { class: 'home-inner' }, ...(page === 'projects' ? projectsPage() : page === 'templates' ? templatesPage() : homePage()))));
}

function sidebar() {
  const nav = (id, ic, label) => el('button', { class: 'hs-item' + (page === id ? ' active' : ''), onclick: () => showHome(id), html: icon(ic, 17) + `<span>${label}</span>` });
  const langSel = el('select', { class: 'hs-lang no-tr', title: t('Idioma') }, LANGS.map((l) => el('option', { value: l.id, selected: l.id === LANG }, l.name)));
  langSel.addEventListener('change', () => changeLanguage(langSel.value, langSel));
  return el('aside', { class: 'home-side' },
    el('div', { class: 'hs-brand' }, el('img', { src: 'assets/logo.svg', width: 30, height: 30 }), el('div', {}, el('b', {}, 'AsturCut'), el('span', {}, t('Editor de vídeo')))),
    el('nav', { class: 'hs-nav' }, nav('home', 'home', t('Início')), nav('projects', 'folder', t('Projetos')), nav('templates', 'sparkle', t('Modelos'))),
    el('div', { class: 'grow' }),
    store.p.clips.length ? el('button', { class: 'hs-continue', onclick: hideHome },
      el('span', { class: 'hs-dot' }), el('div', {}, el('small', {}, t('Continuar editando')), el('b', { class: 'no-tr' }, store.p.name))) : null,
    el('div', { class: 'hs-bottom' },
      el('label', { class: 'hs-lang-wrap', html: icon('globe', 16) }, langSel),
      el('button', { class: 'hs-item', onclick: () => openCustomize('theme'), html: icon('palette', 17) + `<span>${t('Personalizar')}</span>` })),
  );
}

export async function changeLanguage(id, selectEl) {
  if (id === LANG) return;
  if (store.dirty && store.p.clips.length) {
    toast(t('Salve o projeto antes de trocar o idioma.'), 'error', 3500);
    if (selectEl) selectEl.value = LANG;
    return;
  }
  saveLang(id);
  location.reload();
}

function hero() {
  const chips = [['16:9', 'YouTube'], ['9:16', 'Reels · TikTok'], ['1:1', 'Instagram'], ['4:5', 'Feed']];
  const box = el('div', { class: 'hero' },
    el('div', { class: 'hero-deco', html: '<i></i><i></i><i></i><i></i><i></i><span></span>' }),
    el('button', { class: 'hero-main', onclick: () => newProject() },
      el('span', { class: 'hero-plus', html: icon('plus', 26) }),
      el('div', {}, el('div', { class: 'hero-title' }, t('Criar projeto')), el('div', { class: 'hero-sub' }, t('Comece um novo vídeo do zero')))),
    el('div', { class: 'hero-chips' }, chips.map(([a, n]) => el('button', { class: 'hero-chip', onclick: () => newProject({ aspect: a }) }, el('span', { class: 'ar ar-' + a.replace(':', '-') }), el('b', {}, a), el('small', {}, n)))),
  );
  return box;
}

function quickCard(ic, title, desc, fn, accent) {
  return el('button', { class: 'quick' + (accent ? ' accent' : ''), onclick: fn },
    el('span', { class: 'quick-ic', html: icon(ic, 20) }),
    el('div', {}, el('b', {}, title), el('small', {}, desc)));
}

function homePage() {
  const rec = getRecovery();
  const recent = isDesktop ? getRecent() : [];
  return [
    el('div', { class: 'home-hello' }, el('span', {}, greeting() + ' 👋'), el('h1', {}, t('O que vamos criar hoje?'))),
    hero(),
    rec ? el('div', { class: 'home-recovery' }, el('span', { html: icon('info', 15) }),
      el('span', { class: 'grow' }, t('Projeto não salvo encontrado: "{name}"', { name: rec.data?.name || '' })),
      el('button', { class: 'btn sm primary', onclick: () => recover(rec) }, t('Recuperar')),
      el('button', { class: 'btn sm', onclick: () => { clearRecovery(); render(); } }, t('Descartar'))) : null,
    el('div', { class: 'home-section' }, el('h2', {}, t('Começar rápido'))),
    el('div', { class: 'quick-row' },
      quickCard('folder', t('Abrir projeto'), t('Abra um arquivo .astur'), () => openProject()),
      quickCard('import', t('Importar mídia'), t('Comece pelos seus vídeos e fotos'), async () => { if (await newProject()) importViaDialog(); }),
      quickCard('sparkle', t('Intro animada'), t('Título com gradiente, animação e efeito sonoro'), () => useTemplate(TEMPLATES[0])),
      quickCard('image', t('Slideshow de fotos'), t('Escolha suas fotos: transições e música automáticas'), () => useTemplate(TEMPLATES[1])),
    ),
    el('div', { class: 'home-section' }, el('h2', {}, t('Projetos recentes')), recent.length > 4 ? el('button', { class: 'link-btn', onclick: () => showHome('projects') }, t('Ver todos') + ' →') : null),
    projectGrid(recent.slice(0, 8)),
  ];
}

function projectsPage() {
  const all = isDesktop ? getRecent() : [];
  const list = all.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()));
  const search = el('input', { class: 'input', placeholder: t('Buscar projetos...'), value: query });
  search.addEventListener('input', () => { query = search.value; const grid = $('.home-inner .proj-grid, .home-inner .proj-empty'); grid?.replaceWith(projectGrid(all.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase())), true)); });
  return [
    el('div', { class: 'page-head' }, el('h1', {}, t('Projetos')), el('div', { class: 'grow' }),
      el('div', { class: 'home-search', html: icon('search', 14) }, search),
      el('button', { class: 'btn', onclick: () => openProject(), html: icon('folder', 14) + `<span>${t('Abrir projeto')}</span>` }),
      el('button', { class: 'btn primary', onclick: () => newProject(), html: icon('plus', 14) + `<span>${t('Criar projeto')}</span>` })),
    projectGrid(list, !!query),
  ];
}

function projectGrid(list, searching = false) {
  if (!list.length) {
    return el('div', { class: 'proj-empty' },
      el('div', { class: 'proj-empty-ic', html: icon('video', 30) }),
      el('b', {}, searching ? t('Nenhum projeto encontrado.') : t('Seus projetos aparecerão aqui')),
      !searching ? el('span', { class: 'muted' }, isDesktop ? t('Crie um projeto e salve para vê-lo nesta lista.') : t('No navegador os projetos são baixados como arquivo .astur.')) : null);
  }
  const grid = el('div', { class: 'proj-grid' });
  for (const r of list) {
    const vertical = r.h && r.w && r.h > r.w;
    const more = el('button', { class: 'proj-more', title: '⋯', html: '⋯' });
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      contextMenu(e.clientX, e.clientY, [
        { label: t('Abrir'), onClick: () => openProject(r.path) },
        isDesktop ? { label: t('Mostrar na pasta'), onClick: () => api.showItem(r.path) } : null,
        '-',
        { label: t('Remover da lista'), onClick: () => removeRecent(r.path) },
      ]);
    });
    const card = el('div', { class: 'proj', title: r.path, onclick: () => openProject(r.path) },
      el('div', { class: 'proj-thumb' + (vertical ? ' vertical' : '') },
        r.thumb ? el('img', { src: r.thumb, draggable: 'false' }) : el('span', { class: 'proj-ph', html: icon('video', 26) }),
        r.duration ? el('span', { class: 'proj-dur' }, fmtShort(r.duration)) : null,
        r.aspect ? el('span', { class: 'proj-ar' }, r.aspect === 'original' ? t('Original') : r.aspect) : null,
        more),
      el('div', { class: 'proj-name no-tr' }, r.name),
      el('div', { class: 'proj-date' }, relDate(r.date)));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); more.click(); });
    grid.append(card);
  }
  return grid;
}

function templatesPage() {
  const grid = el('div', { class: 'tpl-grid' });
  for (const tp of TEMPLATES) {
    const c = el('canvas', { width: 480, height: 270 });
    const fonts = ['700 40px "Bebas Neue"', '500 20px Montserrat', '800 20px Montserrat', '700 40px Audiowide', '700 40px Fredoka', 'italic 700 40px "Playfair Display"'];
    Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => {}))).then(() => { const x = c.getContext('2d'); x.clearRect(0, 0, 480, 270); tp.preview(x, 480, 270); });
    grid.append(el('div', { class: 'tpl', onclick: () => useTemplate(tp) },
      el('div', { class: 'tpl-thumb' }, c, el('span', { class: 'tpl-ar' }, tp.aspect), el('span', { class: 'tpl-use' }, t('Usar modelo'))),
      el('b', {}, t(tp.name)), el('small', {}, t(tp.desc))));
  }
  return [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, t('Modelos prontos')), el('div', { class: 'muted' }, t('Comece com uma base pronta e edite do seu jeito.')))),
    grid,
  ];
}

void settings; void confirmDialog; void TEMPLATES;
