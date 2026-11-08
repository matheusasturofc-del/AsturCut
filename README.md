# AsturCut — Editor de vídeo para PC

Editor de vídeo para Windows no estilo CapCut / Premiere, com tema escuro e destaque ciano por padrão, instalador `.exe` e tudo personalizável.

![logo](build/icon.png)

## Baixar o instalador

O instalador do Windows é gerado automaticamente pelo GitHub Actions a cada push:

1. Abra a aba **Actions** do repositório e entre na execução mais recente de **"Gerar instalador"**.
2. Em **Artifacts**, baixe **AsturCut-Instalador-Windows** (é um `.zip` com o `AsturCut-Setup-x.y.z.exe` dentro).
3. Execute o instalador. Você pode escolher a pasta de instalação, e ele cria atalhos na Área de Trabalho e no Menu Iniciar.

> Para gerar uma **Release** com o `.exe` anexado, crie uma tag `v1.0.0` (por exemplo) e envie: `git tag v1.0.0 && git push origin v1.0.0`.

O instalador tem visual moderno e escuro: na primeira tela você escolhe o idioma (**Português, English ou Español**), a pasta e se quer atalho na área de trabalho, e clica em **Instalar agora**. No final, o botão **Abrir o AsturCut** já abre o editor. O AsturCut abre no idioma escolhido, e dá para trocar depois na tela inicial ou em *Personalizar → Aparência*.

Como o instalador não é assinado digitalmente, o Windows SmartScreen pode mostrar um aviso. Clique em **Mais informações → Executar assim mesmo**.

## Como atualizar

O AsturCut avisa sozinho quando sai uma versão nova: aparece **"Nova atualização disponível!"** com o botão **Atualizar agora**, que baixa o instalador mais recente. Também dá para verificar em *Menu → Verificar atualizações...*.

Para atualizar, é só abrir o instalador novo. Ele instala por cima e mantém seus projetos, preferências e fontes.

### Publicar uma versão nova (para quem desenvolve)

1. Mude a versão em `package.json` (por exemplo, `1.3.0`).
2. Faça o commit e envie.
3. Crie e envie a tag da versão:

```bash
git tag v1.3.0
```

```bash
git push origin v1.3.0
```

O GitHub Actions gera o instalador e publica uma **Release** com o `.exe`. A partir daí, todos que têm o AsturCut veem o aviso de atualização.

## Recursos

**Tela inicial**
- Botão "Criar projeto" em destaque, com atalhos de proporção (YouTube, Reels/TikTok, Instagram, Feed)
- Começar rápido: abrir projeto, importar mídia, intro animada, slideshow de fotos
- Projetos recentes com miniatura, duração e data, e busca na aba Projetos
- 6 modelos prontos: intro animada, slideshow de fotos, Reels com legenda, abertura de canal, aniversário e citação
- Idiomas: Português, English e Español

**Edição**
- Linha do tempo com várias trilhas (vídeo/camadas e áudio), trilha principal, bloquear, ocultar e silenciar trilhas
- Arrastar e soltar, aparar pelas bordas, dividir (Ctrl+B / S), ferramenta lâmina, excluir à esquerda e à direita (Q/W)
- Encaixe automático (snap), trilha principal magnética, marcadores, zoom com Ctrl+roda
- Desfazer e refazer ilimitados, copiar, colar e duplicar, separar o áudio do vídeo
- Velocidade (0,1x a 10x), volume até 300%, fade in e fade out
- Corte (crop), modos de ajuste (conter, preencher, esticar), 16 modos de mistura
- Proporções 16:9, 9:16, 1:1, 4:3, 4:5, 21:9 e original, com fundo em cor ou desfocado

