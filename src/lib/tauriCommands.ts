/**
 * Typed wrappers for every Rust #[tauri::command].
 * Uses @tauri-apps/api v2 import paths.
 */
import { invoke } from "@tauri-apps/api/core";

export type DisplayServer = "x11" | "wayland" | "unknown";

export interface DependencyStatus {
  mpv: boolean; mpv_version: string | null;
  xwinwrap: boolean; xrandr: boolean;
  swww: boolean; swww_daemon: boolean;
  display_server: string;
}
export interface MonitorInfo {
  index: number; name: string;
  width: number; height: number;
  x: number; y: number;
  primary: boolean; connected: boolean;
}
export interface MonitorAssignment { output: string; video_path: string; }
export interface SavedSettings {
  muted: boolean; loop_video: boolean; autostart: boolean;
  assignments: MonitorAssignment[]; volume: number; speed: number;
}
export interface WallpaperOptions {
  path: string; muted: boolean; loop_video: boolean;
  monitor_index: number; volume: number; speed: number;
}

export const detectDisplayServer = (): Promise<DisplayServer> =>
  invoke<DisplayServer>("detect_display_server");
export const checkDependencies = (): Promise<DependencyStatus> =>
  invoke<DependencyStatus>("check_dependencies");
export const listMonitors = (): Promise<MonitorInfo[]> =>
  invoke<MonitorInfo[]>("list_monitors");
export const startWallpaper = (opts: WallpaperOptions): Promise<string> =>
  invoke<string>("start_wallpaper", { opts });
export const stopWallpaper = (monitorIndex?: number): Promise<string> =>
  invoke<string>("stop_wallpaper", { monitorIndex: monitorIndex ?? null });
export const runningMonitors = (): Promise<number[]> =>
  invoke<number[]>("running_monitors");
export const setAutostart = (enabled: boolean, videoPath: string, muted: boolean): Promise<string> =>
  invoke<string>("set_autostart", { enabled, videoPath, muted });
export const loadSettings = (): Promise<SavedSettings> =>
  invoke<SavedSettings>("load_settings_cmd");
export const saveSettings = (newSettings: SavedSettings): Promise<string> =>
  invoke<string>("save_settings_cmd", { newSettings });
