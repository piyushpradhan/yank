//! Whether the tray background is light, and a hook for when that changes.
//! Self-contained (no tauri types) so each platform's code can be built alone.
//!
//! `watch` is called once from `setup`, on the main thread.

/// macOS tints the white template icon itself, so it never needs the dark one.
#[cfg(target_os = "macos")]
pub fn is_light() -> bool {
    false
}

/// Nothing to watch: the OS re-tints the template icon itself.
#[cfg(target_os = "macos")]
pub fn watch(_on_change: impl Fn() + Clone + Send + 'static) {}

#[cfg(target_os = "windows")]
use windows::{
    core::{w, Owned, PCWSTR},
    Win32::{
        Foundation::WAIT_OBJECT_0,
        System::{
            Registry::{
                RegGetValueW, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
                KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RRF_RT_REG_DWORD,
            },
            Threading::{CreateEventW, WaitForSingleObject, INFINITE},
        },
    },
};

#[cfg(target_os = "windows")]
const PERSONALIZE: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");

/// The taskbar/tray follows `SystemUsesLightTheme`; `AppsUseLightTheme` (what
/// tao reports as the window theme) can differ. Missing value (Windows 10
/// before 1903, always dark taskbar) reads as dark.
#[cfg(target_os = "windows")]
pub fn is_light() -> bool {
    read_windows_theme(HKEY_CURRENT_USER, PERSONALIZE)
}

#[cfg(target_os = "windows")]
fn read_windows_theme(key: HKEY, path: PCWSTR) -> bool {
    let mut data = 0u32;
    let mut len = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            key,
            path,
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut u32 as *mut _),
            Some(&mut len),
        )
    };
    status.is_ok() && data == 1
}

/// Windows only emits a window theme event when the *app* mode changes, so
/// watch the registry key behind the taskbar mode instead.
#[cfg(target_os = "windows")]
pub fn watch(on_change: impl Fn() + Clone + Send + 'static) {
    std::thread::spawn(move || unsafe {
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PERSONALIZE, None, KEY_NOTIFY, &mut key).is_err() {
            return;
        }
        let key = Owned::new(key);
        let Ok(event) = CreateEventW(None, false, false, None) else {
            return;
        };
        let event = Owned::new(event);
        watch_changes(
            || {
                RegNotifyChangeKeyValue(*key, false, REG_NOTIFY_CHANGE_LAST_SET, Some(*event), true)
                    .is_ok()
            },
            || WaitForSingleObject(*event, INFINITE) == WAIT_OBJECT_0,
            on_change,
        );
        // Cancel the registration before closing the event it may signal.
        drop(key);
    });
}

#[cfg(any(target_os = "windows", test))]
fn watch_changes(
    mut arm: impl FnMut() -> bool,
    mut wait: impl FnMut() -> bool,
    mut on_change: impl FnMut(),
) {
    // Arm before refreshing so a write during the callback wakes the next wait.
    while arm() {
        on_change();
        if !wait() {
            break;
        }
    }
}

#[cfg(target_os = "linux")]
use gtk::prelude::GtkSettingsExt;

/// GNOME Shell's (and so Ubuntu's) top bar stays dark in light mode. Other
/// panels mostly follow the GTK theme.
// ponytail: GTK theme stands in for the panel on non-GNOME desktops; a Plasma
// or Cinnamon theme that differs from the GTK theme still gets the wrong glyph.
#[cfg(target_os = "linux")]
pub fn is_light() -> bool {
    let desktops = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let settings = gtk::Settings::default();
    let theme = settings.as_ref().and_then(|s| s.gtk_theme_name());
    let gtk = settings.as_ref().map(|s| {
        (
            theme.as_deref().unwrap_or(""),
            s.is_gtk_application_prefer_dark_theme(),
        )
    });
    linux_is_light(&desktops, gtk)
}

#[cfg(any(target_os = "linux", test))]
fn linux_is_light(desktops: &str, gtk: Option<(&str, bool)>) -> bool {
    let desktops = desktops.to_lowercase();
    let has = |name: &str| desktops.split(':').any(|d| d == name);
    // Budgie reports "Budgie:GNOME" but themes its own panel.
    if (has("gnome") || has("unity")) && !has("budgie") {
        return false;
    }
    gtk.is_some_and(|(theme, prefer_dark)| !(theme.to_lowercase().contains("dark") || prefer_dark))
}

