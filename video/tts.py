# Gera a narração frase por frase (para sincronizar as legendas) e um timeline.json
import json, re, subprocess, wave, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
scenes = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./script.js')))"], cwd=HERE))
os.makedirs(os.path.join(HERE, 'tts'), exist_ok=True)

from piper import PiperVoice
from piper.config import SynthesisConfig
voice = PiperVoice.load(os.path.join(HERE, 'pt_BR-faber-medium.onnx'))
cfg = SynthesisConfig(length_scale=1.06, noise_scale=0.6, noise_w_scale=0.75)
SR = voice.config.sample_rate

def split(text):
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p for p in parts if p]

out = []
for si, sc in enumerate(scenes):
    sents = []
    for k, s in enumerate(split(sc['text'])):
        path = os.path.join(HERE, 'tts', f'{si:02d}_{k:02d}.wav')
        if not os.path.exists(path):
            with wave.open(path, 'wb') as wf:
                voice.synthesize_wav(s, wf, syn_config=cfg)
        with wave.open(path, 'rb') as wf:
            dur = wf.getnframes() / wf.getframerate()
        sents.append({'text': s, 'file': path, 'dur': dur})
    out.append({'id': sc['id'], 'sentences': sents})
    print(sc['id'], round(sum(x['dur'] for x in sents), 1), 's', flush=True)

json.dump({'sr': SR, 'scenes': out}, open(os.path.join(HERE, 'tts.json'), 'w'), ensure_ascii=False, indent=1)
print('total', round(sum(sum(x['dur'] for x in s['sentences']) for s in out) / 60, 2), 'min')
