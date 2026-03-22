"use client";
/**
 * LuminaWall — App.tsx (v3)
 * UI design: macOS-style background picker — dark panel, video thumbnail cards,
 * checkmark selection, "Add Video…" button, sidebar settings.
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import { open }               from "@tauri-apps/plugin-dialog";
import { convertFileSrc }     from "@tauri-apps/api/core";
import { useWallpaper }       from "@/hooks/useWallpaper";
import InstallGuide           from "@/components/InstallGuide";

// ─────────────────────────────────────────────────────────────
//  Tokens
// ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#1c1c1e",   // macOS dark systemBackground
  surface:  "#2c2c2e",   // elevated card
  surface2: "#3a3a3c",
  border:   "#3a3a3c",
  borderHi: "#636366",
  accent:   "#0a84ff",   // iOS/macOS blue
  accentHi: "#409cff",
  green:    "#30d158",
  red:      "#ff453a",
  amber:    "#ffd60a",
  textHi:   "#ffffff",
  textMain: "#ebebf5cc",
  textMid:  "#ebebf599",
  textDim:  "#ebebf54d",
  sans:     "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
  mono:     "'SF Mono', 'Fira Code', monospace",
};

// ─────────────────────────────────────────────────────────────
//  Video library entry (client-side, in-memory)
// ─────────────────────────────────────────────────────────────
interface VideoEntry {
  id:        string;
  path:      string;
  name:      string;
  /** data: or tauri-asset: URL for the thumbnail canvas snapshot */
  thumbnail: string | null;
}

