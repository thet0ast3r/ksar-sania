<script>
  import * as THREE from 'three'
  import { Canvas } from '@threlte/core'
  import Game from './lib/Game.svelte'
  import Joystick from './lib/Joystick.svelte'
  import { input, initKeyboard } from './lib/input.svelte.js'
  import { hud, blip } from './lib/hud.svelte.js'
  import { sunAt, fmt, phase } from './lib/sky.js'

  let hours = $state(16.4)
  let playing = $state(false)
  let started = $state(false)
  const touch = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)

  const el = $derived(sunAt(hours).elDeg)
  const label = $derived(phase(hours, el))
  const isNight = $derived(el < -4)

  $effect(() => initKeyboard())

  let raf
  function toggle() {
    playing = !playing
    if (!playing) return cancelAnimationFrame(raf)
    let last = performance.now()
    const tick = (now) => {
      hours = (hours + ((now - last) / 1000) * 0.4) % 24
      last = now
      if (playing) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  // camera drag / pinch on the 3D view
  const ptrs = new Map()
  let pinch = 0
  function pdown(e) {
    if (e.target.tagName !== 'CANVAS') return
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.target.setPointerCapture?.(e.pointerId)
  }
  function pmove(e) {
    const p = ptrs.get(e.pointerId)
    if (!p) return
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]
      p.x = e.clientX; p.y = e.clientY
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) input.zoom += (pinch - d) * 3
      pinch = d
      return
    }
    input.camDX += e.clientX - p.x
    input.camDY += e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
  }
  function pup(e) {
    ptrs.delete(e.pointerId)
    pinch = 0
  }
  const press = (key) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    input[key] = true
  }
  const hold = (v) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    input.hand = v
  }

  const actionLabel = $derived(
    hud.mode !== 'foot' ? 'Exit' : hud.near === 'car' ? 'Drive' : hud.near === 'quad' ? 'Ride' : null
  )
  const actionIcon = $derived(hud.mode !== 'foot' ? '🚶' : hud.near === 'car' ? '🚙' : '🏍️')
</script>

<main
  onpointerdown={pdown}
  onpointermove={pmove}
  onpointerup={pup}
  onpointercancel={pup}
  onwheel={(e) => (input.zoom += e.deltaY)}
