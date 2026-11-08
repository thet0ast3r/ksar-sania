import * as THREE from 'three'
import { heightAt, normalAt, BOUNDS } from './terrain.js'

const G = 9.81
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Raycast-style vehicle on an analytic heightfield.
 * Local frame: +x forward, +y up, +z right. pos = centre of mass.
 */
function staticAttach(c) {
  const comp = (G / 4) / (c.k / c.mass) // static compression per wheel
  return c.radius - c.comY + (c.rest - comp)
}

export const CAR = {
  name: 'car', mass: 1300, dims: [4.4, 1.4, 1.85], comY: 0.75,
  radius: 0.42, rest: 0.42, k: 1300 * 20, c: 1300 * 2.4,
  wheels: [[1.33, 0.82, true, true], [1.33, -0.82, true, true], [-1.33, 0.82, false, true], [-1.33, -0.82, false, true]],
  engine: 1300 * 9.5, brake: 1300 * 14, topSpeed: 31, reverseSpeed: 9,
  maxSteer: 0.6, steerFalloff: 0.045, grip: 1.1, latRate: 16, rollDrag: 0.22,
  assist: 2.2, airYaw: 1.2, inertiaScale: 1.5,
  hull: [2.15, -0.45, 0.9, 0.9], circles: [-1.4, 0, 1.4], circleR: 1.05, spawnY: 1.0, bodyR: 2.3
}
CAR.attachY = staticAttach(CAR)

export const QUAD = {
  name: 'quad', mass: 330, dims: [2.0, 1.0, 1.25], comY: 0.55,
  radius: 0.34, rest: 0.34, k: 330 * 24, c: 330 * 2.6,
  wheels: [[0.62, 0.52, true, true], [0.62, -0.52, true, true], [-0.62, 0.52, false, true], [-0.62, -0.52, false, true]],
  engine: 330 * 11.5, brake: 330 * 15, topSpeed: 25, reverseSpeed: 7,
  maxSteer: 0.62, steerFalloff: 0.05, grip: 1.15, latRate: 16, rollDrag: 0.22,
  assist: 3.2, airYaw: 1.0, inertiaScale: 1.8,
  hull: [1.0, -0.27, 0.6, 0.64], circles: [-0.45, 0.45], circleR: 0.72, spawnY: 0.8, bodyR: 1.3
}
QUAD.attachY = staticAttach(QUAD)

const v = () => new THREE.Vector3()
const _up = v(), _fwd = v(), _F = v(), _T = v(), _a = v(), _n = v(), _cp = v(), _r = v(), _vp = v()
const _wf = v(), _side = v(), _f = v(), _tq = v(), _p = v(), _vt = v(), _ft = v(), _ax = v(), _Tl = v(), _wl = v()
const _qi = new THREE.Quaternion(), _wq = new THREE.Quaternion()

