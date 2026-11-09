// Interface de celular: no app Android ou em telas pequenas de toque
import { isMobile } from '../media.js';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width || 9999, screen.height || 9999) < 820;
export const mobileUI = isMobile || (coarse && small) || /[?&]mobile=1/.test(location.search);
