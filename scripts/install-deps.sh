#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  LuminaWall — dependency installer
#  Supports Wayland (swww + mpv) and X11 (xwinwrap + mpv)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }

ensure_rust() {
  if command -v cargo &>/dev/null; then return 0; fi
  info "Installing Rust via rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
  ok "Rust installed"
}

build_swww() {
  ensure_rust
  info "Installing swww system build dependencies…"
  case "$PM" in
    apt)
      sudo apt-get update -qq
      sudo apt-get install -y \
        liblz4-dev libxkbcommon-dev libwayland-dev \
        wayland-protocols libgbm-dev pkg-config build-essential git
      ;;
    dnf)
      sudo dnf install -y \
        lz4-devel libxkbcommon-devel wayland-devel \
        wayland-protocols-devel mesa-libgbm-devel pkg-config gcc git
      ;;
    pacman)
      sudo pacman -S --noconfirm \
        lz4 libxkbcommon wayland wayland-protocols \
        mesa pkgconf base-devel git
      ;;
  esac

  # Use stable release tag v0.9.5 — the git master branch has a known panic bug
  SWWW_TAG="v0.9.5"
  info "Building swww ${SWWW_TAG} from source (~2-3 min)…"
  TMP=$(mktemp -d)
  git clone --depth 1 --branch "$SWWW_TAG" \
    https://github.com/LGFae/swww.git "$TMP/swww" 2>/dev/null || {
    warn "Tag ${SWWW_TAG} not found, trying latest stable…"
    git clone https://github.com/LGFae/swww.git "$TMP/swww"
    cd "$TMP/swww"
    # Get latest stable tag
    LATEST=$(git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
    info "Using tag: $LATEST"
    git checkout "$LATEST"
  }
  pushd "$TMP/swww" > /dev/null
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
  cargo build --release
  sudo cp target/release/swww target/release/swww-daemon /usr/local/bin/
  popd > /dev/null
  rm -rf "$TMP"
  ok "swww + swww-daemon installed (${SWWW_TAG})"
}

build_xwinwrap() {
  info "Installing xwinwrap build dependencies…"
  case "$PM" in
    apt)
      sudo apt-get update -qq
      sudo apt-get install -y \
        gcc make libx11-dev libxrender-dev libxext-dev libxcomposite-dev pkg-config git
      ;;
    dnf)
      sudo dnf install -y \
        gcc make libX11-devel libXrender-devel libXext-devel libXcomposite-devel pkg-config git
      ;;
    pacman)
      sudo pacman -S --noconfirm \
        gcc make libx11 libxrender libxext libxcomposite pkgconf git
      ;;
  esac
  info "Building xwinwrap…"
  TMP=$(mktemp -d)
  git clone --depth 1 https://github.com/ujjwal96/xwinwrap.git "$TMP/xwinwrap"
  pushd "$TMP/xwinwrap" > /dev/null
  make
  sudo cp xwinwrap /usr/local/bin/
  popd > /dev/null
  rm -rf "$TMP"
  ok "xwinwrap installed"
}

# ─────────────────────────────────────────────────────────────
if   command -v apt-get &>/dev/null; then PM="apt"
elif command -v dnf     &>/dev/null; then PM="dnf"
elif command -v pacman  &>/dev/null; then PM="pacman"
else error "Unsupported distro."; exit 1
fi
info "Package manager: $PM"

if [[ -n "${WAYLAND_DISPLAY:-}" ]] || [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
  SESSION="wayland"
elif [[ -n "${DISPLAY:-}" ]] || [[ "${XDG_SESSION_TYPE:-}" == "x11" ]]; then
  SESSION="x11"
else
  SESSION="unknown"
fi
info "Display server: $SESSION"

# mpv
if command -v mpv &>/dev/null; then
  ok "mpv already installed"
else
  info "Installing mpv…"
  case "$PM" in
    apt)    sudo apt-get update -qq && sudo apt-get install -y mpv ;;
    dnf)    sudo dnf install -y mpv ;;
    pacman) sudo pacman -Sy --noconfirm mpv ;;
  esac
  ok "mpv installed"
fi

# Wayland: swww
if [[ "$SESSION" == "wayland" || "$SESSION" == "unknown" ]]; then
  # Remove broken swww if it panics
  if command -v swww &>/dev/null; then
    SWWW_VER=$(swww --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
    ok "swww already installed (v${SWWW_VER})"
    # Test if daemon works
    if swww-daemon --help &>/dev/null 2>&1; then
      ok "swww-daemon functional"
    else
      warn "swww-daemon appears broken — rebuilding from stable tag…"
      sudo rm -f /usr/local/bin/swww /usr/local/bin/swww-daemon
      build_swww
    fi
  else
    info "Installing swww…"
    case "$PM" in
      pacman)
        if   command -v yay  &>/dev/null; then yay  -S --noconfirm swww && ok "swww installed via yay"
        elif command -v paru &>/dev/null; then paru -S --noconfirm swww && ok "swww installed via paru"
        else build_swww
        fi
        ;;
      apt|dnf) build_swww ;;
    esac
  fi
fi

# X11: xrandr + xwinwrap
if [[ "$SESSION" == "x11" || "$SESSION" == "unknown" ]]; then
  if command -v xrandr &>/dev/null; then
    ok "xrandr already installed"
  else
    case "$PM" in
      apt)    sudo apt-get install -y x11-xserver-utils ;;
      dnf)    sudo dnf install -y xrandr ;;
      pacman) sudo pacman -S --noconfirm xorg-xrandr ;;
    esac
    ok "xrandr installed"
  fi
  command -v xwinwrap &>/dev/null && ok "xwinwrap already installed" || build_xwinwrap
fi

# Rust
ensure_rust
ok "Rust ready ($(cargo --version))"

# Tauri CLI
if cargo tauri --version &>/dev/null 2>&1; then
  ok "Tauri CLI already installed"
else
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
  cargo install tauri-cli
  ok "Tauri CLI installed"
fi

# npm
[[ -f package.json ]] && npm install && ok "npm packages installed"

echo ""
echo -e "${GREEN}${BOLD}All dependencies ready!${NC}"
echo ""
echo "  Launch:   ./luminawall"
echo "  Dev mode: ./luminawall --dev"
echo ""
