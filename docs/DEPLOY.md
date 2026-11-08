# Colocando no ar

O Simple Call é P2P: áudio e vídeo vão direto entre os navegadores. O servidor só apresenta as pessoas da call, então tudo cabe no plano grátis da **Cloudflare**, que não pede cartão:

| Peça | Onde roda |
| --- | --- |
| Site (`apps/web`) | Arquivos estáticos do Worker |
| API e sinalização (`apps/worker`) | Cloudflare Workers + um Durable Object por call |
| TURN (opcional, desligado hoje) | Cloudflare Realtime (pede cartão) ou Metered |

Nada "dorme": o primeiro acesso é instantâneo. Os servidores da Cloudflare mais perto de cada pessoa atendem (tem vários no Brasil).

A versão no ar hoje: https://simplecall.antonioinaciodev.workers.dev

## 1. Conta e deploy automático

1. Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. No menu, abra **Workers & Pages** → **Create** → **Import a repository**.
3. Conecte o GitHub e escolha o repositório `simple-call`.
4. Preencha:

   | Campo | Valor |
   | --- | --- |
   | Project name | `simplecall` (tem que ser igual ao `name` do `wrangler.jsonc`) |
   | Build command | `npx pnpm@10 install --frozen-lockfile && npx pnpm@10 build` |
   | Deploy command | `npx pnpm@10 run deploy` |
   | Root directory | deixe vazio (raiz do repositório) |

5. **Deploy**. Em uns 2 minutos o app fica em `https://simplecall.SEU-SUBDOMINIO.workers.dev`. Na primeira vez a Cloudflare pede pra escolher esse subdomínio.
6. Se o endereço não abrir, vá no Worker `simplecall` → **Settings → Domains & Routes** e ative o **workers.dev**.

Cada merge no `main` publica a versão nova sozinho. A branch `dev` não mexe no site de todo mundo
(veja [Site de teste da dev](#site-de-teste-da-dev)).

Os nomes dos menus da Cloudflare mudam de vez em quando; se algo não bater, procure por "Workers" e "Import a repository".

## 2. TURN (opcional)

Na maioria das redes os navegadores se conectam direto, inclusive no 4G (testado). Em algumas (CGNAT de operadora, rede de empresa ou faculdade) isso falha: a pessoa entra na call mas ninguém se ouve. O TURN resolve repassando a mídia só pra essas conexões. No painel de estatísticas aparece **via TURN** quando ele está em uso.

Hoje o app roda **sem TURN**, só com STUN (grátis, da Cloudflare e do Google), e isso tem bastado. Se alguém não conseguir conectar, há dois caminhos:

### Opção A: TURN da Cloudflare (pede cartão)

Tem **1.000 GB grátis por mês**, mas a Cloudflare pede um cartão de crédito pra ativar o Realtime, mesmo sem cobrar nada dentro do limite. O app já sabe usar:

1. No painel, abra **Realtime → TURN Server** e crie uma chave.
2. Anote o **Turn Token ID** e o **API Token**.
3. Abra o Worker `simplecall` → **Settings → Variables and Secrets** e adicione dois **Secrets**:
   - `CF_TURN_KEY_ID` = o Turn Token ID
   - `CF_TURN_API_TOKEN` = o API Token
4. Salve. A próxima call já usa o TURN quando precisar.

### Opção B: Metered (sem cartão)

A [Metered](https://www.metered.ca/stun-turn) tem um plano grátis de TURN que não pede cartão. O app **ainda não suporta** esse caso: precisa de uma mudança pequena no `apps/worker/src/index.ts` pra buscar as credenciais da Metered em vez das da Cloudflare. Fica pra quando alguém realmente precisar.

## Site de teste da dev

As novidades entram primeiro na branch `dev`. Pra testar antes de lançar, a `dev` pode ter um site
próprio, `https://simplecall-dev.SEU-SUBDOMINIO.workers.dev`: o mesmo código num Worker separado
(`env.dev` do `wrangler.jsonc`), com as calls dele. Pra ligar (uma vez só):

1. No Worker `simplecall` → **Settings → Build**, ative **Non-production branch builds** (ou
   "Builds for non-production branches").
2. Em **Non-production branch deploy command**, troque o que estiver lá por
   `npx pnpm@10 run deploy:branch`. O build command fica o mesmo.
3. Salve. No próximo push na `dev`, a Cloudflare cria o Worker `simplecall-dev` sozinha. Se o
   endereço não abrir, ative o **workers.dev** dele em **Settings → Domains & Routes**.

O `deploy:branch` (`apps/worker/deploy-branch.mjs`) só publica quando a branch é `dev`; nas outras
branches a Cloudflare só confere se o build passa. Os apps continuam abrindo o site da `main`.

Sem ligar isso, nada quebra: a `dev` só não tem site, e dá pra testar no PC com `npx pnpm@10 dev`.

## Deploy pelo seu PC (alternativa)

Sem conectar o GitHub, dá pra publicar do seu PC: `npx pnpm@10 build` e depois `npx pnpm@10 run deploy`. Na primeira vez o Wrangler abre o navegador pra você entrar na conta da Cloudflare.
