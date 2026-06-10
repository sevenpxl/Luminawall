set -u

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$PROJECT_ROOT" == "/" || -z "$PROJECT_ROOT" ]]; then
    error "Path resolution failed. Script attempted to target root (/). Aborting."
fi

cd "$PROJECT_ROOT" || error "Failed to anchor to project root."
info "Operating from project root: $PROJECT_ROOT"
info "Initiating Absolute LuminaWall Eradication..."

info "Hunting compiled daemons and binaries..."
for bin in /usr/local/bin/swww /usr/local/bin/swww-daemon /usr/local/bin/xwinwrap; do
  if [[ -f "$bin" ]]; then
    sudo rm -f "$bin"
    ok "Purged: $bin"
  fi
done
 
info "Purging graphical development headers..."
sudo apt-get purge -y \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libgtk-3-dev \
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
  libxcb-xfixes0-dev \
  libwayland-dev \
  wayland-protocols \
  libgbm-dev \
  libxkbcommon-dev \
  libx11-dev \
  libxrender-dev \
  libxext-dev \
  libxcomposite-dev \
  patchelf || warn "Some packages were already removed or missing."

info "Running autoremove to clear orphaned dependency chains..."
sudo apt-get autoremove -y
ok "APT packages purged."

info "Removing Tauri CLI from Cargo..."
if command -v cargo-tauri &>/dev/null || cargo install --list 2>/dev/null | grep -q "tauri-cli"; then
  cargo uninstall tauri-cli
  ok "Tauri CLI uninstalled."
else
  ok "Tauri CLI not found. Skipping."
fi

info "Wiping local project artifacts..."
[[ -d "node_modules" ]] && { rm -rf node_modules; ok "node_modules destroyed."; }
[[ -d ".next" ]] && { rm -rf .next; ok "Next.js cache destroyed."; }
[[ -d "src-tauri/target" ]] && { rm -rf src-tauri/target; ok "Local Rust build destroyed."; }

info "Purging global Cargo registry cache..."
if [[ -d "$HOME/.cargo/registry" ]]; then
  rm -rf "$HOME/.cargo/registry/cache"
  rm -rf "$HOME/.cargo/registry/src"
  ok "Global Rust crate cache cleared."
fi

echo ""
echo -e "${GREEN}System restored. The environment is clean.${NC}"