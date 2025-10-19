<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  import { WebSocketManager } from "./modules/websocket-manager";
  import { AudioManager } from "./modules/audio-manager";
  import {
    animationEngine,
    setMode,
    setAnalyser,
    setHaloPath,
  } from "./modules/animation-engine.svelte";
  import { keyboardShortcuts } from "./modules/keyboard-shortcuts.svelte";
  import { ttsService } from "./services/tts-service";

  import { appState } from "./stores/app-state.svelte";
  import { uiState } from "./stores/ui.svelte";

  import HaloAnimation from "./components/HaloAnimation.svelte";
  import ConnectionIndicator from "./components/ConnectionIndicator.svelte";
  import StatusMessage from "./components/StatusMessage.svelte";
  import AssistantResponse from "./components/AssistantResponse.svelte";
  import KeyboardShortcuts from "./components/KeyboardShortcuts.svelte";
  import TextInput from "./components/TextInput.svelte";

  import type {
    EnvironmentConfig,
    TimingConfig,
    AudioConfig,
    AnimationConfig,
    ChatResponseMessage,
    TTSCompleteMessage,
    StopMessage,
    ErrorMessage,
  } from "./types/index";
  import {
    BACKEND_PORT,
    HEALTH_CHECK_INTERVAL,
    TIMING_CONFIG,
    AUDIO_CONFIG,
    ANIMATION_CONFIG,
  } from "./config";

  let wsManager: WebSocketManager;
  let audioManager: AudioManager;

  let consecutiveHealthCheckFailures = 0;
  const MAX_HEALTH_CHECK_FAILURES = 3;
  let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

  const isTauri = !!(window as any).__TAURI__;
  const isDevMode = import.meta.env.DEV;

  const isTauriProtocol = window.location.protocol === "tauri:";

  const shouldUseDirectConnection = isTauri && (isTauriProtocol || !isDevMode);

  console.log("[App] Environment detection:", {
    isTauri,
    isDevMode,
    isTauriProtocol,
    shouldUseDirectConnection,
    protocol: window.location.protocol,
    host: window.location.host,
  });

  const environment: EnvironmentConfig = {
    isTauri: shouldUseDirectConnection,
    apiBase: shouldUseDirectConnection
      ? `http://127.0.0.1:${BACKEND_PORT}`
      : "",
    wsUrl: shouldUseDirectConnection
      ? `ws://127.0.0.1:${BACKEND_PORT}/ws`
      : null,
  };

  console.log("[App] Final environment config:", environment);

  const timing: TimingConfig = TIMING_CONFIG;
  const audioConfig: AudioConfig = AUDIO_CONFIG;
  const animationConfig: AnimationConfig = ANIMATION_CONFIG;

  $effect(() => {
    setMode(appState.mode);
  });

  let currentAnalyser = $state<AnalyserNode | null>(null);

  $effect(() => {
    if (currentAnalyser) {
      animationEngine.connectAudioSource(currentAnalyser);
    } else {
      animationEngine.disconnectAudioSource();
    }
  });

  onMount(async () => {
    try {
      wsManager = new WebSocketManager(environment, timing);
      audioManager = new AudioManager(audioConfig, environment);

      ttsService.setApiBase(environment.apiBase);

      audioManager.onPlaybackComplete(() => {
        handlePlaybackComplete();
      });

      ttsService.onPlaybackStart(() => {
        appState.setMode("speaking");
      });

      setupModuleInteractions();

      registerKeyboardShortcuts();

      wsManager.connect();
      startHealthCheck();

      handleResize();
      window.addEventListener("resize", handleResize);

      console.log("Voice Assistant initialized successfully");
    } catch (error) {
      console.error("Initialization failed:", error);
      uiState.showStatus(
        "Failed to initialize. Please refresh the page.",
        false,
        "error",
      );
    }
  });

  onDestroy(() => {
    if (healthCheckTimer) {
      clearTimeout(healthCheckTimer);
      healthCheckTimer = null;
    }

    animationEngine.cleanup();
    if (audioManager) audioManager.cleanup();
    if (wsManager) wsManager.disconnect();
    if (ttsService) ttsService.cleanup();
    window.removeEventListener("resize", handleResize);
    keyboardShortcuts.unregister();
  });

  function registerKeyboardShortcuts(): void {
    console.log("[App] Registering keyboard shortcuts...");

    keyboardShortcuts.clearShortcuts();

    keyboardShortcuts.addShortcut({
      code: "Space",
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
      allowInInput: false,
      description: "Toggle voice recording",
      handler: async () => {
        await handleSpaceKey();
      },
    });

    keyboardShortcuts.addShortcut({
      code: "KeyT",
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
      allowInInput: false,
      description: "Toggle text mode",
      handler: () => {
        handleToggleTextMode();
      },
    });

    keyboardShortcuts.addShortcut({
      code: "KeyR",
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
      allowInInput: false,
      description: "Toggle response visibility",
      handler: () => {
        if (appState.mode !== "text") {
          appState.toggleResponseVisibility();
        }
      },
    });

    keyboardShortcuts.addShortcut({
      code: "Escape",
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
      allowInInput: true,
      description: "Stop/Exit current action",
      handler: () => {
        console.log("[App] Escape key pressed, current mode:", appState.mode);
        handleEscape();
      },
    });

    keyboardShortcuts.reregister();

    console.log("[App] Keyboard shortcuts registered successfully");
  }

  function setupModuleInteractions(): void {
    wsManager.onMessage("chat_response", (data: ChatResponseMessage) => {
      handleChatResponse(data.response);
    });

    wsManager.onMessage("tts_complete", (_data: TTSCompleteMessage) => {
      handleTTSComplete();
    });

    wsManager.onMessage("stop", (_data: StopMessage) => {
      handleStop();
    });

    wsManager.onMessage("error", (data: ErrorMessage) => {
      uiState.showStatus(`Error: ${data.message}`, false, "error");
      appState.setMode("idle");
    });

    wsManager.onConnectionStateChange((isConnected: boolean) => {
      appState.setConnected(isConnected);
    });
  }

  async function handleSpaceKey(): Promise<void> {
    if (appState.mode === "idle") {
      await startRecording();
    } else if (appState.mode === "recording") {
      stopRecording();
    } else if (appState.mode === "speaking") {
      stopSpeaking();
    }
  }

  function handleEscape(): void {
    console.log("[App] handleEscape called, mode:", appState.mode);

    switch (appState.mode) {
      case "recording":
        audioManager.stopRecording();
        appState.setMode("idle");
        break;

      case "speaking":
        stopSpeaking();
        break;

      case "processing":
        if (wsManager.isConnected()) {
          wsManager.send({ type: "stop" });
        }
        appState.setMode("idle");
        break;

      case "text":
        if (wsManager.isConnected()) {
          wsManager.send({
            type: "mode_change",
            mode: "idle",
          });
        }
        appState.setMode("idle");
        break;

      case "idle":
        break;
    }
  }

  function handleToggleTextMode(): void {
    if (appState.mode !== "idle" && appState.mode !== "text") {
      console.log("[App] Cannot toggle text mode - request in progress");
      return;
    }

    const newMode = appState.mode === "text" ? "idle" : "text";
    appState.setMode(newMode);

    if (wsManager.isConnected()) {
      wsManager.send({
        type: "mode_change",
        mode: newMode,
      });
    }
  }

  async function startRecording(): Promise<void> {
    if (appState.mode !== "idle") return;

    try {
      await audioManager.startRecording();
      appState.setMode("recording");
    } catch (error) {
      console.error("Failed to start recording:", error);
      uiState.showStatus("Failed to access microphone", false, "error");
      appState.setMode("idle");
    }
  }

  function stopRecording(): void {
    if (appState.mode !== "recording") return;

    appState.setMode("processing");
    processRecording();
  }

  async function processRecording(): Promise<void> {
    try {
      const audioBlob = await audioManager.stopRecording();

      if (!audioBlob || audioBlob.size === 0) {
        uiState.showStatus("Recording is empty", false, "error");
        appState.setMode("idle");
        return;
      }

      if (audioBlob.size < 1024) {
        uiState.showStatus("Recording too short", false, "error");
        appState.setMode("idle");
        return;
      }

      const transcription = await audioManager.processRecording(audioBlob);

      if (wsManager.isConnected()) {
        wsManager.send({
          type: "chat",
          text: transcription,
        });
      }
    } catch (error) {
      console.error("Processing error:", error);
      if (error instanceof Error && error.message === "No speech detected") {
        uiState.showStatus("No speech detected", false, "error");
      } else {
        uiState.showStatus("Processing failed", false, "error");
      }
      appState.setMode("idle");
    }
  }

  function handleTextSubmit(text: string): void {
    if (!text) return;

    if (appState.mode !== "text") {
      console.log("[App] Cannot submit text - not in text mode");
      return;
    }

    if (!wsManager.isConnected()) {
      uiState.showStatus("Not connected", false, "error");
      return;
    }

    wsManager.send({
      type: "chat",
      text: text,
    });
    appState.setMode("processing");
  }

  async function handleChatResponse(response: string): Promise<void> {
    if (!response) return;

    uiState.setAssistantResponse(response);

    try {
      console.log("[App] Generating TTS");

      await ttsService.initialize();
      currentAnalyser = ttsService.getAnalyser();
      setAnalyser(currentAnalyser);

      await ttsService.speak(response);

      handlePlaybackComplete();
    } catch (error) {
      console.error("[App] TTS failed:", error);
      uiState.showStatus("Speech synthesis failed", false, "error");
      currentAnalyser = null;
      setAnalyser(null);
      appState.setMode("idle");
    }
  }

  function handlePlaybackComplete(): void {
    console.log("[App] Playback completed");
    currentAnalyser = null;
    setAnalyser(null);
    appState.setMode("idle");
  }

  function handleTTSComplete(): void {
    handlePlaybackComplete();
  }

  function handleStop(): void {
    audioManager.stopPlayback();
    appState.setMode("idle");
  }

  function stopSpeaking(): void {
    console.log("[App] stopSpeaking called");
    if (wsManager.isConnected()) {
      wsManager.send({ type: "stop" });
    }
    ttsService.stop();
    currentAnalyser = null;
    setAnalyser(null);
    appState.setMode("idle");
  }

  async function startHealthCheck(): Promise<void> {
    try {
      const response = await fetch(`${environment.apiBase}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "healthy") {
          if (data.ollama_status === "healthy") {
            consecutiveHealthCheckFailures = 0;
            appState.setBackendReady(true);
            console.log("Backend is healthy, Ollama is ready");

            healthCheckTimer = setTimeout(
              () => startHealthCheck(),
              HEALTH_CHECK_INTERVAL,
            );
            return;
          } else {
            consecutiveHealthCheckFailures = 0;
            appState.setBackendReady(false);
            uiState.showStatus(
              "Ollama is not running. Please start Ollama to use the chat feature.",
              false,
              "error",
            );
            healthCheckTimer = setTimeout(
              () => startHealthCheck(),
              HEALTH_CHECK_INTERVAL,
            );
            return;
          }
        } else if (data.status === "loading") {
          consecutiveHealthCheckFailures = 0;
          uiState.showStatus("Loading speech recognition models...", true);
          healthCheckTimer = setTimeout(() => startHealthCheck(), 1000);
          return;
        }
      }

      consecutiveHealthCheckFailures++;
      if (consecutiveHealthCheckFailures >= MAX_HEALTH_CHECK_FAILURES) {
        appState.setBackendReady(false);
      }
    } catch (error) {
      if (
        !(
          error instanceof DOMException &&
          error.name === "TimeoutError" &&
          appState.mode === "speaking"
        )
      ) {
        console.error("Health check failed:", error);
      }

      consecutiveHealthCheckFailures++;

      if (consecutiveHealthCheckFailures >= MAX_HEALTH_CHECK_FAILURES) {
        appState.setBackendReady(false);
      }
    }

    healthCheckTimer = setTimeout(
      () => startHealthCheck(),
      HEALTH_CHECK_INTERVAL,
    );
  }

  function handleResize(): void {
    const size = Math.min(
      window.innerWidth * 0.9,
      window.innerHeight * 0.9,
      300,
    );
    document.documentElement.style.setProperty("--container-size", `${size}px`);
  }

  function handleHaloPathReady(path: SVGPathElement): void {
    setHaloPath(path);
  }
</script>

<div class="app-layout">
  <div class="response-zone">
    <AssistantResponse />
  </div>

  <div class="disk-zone">
    <HaloAnimation onPathReady={handleHaloPathReady} />
  </div>

  <div class="input-zone">
    <TextInput onSubmit={handleTextSubmit} />
  </div>
</div>

<StatusMessage />
<ConnectionIndicator />
<KeyboardShortcuts />

<style>
  :global(body) {
    margin: 0;
    background: var(--color-0);
    min-height: 100vh;
    font-family: "Inter", sans-serif;
    overflow: visible;
    position: relative;
    height: 100%;
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
  }

  :global(body::before) {
    content: "";
    position: fixed;
    inset: 0;
    background: radial-gradient(
        circle at 20% 20%,
        oklch(100% 0 0 / 0.02) 0%,
        transparent 50%
      ),
      radial-gradient(
        circle at 80% 80%,
        oklch(100% 0 0 / 0.01) 0%,
        transparent 50%
      ),
      radial-gradient(
        circle at 40% 60%,
        oklch(100% 0 0 / 0.015) 0%,
        transparent 50%
      );
    pointer-events: none;
    z-index: -1;
  }

  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
  }

  .response-zone {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 5px;
    min-height: 0;
  }

  .disk-zone {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: var(--container-size);
    max-height: 300px;
    position: relative;
  }

  .input-zone {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    min-height: 0;
  }
</style>
