/**
 * luminawall/src/hooks/useWallpaper.ts
 *
 * Central state store for the entire app.
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  detectDisplayServer,
  checkDependencies,
  listMonitors,
  startWallpaper,
  stopWallpaper,
  runningMonitors,
  setAutostart,
  loadSettings,
  saveSettings,
  DisplayServer,
  DependencyStatus,
  MonitorInfo,
  SavedSettings,
} from "@/lib/tauriCommands";

export interface MonitorSlot {
  monitor: MonitorInfo;
  videoPath: string | null;
  videoName: string | null;
  running: boolean;
}

export type AppStatus = "idle" | "loading" | "error" | "partial" | "all-running";

export interface WallpaperState {
  displayServer: DisplayServer | null;
  deps: DependencyStatus | null;
  appStatus: AppStatus;
  statusMessage: string;
  slots: MonitorSlot[];
  selectedMonitorIdx: number;
  setSelectedMonitor: (idx: number) => void;
  setVideoFile: (monitorIndex: number, path: string, name: string) => void;
  clearVideoFile: (monitorIndex: number) => void;
  settings: SavedSettings;
  updateSettings: (patch: Partial<SavedSettings>) => void;
  startOne: (monitorIndex: number) => Promise<void>;
  stopOne: (monitorIndex: number) => Promise<void>;
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  toggleAutostart: () => Promise<void>;
  refreshMonitors: () => Promise<void>;
}

export function useWallpaper(): WallpaperState {
  const [displayServer, setDisplayServer] = useState<DisplayServer | null>(null);
  const [deps, setDeps]                   = useState<DependencyStatus | null>(null);
  const [appStatus, setAppStatus]         = useState<AppStatus>("loading");
  const [statusMessage, setStatusMessage] = useState("Initialising…");
  const [monitors, setMonitors]           = useState<MonitorInfo[]>([]);
  const [slots, setSlots]                 = useState<MonitorSlot[]>([]);
  const [selectedMonitorIdx, setSelectedMonitor] = useState(0);
  const [settings, setSettings] = useState<SavedSettings>({
    muted: false,
    loop_video: true,
    autostart: false,
    assignments: [],
    volume: 80,
    speed: 1.0,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monitorsRef = useRef<MonitorInfo[]>([]);
  monitorsRef.current = monitors;

  const markRunning = useCallback((running: number[]) => {
    setSlots((prev) =>
      prev.map((s) => ({ ...s, running: running.includes(s.monitor.index) }))
    );
  }, []);

  const refreshRunning = useCallback(async () => {
    try {
      const running = await runningMonitors();
      markRunning(running);
      const monCount = monitorsRef.current.length;
      if (running.length === 0) setAppStatus("idle");
      else if (running.length === monCount && monCount > 0) setAppStatus("all-running");
      else setAppStatus("partial");
    } catch (_) {}
  }, [markRunning]);

  const refreshMonitors = useCallback(async () => {
    try {
      const mons = await listMonitors();
      setMonitors(mons);
      setSlots((prev) =>
        mons.map((m) => {
          const ex = prev.find((s) => s.monitor.index === m.index);
          return ex ? { ...ex, monitor: m } : { monitor: m, videoPath: null, videoName: null, running: false };
        })
      );
    } catch (e) {
      setStatusMessage(`Monitor detection failed: ${e}`);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [server, depStatus, saved] = await Promise.all([
          detectDisplayServer(),
          checkDependencies(),
          loadSettings(),
        ]);
        setDisplayServer(server);
        setDeps(depStatus);
        setSettings(saved);

        // Both X11 (xwinwrap) and Wayland (swww) are supported
        // Check deps appropriate for the detected display server
        const isWayland = depStatus.display_server === "wayland";
        const missing: string[] = [];
        if (!depStatus.mpv) missing.push("mpv");
        if (isWayland  && !depStatus.swww)     missing.push("swww");
        if (!isWayland && !depStatus.xwinwrap) missing.push("xwinwrap");
        if (!isWayland && !depStatus.xrandr)   missing.push("xrandr");
        if (missing.length) {
          setAppStatus("error");
          setStatusMessage(`Missing dependencies: ${missing.join(", ")} — run ./scripts/install-deps.sh`);
          return;
        }

        await refreshMonitors();

        if (saved.assignments.length) {
          setSlots((prev) =>
            prev.map((s) => {
              const a = saved.assignments.find((a) => a.output === s.monitor.name);
              if (!a) return s;
              return { ...s, videoPath: a.video_path, videoName: a.video_path.split("/").pop() ?? a.video_path };
            })
          );
        }

        setAppStatus("idle");
        const backendName = isWayland ? "swww (Wayland)" : "xwinwrap (X11)";
        setStatusMessage(`Ready — using ${backendName} backend`);
      } catch (e) {
        setAppStatus("error");
        setStatusMessage(String(e));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (monitors.length === 0) return;
    const id = setInterval(refreshRunning, 3000);
    return () => clearInterval(id);
  }, [monitors.length, refreshRunning]);

  const updateSettings = useCallback((patch: Partial<SavedSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSettings(next).catch(console.error), 800);
      return next;
    });
  }, []);

  const setVideoFile = useCallback((monitorIndex: number, path: string, name: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.monitor.index === monitorIndex ? { ...s, videoPath: path, videoName: name } : s
      )
    );
    setSettings((prev) => {
      const mon = monitorsRef.current.find((m) => m.index === monitorIndex);
      if (!mon) return prev;
      const next: SavedSettings = {
        ...prev,
        assignments: [
          ...prev.assignments.filter((a) => a.output !== mon.name),
          { output: mon.name, video_path: path },
        ],
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSettings(next).catch(console.error), 800);
      return next;
    });
  }, []);

  const clearVideoFile = useCallback((monitorIndex: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.monitor.index === monitorIndex ? { ...s, videoPath: null, videoName: null } : s
      )
    );
    setSettings((prev) => {
      const mon = monitorsRef.current.find((m) => m.index === monitorIndex);
      if (!mon) return prev;
      const next: SavedSettings = {
        ...prev,
        assignments: prev.assignments.filter((a) => a.output !== mon.name),
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSettings(next).catch(console.error), 800);
      return next;
    });
  }, []);

  const startOne = useCallback(async (monitorIndex: number) => {
    const slot = slots.find((s) => s.monitor.index === monitorIndex);
    if (!slot?.videoPath) {
      setStatusMessage(`No video assigned to monitor ${monitorIndex}`);
      return;
    }
    setAppStatus("loading");
    setStatusMessage(`Starting on ${slot.monitor.name}…`);
    try {
      const msg = await startWallpaper({
        path: slot.videoPath,
        muted: settings.muted,
        loop_video: settings.loop_video,
        monitor_index: monitorIndex,
        volume: settings.volume,
        speed: settings.speed,
      });
      setStatusMessage(msg);
      await refreshRunning();
    } catch (e) {
      setAppStatus("error");
      setStatusMessage(String(e));
    }
  }, [slots, settings, refreshRunning]);

  const stopOne = useCallback(async (monitorIndex: number) => {
    setAppStatus("loading");
    try {
      const msg = await stopWallpaper(monitorIndex);
      setStatusMessage(msg);
      await refreshRunning();
    } catch (e) {
      setAppStatus("error");
      setStatusMessage(String(e));
    }
  }, [refreshRunning]);

  const startAll = useCallback(async () => {
    const assigned = slots.filter((s) => s.videoPath !== null);
    if (!assigned.length) {
      setStatusMessage("No videos assigned — drop a video onto a monitor first.");
      return;
    }
    setAppStatus("loading");
    setStatusMessage("Starting all monitors…");
    for (const s of assigned) await startOne(s.monitor.index);
  }, [slots, startOne]);

  const stopAll = useCallback(async () => {
    setAppStatus("loading");
    try {
      const msg = await stopWallpaper(undefined);
      setStatusMessage(msg);
      setSlots((prev) => prev.map((s) => ({ ...s, running: false })));
      setAppStatus("idle");
    } catch (e) {
      setAppStatus("error");
      setStatusMessage(String(e));
    }
  }, []);

  const toggleAutostart = useCallback(async () => {
    const next = !settings.autostart;
    const primarySlot = slots.find((s) => s.monitor.primary) ?? slots[0];
    try {
      await setAutostart(next, primarySlot?.videoPath ?? "", settings.muted);
      updateSettings({ autostart: next });
      setStatusMessage(next ? "Autostart enabled." : "Autostart disabled.");
    } catch (e) {
      setStatusMessage(`Autostart error: ${e}`);
    }
  }, [settings, slots, updateSettings]);

  return {
    displayServer, deps, appStatus, statusMessage,
    slots, selectedMonitorIdx, setSelectedMonitor,
    setVideoFile, clearVideoFile,
    settings, updateSettings,
    startOne, stopOne, startAll, stopAll,
    toggleAutostart, refreshMonitors,
  };
}
