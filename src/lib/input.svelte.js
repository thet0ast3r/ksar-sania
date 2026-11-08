/** merged keyboard + touch input. Plain fields read by the game loop each frame. */
export const input = {
  joyX: 0, joyY: 0,
  hand: false,
  action: false, reset: false, jump: false,
  camDX: 0, camDY: 0, zoom: 0
}

const keys = new Set()
const L = ['KeyA', 'ArrowLeft'], R = ['KeyD', 'ArrowRight'], U = ['KeyW', 'ArrowUp'], D = ['KeyS', 'ArrowDown']
const has = (arr) => arr.some((k) => keys.has(k))

export function initKeyboard() {
  const down = (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    if (!e.repeat) {
      if (['KeyE', 'KeyF', 'Enter'].includes(e.code)) input.action = true
      if (e.code === 'KeyR') input.reset = true
      if (e.code === 'Space') input.jump = true
    }
    keys.add(e.code)
  }
  const up = (e) => keys.delete(e.code)
  const blur = () => keys.clear()
  addEventListener('keydown', down)
  addEventListener('keyup', up)
  addEventListener('blur', blur)
  return () => {
    removeEventListener('keydown', down)
    removeEventListener('keyup', up)
    removeEventListener('blur', blur)
  }
}

export function axes() {
  let x = input.joyX, y = input.joyY
  if (has(L)) x -= 1
  if (has(R)) x += 1
  if (has(U)) y += 1
  if (has(D)) y -= 1
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
    hand: input.hand || keys.has('Space')
  }
}
