mod categorize;
mod commands;
pub mod db;
pub mod embed;
mod embed_queue;
mod label;
mod label_queue;
pub mod local_embed;
pub mod query_intent;
pub mod query_time;
mod settings;
mod watcher;

use std::sync::{Arc, Mutex, OnceLock};
use std::str::FromStr;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::db::Db;
use crate::settings::{get_loaded_shortcut, ShortcutConfig};

pub static SHORTCUT: OnceLock<Arc<Mutex<Option<Shortcut>>>> = OnceLock::new();

/// Toggle the palette window. Used by both the global hotkey and the
/// CLI flag (`--palette`) so the two paths share identical behaviour.
fn toggle_palette(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("palette") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
        } else {
            let _ = w.center();
            let _ = w.show();
            let _ = w.set_focus();
            let _ = app.emit("palette-shown", ());
        }
    }
}

/// Bring the library window forward. Used when the binary is invoked
/// without flags — gives Wayland users a deterministic "click this in
/// my DE settings to open the app" entry point even when the global
/// shortcut isn't available.
fn focus_library(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("library") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        set_dock_visible(app, true);
    }
}

/// Show/hide the dock icon. Yank is a menu-bar app first; the dock icon
/// should only appear while the library window is on screen, not when
/// the chromeless palette is the only visible surface.
#[cfg(target_os = "macos")]
fn set_dock_visible(app: &tauri::AppHandle, visible: bool) {
    let policy = if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}

#[cfg(not(target_os = "macos"))]
fn set_dock_visible(_app: &tauri::AppHandle, _visible: bool) {}

/// Remove Windows window-chrome artifacts from the chromeless palette.
/// Even with `decorations: false`, Windows may still draw sizing borders
/// (WS_THICKFRAME) and sunken/raised edges (WS_EX_CLIENTEDGE,
/// WS_EX_WINDOWEDGE) that produce visible 1px hairlines around the palette.
/// This strips those styles and forces a frame redraw via SetWindowPos.
#[cfg(target_os = "windows")]
fn strip_palette_chrome(w: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW,
        GWL_STYLE, GWL_EXSTYLE,
        WS_THICKFRAME, WS_EX_CLIENTEDGE, WS_EX_WINDOWEDGE,
        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        SetWindowPos,
    };

    let Ok(hwnd_tauri) = w.hwnd() else { return };
    let raw: *mut std::ffi::c_void = hwnd_tauri.0;
    let hwnd = windows::Win32::Foundation::HWND(raw);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let _ = SetWindowLongPtrW(
            hwnd,
            GWL_STYLE,
            style & !(WS_THICKFRAME.0 as isize),
        );

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let _ = SetWindowLongPtrW(
            hwnd,
            GWL_EXSTYLE,
            ex_style
                & !(WS_EX_CLIENTEDGE.0 as isize
                    | WS_EX_WINDOWEDGE.0 as isize),
        );

        let _ = SetWindowPos(
            hwnd,
            None,
            0, 0, 0, 0,
            SWP_FRAMECHANGED
                | SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOZORDER,
        );
    }
}

/// Dispatch CLI args. `is_second_instance` is true when invoked via the
/// single-instance plugin (a second `yank ...` call routed to
/// the running app). Honoured flags:
///   --palette   toggle the palette
///   --library   focus the library
///   (bare)      focus the library on second instance; no-op on first
fn handle_cli_args(app: &tauri::AppHandle, args: &[String], is_second_instance: bool) {
    if args.iter().any(|a| a == "--palette") {
        toggle_palette(app);
        return;
    }
    if args.iter().any(|a| a == "--library") {
        focus_library(app);
        return;
    }
    // Bare second-instance invocation: someone hit the launcher again.
    // Bring the library forward so it doesn't feel like a no-op.
    if is_second_instance {
        focus_library(app);
    }
}

