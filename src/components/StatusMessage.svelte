<script lang="ts">
  import { uiState } from "../stores/ui.svelte";
</script>

<div
  class="status"
  class:visible={uiState.statusVisible}
  class:error={uiState.statusType === "error"}
  class:success={uiState.statusType === "success"}
>
  {uiState.statusMessage}
</div>

<style>
  .status {
    color: var(--color-7);
    font-size: 12px;
    text-align: center;
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    transition: opacity 0.3s ease;
    max-width: 300px;
    font-family: "Inter", sans-serif;
    z-index: 11;
    white-space: nowrap;
  }

  .status.visible {
    opacity: 1;
  }

  .status.error {
    color: oklch(57.7% 0.245 27.325);
  }

  .status.success {
    color: oklch(62.7% 0.194 149.214);
  }
</style>
