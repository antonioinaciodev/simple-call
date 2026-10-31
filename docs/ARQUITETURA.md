# Arquitetura

Como o Simple Call funciona por dentro. Pra rodar ou publicar, veja o [README](../README.md) e o [guia de deploy](DEPLOY.md).

## Visão geral

```
                 ┌──────────────── Cloudflare ────────────────┐
navegador ─HTTP─>│ Worker: site estático + /api/rooms, /api/ice │
          ─WS───>│ Durable Object da call (sinalização)         │
                 └─────────────────────────────────────────────┘
navegador <═══════════ WebRTC P2P (áudio, vídeo, chat) ═══════════> amigo
```

- **`apps/web`** é o front em React. Toda a parte de WebRTC fica em `src/lib/mesh.ts`.
- **`apps/worker`** é um único Cloudflare Worker. Ele entrega o site (os arquivos de `apps/web/dist`) e responde a API. Só as rotas `/api/*` passam pelo código do Worker; o resto sai direto dos arquivos estáticos (`run_worker_first` no `wrangler.jsonc`).
- **Cada call é um Durable Object** (`apps/worker/src/room.ts`). Todo mundo da mesma call cai na mesma instância, que guarda os WebSockets e repassa as mensagens de conexão. Áudio, vídeo e chat nunca passam por ele.

## API do Worker

| Rota | O que faz |
| --- | --- |
| `POST /api/rooms` | Gera um código novo (`abc-defg-hij`, 26^10 combinações). A sala não é salva: ela só existe enquanto tem alguém conectado. |
| `GET /api/ice` | Devolve os servidores STUN e, se configurado, credenciais temporárias do TURN da Cloudflare. |
| `GET /api/signal?room=…&name=…` | Abre o WebSocket de sinalização da call. |
| `GET /api/health` | Responde `{ ok: true }`. |

## Sinalização

O Durable Object fala com cada navegador por WebSocket:

| Mensagem | Direção | Quando |
| --- | --- | --- |
| `welcome` | servidor → quem entrou | Logo ao conectar, com o id da pessoa, um token pra voltar com o mesmo id e a lista de quem já está na call |
| `join` / `leave` | servidor → todos | Alguém entrou ou saiu |
| `full` | servidor → quem entrou | A call já tem 6 pessoas |
| `signal` | navegador ↔ navegador | Oferta, resposta e candidatos ICE, repassados pelo servidor pro `to` indicado |

Ele usa a hibernação de WebSockets: entre uma mensagem e outra o objeto sai da memória e a Cloudflare segura as conexões, então uma call parada não gasta nada. O navegador manda um ping a cada 10 s pra conexão não cair por inatividade, e a resposta automática (`setWebSocketAutoResponse`) não acorda o objeto.

Depois que todo mundo se conectou, a call segue direto entre as pessoas mesmo se o servidor cair; só não dá pra entrar gente nova.

**Quando a conexão com o servidor cai.** No celular ela cai à toa (a internet pisca, troca de Wi-Fi pro 4G). Por isso:

- O navegador reconecta sozinho, com espera de 1 a 8 s entre tentativas (ou na hora, quando o navegador avisa que a internet voltou). Se passar 25 s sem nenhuma resposta do servidor, nem o pong do ping, a conexão morreu sem avisar e ele abre outra.
- Ao reconectar, manda o id e o token que recebeu no `welcome`. O servidor devolve o mesmo id e ninguém fica sabendo de nada: a pessoa continua na call. Se a conexão antiga ainda parecia aberta pro servidor, ele fecha ela.
- Quem cai sem sair (qualquer fechamento que não seja o 1000 do botão Sair ou o 1001 de fechar a aba) fica 15 s guardado no armazenamento do objeto, ainda na lista da call. Só quando esse tempo acaba (um alarme do Durable Object) os outros recebem o `leave`.
- Voltando depois disso, o servidor dá um id novo e a pessoa entra de novo como se tivesse acabado de chegar.

Ao voltar a tempo, o navegador confere a lista do `welcome` com quem ele conhecia: quem não está mais saiu, quem é novo entrou enquanto ele estava fora (e espera a oferta dele, como com qualquer novato).

## A malha P2P (`mesh.ts`)

Cada pessoa tem um `RTCPeerConnection` com cada uma das outras (malha completa). Com 4 pessoas são 3 conexões por navegador.

**Negociação.** Segue o padrão "perfect negotiation" do WebRTC: quando os dois lados mandam oferta ao mesmo tempo, o lado "educado" (*polite*) cede e o outro ignora a oferta que cruzou. Quem chega na call é o educado com quem já estava, então as conexões ficam simétricas e sem impasse.

**Reconexão do áudio e vídeo.** Com sinal ruim (`disconnected` ou `failed`) por 3 s, o lado não educado reinicia o ICE (`restartIce`), que procura caminhos de novo sem derrubar faixas nem o canal de dados. Se não voltar, tenta de novo com esperas dobrando até 30 s. Só ele reinicia, pra que as duas pontas não mandem ofertas cruzadas; o educado manda um `{ restart: true }` pedindo, caso o outro não tenha percebido. Se uma oferta de reinício se perdeu (servidor fora), a próxima tentativa desfaz ela (`rollback`) e manda outra. Enquanto isso o quadro da pessoa mostra "reconectando…".

