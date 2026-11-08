// Tela "Personalizar": tema, cores, layout, editor e atalhos
import { el, icon, modal, toast, confirmDialog } from './util.js';
import { t, LANG, LANGS } from './i18n.js';
import { ACTIONS, keysFor, setKeys, resetKeys, comboFrom } from './keymap.js';
import { settings, THEMES, DEFAULTS, applyTheme } from './settings.js';
import { LAYOUT_PRESETS, usePreset, applyLayout } from './layout.js';
import { ASPECTS } from './store.js';

export const SHORTCUTS = [
  ['Espaço', 'Reproduzir / pausar'], ['← / →', 'Quadro anterior / próximo'], ['Shift + ← / →', 'Voltar / avançar 1 segundo'],
  ['↑ / ↓', 'Ponto de edição anterior / próximo'], ['Home / End', 'Início / fim'], ['Ctrl + B  ou  S', 'Dividir no cursor'],
  ['Q / W', 'Excluir à esquerda / direita do cursor'], ['Delete', 'Excluir selecionado'], ['Ctrl + Z', 'Desfazer'],
  ['Ctrl + Y / Ctrl + Shift + Z', 'Refazer'], ['Ctrl + C / V', 'Copiar / colar'], ['Ctrl + D', 'Duplicar'],
  ['Ctrl + A', 'Selecionar todos'], ['V / B', 'Ferramenta seleção / lâmina'], ['M', 'Adicionar marcador'], ['T', 'Adicionar texto'],
  ['+ / -', 'Zoom da linha do tempo'], ['Ctrl + roda do mouse', 'Zoom da linha do tempo'], ['Alt + roda (no exibidor)', 'Escala do clipe selecionado'],
  ['Ctrl + I', 'Importar mídia'], ['Ctrl + E', 'Exportar'], ['Ctrl + S', 'Salvar'], ['Ctrl + Shift + S', 'Salvar como'],
  ['Ctrl + O', 'Abrir projeto'], ['Ctrl + N', 'Novo projeto'], ['Ctrl + ,', 'Personalizar'], ['F11', 'Tela cheia'], ['Esc', 'Limpar seleção'],
];

const UI_FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Nunito', 'Rubik', 'Ubuntu', 'Quicksand', 'Open Sans', 'Lato'];

