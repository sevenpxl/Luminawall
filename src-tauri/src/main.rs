// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::Write;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

// ─────────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────────
struct WallpaperProcesses(Mutex<HashMap<usize, Child>>);
struct AppSettings(Mutex<SavedSettings>);

// ─────────────────────────────────────────────────────────────
//  Settings
// ─────────────────────────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MonitorAssignment { pub output: String, pub video_path: String }

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SavedSettings {
    pub muted: bool, pub loop_video: bool, pub autostart: bool,
    pub assignments: Vec<MonitorAssignment>, pub volume: u8, pub speed: f32,
}
impl Default for SavedSettings {
    fn default() -> Self {
        Self { muted: false, loop_video: true, autostart: false,
               assignments: Vec::new(), volume: 80, speed: 1.0 }
    }
}

fn settings_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "$HOME not set".to_string())?;
    let dir  = std::path::PathBuf::from(format!("{}/.config/luminawall", home));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}
fn load_settings() -> SavedSettings {
    settings_path().ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn persist_settings(s: &SavedSettings) -> Result<(), String> {
    let path = settings_path()?;
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::File::create(&path).map_err(|e| e.to_string())?
        .write_all(json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings_cmd(settings: State<AppSettings>) -> SavedSettings {
    settings.0.lock().unwrap().clone()
}
#[tauri::command]
fn save_settings_cmd(new_settings: SavedSettings, settings: State<AppSettings>) -> Result<String, String> {
    persist_settings(&new_settings)?;
    *settings.0.lock().unwrap() = new_settings;
    Ok("saved".into())
}

// ─────────────────────────────────────────────────────────────
//  Display server
// ─────────────────────────────────────────────────────────────
#[derive(PartialEq)]
enum DisplayServer { X11, Wayland, Unknown }
impl DisplayServer {
    fn detect() -> Self {
        if std::env::var("WAYLAND_DISPLAY").is_ok() { return Self::Wayland; }
        if let Ok(s) = std::env::var("XDG_SESSION_TYPE") {
            if s.contains("wayland") { return Self::Wayland; }
            if s.contains("x11")    { return Self::X11; }
        }
        if std::env::var("DISPLAY").is_ok() { return Self::X11; }
        Self::Unknown
    }
    fn as_str(&self) -> &str {
        match self { Self::X11 => "x11", Self::Wayland => "wayland", Self::Unknown => "unknown" }
    }
}

#[tauri::command]
fn detect_display_server() -> String { DisplayServer::detect().as_str().into() }

// ─────────────────────────────────────────────────────────────
//  Monitors
// ─────────────────────────────────────────────────────────────
#[derive(serde::Serialize, Clone, Debug)]
pub struct MonitorInfo {
    pub index: usize, pub name: String,
    pub width: u32,   pub height: u32,
    pub x: i32,       pub y: i32,
    pub primary: bool, pub connected: bool,
}

fn parse_geo(s: &str) -> Option<(u32,u32,i32,i32)> {
    let (w, rest) = s.split_once('x')?;
    let p: Vec<&str> = rest.splitn(3, '+').collect();
    if p.len() < 3 { return None; }
    Some((w.parse().ok()?, p[0].parse().ok()?, p[1].parse().ok()?, p[2].parse().ok()?))
}

#[tauri::command]
fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    match DisplayServer::detect() {
        DisplayServer::X11     => list_xrandr(),
        DisplayServer::Wayland => list_wayland(),
        DisplayServer::Unknown => list_xrandr().or_else(|_| list_wayland()),
    }
}

fn list_xrandr() -> Result<Vec<MonitorInfo>, String> {
    let out = Command::new("xrandr").arg("--query").output()
        .map_err(|e| format!("xrandr: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut mons = Vec::new();
    let mut i = 0usize;
    for line in text.lines() {
        if !line.contains(" connected") { continue; }
        let p: Vec<&str> = line.split_whitespace().collect();
        let name = p[0].to_string();
        let primary = p.contains(&"primary");
        let geo = p.iter().find(|&&t| t.contains('x') && t.contains('+')
            && t.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false));
        let (w,h,x,y) = geo.and_then(|g| parse_geo(g)).unwrap_or((1920,1080,0,0));
        mons.push(MonitorInfo { index:i, name, width:w, height:h, x, y, primary, connected:true });
        i += 1;
    }
    if mons.is_empty() {
        mons.push(MonitorInfo { index:0, name:"default".into(), width:1920, height:1080,
                                x:0, y:0, primary:true, connected:true });
    }
    Ok(mons)
}

fn list_wayland() -> Result<Vec<MonitorInfo>, String> {
    // Try swaymsg first
    if command_exists("swaymsg") {
        if let Ok(out) = Command::new("swaymsg").args(["-t","get_outputs"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            #[derive(serde::Deserialize)]
            struct R { x:i32, y:i32, width:u32, height:u32 }
            #[derive(serde::Deserialize)]
            struct O { name:String, rect:R, active:bool, #[serde(default)] primary:bool }
            if let Ok(outputs) = serde_json::from_str::<Vec<O>>(&text) {
                let mons: Vec<_> = outputs.into_iter().filter(|o| o.active).enumerate()
                    .map(|(i,o)| MonitorInfo { index:i, name:o.name, width:o.rect.width,
                        height:o.rect.height, x:o.rect.x, y:o.rect.y,
                        primary:o.primary || i==0, connected:true }).collect();
                if !mons.is_empty() { return Ok(mons); }
            }
        }
    }
    // Fallback
    Ok(vec![MonitorInfo { index:0, name:"default".into(), width:1920, height:1080,
                          x:0, y:0, primary:true, connected:true }])
}

// ─────────────────────────────────────────────────────────────
//  Dependencies
// ─────────────────────────────────────────────────────────────
fn command_exists(name: &str) -> bool {
    Command::new("which").arg(name).output().map(|o| o.status.success()).unwrap_or(false)
}

#[derive(serde::Serialize)]
pub struct DependencyStatus {
    pub mpv: bool, pub mpv_version: Option<String>,
    pub xwinwrap: bool, pub xrandr: bool,
    pub swww: bool, pub swww_daemon: bool,
    pub display_server: String,
}

#[tauri::command]
fn check_dependencies() -> DependencyStatus {
    let mpv_version = Command::new("mpv").arg("--version").output().ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(|l| l.to_string()));
    DependencyStatus {
        mpv: command_exists("mpv"), mpv_version,
        xwinwrap: command_exists("xwinwrap"), xrandr: command_exists("xrandr"),
        swww: command_exists("swww"), swww_daemon: command_exists("swww-daemon"),
        display_server: DisplayServer::detect().as_str().into(),
    }
}

// ─────────────────────────────────────────────────────────────
//  Wallpaper options
// ─────────────────────────────────────────────────────────────
#[derive(serde::Deserialize, Debug, Clone)]
pub struct WallpaperOptions {
    pub path: String, pub muted: bool, pub loop_video: bool,
    pub monitor_index: usize, pub volume: u8, pub speed: f32,
}

// ─────────────────────────────────────────────────────────────
//  X11 backend
// ─────────────────────────────────────────────────────────────
fn start_x11(opts: &WallpaperOptions, mon: &MonitorInfo) -> Result<Child, String> {
    let geo = format!("{}x{}+{}+{}", mon.width, mon.height, mon.x, mon.y);
    let mut args = vec![
        "--wid=WID".into(), "--no-osc".into(), "--no-input-default-bindings".into(),
        "--really-quiet".into(), "--panscan=1.0".into(), "--video-zoom=0".into(),
        format!("--speed={:.2}", opts.speed.clamp(0.25,4.0)),
    ];
    if opts.muted { args.push("--mute=yes".into()); }
    else          { args.push(format!("--volume={}", opts.volume.clamp(0,100))); }
    if opts.loop_video { args.push("--loop-file=inf".into()); }
    args.push(opts.path.clone());
    let mut cmd = Command::new("xwinwrap");
    cmd.args(["-g",&geo,"-ov","-ni","-b","-nf","-un","-argb","--","mpv"]);
    for a in &args { cmd.arg(a); }
    cmd.spawn().map_err(|e| format!("xwinwrap: {e}"))
}

// ─────────────────────────────────────────────────────────────
//  Wayland backend
// ─────────────────────────────────────────────────────────────
fn wayland_env() -> Vec<(String, String)> {
    ["WAYLAND_DISPLAY","XDG_RUNTIME_DIR","DBUS_SESSION_BUS_ADDRESS",
     "XDG_SESSION_TYPE","HOME","USER","DISPLAY"]
        .iter()
        .filter_map(|k| std::env::var(k).ok().map(|v| (k.to_string(), v)))
        .collect()
}

fn shell_quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"'  => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c    => out.push(c),
        }
    }
    out.push('"');
    out
}

fn ensure_swww_daemon() -> Result<(), String> {
    let env = wayland_env();
    let alive = Command::new("swww").arg("query")
        .envs(env.iter().map(|(k,v)| (k.as_str(),v.as_str())))
        .output().map(|o| o.status.success()).unwrap_or(false);
    if alive { return Ok(()); }
    Command::new("swww-daemon").arg("--no-cache")
        .envs(env.iter().map(|(k,v)| (k.as_str(),v.as_str())))
        .spawn().map_err(|e| format!("swww-daemon: {e}"))?;
    for _ in 0..30 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let ready = Command::new("swww").arg("query")
            .envs(env.iter().map(|(k,v)| (k.as_str(),v.as_str())))
            .output().map(|o| o.status.success()).unwrap_or(false);
        if ready { return Ok(()); }
    }
    Err("swww-daemon not ready after 3s".to_string())
}

