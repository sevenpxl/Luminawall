"use client";
/**
 * InstallGuide.tsx
 * Shown when required dependencies are missing.
 * Automatically shows X11 or Wayland instructions based on detected session.
 */
import React, { useState } from "react";

const C = {
  bg: "#1c1c1e", surface: "#2c2c2e", border: "#3a3a3c",
  accent: "#0a84ff", green: "#30d158", amber: "#ffd60a", red: "#ff453a",
  textHi: "#ffffff", textMain: "#ebebf5cc", textMid: "#ebebf599", textDim: "#ebebf54d",
  sans: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
  mono: "'SF Mono', 'Fira Code', monospace",
};

type Distro = "apt" | "dnf" | "pacman";

interface Props {
  missingMpv:      boolean;
  missingXwinwrap: boolean;
  missingXrandr:   boolean;
  missingSwww:     boolean;
  displayServer:   string;
  onRefresh:       () => void;
}

export default function InstallGuide({
  missingMpv, missingXwinwrap, missingXrandr, missingSwww, displayServer, onRefresh,
}: Props) {
  const [distro, setDistro] = useState<Distro>("apt");
  const isWayland = displayServer === "wayland";

  // Build the one-shot install command shown at the bottom
  const oneShot: Record<Distro, string> = {
    apt:    "bash scripts/install-deps.sh",
    dnf:    "bash scripts/install-deps.sh",
    pacman: "bash scripts/install-deps.sh",
  };

  const sections: { title: string; show: boolean; cmds: Record<Distro, string> }[] = [
    {
      title: "mpv  (video decoder)",
      show:  missingMpv,
      cmds: {
        apt:    "sudo apt install -y mpv",
        dnf:    "sudo dnf install -y mpv",
        pacman: "sudo pacman -S --noconfirm mpv",
      },
    },
    {
      title: "swww  (Wayland animated wallpaper daemon)",
      show:  isWayland && missingSwww,
      cmds: {
        apt:    "# Build from source (Rust required):\ncargo install swww\n# OR download binary from: https://github.com/LGFae/swww/releases",
        dnf:    "# Build from source:\ncargo install swww\n# OR check copr / rpm repos for your distro",
        pacman: "# AUR:\nyay -S swww\n# or: paru -S swww",
      },
    },
    {
      title: "xwinwrap  (X11 wallpaper wrapper)",
      show:  !isWayland && missingXwinwrap,
      cmds: {
        apt:    "# Build from source:\nbash scripts/install-deps.sh",
        dnf:    "bash scripts/install-deps.sh",
        pacman: "yay -S xwinwrap-git",
      },
    },
    {
      title: "xrandr  (X11 monitor detection)",
      show:  !isWayland && missingXrandr,
      cmds: {
        apt:    "sudo apt install -y x11-xserver-utils",
        dnf:    "sudo dnf install -y xrandr",
        pacman: "sudo pacman -S --noconfirm xorg-xrandr",
      },
    },
  ].filter((s) => s.show);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: 32, fontFamily: C.sans,
    }}>
      <div style={{ maxWidth: 540, width: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.textHi, marginBottom: 6 }}>
            🎬 LuminaWall
          </h1>
          <p style={{ fontSize: 13, color: C.textMid }}>
            Missing {sections.length} dependenc{sections.length === 1 ? "y" : "ies"} for{" "}
            <span style={{
              color: isWayland ? C.accent : C.green,
              background: isWayland ? "#0a84ff22" : "#30d15822",
              borderRadius: 4, padding: "1px 7px", fontSize: 12,
              fontFamily: C.mono,
            }}>
              {displayServer.toUpperCase()}
            </span>
          </p>
        </div>

        {/* Distro picker */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["apt", "dnf", "pacman"] as Distro[]).map((d) => (
            <button key={d} onClick={() => setDistro(d)} style={{
              padding: "5px 16px", borderRadius: 20, fontSize: 12,
              fontFamily: C.mono, cursor: "pointer",
              border: `1px solid ${distro === d ? C.accent : C.border}`,
              background: distro === d ? "#0a84ff18" : "transparent",
              color: distro === d ? C.accent : C.textMid,
              transition: "all .15s",
            }}>{d}</button>
          ))}
        </div>

        {/* Install sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {sections.map((sec) => (
            <div key={sec.title}>
              <p style={{ fontSize: 11, color: C.textDim, marginBottom: 6, fontFamily: C.mono }}>
                {sec.title}
              </p>
              <pre style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "12px 16px", margin: 0,
                fontSize: 12, color: C.green, overflowX: "auto",
                fontFamily: C.mono, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {sec.cmds[distro]}
              </pre>
            </div>
          ))}
        </div>

        {/* One-shot script */}
        <div style={{
          marginTop: 24, padding: "16px",
          border: `1px solid ${C.amber}33`,
          background: "#ffd60a08", borderRadius: 10,
        }}>
          <p style={{ fontSize: 11, color: C.amber, marginBottom: 8, fontFamily: C.mono }}>
            OR — run the all-in-one installer (handles everything above):
          </p>
          <pre style={{
            margin: 0, fontSize: 12, color: C.textMain, fontFamily: C.mono,
          }}>{oneShot[distro]}</pre>
        </div>

        {/* Refresh */}
        <button onClick={onRefresh} style={{
          marginTop: 20, width: "100%",
          padding: "11px 0", borderRadius: 10,
          background: C.accent, border: "none",
          color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: "pointer", transition: "opacity .15s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          ↺  Re-check dependencies
        </button>
      </div>
    </div>
  );
}
