# Colocando no ar

Duas opções, as duas grátis:

| | Nuvem grátis (LiveKit Cloud + Render) | Servidor próprio (Oracle Cloud) |
| --- | --- | --- |
| Cartão | Não precisa | Precisa pra verificar a conta |
| Ping | Mais alto: a mídia passa pelos EUA | Baixo: servidor em São Paulo |
| Limite | ~50 GB de transmissão por mês | 10 TB por mês |
| Primeiro acesso | Site "dorme" após 15 min; acordar leva ~1 min | Sempre ligado |

A nuvem grátis é o jeito mais rápido de testar com os amigos. Pro uso no dia a dia, o servidor próprio é melhor.

---

# Opção A: Nuvem grátis

## 1. LiveKit Cloud (áudio, vídeo e chat)

1. Entre em [cloud.livekit.io](https://cloud.livekit.io) com sua conta do GitHub e crie um projeto (ex.: `simple-call`).
2. Em **Settings → API Keys**, crie uma chave. Anote os três valores:
   - a URL do projeto, tipo `wss://simple-call-xxxx.livekit.cloud`
   - a **API Key**
   - o **API Secret** (só aparece uma vez)

## 2. Render (site + API)

1. Entre em [render.com](https://render.com) com o GitHub.
2. **New → Blueprint** e escolha o repositório `simple-call`. O Render lê o `render.yaml` e cria o serviço no plano grátis.
3. Ele pede três variáveis: cole a URL em `LIVEKIT_URL`, a chave em `LIVEKIT_API_KEY` e o segredo em `LIVEKIT_API_SECRET`.
4. Clique em **Apply** e espere o build (uns 3 minutos). O endereço fica tipo `https://simple-call-xxxx.onrender.com`.

Se o Blueprint pedir cartão, crie na mão: **New → Web Service**, mesmo repositório, plano **Free**, com:

| Campo | Valor |
| --- | --- |
| Build Command | `npx pnpm@10 install --frozen-lockfile && npx pnpm@10 build` |
| Start Command | `NODE_ENV=production node apps/server/dist/index.js` |
| Variáveis | `NODE_VERSION=22`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |

Cada merge no `main` faz o Render publicar a versão nova sozinho.

---

# Opção B: Servidor próprio na Oracle Cloud

Passo a passo pra colocar o Simple Call num servidor Always Free da Oracle em São Paulo. Leva uns 20 minutos, a maior parte esperando a máquina e o build.

No fim você tem o app em `https://call.SEU-IP.sslip.io`, com HTTPS, sem comprar domínio.

## 1. Conta

Crie a conta em [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Na **Home Region**, escolha **Brazil East (São Paulo)**: ela não muda depois e os recursos grátis ficam nela.

## 2. Máquina virtual

No console: **Compute → Instances → Create instance**.

| Campo | Valor |
| --- | --- |
| Name | `simple-call` |
| Image | Canonical Ubuntu 24.04 |
| Shape | Ampere → `VM.Standard.A1.Flex`, 2 OCPUs e 12 GB (o grátis vai até 4 e 24) |
| Networking | Deixe criar a rede padrão, com **IP público** |
| SSH keys | **Generate a key pair for me** e baixe a chave privada |

Guarde a chave em `C:\Users\SEU-USUARIO\.ssh\simple-call.key`. Depois de criada, anote o **Public IP** da instância.

Se aparecer "Out of capacity", tente outro *Availability Domain* ou de novo mais tarde. É comum no plano grátis.

## 3. Portas na rede da Oracle

A Oracle bloqueia tudo por padrão na rede. Abra: **Networking → Virtual cloud networks → (sua VCN) → Security Lists → Default Security List → Add Ingress Rules**, com *Source CIDR* `0.0.0.0/0`:

| Protocolo | Portas | Pra quê |
| --- | --- | --- |
| TCP | 80, 443 | Site e HTTPS |
| TCP | 7881 | Mídia por TCP (redes que bloqueiam UDP) |
| UDP | 3478 | TURN |
| UDP | 50000-60000 | Mídia (áudio, vídeo, tela) |

O firewall dentro do Ubuntu o script de setup já libera sozinho.

## 4. Entrar no servidor

No PowerShell do Windows:

```powershell
# Só na primeira vez: o SSH exige que só você tenha acesso à chave
icacls $HOME\.ssh\simple-call.key /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i $HOME\.ssh\simple-call.key ubuntu@SEU-IP
```

## 5. Instalar e subir

Já dentro do servidor:

```bash
curl -fsSL https://raw.githubusercontent.com/antonioinaciodev/simple-call/main/infra/setup.sh | sudo bash
```

O script instala o Docker, libera o firewall, baixa o código, gera as chaves e sobe tudo. No fim ele mostra o endereço do app.

## Atualizar

Depois de mergear mudanças no GitHub, entre no servidor e rode o mesmo comando do passo 5. Ele puxa o código novo e reconstrói o que mudou.

## Problemas comuns

- **Ver os logs:** `cd /opt/simple-call && sudo docker compose -f infra/docker-compose.yml --env-file infra/.env logs -f`
- **Site não abre:** confira as portas 80 e 443 no passo 3.
- **Entra na call mas não aparece vídeo/áudio de ninguém:** faltam as portas UDP 50000-60000 ou TCP 7881 no passo 3.
- **HTTPS falha com o sslip.io:** use um subdomínio grátis do [DuckDNS](https://www.duckdns.org) apontando pro IP e rode o setup assim, apagando antes o `/opt/simple-call/infra/.env`:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/antonioinaciodev/simple-call/main/infra/setup.sh | sudo APP_DOMAIN=seucall.duckdns.org LIVEKIT_DOMAIN=seulk.duckdns.org bash
  ```
