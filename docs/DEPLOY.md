# Colocando no ar

O Simple Call é P2P: áudio e vídeo vão direto entre os navegadores. O servidor só apresenta as pessoas da call, então ele é leve e cabe no plano grátis do Render, sem cartão.

## 1. Render (site + sinalização)

1. Entre em [render.com](https://render.com) com o GitHub.
2. **New → Blueprint** e escolha o repositório `simple-call`. O Render lê o `render.yaml` e cria o serviço no plano grátis.
3. Clique em **Apply** e espere o build (uns 3 minutos). O endereço fica tipo `https://simple-call-xxxx.onrender.com`.

Se o Blueprint pedir cartão, crie na mão: **New → Web Service**, mesmo repositório, plano **Free**, com:

| Campo | Valor |
| --- | --- |
| Build Command | `npx pnpm@10 install --frozen-lockfile && npx pnpm@10 build` |
| Start Command | `NODE_ENV=production node apps/server/dist/index.js` |
| Variáveis | `NODE_VERSION=22` |

Cada merge no `main` faz o Render publicar a versão nova sozinho.

### O site "dorme"

No plano grátis o Render desliga o site depois de 15 minutos sem acesso; o primeiro acesso depois disso leva uns 30 a 60 segundos. Pra deixar sempre ligado, crie um job grátis no [cron-job.org](https://cron-job.org) que acessa `https://SEU-SITE.onrender.com/api/health` a cada 10 minutos. As 750 horas grátis por mês do Render cobrem o mês inteiro.

## 2. TURN (opcional, pra quem não conecta direto)

Na maioria das redes os navegadores se conectam direto. Em algumas (4G, CGNAT de operadora, rede de empresa ou faculdade) isso falha, e a pessoa entra na call mas ninguém se ouve. O TURN resolve repassando a mídia só pra essas conexões. No painel de estatísticas aparece **via TURN** quando ele está em uso.

A Cloudflare tem TURN com **1.000 GB grátis por mês**:

1. Entre no [painel da Cloudflare](https://dash.cloudflare.com) (conta grátis).
2. Vá em **Realtime → TURN Server** e crie uma chave (**Create**).
3. Anote o **Turn Token ID** e o **API Token**.
4. No Render, abra o serviço `simple-call` → **Environment** e adicione:
   - `CF_TURN_KEY_ID` = o Turn Token ID
   - `CF_TURN_API_TOKEN` = o API Token
5. Salve; o Render reinicia o serviço sozinho.

Sem essas variáveis o app usa só STUN (grátis, da Cloudflare e do Google), que já resolve a maior parte dos casos.

## Rodando em outro lugar

O servidor é um app Node comum (`apps/server`) que serve também o front já buildado. Qualquer hospedagem com Node 22 e WebSocket serve: rode `npx pnpm@10 install && npx pnpm@10 build` e depois `NODE_ENV=production node apps/server/dist/index.js`. A porta vem da variável `PORT` (padrão 3001).