pub fn build_shortcut(sc: &ShortcutConfig) -> Shortcut {
    // Legacy stores may have persisted bogus bitmasks from earlier builds
    // (e.g. `6` which is ALT_GRAPH|CAPS_LOCK). Detect anything that doesn't
    // include at least one of the "normal" modifier keys and fall back to
    // Ctrl+Shift so the shortcut stays usable instead of binding to a bare key.
    let raw = sc.modifiers as u32;
    let useful = Modifiers::CONTROL.bits()
        | Modifiers::SHIFT.bits()
        | Modifiers::ALT.bits()
        | Modifiers::META.bits();
    let mods = if raw & useful == 0 {
        Modifiers::CONTROL | Modifiers::SHIFT
    } else {
        Modifiers::from_bits_truncate(raw)
    };
    let code = Code::from_str(&sc.key).unwrap_or_else(|_| {
        eprintln!("[shortcut] unrecognised key '{}', falling back to Space", sc.key);
        Code::Space
    });
    Shortcut::new(Some(mods), code)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered first so a second `yank`
        // invocation hands its args to the running app instead of starting
        // a new process. This is the Linux/Wayland fallback for global
        // hotkeys: users bind their DE's keyboard shortcut to
        // `yank --palette` and the running app handles it.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_cli_args(app, &args, true);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(lock) = SHORTCUT.get() {
                            if let Ok(guard) = lock.lock() {
                                if guard.as_ref() != Some(&shortcut) {
                                    return;
                                }
                            }
                        }
                        toggle_palette(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::list_items,
            commands::touch_item,
            commands::pin_item,
            commands::delete_item,
            commands::restore_item,
            commands::update_label,
            commands::clear_history,
            commands::retry_embed_backfill,
            commands::search_fts,
            commands::search_semantic,
            commands::strip_time,
            commands::strip_category,
            commands::get_image,
            commands::copy_image,
            settings::get_settings,
            settings::set_settings,
            settings::test_embed_provider,
            settings::get_hint_dismissed,
            settings::set_hint_dismissed,
            settings::get_shortcut,
            settings::set_shortcut,
            settings::get_autostart,
            settings::set_autostart,
            settings::get_theme,
            settings::set_theme,
        ])
        .setup(move |app| {
            // Updater plugin is desktop-only; init here so the app handle is
            // available for downloadAndInstall + relaunch wiring on the JS side.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");
            let db_path = data_dir.join("clips.db");
            let conn = db::open(&db_path).expect("failed to open db");
            let db = Arc::new(Db(Mutex::new(conn)));
            app.manage(db.clone());

            let settings_state = settings::init(app.handle());
            app.manage(settings::SettingsState(settings_state));
            app.manage(local_embed::LocalState::new());

            watcher::spawn(app.handle().clone());
            commands::spawn_sweeper(app.handle().clone());
            embed_queue::spawn(app.handle().clone());
            label_queue::spawn(app.handle().clone());

            let sc = get_loaded_shortcut(app.handle());
            let shortcut = build_shortcut(&sc);
            if let Err(e) = app.global_shortcut().register(shortcut.clone()) {
                eprintln!("[shortcut] register failed: {e}");
            }
            SHORTCUT
                .get_or_init(|| Arc::new(Mutex::new(None)))
                .lock()
                .map_err(|e| e.to_string())?
                .replace(shortcut);

            // macOS needs an application menu for the OS to route standard
            // shortcuts (Cmd+W, Cmd+Q, Cmd+M, …). Without it, our chromeless
            // window swallows them. Windows/Linux get Alt+F4 from the WM.
            #[cfg(target_os = "macos")]
            {
                app.set_menu(Menu::default(app.handle())?)?;
            }

            let open_library_i =
                MenuItem::with_id(app, "show", "Open Library", true, None::<&str>)?;
            let open_palette_i =
                MenuItem::with_id(app, "palette", "Open Palette", true, None::<&str>)?;
            let show_pinned_i =
                MenuItem::with_id(app, "show_pinned", "Show Pinned", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide Library", true, None::<&str>)?;
            let sep_a = PredefinedMenuItem::separator(app)?;
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_i = CheckMenuItem::with_id(
                app,
                "autostart",
                "Launch at Startup",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let clear_i =
                MenuItem::with_id(app, "clear", "Clear History", true, None::<&str>)?;
            let sep_b = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_library_i,
                    &open_palette_i,
                    &show_pinned_i,
                    &hide_i,
                    &sep_a,
                    &autostart_i,
                    &clear_i,
                    &sep_b,
                    &quit_i,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Yank")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("library") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                            set_dock_visible(app, true);
                            let _ = app.emit("library-filter", "all");
                        }
                    }
                    "palette" => {
                        if let Some(w) = app.get_webview_window("palette") {
                            let _ = w.center();
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = app.emit("palette-shown", ());
                        }
                    }
                    "show_pinned" => {
                        if let Some(w) = app.get_webview_window("library") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                            set_dock_visible(app, true);
                            let _ = app.emit("library-filter", "pinned");
                        }
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("library") {
                            let _ = w.hide();
                            set_dock_visible(app, false);
                        }
                    }
                    "autostart" => {
                        let mgr = app.autolaunch();
                        let enabled = mgr.is_enabled().unwrap_or(false);
                        if enabled {
                            let _ = mgr.disable();
                        } else {
                            let _ = mgr.enable();
                        }
                        let _ = app.emit(
                            "autostart-changed",
                            mgr.is_enabled().unwrap_or(false),
                        );
                    }
                    "clear" => {
                        if let Some(db) = app.try_state::<Arc<crate::db::Db>>() {
                            if let Ok(conn) = db.0.lock() {
                                let _ = conn.execute(
                                    "DELETE FROM items WHERE pinned = 0",
                                    [],
                                );
                            }
                        }
                        let _ = app.emit("clip-swept", 0u32);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("library") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                                set_dock_visible(app, false);
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                                set_dock_visible(app, true);
                            }
                        }
                    }
                })
                .build(app)?;

            if let Some(w) = app.get_webview_window("library") {
                let wc = w.clone();
                let app_handle = app.handle().clone();
                w.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = wc.hide();
                        set_dock_visible(&app_handle, false);
                    }
                });
            }

            if let Some(w) = app.get_webview_window("palette") {
                let _ = w.set_shadow(false);

                #[cfg(target_os = "windows")]
                strip_palette_chrome(&w);

                let wc = w.clone();
                w.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = wc.hide();
                    }
                    WindowEvent::Focused(false) => {
                        let _ = wc.hide();
                    }
                    _ => {}
                });
            }

            // Apply OS-standard corner rounding to both windows.
            #[cfg(target_os = "macos")]
            {
                use objc::{msg_send, sel, sel_impl, runtime::{Object, YES}};
                let radius: f64 = 10.0;
                for label in &["library", "palette"] {
                    if let Some(w) = app.get_webview_window(label) {
                        if let Ok(ptr) = w.ns_window() {
                            let ns_window = ptr as *mut Object;
                            unsafe {
                                let content_view: *mut Object = msg_send![ns_window, contentView];
                                if !content_view.is_null() {
                                    let _: () = msg_send![content_view, setWantsLayer: YES];
                                    let layer: *mut Object = msg_send![content_view, layer];
                                    if !layer.is_null() {
                                        let _: () = msg_send![layer, setCornerRadius: radius];
                                        let _: () = msg_send![layer, setMasksToBounds: YES];
                                    }
                                }
                            }
                        }
                    }
                }
            }

            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Graphics::Dwm::{
                    DwmSetWindowAttribute,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    DWMWCP_ROUND,
                };
                for label in &["library", "palette"] {
                    if let Some(w) = app.get_webview_window(label) {
                        if let Ok(hwnd_tauri) = w.hwnd() {
                            let raw: *mut std::ffi::c_void = hwnd_tauri.0;
                            let hwnd = windows::Win32::Foundation::HWND(raw);
                            unsafe {
                                let pref = DWMWCP_ROUND;
                                let _ = DwmSetWindowAttribute(
                                    hwnd,
                                    DWMWA_WINDOW_CORNER_PREFERENCE,
                                    &pref as *const _ as *const _,
                                    std::mem::size_of_val(&pref) as u32,
                                );
                            }
                        }
                    }
                }
            }

            // Cold-start with `--palette` should also open the palette,
            // so a Wayland user pressing their DE shortcut for the first
            // time (before the app is running) gets the palette instead
            // of just the library window.
            let cli_args: Vec<String> = std::env::args().collect();
            handle_cli_args(app.handle(), &cli_args, false);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // macOS fires `Reopen` when the user clicks the dock icon
            // (or double-clicks the .app). The dock icon is only present
            // while the library window is on screen, so route the click
            // straight back to the library.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                focus_library(_app_handle);
            }
        });
}