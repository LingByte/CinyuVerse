// Cinyuverse is a GUI application in every Windows build profile. Keeping this
// conditional on `debug_assertions` makes debug installers allocate a console
// before Tauri creates the main window.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    cinyuverse::linux_display::configure_cef_display_backend();

    match browser_cef::bootstrap() {
        Ok(browser_cef::CefProcess::Browser(bootstrap)) => cinyuverse::run(Ok(bootstrap)),
        Ok(browser_cef::CefProcess::Child(exit_code)) => std::process::exit(exit_code),
        Err(error) => cinyuverse::run(Err(error.to_string())),
    }
}
