<script>
  import * as THREE from 'three'
  import { Canvas } from '@threlte/core'
  import Scene from './lib/Scene.svelte'
  import { sunAt, fmt, phase } from './lib/sun.js'

  const START = 6.25 // a bit before sunrise (~06:38)
  const END = 17.75 // a bit after sunset (~17:22)

  let hours = $state(16.6)
  let playing = $state(false)
  let w = $state(1000)
  let h = $state(800)

  const el = $derived(sunAt(hours).elDeg)
  const label = $derived(phase(hours, el))
  const pct = $derived(((hours - START) / (END - START)) * 100)

  let raf
  function toggle() {
    playing = !playing
    if (!playing) return cancelAnimationFrame(raf)
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      hours += dt * 0.45 // ~25 s for the whole day
      if (hours > END) hours = START
      if (playing) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<main>
  <Canvas toneMapping={THREE.NoToneMapping} shadows={THREE.PCFShadowMap} dpr={[1, 2]}>
    <Scene {hours} portrait={w / h < 0.9} />
  </Canvas>

  <header>
    <h1>Ksar Sania</h1>
    <p>Merzouga · Erg Chebbi</p>
  </header>

  <section class="panel">
    <div class="row">
      <button onclick={toggle} aria-label={playing ? 'Pause' : 'Play the day'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div class="clock">
        <span class="time">{fmt(hours)}</span>
        <span class="phase">{label}</span>
      </div>
      <span class="sun" style:transform={`translateY(${Math.max(0, 14 - el) * 0.4}px)`}>☀️</span>
    </div>
    <input
      type="range"
      min={START}
      max={END}
      step="0.01"
      bind:value={hours}
      oninput={() => playing && toggle()}
      style:--p={pct + '%'}
      aria-label="Time of day"
    />
    <div class="ticks"><span>🌅 sunrise</span><span>noon</span><span>sunset 🌇</span></div>
  </section>
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    background: #20265a;
    font-family: 'Nunito', system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  :global(#app) { height: 100%; }
  main { position: fixed; inset: 0; }

  header {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top));
    left: calc(14px + env(safe-area-inset-left));
    background: #fff4dc;
    border: 3px solid #2b140a;
    border-radius: 14px;
    box-shadow: 4px 4px 0 #2b140a;
    padding: 6px 14px 6px;
    transform: rotate(-2deg);
    pointer-events: none;
  }
  h1 {
    margin: 0;
    font-family: 'Bangers', cursive;
    font-weight: 400;
    letter-spacing: 1.5px;
    font-size: 30px;
    line-height: 1;
    color: #c8452a;
    text-shadow: 2px 2px 0 #2b140a;
  }
  header p { margin: 2px 0 0; font-weight: 800; font-size: 12px; color: #2b140a; }

  .panel {
    position: absolute;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(520px, calc(100% - 28px));
    box-sizing: border-box;
    background: #fff4dc;
    border: 3px solid #2b140a;
    border-radius: 18px;
    box-shadow: 5px 5px 0 #2b140a;
    padding: 12px 16px 10px;
    color: #2b140a;
  }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  button {
    width: 44px; height: 44px; flex: none;
    border-radius: 50%;
    border: 3px solid #2b140a;
    background: #ffb347;
    box-shadow: 2px 2px 0 #2b140a;
    font-size: 16px; font-weight: 900; color: #2b140a;
    cursor: pointer;
  }
  button:active { transform: translate(2px, 2px); box-shadow: none; }
  .clock { display: flex; flex-direction: column; line-height: 1; }
  .time { font-family: 'Bangers', cursive; font-size: 32px; letter-spacing: 1px; }
  .phase { font-weight: 800; font-size: 13px; color: #a9542c; margin-top: 2px; }
  .sun { margin-left: auto; font-size: 28px; transition: transform 0.1s; }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 18px;
    border-radius: 10px;
    border: 3px solid #2b140a;
    background: linear-gradient(90deg, #3b4fa0 0%, #ff7a3d 8%, #ffd36b 22%, #8fd0f2 50%, #ffd36b 78%, #ff7a3d 92%, #3b4fa0 100%);
    outline: none;
    margin: 4px 0;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 30px; height: 30px;
    border-radius: 50%;
    background: #ffd23f;
    border: 3px solid #2b140a;
    box-shadow: 0 0 0 4px rgba(255, 210, 63, 0.45);
    cursor: grab;
  }
  input[type='range']::-moz-range-thumb {
    width: 26px; height: 26px;
    border-radius: 50%;
    background: #ffd23f;
    border: 3px solid #2b140a;
    cursor: grab;
  }
  .ticks { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; opacity: 0.75; margin-top: 4px; }
</style>
