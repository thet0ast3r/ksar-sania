import * as THREE from 'three'
import { heightAt, normalAt, ergAt, BOUNDS } from './terrain.js'

const G = 9.81
const UP = new THREE.Vector3(0, 1, 0)
const RHO = 1.2

/**
 * Raycast vehicle on an analytic heightfield.
 * Local frame: +x forward, +y up, +z right. `pos` = centre of mass.
 *
 * Realism bits: per-wheel spring/damper with bump stops, anti-roll bars,
 * tyre forces applied at the roll centre (not the contact patch),
 * load-sensitive friction circle, power-limited engine, sand rolling
 * resistance (softer in the erg) and aerodynamic drag.
 */
function finish(c) {
  const comp = G / 4 / (c.k / c.mass)
  c.attachY = c.radius - c.comY + (c.rest - comp)
  return c
}

export const CAR = finish({
  name: 'car', label: 'Duster', mass: 1300, dims: [4.4, 1.4, 1.85], comY: 0.68,
  radius: 0.42, rest: 0.42, k: 1300 * 20, c: 1300 * 2.6, antiRoll: 1300 * 22, rc: 0.55,
  wheels: [[1.33, 0.82, true], [1.33, -0.82, true], [-1.33, 0.82, false], [-1.33, -0.82, false]],
  power: 82000, maxForce: 1300 * 5.5, topSpeed: 44, reverseSpeed: 9, brake: 1300 * 9.5,
  cdA: 0.95, crr: 0.035, maxSteer: 0.58, steerFalloff: 0.05, grip: 0.95, latRate: 11,
  assist: 0.9, airYaw: 0.8, inertiaScale: 1.45,
  hull: [2.15, -0.38, 0.9, 0.88], circles: [-1.4, 0, 1.4], circleR: 1.05, bodyR: 2.3
})

export const SUV = finish({
  name: 'suv', label: 'Touareg', mass: 2200, dims: [4.9, 1.5, 1.95], comY: 0.66,
  radius: 0.46, rest: 0.44, k: 2200 * 22, c: 2200 * 2.8, antiRoll: 2200 * 26, rc: 0.55,
  wheels: [[1.45, 0.88, true], [1.45, -0.88, true], [-1.45, 0.88, false], [-1.45, -0.88, false]],
  power: 260000, maxForce: 2200 * 8.2, topSpeed: 58, reverseSpeed: 11, brake: 2200 * 10.5,
  cdA: 1.0, crr: 0.03, maxSteer: 0.55, steerFalloff: 0.04, grip: 1.02, latRate: 12,
  assist: 0.9, airYaw: 0.8, inertiaScale: 1.45,
  hull: [2.4, -0.36, 0.95, 0.95], circles: [-1.65, 0, 1.65], circleR: 1.1, bodyR: 2.55
})

export const QUAD = finish({
  name: 'quad', label: 'Quad', mass: 340, dims: [2.0, 1.0, 1.25], comY: 0.5,
  radius: 0.34, rest: 0.34, k: 340 * 24, c: 340 * 2.8, antiRoll: 340 * 18, rc: 0.6,
  wheels: [[0.62, 0.53, true], [0.62, -0.53, true], [-0.62, 0.53, false], [-0.62, -0.53, false]],
  power: 24000, maxForce: 340 * 7, topSpeed: 27, reverseSpeed: 7, brake: 340 * 10,
  cdA: 0.9, crr: 0.04, maxSteer: 0.62, steerFalloff: 0.05, grip: 0.98, latRate: 11,
  assist: 1.4, airYaw: 0.9, inertiaScale: 1.7,
  hull: [1.0, -0.22, 0.6, 0.64], circles: [-0.45, 0.45], circleR: 0.72, bodyR: 1.3
})

const v = () => new THREE.Vector3()
const _up = v(), _fwd = v(), _F = v(), _T = v(), _a = v(), _vp = v(), _rt = v()
const _wf = v(), _side = v(), _f = v(), _tq = v(), _p = v(), _vt = v(), _ft = v(), _ax = v(), _Tl = v(), _wl = v(), _n = v()
const _qi = new THREE.Quaternion(), _wq = new THREE.Quaternion()

