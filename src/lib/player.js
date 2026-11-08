import * as THREE from 'three'
import { heightAt, BOUNDS } from './terrain.js'

export const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Player {
  constructor(x, z, yaw = 0) {
    this.pos = new THREE.Vector3(x, heightAt(x, z), z)
    this.vel = new THREE.Vector3()
    this.vy = 0
    this.yaw = yaw
    this.phase = 0
    this.moving = 0
    this.onGround = true
    this.climb = null
    this.R = 0.42
  }

  groundAt(x, z, y, platforms) {
    let g = heightAt(x, z)
    for (const p of platforms)
      if (Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hd && p.top <= y + 0.7 && p.top > g) g = p.top
    return g
  }

  update(dt, dx, dz, jump, W) {
    const mag = Math.min(1, Math.hypot(dx, dz))
    const speed = 6.2 * mag
    const k = 1 - Math.exp(-dt * (this.onGround ? 12 : 3))
    const len = Math.hypot(dx, dz) || 1
    this.vel.x += ((dx / len) * speed - this.vel.x) * k
    this.vel.z += ((dz / len) * speed - this.vel.z) * k
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt

    if (jump && this.onGround) {
      this.vy = 7
      this.onGround = false
    }
    this.vy -= 22 * dt
    this.pos.y += this.vy * dt
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y - this.vy * dt, W.platforms)
    if (this.pos.y <= g || (this.onGround && this.vy <= 0 && this.pos.y - g < 0.62)) {
      this.pos.y = g
      this.vy = 0
      this.onGround = true
    } else this.onGround = false

    if (mag > 0.05) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12))
    const hs = Math.hypot(this.vel.x, this.vel.z)
    this.moving = hs / 6.2
    this.phase += dt * hs * 1.7

    const R = this.R, p = this.pos
    for (const list of [W.rects, W.prects]) {
      for (const b of list) {
        if (p.y >= b.h - 0.05) continue
        const ddx = p.x - b.x, ddz = p.z - b.z
        const px = b.hw + R - Math.abs(ddx), pz = b.hd + R - Math.abs(ddz)
        if (px > 0 && pz > 0) {
          if (px < pz) p.x += Math.sign(ddx) * px
          else p.z += Math.sign(ddz) * pz
        }
      }
    }
    for (const o of W.circles) if (p.y < 2.5 + heightAt(o.x, o.z)) this.#circle(o.x, o.z, o.r)
    for (const v of W.vehicles) {
      const f = v.forward()
      for (const off of v.cfg.circles) this.#circle(v.pos.x + f.x * off, v.pos.z + f.z * off, v.cfg.circleR)
    }
    p.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, p.x))
    p.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, p.z))
  }

  startClimb(palm) {
    this.climb = { palm, yaw: Math.atan2(palm.x - this.pos.x, palm.z - this.pos.z), base: heightAt(palm.x, palm.z) }
    this.vel.set(0, 0, 0)
    this.vy = 0
  }

  /** returns true when back at the bottom */
  updateClimb(dt, axisY) {
    const c = this.climb, p = c.palm
    const top = c.base + p.h - 2.1
    this.pos.y = Math.min(top, Math.max(c.base, this.pos.y + axisY * 2.8 * dt))
    this.pos.x = p.x - Math.sin(c.yaw) * 0.62
    this.pos.z = p.z - Math.cos(c.yaw) * 0.62
    this.yaw = c.yaw
    if (this.pos.y > c.base && this.pos.y < top) this.phase += Math.abs(axisY) * dt * 7
    this.atTop = this.pos.y >= top - 0.01
    return axisY < -0.1 && this.pos.y <= c.base + 0.001
  }

  stopClimb() {
    const c = this.climb
    this.pos.x -= Math.sin(c.yaw) * 0.35
    this.pos.z -= Math.cos(c.yaw) * 0.35
    this.climb = null
    this.onGround = false
    this.vy = 0
  }

  #circle(x, z, r) {
    const dx = this.pos.x - x, dz = this.pos.z - z
    const d = Math.hypot(dx, dz), min = r + this.R
    if (d < min && d > 1e-4) {
      this.pos.x += (dx / d) * (min - d)
      this.pos.z += (dz / d) * (min - d)
    }
  }
}
