use std::process::Command;
use std::time::Duration;
use log::{debug, info};

use crate::PROCESS_KILL_DELAY_MS;

#[cfg(target_os = "windows")]
mod commands {
    pub const KILL_TREE: &str = "taskkill";
    pub const KILL_TREE_ARGS: &[&str] = &["/F", "/T", "/PID"];
    pub const CHECK_PROCESS: &str = "tasklist";
    pub const CHECK_PROCESS_ARGS: &[&str] = &["/FI"];
    pub const NETSTAT: &str = "netstat";
    pub const NETSTAT_ARGS: &[&str] = &["-ano", "-p", "tcp"];
    pub const FORCE_KILL: &str = "taskkill";
    pub const FORCE_KILL_ARGS: &[&str] = &["/F", "/PID"];
}

#[cfg(target_os = "macos")]
mod commands {
    pub const FIND_CHILDREN: &str = "pgrep";
    pub const FIND_CHILDREN_ARGS: &[&str] = &["-P"];
    pub const KILL_TERM: &str = "kill";
    pub const KILL_FORCE: &str = "kill";
    pub const TERM_SIGNAL: &str = "-TERM";
    pub const KILL_SIGNAL: &str = "-KILL";
    pub const CHECK_SIGNAL: &str = "-0";
    pub const LSOF: &str = "lsof";
    pub const LSOF_ARGS: &[&str] = &["-ti"];
}

#[cfg(target_os = "linux")]
mod commands {
    pub const KILL_CHILDREN: &str = "pkill";
    pub const KILL_TERM: &str = "kill";
    pub const KILL_FORCE: &str = "kill";
    pub const TERM_SIGNAL: &str = "-TERM";
    pub const KILL_SIGNAL: &str = "-KILL";
    pub const CHECK_SIGNAL: &str = "-0";
    pub const PARENT_FLAG: &str = "-P";
    pub const FUSER: &str = "fuser";
    pub const FUSER_KILL_ARGS: &[&str] = &["-k"];
    pub const FUSER_TERM_ARGS: &[&str] = &["-k", "-TERM"];
}

#[derive(Debug)]
struct TerminationStrategy {
    graceful_cmd: String,
    graceful_args: Vec<String>,
    force_cmd: String,
    force_args: Vec<String>,
}

impl TerminationStrategy {
    fn execute(&self) {
        debug!("Executing graceful termination: {} {:?}", self.graceful_cmd, self.graceful_args);
        let _ = Command::new(&self.graceful_cmd).args(&self.graceful_args).output();

        std::thread::sleep(Duration::from_millis(PROCESS_KILL_DELAY_MS));

        debug!("Executing force termination: {} {:?}", self.force_cmd, self.force_args);
        let _ = Command::new(&self.force_cmd).args(&self.force_args).output();
    }

    #[cfg(not(target_os = "windows"))]
    fn for_pid(pid: u32) -> Self {
        Self {
            graceful_cmd: commands::KILL_TERM.to_string(),
            graceful_args: vec![commands::TERM_SIGNAL.to_string(), pid.to_string()],
            force_cmd: commands::KILL_FORCE.to_string(),
            force_args: vec![commands::KILL_SIGNAL.to_string(), pid.to_string()],
        }
    }

    #[cfg(target_os = "windows")]
    fn for_pid(pid: u32) -> Self {
        Self {
            graceful_cmd: commands::FORCE_KILL.to_string(),
            graceful_args: vec![commands::FORCE_KILL_ARGS[0].to_string(), commands::FORCE_KILL_ARGS[1].to_string(), pid.to_string()],
            force_cmd: commands::FORCE_KILL.to_string(),
            force_args: vec![commands::FORCE_KILL_ARGS[0].to_string(), commands::FORCE_KILL_ARGS[1].to_string(), pid.to_string()],
        }
    }
}

