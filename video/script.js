// Roteiro do vídeo "Conheça o AsturCut" — narração + visuais de cada cena
// kind: title | shot | image | list | outro
// focus: [{ at: 0..1 (fração da cena), box: 'nome' (de meta.json) ou null para tela inteira, zoom }]
module.exports = [
  {
    id: 'intro', kind: 'title', pose: 'wave', title: 'AsturCut', subtitle: 'O guia completo do seu editor de vídeo',
    text: 'Oi! Eu sou o Astur, o mascote do AsturCut. Neste vídeo eu vou te mostrar, do começo ao fim, tudo o que o AsturCut sabe fazer. Você vai aprender a instalar, a criar o seu primeiro projeto, a cortar e organizar os clipes, a colocar textos, efeitos, transições e música, a deixar o áudio e as cores com cara de profissional, e no final, a exportar o seu vídeo pronto. Pega um café, porque a gente vai editar junto!',
  },
  {
    id: 'what', kind: 'list', pose: 'talk', title: 'O que é o AsturCut?',
    items: ['Editor de vídeo para PC, grátis', 'Linha do tempo com várias trilhas', 'Biblioteca de efeitos, fontes e músicas', 'Tudo personalizável', 'Português, English e Español'],
    text: 'O AsturCut é um editor de vídeo para computador, gratuito, inspirado nos editores profissionais. Ele tem uma linha do tempo com várias trilhas, uma biblioteca cheia de efeitos, filtros, transições, fontes e músicas grátis, e o melhor de tudo: dá para personalizar praticamente tudo, das cores ao lugar de cada painel. E ele fala três idiomas: português, inglês e espanhol.',
  },
  {
    id: 'install', kind: 'image', image: 'wine-dd.png', pose: 'point', title: 'Instalação',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.35, box: [436, 362, 210, 64], zoom: 2.2 }],
    text: 'Para instalar, é só abrir o instalador do AsturCut. A primeira coisa que ele pergunta é o idioma. Você pode escolher entre português brasileiro, inglês ou espanhol. O idioma que você escolher aqui vai ser usado no instalador e também no próprio AsturCut quando ele abrir.',
  },
  {
    id: 'install2', kind: 'image', image: 'wine-3.png', pose: 'talk', title: 'Instalação',
    focus: [{ at: 0, box: null, zoom: 1 }],
    text: 'Depois disso, é só seguir as telas: aceitar a licença, escolher se o programa é só para você ou para todos os usuários, e escolher a pasta. O instalador cria atalhos na área de trabalho e no menu iniciar. Uma dica: como o instalador não tem assinatura digital, o Windows pode mostrar um aviso. Nesse caso, clique em mais informações e depois em executar assim mesmo.',
  },
  {
    id: 'home', kind: 'shot', shot: 'home', pose: 'point', title: 'Tela inicial',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.18, box: 'hero', zoom: 1.4 }, { at: 0.45, box: 'chips', zoom: 2.2 }, { at: 0.68, box: 'quick', zoom: 1.5 }, { at: 0.88, box: 'side', zoom: 1.6 }],
    text: 'Quando você abre o AsturCut, aparece a tela inicial. Ela foi feita para ser simples e direta. Aqui em cima tem o grande botão criar projeto. Ao lado dele, você pode criar já no formato certo: dezesseis por nove para o YouTube, nove por dezesseis para Reels e TikTok, quadrado para o Instagram, ou quatro por cinco para o feed. Logo abaixo, no começar rápido, você abre um projeto salvo, importa mídias, ou usa um modelo pronto. E na lateral fica o menu, a escolha do idioma e o botão personalizar.',
  },
  {
    id: 'templates', kind: 'shot', shot: 'templates', pose: 'cheer', title: 'Modelos prontos',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.3, box: 'first', zoom: 2 }, { at: 0.55, box: 'slideshow', zoom: 2 }, { at: 0.8, box: 'grid', zoom: 1.2 }],
    text: 'Na aba modelos você encontra bases prontas para começar mais rápido. Tem intro animada, com título, brilhos e efeito sonoro. Tem o slideshow de fotos: você escolhe as fotos e o AsturCut monta tudo sozinho, com transições, zoom suave e música. E também tem reels com legenda, abertura de canal com botão inscrever-se, aniversário com confete e citação. Depois é só editar do seu jeito.',
  },
  {
    id: 'interface', kind: 'shot', shot: 'editor-empty', pose: 'point', title: 'Conhecendo o editor',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.16, box: 'library', zoom: 1.5 }, { at: 0.38, box: 'player', zoom: 1.5 }, { at: 0.58, box: 'inspector', zoom: 1.6 }, { at: 0.76, box: 'timeline', zoom: 1.3 }, { at: 0.92, box: 'export', zoom: 3 }],
    text: 'Agora vamos conhecer o editor. Ele tem quatro áreas principais. À esquerda fica a biblioteca, com as abas de mídia, áudio, texto, stickers, efeitos, transições, filtros, animações e fontes. No meio fica o reprodutor, onde você assiste ao vídeo e mexe nos elementos direto na tela. À direita fica o painel de propriedades, que muda de acordo com o que você selecionar. E embaixo fica a linha do tempo, onde a edição acontece de verdade. Lá em cima, à direita, ficam os botões de salvar e de exportar.',
  },
  {
    id: 'import', kind: 'shot', shot: 'media', pose: 'talk', title: 'Importar e organizar',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.2, box: 'library', zoom: 1.3 }, { at: 0.45, box: 'bins', zoom: 2.2 }, { at: 0.75, box: 'views', zoom: 2.4 }],
    text: 'Para trazer seus vídeos, fotos e músicas, clique em importar, ou simplesmente arraste os arquivos para dentro do AsturCut. Uma dica de profissional: organize tudo antes de começar. Você pode criar pastas, por exemplo uma para a gravação principal, outra para as imagens de apoio, as famosas b-roll, e outra para o áudio. Também dá para ordenar por nome, tipo ou duração, e alternar entre ver em grade ou em lista.',
  },
  {
    id: 'source', kind: 'shot', shot: 'source', pose: 'point', title: 'Visualizador de origem',
    focus: [{ at: 0, box: 'modal', zoom: 1.15 }, { at: 0.3, box: 'bar', zoom: 1.8 }, { at: 0.55, box: 'marks', zoom: 1.8 }, { at: 0.8, box: 'drags', zoom: 2.4 }],
    text: 'Quando um vídeo é longo e você só quer um pedacinho dele, use o visualizador de origem. Assista ao clipe, aperte a tecla I para marcar a entrada, e a tecla O para marcar a saída. A parte escolhida fica destacada. Depois você insere só esse trecho na linha do tempo. E tem mais: dá para levar só o vídeo, sem o som, ou só o áudio, sem a imagem. Isso é perfeito para imagens de apoio.',
  },
  {
    id: 'timeline', kind: 'shot', shot: 'timeline', pose: 'point', title: 'A linha do tempo',
    focus: [{ at: 0, box: 'timeline', zoom: 1.2 }, { at: 0.22, box: 'clips', zoom: 1.5 }, { at: 0.45, box: 'toolbar', zoom: 2.4 }, { at: 0.7, box: 'heads', zoom: 3 }, { at: 0.86, box: 'zoom', zoom: 3 }],
    text: 'Esta é a linha do tempo. Cada faixa é uma trilha. A trilha principal guarda a sua gravação, as camadas de cima recebem textos, imagens e efeitos, e as trilhas de baixo recebem músicas e sons. Você arrasta os clipes para mudar de lugar e puxa as bordas para cortar o começo ou o fim. Os clipes se encaixam sozinhos uns nos outros, graças ao encaixe automático. Do lado de cada trilha dá para bloquear, esconder, silenciar ou deixar em solo. E para dar zoom, use a barra, as teclas mais e menos, ou control com a rodinha do mouse.',
  },
  {
    id: 'cutting', kind: 'shot', shot: 'timeline', pose: 'think', title: 'Cortar rápido como profissional',
    focus: [{ at: 0, box: 'toolbar', zoom: 2.2 }, { at: 0.25, box: 'split', zoom: 4 }, { at: 0.5, box: 'ripple', zoom: 4 }, { at: 0.75, box: 'forward', zoom: 4 }],
    text: 'Agora os atalhos que mais aceleram a edição. Coloque o cursor onde quer cortar e aperte S para dividir o clipe. A tecla Q apaga tudo à esquerda do cursor até o último corte e já puxa o resto para perto, e a tecla W faz o mesmo para a direita. Shift com delete apaga o clipe e fecha o buraco automaticamente, o famoso ripple. Se sobrou um espaço vazio, clique nele e aperte delete. E a ferramenta selecionar à frente, na tecla A, seleciona tudo que vem depois do clique, para você abrir espaço no vídeo de uma vez.',
  },
  {
    id: 'labels', kind: 'shot', shot: 'clipmenu', pose: 'talk', title: 'Rótulos de cor',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.25, box: 'menu', zoom: 1.8 }, { at: 0.55, box: 'sub', zoom: 2.4 }, { at: 0.8, box: 'clips', zoom: 1.4 }],
    text: 'Quando o vídeo fica grande, é fácil se perder. Por isso o AsturCut tem rótulos de cor. Clique com o botão direito em um clipe e escolha uma cor no menu rótulo. Por exemplo: roxo para a introdução, verde para a primeira parte, laranja para o final. Assim você enxerga a estrutura do vídeo só de olhar para a linha do tempo. A tecla L também troca a cor rapidinho. Nesse mesmo menu você encontra velocidade, ganho de áudio, vincular e desvincular áudio e vídeo, e copiar e colar atributos.',
  },
  {
    id: 'text', kind: 'shot', shot: 'text-lib', pose: 'point', title: 'Textos e títulos',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.25, box: 'add', zoom: 2.4 }, { at: 0.5, box: 'grid', zoom: 1.6 }],
    text: 'Vamos colocar texto. Na aba texto, clique em adicionar texto ou escolha um dos modelos prontos: título grande, legenda com fundo, neon, contorno, quadrinhos, gamer, cinema e muitos outros. Para usar, é só dar um clique duplo ou arrastar para a linha do tempo. A tecla T também cria um texto na hora.',
  },
  {
    id: 'text2', kind: 'shot', shot: 'text-edit', pose: 'point', title: 'Editando o texto',
    focus: [{ at: 0, box: 'player', zoom: 1.25 }, { at: 0.3, box: 'box', zoom: 1.6 }, { at: 0.55, box: 'inspector', zoom: 1.5 }, { at: 0.8, box: 'font', zoom: 2.6 }],
    text: 'Com o texto selecionado, você move ele arrastando no reprodutor, aumenta e diminui pelos cantos e gira pela bolinha de cima. Quando chega no centro, aparece uma guia para alinhar certinho. No painel da direita você escreve o texto, escolhe entre cinquenta fontes grátis, muda o tamanho, a cor, o espaçamento, e ainda coloca contorno, sombra, fundo e brilho neon. Se tiver uma fonte sua, dá para importar arquivos TTF e OTF na aba fontes.',
  },
  {
    id: 'keyframes', kind: 'shot', shot: 'keyframes', pose: 'think', title: 'Keyframes: dando movimento',
    focus: [{ at: 0, box: 'transform', zoom: 1.6 }, { at: 0.3, box: 'watch', zoom: 3.5 }, { at: 0.6, box: 'diamonds', zoom: 2.2 }, { at: 0.82, box: 'kfsec', zoom: 2 }],
    text: 'Agora uma das ferramentas mais poderosas: os keyframes. Eles servem para animar posição, escala, rotação, opacidade e até o volume. Clique no cronômetro ao lado da propriedade para começar a animar. Depois, mova o cursor da linha do tempo e mude o valor: o AsturCut cria um novo keyframe, que aparece como um losango amarelo no clipe. Um truque clássico é dar um zoom bem leve, de cem para cento e sete por cento, no primeiro clipe, para puxar a atenção de quem está assistindo. E para o movimento ficar natural, escolha a suavização: ease in, ease out ou ease in out.',
  },
  {
    id: 'effects', kind: 'shot', shot: 'effects', pose: 'cheer', title: 'Efeitos',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.25, box: 'grid', zoom: 1.5 }, { at: 0.6, box: 'tile', zoom: 3 }],
    text: 'Na aba efeitos tem mais de quarenta efeitos grátis, separados por categoria: básicos, dinâmicos, retrô, glitch, cor e partículas. Tem VHS, filme antigo, aberração cromática, tremor, zoom pulsante, neon, chuva, neve, confete e muito mais. Passe o mouse em cima para ver a prévia animada. Se um clipe estiver selecionado, o efeito vai para ele. Se não, o efeito vira uma camada na linha do tempo e afeta tudo o que estiver abaixo dela. Cada efeito tem um controle de intensidade.',
  },
  {
    id: 'transitions', kind: 'shot', shot: 'transitions', pose: 'point', title: 'Transições',
    focus: [{ at: 0, box: 'grid', zoom: 1.4 }, { at: 0.4, box: 'tile', zoom: 3 }, { at: 0.75, box: 'junction', zoom: 4 }],
    text: 'Para passar de um clipe para outro com estilo, use as transições. São vinte e sete opções: dissolver, fade para o preto, empurrar, cortina, círculo, relógio, zoom, chicote, glitch e outras. Na linha do tempo, entre dois clipes encostados aparece um pequeno losango. Clique nele para adicionar uma transição, e depois ajuste a duração no painel da direita. Tem até um botão para aplicar a mesma transição em todos os cortes.',
  },
  {
    id: 'filters', kind: 'shot', shot: 'filters-applied', pose: 'talk', title: 'Filtros',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.3, box: 'grid', zoom: 1.6 }, { at: 0.65, box: 'player', zoom: 1.4 }],
    text: 'Os filtros mudam o clima do vídeo com um clique. São vinte e oito filtros, como cinema, teal and orange, vintage, noir, verão, inverno e cyberpunk. É só selecionar o clipe e clicar no filtro. Depois, no painel da direita, você controla a intensidade, para o efeito ficar sutil ou bem marcante.',
  },
  {
    id: 'anims', kind: 'shot', shot: 'anims', pose: 'cheer', title: 'Animações e stickers',
    focus: [{ at: 0, box: 'grid', zoom: 1.4 }, { at: 0.6, box: null, zoom: 1 }],
    text: 'Na aba animações você escolhe como cada elemento entra, sai, ou fica se mexendo em loop. Tem zoom, pop, elástico, deslizar, girar, quicar e, para textos, a máquina de escrever, que faz as letras aparecerem uma por uma. E na aba stickers tem quase duzentos emojis e várias formas prontas, como setas, balões de fala, botão inscrever-se, barra de progresso e tarja com nome, o lower third.',
  },
  {
    id: 'audio', kind: 'shot', shot: 'audio-lib', pose: 'talk', title: 'Músicas e sons grátis',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.3, box: 'list', zoom: 1.6 }, { at: 0.7, box: 'nav', zoom: 2 }],
    text: 'Agora vamos falar de som. Na aba áudio tem músicas e efeitos sonoros gerados pelo próprio AsturCut, todos livres de direitos autorais. Inclusive, a música de fundo deste vídeo saiu daí. Tem lo-fi, synthwave, trap, pop, épico e ambiente, e efeitos como whoosh, pop, impacto, moeda, digitação e rufar de tambores. Clique no play para ouvir antes de usar. Uma boa prática é deixar a voz, os efeitos sonoros e a música em trilhas separadas.',
  },
  {
    id: 'gain', kind: 'shot', shot: 'gain', pose: 'think', title: 'Ganho de áudio',
    focus: [{ at: 0, box: 'modal', zoom: 1.6 }, { at: 0.5, box: 'presets', zoom: 2.6 }],
    text: 'Música alta demais atrapalha a voz. Para resolver, selecione o clipe da música e aperte a tecla G. Abre a janela de ganho de áudio, onde você define o volume em decibéis. Para música de fundo, algo entre menos vinte e menos trinta decibéis costuma deixar a voz bem clara. No painel de áudio você também faz fade in e fade out, para a música entrar e sair suave.',
  },
  {
    id: 'mixer', kind: 'shot', shot: 'mixer', pose: 'point', title: 'Mixer de áudio',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.2, box: 'strips', zoom: 1.6 }, { at: 0.42, box: 'preset', zoom: 3 }, { at: 0.6, box: 'curve', zoom: 2.4 }, { at: 0.8, box: 'denoise', zoom: 2.6 }],
    text: 'Para deixar a voz com som de estúdio, abra o mixer de áudio. Cada trilha tem o seu canal, com volume, panorâmico, mudo, solo e um medidor de nível. Clique em efeitos e escolha uma predefinição, como voz limpa, podcast ou rádio. Ou ajuste na mão: o equalizador corta o grave abafado e realça o brilho da voz, o compressor equilibra as partes altas e baixas, o limitador evita que o som estoure, e a redução de ruído diminui o chiado de fundo. Como os efeitos valem para a trilha inteira, deixe cada voz na sua própria trilha.',
  },
  {
    id: 'color', kind: 'shot', shot: 'color', pose: 'talk', title: 'Correção de cor',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.25, box: 'light', zoom: 2 }, { at: 0.5, box: 'tones', zoom: 2 }, { at: 0.75, box: 'tools', zoom: 2.8 }],
    text: 'Na aba ajuste você corrige a cor do vídeo. Tem brilho, contraste e exposição, e também os controles de tons: realces, sombras, brancos e pretos. Por exemplo, se o fundo estiver muito estourado, baixe os realces e os brancos. Na parte de cor tem saturação, temperatura e matiz. E três botões muito úteis: o conta-gotas de balanço de branco, o antes e depois, para comparar, e aplicar à mídia toda.',
  },
  {
    id: 'color2', kind: 'shot', shot: 'color', pose: 'point', title: 'Dicas de cor',
    focus: [{ at: 0, box: 'wb', zoom: 4 }, { at: 0.45, box: 'compare', zoom: 4 }, { at: 0.75, box: 'tools', zoom: 2.6 }],
    text: 'O balanço de branco funciona assim: clique no conta-gotas e depois em algo que deveria ser branco ou cinza no vídeo, como uma parede ou um tênis branco. O AsturCut acerta a temperatura sozinho. O antes e depois mostra o clipe sem correção, para você conferir. E o aplicar à mídia toda copia a mesma correção para todos os pedaços daquele vídeo na linha do tempo, sem precisar refazer em cada corte.',
  },
  {
    id: 'speed', kind: 'shot', shot: 'speed', pose: 'think', title: 'Velocidade e câmera lenta',
    focus: [{ at: 0, box: 'modal', zoom: 1.8 }],
    text: 'Quer uma câmera lenta? Selecione o clipe e aperte control mais R. Na janela de velocidade e duração, você digita a velocidade em porcentagem. Cinquenta por cento deixa o vídeo duas vezes mais lento, duzentos por cento deixa duas vezes mais rápido. Se o vídeo foi gravado a sessenta quadros por segundo, ele fica suave em câmera lenta até quarenta por cento. Dá para manter o tom do áudio e empurrar os clipes seguintes automaticamente.',
  },
  {
    id: 'personalize', kind: 'shot', shot: 'custom-theme', pose: 'cheer', title: 'Do seu jeito: temas',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.3, box: 'themes', zoom: 1.6 }, { at: 0.7, box: 'lang', zoom: 3 }],
    text: 'Agora a parte que deixa o AsturCut com a sua cara: a personalização. No botão personalizar você escolhe entre dez temas, como Astur ciano, que é o padrão, roxo neon, verde lima, OLED preto e até um tema claro. Ou monte o seu: escolha a cor de destaque, as cores dos painéis, a fonte da interface, o tamanho, o arredondamento dos cantos e o idioma. Dá até para exportar o seu tema e compartilhar com os amigos.',
  },
  {
    id: 'themes', kind: 'shot', shot: 'theme-purple', pose: 'wave', title: 'Do seu jeito: temas',
    focus: [{ at: 0, box: null, zoom: 1 }],
    text: 'Olha só como o editor fica com o tema roxo neon. Todas as cores mudam juntas: botões, seleção, cursor da linha do tempo e destaques.',
  },
  {
    id: 'layout', kind: 'shot', shot: 'custom-layout', pose: 'point', title: 'Do seu jeito: layout',
    focus: [{ at: 0, box: 'layouts', zoom: 1.5 }, { at: 0.6, box: 'tip', zoom: 2.4 }],
    text: 'Você também pode reorganizar o editor. Arraste as bordas entre os painéis para mudar o tamanho de cada um, ou arraste o título de um painel para cima de outro, para trocar de lugar. Tem sete layouts prontos, como exibidor grande, linha do tempo grande e modo foco, e você ainda pode salvar os seus próprios layouts no menu de layout.',
  },
  {
    id: 'maximize', kind: 'shot', shot: 'maximize', pose: 'talk', title: 'Maximizar painel',
    focus: [{ at: 0, box: null, zoom: 1 }],
    text: 'E um truque que pouca gente conhece: passe o mouse sobre qualquer painel e aperte a tecla do acento grave, que fica embaixo do esc. O painel ocupa a janela inteira. Aqui, por exemplo, a linha do tempo maximizada, ótima para ver o projeto todo. Aperte de novo para voltar.',
  },
  {
    id: 'keys', kind: 'shot', shot: 'custom-keys', pose: 'think', title: 'Atalhos do seu jeito',
    focus: [{ at: 0, box: 'keys', zoom: 1.4 }],
    text: 'Todos os atalhos de teclado podem ser trocados. Na aba atalhos, clique na tecla de qualquer comando e aperte a nova combinação. Se você veio de outro editor, pode deixar tudo igualzinho ao que já está acostumado. E se bagunçar, tem o botão restaurar padrão.',
  },
  {
    id: 'export', kind: 'shot', shot: 'export', pose: 'point', title: 'Exportar o vídeo',
    focus: [{ at: 0, box: 'modal', zoom: 1.2 }, { at: 0.3, box: 'fields', zoom: 1.8 }, { at: 0.75, box: 'button', zoom: 3 }],
    text: 'Terminou? Hora de exportar! Clique em exportar ou aperte control mais E. Escolha o nome, a resolução, de quatrocentos e oitenta p até quatro K, a taxa de quadros e o formato: MP4 é o recomendado para o YouTube e as redes sociais, mas também tem WebM, MOV, GIF animado e só o áudio em MP3. Se você marcou entrada e saída na linha do tempo, pode exportar só aquele trecho. A exportação acontece em tempo real, então deixe o AsturCut aberto até terminar.',
  },
  {
    id: 'save', kind: 'shot', shot: 'home-continue', pose: 'talk', title: 'Salvar e continuar depois',
    focus: [{ at: 0, box: null, zoom: 1 }, { at: 0.5, box: 'cont', zoom: 2.4 }],
    text: 'Não esqueça de salvar com control mais S. O projeto vira um arquivo ponto astur, e aparece na tela inicial com miniatura, para você continuar depois. O AsturCut também salva automaticamente de tempos em tempos e, se o computador desligar de repente, ele oferece recuperar o projeto que não foi salvo.',
  },
  {
    id: 'tips', kind: 'list', pose: 'think', title: 'Resumo dos atalhos',
    items: ['Espaço — reproduzir e pausar', 'S — dividir    Q / W — apagar e puxar', 'I / O — entrada e saída', 'G — ganho    Ctrl+R — velocidade', 'T — texto    L — rótulo de cor', '` — maximizar painel'],
    text: 'Para fechar, um resumo dos atalhos que mais vão te ajudar. Espaço para reproduzir e pausar. S para dividir. Q e W para apagar e puxar o resto. I e O para marcar entrada e saída. G para o ganho de áudio e control R para a velocidade. T para criar um texto, L para trocar o rótulo de cor, e o acento grave para maximizar o painel.',
  },
  {
    id: 'outro', kind: 'outro', pose: 'cheer', title: 'Agora é com você!', subtitle: 'AsturCut — crie sem limites',
    text: 'E é isso! Agora você já sabe usar o AsturCut do começo ao fim: importar e organizar, cortar rápido, colocar textos, efeitos, transições e música, deixar o som e a cor caprichados, personalizar tudo do seu jeito e exportar. O melhor jeito de aprender é praticando, então abre o AsturCut e cria o seu primeiro vídeo. Eu sou o Astur, e a gente se vê no próximo vídeo. Tchau!',
  },
];
