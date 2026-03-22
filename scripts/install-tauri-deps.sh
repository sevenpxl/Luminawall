#!/usr/bin/env bash
# Installs Tauri v2 system dependencies for Ubuntu (tested on 25.10 Questing)
set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
info() { echo -e "${GREEN}[INFO]${NC}  $*"; }

if ! command -v apt-get &>/dev/null; then
  echo "This script requires apt (Ubuntu/Debian)."; exit 1
fi

info "Ubuntu $(lsb_release -rs 2>/dev/null) ($(lsb_release -cs 2>/dev/null))"
sudo add-apt-repository -y universe 2>/dev/null || true
sudo apt-get update -qq

info "Installing Tauri v2 system dependencies…"
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libgdk-pixbuf-xlib-2.0-dev \
  libssl-dev \
  libgtk-3-dev \
  librsvg2-dev \
  libglib2.0-dev \
  libcairo2-dev \
  libpango1.0-dev \
  libatk1.0-dev \
  libdbus-1-dev \
  libxdo-dev \
  libxcb-shape0-dev \
  libxcb-xfixes0-dev \
  patchelf \
  pkg-config \
  build-essential

ok "All Tauri v2 system dependencies installed."
echo ""
echo "Now run:  ./luminawall"
