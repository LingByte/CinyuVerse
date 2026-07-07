//! Workspace file change watcher — emits `workspace-file-changed` events.

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::channel;
use tauri::Manager;

#[tauri::command]
pub fn cv_watch_workspace(window: tauri::Window, workspace_root: String) -> Result<(), String> {
    let root = Path::new(&workspace_root);
    if !root.is_dir() {
        return Err("工作区路径无效".to_string());
    }

    let (tx, rx) = channel();
    let mut watcher = RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let window_label = window.label().to_string();
    let app = window.app_handle();

    std::thread::spawn(move || {
        // Keep watcher alive in this thread
        let _watcher = watcher;
        while let Ok(event) = rx.recv() {
            if let Ok(notify::Event {
                kind: notify::EventKind::Modify(_),
                paths,
                ..
            }) = event
            {
                for path in paths {
                    let s = path.to_string_lossy().to_string();
                    if s.contains(".cinyuverse") {
                        continue;
                    }
                    if let Some(w) = app.get_window(&window_label) {
                        let _ = w.emit("workspace-file-changed", s);
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cv_unwatch_workspace() -> Result<(), String> {
    Ok(())
}
