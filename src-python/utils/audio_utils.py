#!/usr/bin/env python3

import asyncio
import contextlib
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import soundfile as sf

from config import AUDIO_TIMEOUT, CHUNK_DURATION, DEFAULT_SAMPLE_RATE

logger = logging.getLogger(__name__)


def _sanitize_file_path(file_path: str) -> str:
    """Sanitize file path to prevent command injection"""
    if not file_path:
        raise ValueError("File path cannot be empty")

    # Convert to Path object for validation
    path = Path(file_path)

    # Ensure path is absolute and normalized
    if not path.is_absolute():
        raise ValueError("File path must be absolute")

    # Check for path traversal attempts
    normalized = path.resolve()
    if ".." in str(normalized) or str(normalized) != str(path.resolve()):
        raise ValueError("Path traversal detected in file path")

    # Ensure the path exists and is a file
    if not normalized.exists():
        raise ValueError(f"File does not exist: {normalized}")

    if not normalized.is_file():
        raise ValueError(f"Path is not a file: {normalized}")

    return str(normalized)


def _sanitize_numeric_param(value: int) -> str:
    """Sanitize numeric parameters for FFmpeg commands"""
    if not isinstance(value, int) or value <= 0:
        raise ValueError(f"Invalid numeric parameter: {value}")
    return str(value)

SCIPY_AVAILABLE = False
scipy_signal = None
try:
    import scipy.signal as scipy_signal

    _ = scipy_signal.resample
    SCIPY_AVAILABLE = True
    logger.info("scipy.signal loaded successfully")
except (ImportError, AttributeError) as e:
    logger.warning(f"scipy not available - audio resampling may be limited: {e}")
except Exception as e:
    logger.warning(f"Unexpected error loading scipy: {e}")


async def run_cmd(
    cmd: List[str], timeout: float = AUDIO_TIMEOUT, check: bool = True
) -> subprocess.CompletedProcess:
    """Run a command asynchronously with timeout"""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=timeout)
    cp = subprocess.CompletedProcess(cmd, proc.returncode or 0, stdout, stderr)
    if check and cp.returncode != 0:
        raise subprocess.CalledProcessError(
            cp.returncode, cmd, output=stdout, stderr=stderr
        )
    return cp


async def process_audio_bytes(audio_bytes: bytes) -> np.ndarray:
    """Process raw audio bytes into normalized numpy array"""
    if not audio_bytes:
        return np.array([], dtype=np.float32)

    temp_input_path = None
    temp_output_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as temp_input:
            temp_input.write(audio_bytes)
            temp_input_path = temp_input.name

        temp_output_path = temp_input_path + ".wav"

        # Sanitize file paths to prevent command injection
        try:
            sanitized_input = _sanitize_file_path(temp_input_path)
            # For output path, we need to create it first since sanitization checks existence
            Path(temp_output_path).touch()
            sanitized_output = _sanitize_file_path(temp_output_path)
        except ValueError as e:
            logger.error(f"File path validation failed: {e}")
            raise subprocess.CalledProcessError(1, ["ffmpeg"], stderr=str(e).encode())

        # Sanitize numeric parameters
        try:
            sanitized_sample_rate = _sanitize_numeric_param(DEFAULT_SAMPLE_RATE)
        except ValueError as e:
            logger.error(f"Parameter validation failed: {e}")
            raise subprocess.CalledProcessError(1, ["ffmpeg"], stderr=str(e).encode())

        await run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                sanitized_input,
                "-ar",
                sanitized_sample_rate,
                "-ac",
                "1",
                "-f",
                "wav",
                sanitized_output,
            ],
            timeout=AUDIO_TIMEOUT,
        )

        audio_np, sr = sf.read(sanitized_output, dtype="float32", always_2d=False)

        # Convert to mono if stereo
        if audio_np.ndim > 1:
            audio_np = np.mean(audio_np, axis=1)

        # Resample if necessary
        if sr != DEFAULT_SAMPLE_RATE and SCIPY_AVAILABLE and scipy_signal is not None:
            try:
                audio_np = scipy_signal.resample(
                    audio_np, int(len(audio_np) * DEFAULT_SAMPLE_RATE / sr)
                )
            except Exception as e:
                logger.warning(f"Resampling failed: {e}")

        return np.clip(np.asarray(audio_np, dtype=np.float32), -1.0, 1.0)

    except subprocess.CalledProcessError:
        # Fallback: try to interpret as raw audio
        try:
            raw_array = np.frombuffer(audio_bytes, dtype=np.int16)
            raw = raw_array.astype(np.float32) / 32768.0
            return np.clip(raw, -1.0, 1.0)
        except Exception:
            return np.array([], dtype=np.float32)
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        return np.array([], dtype=np.float32)
    finally:
        # Cleanup temporary files
        for path in [temp_input_path, temp_output_path]:
            if path and os.path.exists(path):
                with contextlib.suppress(Exception):
                    os.unlink(path)


def analyze_audio_for_visualization(
    audio_data: np.ndarray, sample_rate: int, chunk_duration: float = CHUNK_DURATION
) -> List[Dict[str, Any]]:
    """Analyze audio data for visualization purposes"""
    if len(audio_data) == 0:
        return []

    chunk_size = int(sample_rate * chunk_duration)
    chunks = []

    for i in range(0, len(audio_data), chunk_size):
        chunk = audio_data[i : i + chunk_size]
        if len(chunk) < 64:
            continue

        if len(chunk) < chunk_size:
            chunk = np.pad(chunk, (0, chunk_size - len(chunk)), mode="constant")

        # RMS calculation
        rms = float(np.sqrt(np.mean(chunk**2)))

        # FFT analysis
        fft = np.fft.rfft(chunk)
        frequencies = np.fft.rfftfreq(len(chunk), 1 / sample_rate)

        # Frequency band analysis
        bass_mask = (frequencies >= 0) & (frequencies <= 200)
        low_mid_mask = (frequencies > 200) & (frequencies <= 800)
        high_mid_mask = (frequencies > 800) & (frequencies <= 2000)
        high_mask = frequencies > 2000

        bass_energy = np.mean(np.abs(fft[bass_mask])) if np.any(bass_mask) else 0.0
        low_mid_energy = (
            np.mean(np.abs(fft[low_mid_mask])) if np.any(low_mid_mask) else 0.0
        )
        high_mid_energy = (
            np.mean(np.abs(fft[high_mid_mask])) if np.any(high_mid_mask) else 0.0
        )
        high_energy = np.mean(np.abs(fft[high_mask])) if np.any(high_mask) else 0.0

        # Normalize
        norm = max(bass_energy, low_mid_energy, high_mid_energy, high_energy, 1e-6)

        chunks.append(
            {
                "time": i / sample_rate,
                "volume": rms,
                "bass": float(bass_energy / norm),
                "low_mid": float(low_mid_energy / norm),
                "high_mid": float(high_mid_energy / norm),
                "high": float(high_energy / norm),
            }
        )

    return chunks