export function openCustomize(startTab = 'theme') {
  let tab = startTab;
  const body = el('div', { class: 'cust' });
  const nav = el('div', { class: 'cust-nav' });
  const pane = el('div', { class: 'cust-pane' });
  body.append(nav, pane);
  const tabs = [['theme', 'Aparência', 'palette'], ['layout', 'Layout', 'layout'], ['editor', 'Editor', 'settings'], ['keys', 'Atalhos', 'keyboard'], ['about', 'Sobre', 'info']];
  const renderNav = () => {
    nav.innerHTML = '';
    for (const [id, name, ic] of tabs) nav.append(el('button', { class: 'cust-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; renderNav(); renderPane(); }, html: icon(ic, 16) + `<span>${name}</span>` }));
  };
  const renderPane = () => {
    pane.innerHTML = '';
    ({ theme: themePane, layout: layoutPane, editor: editorPane, keys: keysPane, about: aboutPane })[tab](pane, renderPane);
  };
  renderNav(); renderPane();
  modal({ title: 'Personalizar o AsturCut', width: 820, body, className: 'cust-modal' });
}

function rowC(label, ctrl, hint) {
  return el('div', { class: 'cust-row' }, el('div', {}, el('div', { class: 'cust-label' }, label), hint ? el('div', { class: 'muted small' }, hint) : null), el('div', { class: 'cust-ctrl' }, ctrl));
}
function colorC(key) {
  const i = el('input', { type: 'color', class: 'color', value: settings.get(key) });
  i.addEventListener('input', () => { settings.set(key, i.value); settings.set('theme', 'custom', true); });
  return i;
}
function rangeC(key, min, max, step = 1, unit = '', after) {
  const v = el('span', { class: 'muted small mono' }, settings.get(key) + unit);
  const r = el('input', { type: 'range', class: 'slider', min, max, step, value: settings.get(key) });
  const paint = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
  paint();
  r.addEventListener('input', () => { v.textContent = r.value + unit; paint(); settings.set(key, +r.value); after && after(); });
  return el('div', { class: 'row gap' }, r, v);
}
function switchC(key, after) {
  const b = el('button', { class: 'switch' + (settings.get(key) ? ' on' : '') }, el('span'));
  b.addEventListener('click', () => { settings.set(key, !settings.get(key)); b.classList.toggle('on', settings.get(key)); after && after(); });
  return b;
}
function selectC(key, opts, after) {
  const s = el('select', { class: 'select' }, opts.map(([v, n]) => el('option', { value: v, selected: String(settings.get(key)) === String(v) }, n)));
  s.addEventListener('change', () => { settings.set(key, isNaN(+s.value) ? s.value : +s.value); after && after(); });
  return s;
}

function themePane(p, rerender) {
  p.append(el('h3', {}, 'Tema'));
  const grid = el('div', { class: 'theme-grid' });
  for (const [id, t] of Object.entries(THEMES)) {
    grid.append(el('button', { class: 'theme-card' + (settings.get('theme') === id ? ' active' : ''), onclick: () => { settings.useTheme(id); rerender(); } },
      el('div', { class: 'theme-prev', style: { background: t.bg } },
        el('div', { style: { background: t.panel } }, el('i', { style: { background: t.accent } })),
        el('div', { style: { background: t.panel2 } }, el('i', { style: { background: t.muted } }))),
      el('span', {}, t.name)));
  }
  p.append(grid);
  p.append(el('h3', {}, 'Cores personalizadas'));
  p.append(
    rowC('Cor de destaque', colorC('accent'), 'Botões, seleção, cursor da timeline'),
    rowC('Fundo', colorC('bg')),
    rowC('Painéis', el('div', { class: 'row gap' }, colorC('panel'), colorC('panel2'), colorC('panel3'))),
    rowC('Bordas', colorC('border')),
    rowC('Texto / texto secundário', el('div', { class: 'row gap' }, colorC('text'), colorC('muted'))),
  );
  p.append(el('h3', {}, 'Interface'));
  const langSel = el('select', { class: 'select no-tr' }, LANGS.map((l) => el('option', { value: l.id, selected: l.id === LANG }, l.name)));
  langSel.addEventListener('change', () => import('./home.js').then((m) => m.changeLanguage(langSel.value, langSel)));
  p.append(
    rowC('Idioma da interface', langSel),
    rowC('Fonte da interface', selectC('uiFont', UI_FONTS.map((f) => [f, f]))),
    rowC('Tamanho da interface', rangeC('uiScale', 70, 140, 5, '%')),
    rowC('Arredondamento', rangeC('radius', 0, 18, 1, 'px')),
    rowC('Espaço entre painéis', rangeC('gap', 0, 14, 1, 'px')),
    rowC('Fundo do exibidor', selectC('playerBg', [['dark', 'Escuro'], ['black', 'Preto'], ['gray', 'Cinza'], ['checker', 'Xadrez (transparência)']])),
  );
  p.append(el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Restaurar aparência', 'Voltar ao tema padrão AsturCut?', 'Restaurar')) { settings.reset(['theme', 'accent', 'bg', 'panel', 'panel2', 'panel3', 'border', 'text', 'muted', 'radius', 'uiScale', 'uiFont', 'gap', 'playerBg']); rerender(); } } }, 'Restaurar padrão'),
    el('button', { class: 'btn', onclick: exportTheme }, 'Exportar tema'), el('button', { class: 'btn', onclick: () => importTheme(rerender) }, 'Importar tema')));
}

function exportTheme() {
  const keys = ['accent', 'bg', 'panel', 'panel2', 'panel3', 'border', 'text', 'muted', 'radius', 'uiFont', 'gap'];
  const data = Object.fromEntries(keys.map((k) => [k, settings.get(k)]));
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'meu-tema.asturtheme.json' });
  document.body.append(a); a.click(); a.remove();
}
function importTheme(rerender) {
  const inp = el('input', { type: 'file', accept: '.json' });
  inp.onchange = async () => {
    try { const d = JSON.parse(await inp.files[0].text()); settings.patch({ ...d, theme: 'custom' }); rerender(); toast('Tema importado', 'success'); } catch { toast('Arquivo de tema inválido', 'error'); }
  };
  inp.click();
}