**Uma fila por conexão.** Ofertas e mensagens recebidas de uma pessoa rodam uma de cada vez, na ordem (`enqueue`). Duas operações de negociação ao mesmo tempo na mesma conexão embaralham o estado dela.

**Canal de dados.** Estado (mic ligado, som da call desligado, tipo de cada faixa) e chat vão por um `RTCDataChannel`. Só quem já estava na call cria o canal; quem chega recebe pronto pelo `ondatachannel`. Se os dois criassem, a primeira negociação cruzada derrubaria o canal de um dos lados.

**Um transceiver por tipo de mídia.** Cada conexão tem até quatro: `mic`, `camera`, `screen` e `screenAudio`. Ligar e desligar troca só a faixa (`replaceTrack`), sem criar transceivers novos. O mic nem renegocia: só fica mudo. Como o outro lado não tem como saber se um vídeo é câmera ou tela, quem envia manda pelo canal de dados o tipo de cada faixa, indexado pelo `mid`.

**Volume de cada pessoa.** Até 100% quem ajusta é o próprio `<audio>`, sem custo extra. Acima disso o áudio passa por um `GainNode` do Web Audio, e o `<audio>` continua tocando mudo: sem ele o Chrome não entrega o áudio da conexão pro Web Audio. Os sons da call (entrar, sair, mutar) são gerados com osciladores nesse mesmo `AudioContext`, sem arquivo pra baixar.

## Qualidade

O ajuste fino fica em `src/lib/tuning.ts` (ideias do [Vcall](https://github.com/victor-kauan-coder/Vcall)).

- **Presets de tela** (`src/lib/screen.ts`): resolução, FPS e bitrate máximo por pessoa assistindo. Os de jogo usam `contentHint = 'motion'` e `degradationPreference = 'maintain-framerate'`: quando a banda aperta, cai a nitidez e não o FPS. O de texto usa `contentHint = 'text'` (liga as ferramentas do encoder pra conteúdo de tela) e faz o contrário.
- **Codec** (`pickCodec`, `preferCodec`): no automático (padrão), cada um pergunta à placa de vídeo (`mediaCapabilities`) o que codifica e decodifica sem pesar e conta pros outros pelo canal de dados. A transmissão pra cada pessoa usa AV1 ou VP9 quando os dois lados têm na placa; senão H.264 pra jogo (toda placa codifica) e VP9 pra texto. O escolhido vai pra frente da lista, sem tirar o `rtx`, que faz a retransmissão.
- **Prioridade**: `priority`/`networkPriority` altos pra voz e transmissão, médio pro áudio da tela e baixo pra câmera. Com banda curta, o navegador tira da câmera primeiro.
- **Resolução pela banda** (`scaleForBitrate`, a cada 2 s): jogo a 60 fps pede uns 0,06 bit por pixel. Se a banda que a conexão dá pra transmissão (`targetBitrate`) não cobre isso, a imagem encolhe um degrau (`scaleResolutionDownBy` 1,25 a 3) na hora, em vez de perder quadros. Volta a crescer só com 30% de folga por 15 s seguidos, e nada muda nos primeiros 8 s (a banda ainda está subindo).
- **Início rápido**: o Chrome começa todo vídeo a uns 300 kbps e sobe devagar. O `tuneSdp` coloca `x-google-start-bitrate` na descrição recebida pra transmissão já começar perto de 2,5 Mbps.
- **Áudio** (`tuneSdp`, seção por seção pelo `mid`): todo Opus com FEC. O mic vai com redundância (RED: cada pacote leva uma cópia do anterior, então perda isolada não corta a voz), DTX opcional e mono, a não ser nas qualidades de música. O áudio da tela vai em estéreo, a 128 kbps e sem DTX (que cortaria o fim das notas), sem cancelamento de eco nem supressão de ruído.

## Outras peças do front

| Arquivo | O que faz |
| --- | --- |
| `src/lib/stats.ts` | Lê o `getStats()` de cada conexão uma vez por segundo pro painel de estatísticas |
| `src/hooks/useSpeaking.ts` | Quem está falando: dos outros, usa o volume que o navegador já calcula; o seu vem de um analisador no próprio mic |
| `src/lib/prefs.ts` | Preferências salvas no `localStorage` (nome, dispositivos, qualidade, tema) |
| `src/lib/native.ts` | Pontes pros apps: `window.simplecallDesktop` (seletor de tela do app desktop) e o plugin `CallAudio` do celular. Fora dos apps não faz nada. Detalhes em [APPS.md](APPS.md) |
| `src/App.tsx` | Rotas simples: `/` é a tela inicial e `/abc-defg-hij` é a call. A parte da call só é baixada quando alguém abre uma |
