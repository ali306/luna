<script lang="ts">
  import { appState } from '../stores/app-state.svelte';
</script>

<div class="connection-indicator">
  <div class="connection-dot {appState.connectionStatus.class}"></div>
  <span class="connection-text">{appState.connectionStatus.text}</span>
</div>

<style>
  .connection-indicator {
    position: fixed;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    z-index: 1000;
  }

  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background-color 0.3s ease;
  }

  .connection-dot.connected {
    background-color: oklch(62.7% 0.194 149.214);
    box-shadow: 0 0 6px oklch(62.7% 0.194 149.214 / 0.5);
  }

  .connection-dot.recording {
    background-color: oklch(75% 0.183 55.934);
    box-shadow: 0 0 6px oklch(75% 0.183 55.934 / 0.5);
  }

  .connection-dot.disconnected {
    background-color: oklch(57.7% 0.245 27.325);
    box-shadow: 0 0 6px oklch(57.7% 0.245 27.325 / 0.5);
  }

  .connection-text {
    color: var(--color-5);
    font-weight: 500;
  }
</style>
