#!/usr/bin/env bash
# Configura um servidor Ubuntu (ex.: Oracle Cloud Always Free) e sobe o Simple Call.
# Rode no servidor, via SSH:
#
#   curl -fsSL https://raw.githubusercontent.com/antonioinaciodev/simple-call/main/infra/setup.sh | sudo bash
#
# Pode rodar de novo quando quiser: ele atualiza o código e reinicia os containers.
# Pra usar um domínio próprio em vez do sslip.io, rode com APP_DOMAIN e LIVEKIT_DOMAIN:
#
#   curl -fsSL .../setup.sh | sudo APP_DOMAIN=call.meudominio.com LIVEKIT_DOMAIN=lk.meudominio.com bash
set -euo pipefail

REPO_URL="https://github.com/antonioinaciodev/simple-call.git"
DIR="/opt/simple-call"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo." >&2
  exit 1
fi

log "Instalando Docker e Git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 docker-buildx git curl openssl >/dev/null
systemctl enable --now docker >/dev/null

log "Liberando portas no firewall do sistema"
# As imagens Ubuntu da Oracle vêm com iptables bloqueando quase tudo.
# As regras vão pro topo da lista; o -C evita duplicar quando o script roda de novo.
allow() {
  iptables -C INPUT "$@" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 "$@" -j ACCEPT
}
allow -p tcp -m multiport --dports 80,443,7881
allow -p udp -m multiport --dports 443,3478
allow -p udp --dport 50000:60000
if command -v netfilter-persistent >/dev/null; then
  netfilter-persistent save >/dev/null
fi

log "Baixando o código"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$DIR"
fi

ENV_FILE="$DIR/infra/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Gerando configuração e chaves"
  # IP público: tenta alguns serviços (ou use PUBLIC_IP=... na frente do comando).
  PUBLIC_IP="${PUBLIC_IP:-$(curl -4 -fsS https://api.ipify.org || curl -4 -fsS https://ifconfig.me || curl -4 -fsS https://icanhazip.com || true)}"
  PUBLIC_IP="$(echo "$PUBLIC_IP" | tr -d '[:space:]')"
  if [ -z "$PUBLIC_IP" ]; then
    echo "Não consegui descobrir o IP público. Rode de novo com PUBLIC_IP=SEU-IP na frente." >&2
    exit 1
  fi
  DASHED="${PUBLIC_IP//./-}"
  cat >"$ENV_FILE" <<CONF
APP_DOMAIN=${APP_DOMAIN:-call.$DASHED.sslip.io}
LIVEKIT_DOMAIN=${LIVEKIT_DOMAIN:-lk.$DASHED.sslip.io}
PUBLIC_IP=$PUBLIC_IP
LIVEKIT_API_KEY=API$(openssl rand -hex 8)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
CONF
  chmod 600 "$ENV_FILE"
fi

log "Subindo os containers (a primeira vez demora alguns minutos)"
docker compose -f "$DIR/infra/docker-compose.yml" --env-file "$ENV_FILE" up -d --build

APP_URL="$(grep '^APP_DOMAIN=' "$ENV_FILE" | cut -d= -f2)"
log "Pronto! Abra https://$APP_URL"
echo "O certificado HTTPS pode levar um minuto pra ser emitido na primeira vez."
echo "Se não abrir, confira se as portas estão liberadas na Security List da Oracle (veja docs/DEPLOY.md)."
