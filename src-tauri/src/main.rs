// Cinyuverse is a GUI application in every Windows build profile. Keeping this
// conditional on `debug_assertions` makes debug installers allocate a console
// before Tauri creates the main window.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    cinyuverse::linux_display::configure_cef_display_backend();

    // Diagnostic lever: CEF is loaded into the desktop process before the Tauri
    // event loop starts. Setting CINYUVERSE_DISABLE_CEF=1 skips it entirely so
    // native-crash investigations can bisect against the embedded Chromium.
    // Only the exact value "1" disables it; "0" and empty keep CEF enabled.
    if std::env::var("CINYUVERSE_DISABLE_CEF").as_deref() == Ok("1") {
        cinyuverse::run(Err("CEF disabled by CINYUVERSE_DISABLE_CEF".to_string()));
        return;
    }

    match browser_cef::bootstrap() {
        Ok(browser_cef::CefProcess::Browser(bootstrap)) => cinyuverse::run(Ok(bootstrap)),
        Ok(browser_cef::CefProcess::Child(exit_code)) => std::process::exit(exit_code),
        Err(error) => cinyuverse::run(Err(error.to_string())),
    }
}
