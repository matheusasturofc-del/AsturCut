# Vídeo "Conheça o AsturCut" (guia completo, ~16 min)

Vídeo explicativo em 2D com o mascote **Astur**, um boneco de palito grosso com o degradê ciano→roxo do logo. A narração é em português e as telas mostradas são reais.

- `script.js`: roteiro com a narração e o que aparece em cada cena (telas, zoom, destaques, pose do mascote)
- `capture.js`: abre o AsturCut no navegador, monta um projeto de demonstração e captura as telas
- `tts.py`: gera a narração frase por frase com a voz neural pt-BR "Antonio" (via `edge-tts`)
- `render.js`: desenha cada quadro (cenário, mascote com boca sincronizada à voz, telas, legendas), mixa a música do próprio AsturCut e codifica o MP4 com FFmpeg

## Como gerar de novo

1. Sirva `src/renderer` em `http://localhost:8765` e rode `node capture.js`.
2. Instale `edge-tts` (`pip install edge-tts`) e rode `python3 tts.py`.
3. Instale `@napi-rs/canvas` e rode `node render.js`. O resultado é `AsturCut-guia-completo.mp4`.
