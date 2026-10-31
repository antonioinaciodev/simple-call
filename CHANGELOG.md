# Novidades

O que mudou em cada versão. As versões valem pros apps (Windows, Linux, Android e iOS); o
[site](https://simplecall.antonioinaciodev.workers.dev) e os apps já instalados recebem as mudanças
do site sozinhos a cada merge no `main`, sem precisar baixar de novo.

Os instaladores de cada versão estão nas [Releases](https://github.com/antonioinaciodev/simple-call/releases).
Pra publicar uma versão nova, veja [docs/APPS.md](docs/APPS.md#gerar-uma-release).

## v0.5.0 (31/10/2026)

**Link de convite abre direto no app** ([#22](https://github.com/antonioinaciodev/simple-call/pull/22))

- Android: tocar no link da call (no WhatsApp, Discord, onde for) abre direto no app, sem passar pelo navegador.
- Windows, Linux e iPhone: a página da call no navegador ganhou o botão "Abrir no app". O navegador pergunta se pode abrir o Simple Call e o app já entra na call, mesmo se estiver aberto.
- No Linux, o "Abrir no app" funciona com o `.deb` (o AppImage não registra no sistema).

## v0.4.0 (31/10/2026)

**Página inicial com os downloads e abertura animada nos apps** ([#20](https://github.com/antonioinaciodev/simple-call/pull/20))

- No navegador, a página inicial apresenta o Simple Call: começar a call ali mesmo, o que ele tem de diferente e os downloads, com o do seu sistema primeiro.
- Nos apps (PC e celular), uma abertura curta: o ponto "liga" como uma call conectando, o nome aparece e some. Aparece uma vez cada vez que o app abre e respeita quem desliga animações no sistema.
- Dentro dos apps a página inicial continua só com a entrada da call.
- O tema claro já aparece no primeiro quadro, sem piscar o escuro antes.

## v0.3.0 (31/10/2026)

**Seletor de janelas com miniaturas e ajuste fino do encoder** ([#18](https://github.com/antonioinaciodev/simple-call/pull/18))

- App desktop: o seletor de tela ou janela abre na hora com os nomes, e as miniaturas aparecem logo depois (no Wayland o sistema já escolhe, então não tem miniatura).
- Codec da transmissão no automático (novo padrão): AV1 ou VP9 quando a placa de vídeo de quem transmite e a de quem assiste aguentam; senão H.264 pra jogo e VP9 pra texto. A escolha manual continua nos ajustes.
- Voz com redundância (RED) e FEC: aguenta melhor perda de pacote no Wi-Fi e no 4G.
- Voz e transmissão têm prioridade sobre a câmera quando a banda aperta.
- Áudio do jogo em estéreo e sem DTX, sem cortar o fim dos sons.
- Com pouca banda, a imagem do jogo encolhe um degrau em vez de perder quadros.
- Preset de texto avisa o encoder que é texto (letra fina mais legível).

## v0.2.0 (31/10/2026)

**Áudio só do jogo, sem as vozes da call** ([#17](https://github.com/antonioinaciodev/simple-call/pull/17))

- Windows: captura só o som do programa da janela escolhida, ou o PC inteiro menos o Simple Call (Windows 10 2004 ou mais novo).
- Linux: escolhe de qual app vai o áudio (PipeWire ou PulseAudio).
- O seletor de janela ganhou a escolha do áudio: "Só do jogo", "PC inteiro" ou "Sem áudio".
- O site continua funcionando com o app 0.1 instalado.

## v0.1.0 (31/10/2026)

**Primeira versão dos apps** ([#16](https://github.com/antonioinaciodev/simple-call/pull/16))

- Windows e Linux (Electron): seletor próprio de tela ou janela, áudio do PC no Windows e a call não engasga com a janela minimizada.
- Android (Capacitor): alto-falante, ouvido ou fone, e o mic continua com o app em segundo plano.
- iOS: `.ipa` sem assinatura, pra instalar com Sideloadly ou AltStore.
- Os apps abrem o site, então cada deploy do site já atualiza todos eles.

## Antes dos apps (site)

O que o site já tinha quando os apps chegaram:

- Call por link, só com o nome, até 6 pessoas; mic, câmera, transmissão de tela em 1080p/720p a 60 ou 30 fps e chat ([#1](https://github.com/antonioinaciodev/simple-call/pull/1)).
- Transmissão de jogo segura os 60 fps com internet pior ([#5](https://github.com/antonioinaciodev/simple-call/pull/5)); tela cheia e tema claro ([#6](https://github.com/antonioinaciodev/simple-call/pull/6)).
- Áudio, vídeo e chat direto entre os navegadores (P2P), no lugar do LiveKit ([#7](https://github.com/antonioinaciodev/simple-call/pull/7), [#8](https://github.com/antonioinaciodev/simple-call/pull/8)).
- Tudo hospedado no plano grátis da Cloudflare ([#9](https://github.com/antonioinaciodev/simple-call/pull/9)).
- Volume por pessoa e da transmissão, desligar o som da call e sons de entrar, sair e mutar ([#14](https://github.com/antonioinaciodev/simple-call/pull/14)).
- A call não cai quando a internet do celular pisca: reconexão automática com o servidor e com cada pessoa ([#15](https://github.com/antonioinaciodev/simple-call/pull/15)).
