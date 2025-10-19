<script lang="ts">
  import { appState } from "../stores/app-state.svelte";
  import { tick } from "svelte";

  interface Props {
    onSubmit?: (text: string) => void;
  }

  let { onSubmit = () => {} }: Props = $props();

  let inputElement: HTMLInputElement;
  let value = $state("");

  $effect(() => {
    if (appState.mode === "text" && inputElement) {
      tick()
        .then(() => inputElement.focus())
        .catch(() => {});
    }
  });

  $effect(() => {
    if (appState.mode !== "text" && inputElement) {
      tick()
        .then(() => inputElement.blur())
        .catch(() => {});
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (value.trim()) {
      onSubmit(value.trim());
      value = "";
    }
  }
</script>

<input
  bind:this={inputElement}
  bind:value
  type="text"
  class="text-input"
  class:visible={appState.mode === "text"}
  placeholder="Type your message..."
  autocomplete="off"
  aria-label="Assistant text input"
  onkeydown={handleKeyDown}
/>

<style>
  .text-input {
    width: 80%;
    max-width: 320px;
    height: 40px;
    line-height: 40px;
    background: oklch(100% 0 0 / 0.1);
    border: 1px solid oklch(100% 0 0 / 0.3);
    border-radius: 20px;
    padding: 0 16px;
    font-size: 14px;
    font-family: "Inter", sans-serif;
    color: oklch(100% 0 0 / 0.9);
    backdrop-filter: blur(10px);
    outline: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 12;
  }

  .text-input.visible {
    opacity: 1;
  }

  .text-input::placeholder {
    color: oklch(100% 0 0 / 0.5);
  }
</style>
