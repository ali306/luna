<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
  import { appState } from '../stores/app-state.svelte';
</script>

<div
  class="assistant-response"
  class:visible={appState.responseVisible}
  title={uiState.assistantResponse}
>
  {uiState.displayResponse}
</div>

<style>
  .assistant-response {
    width: 90%;
    max-width: 600px;
    text-align: center;
    font-size: clamp(14px, 2vw, 16px);
    font-weight: 700;
    line-height: 1.5;
    color: oklch(100% 0 0 / 0.85);
    z-index: 20;
    word-break: break-word;
    padding: 0 12px;
    transition: opacity 0.4s ease;
    opacity: 0;
    pointer-events: none;
  }

  .assistant-response.visible {
    opacity: 1;
  }
</style>