fn start_wayland(opts: &WallpaperOptions, mon: &MonitorInfo) -> Result<Child, String> {
    ensure_swww_daemon()?;
    let env = wayland_env();
    let env_str: String = env.iter()
        .map(|(k,v)| format!("{}={} ", k, shell_quote(v)))
        .collect();

    // Try direct swww video (needs swww built with ffmpeg/video support)
    let loop_flag = if opts.loop_video { "--loop" } else { "" };
    let direct = format!(
        "{env} swww img {path:?} --outputs {out} --transition-type none {lp}",
        env=env_str, path=opts.path, out=mon.name, lp=loop_flag
    );
    let test_out = Command::new("/bin/sh")
        .args(["-c", &format!("{env} swww img {path:?} --outputs {out} --transition-type none {lp} 2>&1; echo EXIT:$?",
            env=env_str, path=opts.path, out=mon.name, lp=loop_flag)])
        .output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // If swww succeeded (exit 0) or gave a non-format error, use direct mode
    if test_out.contains("EXIT:0") {
        return Command::new("/bin/sh")
            .args(["-c", &direct])
            .spawn().map_err(|e| format!("swww direct: {e}"));
    }

    // Fallback: mpv → raw frames → swww stdin pipe
    let loop_arg  = if opts.loop_video { "--loop-file=inf" } else { "--loop-file=no" };
    let mute_arg  = if opts.muted { "--mute=yes" } else { "--mute=no" };
    let vol_arg   = format!("--volume={}", opts.volume.clamp(0,100));
    let speed_arg = format!("--speed={:.2}", opts.speed.clamp(0.25,4.0));
    let vf_arg    = format!("--vf=scale={}:{}", mon.width, mon.height);
    let pipeline  = format!(
        "{env} mpv --vo=raw --vo-raw-format=rgb24 --really-quiet          {la} {ma} {va} {sa} {vfa} --fps-override=30 -- {path:?}          | swww img --outputs {out} --transition-type none -",
        env=env_str, la=loop_arg, ma=mute_arg, va=vol_arg,
        sa=speed_arg, vfa=vf_arg, path=opts.path, out=mon.name,
    );
    Command::new("/bin/sh").args(["-c",&pipeline])
        .spawn().map_err(|e| format!("mpv|swww: {e}"))
}

