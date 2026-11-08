# Gera a narração frase por frase (para sincronizar as legendas) e um timeline.json
import json, re, subprocess, wave, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
scenes = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./script.js')))"], cwd=HERE))
os.makedirs(os.path.join(HERE, 'tts'), exist_ok=True)

import asyncio, edge_tts
VOICE = 'pt-BR-AntonioNeural'
PROXY = os.environ.get('HTTPS_PROXY')
SR = 24000

async def synth(text, mp3):
    for attempt in range(5):
        try:
            await edge_tts.Communicate(text, VOICE, rate='+4%', proxy=PROXY).save(mp3)
            if os.path.getsize(mp3) > 1000: return
        except Exception as e:
            print('  retry', attempt, e, flush=True)
            await asyncio.sleep(2 + attempt * 2)
    raise RuntimeError('falha TTS: ' + text)

def split(text):
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p for p in parts if p]

out = []
for si, sc in enumerate(scenes):
    sents = []
    for k, s in enumerate(split(sc['text'])):
        path = os.path.join(HERE, 'tts', f"{sc['id']}_{k:02d}.wav")
        if not os.path.exists(path):
            mp3 = path.replace('.wav', '.mp3')
            asyncio.run(synth(s, mp3))
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', path], check=True)
        with wave.open(path, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        sents.append({'text': s, 'file': path, 'dur': dur})
    out.append({'id': sc['id'], 'sentences': sents})
    print(sc['id'], round(sum(x['dur'] for x in sents), 1), 's', flush=True)

json.dump({'sr': SR, 'scenes': out}, open(os.path.join(HERE, 'tts.json'), 'w'), ensure_ascii=False, indent=1)
print('total', round(sum(sum(x['dur'] for x in s['sentences']) for s in out) / 60, 2), 'min')