function layoutPane(p, rerender) {
  p.append(el('h3', {}, 'Layouts prontos'));
  const grid = el('div', { class: 'layout-grid' });
  for (const [id, l] of Object.entries(LAYOUT_PRESETS)) {
    const mini = el('div', { class: 'layout-mini' });
    const top = el('div', { class: 'lm-top', style: { height: (100 - l.timelineHeight / 7) + '%' } });
    for (const pn of l.panelOrder) {
      if ((pn === 'library' && !l.showLibrary) || (pn === 'inspector' && !l.showInspector)) continue;
      top.append(el('div', { class: 'lm-' + pn, style: pn === 'player' ? { flex: 1 } : { width: (pn === 'library' ? l.libWidth : l.inspWidth) / 16 + 'px' } }));
    }
    mini.append(top, el('div', { class: 'lm-tl' }));
    grid.append(el('button', { class: 'layout-card' + (settings.get('layoutPreset') === id ? ' active' : ''), onclick: () => { usePreset(id); rerender(); } }, mini, el('span', {}, l.name)));
  }
  p.append(grid);
  p.append(el('div', { class: 'cust-tip' }, el('span', { html: icon('info', 14) }), el('span', {}, 'Você também pode arrastar as bordas entre os painéis para redimensionar e arrastar o título de um painel (⋮⋮) sobre outro para trocar de lugar.')));
  p.append(el('h3', {}, 'Painéis'));
  p.append(
    rowC('Mostrar biblioteca', switchC('showLibrary', applyLayout)),
    rowC('Mostrar propriedades', switchC('showInspector', applyLayout)),
    rowC('Altura da linha do tempo', rangeC('timelineHeight', 150, 700, 10, 'px', applyLayout)),
    rowC('Largura da biblioteca', rangeC('libWidth', 260, 800, 10, 'px', applyLayout)),
    rowC('Largura das propriedades', rangeC('inspWidth', 260, 700, 10, 'px', applyLayout)),
  );
  p.append(el('h3', {}, 'Linha do tempo'));
  p.append(
    rowC('Altura das trilhas', rangeC('trackHeight', 34, 110, 2, 'px')),
    rowC('Miniaturas nos clipes', switchC('showThumbs')),
    rowC('Forma de onda do áudio', switchC('showWaves')),
  );
}

function editorPane(p) {
  p.append(el('h3', {}, 'Novos projetos'));
  p.append(
    rowC('Proporção padrão', selectC('defaultAspect', Object.keys(ASPECTS).map((a) => [a, a]))),
    rowC('Taxa de quadros padrão', selectC('defaultFps', [[24, '24'], [25, '25'], [30, '30'], [50, '50'], [60, '60']])),
  );
  p.append(el('h3', {}, 'Edição'));
  p.append(
    rowC('Duração padrão de imagens', rangeC('imageDuration', 1, 20, 0.5, 's')),
    rowC('Duração padrão de textos/stickers', rangeC('textDuration', 1, 20, 0.5, 's')),
    rowC('Duração padrão de transições', rangeC('transitionDuration', 0.1, 3, 0.1, 's')),
    rowC('Encaixe automático (snap)', switchC('snapping')),
    rowC('Trilha principal magnética', switchC('magnet'), 'Remove espaços vazios entre clipes da trilha principal'),
  );
  p.append(el('h3', {}, 'Desempenho e salvamento'));
  p.append(
    rowC('Qualidade da prévia', selectC('previewQuality', [[1, 'Máxima'], [0.5, 'Média'], [0.25, 'Baixa (mais rápida)']])),
    rowC('Salvamento automático', selectC('autosave', [[0, 'Desativado'], [1, 'A cada 1 minuto'], [2, 'A cada 2 minutos'], [5, 'A cada 5 minutos'], [10, 'A cada 10 minutos']]), 'Somente para projetos já salvos em arquivo'),
  );
  p.append(el('div', { class: 'btn-row' }, el('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Restaurar tudo', 'Restaurar TODAS as preferências para o padrão?', 'Restaurar', true)) { settings.reset(); applyTheme(); applyLayout(); toast('Preferências restauradas', 'success'); } } }, 'Restaurar todas as preferências')));
  void DEFAULTS;
}