fn kill_process_tree_recursive(pid: u32) {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new(commands::FIND_CHILDREN)
            .args(&[commands::FIND_CHILDREN_ARGS[0], &pid.to_string()])
            .output()
        {
            if let Ok(child_pids) = String::from_utf8(output.stdout) {
                for child_pid in child_pids.lines() {
                    if let Ok(child_pid_num) = child_pid.trim().parse::<u32>() {
                        debug!("Killing child process: {}", child_pid_num);
                        kill_process_tree_recursive(child_pid_num);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new(commands::KILL_CHILDREN)
            .args(&[commands::TERM_SIGNAL, commands::PARENT_FLAG, &pid.to_string()])
            .output();
        std::thread::sleep(Duration::from_millis(PROCESS_KILL_DELAY_MS));
        let _ = Command::new(commands::KILL_CHILDREN)
            .args(&[commands::KILL_SIGNAL, commands::PARENT_FLAG, &pid.to_string()])
            .output();
    }

    debug!("Killing process tree for PID: {}", pid);
    let strategy = TerminationStrategy::for_pid(pid);
    strategy.execute();
}

#[cfg(target_os = "windows")]
fn kill_process_tree_platform(pid: u32) {
    let _ = Command::new(commands::KILL_TREE)
        .args(&[commands::KILL_TREE_ARGS[0], commands::KILL_TREE_ARGS[1], commands::KILL_TREE_ARGS[2], &pid.to_string()])
        .output();
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree_platform(pid: u32) {
    kill_process_tree_recursive(pid);
}

#[cfg(target_os = "macos")]
fn kill_process_on_port_platform(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    if let Ok(output) = Command::new(commands::LSOF)
        .args(&[&format!("{}:{}", commands::LSOF_ARGS[0], port)])
        .output()
    {
        if let Ok(pids) = String::from_utf8(output.stdout) {
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.trim().parse::<u32>() {
                    info!("Killing process on port {} (PID: {})", port, pid_num);
                    let strategy = TerminationStrategy::for_pid(pid_num);
                    strategy.execute();
                }
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn kill_process_on_port_platform(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let port_spec = format!("{}/tcp", port);

    let _ = Command::new(commands::FUSER)
        .args(&[commands::FUSER_TERM_ARGS[0], commands::FUSER_TERM_ARGS[1], &port_spec])
        .output();

    std::thread::sleep(Duration::from_millis(PROCESS_KILL_DELAY_MS));

    let _ = Command::new(commands::FUSER)
        .args(&[commands::FUSER_KILL_ARGS[0], &port_spec])
        .output();
    Ok(())
}

#[cfg(target_os = "windows")]
fn kill_process_on_port_platform(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    if let Ok(output) = Command::new(commands::NETSTAT)
        .args(commands::NETSTAT_ARGS)
        .output()
    {
        if let Ok(netstat_output) = String::from_utf8(output.stdout) {
            let port_pattern = format!(":{}", port);
            for line in netstat_output.lines() {
                if line.contains(&port_pattern) && line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        if let Ok(pid_num) = pid.parse::<u32>() {
                            info!("Killing process on port {} (PID: {})", port, pid_num);
                            let _ = Command::new(commands::FORCE_KILL)
                                .args(&[commands::FORCE_KILL_ARGS[0], commands::FORCE_KILL_ARGS[1], &pid_num.to_string()])
                                .output();
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn is_process_running_platform(pid: u32) -> bool {
    Command::new(commands::CHECK_PROCESS)
        .args(&[commands::CHECK_PROCESS_ARGS[0], &format!("PID eq {}", pid)])
        .output()
        .map(|output| {
            output.status.success()
                && String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_process_running_platform(pid: u32) -> bool {
    Command::new(commands::KILL_TERM)
        .args(&[commands::CHECK_SIGNAL, &pid.to_string()])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    kill_process_tree_platform(pid);

    #[cfg(not(target_os = "windows"))]
    kill_process_tree_platform(pid);
}

pub fn kill_process_on_port(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    kill_process_on_port_platform(port)
}

pub fn is_process_running(pid: u32) -> bool {
    is_process_running_platform(pid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn test_termination_strategy_debug() {
        let strategy = TerminationStrategy::for_pid(12345);
        let debug_str = format!("{:?}", strategy);
        assert!(debug_str.contains("TerminationStrategy"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_termination_strategy_for_pid_windows() {
        let strategy = TerminationStrategy::for_pid(12345);
        assert_eq!(strategy.graceful_cmd, "taskkill");
        assert!(strategy.graceful_args.contains(&"/F".to_string()));
        assert!(strategy.graceful_args.contains(&"/PID".to_string()));
        assert!(strategy.graceful_args.contains(&"12345".to_string()));
        assert_eq!(strategy.force_cmd, "taskkill");
        assert!(strategy.force_args.contains(&"/F".to_string()));
        assert!(strategy.force_args.contains(&"/PID".to_string()));
        assert!(strategy.force_args.contains(&"12345".to_string()));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn test_termination_strategy_for_pid_unix() {
        let strategy = TerminationStrategy::for_pid(12345);
        assert_eq!(strategy.graceful_cmd, "kill");
        assert!(strategy.graceful_args.contains(&"-TERM".to_string()));
        assert!(strategy.graceful_args.contains(&"12345".to_string()));
        assert_eq!(strategy.force_cmd, "kill");
        assert!(strategy.force_args.contains(&"-KILL".to_string()));
        assert!(strategy.force_args.contains(&"12345".to_string()));
    }

    #[test]
    #[serial]
    fn test_is_process_running_nonexistent_pid() {
        let result = is_process_running(999999);
        assert!(!result);
    }

    #[test]
    #[serial]
    fn test_kill_process_on_port_unused_port() {
        let result = kill_process_on_port(65432);
        assert!(result.is_ok());
    }

    #[test]
    #[serial]
    fn test_kill_process_tree_nonexistent_pid() {
        kill_process_tree(999999);
    }

    #[cfg(target_os = "windows")]
    mod windows_tests {
        use super::*;

        #[test]
        fn test_windows_commands() {
            assert_eq!(commands::KILL_TREE, "taskkill");
            assert_eq!(commands::CHECK_PROCESS, "tasklist");
            assert_eq!(commands::NETSTAT, "netstat");
            assert_eq!(commands::FORCE_KILL, "taskkill");
        }

        #[test]
        #[serial]
        fn test_kill_process_tree_platform_windows() {
            kill_process_tree_platform(999999);
        }

        #[test]
        #[serial]
        fn test_kill_process_on_port_platform_windows() {
            let result = kill_process_on_port_platform(65431);
            assert!(result.is_ok());
        }

        #[test]
        #[serial]
        fn test_is_process_running_platform_windows() {
            let result = is_process_running_platform(999999);
            assert!(!result);
        }
    }

    #[cfg(target_os = "macos")]
    mod macos_tests {
        use super::*;

        #[test]
        fn test_macos_commands() {
            assert_eq!(commands::FIND_CHILDREN, "pgrep");
            assert_eq!(commands::KILL_TERM, "kill");
            assert_eq!(commands::KILL_FORCE, "kill");
            assert_eq!(commands::LSOF, "lsof");
        }

        #[test]
        #[serial]
        fn test_kill_process_tree_recursive_macos() {
            kill_process_tree_recursive(999999);
        }

        #[test]
        #[serial]
        fn test_kill_process_on_port_platform_macos() {
            let result = kill_process_on_port_platform(65430);
            assert!(result.is_ok());
        }

        #[test]
        #[serial]
        fn test_is_process_running_platform_macos() {
            let result = is_process_running_platform(999999);
            assert!(!result);
        }
    }

    #[cfg(target_os = "linux")]
    mod linux_tests {
        use super::*;

        #[test]
        fn test_linux_commands() {
            assert_eq!(commands::KILL_CHILDREN, "pkill");
            assert_eq!(commands::KILL_TERM, "kill");
            assert_eq!(commands::KILL_FORCE, "kill");
            assert_eq!(commands::FUSER, "fuser");
        }

        #[test]
        #[serial]
        fn test_kill_process_tree_recursive_linux() {
            kill_process_tree_recursive(999999);
        }

        #[test]
        #[serial]
        fn test_kill_process_on_port_platform_linux() {
            let result = kill_process_on_port_platform(65429);
            assert!(result.is_ok());
        }

        #[test]
        #[serial]
        fn test_is_process_running_platform_linux() {
            let result = is_process_running_platform(999999);
            assert!(!result);
        }
    }

    mod general_tests {
        use super::*;

        #[test]
        fn test_termination_strategy_creation() {
            let strategy = TerminationStrategy::for_pid(1);
            assert!(!strategy.graceful_cmd.is_empty());
            assert!(!strategy.force_cmd.is_empty());
            assert!(!strategy.graceful_args.is_empty());
            assert!(!strategy.force_args.is_empty());
        }

        #[test]
        #[serial]
        fn test_public_api_functions() {
            let pid = 999998;

            assert!(!is_process_running(pid));

            kill_process_tree(pid);

            let result = kill_process_on_port(65428);
            assert!(result.is_ok());
        }
    }
}