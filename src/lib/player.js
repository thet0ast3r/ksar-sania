import * as THREE from 'three'
import { heightAt, BOUNDS } from './terrain.js'

const lerpAngle = (a, b, t) => {
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
    this.R = 0.45
  }

  update(dt, dx, dz, jump, rects, circles, vehicles) {
    const mag = Math.min(1, Math.hypot(dx, dz))
    const speed = 6.2 * mag
    const k = 1 - Math.exp(-dt * (this.onGround ? 12 : 3))
    const tx = mag > 0.01 ? (dx / Math.hypot(dx, dz)) * speed : 0
    const tz = mag > 0.01 ? (dz / Math.hypot(dx, dz)) * speed : 0
    this.vel.x += (tx - this.vel.x) * k
    this.vel.z += (tz - this.vel.z) * k
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt

    if (jump && this.onGround) {
      this.vy = 7
      this.onGround = false
    }
    this.vy -= 22 * dt
    this.pos.y += this.vy * dt
    const g = heightAt(this.pos.x, this.pos.z)
    if (this.pos.y <= g || (this.onGround && this.vy <= 0 && this.pos.y - g < 0.6)) {
      this.pos.y = g
      this.vy = 0
      this.onGround = true
    } else this.onGround = false

    if (mag > 0.05) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12))
    const hs = Math.hypot(this.vel.x, this.vel.z)
    this.moving = hs / 6.2
    this.phase += dt * hs * 1.7

    // collisions
    const R = this.R, p = this.pos
    for (const b of rects) {
      const ddx = p.x - b.x, ddz = p.z - b.z
      const px = b.hw + R - Math.abs(ddx), pz = b.hd + R - Math.abs(ddz)
      if (px > 0 && pz > 0) {
        if (px < pz) p.x += Math.sign(ddx) * px
        else p.z += Math.sign(ddz) * pz
      }
    }
    for (const o of circles) this.#circle(o.x, o.z, o.r)
    for (const v of vehicles) {
      const f = v.forward()
      for (const off of v.cfg.circles) this.#circle(v.pos.x + f.x * off, v.pos.z + f.z * off, v.cfg.circleR)
    }
    p.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, p.x))
    p.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, p.z))
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

export { lerpAngle }