function keysPane(p, rerender) {
  p.append(el('div', { class: 'row gap keys-head' }, el('h3', {}, 'Atalhos do teclado'), el('div', { class: 'grow' }),
    el('button', { class: 'btn sm', onclick: async () => { if (await confirmDialog(t('Restaurar atalhos'), t('Voltar todos os atalhos ao padrão?'), t('Restaurar'))) { resetKeys(); rerender(); } } }, t('Restaurar padrão'))));
  p.append(el('div', { class: 'muted small' }, t('Clique em uma tecla para trocar. Pressione a nova combinação (Esc cancela, Backspace remove).')));
  const tb = el('div', { class: 'keys' });
  for (const [id, label] of ACTIONS) {
    const keys = keysFor(id);
    const chips = el('div', { class: 'key-chips' });
    const draw = () => {
      chips.innerHTML = '';
      for (const k of keysFor(id)) chips.append(el('kbd', { class: 'key-edit', title: t('Clique para trocar'), onclick: (e) => capture(e.currentTarget, k) }, k));
      chips.append(el('button', { class: 'key-add', title: t('Adicionar atalho'), onclick: (e) => capture(e.currentTarget, null) }, '+'));
    };
    const capture = (node, old) => {
      node.textContent = t('Pressione...');
      node.classList.add('capturing');
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { done(); draw(); return; }
        let list = keysFor(id).filter((x) => x !== old);
        if (e.key !== 'Backspace' || !old) {
          const combo = comboFrom(e);
          if (!combo) return;
          list = [...list, combo];
        }
        setKeys(id, list);
        done(); rerender();
      };
      const done = () => document.removeEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
    };
    draw();
    void keys;
    tb.append(el('div', { class: 'key-row' }, el('span', {}, label), chips));
  }
  p.append(tb);
}

function aboutPane(p) {
  p.append(el('div', { class: 'about' },
    el('div', { class: 'about-logo' }, el('img', { src: 'assets/logo.svg', width: 72, height: 72 })),
    el('h2', {}, 'AsturCut'),
    el('div', { class: 'muted', id: 'about-version' }, 'Editor de vídeo para PC'),
    el('p', {}, 'Editor de vídeo completo e gratuito: múltiplas trilhas, textos, stickers, efeitos, filtros, transições, animações, biblioteca de áudio e fontes grátis — tudo personalizável.'),
    window.astur ? el('button', { class: 'btn', onclick: () => import('./updates.js').then((m) => m.checkForUpdates({ manual: true })) }, t('Verificar atualizações...')) : null,
    el('p', { class: 'muted small' }, 'Fontes: Google Fonts (licença OFL/Apache). Áudios da biblioteca gerados por síntese — livres de direitos. Conversão de vídeo com FFmpeg (LGPL/GPL).'),
  ));
  window.astur?.info?.().then((i) => { const v = document.getElementById('about-version'); if (v) v.textContent = t('Versão {v} · {p}', { v: i.version, p: i.platform }); });
}
