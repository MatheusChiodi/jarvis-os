// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    Manager, State, WindowEvent, Emitter, Listener,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Code, Modifiers, Shortcut};
use tauri_plugin_store::StoreExt;
use tauri_plugin_log::{Target, TargetKind};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::{DateTime, Utc};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Team {
    id: String,
    name: String,
    description: Option<String>,
    working_dir: String,
    roles: Vec<AgentRole>,
    enabled_skills: Vec<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentRole {
    id: String,
    name: String,
    role_type: String,
    skills: Vec<String>,
    model: Option<String>,
    system_prompt: Option<String>,
}

// ============================================================================
// App State
// ============================================================================

struct AppState {
    teams: Mutex<Vec<Team>>,
    config: Mutex<AppConfig>,
    overlay_window: Mutex<Option<tauri::WebviewWindow>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
    version: u32,
    hotkey: String,
    overlay: OverlayConfig,
    teams: Vec<Team>,
    skills: SkillsConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OverlayConfig {
    default_bounds: WindowBounds,
    theme: String,
    animations: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WindowBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SkillsConfig {
    enabled: Vec<String>,
    custom_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            hotkey: "Super+Alt+J".to_string(),
            overlay: OverlayConfig {
                default_bounds: WindowBounds { x: 100.0, y: 100.0, width: 1200.0, height: 800.0 },
                theme: "system".to_string(),
                animations: true,
            },
            teams: vec![],
            skills: SkillsConfig {
                enabled: vec!["core".to_string(), "superpowers".to_string(), "ecc".to_string(), "mattpocock".to_string()],
                custom_path: "~/.jarvis-os/skills/custom".to_string(),
            },
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
async fn get_teams(state: State<'_, AppState>) -> Result<Vec<Team>, String> {
    let teams = state.teams.lock().unwrap().clone();
    Ok(teams)
}

#[tauri::command]
async fn create_team(team: Team, state: State<'_, AppState>) -> Result<Team, String> {
    let mut teams = state.teams.lock().unwrap();
    teams.push(team.clone());
    Ok(team)
}

#[tauri::command]
async fn update_team(id: String, patch: serde_json::Value, state: State<'_, AppState>) -> Result<Team, String> {
    let mut teams = state.teams.lock().unwrap();
    if let Some(team) = teams.iter_mut().find(|t| t.id == id) {
        if let Some(name) = patch.get("name").and_then(|v| v.as_str()) {
            team.name = name.to_string();
        }
        team.updated_at = Utc::now();
        Ok(team.clone())
    } else {
        Err("Team not found".to_string())
    }
}

#[tauri::command]
async fn delete_team(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut teams = state.teams.lock().unwrap();
    teams.retain(|t| t.id != id);
    Ok(())
}

#[tauri::command]
async fn save_config(config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
async fn get_daemon_token() -> Result<String, String> {
    let config_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".jarvis-os");
    
    let token_path = config_dir.join("daemon.token");
    
    if !token_path.exists() {
        return Err("Daemon token not found. Start the daemon first.".to_string());
    }
    
    let token = std::fs::read_to_string(token_path)
        .map_err(|e| format!("Failed to read daemon token: {}", e))?
        .trim()
        .to_string();
    
    Ok(token)
}

// ============================================================================
// Setup
// ============================================================================

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    // Initialize state
    let config = load_config(&handle).unwrap_or_default();
    let teams = config.teams.clone();

    app.manage(AppState {
        teams: Mutex::new(teams),
        config: Mutex::new(config.clone()),
        overlay_window: Mutex::new(None),
    });

    // Create overlay window (hidden initially)
    let overlay_window = WebviewWindowBuilder::new(
        &handle,
        "overlay",
        WebviewUrl::default(),
    )
    .title("JARVIS-OS")
    .inner_size(config.overlay.default_bounds.width, config.overlay.default_bounds.height)
    .position(config.overlay.default_bounds.x, config.overlay.default_bounds.y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .visible(false)
    .build()?;

    *app.state::<AppState>().overlay_window.lock().unwrap() = Some(overlay_window.clone());

    // Window event handlers
    let handle_clone = handle.clone();
    overlay_window.on_window_event(move |event| {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = handle_clone.emit("overlay-close-requested", ());
            }
            WindowEvent::Moved(position) => {
                let _ = handle_clone.emit("overlay-moved", position);
            }
            WindowEvent::Resized(size) => {
                let _ = handle_clone.emit("overlay-resized", size);
            }
            _ => {}
        }
    });

    // Global shortcut
    let hotkey = config.hotkey.parse_hotkey()?;
    let shortcut: Shortcut = hotkey.clone();
    handle.global_shortcut().register(shortcut.clone())?;

    let handle_clone = handle.clone();
    let _ = handle.global_shortcut().on_shortcut(shortcut, move |_shortcut, _event, _state| {
        let _ = handle_clone.emit("toggle-overlay", ());
    });

    // System tray
    let show_item = MenuItem::with_id(&handle, "show", "Show JARVIS-OS", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(&handle, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(&handle, &[&show_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(handle.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .on_menu_event(move |handle, event| {
            match event.id.as_ref() {
                "show" => {
                    let _ = handle.emit("toggle-overlay", ());
                }
                "quit" => {
                    handle.exit(0);
                }
                _ => {}
            }
        })
        .build(&handle)?;

    // Listen for overlay events from frontend
    let handle_clone = handle.clone();
    handle.listen("toggle-overlay", move |_| {
        toggle_overlay(&handle_clone);
    });

    let handle_clone = handle.clone();
    handle.listen("overlay-close-requested", move |_| {
        hide_overlay(&handle_clone);
    });

    Ok(())
}

fn toggle_overlay(handle: &tauri::AppHandle) {
    let state = handle.state::<AppState>();
    let window_guard = state.overlay_window.lock().unwrap();
    if let Some(window) = window_guard.as_ref() {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn hide_overlay(handle: &tauri::AppHandle) {
    let state = handle.state::<AppState>();
    let window_guard = state.overlay_window.lock().unwrap();
    if let Some(window) = window_guard.as_ref() {
        let _ = window.hide();
    }
}

fn load_config(handle: &tauri::AppHandle) -> Result<AppConfig, Box<dyn std::error::Error>> {
    let store = handle.store("config.json")?;
    let config_value: Value = store.get("config").unwrap_or(Value::Null);
    if config_value != Value::Null {
        Ok(serde_json::from_value(config_value)?)
    } else {
        Ok(AppConfig::default())
    }
}

// ============================================================================
// Hotkey parsing
// ============================================================================

trait HotkeyParse {
    fn parse_hotkey(&self) -> Result<Shortcut, String>;
}

fn char_to_code(c: char) -> Option<Code> {
    match c.to_ascii_uppercase() {
        'A' => Some(Code::KeyA),
        'B' => Some(Code::KeyB),
        'C' => Some(Code::KeyC),
        'D' => Some(Code::KeyD),
        'E' => Some(Code::KeyE),
        'F' => Some(Code::KeyF),
        'G' => Some(Code::KeyG),
        'H' => Some(Code::KeyH),
        'I' => Some(Code::KeyI),
        'J' => Some(Code::KeyJ),
        'K' => Some(Code::KeyK),
        'L' => Some(Code::KeyL),
        'M' => Some(Code::KeyM),
        'N' => Some(Code::KeyN),
        'O' => Some(Code::KeyO),
        'P' => Some(Code::KeyP),
        'Q' => Some(Code::KeyQ),
        'R' => Some(Code::KeyR),
        'S' => Some(Code::KeyS),
        'T' => Some(Code::KeyT),
        'U' => Some(Code::KeyU),
        'V' => Some(Code::KeyV),
        'W' => Some(Code::KeyW),
        'X' => Some(Code::KeyX),
        'Y' => Some(Code::KeyY),
        'Z' => Some(Code::KeyZ),
        '0' => Some(Code::Digit0),
        '1' => Some(Code::Digit1),
        '2' => Some(Code::Digit2),
        '3' => Some(Code::Digit3),
        '4' => Some(Code::Digit4),
        '5' => Some(Code::Digit5),
        '6' => Some(Code::Digit6),
        '7' => Some(Code::Digit7),
        '8' => Some(Code::Digit8),
        '9' => Some(Code::Digit9),
        _ => None,
    }
}

impl HotkeyParse for String {
    fn parse_hotkey(&self) -> Result<Shortcut, String> {
        let parts: Vec<&str> = self.split('+').collect();
        let mut modifiers = Modifiers::empty();
        let mut key = None;

        for part in parts {
            match part.to_lowercase().as_str() {
                "super" | "cmd" | "meta" => modifiers |= Modifiers::SUPER,
                "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
                "shift" => modifiers |= Modifiers::SHIFT,
                "alt" | "option" => modifiers |= Modifiers::ALT,
                k if k.len() == 1 => {
                    if let Some(c) = k.chars().next() {
                        key = Some(char_to_code(c).ok_or("Invalid key")?);
                    }
                }
                "space" => key = Some(Code::Space),
                "enter" => key = Some(Code::Enter),
                "escape" | "esc" => key = Some(Code::Escape),
                "tab" => key = Some(Code::Tab),
                "backspace" => key = Some(Code::Backspace),
                "delete" => key = Some(Code::Delete),
                "home" => key = Some(Code::Home),
                "end" => key = Some(Code::End),
                "pageup" => key = Some(Code::PageUp),
                "pagedown" => key = Some(Code::PageDown),
                "up" => key = Some(Code::ArrowUp),
                "down" => key = Some(Code::ArrowDown),
                "left" => key = Some(Code::ArrowLeft),
                "right" => key = Some(Code::ArrowRight),
                _ => {}
            }
        }

        let key = key.ok_or("No key specified")?;
        Ok(Shortcut::new(Some(modifiers), key))
    }
}

// ============================================================================
// Main
// ============================================================================

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir { file_name: Some("jarvis-os.log".to_string()) }),
                Target::new(TargetKind::Webview),
            ])
            .build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            get_teams,
            create_team,
            update_team,
            delete_team,
            save_config,
            get_config,
            get_daemon_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}