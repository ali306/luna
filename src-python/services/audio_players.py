#!/usr/bin/env python3

import asyncio
import contextlib
import logging
import os
import sys
from abc import ABC, abstractmethod
from typing import Optional

from config import PLAYBACK_CHECK_INTERVAL, PROCESS_WAIT_TIMEOUT
from exceptions import TTSPlaybackError
from state import app_state

logger = logging.getLogger(__name__)


class AudioPlayer(ABC):
    """Abstract base class for platform-specific audio players"""

    @abstractmethod
    async def play_file(self, filename: str) -> None:
        """Play an audio file"""
        pass

    @abstractmethod
    async def stop_playback(self) -> None:
        """Stop current playback"""
        pass


class UnixAudioPlayer(AudioPlayer):
    """Audio player for Unix-like systems (macOS and Linux)"""

    def __init__(self, command: str):
        self.command = command

    async def play_file(self, filename: str) -> None:
        """Play audio file using Unix command"""
        if not os.path.exists(filename):
            raise TTSPlaybackError(
                f"Audio file {filename} does not exist", error_code="file_not_found"
            )

        proc = await asyncio.create_subprocess_exec(self.command, filename)
        with app_state.playback_lock:
            app_state.current_playback_process = proc

        await self._wait_for_process_with_cancellation(proc)

    async def stop_playback(self) -> None:
        """Stop current playback by killing the process"""
        if app_state.current_playback_process and hasattr(
            app_state.current_playback_process, "kill"
        ):
            with contextlib.suppress(ProcessLookupError):
                app_state.current_playback_process.kill()

    async def _wait_for_process_with_cancellation(self, proc):
        """Wait for subprocess completion with proper cancellation handling"""
        try:
            while proc.returncode is None:
                try:
                    await asyncio.wait_for(proc.wait(), timeout=PLAYBACK_CHECK_INTERVAL)
                    break
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            with contextlib.suppress(ProcessLookupError):
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=PROCESS_WAIT_TIMEOUT)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
            raise


class WindowsAudioPlayer(AudioPlayer):
    """Audio player for Windows systems"""

    async def play_file(self, filename: str) -> None:
        """Play audio file on Windows using pygame or winsound fallback"""
        if not os.path.exists(filename):
            raise TTSPlaybackError(
                f"Audio file {filename} does not exist", error_code="file_not_found"
            )

        try:
            await self._play_with_pygame(filename)
        except ImportError:
            await self._play_with_winsound(filename)

    async def stop_playback(self) -> None:
        """Stop current Windows playback"""
        if app_state.current_playback_process == "pygame_active":
            try:
                import pygame

                pygame.mixer.music.stop()
                pygame.mixer.quit()
            except ImportError:
                pass

    async def _play_with_pygame(self, filename: str) -> None:
        """Play audio using pygame"""
        import pygame

        pygame.mixer.init()
        pygame.mixer.music.load(filename)
        pygame.mixer.music.play()

        with app_state.playback_lock:
            app_state.current_playback_process = "pygame_active"

        try:
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(PLAYBACK_CHECK_INTERVAL)
                if app_state.current_playback_process != "pygame_active":
                    pygame.mixer.music.stop()
                    break
        except asyncio.CancelledError:
            pygame.mixer.music.stop()
            raise
        finally:
            pygame.mixer.quit()

    async def _play_with_winsound(self, filename: str) -> None:
        """Fallback to winsound for audio playback"""
        try:
            import winsound

            await asyncio.to_thread(
                winsound.PlaySound,
                filename,
                winsound.SND_FILENAME | winsound.SND_NODEFAULT,
            )
        except Exception as e:
            raise TTSPlaybackError(
                "Windows audio playback failed",
                error_code="windows_playback_failed",
                original_error=e,
            )


class AudioPlayerFactory:
    """Factory for creating platform-specific audio players"""

    @staticmethod
    def create_player() -> AudioPlayer:
        """Create the appropriate audio player for the current platform"""
        if sys.platform == "darwin":
            return UnixAudioPlayer("afplay")
        elif sys.platform == "linux":
            return UnixAudioPlayer("aplay")
        elif sys.platform == "win32":
            return WindowsAudioPlayer()
        else:
            raise TTSPlaybackError(
                f"Unsupported platform for audio playback: {sys.platform}",
                error_code="unsupported_platform",
            )
