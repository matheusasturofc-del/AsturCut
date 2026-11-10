// Worklet: noise gate do mixer
class AsturGate extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1 }]; }
  constructor() { super(); this.env = 0; this.g = 1; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const amount = params.amount[0];
    const thr = 0.004 + amount * 0.05;
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < inp.length; c++) s = Math.max(s, Math.abs(inp[c][i]));
      this.env = s > this.env ? s : this.env * 0.9995;
      const target = this.env < thr ? 1 - amount * 0.9 : 1;
      this.g += (target - this.g) * (target < this.g ? 0.0008 : 0.01);
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
    }
    return true;
  }
}
registerProcessor('astur-gate', AsturGate);
