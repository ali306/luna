#!/usr/bin/env python3

import pytest
import aiohttp
from unittest.mock import Mock, AsyncMock, patch

from services.ollama_service import OllamaService, ollama_service
from models.schemas import ChatMessage
from exceptions import OllamaError, OllamaConnectionError, OllamaResponseError


class TestOllamaService:
    """Test cases for OllamaService."""

    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = OllamaService()

    def test_init(self):
        """Test OllamaService initialization."""
        assert self.service.host == "http://localhost:11434"
        assert self.service.model == "llama3.2"

    @pytest.mark.asyncio
    async def test_chat_success(self, mock_aiohttp_session):
        """Test successful chat request."""
        messages = [{"role": "user", "content": "Hello"}]

        # Create a proper async context manager for the session
        mock_session_instance = AsyncMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_aiohttp_session)
        mock_session_instance.__aexit__ = AsyncMock(return_value=None)

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            result = await self.service.chat(messages)

            assert result == "test response"
            mock_aiohttp_session.post.assert_called_once()

            # Verify the request payload
            call_args = mock_aiohttp_session.post.call_args
            assert call_args[0][0] == "http://localhost:11434/api/chat"
            payload = call_args[1]["json"]
            assert payload["model"] == "llama3.2"
            assert payload["messages"] == messages
            assert payload["stream"] is False

    @pytest.mark.asyncio
    async def test_chat_http_error(self):
        """Test chat request with HTTP error."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_response = AsyncMock()
        mock_response.status = 404
        mock_response.text.return_value = "Not found"

        # Create a mock that behaves like aiohttp response context manager
        class MockResponseContext:
            def __init__(self, response):
                self.response = response

            async def __aenter__(self):
                return self.response

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return None

        mock_session = AsyncMock()
        mock_session.post = Mock(return_value=MockResponseContext(mock_response))

        # Create a proper async context manager for the session
        mock_session_instance = AsyncMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_instance.__aexit__ = AsyncMock(return_value=None)

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with pytest.raises(
                OllamaResponseError, match="Ollama API returned status 404"
            ):
                await self.service.chat(messages)

    @pytest.mark.asyncio
    async def test_chat_alternative_response_format(
        self, mock_aiohttp_session_with_response
    ):
        """Test chat with alternative response format (messages array)."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={"messages": [{"content": "alternative response"}]}
        )

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            result = await self.service.chat(messages)

            assert result == "alternative response"

    @pytest.mark.asyncio
    async def test_chat_invalid_response_format(
        self, mock_aiohttp_session_with_response
    ):
        """Test chat with invalid response format."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={"message": {}},
            status=200,  # Empty message - will trigger the invalid format error
        )

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with pytest.raises(
                OllamaResponseError,
                match="Invalid Ollama response format: no 'content' field found",
            ):
                await self.service.chat(messages)

    @pytest.mark.asyncio
    async def test_chat_connection_error(self):
        """Test chat with connection error."""
        messages = [{"role": "user", "content": "Hello"}]

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session_class.side_effect = aiohttp.ClientConnectionError(
                "Connection refused"
            )

            with pytest.raises(
                OllamaConnectionError, match="Ollama is not running or not accessible"
            ):
                await self.service.chat(messages)

    @pytest.mark.asyncio
    async def test_chat_other_client_error(self):
        """Test chat with other client error."""
        messages = [{"role": "user", "content": "Hello"}]

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session_class.side_effect = aiohttp.ServerTimeoutError("Timeout")

            with pytest.raises(
                OllamaConnectionError, match="Failed to connect to Ollama service"
            ):
                await self.service.chat(messages)

    @pytest.mark.asyncio
    async def test_chat_completion_new_session(self):
        """Test chat completion with new session."""
        message = ChatMessage(text="Hello", session_id="test_session")

        from state import app_state

        with patch.object(self.service, "chat", new_callable=AsyncMock) as mock_chat:
            app_state.conversation_history = {}
            mock_chat.return_value = "AI response"

            result = await self.service.chat_completion(message)

            assert result == {"response": "AI response"}

            # Verify chat was called with history up to user message (before AI response)
            expected_chat_input = [
                {
                    "role": "system",
                    "content": "You are a helpful, concise voice assistant. Your name is Luna. Keep responses brief and conversational. Don't respond in bullet lists. Don't speak in third person. Don't use emojis.",
                },
                {"role": "user", "content": "Hello"},
            ]
            mock_chat.assert_called_once_with(expected_chat_input)

            # Verify final conversation history includes AI response
            expected_final_history = [
                {
                    "role": "system",
                    "content": "You are a helpful, concise voice assistant. Your name is Luna. Keep responses brief and conversational. Don't respond in bullet lists. Don't speak in third person. Don't use emojis.",
                },
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "AI response"},
            ]
            assert app_state.conversation_history["test_session"] == expected_final_history

    @pytest.mark.asyncio
    async def test_chat_completion_existing_session(self):
        """Test chat completion with existing session."""
        message = ChatMessage(text="How are you?", session_id="test_session")

        existing_history = [
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ]

        from state import app_state

        with patch.object(self.service, "chat", new_callable=AsyncMock) as mock_chat:
            app_state.conversation_history = {"test_session": existing_history.copy()}
            mock_chat.return_value = "I'm doing well!"

            result = await self.service.chat_completion(message)

            assert result == {"response": "I'm doing well!"}

            # Verify new messages were added to existing history
            expected_history = existing_history + [
                {"role": "user", "content": "How are you?"},
                {"role": "assistant", "content": "I'm doing well!"},
            ]
            assert app_state.conversation_history["test_session"] == expected_history

    @pytest.mark.asyncio
    async def test_chat_completion_default_session(self):
        """Test chat completion with default session ID."""
        message = ChatMessage(text="Hello")  # Uses default session_id

        from state import app_state

        with patch.object(self.service, "chat", new_callable=AsyncMock) as mock_chat:
            app_state.conversation_history = {}
            mock_chat.return_value = "AI response"

            result = await self.service.chat_completion(message)

            assert result == {"response": "AI response"}
            assert "default" in app_state.conversation_history

    @pytest.mark.asyncio
    async def test_chat_completion_error(self):
        """Test chat completion error handling."""
        message = ChatMessage(text="Hello", session_id="test_session")

        with (
            patch.object(self.service, "chat", new_callable=AsyncMock) as mock_chat,
            patch("state.app_state") as mock_state,
        ):
            mock_state.conversation_history = {}
            mock_chat.side_effect = Exception("Chat failed")

            with pytest.raises(
                OllamaError, match="Unexpected error during chat completion"
            ):
                await self.service.chat_completion(message)

    @pytest.mark.asyncio
    async def test_check_health_healthy(self, mock_aiohttp_session_with_response):
        """Test health check when service is healthy."""
        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={}, status=200
        )

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            result = await self.service.check_health()

            assert result == "healthy"
            # Get the session from the async context manager
            mock_session = await mock_session_instance.__aenter__()
            mock_session.get.assert_called_once_with("http://localhost:11434/api/tags")

    @pytest.mark.asyncio
    async def test_check_health_unhealthy_status(
        self, mock_aiohttp_session_with_response
    ):
        """Test health check when service returns error status."""
        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={}, status=500
        )

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            result = await self.service.check_health()

            assert result == "unhealthy"

    @pytest.mark.asyncio
    async def test_check_health_exception(self):
        """Test health check when exception occurs."""
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session_class.side_effect = Exception("Connection failed")

            result = await self.service.check_health()

            assert result == "unhealthy"

    def test_clear_conversation_existing_session(self):
        """Test clearing conversation for existing session."""
        from state import app_state

        app_state.conversation_history = {
            "test_session": [{"role": "user", "content": "Hello"}],
            "other_session": [{"role": "user", "content": "Hi"}],
        }

        result = self.service.clear_conversation("test_session")

        assert result == {
            "status": "success",
            "message": "Conversation history cleared",
        }
        assert "test_session" not in app_state.conversation_history
        assert "other_session" in app_state.conversation_history

    def test_clear_conversation_nonexistent_session(self):
        """Test clearing conversation for nonexistent session."""
        with patch("state.app_state") as mock_state:
            mock_state.conversation_history = {}

            result = self.service.clear_conversation("nonexistent_session")

            assert result == {
                "status": "info",
                "message": "No conversation history found",
            }

    def test_get_service_info(self):
        """Test getting service information."""
        info = self.service.get_service_info()

        assert info == {"host": "http://localhost:11434", "model": "llama3.2"}


class TestOllamaServiceGlobal:
    """Test cases for the global ollama_service instance."""

    def test_global_instance_exists(self):
        """Test that global ollama_service instance exists."""
        assert ollama_service is not None
        assert isinstance(ollama_service, OllamaService)

    def test_global_instance_configuration(self):
        """Test configuration of global ollama_service."""
        assert ollama_service.host == "http://localhost:11434"
        assert ollama_service.model == "llama3.2"


class TestOllamaServiceEdgeCases:
    """Test edge cases and error conditions."""

    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = OllamaService()

    @pytest.mark.asyncio
    async def test_chat_empty_content_in_message(
        self, mock_aiohttp_session_with_response
    ):
        """Test chat when message content is empty."""
        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={"message": {"content": ""}},
            status=200,  # Empty content
        )

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with pytest.raises(
                OllamaResponseError,
                match="Invalid Ollama response format: no 'content' field found",
            ):
                await self.service.chat([{"role": "user", "content": "Hello"}])

    @pytest.mark.asyncio
    async def test_chat_malformed_json_response(
        self, mock_aiohttp_session_with_response
    ):
        """Test chat with malformed JSON response."""
        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={}, status=200
        )
        # Override the json method to raise ValueError
        mock_response.json.side_effect = ValueError("Invalid JSON")

        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with pytest.raises(
                OllamaResponseError, match="Failed to parse JSON response from Ollama"
            ):
                await self.service.chat([{"role": "user", "content": "Hello"}])

    @pytest.mark.asyncio
    async def test_chat_completion_no_system_prompt(self):
        """Test chat completion when system prompt is empty."""
        message = ChatMessage(text="Hello", session_id="test_session")

        from state import app_state

        with (
            patch.object(self.service, "chat", new_callable=AsyncMock) as mock_chat,
            patch("services.ollama_service.SYSTEM_PROMPT", ""),
        ):  # Empty system prompt
            app_state.conversation_history = {}
            mock_chat.return_value = "AI response"

            await self.service.chat_completion(message)

            # Should not add system prompt to history
            expected_history = [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "AI response"},
            ]
            assert app_state.conversation_history["test_session"] == expected_history

    @pytest.mark.asyncio
    async def test_chat_with_custom_timeout(self, mock_aiohttp_session_with_response):
        """Test that chat uses configured timeout."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_session_instance, mock_response = mock_aiohttp_session_with_response(
            response_data={"message": {"content": "response"}}, status=200
        )

        with (
            patch("aiohttp.ClientSession", return_value=mock_session_instance),
            patch("aiohttp.ClientTimeout") as mock_timeout,
        ):
            await self.service.chat(messages)

            # Verify timeout was set correctly
            mock_timeout.assert_called_once_with(total=60)  # OLLAMA_TIMEOUT from config

    def test_clear_conversation_with_empty_history(self):
        """Test clearing conversation when history is empty."""
        from state import app_state

        app_state.conversation_history = {"test_session": []}

        result = self.service.clear_conversation("test_session")

        assert result == {
            "status": "success",
            "message": "Conversation history cleared",
        }
        assert "test_session" not in app_state.conversation_history
