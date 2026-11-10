import { t } from '../i18n.js';
// STICKERS: emojis e formas vetoriais (grátis)
export const EMOJI_CATS = {
  'Rostos': '😀 😂 🤣 😍 🥰 😎 🤩 😜 🤪 😇 🙃 😉 😱 😭 😡 🤯 🥳 😴 🤔 🤫 🙄 😬 🥶 🥵 🤡 👻 💀 👽 🤖 😈'.split(' '),
  'Gestos': '👍 👎 👏 🙌 🙏 💪 👊 ✌️ 🤞 🤟 🤘 👌 👉 👈 👆 👇 ✋ 🖐️ 👋 🤙 ✍️ 🫶 🫡'.split(' '),
  'Corações': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 💔 ❣️ 💯'.split(' '),
  'Festa': '🎉 🎊 🎈 🎁 🎂 🍾 🥂 🎆 🎇 ✨ 🎵 🎶 🎤 🎧 🎸 🥁 🏆 🥇 🎮 🕹️'.split(' '),
  'Natureza': '🔥 ⭐ 🌟 💫 ⚡ 🌈 ☀️ 🌙 ☁️ ❄️ 💧 🌊 🌸 🌹 🌻 🍀 🌴 🌵 🍁 🌍'.split(' '),
  'Animais': '🐶 🐱 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🐝 🦋 🐢 🐬 🦈'.split(' '),
  'Comida': '🍕 🍔 🍟 🌭 🍿 🍩 🍪 🍫 🍦 🍰 🍓 🍉 🍌 🍎 🥑 🌮 🍣 ☕ 🧃 🍺'.split(' '),
  'Objetos': '📱 💻 📷 🎥 🎬 📺 💡 💰 💎 🔑 🔔 📌 📍 ⏰ 🚀 ✈️ 🚗 🏠 👑 🕶️'.split(' '),
  'Símbolos': '✅ ❌ ⚠️ ❓ ❗ 💬 💭 🔴 🟢 🔵 ⬆️ ⬇️ ➡️ ⬅️ 🔝 🆕 🆗 🆒 ▶️ ⏸️'.split(' '),
  'Mais rostos': '🥹 🤗 🤭 😏 😤 😩 🥺 😳 🫣 🫢 🤠 🥸 🤓 😺 😹 🙈 🙉 🙊 💩 🫠'.split(' '),
  'Internet': '👀 💯 🔥 ✨ 💥 💢 💤 🆙 🔔 📣 💬 👑 🤑 🤝 🎯 🧿 🪄 📸 🔗 🌐'.split(' '),
  'Esportes': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🥊 🏆 🥇 🏅 🎯 🛹 🏄 🚴 🏋️ 🤸 ⛳ 🏁 🎳'.split(' '),
  'Viagem': '✈️ 🚀 🚗 🚕 🚌 🚲 🛵 🚢 🗺️ 🧳 🏖️ 🏝️ 🏔️ 🗽 🗼 🎡 🏰 ⛺ 🌋 🧭'.split(' '),
  'Clima': '☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ 🌪️ 🌫️ 🌈 ☔ 💨 🌡️ 🌙 ⭐'.split(' '),
  'Trabalho': '💼 📈 📉 📊 🗂️ 📝 ✏️ 📚 🎓 💡 🧠 ⚙️ 🔧 🛠️ 💳 🧾 📅 ⏳ ☎️ 📧'.split(' '),
  'Setas': '➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↔️ ↕️ ↩️ ↪️ ⤴️ ⤵️ 🔄 🔃 🔁 🔙 🔜 🔝 ▶️ ◀️ 🔼 🔽 ⏩ ⏪ ⏫ ⏬ 👉 👈 👆 👇 ☝️ 🫵'.split(' '),
};