>
  <Canvas toneMapping={THREE.NoToneMapping} shadows={THREE.PCFShadowMap} dpr={[1, 1.75]} renderMode="always">
    <Game {hours} />
  </Canvas>

  <!-- top bar -->
  <section class="top">
    <div class="row">
      <div class="pill dates" class:done={hud.dates === hud.total && hud.total > 0}>
        <svg viewBox="0 0 24 24" width="20" height="20"><ellipse cx="9" cy="14" rx="4" ry="6" fill="#8a3a12" stroke="#2b140a" stroke-width="1.6"/><ellipse cx="15" cy="13" rx="4" ry="6" fill="#a4471a" stroke="#2b140a" stroke-width="1.6"/><path d="M12 7 Q12 2 16 2" stroke="#2b140a" stroke-width="1.8" fill="none"/></svg>
        <b>{hud.dates}</b><span>/{hud.total}</span>
      </div>
      {#if hud.nearestDist >= 0}
        <div class="pill nearest" title="Nearest date">
          <span class="arrow" style:transform={`rotate(${hud.nearestAngle}deg)`}>▲</span>
          {hud.nearestDist} m
        </div>
      {/if}
      <div class="pill time">
        <button class="play" onclick={toggle} aria-label={playing ? 'Pause time' : 'Play time'}>{playing ? '❚❚' : '▶'}</button>
        <span class="clock">{fmt(hours)}</span>
        <span class="ph">{isNight ? '🌙' : '☀️'} {label}</span>
      </div>
    </div>
    <input
      type="range" min="0" max="23.99" step="0.01"
      bind:value={hours}
      oninput={() => playing && toggle()}
      aria-label="Time of day"
    />
  </section>

  {#if hud.toast}
    {#key hud.toastId}<div class="toast">{hud.toast}</div>{/key}
  {/if}

  {#if hud.mode !== 'foot'}
    <div class="speed"><b>{hud.speed}</b> km/h</div>
  {/if}

  <!-- controls -->
  {#if touch}
    <div class="joywrap"><Joystick /></div>
  {/if}
  <div class="btns">
    {#if hud.mode !== 'foot'}
      <button class="b small" onpointerdown={press('reset')} aria-label="Flip upright">↺</button>
      {#if touch}
        <button class="b" onpointerdown={hold(true)} onpointerup={hold(false)} onpointercancel={hold(false)} onpointerleave={hold(false)}>Drift</button>
      {/if}
    {:else if touch}
      <button class="b" onpointerdown={press('jump')}>Jump</button>
    {/if}
    {#if actionLabel}
      <button class="b big" onpointerdown={press('action')}><span>{actionIcon}</span>{actionLabel}</button>
    {/if}
  </div>

  {#if !touch && started}
    <div class="keys">WASD / arrows move · <b>E</b> enter/exit · <b>Space</b> jump / handbrake · <b>R</b> flip · drag to look</div>
  {/if}

  {#if !started}
    <div class="intro">
      <div class="card">
        <h1>Ksar Sania</h1>
        <p class="sub">Merzouga · Erg Chebbi</p>
        <ul>
          <li>🚶 Walk to the white <b>Duster</b> or the yellow <b>quad</b> and hop in.</li>
          <li>🌴 Hunt the <b>Datteln</b> scattered across the dunes. Follow the ▲ arrow and the golden beams.</li>
          <li>🌙 Drag the time slider all the way into the night.</li>
          <li>{touch ? '🕹️ Left stick moves/steers, drag the view to look around.' : '⌨️ WASD to move, E to enter, Space for the handbrake.'}</li>
        </ul>
        <button class="go" onclick={() => { started = true; blip(520) }}>Yalla! →</button>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0; height: 100%; overflow: hidden; background: #20265a;
    font-family: 'Nunito', system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none;
  }
  :global(#app) { height: 100%; }
  main { position: fixed; inset: 0; touch-action: none; }

  .top {
    position: absolute;
    top: calc(10px + env(safe-area-inset-top));
    left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100% - 20px));
    box-sizing: border-box;
    background: #fff4dc; border: 3px solid #2b140a; border-radius: 16px;
    box-shadow: 4px 4px 0 #2b140a;
    padding: 8px 10px 6px;
    color: #2b140a;
  }
  .row { display: flex; gap: 6px; align-items: center; }
  .pill {
    display: flex; align-items: center; gap: 4px;
    background: #ffe2ae; border: 2px solid #2b140a; border-radius: 999px;
    padding: 2px 9px 2px 6px; font-weight: 900; font-size: 14px; white-space: nowrap;
  }
  .dates b { font-family: 'Bangers', cursive; font-weight: 400; font-size: 20px; letter-spacing: 1px; }
  .dates span { opacity: 0.6; }
  .dates.done { background: #9be37a; }
  .nearest { font-size: 13px; }
  .arrow { display: inline-block; color: #c8452a; transition: transform 0.15s linear; }
  .time { margin-left: auto; padding-right: 10px; }
  .play {
    width: 26px; height: 26px; border-radius: 50%; border: 2px solid #2b140a;
    background: #ffb347; font-size: 10px; font-weight: 900; color: #2b140a; padding: 0; cursor: pointer;
  }
  .clock { font-family: 'Bangers', cursive; font-weight: 400; font-size: 20px; letter-spacing: 1px; }
  .ph { font-size: 12px; color: #a9542c; }
  @media (max-width: 420px) { .ph { display: none; } }

  input[type='range'] {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 14px; margin: 8px 0 2px;
    border-radius: 10px; border: 2.5px solid #2b140a;
    background: linear-gradient(90deg, #0b1030 0%, #1d2350 20%, #ff7a3d 28%, #ffd36b 34%, #8fd0f2 50%, #ffd36b 66%, #ff7a3d 72%, #1d2350 80%, #0b1030 100%);
    outline: none;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none; width: 26px; height: 26px; border-radius: 50%;
    background: #ffd23f; border: 3px solid #2b140a; cursor: grab;
  }
  input[type='range']::-moz-range-thumb {
    width: 22px; height: 22px; border-radius: 50%; background: #ffd23f; border: 3px solid #2b140a;
  }

  .toast {
    position: absolute; left: 50%; top: calc(112px + env(safe-area-inset-top));
    transform: translateX(-50%);
    font-family: 'Bangers', cursive; font-size: 26px; letter-spacing: 1px;
    color: #fff4dc; text-shadow: 2px 2px 0 #2b140a, -1px -1px 0 #2b140a, 1px -1px 0 #2b140a, -1px 1px 0 #2b140a;
    pointer-events: none; white-space: nowrap;
    animation: pop 0.35s cubic-bezier(.3, 1.6, .5, 1);
  }
  @keyframes pop { from { transform: translateX(-50%) scale(0.4); opacity: 0; } }

  .speed {
    position: absolute; left: 50%; transform: translateX(-50%);
    bottom: calc(18px + env(safe-area-inset-bottom));
    background: #fff4dc; border: 3px solid #2b140a; border-radius: 12px; box-shadow: 3px 3px 0 #2b140a;
    padding: 2px 12px; font-weight: 900; color: #2b140a; pointer-events: none;
  }
  .speed b { font-family: 'Bangers', cursive; font-weight: 400; font-size: 24px; }

  .joywrap {
    position: absolute;
    left: calc(22px + env(safe-area-inset-left));
    bottom: calc(26px + env(safe-area-inset-bottom));
  }
  .btns {
    position: absolute;
    right: calc(18px + env(safe-area-inset-right));
    bottom: calc(26px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column-reverse; align-items: center; gap: 12px;
  }
  .b {
    min-width: 66px; height: 66px; border-radius: 50%;
    border: 3px solid #2b140a; background: #fff4dc; box-shadow: 3px 3px 0 #2b140a;
    font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 14px; color: #2b140a;
    touch-action: none; cursor: pointer;
  }
  .b:active { transform: translate(2px, 2px); box-shadow: none; }
  .b.big {
    width: 84px; height: 84px; background: #ffb347; font-size: 15px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05;
    animation: wiggle 1.4s ease-in-out infinite;
  }
  .b.big span { font-size: 24px; }
  .b.small { min-width: 48px; width: 48px; height: 48px; font-size: 22px; }
  @keyframes wiggle { 50% { transform: rotate(-5deg) scale(1.05); } }

  .keys {
    position: absolute; left: 50%; transform: translateX(-50%);
    bottom: calc(66px + env(safe-area-inset-bottom));
    font-size: 12px; font-weight: 800; color: #fff4dc;
    text-shadow: 1px 1px 0 #2b140a; pointer-events: none; white-space: nowrap;
  }

  .intro {
    position: absolute; inset: 0; display: grid; place-items: center;
    background: rgba(32, 38, 90, 0.35); padding: 20px;
  }
  .card {
    max-width: 360px; background: #fff4dc; border: 3px solid #2b140a; border-radius: 20px;
    box-shadow: 6px 6px 0 #2b140a; padding: 18px 20px; color: #2b140a; transform: rotate(-1deg);
  }
  h1 {
    margin: 0; font-family: 'Bangers', cursive; font-weight: 400; font-size: 44px; letter-spacing: 2px;
    color: #c8452a; text-shadow: 3px 3px 0 #2b140a; line-height: 1;
  }
  .sub { margin: 2px 0 10px; font-weight: 900; font-size: 13px; }
  ul { padding: 0; margin: 0 0 14px; list-style: none; display: grid; gap: 8px; font-size: 14px; font-weight: 700; }
  .go {
    width: 100%; height: 50px; border-radius: 14px; border: 3px solid #2b140a; background: #ffb347;
    box-shadow: 3px 3px 0 #2b140a; font-family: 'Bangers', cursive; font-size: 26px; letter-spacing: 1px; color: #2b140a; cursor: pointer;
  }
</style>
