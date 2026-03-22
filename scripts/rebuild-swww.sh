#!/usr/bin/env bash
# Rebuilds swww from the latest stable release tag.
# Run this if swww-daemon keeps crashing.
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }

# Ensure build deps
if command -v apt-get &>/dev/null; then
  sudo apt-get install -y liblz4-dev libxkbcommon-dev libwayland-dev \
    wayland-protocols pkg-config build-essential git 2>/dev/null
fi

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
if ! command -v cargo &>/dev/null; then
  info "Installing Rust…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

# Remove broken installation
sudo rm -f /usr/local/bin/swww /usr/local/bin/swww-daemon

TMP=$(mktemp -d)
info "Cloning swww repository…"
git clone https://github.com/LGFae/swww.git "$TMP/swww"
cd "$TMP/swww"

# Pick latest stable tag (e.g. v0.9.5, not master)
LATEST=$(git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
info "Building swww ${LATEST}…"
git checkout "$LATEST"
cargo build --release

sudo cp target/release/swww target/release/swww-daemon /usr/local/bin/
cd / && rm -rf "$TMP"

ok "swww ${LATEST} installed to /usr/local/bin/"
echo ""
echo "Test it:  swww-daemon &  &&  sleep 1  &&  swww query"
