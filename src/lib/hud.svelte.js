export const hud = $state({
  mode: 'foot', // 'foot' | 'car' | 'quad'
  near: null, // vehicle name the player can enter
  dates: 0,
  total: 0,
  speed: 0,
  nearestDist: 0,
  nearestAngle: 0,
  toast: '',
  toastId: 0
})

let toastTimer
export function toast(msg, ms = 1600) {
  hud.toast = msg
  hud.toastId++
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (hud.toast = ''), ms)
}

let ctx
export function blip(freq = 880) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    const t = ctx.currentTime
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.12)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.3)
  } catch {}
}
