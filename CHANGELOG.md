# Novidades

O que mudou em cada versão. As versões valem pros apps (Windows e Android); o
[site](https://simplecall.antonioinaciodev.workers.dev) e os apps já instalados recebem as mudanças
do site sozinhos a cada versão que entra no `main`, sem precisar baixar de novo.

Cada PR que entra na `dev` escreve o que mudou em "Próxima versão". Ao lançar, essa seção vira
`## vX.Y.Z (dia/mês/ano)`.

Os instaladores de cada versão estão nas [Releases](https://github.com/antonioinaciodev/simple-call/releases).
Pra publicar uma versão nova, veja [docs/APPS.md](docs/APPS.md#gerar-uma-release).

## v0.7.0 (13/11/2026)

**Salas fixas, salas recentes e quem está online** ([#30](https://github.com/antonioinaciodev/simple-call/pull/30))

- Dá pra criar uma **sala fixa com nome**, tipo `/sala/galera-do-lol`. O link vale pra sempre, então o grupo sempre sabe onde entrar, como um canal de voz do Discord, mas sem conta.
- A tela inicial mostra as **salas recentes** (fixas ou calls rápidas), guardadas só no seu aparelho. Um clique e você entra; o X tira da lista.
- Cada sala da lista mostra **quantas pessoas estão na call agora e quem são**. A tela antes de entrar também mostra quem já está lá.
- No campo "Entrar" agora dá pra digitar o nome de uma sala fixa, além do código ou do link.
- Os apps de Windows e Android desta versão abrem os links de sala fixa direto no app (baixe ou atualize pelo botão dentro do app).

## v0.6.0 (08/11/2026)

**Branch dev e apps só pra Windows e Android** ([#24](https://github.com/antonioinaciodev/simple-call/pull/24))

- As novidades agora entram primeiro na branch `dev` e só vão pro ar quando sai uma versão. O CI confere tudo na `dev` também, sem gerar Release.
- A `dev` pode ter um site de teste próprio (`simplecall-dev`), separado do site de todo mundo.
- Os apps de Linux e iOS saíram: não funcionavam direito e deixavam cada versão mais lenta de gerar. No Linux, no Mac e no iPhone o Simple Call segue funcionando no navegador.

**Transmissão só abre com "Assistir"** ([#25](https://github.com/antonioinaciodev/simple-call/pull/25))

- Quando alguém começa a transmitir, aparece um quadro "Fulano está transmitindo" com o botão **Assistir**, e um som curto avisa. Ninguém vê nem ouve nada antes de clicar.
- Quem não clicou não recebe a transmissão, então ela só gasta a internet e a placa de vídeo de quem transmite pra quem está assistindo.
- Dá pra parar de assistir pelo botão no canto da transmissão. Quando ela acaba, a próxima volta a pedir o clique.
- Quem transmite vê quantas pessoas estão assistindo.

**Página de apresentação separada do app** ([#26](https://github.com/antonioinaciodev/simple-call/pull/26))

- No navegador, o endereço principal virou uma página de apresentação, como a de outros apps: o que é o Simple Call, uma imagem dele, o que ele tem e os downloads, com os botões **Baixar** (pro seu sistema) e **Abrir no navegador**.
- O app no navegador fica em `/app`, só com criar e entrar na call. Os links de call continuam iguais, e os apps instalados continuam abrindo direto no app.

**Atualização dentro do app** ([#27](https://github.com/antonioinaciodev/simple-call/pull/27))

- Quando sai uma versão nova, os apps mostram "Versão X disponível" com o botão **Atualizar**.
- Windows: o app baixa, instala e abre de novo sozinho, sem precisar passar pelo instalador.
- Android: o app baixa e abre o instalador do Android. Na primeira vez ele pede pra permitir instalar apps do Simple Call.
- O arquivo baixado é conferido com o hash que o GitHub publica antes de instalar.
- Quem ainda está com o app 0.5 vê o mesmo aviso, que abre o download no navegador. Da 0.6 em diante a atualização é por dentro.

**Animações, sons e celular** ([#28](https://github.com/antonioinaciodev/simple-call/pull/28))

- Animações curtas (até 200 ms, só opacidade e movimento leve): quadros de quem entra, painel do chat e dos ajustes, menus, mensagens novas e botões que afundam de leve no clique. Quem desliga animações no sistema não vê nenhuma.
- Sons novos, curtos e baixos: câmera ligando e desligando, transmissão começando e parando, mensagem nova com o chat fechado e um toque leve nos botões. Tudo desliga junto em Ajustes → Sons.
- Celular em pé: os quadros ficam um embaixo do outro, maiores, em vez de lado a lado.
- Celular: o chat e os ajustes ocupam a tela da call sem ficar por cima dos botões, e o botão de convidar voltou (só o ícone).

## v0.5.1 (31/10/2026)

**Tela cheia de verdade no celular** ([#23](https://github.com/antonioinaciodev/simple-call/pull/23))

- Apps do celular: a barra de cima (hora, bateria) some, e a tela cheia da transmissão ocupa a tela inteira, sem a barra de cima nem a de baixo. Puxando da borda elas aparecem por um instante.
- No Android, o botão voltar sai da tela cheia em vez de sair da call.
- Em todo lugar (PC, celular e navegador): na tela cheia, o volume da transmissão e o botão de sair só aparecem com um clique ou toque na imagem e somem sozinhos depois de 3 segundos. No PC o cursor também some.
- Os botões ficam fora do entalhe da câmera e das bordas arredondadas do celular.
- Esconder as barras já vale pros apps instalados assim que o site atualizar; elas voltarem só por um instante quando puxadas da borda precisa do app 0.5.1.

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