// setas vetoriais (cor e contorno editáveis, giram com a rotação do clipe)
export const ARROWS = [
  { id: 'arrow', name: 'Seta' },
  { id: 'a-thin', name: 'Seta fina' },
  { id: 'a-thick', name: 'Seta grossa' },
  { id: 'a-double', name: 'Seta dupla' },
  { id: 'a-up', name: 'Seta para cima' },
  { id: 'a-down', name: 'Seta para baixo' },
  { id: 'a-diag', name: 'Seta diagonal' },
  { id: 'a-curve', name: 'Seta curva' },
  { id: 'a-curve2', name: 'Seta curva (baixo)' },
  { id: 'a-uturn', name: 'Seta de retorno' },
  { id: 'a-circle', name: 'Seta circular' },
  { id: 'a-hand', name: 'Seta desenhada à mão' },
  { id: 'a-loop', name: 'Seta com laço' },
  { id: 'a-zigzag', name: 'Seta zigue-zague' },
  { id: 'a-chevron', name: 'Chevron »' },
  { id: 'a-pointer', name: 'Ponteiro' },
  { id: 'a-3d', name: 'Seta 3D' },
  { id: 'a-dashed', name: 'Seta tracejada' },
  { id: 'a-circlebtn', name: 'Seta no círculo' },
  { id: 'a-split', name: 'Seta dividida' },
];
const head = (ctx, x, y, ang, len, color) => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len, -len * 0.62); ctx.lineTo(-len * 0.8, 0); ctx.lineTo(-len, len * 0.62); ctx.closePath(); ctx.fill();
  ctx.restore();
};
function drawArrow(ctx, kind, s, color, stroke, strokeWidth) {
  const lw = Math.max(2, s * 0.07);
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const outline = () => { if (stroke && strokeWidth > 0) { ctx.save(); ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); ctx.restore(); } };
  const shaft = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); };
  switch (kind) {
    case 'a-thin': ctx.lineWidth = lw * 0.6; shaft([[-s * 0.6, 0], [s * 0.45, 0]]); head(ctx, s * 0.62, 0, 0, s * 0.24, color); return { w: s * 1.25, h: s * 0.35 };
    case 'a-thick':
      ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.42); ctx.lineTo(s * 0.62, 0); ctx.lineTo(s * 0.05, s * 0.42); ctx.lineTo(s * 0.05, s * 0.2); ctx.lineTo(-s * 0.6, s * 0.2); ctx.closePath(); ctx.fill(); outline();
      return { w: s * 1.25, h: s * 0.85 };
    case 'a-double':
      ctx.beginPath(); ctx.moveTo(-s * 0.62, 0); ctx.lineTo(-s * 0.25, -s * 0.3); ctx.lineTo(-s * 0.25, -s * 0.12); ctx.lineTo(s * 0.25, -s * 0.12); ctx.lineTo(s * 0.25, -s * 0.3); ctx.lineTo(s * 0.62, 0);
      ctx.lineTo(s * 0.25, s * 0.3); ctx.lineTo(s * 0.25, s * 0.12); ctx.lineTo(-s * 0.25, s * 0.12); ctx.lineTo(-s * 0.25, s * 0.3); ctx.closePath(); ctx.fill(); outline();
      return { w: s * 1.25, h: s * 0.62 };
    case 'a-up': case 'a-down': case 'a-diag': {
      ctx.save(); ctx.rotate(kind === 'a-up' ? -Math.PI / 2 : kind === 'a-down' ? Math.PI / 2 : -Math.PI / 4);
      const r = drawShapeArrow(ctx, s, outline); ctx.restore(); return kind === 'a-diag' ? { w: s, h: s } : { w: r.h, h: r.w };
    }
    case 'a-curve': case 'a-curve2': {
      const sg = kind === 'a-curve' ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.25 * sg); ctx.quadraticCurveTo(-s * 0.05, -s * 0.45 * sg, s * 0.42, -s * 0.02 * sg); ctx.stroke();
      head(ctx, s * 0.55, s * 0.1 * sg, Math.atan2(s * 0.12 * sg, s * 0.13), s * 0.24, color);
      return { w: s * 1.2, h: s * 0.8 };
    }
    case 'a-uturn':
      ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.32); ctx.lineTo(-s * 0.1, s * 0.32); ctx.arc(-s * 0.1, 0, s * 0.32, Math.PI / 2, -Math.PI / 2, false); ctx.lineTo(s * 0.32, -s * 0.32); ctx.stroke();
      head(ctx, s * 0.52, -s * 0.32, 0, s * 0.24, color);
      return { w: s * 1.1, h: s * 0.8 };
    case 'a-circle':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.36, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
      head(ctx, Math.cos(-Math.PI * 0.35) * s * 0.36, Math.sin(-Math.PI * 0.35) * s * 0.36, -Math.PI * 0.35 + Math.PI / 2, s * 0.24, color);
      return { w: s * 0.9, h: s * 0.9 };
    case 'a-hand': {
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(-s * 0.58, s * 0.18);
      ctx.bezierCurveTo(-s * 0.3, s * 0.05, -s * 0.15, s * 0.22, s * 0.05, s * 0.06);
      ctx.bezierCurveTo(s * 0.2, -s * 0.06, s * 0.3, -s * 0.02, s * 0.5, -s * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.12); ctx.lineTo(s * 0.3, -s * 0.24); ctx.moveTo(s * 0.5, -s * 0.12); ctx.lineTo(s * 0.36, s * 0.06); ctx.stroke();
      return { w: s * 1.2, h: s * 0.6 };
    }
    case 'a-loop':
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.2); ctx.bezierCurveTo(-s * 0.1, s * 0.25, -s * 0.05, -s * 0.38, -s * 0.22, -s * 0.3); ctx.bezierCurveTo(-s * 0.38, -s * 0.22, -s * 0.2, s * 0.15, s * 0.15, s * 0.05); ctx.lineTo(s * 0.42, -s * 0.05); ctx.stroke();
      head(ctx, s * 0.58, -s * 0.11, -0.35, s * 0.22, color);
      return { w: s * 1.25, h: s * 0.75 };
    case 'a-zigzag':
      ctx.lineWidth = lw * 0.8;
      shaft([[-s * 0.6, s * 0.15], [-s * 0.3, -s * 0.15], [0, s * 0.15], [s * 0.28, -s * 0.12], [s * 0.42, 0.0]]);
      head(ctx, s * 0.6, s * 0.1, 0.55, s * 0.24, color);
      return { w: s * 1.25, h: s * 0.6 };
    case 'a-chevron':
      ctx.lineWidth = lw * 1.1;
      shaft([[-s * 0.45, -s * 0.3], [-s * 0.1, 0], [-s * 0.45, s * 0.3]]);
      shaft([[s * 0.0, -s * 0.3], [s * 0.35, 0], [s * 0.0, s * 0.3]]);
      return { w: s * 1.0, h: s * 0.7 };
    case 'a-pointer':
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.42); ctx.lineTo(s * 0.32, s * 0.08); ctx.lineTo(s * 0.04, s * 0.12); ctx.lineTo(s * 0.18, s * 0.42); ctx.lineTo(s * 0.06, s * 0.47); ctx.lineTo(-s * 0.08, s * 0.17); ctx.lineTo(-s * 0.3, s * 0.36); ctx.closePath(); ctx.fill(); outline();
      return { w: s * 0.75, h: s * 0.95 };
    case 'a-3d': {
      const dk = 'rgba(0,0,0,.35)';
      ctx.save(); ctx.translate(s * 0.05, s * 0.06); ctx.fillStyle = dk; drawShapeArrow(ctx, s, () => {}); ctx.restore();
      ctx.fillStyle = color; drawShapeArrow(ctx, s, outline);
      return { w: s * 1.3, h: s * 0.75 };
    }
    case 'a-dashed':
      ctx.lineWidth = lw * 0.7; ctx.setLineDash([s * 0.09, s * 0.07]); shaft([[-s * 0.6, 0], [s * 0.42, 0]]); ctx.setLineDash([]);
      head(ctx, s * 0.62, 0, 0, s * 0.24, color);
      return { w: s * 1.25, h: s * 0.35 };
    case 'a-circlebtn':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2); ctx.fill(); outline();
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = lw * 0.8; shaft([[-s * 0.2, 0], [s * 0.1, 0]]); head(ctx, s * 0.24, 0, 0, s * 0.17, '#ffffff');
      return { w: s * 0.9, h: s * 0.9 };
    case 'a-split':
      ctx.lineWidth = lw * 0.7;
      shaft([[-s * 0.6, 0], [-s * 0.1, 0]]);
      ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.quadraticCurveTo(s * 0.1, 0, s * 0.35, -s * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.quadraticCurveTo(s * 0.1, 0, s * 0.35, s * 0.28); ctx.stroke();
      head(ctx, s * 0.48, -s * 0.38, -0.7, s * 0.2, color); head(ctx, s * 0.48, s * 0.38, 0.7, s * 0.2, color);
      return { w: s * 1.2, h: s * 0.9 };
  }
  return null;
}
function drawShapeArrow(ctx, s, outline) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.32); ctx.lineTo(s * 0.6, 0);
  ctx.lineTo(s * 0.15, s * 0.32); ctx.lineTo(s * 0.15, s * 0.12); ctx.lineTo(-s * 0.6, s * 0.12); ctx.closePath(); ctx.fill(); outline();
  return { w: s * 1.2, h: s * 0.64 };
}