export class Vehicle {
  constructor(cfg, x, z, yaw) {
    this.cfg = cfg
    this.pos = new THREE.Vector3(x, heightAt(x, z) + cfg.comY + 0.1, z)
    this.vel = new THREE.Vector3()
    this.w = new THREE.Vector3()
    this.q = new THREE.Quaternion().setFromAxisAngle(UP, yaw)
    const [L, H, W] = cfg.dims, m = cfg.mass, s = cfg.inertiaScale
    this.I = new THREE.Vector3((m / 12) * (H * H + W * W) * s, (m / 12) * (L * L + W * W) * s, (m / 12) * (L * L + H * H) * s)
    this.steer = 0
    this.speed = 0
    this.grounded = 0
    this.wheels = cfg.wheels.map(([wx, wz, front, drive]) => ({
      local: new THREE.Vector3(wx, cfg.attachY, wz), front, drive, susp: cfg.rest, contact: false, spin: 0, vLong: 0
    }))
    this.nDrive = this.wheels.filter((w) => w.drive).length
    const [hx, hy0, hy1, hz] = cfg.hull
    this.corners = []
    for (const sx of [-1, 1]) for (const y of [hy0, hy1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(sx * hx, y, sz * hz))
    for (const y of [hy0, hy1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(0, y, sz * hz))
  }

  forward(out = new THREE.Vector3()) {
    return out.set(1, 0, 0).applyQuaternion(this.q)
  }

  reset() {
    const f = this.forward()
    const yaw = Math.atan2(-f.z, f.x)
    this.q.setFromAxisAngle(UP, yaw)
    this.pos.y = heightAt(this.pos.x, this.pos.z) + this.cfg.comY + 1.2
    this.vel.set(0, 0, 0)
    this.w.set(0, 0, 0)
  }

  step(dt, ctl) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / n
    for (let i = 0; i < n; i++) this.sub(h, ctl)
    for (const wh of this.wheels) wh.spin += (wh.vLong / this.cfg.radius) * dt
    // auto-recover when lying on its side / roof and not moving
    const upY = 1 - 2 * (this.q.x * this.q.x + this.q.z * this.q.z)
    this.stuck = upY < 0.35 && this.vel.length() < 2.5 ? (this.stuck || 0) + dt : 0
    if (this.stuck > 1.8) { this.reset(); this.stuck = 0; return true }
    return false
  }

  sub(h, ctl) {
    const c = this.cfg, m = c.mass
    const { q, pos, vel, w } = this
    const up = _up.set(0, 1, 0).applyQuaternion(q)
    const fwd = _fwd.set(1, 0, 0).applyQuaternion(q)
    const F = _F.set(0, -G * m, 0)
    const T = _T.set(0, 0, 0)
    const vF = vel.dot(fwd)
    this.speed = vF

    // steering (positive input = right = negative yaw about +y)
    const maxSteer = c.maxSteer / (1 + Math.abs(vF) * c.steerFalloff)
    this.steer += (-ctl.steer * maxSteer - this.steer) * Math.min(1, h * 10)

    let drive = 0, brake = 0
    const t = ctl.throttle
    if (t > 0.05) { if (vF < -1) brake = t; else drive = t }
    else if (t < -0.05) { if (vF > 1) brake = -t; else drive = t }
    const idle = Math.abs(t) <= 0.05

    let contacts = 0
    const mShare = m / 4
    for (const wh of this.wheels) {
      const a = _a.copy(wh.local).applyQuaternion(q).add(pos)
      const hg = heightAt(a.x, a.z)
      normalAt(a.x, a.z, _n)
      const cosA = up.dot(_n)
      const d = ((a.y - hg) * _n.y) / Math.max(cosA, 0.25)
      const len = d - c.radius
      if (cosA < 0.3 || len > c.rest) {
        wh.contact = false
        wh.susp = c.rest
        continue
      }
      contacts++
      wh.contact = true
      wh.susp = Math.max(len, 0.03)
      const comp = c.rest - len
      const cp = _cp.copy(up).multiplyScalar(-d).add(a)
      const r = _r.subVectors(cp, pos)
      const vp = _vp.crossVectors(w, r).add(vel)
      let Fs = c.k * comp - c.c * vp.dot(up)
      if (comp > c.rest * 0.85) Fs += c.k * 8 * (comp - c.rest * 0.85)
      if (Fs < 0) Fs = 0

      const wf = _wf.copy(fwd)
      if (wh.front) wf.applyAxisAngle(up, this.steer)
      wf.addScaledVector(_n, -wf.dot(_n)).normalize()
      const side = _side.crossVectors(_n, wf)
      const vLong = vp.dot(wf), vLat = vp.dot(side)
      wh.vLong = vLong

      const hand = ctl.handbrake && !wh.front
      const grip = c.grip * (hand ? 0.45 : 1)
      let fLat = -vLat * mShare * c.latRate
      let fLong = 0
      if (wh.drive && drive !== 0) {
        const lim = drive > 0
          ? 1 - (Math.max(0, vLong) / c.topSpeed) ** 2
          : 1 - (Math.max(0, -vLong) / c.reverseSpeed) ** 2
        fLong += (drive * c.engine * Math.max(0, lim)) / this.nDrive
      }
      if (brake > 0) fLong -= Math.sign(vLong) * Math.min(Math.abs(vLong) * mShare * 20, (brake * c.brake) / 4)
      if (hand) fLong -= vLong * mShare * 6
      fLong -= vLong * mShare * (idle && Math.abs(vF) < 1.5 && !ctl.free ? 8 : c.rollDrag)

      const maxF = grip * Fs
      const tot = Math.hypot(fLat, fLong)
      if (tot > maxF && tot > 0) {
        const s = maxF / tot
        fLat *= s
        fLong *= s
      }
      const f = _f.copy(_n).multiplyScalar(Fs).addScaledVector(side, fLat).addScaledVector(wf, fLong)
      F.add(f)
      T.add(_tq.crossVectors(r, f))
    }
    this.grounded = contacts

    // hull vs ground (keeps it from sinking when it rolls over / bottoms out)
    for (const cl of this.corners) {
      const p = _p.copy(cl).applyQuaternion(q).add(pos)
      const hg = heightAt(p.x, p.z)
      if (p.y >= hg) continue
      normalAt(p.x, p.z, _n)
      const depth = (hg - p.y) * _n.y
      const r = _r.subVectors(p, pos)
      const vp = _vp.crossVectors(w, r).add(vel)
      const vn = vp.dot(_n)
      let Fn = depth * m * 90 - vn * m * 9
      if (Fn < 0) Fn = 0
      const vt = _vt.copy(vp).addScaledVector(_n, -vn)
      const ft = _ft.copy(vt).multiplyScalar(-m * 2.5)
      const ftl = ft.length(), maxT = 0.7 * Fn
      if (ftl > maxT) ft.multiplyScalar(maxT / ftl)
      const f = _f.copy(_n).multiplyScalar(Fn).add(ft)
      F.add(f)
      T.add(_tq.crossVectors(r, f))
    }

    // gentle self-righting + a little air control (arcade-y, keeps it fun)
    _ax.crossVectors(up, UP)
    T.addScaledVector(_ax, m * c.assist * (contacts ? 1 : 0.6))
    if (!contacts) T.addScaledVector(up, -ctl.steer * m * c.airYaw)

    // integrate
    vel.addScaledVector(F, h / m)
    _qi.copy(q).invert()
    const Tl = _Tl.copy(T).applyQuaternion(_qi)
    const wl = _wl.copy(w).applyQuaternion(_qi)
    wl.x += (Tl.x / this.I.x) * h
    wl.y += (Tl.y / this.I.y) * h
    wl.z += (Tl.z / this.I.z) * h
    w.copy(wl.applyQuaternion(q)).multiplyScalar(1 - h * (contacts ? 0.9 : 0.25))
    pos.addScaledVector(vel, h)
    _wq.set(w.x * h * 0.5, w.y * h * 0.5, w.z * h * 0.5, 0).multiply(q)
    q.set(q.x + _wq.x, q.y + _wq.y, q.z + _wq.z, q.w + _wq.w).normalize()
  }

  /** push out of buildings / palms / world edge */
  collide(rects, circles) {
    const c = this.cfg, pos = this.pos, vel = this.vel
    const f = this.forward(_fwd)
    const ground = heightAt(pos.x, pos.z)
    for (const off of c.circles) {
      const cx = pos.x + f.x * off, cz = pos.z + f.z * off, R = c.circleR
      for (const b of rects) {
        if (pos.y - ground > b.h) continue
        const dx = cx - b.x, dz = cz - b.z
        const px = b.hw + R - Math.abs(dx), pz = b.hd + R - Math.abs(dz)
        if (px <= 0 || pz <= 0) continue
        if (px < pz) this.#push(Math.sign(dx) || 1, 0, px)
        else this.#push(0, Math.sign(dz) || 1, pz)
      }
      for (const o of circles) {
        const dx = cx - o.x, dz = cz - o.z
        const d = Math.hypot(dx, dz), min = R + o.r
        if (d < min && d > 1e-4) this.#push(dx / d, dz / d, min - d)
      }
    }
    const B = BOUNDS
    if (pos.x < B.x0) this.#push(1, 0, B.x0 - pos.x)
    if (pos.x > B.x1) this.#push(-1, 0, pos.x - B.x1)
    if (pos.z < B.z0) this.#push(0, 1, B.z0 - pos.z)
    if (pos.z > B.z1) this.#push(0, -1, pos.z - B.z1)
    this.pos.y = Math.max(this.pos.y, heightAt(pos.x, pos.z) - 0.5)
    void vel
  }

  #push(nx, nz, depth) {
    this.pos.x += nx * depth
    this.pos.z += nz * depth
    const vn = this.vel.x * nx + this.vel.z * nz
    if (vn < 0) {
      this.vel.x -= nx * vn * 1.3
      this.vel.z -= nz * vn * 1.3
      this.w.multiplyScalar(0.8)
    }
  }
}

/** simple separation between two vehicles */
export function separate(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z
  const d = Math.hypot(dx, dz), min = a.cfg.bodyR + b.cfg.bodyR
  if (d >= min || d < 1e-4 || Math.abs(a.pos.y - b.pos.y) > 2.5) return
  const nx = dx / d, nz = dz / d, pen = min - d
  const ma = a.cfg.mass, mb = b.cfg.mass, tot = ma + mb
  a.pos.x -= nx * pen * (mb / tot); a.pos.z -= nz * pen * (mb / tot)
  b.pos.x += nx * pen * (ma / tot); b.pos.z += nz * pen * (ma / tot)
  const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz
  if (rv < 0) {
    const j = (-1.3 * rv) / (1 / ma + 1 / mb)
    a.vel.x -= (j / ma) * nx; a.vel.z -= (j / ma) * nz
    b.vel.x += (j / mb) * nx; b.vel.z += (j / mb) * nz
  }
}
