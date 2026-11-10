// Worklet: mudança de tom (pitch shift) por linha de atraso
class AsturPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4 }]; }
  constructor() { super(); this.size = 4096; this.buf = [new Float32Array(this.size), new Float32Array(this.size)]; this.w = 0; this.ph = 0; this.win = 2048; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const ratio = params.ratio[0];
    const N = out[0].length, S = this.size, W = this.win;
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < out.length; c++) { const src = inp[c] || inp[0]; this.buf[c & 1][this.w] = src ? src[i] : 0; }
      this.ph = (this.ph + (1 - ratio) + W) % W;
      const d1 = this.ph, d2 = (this.ph + W / 2) % W;
      const g1 = Math.sin(Math.PI * d1 / W), g2 = Math.sin(Math.PI * d2 / W);
      for (let c = 0; c < out.length; c++) {
        const b = this.buf[c & 1];
        const rd = (d) => { const p = (this.w - d - 1 + S * 2) % S, i0 = Math.floor(p), f = p - i0; return b[i0] * (1 - f) + b[(i0 + 1) % S] * f; };
        out[c][i] = rd(d1) * g1 * g1 + rd(d2) * g2 * g2;
      }
      this.w = (this.w + 1) % S;
    }
    return true;
  }
}
registerProcessor('astur-pitch', AsturPitch);
