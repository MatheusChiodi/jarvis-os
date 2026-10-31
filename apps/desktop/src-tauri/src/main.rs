// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{
    Manager, State, WindowEvent, Emitter, Listener,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_hotkey::{GlobalHotkeyExt, HotkeyState, Code, Modifiers};
use tauri_plugin_store::StoreExt;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_shell::process::CommandEvent;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
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

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    project_id: String,
    note_type: String,
    title: String,
    summary: String,
    content: String,
    frontmatter_json: String,
    tags: String,
    agent: String,
    task_id: Option<String>,
    wikilinks: String,
    pinned: bool,
    archived: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    id: String,
    title: String,
    summary: String,
    note_type: String,
    agent: String,
    tags: Vec<String>,
    created_at: DateTime<Utc>,
    score: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct StatuslineData {
    plan_usage: PlanUsage,
    context_window: u32,
    cost: f64,
    model: String,
    memory: MemoryStatus,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlanUsage {
    five_hour: u32,
    seven_day: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemoryStatus {
    project: String,
    enabled: bool,
    note_count: u32,
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
    memory: MemoryConfig,
    teams: Vec<Team>,
    skills: SkillsConfig,
    voice: VoiceConfig,
    video: VideoConfig,
    pixel: PixelConfig,
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
struct MemoryConfig {
    vault_path: String,
    vector_search: bool,
    embedding_model: String,
    hooks: HooksConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct HooksConfig {
    task_completed: bool,
    teammate_idle: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SkillsConfig {
    enabled: Vec<String>,
    custom_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct VoiceConfig {
    enabled: bool,
    wake_word: String,
    tts_voice: String,
    stt_engine: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct VideoConfig {
    enabled: bool,
    engine: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PixelConfig {
    enabled: bool,
    port: u16,
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
            memory: MemoryConfig {
                vault_path: "~/.jarvis-os/memory".to_string(),
                vector_search: true,
                embedding_model: "Xenova/all-MiniLM-L6-v2".to_string(),
                hooks: HooksConfig { task_completed: true, teammate_idle: true },
            },
            teams: vec![],
            skills: SkillsConfig {
                enabled: vec!["core".to_string(), "superpowers".to_string(), "ecc".to_string(), "mattpocock".to_string()],
                custom_path: "~/.jarvis-os/skills/custom".to_string(),
            },
            voice: VoiceConfig {
                enabled: false,
                wake_word: "jarvis".to_string(),
                tts_voice: "faber".to_string(),
                stt_engine: "web-speech".to_string(),
            },
            video: VideoConfig {
                enabled: false,
                engine: "hyperframes".to_string(),
            },
            pixel: PixelConfig {
                enabled: false,
                port: 3100,
            },
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
async fn get_statusline_data(project_id: String, state: State<'_, AppState>) -> Result<StatuslineData, String> {
    // Mock data - in production, query actual usage from Claude Code
    Ok(StatuslineData {
        plan_usage: PlanUsage { five_hour: 23, seven_day: 41 },
        context_window: 53,
        cost: 0.42,
        model: "Opus".to_string(),
        memory: MemoryStatus {
            project: project_id,
            enabled: true,
            note_count: 38,
        },
    })
}

#[tauri::command]
async fn send_chat_message(team_id: String, message: String, state: State<'_, AppState>) -> Result<String, String> {
    // In production, this would invoke the agent runtime
    Ok(format!("Received: {}. Processing with team {}", message, team_id))
}

#[tauri::command]
async fn memory_search_index(project_id: String, query: String, limit: Option<u32>, state: State<'_, AppState>) -> Result<Vec<SearchResult>, String> {
    // Mock search results
    Ok(vec![
        SearchResult {
            id: Uuid::new_v4().to_string(),
            title: format!("Result for: {}", query),
            summary: "This is a search result summary".to_string(),
            note_type: "memory".to_string(),
            agent: "planner".to_string(),
            tags: vec!["search".to_string(), "test".to_string()],
            created_at: Utc::now(),
            score: 0.95,
        }
    ])
}

#[tauri::command]
async fn memory_get_timeline(project_id: String, window_days: Option<u32>, state: State<'_, AppState>) -> Result<Vec<TimelineEvent>, String> {
    Ok(vec![])
}

#[tauri::command]
async fn memory_list_notes(project_id: String, limit: Option<u32>, state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    Ok(vec![])
}

#[tauri::command]
async fn memory_get_observations(project_id: String, ids: Vec<String>, state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    Ok(vec![])
}

#[tauri::command]
async fn spawn_shell(cols: u16, rows: u16, state: State<'_, AppState>) -> Result<String, String> {
    // In production, spawn a shell process and return its PID or handle
    Ok("shell-spawned".to_string())
}

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
        // Apply patch (simplified)
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

// ============================================================================
// Setup
// ============================================================================

async fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    // Initialize state
    let config = load_config(&handle).await.unwrap_or_default();
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
        WebviewUrl::Default,
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
    .title_bar_style(tauri::TitleBarStyle::Overlay)
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

    // Global hotkey
    let hotkey = config.hotkey.parse_hotkey()?;
    handle.global_hotkey().register(hotkey)?;

    handle.on_global_hotkey_event(move |event, _| {
        if event.state == HotkeyState::Pressed {
            let _ = handle.emit("toggle-overlay", ());
        }
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

async fn load_config(handle: &tauri::AppHandle) -> Result<AppConfig, Box<dyn std::error::Error>> {
    let store = handle.store("config.json").await?;
    if let Some(config) = store.get("config").await? {
        Ok(serde_json::from_value(config)?)
    } else {
        Ok(AppConfig::default())
    }
}

// ============================================================================
// Hotkey parsing
// ============================================================================

trait HotkeyParse {
    fn parse_hotkey(&self) -> Result<tauri_plugin_global_hotkey::Hotkey, String>;
}

impl HotkeyParse for String {
    fn parse_hotkey(&self) -> Result<tauri_plugin_global_hotkey::Hotkey, String> {
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
                        key = Some(Code::from_char(c).ok_or("Invalid key")?);
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
        Ok(tauri_plugin_global_hotkey::Hotkey::new(Some(modifiers), key))
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
        .plugin(tauri_plugin_global_hotkey::Builder::new().build())
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
            get_statusline_data,
            send_chat_message,
            memory_search_index,
            memory_get_timeline,
            memory_list_notes,
            memory_get_observations,
            spawn_shell,
            get_teams,
            create_team,
            update_team,
            delete_team,
            save_config,
            get_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}