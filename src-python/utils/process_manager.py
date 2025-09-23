#!/usr/bin/env python3

import os
import sys
import signal
import tempfile
import atexit
import logging
from typing import Optional

from config import PORT

logger = logging.getLogger(__name__)


class ProcessManager:
    """Manages process lifecycle, PID files, and signal handling"""

    def __init__(self, port: int = PORT):
        self.port = port
        self.pid_file: Optional[str] = None
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown"""
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        atexit.register(self.cleanup_pid_file)

    def _signal_handler(self, signum: int, _frame) -> None:
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.cleanup_pid_file()
        sys.exit(0)

    def create_pid_file(self) -> bool:
        """Create a PID file to track the running instance"""
        self.pid_file = os.path.join(
            tempfile.gettempdir(), f"luna_tauri_sidecar_{self.port}.pid"
        )
        try:
            with open(self.pid_file, "w") as f:
                f.write(str(os.getpid()))
            logger.info(f"Created PID file: {self.pid_file}")
            return True
        except Exception as e:
            logger.error(f"Failed to create PID file: {e}")
            return False

    def cleanup_pid_file(self):
        """Remove the PID file on exit"""
        if self.pid_file and os.path.exists(self.pid_file):
            try:
                os.unlink(self.pid_file)
                logger.info(f"Cleaned up PID file: {self.pid_file}")
            except Exception as e:
                logger.warning(f"Failed to remove PID file: {e}")

    def is_another_instance_running(self) -> bool:
        """Check if another instance is already running by checking PID file"""
        pid_file_path = os.path.join(
            tempfile.gettempdir(), f"luna_tauri_sidecar_{self.port}.pid"
        )
        if os.path.exists(pid_file_path):
            try:
                with open(pid_file_path, "r") as f:
                    pid = int(f.read().strip())
                # Check if process is still running
                try:
                    os.kill(pid, 0)  # Signal 0 just checks if process exists
                    logger.info(f"Another instance is running with PID {pid}")
                    return True
                except OSError:
                    # Process doesn't exist, remove stale PID file
                    try:
                        os.unlink(pid_file_path)
                        logger.info(f"Removed stale PID file: {pid_file_path}")
                    except Exception:
                        pass
            except Exception:
                # Invalid PID file, remove it
                try:
                    os.unlink(pid_file_path)
                    logger.info(f"Removed invalid PID file: {pid_file_path}")
                except Exception:
                    pass
        return False

    def prevent_duplicate_execution(self) -> bool:
        """Prevent duplicate execution in bundled mode"""
        import __main__

        if hasattr(__main__, "_luna_main_executed"):
            logger.warning(
                "Main thread already executed, preventing duplicate execution"
            )
            return False
        __main__._luna_main_executed = True
        return True


process_manager = ProcessManager()
