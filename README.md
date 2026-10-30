# Simple Call

Chamadas leves pra jogar e transmitir com os amigos. Estilo Meet: você cria a call, manda o link e pronto. Sem servidor, sem canal, sem conta.

Áudio, vídeo e chat vão **direto entre os navegadores** (WebRTC P2P). A hospedagem fica toda no plano grátis da Cloudflare.

**[Abrir o app](https://simple-call.antonioinaciodev.workers.dev)** · [Como funciona](#como-funciona) · [Rodar no PC](#rodando-no-seu-pc) · [Colocar no ar](docs/DEPLOY.md) · [Arquitetura](docs/ARQUITETURA.md)

[![CI](https://github.com/antonioinaciodev/simple-call/actions/workflows/ci.yml/badge.svg)](https://github.com/antonioinaciodev/simple-call/actions/workflows/ci.yml)

![Transmissão de um jogo com o chat aberto](docs/screenshots/transmissao.png)

## O que já funciona

- **Call por link:** crie uma call e entre pelo link ou pelo código (`abc-defg-hij`), só com o nome. Até 6 pessoas por call.
- **Microfone e câmera**, com prévia antes de entrar e escolha de dispositivo (mic, câmera e saída de áudio).
- **Transmissão de tela** em 1080p 60, 720p 60, 1080p 30 ou 720p 30, com áudio do sistema no Windows.
- **Chat** dentro da call. As mensagens somem quando a call acaba.
- **Áudio ajustável:** de 24 a 128 kbps (estéreo nas opções de música), cancelamento de eco, supressão de ruído, ganho automático e DTX.
- **Codec da transmissão:** H.264, VP9, AV1 ou VP8.
- **Estatísticas da conexão:** ping, rota (direta ou via TURN), resolução, FPS, bitrate e perda de pacotes.
- Contorno em quem está falando, tela cheia na transmissão (botão ou dois cliques) e tema escuro ou claro, só em escala de cinza.
- Funciona no celular. Os ajustes ficam salvos no navegador.
- Atalhos: `M` microfone, `V` câmera, `S` transmitir tela, `C` chat.

| | |
| --- | --- |
| ![Tela inicial](docs/screenshots/inicio.png) | ![Escolha da qualidade da transmissão](docs/screenshots/qualidade.png) |
| Tela inicial | Qualidade da transmissão |
| ![Painel de estatísticas sobre a transmissão](docs/screenshots/estatisticas.png) | ![Ajustes de dispositivos e áudio](docs/screenshots/ajustes.png) |
| Estatísticas da conexão | Ajustes |
| ![Call no tema claro](docs/screenshots/tema-claro.png) | <img src="docs/screenshots/celular.png" alt="Call no celular" width="200"> |
| Tema claro | No celular |

## Como funciona

```
navegador ──WebSocket──> Cloudflare Worker ──> só apresenta as pessoas da call
navegador <────────── WebRTC P2P ──────────> amigo
```

O servidor só existe pra apresentar as pessoas: troca as mensagens de conexão e sai do caminho. Cada call é um Durable Object da Cloudflare, e a mídia nunca passa por ele. Por isso ele é leve e cabe no plano grátis.

Cada pessoa tem uma conexão direta com cada uma das outras. Quem transmite manda uma cópia da tela pra cada pessoa assistindo (até 8 Mbps cada no 1080p 60), então o P2P funciona melhor com poucas pessoas assistindo, que é o caso de jogar com os amigos.

Quando a conexão direta não rola (algumas operadoras com CGNAT, redes de empresa ou faculdade), um servidor TURN pode repassar a mídia. Ele é opcional e ainda não está ligado: veja o [guia de deploy](docs/DEPLOY.md#2-turn-opcional).

Os detalhes (sinalização, negociação, ajustes de qualidade) estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estrutura do projeto

```
simple-call/
├── apps/
│   ├── web/              Front: React + TypeScript + Vite
│   │   └── src/
│   │       ├── components/   Telas e partes da interface (Home, PreJoin, Call, Chat...)
│   │       ├── hooks/        useSpeaking (quem está falando)
│   │       └── lib/          mesh.ts (malha P2P), presets de qualidade, estatísticas, preferências
│   └── worker/           Cloudflare Worker: API, sinalização e servidores STUN/TURN
│       └── src/
│           ├── index.ts      Rotas /api/*
│           ├── room.ts       Durable Object de cada call (WebSocket de sinalização)
│           └── rooms.ts      Código da call e validação do nome
├── docs/                 Deploy, arquitetura e screenshots
├── wrangler.jsonc        Configuração da Cloudflare (fica na raiz pro deploy automático achar)
└── .github/workflows/    CI: typecheck e build em cada PR
```

É um monorepo com [pnpm workspaces](https://pnpm.io/workspaces): cada pasta em `apps/` é um pacote com o próprio `package.json`.

## Rodando no seu PC

Só precisa do **Node 22+** e do **Git**. Nada é instalado no sistema: o pnpm roda via `npx` e o Wrangler (que simula a Cloudflare no seu PC) fica dentro do projeto.

```bash
git clone https://github.com/antonioinaciodev/simple-call
cd simple-call
npx pnpm@10 install
npx pnpm@10 dev
```

O `dev` sobe o Worker local (porta 3001) e o front em http://localhost:5173. Clique em **Nova call** e abra o mesmo link em outra aba ou navegador pra simular um amigo.

| Comando | O que faz |
| --- | --- |
| `npx pnpm@10 dev` | Sobe o Worker e o front com recarregamento automático |
| `npx pnpm@10 typecheck` | Confere os tipos do TypeScript nos dois apps |
| `npx pnpm@10 build` | Gera o site em `apps/web/dist` |
| `npx pnpm@10 run deploy` | Publica na Cloudflare (precisa do `build` antes) |

Pra testar o TURN no PC, copie `.dev.vars.example` pra `.dev.vars` e preencha.

### Fluxo de trabalho

1. Cada mudança vai numa branch e vira um pull request.
2. O CI (GitHub Actions) roda o typecheck e o build no PR.
3. Depois do merge no `main`, a Cloudflare publica a versão nova sozinha em uns 2 minutos.

## Limitações conhecidas

- **Até 6 pessoas por call.** Como é P2P, cada pessoa a mais é mais uma conexão pra cada um.
- **Áudio do jogo no Linux:** o navegador só consegue mandar o áudio de uma aba do Chrome junto com a tela, não o áudio do sistema ou de um jogo. No Windows funciona ao escolher "Tela inteira".
- **Push-to-talk com o jogo em foco** não dá pra fazer no navegador, porque ele só recebe teclas com a aba em foco.
- **Sem TURN por enquanto:** quem estiver numa rede que bloqueia conexão direta não vai conectar. Até agora ninguém precisou.

## Roadmap

- [x] MVP web: call por link, mic, câmera, tela, chat, interface em escala de cinza
- [x] Ajustes de áudio, codec e painel de estatísticas
- [x] Troca do servidor de mídia (LiveKit) por P2P direto entre os navegadores
- [x] Tudo hospedado na Cloudflare (Worker + Durable Objects)
- [ ] Volume por pessoa, som de entrada e saída, push-to-talk com a aba em foco
- [ ] TURN, se alguém não conseguir conectar direto
- [ ] Senha ou sala de espera na call
- [ ] Talvez, bem mais pra frente: app desktop (push-to-talk global, áudio só do jogo)

## Licença

[MIT](LICENSE)
