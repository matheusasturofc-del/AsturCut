// Copia as fontes grátis (Google Fonts via @fontsource, licença OFL/Apache)
// para src/renderer/assets/fonts e gera fonts.css + fonts.json.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'renderer', 'assets', 'fonts');
const pkgDir = path.join(root, 'node_modules', '@fontsource');

const CATEGORY = {
  'bebas-neue': 'Títulos', anton: 'Títulos', oswald: 'Títulos', 'archivo-black': 'Títulos', 'alfa-slab-one': 'Títulos',
  'abril-fatface': 'Títulos', 'titan-one': 'Títulos', teko: 'Títulos', staatliches: 'Títulos', 'barlow-condensed': 'Títulos',
  'russo-one': 'Títulos', 'luckiest-guy': 'Divertidas', bangers: 'Divertidas', fredoka: 'Divertidas', bungee: 'Divertidas',
  creepster: 'Divertidas', 'permanent-marker': 'Manuscritas', pacifico: 'Manuscritas', lobster: 'Manuscritas',
  'dancing-script': 'Manuscritas', caveat: 'Manuscritas', 'shadows-into-light': 'Manuscritas', satisfy: 'Manuscritas',
  'great-vibes': 'Manuscritas', sacramento: 'Manuscritas', orbitron: 'Tech', 'press-start-2p': 'Tech', audiowide: 'Tech',
  'chakra-petch': 'Tech', 'black-ops-one': 'Tech', monoton: 'Tech', righteous: 'Tech', rajdhani: 'Tech',
  'source-code-pro': 'Tech', 'playfair-display': 'Elegantes', merriweather: 'Elegantes', cinzel: 'Elegantes',
};

if (!fs.existsSync(pkgDir)) {
  console.log('[fonts] @fontsource não instalado, pulando.');
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });

const fonts = [];
let css = '/* Gerado por scripts/prepare-fonts.js — fontes grátis (OFL / Apache 2.0) */\n';
for (const id of fs.readdirSync(pkgDir).sort()) {
  const filesDir = path.join(pkgDir, id, 'files');
  if (!fs.existsSync(filesDir)) continue;
  let family = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(pkgDir, id, 'metadata.json'), 'utf8'));
    if (meta.family) family = meta.family;
  } catch {}
  const weights = [];
  for (const w of [400, 700]) {
    const file = `${id}-latin-${w}-normal.woff2`;
    const src = path.join(filesDir, file);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(outDir, file));
    weights.push(w);
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url('./${file}') format('woff2');}\n`;
  }
  if (weights.length) fonts.push({ id, family, weights, category: CATEGORY[id] || 'Clássicas' });
}
fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
fs.writeFileSync(path.join(outDir, 'fonts.json'), JSON.stringify(fonts, null, 1));
console.log(`[fonts] ${fonts.length} fontes preparadas em ${path.relative(root, outDir)}`);
