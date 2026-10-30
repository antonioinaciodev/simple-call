# Simple Call

Chamadas leves pra jogar e transmitir com os amigos. Estilo Meet: você cria a call, manda o link e pronto. Sem servidor, sem canal, sem conta.

![Call com chat aberto](docs/screenshots/call-chat.png)

## O que já funciona

- Criar uma call e entrar por link ou código (`abc-defg-hij`), só com o nome.
- Microfone e câmera, com prévia antes de entrar.
- Transmissão de tela em 4 qualidades: 1080p 60, 720p 60, 1080p 30 e 720p 30.
- Chat simples dentro da call (as mensagens somem quando a call acaba).
- Qualidade do áudio ajustável (24 a 128 kbps, estéreo), cancelamento de eco, supressão de ruído e DTX.
- Escolha de codec da transmissão (H.264, VP9, AV1, VP8).
- Painel de estatísticas: ping, rota (direta ou via TURN), resolução, FPS, bitrate e perda de pacotes.
- Tela cheia na transmissão (botão ou dois cliques).
- Tema escuro e claro, só em escala de cinza. Funciona no celular.
- Atalhos: `M` microfone, `V` câmera, `S` transmitir tela, `C` chat.

## Como funciona

```
navegador ──WebSocket──> Cloudflare Worker ──> só apresenta as pessoas da call
navegador <────────── WebRTC P2P ──────────> amigo
```

Áudio, vídeo e chat vão **direto entre os navegadores** (P2P). O servidor só existe pra apresentar as pessoas: troca as mensagens de conexão e sai do caminho. Por isso ele é leve e roda no plano grátis da Cloudflare (Workers, com um Durable Object por call).

Cada pessoa tem uma conexão com cada uma das outras. Quem transmite manda uma cópia da tela pra cada pessoa assistindo (até 8 Mbps cada no 1080p 60), então o P2P funciona melhor com até umas 4 ou 5 pessoas.

Quando a conexão direta não rola (comum no 4G e em algumas operadoras), um servidor TURN repassa a mídia. Ele é opcional: veja o [guia de deploy](docs/DEPLOY.md).

| Pasta | O que tem |
| --- | --- |
| `apps/web` | Front em React + Vite + TypeScript, com a malha P2P em `src/lib/mesh.ts` |
| `apps/worker` | Cloudflare Worker: cria o código das calls, faz a sinalização (WebSocket) e entrega os servidores STUN/TURN |

## Rodando no seu PC

Só precisa do **Node 22+** e do **Git**. Nada é instalado no sistema: o pnpm roda via `npx` e o Wrangler (que simula a Cloudflare no seu PC) fica dentro do projeto.

```bash
git clone https://github.com/antonioinaciodev/simple-call
cd simple-call
npx pnpm@10 install
npx pnpm@10 dev
```

O `dev` sobe o Worker local (porta 3001) e o front em http://localhost:5173. Clique em **Nova call** e abra o mesmo link em outra aba ou navegador pra simular um amigo.

Pra testar o TURN no PC, copie `.dev.vars.example` pra `.dev.vars` e preencha.

## Limitações conhecidas

- **Áudio do jogo no Linux:** o navegador só consegue mandar o áudio de uma aba do Chrome junto com a tela, não o áudio do sistema ou de um jogo. No Windows funciona ao escolher "Tela inteira". Um app desktop resolveria isso.
- **Push-to-talk com o jogo em foco** também depende do app desktop, porque o navegador só recebe teclas com a aba em foco.

## Roadmap

- [x] Fase 1: MVP web (call por link, mic, câmera, tela, chat, UI em escala de cinza)
- [x] Fase 2 (parcial): ajustes de áudio, codec e painel de estatísticas
- [x] Fase 3: deploy pra testar com os amigos ([passo a passo](docs/DEPLOY.md))
- [x] Troca do servidor de mídia (LiveKit) por P2P direto entre os navegadores
- [ ] Volume por pessoa, som de entrada e saída, push-to-talk com a aba em foco
- [ ] Talvez, bem mais pra frente: app desktop (push-to-talk global, áudio só do jogo)
- [ ] Depois: senha ou sala de espera na call

## Colocando no ar

O [passo a passo de deploy](docs/DEPLOY.md) coloca tudo na Cloudflare, de graça e sem cartão: site, sinalização e o TURN pra quem não consegue conexão direta.

## Licença

[MIT](LICENSE)
