<script>
  import { input } from './input.svelte.js'

  const R = 48
  let base
  let id = null
  let kx = $state(0), ky = $state(0), on = $state(false)

  function down(e) {
    e.stopPropagation()
    id = e.pointerId
    base.setPointerCapture(id)
    on = true
    move(e)
  }
  function move(e) {
    if (e.pointerId !== id) return
    const r = base.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > R) { dx *= R / d; dy *= R / d }
    kx = dx
    ky = dy
    const dead = (v) => (Math.abs(v) < 0.12 ? 0 : v)
    input.joyX = dead(dx / R)
    input.joyY = dead(-dy / R)
  }
  function up(e) {
    if (e.pointerId !== id) return
    id = null
    on = false
    kx = ky = 0
    input.joyX = input.joyY = 0
  }
</script>

<div
  class="joy"
  class:on
  bind:this={base}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  role="slider"
  aria-label="Move / steer"
  aria-valuenow={0}
  tabindex="-1"
>
  <div class="knob" style:transform={`translate(${kx}px, ${ky}px)`}></div>
</div>

<style>
  .joy {
    width: 128px; height: 128px; border-radius: 50%;
    background: rgba(255, 244, 220, 0.35);
    border: 3px solid rgba(43, 20, 10, 0.75);
    display: grid; place-items: center;
    touch-action: none;
    backdrop-filter: blur(2px);
  }
  .joy.on { background: rgba(255, 244, 220, 0.5); }
  .knob {
    width: 56px; height: 56px; border-radius: 50%;
    background: #ffb347; border: 3px solid #2b140a;
    box-shadow: 2px 3px 0 #2b140a;
    pointer-events: none;
  }
</style>