// ─────────────────────────────────────────────────────────────
//  Commands
// ─────────────────────────────────────────────────────────────
fn kill_monitor(processes: &State<WallpaperProcesses>, idx: usize) {
    if let Some(mut child) = processes.0.lock().unwrap().remove(&idx) {
        let _ = child.kill(); let _ = child.wait();
    }
}

fn stop_all(processes: &State<WallpaperProcesses>) {
    for (_,mut c) in processes.0.lock().unwrap().drain() { let _ = c.kill(); let _ = c.wait(); }
    let _ = Command::new("pkill").args(["-f","xwinwrap"]).output();
    let _ = Command::new("pkill").args(["-f","mpv.*--wid"]).output();
    let _ = Command::new("pkill").args(["-f","mpv.*vo=raw"]).output();
    let _ = Command::new("swww").arg("clear").output();
}

#[tauri::command]
async fn start_wallpaper(opts: WallpaperOptions, processes: State<'_, WallpaperProcesses>) -> Result<String, String> {
    kill_monitor(&processes, opts.monitor_index);

    let mons = list_monitors()?;
    let mon  = mons.iter().find(|m| m.index == opts.monitor_index)
        .ok_or_else(|| format!("monitor {} not found", opts.monitor_index))?
        .clone();

    let monitor_index = opts.monitor_index;
    let mon_name      = mon.name.clone();

    // Spawn onto a blocking thread so the async Tauri IPC thread is never stalled.
    // ensure_swww_daemon() polls with thread::sleep — must run off the async executor.
    let result = tauri::async_runtime::spawn_blocking(move || {
        match DisplayServer::detect() {
            DisplayServer::X11     => start_x11(&opts, &mon),
            DisplayServer::Wayland => start_wayland(&opts, &mon),
            DisplayServer::Unknown => start_wayland(&opts, &mon)
                                        .or_else(|_| start_x11(&opts, &mon)),
        }
    }).await.map_err(|e| format!("task join error: {e}"))?;

    let child = result?;
    processes.0.lock().unwrap().insert(monitor_index, child);
    Ok(format!("Wallpaper started on {}", mon_name))
}

