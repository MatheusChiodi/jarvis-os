# ADR-001: Tauri v2 over Electron

**Date:** 2026-10-31
**Status:** Accepted
**Author:** Matheus Chiodi

## Context

JARVIS-OS precisa de uma aplicação desktop com:
- System tray icon persistente
- Global hotkey (`Win+Alt+J` / `Cmd+Shift+J`)
- Janela overlay sem decoração (frameless), draggable, always-on-top opcional
- IPC seguro entre Rust (main) e React (renderer)
- Footprint mínimo (< 100MB)
- Cross-platform: Windows 10/11, macOS 13+, Linux

## Decision

Usar **Tauri v2** (Rust + WebView2 no Windows, WebKitGTK no Linux, WebKit no macOS) ao invés de Electron.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Electron** | Mature, huge ecosystem, easy Node.js integration | ~150MB base, high memory, security concerns (nodeIntegration), no native system tray API |
| **Tauri v1** | Smaller, Rust backend | Limited WebView2 support, no mobile, less mature |
| **Tauri v2** | **Mobile support, WebView2 stable, better IPC, plugins ecosystem** | **Newer, smaller community, Rust learning curve** |
| **Wails** | Go backend, similar to Tauri | Less mature, smaller ecosystem |
| **Neutralinojs** | Lightweight, any language | Very limited APIs, no system tray |

## Consequences

### Positive
- **Bundle size**: ~50MB vs ~150MB (Electron)
- **Memory**: ~60MB base vs ~120MB (Electron)
- **Security**: Capability-based IPC, CSP rigoroso, no Node.js no renderer
- **System integration**: Native system tray, global hotkey via `tauri-plugin-global-hotkey`
- **Performance**: Rust para operações pesadas (git, file watch, crypto)
- **Distribution**: Binários nativos menores, assinatura/notarização mais simples

### Negative
- **Rust learning curve** para team acostumado com Node.js
- **Plugin ecosystem** menor que Electron (mas crescente)
- **WebView2** required no Windows (já presente no Win10/11 via Edge)
- **Debugging** mais complexo (Rust + WebView devtools)

## Implementation Notes

```toml
# Cargo.toml dependencies
[dependencies]
tauri = { version = "2.0", features = ["tray-icon", "global-hotkey", "dialog", "fs", "shell", "http", "websocket"] }
tauri-plugin-store = "2.0"
tauri-plugin-log = "2.0"
tauri-plugin-opener = "2.0"
tauri-plugin-clipboard-manager = "2.0"
tauri-plugin-shell = "2.0"
tauri-plugin-fs = "2.0"
tauri-plugin-dialog = "2.0"
tauri-plugin-http = "2.0"
tauri-plugin-websocket = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
anyhow = "1.0"
```

```json
// tauri.conf.json capabilities
{
  "capabilities": [
    {
      "identifier": "core",
      "description": "Core app capabilities",
      "windows": ["overlay"],
      "permissions": [
        "core:default",
        "core:event:listen",
        "core:event:emit",
        "core:window:allow-close",
        "core:window:allow-minimize",
        "core:window:allow-maximize",
        "core:window:allow-start-dragging",
        "op:fs:read",
        "op:fs:write",
        "op:fs:remove",
        "op:fs:copy",
        "op:fs:mkdir",
        "op:path:resolve",
        "op:path:join",
        "op:path:exists",
        "op:dialog:open",
        "op:dialog:save",
        "op:dialog:message",
        "op:dialog:ask",
        "op:dialog:confirm",
        "op:shell:allow",
        "op:http:default",
        "op:websocket:default",
        "op:store:default"
      ]
    }
  ]
}
```

## References

- [Tauri v2 Announcement](https://tauri.app/blog/tauri-2-0/)
- [Tauri Security Model](https://tauri.app/security/)
- [Global Hotkey Plugin](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/global-hotkey)