use std::net::TcpStream;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use log::{debug, info, warn, error};

mod process;

const BACKEND_PORT: u16 = 40000;
const PROCESS_KILL_DELAY_MS: u64 = 500;
const SPAWN_COOLDOWN_SECS: u64 = 3;
const HEALTH_CHECK_CONNECT_TIMEOUT_SECS: u64 = 5;
const HEALTH_CHECK_MAX_TIME_SECS: u64 = 8;
const PORT_CLEANUP_TIMEOUT_SECS: u64 = 3;
const PORT_CHECK_INTERVAL_MS: u64 = 100;
const BACKEND_READY_CHECK_INTERVAL_MS: u64 = 1000;
const PROGRESS_LOG_INTERVAL_SECS: u64 = 5;
const BACKEND_READY_MAX_WAIT_SECS: u64 = 60;

#[derive(Debug)]
struct SidecarState {
    child: Option<tauri_plugin_shell::process::CommandChild>,
    is_ready: bool,
    pid: Option<u32>,
    spawn_time: Option<Instant>,
    should_run: bool,
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        info!("SidecarState dropping, cleaning up process");
        if let Some(child) = self.child.take() {
            let pid = child.pid();
            info!("Killing sidecar process tree (PID: {})", pid);
            kill_process_tree(pid);
            let _ = child.kill();
        }
    }
}

impl SidecarState {
    fn new() -> Self {
        Self {
            child: None,
            is_ready: false,
            pid: None,
            spawn_time: None,
            should_run: true,
        }
    }
}

type SidecarChild = Arc<Mutex<SidecarState>>;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn kill_process_tree(pid: u32) {
    process::kill_process_tree(pid);
}

pub fn is_port_available(port: u16) -> bool {
    TcpStream::connect(format!("127.0.0.1:{}", port)).is_err()
}

