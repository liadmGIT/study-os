#!/usr/bin/env bash
# One-command setup for a fresh Ubuntu server (Oracle Cloud Always Free, Google Cloud, any VPS):
#
#   curl -fsSL https://raw.githubusercontent.com/liadmGIT/study-os/main/deploy/setup-server.sh | bash
#
# Installs Docker, downloads the app, creates the settings file with random secrets, gets an
# HTTPS address (<ip>.sslip.io) and starts everything. Run the same command again to update to
# the latest version; data and settings are kept.
#
# Optional: APP_PASSWORD=... DOMAIN=my.domain.com  (before "bash") to choose them yourself.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/liadmGIT/study-os.git}"
APP_DIR="${APP_DIR:-$HOME/study-os}"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

check_os() {
  if ! grep -qiE '^ID(_LIKE)?=.*(ubuntu|debian)' /etc/os-release 2>/dev/null; then
    warn "This script expects Ubuntu or Debian. On Oracle Cloud, create the server with the 'Canonical Ubuntu' image."
    exit 1
  fi
}

add_swap() {
  # Small machines (1 GB) need swap to build the app.
  local mem_kb
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  if [ "$mem_kb" -lt 3000000 ] && ! swapon --show | grep -q .; then
    say "Adding 2 GB of swap (this machine has little memory)"
    $SUDO fallocate -l 2G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile >/dev/null
    $SUDO swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
}

install_tools() {
  if ! command -v git >/dev/null || ! command -v openssl >/dev/null || ! command -v curl >/dev/null; then
    say "Installing git, curl and openssl"
    $SUDO apt-get update -qq </dev/null
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl openssl </dev/null >/dev/null
  fi
  if ! command -v docker >/dev/null; then
    say "Installing Docker"
    curl -fsSL https://get.docker.com | $SUDO sh >/dev/null
  fi
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
}

open_firewall() {
  # Oracle's Ubuntu images reject everything except SSH in iptables, even after the
  # cloud firewall (Security List) allows it. Open 80/443 and keep the rule after reboots.
  if command -v iptables >/dev/null && $SUDO iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
    say "Opening ports 80 and 443 in the server's firewall"
    for port in 80 443; do
      $SUDO iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || $SUDO iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
    done
    if command -v netfilter-persistent >/dev/null; then $SUDO netfilter-persistent save >/dev/null 2>&1 || true; fi
  fi
  if command -v ufw >/dev/null && $SUDO ufw status 2>/dev/null | grep -q 'Status: active'; then
    $SUDO ufw allow 80/tcp >/dev/null
    $SUDO ufw allow 443/tcp >/dev/null
  fi
}

get_code() {
  if [ -d "$APP_DIR/.git" ]; then
    say "Updating to the latest version"
    git -C "$APP_DIR" pull --ff-only </dev/null
  else
    say "Downloading the app"
    git clone --depth 1 "$REPO_URL" "$APP_DIR" </dev/null
  fi
}

public_ip() {
  curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 10 https://ifconfig.me 2>/dev/null
}

# Writes .env the first time only, so secrets (and the encrypted Moodle connection) survive updates.
write_env() {
  local dir="$1"
  if [ -f "$dir/.env" ]; then
    FIRST_RUN=0
    return
  fi
  FIRST_RUN=1
  local ip domain password
  if [ -n "${DOMAIN:-}" ]; then
    domain="$DOMAIN"
  else
    ip="$(public_ip)"
    if [ -z "$ip" ]; then
      warn "Couldn't find this server's public IP. Run again with DOMAIN=<your address>."
      exit 1
    fi
    domain="$ip.sslip.io"
  fi
  password="${APP_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)}"
  umask 077
  cat >"$dir/.env" <<EOF
# Created by deploy/setup-server.sh. Keep this file private.
APP_PASSWORD=$password
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
SESSION_SECRET=$(openssl rand -base64 32 | tr -d '\n')
PUBLIC_URL=https://$domain
DOMAIN=$domain
TRUST_PROXY_HOPS=1
EOF
}

env_value() {
  grep -E "^$1=" "$APP_DIR/.env" | head -1 | cut -d= -f2-
}

start_app() {
  say "Building and starting (the first time takes a few minutes)"
  (cd "$APP_DIR" && $SUDO docker compose up -d --build --remove-orphans </dev/null)
  say "Waiting for the app to come up"
  for _ in $(seq 1 60); do
    if (cd "$APP_DIR" && $SUDO docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" </dev/null >/dev/null 2>&1); then
      return 0
    fi
    sleep 3
  done
  warn "The app didn't answer yet. Logs: cd $APP_DIR && sudo docker compose logs app"
}

main() {
  check_os
  add_swap
  install_tools
  open_firewall
  get_code
  write_env "$APP_DIR"
  start_app

  local url
  url="$(env_value PUBLIC_URL)"
  printf '\n\033[1;32m✔ Study OS is running\033[0m\n'
  echo "   Address:  $url"
  if [ "$FIRST_RUN" = 1 ]; then
    echo "   Password: $(env_value APP_PASSWORD)    (save it; it's also in $APP_DIR/.env)"
  else
    echo "   Password: unchanged (see APP_PASSWORD in $APP_DIR/.env)"
  fi
  echo
  echo "   If the address doesn't open within a couple of minutes, make sure ports 80 and 443"
  echo "   are allowed in the cloud firewall (Oracle: Subnet → Security List → Ingress Rules)."
  echo "   To update later, run the same command again."
}

# Everything runs from main(), so "curl … | bash" reads the whole script before running any of it.
if [ "${STUDY_OS_SOURCE_ONLY:-}" != 1 ]; then main "$@"; fi
