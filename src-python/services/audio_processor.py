#!/usr/bin/env python3

import json
import logging
import time
from typing import Optional

import numpy as np
import soundfile as sf

from config import ESTIMATED_START_DELAY
from utils.audio_utils import analyze_audio_for_visualization

logger = logging.getLogger(__name__)


class AudioProcessor:
    """Handles audio file processing and analysis for TTS"""

    @staticmethod
    async def process_audio_file(
        filename: str, start_time: float, websocket=None
    ) -> float:
        """Process audio file for analysis and prepare for playback"""
        try:
            audio_np, sr = sf.read(filename, dtype="float32")
            if audio_np.ndim > 1:
                audio_np = np.mean(audio_np, axis=1)

            duration = len(audio_np) / sr
            analysis = analyze_audio_for_visualization(audio_np, sr)

            if websocket:
                await AudioProcessor._send_audio_analysis(
                    websocket, duration, analysis, start_time
                )

            return duration

        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            raise

    @staticmethod
    async def _send_audio_analysis(
        websocket, duration: float, analysis: dict, start_time: float
    ) -> None:
        """Send audio analysis data to websocket client"""
        message = {
            "type": "audio_analysis",
            "duration": duration,
            "analysis": analysis,
            "start_time": start_time,
            "estimated_start_delay": ESTIMATED_START_DELAY,
        }
        await websocket.send_text(json.dumps(message))

    @staticmethod
    async def send_completion_signal(websocket) -> None:
        """Send TTS completion signal to websocket client"""
        if websocket:
            logger.info("Sending tts_complete signal")
            await websocket.send_text(json.dumps({"type": "tts_complete"}))

    @staticmethod
    async def send_error_and_complete(websocket, error_message: str) -> None:
        """Send error message and completion signal to websocket client"""
        if websocket:
            await websocket.send_text(
                json.dumps({"type": "error", "message": error_message})
            )
            await AudioProcessor.send_completion_signal(websocket)