**Ferramentas profissionais** (inspiradas no fluxo do Premiere)
- Pastas de mídia (bins), ordenação por nome/tipo/duração e modo lista ou grade
- Visualizador de origem: marque Entrada (I) e Saída (O) e insira só o trecho, só o vídeo ou só o áudio
- Rótulos de cor nos clipes (L), exclusão com ripple (Shift+Delete), selecionar e apagar espaços vazios
- Ferramenta "selecionar à frente" (A), vincular/desvincular áudio e vídeo, solo de trilha
- Keyframes em posição, escala, rotação, opacidade e volume, com suavização (ease in/out)
- Velocidade/duração (Ctrl+R) e ganho de áudio em dB (G)
- Mixer de áudio por trilha: equalizador com curva, compressor, limitador, redução de ruído, pan, volume e medidores
- Cor: realces, sombras, brancos e pretos, conta-gotas de balanço de branco, antes/depois e aplicar a toda a mídia
- Copiar e colar atributos (Ctrl+Alt+V), marcas de Entrada/Saída na timeline e exportar só esse intervalo
- Maximizar o painel sob o mouse (tecla `), atalhos totalmente remapeáveis, resolução personalizada e layouts salvos

**Biblioteca grátis**
- **50 fontes** do Google Fonts embutidas, com favoritas. Também dá para importar suas próprias fontes `.ttf`/`.otf`
- **46 efeitos**: VHS, glitch, aberração cromática, filme antigo, neon, duotone, chuva, neve, confete, corações, bokeh, tremor, zoom, flash e outros
- **28 filtros** de cor (Cinema, Teal & Orange, Vintage, Noir, Cyberpunk…) com controle de intensidade
- **27 transições** (dissolver, empurrar, cortina, círculo, relógio, zoom, girar, glitch, pixelizar…)
- **Animações** de entrada, saída e loop (incluindo máquina de escrever para textos)
- **24 modelos de texto** (neon, contorno, quadrinhos, gamer, cinema, legenda…) com contorno, sombra, fundo e brilho
- **Stickers**: mais de 180 emojis e 16 formas (setas, balões, botão Inscrever-se, lower third, barra de progresso…)
- **Áudio**: 6 músicas e 23 efeitos sonoros gerados pelo próprio app, todos livres de direitos autorais
- **Fundos**: cores sólidas, gradientes e padrões
- Painel **Ajuste**: brilho, contraste, exposição, saturação, temperatura, matiz, tonalidade, nitidez, desfoque e vinheta

**Exibidor (prévia)**
- Mova, redimensione e gire os clipes direto no vídeo, com guias de centro
- Grade de composição (regra dos terços), qualidade da prévia, tela cheia

**Personalização** (botão *Personalizar* ou `Ctrl+,`)
- 10 temas prontos e cores livres para destaque, fundo, painéis, bordas e texto. Dá para exportar e importar temas
- Fonte da interface, tamanho da interface (70% a 140%), arredondamento e espaçamento
- Layout: arraste as bordas para redimensionar e arraste o título de um painel (⋮⋮) sobre outro para trocar de lugar. Há 7 layouts prontos (exibidor grande, timeline grande, invertido, modo foco…)
- Preferências do editor: durações padrão, snap, magnetismo, salvamento automático

**Projetos e exportação**
- Projetos salvos em `.astur`, com lista de recentes, salvamento automático e recuperação de projeto não salvo
- Exportação em MP4 (H.264), WebM, MOV, GIF ou somente áudio MP3. Resoluções de 480p a 4K, 24 a 60 fps

## Rodar a partir do código

Requisitos: [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
```

```bash
npm start
```

## Gerar o instalador no seu PC (Windows)

```bash
npm run dist
```

O instalador fica em `dist/AsturCut-Setup-<versão>.exe`.

## Estrutura

```
src/main/        processo principal do Electron (janela, diálogos, protocolo de mídia, FFmpeg)
src/renderer/    interface
  js/store.js        estado do projeto, desfazer/refazer, operações de edição
  js/compositor.js   motor de renderização (prévia e exportação)
  js/timeline.js     linha do tempo
  js/player.js       exibidor e reprodução
  js/inspector.js    painel de propriedades
  js/library.js      biblioteca (mídia, áudio, texto, stickers, efeitos…)
  js/lib/            efeitos, filtros, transições, animações, stickers, textos, sons
  js/settings.js     temas e preferências
  js/layout.js       layout personalizável
scripts/prepare-fonts.js  copia as fontes grátis (roda no npm install)
electron-builder.yml      configuração do instalador (NSIS)
```

## Licenças de terceiros

- Fontes: Google Fonts via Fontsource (SIL Open Font License / Apache 2.0)
- FFmpeg via `ffmpeg-static` (LGPL/GPL)
- Electron (MIT)