export const SHAPES = [
  { id: 'rect', name: 'Retângulo' },
  { id: 'roundrect', name: 'Retângulo arredondado' },
  { id: 'circle', name: 'Círculo' },
  { id: 'triangle', name: 'Triângulo' },
  { id: 'star', name: 'Estrela' },
  { id: 'heart', name: 'Coração' },
  { id: 'arrow', name: 'Seta' },
  { id: 'bubble', name: 'Balão de fala' },
  { id: 'line', name: 'Linha' },
  { id: 'ring', name: 'Anel' },
  { id: 'burst', name: 'Explosão' },
  { id: 'check', name: 'Visto' },
  { id: 'subscribe', name: 'Botão Inscrever-se' },
  { id: 'like', name: 'Botão Curtir' },
  { id: 'progress', name: 'Barra de progresso' },
  { id: 'lowerthird', name: 'Lower third' },
  { id: 'scribble', name: 'Círculo à mão' },
  { id: 'brush', name: 'Sublinhado pincel' },
  { id: 'badgeNew', name: 'Selo NOVO' },
  { id: 'tagSale', name: 'Etiqueta PROMO' },
  { id: 'cloud', name: 'Nuvem' },
  { id: 'thought', name: 'Balão de pensamento' },
  { id: 'speechRect', name: 'Balão quadrado' },
  { id: 'xmark', name: 'X (errado)' },
  { id: 'sparkles', name: 'Brilhos' },
  { id: 'corners', name: 'Moldura de cantos' },
  { id: 'pin', name: 'Marcador de local' },
  { id: 'exclaim', name: 'Exclamação' },
];