#[tauri::command]
fn stop_wallpaper(monitor_index: Option<usize>, processes: State<WallpaperProcesses>) -> String {
    match monitor_index {
        Some(idx) => { kill_monitor(&processes, idx); format!("stopped monitor {idx}") }
        None      => { stop_all(&processes); "all stopped".into() }
    }
}

#[tauri::command]
fn running_monitors(processes: State<WallpaperProcesses>) -> Vec<usize> {
    processes.0.lock().unwrap().keys().cloned().collect()
}

#[tauri::command]
fn set_autostart(enabled: bool, video_path: String, muted: bool) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "$HOME not set".to_string())?;
    let dir  = format!("{}/.config/autostart", home);
    let path = format!("{}/luminawall.desktop", dir);
    if !enabled { let _ = std::fs::remove_file(&path); return Ok("disabled".into()); }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let exe  = std::env::current_exe().map_err(|e| e.to_string())?;
    let muted_f = if muted { "--muted" } else { "" };
    let content = format!(
        "[Desktop Entry]\nType=Application\nName=LuminaWall\n\
         Exec={} --autostart --video {:?} {}\nHidden=false\nNoDisplay=false\n\
         X-GNOME-Autostart-enabled=true\n",
        exe.display(), video_path, muted_f);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(format!("enabled → {path}"))
}

// ─────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────
fn main() {
    let saved = load_settings();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WallpaperProcesses(Mutex::new(HashMap::new())))
        .manage(AppSettings(Mutex::new(saved)))
        .invoke_handler(tauri::generate_handler![
            detect_display_server, check_dependencies, list_monitors,
            start_wallpaper, stop_wallpaper, running_monitors,
            set_autostart, load_settings_cmd, save_settings_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error running LuminaWall");
}
