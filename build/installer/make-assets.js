// Gera a arte do instalador (bitmaps 24-bit) em várias escalas de DPI.
// Uso: node build/installer/make-assets.js   (precisa de @napi-rs/canvas; os .bmp gerados ficam no repositório)
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const FONTS = path.join(__dirname, '../../src/renderer/assets/fonts');
GlobalFonts.registerFromPath(`${FONTS}/montserrat-latin-700-normal.woff2`, 'Montserrat');
GlobalFonts.registerFromPath(`${FONTS}/inter-latin-400-normal.woff2`, 'Inter');
GlobalFonts.registerFromPath(`${FONTS}/inter-latin-700-normal.woff2`, 'Inter');

const BG = '#141416', PANEL = '#1e1e21', ACC = '#1ccfdc', VIO = '#5b2bff';
const SCALES = [100, 125, 150, 200];

// BMP 24-bit (bottom-up), fundo já opaco
function toBmp(canvas) {
  const w = canvas.width, h = canvas.height;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o + x * 3] = px[i + 2]; buf[o + x * 3 + 1] = px[i + 1]; buf[o + x * 3 + 2] = px[i];
    }
  }
  return buf;
}

function save(name, w, h, draw) {
  for (const s of SCALES) {
    const k = s / 100;
    const c = createCanvas(Math.round(w * k), Math.round(h * k));
    const x = c.getContext('2d');
    x.scale(k, k);
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    draw(x, w, h);
    fs.writeFileSync(path.join(OUT, `${name}_${s}.bmp`), toBmp(c));
  }
}

(async () => {
  const logo = await loadImage(path.join(__dirname, '../icon.png'));

  // banner do topo (720x210): degradê, brilhos, "timeline" decorativa, logo
  save('banner', 720, 210, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0e3a44'); g.addColorStop(0.55, '#24135c'); g.addColorStop(1, '#3d1fb0');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const orb = (cx, cy, r, c) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H); };
    orb(80, 20, 300, 'rgba(28,207,220,0.55)');
    orb(650, 200, 280, 'rgba(91,43,255,0.6)');
    orb(470, 30, 160, 'rgba(255,59,167,0.18)');
    // clipes decorativos
    const clips = [[390, 52, 120], [520, 52, 70], [430, 92, 170], [610, 92, 80], [380, 132, 90], [480, 132, 140]];
    for (const [cx, cy, cw] of clips) {
      x.fillStyle = 'rgba(255,255,255,0.10)'; x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
      x.beginPath(); x.roundRect(cx, cy, cw, 26, 6); x.fill(); x.stroke();
    }
    x.fillStyle = '#fff'; x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 10;
    x.fillRect(560, 40, 2, 128); x.shadowBlur = 0;
    // fade inferior para o fundo
    const f = x.createLinearGradient(0, H - 50, 0, H); f.addColorStop(0, 'rgba(20,20,22,0)'); f.addColorStop(1, BG);
    x.fillStyle = f; x.fillRect(0, H - 50, W, 50);
    // logo + nome
    x.shadowColor = 'rgba(28,207,220,0.6)'; x.shadowBlur = 24;
    x.drawImage(logo, 40, 62, 72, 72);
    x.shadowBlur = 0;
    x.fillStyle = '#fff'; x.font = '700 40px Montserrat'; x.textBaseline = 'middle';
    x.fillText('AsturCut', 128, 88);
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = '400 15px Inter';
    x.fillText(`Video editor  ·  v${require('../../package.json').version}`, 130, 122);
  });

  // botões de idioma (normal / selecionado)
  const pill = (label, on) => (x, W, H) => {
    x.fillStyle = on ? 'rgba(28,207,220,0.16)' : PANEL;
    x.strokeStyle = on ? ACC : '#2c2c31'; x.lineWidth = on ? 2 : 1.5;
    x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, 10); x.fill(); x.stroke();
    x.fillStyle = on ? '#ffffff' : '#c9c9d0'; x.font = `${on ? 700 : 400} 14px Inter`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, W / 2, H / 2 + 1);
    if (on) { x.fillStyle = ACC; x.beginPath(); x.arc(18, H / 2, 4, 0, Math.PI * 2); x.fill(); }
  };
  for (const [id, label] of [['pt', 'Português'], ['en', 'English'], ['es', 'Español']]) {
    save(`lang_${id}`, 150, 38, pill(label, false));
    save(`lang_${id}_on`, 150, 38, pill(label, true));
  }

  // chave liga/desliga
  const sw = (on) => (x, W, H) => {
    x.fillStyle = on ? ACC : '#3a3a40';
    x.beginPath(); x.roundRect(2, 3, W - 4, H - 6, (H - 6) / 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(on ? W - 2 - (H - 6) / 2 : 2 + (H - 6) / 2, H / 2, (H - 6) / 2 - 3, 0, Math.PI * 2); x.fill();
  };
  save('switch_on', 44, 26, sw(true));
  save('switch_off', 44, 26, sw(false));

  // botão principal "Instalar"
  const btn = (label) => (x, W, H) => {
    x.shadowColor = 'rgba(28,207,220,0.45)'; x.shadowBlur = 14; x.shadowOffsetY = 3;
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, ACC); g.addColorStop(1, '#3fa2ff');
    x.fillStyle = g; x.beginPath(); x.roundRect(8, 6, W - 16, H - 14, 12); x.fill();
    x.shadowColor = 'transparent';
    x.fillStyle = '#06262b'; x.font = '700 17px Inter'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 - 1);
  };
  save('btn_install_pt', 210, 58, btn('Instalar agora'));
  save('btn_install_en', 210, 58, btn('Install now'));
  save('btn_install_es', 210, 58, btn('Instalar ahora'));
  save('btn_open_pt', 210, 58, btn('Abrir o AsturCut'));
  save('btn_open_en', 210, 58, btn('Open AsturCut'));
  save('btn_open_es', 210, 58, btn('Abrir AsturCut'));
  // desinstalador: botão vermelho, botão secundário e "concluir"
  const btnDanger = (label) => (x, W, H) => {
    x.shadowColor = 'rgba(239,68,68,0.4)'; x.shadowBlur = 14; x.shadowOffsetY = 3;
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#ef4444'); g.addColorStop(1, '#f43f7a');
    x.fillStyle = g; x.beginPath(); x.roundRect(8, 6, W - 16, H - 14, 12); x.fill();
    x.shadowColor = 'transparent';
    x.fillStyle = '#ffffff'; x.font = '700 17px Inter'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 - 1);
  };
  const btnGhost = (label) => (x, W, H) => {
    x.fillStyle = PANEL; x.strokeStyle = '#3a3a40'; x.lineWidth = 1.5;
    x.beginPath(); x.roundRect(8, 6, W - 16, H - 14, 12); x.fill(); x.stroke();
    x.fillStyle = '#d6d6dc'; x.font = '600 16px Inter'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 - 1);
  };
  save('btn_uninstall_pt', 210, 58, btnDanger('Desinstalar'));
  save('btn_uninstall_en', 210, 58, btnDanger('Uninstall'));
  save('btn_uninstall_es', 210, 58, btnDanger('Desinstalar'));
  save('btn_cancel_pt', 150, 58, btnGhost('Cancelar'));
  save('btn_cancel_en', 150, 58, btnGhost('Cancel'));
  save('btn_cancel_es', 150, 58, btnGhost('Cancelar'));
  save('btn_done_pt', 210, 58, btn('Concluir'));
  save('btn_done_en', 210, 58, btn('Done'));
  save('btn_done_es', 210, 58, btn('Listo'));
  console.log('ok');
})();