// Desenha a forma centrada em (0,0) em uma caixa de tamanho size (px). Retorna {w,h}.
export function drawShape(ctx, kind, size, color = '#ffffff', stroke = null, strokeWidth = 0, extra = {}) {
  const s = size;
  ctx.fillStyle = color;
  ctx.strokeStyle = stroke || color;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const fillStroke = () => { ctx.fill(); if (stroke && strokeWidth > 0) ctx.stroke(); };
  ctx.beginPath();
  if (kind.startsWith('a-')) return drawArrow(ctx, kind, s, color, stroke, strokeWidth) || { w: s, h: s };
  switch (kind) {
    case 'scribble': ctx.lineWidth = s * 0.05; ctx.strokeStyle = color; ctx.ellipse(0, 0, s * 0.58, s * 0.36, -0.08, 0.15, Math.PI * 2.08); ctx.stroke(); ctx.beginPath(); ctx.ellipse(s * 0.02, -s * 0.01, s * 0.55, s * 0.33, -0.12, 0, Math.PI * 1.4); ctx.stroke(); return { w: s * 1.2, h: s * 0.8 };
    case 'brush': { ctx.lineWidth = s * 0.12; ctx.strokeStyle = color; ctx.moveTo(-s * 0.6, s * 0.04); ctx.bezierCurveTo(-s * 0.2, -s * 0.06, s * 0.2, s * 0.08, s * 0.6, -s * 0.03); ctx.stroke(); return { w: s * 1.2, h: s * 0.25 }; }
    case 'badgeNew': case 'tagSale': {
      if (kind === 'badgeNew') { const n = 16; for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n, r = i % 2 ? s * 0.4 : s * 0.48; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); fillStroke(); }
      else { ctx.moveTo(-s * 0.55, -s * 0.22); ctx.lineTo(s * 0.35, -s * 0.22); ctx.lineTo(s * 0.58, 0); ctx.lineTo(s * 0.35, s * 0.22); ctx.lineTo(-s * 0.55, s * 0.22); ctx.closePath(); fillStroke(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(s * 0.36, 0, s * 0.045, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = extra.textColor || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${s * (kind === 'badgeNew' ? 0.2 : 0.18)}px Montserrat, sans-serif`;
      ctx.fillText(extra.title || (kind === 'badgeNew' ? t('NOVO') : t('PROMO')), kind === 'badgeNew' ? 0 : -s * 0.08, s * 0.01);
      return kind === 'badgeNew' ? { w: s, h: s } : { w: s * 1.2, h: s * 0.5 };
    }
    case 'cloud': ctx.arc(-s * 0.28, s * 0.06, s * 0.2, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-s * 0.06, -s * 0.12, s * 0.26, Math.PI, Math.PI * 1.85); ctx.arc(s * 0.26, -s * 0.02, s * 0.22, Math.PI * 1.3, Math.PI * 0.5); ctx.closePath(); fillStroke(); return { w: s * 1.05, h: s * 0.7 };
    case 'thought': ctx.ellipse(0, -s * 0.08, s * 0.5, s * 0.3, 0, 0, Math.PI * 2); fillStroke(); ctx.beginPath(); ctx.arc(-s * 0.3, s * 0.3, s * 0.07, 0, Math.PI * 2); fillStroke(); ctx.beginPath(); ctx.arc(-s * 0.42, s * 0.43, s * 0.04, 0, Math.PI * 2); fillStroke(); return { w: s * 1.05, h: s * 0.95 };
    case 'speechRect': ctx.roundRect(-s * 0.55, -s * 0.35, s * 1.1, s * 0.55, s * 0.06); ctx.moveTo(-s * 0.2, s * 0.2); ctx.lineTo(-s * 0.32, s * 0.42); ctx.lineTo(-s * 0.02, s * 0.2); fillStroke(); return { w: s * 1.15, h: s * 0.85 };
    case 'xmark': ctx.lineWidth = s * 0.16; ctx.strokeStyle = color; ctx.moveTo(-s * 0.32, -s * 0.32); ctx.lineTo(s * 0.32, s * 0.32); ctx.moveTo(s * 0.32, -s * 0.32); ctx.lineTo(-s * 0.32, s * 0.32); ctx.stroke(); return { w: s * 0.85, h: s * 0.85 };
    case 'sparkles': { const st = (x, y, r) => { ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); }; st(0, 0, s * 0.35); st(s * 0.38, -s * 0.28, s * 0.14); st(-s * 0.36, s * 0.3, s * 0.1); ctx.fill(); return { w: s, h: s }; }
    case 'corners': { ctx.lineWidth = s * 0.06; ctx.strokeStyle = color; const w2 = s * 0.6, h2 = s * 0.38, l = s * 0.18; for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x * w2, y * h2 - y * l); ctx.lineTo(x * w2, y * h2); ctx.lineTo(x * w2 - x * l, y * h2); } ctx.stroke(); return { w: s * 1.25, h: s * 0.82 }; }
    case 'pin': ctx.moveTo(0, s * 0.45); ctx.bezierCurveTo(-s * 0.1, s * 0.25, -s * 0.32, s * 0.05, -s * 0.32, -s * 0.12); ctx.arc(0, -s * 0.12, s * 0.32, Math.PI, 0); ctx.bezierCurveTo(s * 0.32, s * 0.05, s * 0.1, s * 0.25, 0, s * 0.45); fillStroke(); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.12, 0, Math.PI * 2); ctx.fill(); return { w: s * 0.7, h: s * 0.95 };
    case 'exclaim': ctx.roundRect(-s * 0.08, -s * 0.45, s * 0.16, s * 0.6, s * 0.08); ctx.arc(0, s * 0.35, s * 0.09, 0, Math.PI * 2); fillStroke(); return { w: s * 0.3, h: s };
    case 'rect': ctx.rect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8); fillStroke(); return { w: s * 1.2, h: s * 0.8 };
    case 'roundrect': ctx.roundRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8, s * 0.12); fillStroke(); return { w: s * 1.2, h: s * 0.8 };
    case 'circle': ctx.arc(0, 0, s / 2, 0, Math.PI * 2); fillStroke(); return { w: s, h: s };
    case 'ring': ctx.lineWidth = s * 0.08; ctx.strokeStyle = color; ctx.arc(0, 0, s / 2 - s * 0.04, 0, Math.PI * 2); ctx.stroke(); return { w: s, h: s };
    case 'triangle': ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); fillStroke(); return { w: s, h: s };
    case 'star': case 'burst': {
      const n = kind === 'star' ? 5 : 12, ri = kind === 'star' ? 0.2 : 0.36;
      for (let i = 0; i < n * 2; i++) {
        const r = (i % 2 ? ri : 0.5) * s;
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); fillStroke(); return { w: s, h: s };
    }
    case 'heart':
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.3, -s * 0.55, 0, -s * 0.22);
      ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.6, -s * 0.05, 0, s * 0.35);
      fillStroke(); return { w: s * 1.1, h: s * 0.9 };
    case 'arrow':
      ctx.moveTo(-s * 0.6, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.12); ctx.lineTo(s * 0.15, -s * 0.32); ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(s * 0.15, s * 0.32); ctx.lineTo(s * 0.15, s * 0.12); ctx.lineTo(-s * 0.6, s * 0.12); ctx.closePath(); fillStroke();
      return { w: s * 1.2, h: s * 0.64 };
    case 'bubble':
      ctx.roundRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.65, s * 0.15);
      ctx.moveTo(-s * 0.25, s * 0.24); ctx.lineTo(-s * 0.35, s * 0.45); ctx.lineTo(-s * 0.05, s * 0.24);
      fillStroke(); return { w: s * 1.2, h: s * 0.85 };
    case 'line': ctx.lineWidth = Math.max(2, s * 0.05); ctx.strokeStyle = color; ctx.moveTo(-s * 0.6, 0); ctx.lineTo(s * 0.6, 0); ctx.stroke(); return { w: s * 1.2, h: s * 0.1 };
    case 'check': ctx.lineWidth = s * 0.14; ctx.strokeStyle = color; ctx.moveTo(-s * 0.38, 0); ctx.lineTo(-s * 0.1, s * 0.28); ctx.lineTo(s * 0.4, -s * 0.3); ctx.stroke(); return { w: s, h: s * 0.8 };
    case 'subscribe': case 'like': {
      const w = s * 1.5, h = s * 0.42;
      ctx.fillStyle = kind === 'subscribe' ? '#e62117' : color;
      ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.25); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${h * 0.42}px Montserrat, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'subscribe' ? t('INSCREVER-SE') : t('👍  CURTIR'), 0, h * 0.03);
      return { w, h };
    }
    case 'progress': {
      const w = s * 2, h = s * 0.12, p = extra.progress ?? 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = color; ctx.roundRect(-w / 2, -h / 2, Math.max(h, w * p), h, h / 2); ctx.fill();
      return { w, h };
    }
    case 'lowerthird': {
      const w = s * 2.2, h = s * 0.5;
      ctx.fillStyle = color; ctx.fillRect(-w / 2, -h / 2, s * 0.06, h);
      ctx.fillStyle = 'rgba(10,10,12,0.85)'; ctx.fillRect(-w / 2 + s * 0.06, -h / 2, w - s * 0.06, h);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${h * 0.34}px Montserrat, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(extra.title || t('Seu Nome'), -w / 2 + s * 0.16, -h * 0.13);
      ctx.fillStyle = color; ctx.font = `500 ${h * 0.22}px Montserrat, sans-serif`;
      ctx.fillText(extra.subtitle || t('Cargo ou descrição'), -w / 2 + s * 0.16, h * 0.22);
      return { w, h };
    }
  }
  return { w: s, h: s };
}