/// tao never emits `ThemeChanged` on Linux; GTK's own settings do notify when
/// the desktop switches theme.
#[cfg(target_os = "linux")]
pub fn watch(on_change: impl Fn() + Clone + Send + 'static) {
    let Some(settings) = gtk::Settings::default() else {
        return;
    };
    let f = on_change.clone();
    settings.connect_gtk_theme_name_notify(move |_| f());
    settings.connect_gtk_application_prefer_dark_theme_notify(move |_| on_change());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn linux_tray_theme_handles_gnome_budgie_and_gtk_preferences() {
        for (desktop, gtk, light) in [
            ("ubuntu:GNOME", Some(("Adwaita", false)), false),
            ("Unity", Some(("Adwaita", false)), false),
            ("Budgie:GNOME", Some(("Adwaita", false)), true),
            ("KDE", Some(("Breeze", false)), true),
            ("XFCE", Some(("Adwaita", true)), false),
            ("X-Cinnamon", Some(("Mint-Y-Dark", false)), false),
            ("unknown", None, false),
        ] {
            assert_eq!(
                linux_is_light(desktop, gtk),
                light,
                "desktop={desktop}, gtk={gtk:?}"
            );
        }
    }

    #[test]
    fn watcher_keeps_notifications_arriving_during_refresh() {
        let armed = Cell::new(false);
        let pending = Cell::new(false);
        let refreshes = Cell::new(0);
        watch_changes(
            || {
                assert!(
                    !armed.replace(true),
                    "previous notification must be consumed"
                );
                true
            },
            || {
                assert!(
                    pending.replace(false),
                    "write during refresh must wake the wait"
                );
                armed.set(false);
                refreshes.get() < 2
            },
            || {
                assert!(armed.get(), "watch must be armed before reading the theme");
                refreshes.set(refreshes.get() + 1);
                pending.set(true);
            },
        );
        assert_eq!(refreshes.get(), 2);
    }

    #[test]
    fn watcher_does_not_refresh_when_registration_fails() {
        watch_changes(
            || false,
            || panic!("must not wait"),
            || panic!("must not refresh"),
        );
    }

    #[test]
    fn watcher_exits_when_wait_fails() {
        let refreshes = Cell::new(0);
        watch_changes(
            || {
                assert_eq!(refreshes.get(), 0, "a failed wait must not re-arm");
                true
            },
            || false,
            || refreshes.set(refreshes.get() + 1),
        );
        assert_eq!(refreshes.get(), 1);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod windows_tests {
    use super::*;
    use std::cell::RefCell;
    use windows::Win32::System::Registry::{
        RegCreateKeyExW, RegDeleteTreeW, RegSetValueExW, KEY_ALL_ACCESS, REG_DWORD,
        REG_OPTION_NON_VOLATILE,
    };

    struct TestKey {
        key: Owned<HKEY>,
        path: Vec<u16>,
    }

    impl TestKey {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path: Vec<_> = format!(r"Software\YankTrayTest-{}-{nonce}", std::process::id())
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let mut key = HKEY::default();
            unsafe {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(path.as_ptr()),
                    None,
                    None,
                    REG_OPTION_NON_VOLATILE,
                    KEY_ALL_ACCESS,
                    None,
                    &mut key,
                    None,
                )
                .ok()
                .unwrap();
                Self {
                    key: Owned::new(key),
                    path,
                }
            }
        }

        fn set(&self, name: PCWSTR, value: u32) {
            unsafe {
                RegSetValueExW(*self.key, name, None, REG_DWORD, Some(&value.to_le_bytes()))
                    .ok()
                    .unwrap();
            }
        }

        fn is_light(&self) -> bool {
            read_windows_theme(*self.key, PCWSTR::null())
        }
    }

    impl Drop for TestKey {
        fn drop(&mut self) {
            unsafe {
                let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(self.path.as_ptr()));
            }
        }
    }

    #[test]
    fn windows_tray_theme_uses_system_mode_independently_of_app_mode() {
        let key = TestKey::new();
        key.set(w!("AppsUseLightTheme"), 1);
        assert!(
            !key.is_light(),
            "missing system mode defaults to a dark taskbar"
        );
        key.set(w!("SystemUsesLightTheme"), 0);
        assert!(
            !key.is_light(),
            "light apps must not select a dark glyph for a dark taskbar"
        );
        key.set(w!("AppsUseLightTheme"), 0);
        key.set(w!("SystemUsesLightTheme"), 1);
        assert!(
            key.is_light(),
            "dark apps must not select a white glyph for a light taskbar"
        );
    }

    #[test]
    fn windows_registry_notification_catches_taskbar_switch_during_refresh() {
        let key = TestKey::new();
        key.set(w!("SystemUsesLightTheme"), 0);
        let event = unsafe { Owned::new(CreateEventW(None, false, false, None).unwrap()) };
        let themes = RefCell::new(Vec::new());
        watch_changes(
            || unsafe {
                RegNotifyChangeKeyValue(
                    *key.key,
                    false,
                    REG_NOTIFY_CHANGE_LAST_SET,
                    Some(*event),
                    true,
                )
                .is_ok()
            },
            || {
                if themes.borrow().len() == 2 {
                    return false;
                }
                unsafe { WaitForSingleObject(*event, 2_000) == WAIT_OBJECT_0 }
            },
            || {
                themes.borrow_mut().push(key.is_light());
                if themes.borrow().len() == 1 {
                    key.set(w!("SystemUsesLightTheme"), 1);
                }
            },
        );
        assert_eq!(*themes.borrow(), [false, true]);
        drop(key);
    }
}
