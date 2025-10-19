<div class="shortcuts" role="list" aria-label="Keyboard shortcuts">
  <div role="listitem">
    <kbd>SPACE</kbd>: Voice
  </div>
  <div role="listitem">
    <kbd>T</kbd>: Text
  </div>
  <div role="listitem">
    <kbd>ESC</kbd>: Stop/Exit
  </div>
  <div role="listitem">
    <kbd>R</kbd>: Show/Hide Response
  </div>
</div>

<style>
  .shortcuts {
    color: var(--color-4);
    font-size: 12px;
    text-align: center;
    position: fixed;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-family: "Inter", sans-serif;
    z-index: 10;
    display: flex;
    gap: 1.5em;
    pointer-events: none;
    padding: 0 12px;
  }

  .shortcuts div {
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  kbd {
    padding: 2px;
    font-size: 0.9em;
    font-weight: bold;
    font-family: "Inter", sans-serif;
    margin-right: 0.3em;
  }
</style>