pub fn is_backend_healthy() -> bool {

    if is_port_available(BACKEND_PORT) {
        return false;
    }

    match Command::new("curl")
        .args(&[
            "-s",
            "-f",
            "--connect-timeout",
            &HEALTH_CHECK_CONNECT_TIMEOUT_SECS.to_string(),
            "--max-time",
            &HEALTH_CHECK_MAX_TIME_SECS.to_string(),
            &format!("http://127.0.0.1:{}/api/health", BACKEND_PORT),
        ])
        .output()
    {
        Ok(output) if output.status.success() => String::from_utf8(output.stdout)
            .map(|s| s.contains(r#""status":"healthy""#))
            .unwrap_or(false),
        Ok(output) => {
            debug!("Health check curl failed: {}", String::from_utf8_lossy(&output.stderr));
            false
        }
        Err(e) => {
            debug!("Health check curl error: {}", e);
            false
        }
    }
}

fn kill_existing_backend() -> Result<(), Box<dyn std::error::Error>> {
    info!("Cleaning up any existing backend processes...");

    process::kill_process_on_port(BACKEND_PORT)?;

    wait_for_port_release()
}

fn wait_for_port_release() -> Result<(), Box<dyn std::error::Error>> {
    let start = Instant::now();
    while !is_port_available(BACKEND_PORT) && start.elapsed() < Duration::from_secs(PORT_CLEANUP_TIMEOUT_SECS) {
        std::thread::sleep(Duration::from_millis(PORT_CHECK_INTERVAL_MS));
    }

    if is_port_available(BACKEND_PORT) {
        info!("Backend cleanup complete");
        Ok(())
    } else {
        Err(format!("Failed to free port {}", BACKEND_PORT).into())
    }
}

pub fn wait_for_backend_ready(max_wait: Duration) -> bool {
    info!("Waiting for backend to be ready...");
    let start = Instant::now();
    let mut last_log = Instant::now();

    while start.elapsed() < max_wait {
        if is_backend_healthy() {
            info!("Backend is ready after {:?}", start.elapsed());
            return true;
        }

        if last_log.elapsed() > Duration::from_secs(PROGRESS_LOG_INTERVAL_SECS) {
            info!("Still waiting for backend... ({:.1}s elapsed)", start.elapsed().as_secs_f32());
            last_log = Instant::now();
        }

        std::thread::sleep(Duration::from_millis(BACKEND_READY_CHECK_INTERVAL_MS));
    }

    warn!("Backend did not become ready within {:?}", max_wait);
    false
}

fn is_process_running(pid: u32) -> bool {
    process::is_process_running(pid)
}

fn spawn_sidecar_process(
    app_handle: &tauri::AppHandle,
    sidecar_state: &SidecarChild,
) -> Result<(), Box<dyn std::error::Error>> {
    if !should_spawn_sidecar(sidecar_state)? {
        return Ok(());
    }

    if is_backend_already_ready(sidecar_state)? {
        return Ok(());
    }

    info!("Starting Python backend sidecar...");
    prepare_backend_environment()?;

    let (rx, child_process) = create_and_spawn_sidecar(app_handle)?;
    let pid = child_process.pid();
    info!("Sidecar spawned with PID: {}", pid);

    update_sidecar_state(sidecar_state, child_process, pid)?;
    start_sidecar_monitoring(rx, sidecar_state, pid);

    Ok(())
}

fn should_spawn_sidecar(sidecar_state: &SidecarChild) -> Result<bool, Box<dyn std::error::Error>> {
    let state = sidecar_state
        .lock()
        .map_err(|e| format!("Failed to lock sidecar state: {}", e))?;

    if !state.should_run {
        debug!("Sidecar is marked for shutdown, not spawning");
        return Ok(false);
    }

    if let Some(pid) = state.pid {
        if is_process_running(pid) {
            debug!("Sidecar process already running (PID: {})", pid);
            return Ok(false);
        }
    }

    if let Some(spawn_time) = state.spawn_time {
        if spawn_time.elapsed() < Duration::from_secs(SPAWN_COOLDOWN_SECS) {
            debug!("Recent sidecar spawn detected, waiting before retry");
            return Ok(false);
        }
    }

    Ok(true)
}

fn is_backend_already_ready(sidecar_state: &SidecarChild) -> Result<bool, Box<dyn std::error::Error>> {
    if is_backend_healthy() {
        info!("Backend already healthy, updating state");
        let mut state = sidecar_state
            .lock()
            .map_err(|e| format!("Failed to lock sidecar state: {}", e))?;
        state.is_ready = true;
        return Ok(true);
    }
    Ok(false)
}

fn prepare_backend_environment() -> Result<(), Box<dyn std::error::Error>> {
    if !is_port_available(BACKEND_PORT) {
        warn!("Port {} in use but backend not healthy, cleaning up", BACKEND_PORT);
        kill_existing_backend()?;
    }
    Ok(())
}

fn create_and_spawn_sidecar(
    app_handle: &tauri::AppHandle,
) -> Result<(tauri::async_runtime::Receiver<CommandEvent>, tauri_plugin_shell::process::CommandChild), Box<dyn std::error::Error>> {
    let sidecar_command = app_handle
        .shell()
        .sidecar("main")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e).into())
}

fn update_sidecar_state(
    sidecar_state: &SidecarChild,
    child_process: tauri_plugin_shell::process::CommandChild,
    pid: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut state = sidecar_state
        .lock()
        .map_err(|e| format!("Failed to lock sidecar state: {}", e))?;
    state.child = Some(child_process);
    state.pid = Some(pid);
    state.is_ready = false;
    state.spawn_time = Some(Instant::now());
    Ok(())
}

fn start_sidecar_monitoring(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    sidecar_state: &SidecarChild,
    pid: u32,
) {
    let sidecar_monitor = Arc::clone(sidecar_state);
    tauri::async_runtime::spawn(async move {
        let mut backend_ready = false;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    handle_stdout_event(bytes);
                }
                CommandEvent::Stderr(bytes) => {
                    backend_ready = handle_stderr_event(bytes, backend_ready, &sidecar_monitor);
                }
                CommandEvent::Error(err) => {
                    error!("sidecar error: {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    handle_terminated_event(payload, &sidecar_monitor, pid);
                    break;
                }
                _ => {}
            }
        }
    });
}

