// Monta a versão Android (Capacitor) em mobile/www a partir da interface do editor (src/renderer).
// Fica leve: as bibliotecas de IA pesadas não vão no APK — são baixadas da internet só se o recurso for usado.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'renderer');
const out = path.join(root, 'mobile', 'www');

fs.rmSync(out, { recursive: true, force: true });
const skip = (rel) => rel === 'vendor' || rel.startsWith('vendor' + path.sep);
(function copy(dir, rel = '') {
  for (const name of fs.readdirSync(dir)) {
    const r = path.join(rel, name);
    if (skip(r) || name.endsWith('.map')) continue;
    const s = path.join(dir, name), d = path.join(out, r);
    if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, r); }
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
})(src);

// único "vendor" que vai no APK: o mp4-muxer (~40 KB) para gerar MP4 no celular
const mux = path.join(root, 'node_modules', 'mp4-muxer', 'build', 'mp4-muxer.mjs');
fs.mkdirSync(path.join(out, 'vendor', 'mp4-muxer'), { recursive: true });
fs.copyFileSync(mux, path.join(out, 'vendor', 'mp4-muxer', 'mp4-muxer.mjs'));

// index.html do celular: viewport, CSP para os downloads de IA e a ponte com o Android
const CDN = 'https://cdn.jsdelivr.net';
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />\n  <meta name="theme-color" content="#141416" />');
html = html.replace("script-src 'self' 'wasm-unsafe-eval';", `script-src 'self' 'wasm-unsafe-eval' ${CDN};`);
html = html.replace(/connect-src ([^"]*)"/, `connect-src $1 ${CDN} https://api.github.com"`);
html = html.replace('<script type="module" src="js/app.js"></script>', '<script src="js/mobile/platform.js"></script>\n  <script type="module" src="js/app.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

let n = 0;
(function count(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) count(p); else n += fs.statSync(p).size; } })(out);
console.log(`[mobile] mobile/www pronto (${(n / 1048576).toFixed(1)} MB)`);