// ─────────────────────────────────────────────────────────────
//  Thumbnail generator — draws first frame of video to canvas
// ─────────────────────────────────────────────────────────────
function generateThumbnail(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const src   = convertFileSrc(filePath);
      const video = document.createElement("video");
      video.src          = src;
      video.muted        = true;
      video.currentTime  = 1.5;
      video.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-9999px";
      document.body.appendChild(video);

      const cleanup = () => { try { document.body.removeChild(video); } catch (_) {} };

      const snap = () => {
        const canvas  = document.createElement("canvas");
        canvas.width  = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth) {
          ctx.drawImage(video, 0, 0, 320, 180);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        } else {
          resolve("");
        }
        cleanup();
      };

      video.addEventListener("seeked",  snap, { once: true });
      video.addEventListener("error",   () => { resolve(""); cleanup(); }, { once: true });
      video.addEventListener("loadeddata", () => { video.currentTime = 1.5; }, { once: true });
      // Timeout fallback
      setTimeout(() => { snap(); }, 2000);
    } catch (_) {
      resolve("");
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  VideoCard
// ─────────────────────────────────────────────────────────────
interface VideoCardProps {
  entry:       VideoEntry;
  selected:    boolean;
  active:      boolean;   // currently playing as wallpaper
  onSelect:    (id: string) => void;
  onRemove:    (id: string) => void;
}

const VideoCard = ({ entry, selected, active, onSelect, onRemove }: VideoCardProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onSelect(entry.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        width: 160,
        height: 100,
        flexShrink: 0,
        border: selected
          ? `2px solid ${C.accent}`
          : `2px solid transparent`,
        boxShadow: selected
          ? `0 0 0 1px ${C.accent}66, 0 4px 20px #00000066`
          : "0 2px 12px #00000044",
        transition: "border-color .15s, box-shadow .15s, transform .12s",
        transform: hovered && !selected ? "scale(1.03)" : "scale(1)",
        background: "#000",
      }}
    >
      {/* Thumbnail */}
      {entry.thumbnail ? (
        <img
          src={entry.thumbnail}
          alt={entry.name}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover", display: "block",
            filter: selected ? "brightness(0.85)" : "brightness(0.75)",
            transition: "filter .15s",
          }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 28, opacity: 0.4 }}>🎬</span>
        </div>
      )}

      {/* Overlay gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, #00000099 0%, transparent 55%)",
      }} />

      {/* File name */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "4px 8px 6px",
        fontSize: 10, color: C.textMain,
        fontFamily: C.sans, fontWeight: 500,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {entry.name.replace(/\.[^.]+$/, "")}
      </div>

      {/* LIVE badge */}
      {active && (
        <div style={{
          position: "absolute", top: 7, left: 7,
          background: C.green, borderRadius: 4,
          fontSize: 9, fontFamily: C.mono, fontWeight: 700,
          color: "#000", padding: "2px 6px", letterSpacing: "0.06em",
        }}>
          LIVE
        </div>
      )}

      {/* Checkmark */}
      {selected && (
        <div style={{
          position: "absolute", bottom: 8, right: 8,
          width: 22, height: 22, borderRadius: "50%",
          background: C.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 2px 8px ${C.accent}88`,
        }}>
          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
            <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Remove button — shown on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
          style={{
            position: "absolute", top: 6, right: 6,
            width: 20, height: 20, borderRadius: "50%",
            background: "rgba(0,0,0,0.7)", border: "1px solid #ffffff33",
            color: C.textMain, fontSize: 13, lineHeight: 1,
            cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            padding: 0,
          }}
          title="Remove"
        >×</button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Add Video button card
// ─────────────────────────────────────────────────────────────
const AddCard = ({ onAdd, dragging }: { onAdd: () => void; dragging: boolean }) => (
  <div
    onClick={onAdd}
    style={{
      width: 160, height: 100, borderRadius: 10, flexShrink: 0,
      border: `2px dashed ${dragging ? C.accent : C.border}`,
      background: dragging ? `${C.accent}0a` : "transparent",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 6, cursor: "pointer",
      transition: "border-color .15s, background .15s, transform .12s",
      transform: dragging ? "scale(1.03)" : "scale(1)",
    }}
  >
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      background: C.surface2,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 18, color: C.textMid, lineHeight: 1,
    }}>+</div>
    <span style={{
      fontSize: 11, color: C.textMid, fontFamily: C.sans, fontWeight: 500,
    }}>Add Video…</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Slider atom
// ─────────────────────────────────────────────────────────────
interface SliderProps {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void; disabled?: boolean;
}
const Slider = ({ label, value, min, max, step, display, onChange, disabled }: SliderProps) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: C.textMid, fontFamily: C.sans }}>{label}</span>
        <span style={{ fontSize: 12, color: C.textMain, fontFamily: C.mono }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%", height: 4, appearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          background: `linear-gradient(to right, ${C.accent} ${pct}%, ${C.surface2} ${pct}%)`,
          borderRadius: 2, outline: "none", border: "none", opacity: disabled ? 0.4 : 1,
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Toggle row
// ─────────────────────────────────────────────────────────────
interface ToggleRowProps {
  label: string; checked: boolean;
  onChange: () => void; disabled?: boolean;
}
const ToggleRow = ({ label, checked, onChange, disabled }: ToggleRowProps) => (
  <div style={{
    display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "2px 0",
  }}>
    <span style={{
      fontSize: 13, color: disabled ? C.textDim : C.textMain,
      fontFamily: C.sans,
    }}>{label}</span>
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        position: "relative", width: 44, height: 26, borderRadius: 13,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? C.accent : C.surface2,
        transition: "background .2s",
        flexShrink: 0, outline: "none",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: checked ? 21 : 3, width: 20, height: 20,
        borderRadius: "50%", background: "#fff",
        transition: "left .2s",
        boxShadow: "0 1px 4px #00000033",
      }} />
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Monitor selector pill
// ─────────────────────────────────────────────────────────────
interface MonitorPillProps {
  label: string; active: boolean; running: boolean; onClick: () => void;
}
const MonitorPill = ({ label, active, running, onClick }: MonitorPillProps) => (
  <button
    onClick={onClick}
    style={{
      padding: "5px 14px", borderRadius: 20, fontSize: 12,
      fontFamily: C.sans, fontWeight: 500, cursor: "pointer",
      border: `1px solid ${active ? C.accent : C.border}`,
      background: active ? `${C.accent}18` : "transparent",
      color: active ? C.accent : C.textMid,
      display: "flex", alignItems: "center", gap: 6,
      transition: "all .15s",
    }}
  >
    {running && (
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: C.green, display: "inline-block",
        boxShadow: `0 0 5px ${C.green}`,
      }} />
    )}
    {label}
  </button>
);

// ─────────────────────────────────────────────────────────────
//  Main App
// ─────────────────────────────────────────────────────────────
export default function App() {
  const wl = useWallpaper();
  const {
    deps, appStatus, statusMessage,
    slots, selectedMonitorIdx, setSelectedMonitor,
    setVideoFile,
    settings, updateSettings,
    startOne, stopOne, startAll, stopAll,
    toggleAutostart, refreshMonitors,
  } = wl;

  // Local video library (in-memory; persisted via settings.assignments)
  const [library, setLibrary] = useState<VideoEntry[]>([]);
  // Which library entry is selected (highlighted)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Drag-over state for the whole panel
  const [panelDrag, setPanelDrag] = useState(false);
  const dragCounter = useRef(0);

  // Determine which entry is actively playing on the selected monitor
  const selectedSlot = slots.find((s) => s.monitor.index === selectedMonitorIdx);
  const activeEntryId = library.find(
    (e) => e.path === selectedSlot?.videoPath
  )?.id ?? null;

  // ── Restore library from saved assignments on boot ──────
  useEffect(() => {
    const existing = settings.assignments;
    if (!existing.length) return;
    setLibrary((prev) => {
      const currentPaths = new Set(prev.map((e) => e.path));
      const additions: VideoEntry[] = [];
      for (const a of existing) {
        if (!currentPaths.has(a.video_path)) {
          const id   = `vid-${Date.now()}-${Math.random()}`;
          const name = a.video_path.split("/").pop() ?? a.video_path;
          additions.push({ id, path: a.video_path, name, thumbnail: null });
        }
      }
      return [...prev, ...additions];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Add videos ───────────────────────────────────────────
  const addVideos = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const name      = path.split("/").pop() ?? path;
      const id        = `vid-${Date.now()}-${Math.random()}`;
      const thumbnail = await generateThumbnail(path);
      const entry: VideoEntry = { id, path, name, thumbnail };
      setLibrary((prev) => {
        if (prev.some((e) => e.path === path)) return prev; // dedupe
        return [...prev, entry];
      });
    }
  }, []);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Video", extensions: ["mp4", "mkv", "webm", "avi", "mov"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected as string];
      await addVideos(paths.filter(Boolean) as string[]);
    } catch (err) {
      console.error("File dialog error:", err);
      alert("Could not open file dialog: " + String(err));
    }
  }, [addVideos]);

  const handleRemove = useCallback((id: string) => {
    setLibrary((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  // ── Drag-drop onto the whole panel ──────────────────────
  const handlePanelDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setPanelDrag(false);
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => /\.(mp4|mkv|webm|avi|mov)$/i.test(f.name));
    await addVideos(files.map((f) => (f as any).path ?? f.name));
  }, [addVideos]);

  // ── Select a card → assign to current monitor ───────────
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const entry = library.find((e) => e.id === id);
    if (entry && selectedSlot) {
      setVideoFile(selectedSlot.monitor.index, entry.path, entry.name);
    }
  }, [library, selectedSlot, setVideoFile]);

  // ── Set wallpaper button ─────────────────────────────────
  const handleSet = useCallback(async () => {
    if (!selectedId) return;

    const entry = library.find((e) => e.id === selectedId);
    if (!entry) return;

    const targetIdx = slots.length > 0
      ? (slots.find((s) => s.monitor.index === selectedMonitorIdx) ?? slots[0]).monitor.index
      : 0;

    // Invoke the Rust command directly with the known path — no stale closure
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const msg = await invoke<string>("start_wallpaper", {
        opts: {
          path: entry.path,
          muted: settings.muted,
          loop_video: settings.loop_video,
          monitor_index: targetIdx,
          volume: settings.volume,
          speed: settings.speed,
        }
      });
      setVideoFile(targetIdx, entry.path, entry.name);
      console.log("Wallpaper set:", msg);
    } catch (err) {
      console.error("start_wallpaper failed:", err);
      alert("Failed to set wallpaper:\n" + String(err));
    }
  }, [selectedId, selectedMonitorIdx, library, slots, settings, setVideoFile]);

  const handleStop = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_wallpaper", { monitorIndex: null });
    } catch (err) {
      console.error("stop_wallpaper failed:", err);
    }
  }, []);

  // ── Show install guide if required deps are missing ─────
  if (deps) {
    const isWayland = deps.display_server === "wayland";
    const missingCritical =
      !deps.mpv ||
      (isWayland  && !deps.swww) ||
      (!isWayland && (!deps.xwinwrap || !deps.xrandr));
    if (missingCritical) {
      return (
        <InstallGuide
          missingMpv={!deps.mpv}
          missingXwinwrap={!deps.xwinwrap}
          missingXrandr={!deps.xrandr}
          missingSwww={!deps.swww}
          displayServer={deps.display_server}
          onRefresh={refreshMonitors}
        />
      );
    }
  }

  const isRunning = selectedSlot?.running ?? false;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; color: ${C.textMain}; overflow: hidden; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.surface2}; border-radius: 3px; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #fff; cursor: pointer;
          box-shadow: 0 1px 4px #00000044;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes livePulse {
          0%,100% { opacity: 1; } 50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          height: "100vh", display: "flex", flexDirection: "column",
          background: C.bg, fontFamily: C.sans, userSelect: "none",
        }}
        onDrop={handlePanelDrop}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setPanelDrag(true); }}
        onDragLeave={() => { dragCounter.current--; if (!dragCounter.current) setPanelDrag(false); }}
        onDragOver={(e) => e.preventDefault()}
      >

        {/* ── Title bar ── */}
        <div style={{
          padding: "16px 20px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h1 style={{
              fontSize: 17, fontWeight: 600, color: C.textHi,
              letterSpacing: "-0.01em",
            }}>Wallpaper</h1>
            {slots.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                {slots.map((s) => (
                  <MonitorPill
                    key={s.monitor.index}
                    label={s.monitor.primary
                      ? "Built-in Display"
                      : s.monitor.name}
                    active={selectedMonitorIdx === s.monitor.index}
                    running={s.running}
                    onClick={() => setSelectedMonitor(s.monitor.index)}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleBrowse}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: C.surface2, border: "none",
              color: C.textMain, fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "background .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.borderHi)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.surface2)}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            Add Video…
          </button>
        </div>

        {/* ── Main content area ── */}
        <div style={{
          flex: 1, display: "flex", gap: 0,
          overflow: "hidden", padding: "16px 20px 12px",
        }}>

          {/* Left: video gallery panel */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", gap: 14,
            minWidth: 0,
          }}>

            {/* Gallery scroll area */}
            <div style={{
              flex: 1,
              background: C.surface,
              borderRadius: 14,
              padding: "18px 18px",
              border: panelDrag
                ? `2px solid ${C.accent}`
                : "2px solid transparent",
              transition: "border-color .15s",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
              gap: 16,
              animation: "fadeIn .3s ease",
            }}>

              {/* Drop hint when dragging */}
              {panelDrag && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: `${C.accent}0a`,
                  borderRadius: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 10, pointerEvents: "none",
                  fontSize: 15, color: C.accent, fontWeight: 500,
                }}>
                  Drop videos here
                </div>
              )}

              {library.length === 0 ? (
                /* Empty state */
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 14, color: C.textDim,
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    background: C.surface2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28,
                  }}>🎬</div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 14, color: C.textMid, fontWeight: 500 }}>
                      No videos yet
                    </p>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                      Click "Add Video…" or drop files here
                    </p>
                  </div>
                  <button
                    onClick={handleBrowse}
                    style={{
                      padding: "8px 20px", borderRadius: 8,
                      background: C.accent, border: "none",
                      color: "#fff", fontSize: 13, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Browse Videos
                  </button>
                </div>
              ) : (
                /* Card grid */
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 12,
                  overflowY: "auto", alignContent: "flex-start",
                }}>
                  {library.map((entry) => (
                    <div key={entry.id}
                      style={{ animation: "fadeIn .25s ease" }}>
                      <VideoCard
                        entry={entry}
                        selected={selectedId === entry.id}
                        active={activeEntryId === entry.id}
                        onSelect={handleSelect}
                        onRemove={handleRemove}
                      />
                    </div>
                  ))}
                  <AddCard onAdd={handleBrowse} dragging={panelDrag} />
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 10,
            }}>
              {/* Status */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, color: C.textDim, flex: 1,
                overflow: "hidden",
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background:
                    appStatus === "all-running" ? C.green :
                    appStatus === "partial"     ? "#f5a623" :
                    appStatus === "loading"     ? C.accent :
                    appStatus === "error"       ? C.red    : C.surface2,
                  boxShadow:
                    appStatus === "all-running" ? `0 0 6px ${C.green}` : "none",
                  display: "inline-block",
                  animation: appStatus === "loading" ? "livePulse 1s infinite" : "none",
                }} />
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{statusMessage}</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    style={{
                      padding: "8px 20px", borderRadius: 8,
                      background: C.red + "22",
                      border: `1px solid ${C.red}44`,
                      color: C.red, fontSize: 13, fontWeight: 600,
                      cursor: "pointer", transition: "all .15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.red + "33")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = C.red + "22")}
                  >
                    Stop Wallpaper
                  </button>
                ) : (
                  <button
                    onClick={handleSet}
                    disabled={!selectedId || appStatus === "loading"}
                    style={{
                      padding: "8px 20px", borderRadius: 8,
                      background: selectedId ? C.accent : C.surface2,
                      border: "none",
                      color: selectedId ? "#fff" : C.textDim,
                      fontSize: 13, fontWeight: 600,
                      cursor: selectedId ? "pointer" : "not-allowed",
                      transition: "all .15s",
                      opacity: appStatus === "loading" ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedId) e.currentTarget.style.background = C.accentHi;
                    }}
                    onMouseLeave={(e) => {
                      if (selectedId) e.currentTarget.style.background = C.accent;
                    }}
                  >
                    Set as Wallpaper
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: settings sidebar */}
          <div style={{
            width: 220, marginLeft: 14, flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 10,
          }}>

            {/* Selected video info */}
            {selectedId && (() => {
              const entry = library.find((e) => e.id === selectedId);
              if (!entry) return null;
              return (
                <div style={{
                  background: C.surface, borderRadius: 12,
                  padding: "12px 14px", animation: "fadeIn .2s ease",
                }}>
                  <div style={{
                    width: "100%", height: 90, borderRadius: 8,
                    overflow: "hidden", marginBottom: 10,
                    background: "#000",
                  }}>
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 24,
                      }}>🎬</div>
                    )}
                  </div>
                  <p style={{
                    fontSize: 12, fontWeight: 600, color: C.textMain,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{entry.name.replace(/\.[^.]+$/, "")}</p>
                  <p style={{
                    fontSize: 10, color: C.textDim, marginTop: 3, fontFamily: C.mono,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{entry.path}</p>
                </div>
              );
            })()}

            {/* Playback settings */}
            <div style={{
              background: C.surface, borderRadius: 12,
              padding: "14px 14px", display: "flex",
              flexDirection: "column", gap: 14,
            }}>
              <p style={{ fontSize: 11, color: C.textDim, fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Playback
              </p>

              <ToggleRow
                label="Mute Audio"
                checked={settings.muted}
                onChange={() => updateSettings({ muted: !settings.muted })}
              />
              <ToggleRow
                label="Loop"
                checked={settings.loop_video}
                onChange={() => updateSettings({ loop_video: !settings.loop_video })}
              />

              <div style={{ height: 1, background: C.border }} />

              <Slider
                label="Volume"
                value={settings.volume}
                min={0} max={100} step={1}
                display={`${settings.volume}%`}
                onChange={(v) => updateSettings({ volume: v })}
                disabled={settings.muted}
              />
              <Slider
                label="Speed"
                value={settings.speed}
                min={0.25} max={2.0} step={0.05}
                display={`${settings.speed.toFixed(2)}×`}
                onChange={(v) => updateSettings({ speed: v })}
              />
              {settings.speed !== 1.0 && (
                <button
                  onClick={() => updateSettings({ speed: 1.0 })}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    borderRadius: 6, color: C.textDim,
                    fontSize: 11, fontFamily: C.sans,
                    padding: "4px 0", cursor: "pointer", width: "100%",
                  }}
                >Reset speed</button>
              )}
            </div>

            {/* System settings */}
            <div style={{
              background: C.surface, borderRadius: 12,
              padding: "14px 14px", display: "flex",
              flexDirection: "column", gap: 14,
            }}>
              <p style={{ fontSize: 11, color: C.textDim, fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase" }}>
                System
              </p>
              <ToggleRow
                label="Start on Boot"
                checked={settings.autostart}
                onChange={toggleAutostart}
                disabled={library.length === 0}
              />
            </div>

            {/* mpv version info */}
            {wl.deps?.mpv_version && (
              <p style={{
                fontSize: 10, color: C.textDim, fontFamily: C.mono,
                padding: "0 2px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={wl.deps.mpv_version}>
                {wl.deps.mpv_version}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
