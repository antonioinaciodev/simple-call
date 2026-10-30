# Colocando no ar

O Simple Call é P2P: áudio e vídeo vão direto entre os navegadores. O servidor só apresenta as pessoas da call, então tudo cabe no plano grátis da **Cloudflare**, sem cartão:

| Peça | Onde roda |
| --- | --- |
| Site (`apps/web`) | Arquivos estáticos do Worker |
| API e sinalização (`apps/worker`) | Cloudflare Workers + um Durable Object por call |
| TURN (opcional) | Cloudflare Realtime |

Nada "dorme": o primeiro acesso é instantâneo. Os servidores da Cloudflare mais perto de cada pessoa atendem (tem vários no Brasil).

## 1. Conta e deploy automático

1. Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. No menu, abra **Workers & Pages** → **Create** → **Import a repository**.
3. Conecte o GitHub e escolha o repositório `simple-call`.
4. Preencha:

   | Campo | Valor |
   | --- | --- |
   | Project name | `simple-call` (tem que ser igual ao `name` do `wrangler.jsonc`) |
   | Build command | `npx pnpm@10 install --frozen-lockfile && npx pnpm@10 build` |
   | Deploy command | `npx pnpm@10 run deploy` |
   | Root directory | deixe vazio (raiz do repositório) |

5. **Deploy**. Em uns 2 minutos o app fica em `https://simple-call.SEU-SUBDOMINIO.workers.dev`. Na primeira vez a Cloudflare pede pra escolher esse subdomínio.

Cada merge no `main` publica a versão nova sozinho.

Os nomes dos menus da Cloudflare mudam de vez em quando; se algo não bater, procure por "Workers" e "Import a repository".

## 2. TURN (opcional, pra quem não conecta direto)

Na maioria das redes os navegadores se conectam direto. Em algumas (4G, CGNAT de operadora, rede de empresa ou faculdade) isso falha, e a pessoa entra na call mas ninguém se ouve. O TURN resolve repassando a mídia só pra essas conexões. No painel de estatísticas aparece **via TURN** quando ele está em uso.

O TURN da Cloudflare tem **1.000 GB grátis por mês**:

1. No painel, abra **Realtime → TURN Server** e crie uma chave.
2. Anote o **Turn Token ID** e o **API Token**.
3. Abra o Worker `simple-call` → **Settings → Variables and Secrets** e adicione dois **Secrets**:
   - `CF_TURN_KEY_ID` = o Turn Token ID
   - `CF_TURN_API_TOKEN` = o API Token
4. Salve. A próxima call já usa o TURN quando precisar.

Sem essas variáveis o app usa só STUN (grátis, da Cloudflare e do Google), que já resolve a maior parte dos casos.

## Deploy pelo seu PC (alternativa)

Sem conectar o GitHub, dá pra publicar do seu PC: `npx pnpm@10 build` e depois `npx pnpm@10 run deploy`. Na primeira vez o Wrangler abre o navegador pra você entrar na conta da Cloudflare.
