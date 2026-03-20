# LuminaWall

> Set any video as your Linux desktop wallpaper — built with Tauri, Rust, and Next.js.

```
┌──────────────────────────────────────────────────────────┐
│  LUMINA WALL                          mpv ✓  xwinwrap ✓  │
│  live video desktop wallpaper · X11              X11     │
├──────────────────────────────────────────────────────────┤
│  VIDEO SOURCE                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │      ⬇  Drop a video here, or click to browse      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  PLAYBACK SETTINGS                                       │
│  ○ Mute Audio          ○ Loop Video                      │
│                                                          │
│  SYSTEM                                                  │
│  ○ Start on Boot                                         │
│                                                          │
│  [ ▶  SET AS WALLPAPER ]   [ ■  STOP ]                   │
├──────────────────────────────────────────────────────────│
│  ● Wallpaper started: /home/user/bg.mp4                  │
└──────────────────────────────────────────────────────────┘
```

---

## Architecture

```
luminawall/
├── src-tauri/
│   ├── src/
│   │   └── main.rs          ← Rust backend (all Tauri commands)
│   ├── build.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/
│   ├── app/
│   │   ├── App.tsx           ← Main UI component
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── hooks/
│   │   └── useWallpaper.ts   ← All state + Tauri invoke calls
│   └── lib/
│       └── tauriCommands.ts  ← Typed wrappers for Rust commands
│
├── scripts/
│   └── install-deps.sh       ← One-shot dependency installer
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  LuminaWall (Tauri window)                                  │
│  Next.js UI ──invoke──► Rust main.rs                        │
│                              │                              │
│                              ▼                              │
│                       xwinwrap -ov -ni -b                   │
│                          │                                  │
│                          └──► mpv --wid=WID video.mp4       │
│                                    │                        │
│                                    ▼                        │
│                             X11 root window                 │
│                     (behind icons, above wallpaper)         │
└─────────────────────────────────────────────────────────────┘
```

**xwinwrap** creates an override-redirect X window parented to the root.
**mpv** renders into that window using `--wid=WID` (the WID token is
replaced by xwinwrap at runtime). Because the window sits at the bottom
of the Z-stack, desktop icons float above it normally.

---

## Requirements

| Dependency | Notes |
|------------|-------|
| X11        | Wayland support via `swww` planned |
| `mpv`      | Media playback engine |
| `xwinwrap` | Window wrapper for embedding mpv in root |
| Rust ≥ 1.70 | `cargo` on $PATH |
| Node ≥ 18  | npm / yarn |

---

## Quick start

```bash
# 1. Install system dependencies (mpv, xwinwrap, Rust, Tauri CLI)
chmod +x scripts/install-deps.sh
./scripts/install-deps.sh

# 2. Run in development mode
npm run tauri:dev

# 3. Build a distributable .deb / AppImage
npm run tauri:build
```

---

## Tauri Commands (Rust → TypeScript)

| Command | Args | Returns |
|---------|------|---------|
| `detect_display_server` | — | `"x11" \| "wayland" \| "unknown"` |
| `check_dependencies` | — | `{ mpv: bool, xwinwrap: bool }` |
| `start_wallpaper` | `WallpaperOptions` | `Ok(String) \| Err(String)` |
| `stop_wallpaper` | — | `String` |
| `set_autostart` | `enabled, videoPath, muted` | `Ok(String) \| Err(String)` |

---

## Roadmap

- [ ] Wayland support via `swww` / `swaybg`
- [ ] Per-monitor configuration
- [ ] Playlist / shuffle mode
- [ ] Blur / dimming overlay controls
- [ ] AppImage packaging with bundled icons