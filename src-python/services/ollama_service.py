#!/usr/bin/env python3

import aiohttp
import logging
from typing import List, Dict

from config import (
    OLLAMA_HOST,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT,
    SYSTEM_PROMPT,
    OLLAMA_CONTEXT_SIZE,
)
from exceptions import OllamaError, OllamaConnectionError, OllamaResponseError
from models.schemas import ChatMessage
from state import app_state

logger = logging.getLogger(__name__)


class OllamaService:
    """Service for AI chat integration using Ollama"""

    def __init__(self):
        self.host = OLLAMA_HOST
        self.model = OLLAMA_MODEL

    def _extract_content_from_response(self, data: Dict) -> str:
        """Extract content from Ollama response data"""
        msg = data.get("message") or {}
        content = msg.get("content", "")

        if not content and isinstance(data, dict):
            msgs = data.get("messages")
            if isinstance(msgs, list) and msgs:
                content = msgs[-1].get("content", "")

        if not content:
            raise OllamaResponseError(
                "Invalid Ollama response format: no 'content' field found",
                error_code="missing_content",
            )

        return content

    async def chat(self, messages: List[Dict[str, str]]) -> str:
        """Send chat request to Ollama and get response"""
        try:
            url = f"{self.host}/api/chat"
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0.7, "num_ctx": OLLAMA_CONTEXT_SIZE},
            }

            timeout = aiohttp.ClientTimeout(total=OLLAMA_TIMEOUT)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise OllamaResponseError(
                            f"Ollama API returned status {response.status}",
                            error_code=f"http_{response.status}",
                            original_error=Exception(error_text),
                        )

                    try:
                        data = await response.json()
                    except Exception as e:
                        raise OllamaResponseError(
                            "Failed to parse JSON response from Ollama",
                            error_code="json_parse_error",
                            original_error=e,
                        )

                    return self._extract_content_from_response(data)

        except OllamaError:
            raise
        except aiohttp.ClientError as e:
            if "Connection" in str(e) or "ConnectTimeout" in str(e):
                raise OllamaConnectionError(
                    "Ollama is not running or not accessible. Please start Ollama first.",
                    error_code="connection_failed",
                    original_error=e,
                )
            raise OllamaConnectionError(
                "Failed to connect to Ollama service",
                error_code="client_error",
                original_error=e,
            )
        except Exception as e:
            logger.error(f"Unexpected Ollama chat error: {e}")
            raise OllamaError(
                "Unexpected error during Ollama chat",
                error_code="unexpected_error",
                original_error=e,
            )

    async def chat_completion(self, message: ChatMessage) -> Dict[str, str]:
        """Process a chat completion request"""
        try:
            session_id = message.session_id or "default"

            # Initialize conversation history if needed
            if session_id not in app_state.conversation_history:
                app_state.conversation_history[session_id] = []
                if SYSTEM_PROMPT:
                    app_state.conversation_history[session_id].append(
                        {"role": "system", "content": SYSTEM_PROMPT}
                    )

            # Add user message to history
            app_state.conversation_history[session_id].append(
                {"role": "user", "content": message.text}
            )

            # Get AI response
            assistant_reply = await self.chat(
                app_state.conversation_history[session_id].copy()
            )

            # Add assistant response to history
            app_state.conversation_history[session_id].append(
                {"role": "assistant", "content": assistant_reply}
            )

            return {"response": assistant_reply}

        except OllamaError:
            raise
        except Exception as e:
            logger.error(f"Unexpected chat completion error: {e}")
            raise OllamaError(
                "Unexpected error during chat completion",
                error_code="chat_completion_error",
                original_error=e,
            )

    async def check_health(self) -> str:
        """Check if Ollama service is healthy"""
        try:
            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(f"{self.host}/api/tags") as response:
                    return "healthy" if response.status == 200 else "unhealthy"
        except Exception as e:
            logger.debug(f"Health check failed: {e}")
            return "unhealthy"

    def clear_conversation(self, session_id: str) -> Dict[str, str]:
        """Clear conversation history for a session"""
        if session_id in app_state.conversation_history:
            del app_state.conversation_history[session_id]
            return {"status": "success", "message": "Conversation history cleared"}
        else:
            return {"status": "info", "message": "No conversation history found"}

    def get_service_info(self) -> Dict[str, str]:
        """Get information about the Ollama service"""
        return {"host": self.host, "model": self.model}


ollama_service = OllamaService()
