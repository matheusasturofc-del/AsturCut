// Tela "Novo projeto": nome, formato, resolução, quadros por segundo, fundo e outras definições
import { ASPECTS } from './store.js';
import { el, icon, modal, clamp } from './util.js';
import { settings } from './settings.js';
import { newProject, defaultName, saveProject } from './projects.js';
import { isDesktop } from './media.js';
import { t } from './i18n.js';

const FORMATS = [
  ['16:9', 'YouTube / TV'], ['9:16', 'Reels · TikTok · Shorts'], ['1:1', 'Instagram'], ['4:5', 'Feed vertical'],
  ['4:3', 'Clássico'], ['21:9', 'Cinema'], ['custom', 'Largura × altura'],
];
const RES = [[720, 'HD 720p'], [1080, 'Full HD 1080p'], [1440, '2K 1440p'], [2160, '4K 2160p']];
const FPS = [[24, '24 fps — cinema'], [25, '25 fps — PAL'], [30, '30 fps — padrão'], [50, '50 fps'], [60, '60 fps — suave (games)']];

// abre a tela e cria o projeto. Retorna true se o projeto foi criado.
export function openNewProjectDialog(preset = {}) {
  return new Promise((resolve) => {
    const st = {
      name: preset.name || defaultName(),
      aspect: preset.aspect || settings.get('defaultAspect') || '16:9',
      res: 1080,
      w: 1920, h: 1080,
      fps: settings.get('defaultFps') || 30,
      background: '#000000',
      bgMode: 'color',
      magnet: !!settings.get('magnet'),
      imageDuration: settings.get('imageDuration') || 5,
      saveNow: false,
      remember: false,
    };
    const dims = () => {
      if (st.aspect === 'custom') return [st.w, st.h];
      const [aw, ah] = ASPECTS[st.aspect];
      const k = st.res / Math.min(aw, ah);
      return [Math.round(aw * k / 2) * 2, Math.round(ah * k / 2) * 2];
    };

    const nameIn = el('input', { class: 'input np-name', value: st.name, maxlength: 80 });
    nameIn.addEventListener('input', () => (st.name = nameIn.value));
    const formatGrid = el('div', { class: 'np-formats' });
    const resRow = el('div', { class: 'np-chips' });
    const customRow = el('div', { class: 'np-custom' });
    const fpsSel = el('select', { class: 'select' }, FPS.map(([v, n]) => el('option', { value: v, selected: v === st.fps }, t(n))));
    fpsSel.addEventListener('change', () => { st.fps = +fpsSel.value; update(); });
    const preview = el('div', { class: 'np-preview' });
    const summary = el('div', { class: 'np-summary' });

    const renderFormats = () => {
      formatGrid.innerHTML = '';
      for (const [a, label] of FORMATS) {
        let shape;
        if (a === 'custom') shape = el('span', { class: 'np-shape custom', html: icon('settings', 16) });
        else { const [aw, ah] = ASPECTS[a]; const k = 34 / Math.max(aw, ah); shape = el('span', { class: 'np-shape', style: { width: aw * k + 'px', height: ah * k + 'px' } }); }
        formatGrid.append(el('button', { class: 'np-format' + (st.aspect === a ? ' on' : ''), onclick: () => { st.aspect = a; renderFormats(); update(); } },
          el('div', { class: 'np-shape-box' }, shape), el('b', {}, a === 'custom' ? t('Personalizado') : a), el('small', {}, t(label))));
      }
    };
    const renderRes = () => {
      resRow.innerHTML = '';
      customRow.innerHTML = '';
      if (st.aspect === 'custom') {
        const wIn = el('input', { type: 'number', class: 'input', min: 16, max: 7680, step: 2, value: st.w });
        const hIn = el('input', { type: 'number', class: 'input', min: 16, max: 7680, step: 2, value: st.h });
        wIn.addEventListener('input', () => { st.w = clamp(Math.round(+wIn.value / 2) * 2 || 16, 16, 7680); update(false); });
        hIn.addEventListener('input', () => { st.h = clamp(Math.round(+hIn.value / 2) * 2 || 16, 16, 7680); update(false); });
        customRow.append(el('label', {}, t('Largura')), wIn, el('span', { class: 'muted' }, '×'), el('label', {}, t('Altura')), hIn, el('span', { class: 'muted' }, 'px'));
        return;
      }
      for (const [r, n] of RES) resRow.append(el('button', { class: 'chip' + (st.res === r ? ' on' : ''), onclick: () => { st.res = r; update(); } }, t(n)));
    };
    const update = (rerenderRes = true) => {
      if (rerenderRes) renderRes();
      const [w, h] = dims();
      const k = Math.min(200 / w, 130 / h);
      preview.innerHTML = '';
      preview.append(el('div', { class: 'np-frame', style: { width: w * k + 'px', height: h * k + 'px', background: st.bgMode === 'blur' ? 'linear-gradient(135deg,#1ccfdc55,#5b2bff55)' : st.background } },
        el('span', {}, `${w} × ${h}`)));
      summary.textContent = `${w} × ${h} · ${st.fps} fps · ${st.aspect === 'custom' ? t('Personalizado') : st.aspect}`;
    };

    const bgColor = el('input', { type: 'color', class: 'color', value: st.background });
    bgColor.addEventListener('input', () => { st.background = bgColor.value; update(false); });
    const bgSeg = el('div', { class: 'segmented' });
    const renderBg = () => {
      bgSeg.innerHTML = '';
      for (const [v, n] of [['color', 'Cor'], ['blur', 'Desfocado']]) bgSeg.append(el('button', { class: st.bgMode === v ? 'on' : '', onclick: () => { st.bgMode = v; renderBg(); update(false); } }, t(n)));
    };
    const sw = (key, label, hint) => {
      const b = el('button', { class: 'switch' + (st[key] ? ' on' : '') }, el('span'));
      b.addEventListener('click', () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); });
      return el('div', { class: 'np-opt' }, el('div', {}, el('div', {}, t(label)), hint ? el('div', { class: 'muted small' }, t(hint)) : null), b);
    };
    const imgDur = el('input', { type: 'number', class: 'input np-num', min: 0.5, max: 60, step: 0.5, value: st.imageDuration });
    imgDur.addEventListener('input', () => (st.imageDuration = clamp(+imgDur.value || 5, 0.5, 60)));

    renderFormats(); renderBg(); update();

    const body = el('div', { class: 'np' },
      el('div', { class: 'np-left' },
        el('div', { class: 'np-section' }, el('label', { class: 'np-label' }, t('Nome do projeto')), nameIn),
        el('div', { class: 'np-section' }, el('label', { class: 'np-label' }, t('Formato do vídeo')), formatGrid),
        el('div', { class: 'np-section' }, el('label', { class: 'np-label' }, t('Resolução')), resRow, customRow),
        el('div', { class: 'np-section np-two' },
          el('div', {}, el('label', { class: 'np-label' }, t('Quadros por segundo')), fpsSel),
          el('div', {}, el('label', { class: 'np-label' }, t('Fundo')), el('div', { class: 'row gap' }, bgSeg, bgColor))),
        el('details', { class: 'np-more' }, el('summary', {}, t('Mais opções')),
          sw('magnet', 'Trilha principal magnética', 'Remove espaços vazios entre clipes da trilha principal'),
          el('div', { class: 'np-opt' }, el('div', {}, el('div', {}, t('Duração padrão de imagens')), el('div', { class: 'muted small' }, t('Em segundos'))), imgDur),
          isDesktop ? sw('saveNow', 'Salvar o projeto agora', 'Escolha a pasta e o arquivo .astur antes de começar') : null,
          sw('remember', 'Usar como padrão nos próximos projetos', null))),
      el('div', { class: 'np-right' },
        el('div', { class: 'np-label' }, t('Prévia')), preview, summary,
        el('div', { class: 'np-tip' }, el('span', { html: icon('info', 14) }), el('span', {}, t('Você pode mudar tudo isso depois no painel Detalhes do projeto.')))));

    let done = false;
    const create = async () => {
      done = true;
      const [w, h] = dims();
      settings.set('imageDuration', st.imageDuration, true);
      settings.set('magnet', st.magnet);
      if (st.remember) { if (st.aspect !== 'custom') settings.set('defaultAspect', st.aspect, true); settings.set('defaultFps', st.fps, true); }
      const ok = await newProject({ name: st.name.trim() || defaultName(), aspect: st.aspect, width: w, height: h, fps: st.fps, background: st.background, bgMode: st.bgMode });
      if (ok && st.saveNow) await saveProject(true);
      resolve(ok);
    };
    const m = modal({
      title: t('Novo projeto'), width: 860, body, className: 'np-modal',
      actions: [{ label: t('Cancelar') }, { label: t('Criar projeto'), primary: true, onClick: () => { create(); } }],
      onClose: () => { if (!done) resolve(false); },
    });
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { create(); m.close(); } });
    setTimeout(() => { nameIn.focus(); nameIn.select(); }, 40);
  });
}