export class Vehicle {
  constructor(cfg, x, z, yaw) {
    this.cfg = cfg
    this.pos = new THREE.Vector3(x, heightAt(x, z) + cfg.comY + 0.05, z)
    this.vel = new THREE.Vector3()
    this.w = new THREE.Vector3()
    this.q = new THREE.Quaternion().setFromAxisAngle(UP, yaw)
    const [L, H, W] = cfg.dims, m = cfg.mass, s = cfg.inertiaScale
    this.I = new THREE.Vector3((m / 12) * (H * H + W * W) * s, (m / 12) * (L * L + W * W) * s, (m / 12) * (L * L + H * H) * s)
    this.steer = 0
    this.speed = 0
    this.grounded = 0
    this.slip = 0
    this.stuck = 0
    this.wheels = cfg.wheels.map(([wx, wz, front]) => ({
      local: new THREE.Vector3(wx, cfg.attachY, wz), front,
      susp: cfg.rest, contact: false, comp: 0, arf: 0, spin: 0, vLong: 0, vLat: 0,
      n: new THREE.Vector3(), cp: new THREE.Vector3(), r: new THREE.Vector3()
    }))
    const [hx, hy0, hy1, hz] = cfg.hull
    this.corners = []
    for (const sx of [-1, 1]) for (const y of [hy0, hy1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(sx * hx, y, sz * hz))
    for (const y of [hy0, hy1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(0, y, sz * hz))
  }

  forward(out = new THREE.Vector3()) {
    return out.set(1, 0, 0).applyQuaternion(this.q)
  }

  upY() {
    return 1 - 2 * (this.q.x * this.q.x + this.q.z * this.q.z)
  }

  reset() {
    const f = this.forward()
    this.q.setFromAxisAngle(UP, Math.atan2(-f.z, f.x))
    this.pos.y = heightAt(this.pos.x, this.pos.z) + this.cfg.comY + 1.0
    this.vel.set(0, 0, 0)
    this.w.set(0, 0, 0)
  }

  /** returns true if it auto-recovered from a rollover this frame */
  step(dt, ctl) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / n
    this.slip = 0
    for (let i = 0; i < n; i++) this.sub(h, ctl)
    this.slip /= n
    for (const wh of this.wheels) wh.spin += (wh.vLong / this.cfg.radius) * dt
    this.stuck = this.upY() < 0.3 && this.vel.length() < 2.5 ? this.stuck + dt : 0
    if (this.stuck > 2.0) {
      this.reset()
      this.stuck = 0
      return true
    }
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

    const maxSteer = c.maxSteer / (1 + Math.abs(vF) * c.steerFalloff)
    this.steer += (-ctl.steer * maxSteer - this.steer) * Math.min(1, h * 7)

    let drive = 0, brake = 0
    const t = ctl.throttle
    if (t > 0.05) { if (vF < -0.8) brake = t; else drive = t }
    else if (t < -0.05) { if (vF > 0.8) brake = -t; else drive = t }
    const idle = Math.abs(t) <= 0.05

    // engine: power-limited traction force, shared by all 4 wheels (AWD)
    let engineF = 0
    if (drive !== 0) {
      const sp = Math.abs(vF)
      const top = drive > 0 ? c.topSpeed : c.reverseSpeed
      engineF = Math.sign(drive) * Math.abs(drive) * Math.min(c.maxForce, c.power / Math.max(sp, 1)) * Math.max(0, 1 - (sp / top) ** 6)
    }

    // pass 1: suspension geometry
    let contacts = 0
    for (const wh of this.wheels) {
      const a = _a.copy(wh.local).applyQuaternion(q).add(pos)
      const hg = heightAt(a.x, a.z)
      normalAt(a.x, a.z, wh.n)
      const cosA = up.dot(wh.n)
      const d = ((a.y - hg) * wh.n.y) / Math.max(cosA, 0.25)
      const len = d - c.radius
      wh.contact = cosA > 0.3 && len < c.rest
      if (!wh.contact) {
        wh.susp = c.rest
        wh.comp = 0
        continue
      }
      contacts++
      wh.susp = Math.max(len, 0.03)
      wh.comp = c.rest - len
      wh.cp.copy(up).multiplyScalar(-d).add(a)
      wh.r.subVectors(wh.cp, pos)
    }
    this.grounded = contacts

    // anti-roll bars (front & rear axle)
    for (let i = 0; i < 4; i += 2) {
      const A = this.wheels[i], B = this.wheels[i + 1]
      const f = c.antiRoll * (A.comp - B.comp)
      A.arf = f
      B.arf = -f
    }

    // pass 2: forces
    const mShare = m / 4
    const softSand = 1 + 1.6 * ergAt(pos.x, pos.z)
    for (const wh of this.wheels) {
      if (!wh.contact) continue
      const n = wh.n, r = wh.r
      const vp = _vp.crossVectors(w, r).add(vel)
      let Fs = c.k * wh.comp - c.c * vp.dot(up) + wh.arf
      if (wh.comp > c.rest * 0.85) Fs += c.k * 8 * (wh.comp - c.rest * 0.85)
      if (Fs < 0) Fs = 0

      const wf = _wf.copy(fwd)
      if (wh.front) wf.applyAxisAngle(up, this.steer)
      wf.addScaledVector(n, -wf.dot(n)).normalize()
      const side = _side.crossVectors(n, wf)
      const vLong = vp.dot(wf), vLat = vp.dot(side)
      wh.vLong = vLong
      wh.vLat = vLat

      const hand = ctl.handbrake && !wh.front
      const mu = c.grip * (hand ? 0.5 : 1)
      let fLat = -vLat * mShare * c.latRate
      let fLong = engineF / 4
      if (brake > 0) fLong -= Math.sign(vLong) * Math.min(Math.abs(vLong) * mShare * 25, (brake * c.brake) / 4)
      if (hand) fLong -= Math.sign(vLong) * Math.min(Math.abs(vLong) * mShare * 25, c.brake / 4)
      // rolling resistance (constant-ish, softer sand digs in more) + parking hold
      fLong -= Math.tanh(vLong * 3) * c.crr * softSand * Fs
      if (idle && Math.abs(vF) < 1.2) fLong -= vLong * mShare * 10

      const maxF = mu * Fs
      const tot = Math.hypot(fLat, fLong)
      if (tot > maxF && tot > 0) {
        const s = maxF / tot
        this.slip += (1 - s) / 4
        fLat *= s
        fLong *= s
      }
      // suspension force acts at the contact patch
      _f.copy(n).multiplyScalar(Fs)
      F.add(_f)
      T.add(_tq.crossVectors(r, _f))
      // tyre forces act through the roll centre → far less roll moment
      _f.copy(side).multiplyScalar(fLat).addScaledVector(wf, fLong)
      F.add(_f)
      _rt.copy(r).addScaledVector(up, c.comY * c.rc)
      T.add(_tq.crossVectors(_rt, _f))
    }

    // aero drag
    const sp = vel.length()
    if (sp > 0.1) F.addScaledVector(vel, -0.5 * RHO * c.cdA * sp)

    // hull vs ground
    for (const cl of this.corners) {
      const p = _p.copy(cl).applyQuaternion(q).add(pos)
      const hg = heightAt(p.x, p.z)
      if (p.y >= hg) continue
      normalAt(p.x, p.z, _n)
      const depth = (hg - p.y) * _n.y
      const r = _rt.subVectors(p, pos)
      const vp = _vp.crossVectors(w, r).add(vel)
      const vn = vp.dot(_n)
      let Fn = depth * m * 90 - vn * m * 9
      if (Fn < 0) Fn = 0
      const vt = _vt.copy(vp).addScaledVector(_n, -vn)
      const ft = _ft.copy(vt).multiplyScalar(-m * 2)
      const ftl = ft.length(), maxT = 0.35 * Fn
      if (ftl > maxT) ft.multiplyScalar(maxT / ftl)
      _f.copy(_n).multiplyScalar(Fn).add(ft)
      F.add(_f)
      T.add(_tq.crossVectors(r, _f))
    }

    // mild stability aid (only really matters once it's well past tipping)
    _ax.crossVectors(up, UP)
    const tilt = _ax.length()
    if (tilt > 0.35) T.addScaledVector(_ax, m * c.assist * (contacts ? 1 : 0.4) * (tilt - 0.35) * 3)
    if (!contacts) T.addScaledVector(up, -ctl.steer * m * c.airYaw)

    // integrate
    vel.addScaledVector(F, h / m)
    _qi.copy(q).invert()
    const Tl = _Tl.copy(T).applyQuaternion(_qi)
    const wl = _wl.copy(w).applyQuaternion(_qi)
    wl.x += (Tl.x / this.I.x) * h
    wl.y += (Tl.y / this.I.y) * h
    wl.z += (Tl.z / this.I.z) * h
    // a touch more damping on roll/pitch in the air (keeps jumps from tumbling forever)
    const air = contacts ? 0 : 1
    wl.x *= 1 - h * (0.6 + air * 0.8)
    wl.z *= 1 - h * (0.6 + air * 0.8)
    wl.y *= 1 - h * 0.6
    w.copy(wl.applyQuaternion(q))
    pos.addScaledVector(vel, h)
    _wq.set(w.x * h * 0.5, w.y * h * 0.5, w.z * h * 0.5, 0).multiply(q)
    q.set(q.x + _wq.x, q.y + _wq.y, q.z + _wq.z, q.w + _wq.w).normalize()
  }

  /** push out of buildings / palms / world edge */
  collide(rects, circles) {
    const c = this.cfg, pos = this.pos
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
    pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) - 0.4)
  }

  #push(nx, nz, depth) {
    this.pos.x += nx * depth
    this.pos.z += nz * depth
    const vn = this.vel.x * nx + this.vel.z * nz
    if (vn < 0) {
      this.vel.x -= nx * vn * 1.25
      this.vel.z -= nz * vn * 1.25
      this.w.multiplyScalar(0.85)
    }
  }
}

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
