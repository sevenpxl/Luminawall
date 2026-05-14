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

verify_wayland_environment() {
  info "Verifying Wayland session integrity..."

  if ! command -v wayland-info &>/dev/null; then
    info "wayland-info not found. Installing wayland-utils..."
    case "$PM" in
      apt)    sudo apt-get install -y wayland-utils >/dev/null 2>&1 ;;
      dnf)    sudo dnf install -y wayland-utils >/dev/null 2>&1 ;;
      pacman) sudo pacman -S --noconfirm wayland-utils >/dev/null 2>&1 ;;
    esac
  fi

  if ! command -v wayland-info &>/dev/null; then
    warn "Could not install wayland-info. Bypassing strict Wayland check."
    return 0
  fi

  if ! wayland-info 2>/dev/null | grep -q "wl_output"; then
    echo ""
    error "CRITICAL: Wayland session is restricted or headless."
    error "Reason: 'wl_output' protocol is missing. The compositor is not reporting any monitors."
    error "Impact: swww-daemon will instantly panic and crash (Option::unwrap on None)."
    error "Action: Enable 3D Acceleration in your VM, or log out and switch to an X11 session."
    echo ""
    exit 1
  fi

  if ! wayland-info 2>/dev/null | grep -qE "zwlr_layer_shell_v1|wlr_layer_shell_unstable_v1"; then
    echo ""
    error "CRITICAL: Incompatible Wayland Compositor detected."
    error "Reason: 'wlr-layer-shell' protocol is entirely missing."
    error "Context: Your compositor (likely GNOME/Mutter) strictly refuses to support third-party background rendering."
    error "Impact: It is mathematically impossible for swww to draw a wallpaper in this environment."
    error "Action: Log out and switch to an X11 session to use the xwinwrap backend, or switch to a wlroots compositor (Hyprland/Sway)."
    echo ""
    exit 1
  fi

  ok "Wayland environment validated (wl_output and wlr-layer-shell detected)."
}

ensure_rust() {
  if command -v cargo &>/dev/null; then return 0; fi
  info "Installing Rust via rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o rustup.sh
  info "checking the signature before running the script"
  echo "6c30b75a75b28a96fd913a037c8581b580080b6ee9b8169a3c0feb1af7fe8caf rustup.sh" | sha256sum -c - || { error "Signature mismatch"; exit 1; }
  sh rustup.sh -y
  ok "Rust installed"
  rm -rf rustup.sh
  ok "removed the script"
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
  SWWW_COMMIT="3ee69e3286d9aeb0614f32fe28eee4477d661b02"
  info "Building swww at commit ${SWWW_COMMIT} from source (~2-3 min)…"
  TMP=$(mktemp -d)

  info "Cloning the repository..."
  git clone https://github.com/LGFae/swww.git "$TMP/swww"

  pushd "$TMP/swww" > /dev/null
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
  cargo build --release --locked
  sudo cp target/release/swww target/release/swww-daemon /usr/local/bin/
  popd > /dev/null
  rm -rf "$TMP"
  ok "swww + swww-daemon installed (${SWWW_COMMIT})"
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
  XWINWRAP_COMMIT="ec32e9b72539de7e1553a4f70345166107b431f7"
  info "Building xwinwrap at commit ${XWINWRAP_COMMIT}…"
  TMP=$(mktemp -d)
  
  info "Cloning xwinwrap..."
  git clone https://github.com/ujjwal96/xwinwrap.git "$TMP/xwinwrap"
  pushd "$TMP/xwinwrap" > /dev/null
  
  git checkout "$XWINWRAP_COMMIT"
  
  make
  sudo cp xwinwrap /usr/local/bin/
  popd > /dev/null
  rm -rf "$TMP"
  ok "xwinwrap installed (${XWINWRAP_COMMIT})"
}

install_tauri_deps() {
  info "Installing exhaustive Tauri v2 system-level development stack..."
  case "$PM" in
    apt)
      # OS-Specific Pre-flight: Enable 'universe' repo ONLY on Ubuntu
      if grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
        info "Ubuntu host detected. Enabling 'universe' repository..."
        sudo add-apt-repository -y universe 2>/dev/null || true
      fi

      sudo apt-get update -qq
      sudo apt-get install -y \
        build-essential curl wget file patchelf pkg-config \
        libssl-dev \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        libjavascriptcoregtk-4.1-dev \
        libsoup-3.0-dev \
        librsvg2-dev \
        libglib2.0-dev \
        libcairo2-dev \
        libpango1.0-dev \
        libatk1.0-dev \
        libdbus-1-dev \
        libsystemd-dev \
        libayatana-appindicator3-dev \
        libxdo-dev \
        libxcb-shape0-dev \
        libxcb-xfixes0-dev
      ;;
    dnf)
      sudo dnf install -y \
        webkit2gtk4.1-devel openssl-devel gtk3-devel \
        libayatana-appindicator3-devel librsvg2-devel \
        dbus-devel systemd-devel libsoup3-devel \
        javascriptcoregtk4.1-devel cairo-devel \
        pango-devel atk-devel patchelf
      ;;
    pacman)
      sudo pacman -S --noconfirm \
        webkit2gtk-4.1 openssl gtk3 libayatana-appindicator \
        librsvg dbus libsoup3 patchelf cairo pango atk
      ;;
  esac
  ok "Tauri v2 development stack satisfied."
}

# ─────────────────────────────────────────────────────────────
if   command -v apt-get &>/dev/null; then PM="apt"
elif command -v dnf     &>/dev/null; then PM="dnf"
elif command -v pacman  &>/dev/null; then PM="pacman"
else error "Unsupported distro."; exit 1
fi
info "Package manager: $PM"

install_tauri_deps

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
  verify_wayland_environment
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
  cargo install tauri-cli --locked
  ok "Tauri CLI installed"
fi

# npm
#[[ -f package.json ]] && npm install --ignore-scripts && ok "npm packages installed"
if [[ -f package.json ]]; then
  if [[ -d node_modules ]]; then
    ok "npm packages already installed (node_modules exists)"
  else
    info "Installing npm packages…"
    npm install --ignore-scripts || { error "Failed to install npm packages"; exit 1; }
    ok "npm packages installed"
  fi
fi

echo ""
echo -e "${GREEN}${BOLD}All dependencies ready!${NC}"
echo ""
echo "  Launch:   ./luminawall"
echo "  Dev mode: ./luminawall --dev"
echo ""
