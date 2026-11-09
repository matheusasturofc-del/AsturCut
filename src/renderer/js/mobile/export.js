// Exportação no celular: H.264 (placa de vídeo do aparelho) + AAC/Opus, juntados em MP4 aqui mesmo (mp4-muxer)
// e salvos na galeria (Filmes/AsturCut). Não precisa de FFmpeg.
import { api } from '../media.js';
import { renderAudioOffline, encodeVideo } from '../fastExport.js';

const SR = 48000;

async function audioCodec() {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const c = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 192000 };
    const s = await AudioEncoder.isConfigSupported(c).catch(() => ({ supported: false }));
    if (s.supported) return { config: c, mux };
  }
  return null;
}

export async function mobileExport(o, ui, tr) {
  const { Muxer, ArrayBufferTarget } = await import(new URL('../../vendor/mp4-muxer/mp4-muxer.mjs', import.meta.url).href);
  const start = o.start || 0, dur = o.duration;
  const ac = typeof AudioEncoder !== 'undefined' ? await audioCodec() : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: o.W, height: o.H, frameRate: o.fps },
    ...(ac ? { audio: { codec: ac.mux, sampleRate: SR, numberOfChannels: 2 } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // 1) áudio: mixa offline e codifica
  ui.setP(0.02, tr('Mixando o áudio...'));
  const audio = await renderAudioOffline(start, dur, (p) => ui.setP(0.02 + p * 0.08));
  if (ui.cancelled()) return null;
  if (ac) {
    let aErr = null;
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { aErr = e; } });
    aenc.configure(ac.config);
    const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const STEP = 4800; // 100 ms
    for (let i = 0; i < audio.length; i += STEP) {
      const n = Math.min(STEP, audio.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0));
    }
    await aenc.flush();
    aenc.close();
    if (aErr) throw aErr;
  }
  ui.setP(0.12);

  // 2) vídeo
  await encodeVideo({ ...o, rate: o.rate || 1.5 }, ui, tr, { format: 'avc', output: (chunk, meta) => muxer.addVideoChunk(chunk, meta) });
  if (ui.cancelled()) return null;

  // 3) monta o MP4 e salva na galeria
  ui.setP(0.93, tr('Salvando na galeria...'));
  muxer.finalize();
  const bytes = new Uint8Array(target.buffer);
  const safe = String(o.name || 'video').replace(/[\\/:*?"<>|]/g, '-');
  return api.saveBytes(safe + '.mp4', 'video/mp4', bytes, (p) => ui.setP(0.93 + p * 0.07, tr('Salvando na galeria... {p}%', { p: Math.round(p * 100) })));
}
