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
};

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
  switch (kind) {
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
      ctx.fillText(kind === 'subscribe' ? 'INSCREVER-SE' : '👍  CURTIR', 0, h * 0.03);
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
      ctx.fillText(extra.title || 'Seu Nome', -w / 2 + s * 0.16, -h * 0.13);
      ctx.fillStyle = color; ctx.font = `500 ${h * 0.22}px Montserrat, sans-serif`;
      ctx.fillText(extra.subtitle || 'Cargo ou descrição', -w / 2 + s * 0.16, h * 0.22);
      return { w, h };
    }
  }
  return { w: s, h: s };
}
