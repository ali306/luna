<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    onPathReady?: (path: SVGPathElement) => void;
  }

  let { onPathReady = () => {} }: Props = $props();

  let haloPath: SVGPathElement;

  onMount(() => {
    if (haloPath) {
      onPathReady(haloPath);
    }
  });
</script>

<div class="container">
  <svg class="halo-svg" viewBox="0 0 200 200">
    <defs>
      <radialGradient id="haloGradient" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="oklch(100% 0 0)" stop-opacity="1" />
        <stop offset="20%" stop-color="oklch(100% 0 0)" stop-opacity="0.98" />
        <stop offset="40%" stop-color="oklch(100% 0 0)" stop-opacity="0.85" />
        <stop offset="60%" stop-color="oklch(100% 0 0)" stop-opacity="0.7" />
        <stop offset="80%" stop-color="oklch(100% 0 0)" stop-opacity="0.3" />
        <stop offset="100%" stop-color="oklch(100% 0 0)" stop-opacity="0.1" />
      </radialGradient>
      <filter
        id="blurFilter"
        x="-50%"
        y="-50%"
        width="200%"
        height="200%"
        color-interpolation-filters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
        <feComponentTransfer in="blur" result="brightness">
          <feFuncA type="linear" slope="1" />
        </feComponentTransfer>
      </filter>
    </defs>
    <path
      bind:this={haloPath}
      class="halo-path"
      d=""
      fill="url(#haloGradient)"
      filter="url(#blurFilter)"
    />
  </svg>

  <div class="halo-glow"></div>
  <div class="disk"></div>
</div>

<style>
  .container {
    position: relative;
    width: var(--container-size);
    height: var(--container-size);
    max-width: 300px;
    max-height: 300px;
  }

  .halo-svg {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 80%;
    height: 80%;
    transform: translate(-50%, -50%) scale(var(--halo-scale));
    filter: brightness(var(--halo-brightness)) contrast(1.1);
    z-index: 1;
    pointer-events: none;
    will-change: transform, filter;
    transition:
      transform 0.1s ease-out,
      filter 0.1s ease-out;
    overflow: visible;
  }

  .halo-path {
    transform: translateZ(0);
    will-change: transform, filter;
  }

  .halo-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 66.67%;
    height: 66.67%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(
      circle,
      oklch(100% 0 0 / 0.6) 0%,
      oklch(100% 0 0 / 1) 70%,
      transparent 100%
    );
    filter: blur(8px);
    animation: pulseGlow 3s ease-in-out infinite alternate;
    z-index: 1;
    pointer-events: none;
    overflow: visible;
  }

  .disk {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 66.67%;
    height: 66.67%;
    background: radial-gradient(
      circle,
      oklch(0% 0 0) 0%,
      oklch(3.92% 0 0) 70%,
      oklch(0% 0 0) 100%
    );
    border-radius: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    box-shadow:
      inset 0 0 20px oklch(100% 0 0 / 0.1),
      0 0 40px oklch(0% 0 0 / 0.8);
  }

  @keyframes pulseGlow {
    0%,
    100% {
      opacity: 0.5;
    }

    50% {
      opacity: 0.9;
    }
  }
</style>