fn handle_stdout_event(bytes: Vec<u8>) {
    let output = String::from_utf8_lossy(&bytes);
    let trimmed = output.trim();
    if !trimmed.is_empty() {
        debug!("sidecar stdout: {}", trimmed);
    }
}

fn handle_stderr_event(
    bytes: Vec<u8>,
    mut backend_ready: bool,
    sidecar_monitor: &SidecarChild,
) -> bool {
    let output = String::from_utf8_lossy(&bytes);
    let trimmed = output.trim();
    if !trimmed.is_empty() {
        debug!("sidecar stderr: {}", trimmed);

        if !backend_ready && trimmed.contains("Application startup complete") {
            backend_ready = true;
            if let Ok(mut state) = sidecar_monitor.lock() {
                state.is_ready = true;
                info!("Backend marked as ready");
            }
        }

        if trimmed.contains("Another instance is already running") {
            error!("Duplicate sidecar instance detected!");
        }
    }
    backend_ready
}

fn handle_terminated_event(
    payload: tauri_plugin_shell::process::TerminatedPayload,
    sidecar_monitor: &SidecarChild,
    pid: u32,
) {
    info!("Sidecar process terminated with code: {:?}", payload.code);

    if let Ok(mut state) = sidecar_monitor.lock() {
        if state.pid == Some(pid) {
            state.child = None;
            state.is_ready = false;
            state.pid = None;
            state.spawn_time = None;
        }
    }

    info!("Sidecar process terminated - no automatic restart");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state: SidecarChild = Arc::new(Mutex::new(SidecarState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_opener::init())
        .manage(sidecar_state.clone())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(move |app| {
            info!("Initializing application");

            let app_handle = app.handle().clone();
            let sidecar_for_setup = sidecar_state.clone();

            if let Err(e) = spawn_sidecar_process(&app_handle, &sidecar_for_setup) {
                error!("Failed to spawn sidecar: {}", e);
            }

            let cleanup_sidecar = |state_arc: &SidecarChild| {
                if let Ok(mut state) = state_arc.lock() {
                    info!("Application shutting down, stopping sidecar");
                    state.should_run = false;

                    if let Some(child) = state.child.take() {
                        let pid = child.pid();
                        info!("Terminating sidecar process tree (PID: {})", pid);

                        kill_process_tree(pid);

                        if let Err(e) = child.kill() {
                            error!("Failed to kill sidecar: {}", e);
                        }

                        state.is_ready = false;
                        state.pid = None;
                        state.spawn_time = None;
                    }
                }
            };

            if let Some(main_window) = app.get_webview_window("main") {
                let cleanup_clone = sidecar_state.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        cleanup_sidecar(&cleanup_clone);
                    }
                });
            }

            std::thread::spawn(move || {
                if wait_for_backend_ready(Duration::from_secs(BACKEND_READY_MAX_WAIT_SECS)) {
                    info!("Backend ready, application fully initialized");
                } else {
                    warn!("Backend initialization timeout");
                }
            });

            info!("Application setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use serial_test::serial;

    #[test]
    fn test_sidecar_state_new() {
        let state = SidecarState::new();
        assert!(state.child.is_none());
        assert!(!state.is_ready);
        assert!(state.pid.is_none());
        assert!(state.spawn_time.is_none());
        assert!(state.should_run);
    }

    #[test]
    fn test_greet() {
        let result = greet("Test");
        assert_eq!(result, "Hello, Test! You've been greeted from Rust!");
    }

    #[test]
    #[serial]
    fn test_is_port_available_with_invalid_port() {
        let result = is_port_available(65535);
        assert!(result);
    }

    #[test]
    #[serial]
    fn test_is_backend_healthy_when_port_unavailable() {
        let result = is_backend_healthy();
        assert!(!result);
    }

    #[test]
    fn test_wait_for_backend_ready_immediate_timeout() {
        let result = wait_for_backend_ready(Duration::from_millis(1));
        assert!(!result);
    }

    #[test]
    fn test_should_spawn_sidecar_when_should_not_run() {
        let state = Arc::new(Mutex::new(SidecarState {
            child: None,
            is_ready: false,
            pid: None,
            spawn_time: None,
            should_run: false,
        }));

        let result = should_spawn_sidecar(&state).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_should_spawn_sidecar_with_recent_spawn_time() {
        let state = Arc::new(Mutex::new(SidecarState {
            child: None,
            is_ready: false,
            pid: None,
            spawn_time: Some(Instant::now()),
            should_run: true,
        }));

        let result = should_spawn_sidecar(&state).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_should_spawn_sidecar_ready_to_spawn() {
        let state = Arc::new(Mutex::new(SidecarState {
            child: None,
            is_ready: false,
            pid: None,
            spawn_time: None,
            should_run: true,
        }));

        let result = should_spawn_sidecar(&state).unwrap();
        assert!(result);
    }

    #[test]
    fn test_handle_stdout_event_empty() {
        handle_stdout_event(vec![]);
    }

    #[test]
    fn test_handle_stdout_event_with_content() {
        handle_stdout_event(b"test output".to_vec());
    }

    #[test]
    fn test_handle_stderr_event_startup_complete() {
        let state = Arc::new(Mutex::new(SidecarState::new()));
        let result = handle_stderr_event(
            b"Application startup complete".to_vec(),
            false,
            &state,
        );
        assert!(result);
        assert!(state.lock().unwrap().is_ready);
    }

    #[test]
    fn test_handle_stderr_event_duplicate_instance() {
        let state = Arc::new(Mutex::new(SidecarState::new()));
        let result = handle_stderr_event(
            b"Another instance is already running".to_vec(),
            false,
            &state,
        );
        assert!(!result);
    }

    #[test]
    fn test_handle_terminated_event() {
        let state = Arc::new(Mutex::new(SidecarState {
            child: None,
            is_ready: true,
            pid: Some(12345),
            spawn_time: Some(Instant::now()),
            should_run: true,
        }));

        let payload = tauri_plugin_shell::process::TerminatedPayload {
            code: Some(0),
            signal: None,
        };

        handle_terminated_event(payload, &state, 12345);

        let locked_state = state.lock().unwrap();
        assert!(locked_state.child.is_none());
        assert!(!locked_state.is_ready);
        assert!(locked_state.pid.is_none());
        assert!(locked_state.spawn_time.is_none());
    }

    #[test]
    fn test_is_backend_already_ready_not_healthy() {
        let state = Arc::new(Mutex::new(SidecarState::new()));
        let result = is_backend_already_ready(&state).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_prepare_backend_environment_port_available() {
        let result = prepare_backend_environment();
        assert!(result.is_ok());
    }

    mod sidecar_state_tests {
        use super::*;

        #[test]
        fn test_sidecar_state_default_values() {
            let state = SidecarState::new();
            assert!(state.child.is_none());
            assert!(!state.is_ready);
            assert!(state.pid.is_none());
            assert!(state.spawn_time.is_none());
            assert!(state.should_run);
        }

        #[test]
        fn test_sidecar_state_debug_format() {
            let state = SidecarState::new();
            let debug_str = format!("{:?}", state);
            assert!(debug_str.contains("SidecarState"));
        }
    }

    mod health_check_tests {
        use super::*;

        #[test]
        #[serial]
        fn test_is_backend_healthy_no_port_listening() {
            let result = is_backend_healthy();
            assert!(!result);
        }
    }

    mod port_tests {
        use super::*;

        #[test]
        #[serial]
        fn test_is_port_available_unused_port() {
            let result = is_port_available(60000);
            assert!(result);
        }
    }
}