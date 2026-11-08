import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { toon, GLOW, LAMP } from './toon.js'
import { heightAt } from './terrain.js'

/* ---------- toolkit ---------- */

function prep(g, flat = false) {
  g.deleteAttribute('uv')
  const n = g.index ? g.toNonIndexed() : g
  if (flat) n.computeVertexNormals()
  return n
}

function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  )
  return g.applyMatrix4(m)
}

/** rounded box, bottom at y */
export const rbox = (w, h, d, x = 0, y = 0, z = 0, { r = 0.25, rx = 0, ry = 0, rz = 0 } = {}) => {
  const rad = Math.min(r, Math.min(w, h, d) * 0.45)
  return xf(prep(new RoundedBoxGeometry(w, h, d, 2, rad)), [x, y + h / 2, z], [rx, ry, rz])
}
/** centered rounded box */
const cbox = (w, h, d, p, opts = {}) => rbox(w, h, d, p[0], p[1] - h / 2, p[2], opts)

const taper = (wb, wt, h, x = 0, y = 0, z = 0) => {
  const g = new THREE.CylinderGeometry(wt / Math.SQRT2, wb / Math.SQRT2, h, 4, 1)
  g.rotateY(Math.PI / 4)
  return xf(prep(g, true), [x, y + h / 2, z])
}
const sphere = (r, p, s = [1, 1, 1], detail = 2) => xf(prep(new THREE.IcosahedronGeometry(r, detail)), p, [0, 0, 0], s)
const cyl = (rt, rb, h, seg, p, r = [0, 0, 0]) => xf(prep(new THREE.CylinderGeometry(rt, rb, h, seg)), p, r)

function bucket() {
  const parts = {}
  const add = (color, ...gs) => (parts[color] ??= []).push(...gs)
  const done = () => Object.entries(parts).map(([color, gs]) => ({ color, geometry: mergeGeometries(gs, false) }))
  return { add, done }
}

export function toMesh({ geometry, color, vertexColors = false }, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, toon(color, vertexColors))
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}
export const group = (parts, opts) => {
  const g = new THREE.Group()
  parts.forEach((p) => g.add(toMesh(p, opts)))
  return g
}

/* ---------- Ksar ---------- */

const C = {
  wall: '#d98550', tower: '#cf7643', house: '#df9458', house2: '#d27f4c',
  trim: '#ad5a30', dark: '#3a1d0e', wood: '#7a4320', mina: '#e6a66d', tile: '#2e8f6c'
}

function merlonRow(add, color, x0, z0, x1, z1, y, step = 2, size = 1.0) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.round(len / step))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    add(color, rbox(size, size, size, x0 + (x1 - x0) * t, y - 0.1, z0 + (z1 - z0) * t, { r: 0.28 }))
  }
}

function archDoor(add, x, z, w, h, ry = 0, frame = true) {
  const make = (w, h, d) => {
    const half = new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, false, 0, Math.PI)
    half.rotateX(Math.PI / 2)
    half.rotateZ(Math.PI / 2)
    half.translate(0, h, 0)
    return [rbox(w, h, d, 0, 0, 0, { r: 0.08 }), prep(half)]
  }
  const place = (g) => xf(g, [x, 0, z], [0, ry, 0])
  make(w, h, 0.5).forEach((g) => add(C.wood, place(g)))
  if (frame) make(w * 1.35, h * 1.1, 0.34).forEach((g) => add(C.trim, place(g)))
}

let winToggle = 0
function win(add, x, y, z, w, h, d) {
  add(winToggle++ % 3 === 0 ? C.dark : GLOW, rbox(w, h, d, x, y, z, { r: 0.12 }))
}

function tower(add, x, z) {
  const wb = 5.4, wt = 4.4, h = 12.5
  add(C.tower, taper(wb, wt, h, x, 0, z))
  const wAt = (y) => wb - (wb - wt) * (y / h)
  add(C.trim, rbox(wAt(8.4) + 0.4, 0.5, wAt(8.4) + 0.4, x, 8.4, z, { r: 0.2 }))
  add(C.tower, rbox(wt + 0.6, 0.8, wt + 0.6, x, h - 0.1, z, { r: 0.3 }))
  const e = (wt + 0.6) / 2 - 0.45
  merlonRow(add, C.tower, x - e, z - e, x + e, z - e, h + 0.7, 1.6, 0.95)
  merlonRow(add, C.tower, x - e, z + e, x + e, z + e, h + 0.7, 1.6, 0.95)
  merlonRow(add, C.tower, x - e, z - e + 1.6, x - e, z + e - 1.6, h + 0.7, 1.6, 0.95)
  merlonRow(add, C.tower, x + e, z - e + 1.6, x + e, z + e - 1.6, h + 0.7, 1.6, 0.95)
  for (const y of [9.4, 10.8]) {
    const hw = wAt(y) / 2
    for (const o of [-1, 0, 1]) {
      win(add, x + o, y, z + hw, 0.4, 0.75, 0.45)
      win(add, x + o, y, z - hw, 0.4, 0.75, 0.45)
      win(add, x + hw, y, z + o, 0.45, 0.75, 0.4)
      win(add, x - hw, y, z + o, 0.45, 0.75, 0.4)
    }
  }
  const hw = wAt(4.5) / 2
  win(add, x, 4.5, z + hw, 0.7, 1.0, 0.5)
  win(add, x + hw, 4.5, z, 0.5, 1.0, 0.7)
  win(add, x - hw, 4.5, z, 0.5, 1.0, 0.7)
}

function house(add, rects, { x, z, w, d, h, color = C.house, door = true }) {
  add(color, rbox(w, h, d, x, 0, z, { r: 0.55 }))
  add(color, rbox(w + 0.5, 0.7, d + 0.5, x, h - 0.35, z, { r: 0.3 }))
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    add(color, rbox(1.0, 0.9, 1.0, x + sx * (w / 2 - 0.25), h + 0.3, z + sz * (d / 2 - 0.25), { r: 0.3 }))
  const cols = w > 5.5 ? [-w / 3, 0, w / 3] : [-w / 4, w / 4]
  const rows = h > 5.5 ? [1.4, h - 2.3] : [h - 2.3]
  for (const y of rows) for (const c of cols) if (!door || y > 2 || Math.abs(c) > 0.9) win(add, x + c, y, z + d / 2, 0.7, 0.95, 0.4)
  for (const c of [-d / 4, d / 4]) {
    win(add, x + w / 2, h - 2.3, z + c, 0.4, 0.95, 0.7)
    win(add, x - w / 2, h - 2.3, z + c, 0.4, 0.95, 0.7)
  }
  if (door) archDoor(add, x, z + d / 2, 1.4, 1.8, 0, false)
  rects.push({ x, z, hw: w / 2 + 0.3, hd: d / 2 + 0.3, h: h + 1 })
}

export const KASBAH = { kx: 0, kz: -4, S: 19, H: 6.8, T: 1.9, gate: 3.8, gateH: 3.9 }
export const CLIMB_PALM = { x: -4.6, z: 1.4, h: 12.5 }

function halfDisc(r, d, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, d, 22, 1, false, 0, Math.PI)
  g.rotateX(Math.PI / 2)
  g.rotateZ(Math.PI / 2)
  g.translate(x, y, z)
  return prep(g)
}

export function buildKsar() {
  const { add, done } = bucket()
  const rects = [], vrects = [], prects = [], platforms = [], circles = []
  const { kx, kz, S, H, T, gate, gateH } = KASBAH
  const zf = kz + S / 2 - T / 2, zb = kz - S / 2 + T / 2, xr = kx + S / 2 - T / 2, xl = kx - S / 2 + T / 2

  // walls (front one has an open gate)
  add(C.wall, rbox(S, H, T, kx, 0, zb, { r: 0.6 }))
  add(C.wall, rbox(T, H, S, xr, 0, kz, { r: 0.6 }))
  add(C.wall, rbox(T, H, S, xl, 0, kz, { r: 0.6 }))
  const segW = (S - gate) / 2
  for (const s of [-1, 1]) {
    add(C.wall, rbox(segW, H, T, kx + s * (gate / 2 + segW / 2), 0, zf, { r: 0.6 }))
    rects.push({ x: kx + s * (gate / 2 + segW / 2), z: zf, hw: segW / 2, hd: T / 2, h: H })
  }
  add(C.wall, rbox(gate + 0.8, H - gateH, T, kx, gateH, zf, { r: 0.3 }))
  for (const side of [1, -1]) {
    const zz = zf + side * (T / 2 + 0.02)
    add(C.trim, halfDisc(gate / 2 + 0.55, 0.16, kx, gateH, zz))
    add('#2a150b', halfDisc(gate / 2, 0.22, kx, gateH, zz))
    for (const s of [-1, 1]) add(C.trim, rbox(0.55, gateH, 0.16, kx + s * (gate / 2 + 0.27), 0, zz, { r: 0.05 }))
  }
  rects.push({ x: kx, z: zb, hw: S / 2, hd: T / 2, h: H })
  rects.push({ x: xr, z: kz, hw: T / 2, hd: S / 2, h: H })
  rects.push({ x: xl, z: kz, hw: T / 2, hd: S / 2, h: H })

  // merlons along the OUTER edge so the rampart walk stays free
  const eo = S / 2 - 0.5, m = S / 2 - 3.4
  merlonRow(add, C.wall, kx - m, kz + eo, kx + m, kz + eo, H, 2.0)
  merlonRow(add, C.wall, kx - m, kz - eo, kx + m, kz - eo, H, 2.0)
  merlonRow(add, C.wall, kx - eo, kz - m, kx - eo, kz + m, H, 2.0)
  merlonRow(add, C.wall, kx + eo, kz - m, kx + eo, kz + m, H, 2.0)
  add(C.trim, rbox(S - 6, 0.45, 0.3, kx, H - 1.0, kz + S / 2 + 0.05, { r: 0.12 }))

  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    tower(add, kx + dx * S / 2, kz + dz * S / 2)
    rects.push({ x: kx + dx * S / 2, z: kz + dz * S / 2, hw: 2.75, hd: 2.75, h: 13.5 })
  }
  for (const o of [-5.5, 5.5]) win(add, kx + o, 3.6, kz + S / 2, 0.8, 1.1, 0.5)
  for (const o of [-4, 0, 4]) {
    win(add, kx + S / 2, 3.6, kz + o, 0.5, 1.1, 0.8)
    win(add, kx - S / 2, 3.6, kz + o, 0.5, 1.1, 0.8)
  }

  // keep (back of the courtyard)
  add(C.house2, rbox(8, 9.5, 7, kx - 1, 0, kz - 3.5, { r: 0.5 }))
  add(C.house2, rbox(8.5, 0.7, 7.5, kx - 1, 9.2, kz - 3.5, { r: 0.3 }))
  merlonRow(add, C.house2, kx - 4.6, kz + 0.1, kx + 2.6, kz + 0.1, 9.9, 1.8)
  for (const o of [-2.4, 0, 2.4]) win(add, kx - 1 + o, 7.0, kz, 0.7, 1.0, 0.4)
  for (const o of [-2.6, 2.6]) win(add, kx - 1 + o, 2.4, kz, 0.7, 1.0, 0.4)
  archDoor(add, kx - 1, kz, 1.6, 2.2)
  rects.push({ x: kx - 1, z: kz - 3.5, hw: 4.15, hd: 3.65, h: 10.5 })

  // courtyard floor + zellige around the fountain
  const inner = S - 2 * T
  add('#d7a06c', rbox(inner, 0.1, inner, kx, -0.06, kz, { r: 0.04 }))
  const fx = kx + 1.2, fz = kz + 4.3
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++)
      add((i + j) % 2 === 0 ? C.tile : '#efe0bf', rbox(0.78, 0.05, 0.78, fx + i * 0.8, 0.0, fz + j * 0.8, { r: 0.02 }))
  // fountain
  add(C.tile, cyl(1.55, 1.65, 0.7, 8, [fx, 0.35, fz]))
  add('#efe0bf', cyl(1.72, 1.72, 0.16, 8, [fx, 0.76, fz]))
  add('#56b8cf', cyl(1.38, 1.38, 0.06, 16, [fx, 0.66, fz]))
  add('#efe0bf', cyl(0.22, 0.32, 1.3, 10, [fx, 1.0, fz]))
  add(C.tile, cyl(0.72, 0.26, 0.32, 10, [fx, 1.78, fz]))
  add('#56b8cf', cyl(0.62, 0.62, 0.05, 14, [fx, 1.92, fz]))
  circles.push({ x: fx, z: fz, r: 1.8 })

  // tea corner
  const tx = kx + 4.3, tz = kz + 1.5
  add('#e0b050', rbox(2.7, 0.04, 2.0, tx, 0.0, tz, { r: 0.02 }))
  add('#a8322a', rbox(2.4, 0.05, 1.7, tx, 0.01, tz, { r: 0.02 }))
  add(C.wood, cyl(0.12, 0.14, 0.32, 8, [tx, 0.2, tz]))
  add(C.wood, cyl(0.48, 0.48, 0.08, 14, [tx, 0.4, tz]))
  add('#c7ccd3', sphere(0.15, [tx, 0.56, tz], [1, 0.85, 1]))
  add('#c7ccd3', cyl(0.02, 0.03, 0.2, 6, [tx + 0.17, 0.6, tz], [0, 0, -0.9]))
  for (const [ox, oz] of [[0.25, 0.2], [-0.2, 0.25], [-0.15, -0.25]]) add('#e9c25a', cyl(0.045, 0.04, 0.1, 8, [tx + ox, 0.49, tz + oz]))
  for (const [ox, oz, c] of [[-1.0, 0.0, '#2e6f9e'], [1.0, 0.0, '#d8a640'], [0, 0.85, '#8a3a7a'], [0, -0.85, '#2e8f6c']])
    add(c, rbox(0.7, 0.26, 0.7, tx + ox, 0.03, tz + oz, { r: 0.12 }))

  // lanterns
  const lantern = (x, y, z) => {
    add(GLOW, rbox(0.34, 0.5, 0.34, x, y, z, { r: 0.06 }))
    add(C.dark, taper(0.42, 0.1, 0.28, x, y + 0.5, z))
    add(C.dark, rbox(0.4, 0.06, 0.4, x, y - 0.04, z, { r: 0.02 }))
  }
  lantern(kx - S / 2 + T + 0.25, 3.2, kz + 0.5)
  lantern(kx - S / 2 + T + 0.25, 3.2, kz - 6)
  lantern(kx - 3.2, 3.2, kz + S / 2 - T - 0.25)
  lantern(kx + 3.2, 3.2, kz + S / 2 - T - 0.25)
  lantern(kx - 4.0, 3.0, kz + 0.25)
  lantern(kx + 2.0, 3.0, kz + 0.25)

  // stairs up to the right-hand rampart
  const N = 12, stepD = 0.9, sx1 = kx + S / 2 - T, sx0 = sx1 - 1.75
  const scx = (sx0 + sx1) / 2, shw = (sx1 - sx0) / 2, z0 = kz + S / 2 - T - 0.6
  for (let i = 0; i < N; i++) {
    const top = ((i + 1) * H) / N
    const zc = z0 - stepD * i - stepD / 2
    add('#d48650', rbox(sx1 - sx0, top, stepD + 0.02, scx, 0, zc, { r: 0.08 }))
    platforms.push({ x: scx, z: zc, hw: shw, hd: stepD / 2, top })
  }
  vrects.push({ x: scx, z: z0 - (N * stepD) / 2, hw: shw, hd: (N * stepD) / 2, h: H })
  platforms.push({ x: xr, z: kz, hw: T / 2 + 0.05, hd: S / 2 - 2.7, top: H })
  prects.push({ x: kx + S / 2 - 0.25, z: kz, hw: 0.25, hd: S / 2, h: H + 1.4 })

  const houses = [
    { x: -16.5, z: 3, w: 7, d: 5.5, h: 5 },
    { x: -14.5, z: -9, w: 6, d: 6.5, h: 6.6, color: C.house2, door: false },
    { x: 16.5, z: 3.5, w: 7.5, d: 5.5, h: 4.6, color: C.house2 },
    { x: 17.5, z: -8, w: 5.5, d: 6, h: 7.2, door: false },
    { x: -24.5, z: -2.5, w: 5, d: 5, h: 4 },
    { x: 25, z: -1, w: 5, d: 5.5, h: 4, color: C.house2 },
    { x: 6.5, z: -19, w: 6.5, d: 5.5, h: 5.6, color: C.house2, door: false },
    { x: -6.5, z: -20, w: 5.5, d: 5, h: 4.8, door: false }
  ]
  houses.forEach((h) => house(add, rects, h))

  // minaret
  const mx = -11.5, mz = -17, mw = 3.8, mh = 15.5
  add(C.mina, rbox(mw, mh, mw, mx, 0, mz, { r: 0.45 }))
  add(C.tile, rbox(mw + 0.5, 0.9, mw + 0.5, mx, mh - 2.8, mz, { r: 0.3 }))
  add(C.mina, rbox(mw + 0.6, 0.6, mw + 0.6, mx, mh, mz, { r: 0.25 }))
  const me = (mw + 0.6) / 2 - 0.4
  merlonRow(add, C.mina, mx - me, mz + me, mx + me, mz + me, mh + 0.6, 1.5, 0.8)
  merlonRow(add, C.mina, mx - me, mz - me, mx + me, mz - me, mh + 0.6, 1.5, 0.8)
  add(C.mina, rbox(1.8, 2.4, 1.8, mx, mh + 0.6, mz, { r: 0.3 }))
  add(C.tile, taper(2.2, 0.3, 1.5, mx, mh + 3.0, mz))
  add('#e9c25a', sphere(0.28, [mx, mh + 4.8, mz]))
  for (const y of [mh - 5, mh - 8.5]) {
    win(add, mx, y, mz + mw / 2, 0.7, 1.3, 0.4)
    win(add, mx + mw / 2, y, mz, 0.4, 1.3, 0.7)
  }
  rects.push({ x: mx, z: mz, hw: mw / 2 + 0.4, hd: mw / 2 + 0.4, h: 20 })

  const gw = [[-13, 10, 10, 1.1], [-18.5, 7.5, 1.1, 6], [17, 10, 11, 1.1], [22.5, 7.5, 1.1, 5.5]]
  for (const [x, z, w, d] of gw) {
    add(C.wall, rbox(w, 1.7, d, x, 0, z, { r: 0.45 }))
    rects.push({ x, z, hw: w / 2, hd: d / 2, h: 2 })
  }

  const rampartDates = [[xr, kz + 1.5], [xr, kz - 4.5]].map(([x, z]) => new THREE.Vector3(x, H + 1.4, z))
  return { parts: done(), rects, vrects, prects, platforms, circles, rampartDates }
}


/* ---------- palms ---------- */

export function buildPalm(h = 8, lean = 0.2, seed = 0) {
  const { add, done } = bucket()
  const n = 7
  const curve = (t) => new THREE.Vector3(lean * h * t * t, h * t, 0)
  let top
  for (let i = 0; i < n; i++) {
    const a = curve(i / n), b = curve((i + 1) / n)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const r = 0.62 - 0.2 * (i / n)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    const g = prep(new THREE.CylinderGeometry(r * 0.9, r, len * 1.02, 10))
    g.applyQuaternion(q)
    g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray())
    add('#9a6a3c', g)
    const ring = prep(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.22, 10))
    ring.applyQuaternion(q)
    ring.translate(...b.toArray())
    add('#7d5230', ring)
    top = b
  }
  add('#5a7a2a', sphere(0.75, top.toArray(), [1, 0.8, 1]))
  const k = 10
  for (let i = 0; i < k; i++) {
    const g = new THREE.ConeGeometry(0.95, 4.6, 5, 1)
    g.rotateZ(-Math.PI / 2)
    g.scale(1, 0.26, 1)
    g.translate(2.2, 0, 0)
    g.rotateZ(-0.25 - 0.4 * Math.abs(Math.sin(i * 2.3 + seed)))
    g.rotateY((i / k) * Math.PI * 2 + seed)
    g.translate(top.x, top.y + 0.2, top.z)
    add(i % 2 ? '#4f8f2c' : '#69aa3a', prep(g))
  }
  for (let j = 0; j < 3; j++) {
    const a = j * 2.1 + seed
    for (let s = 0; s < 4; s++)
      add('#e0862a', sphere(0.2, [top.x + Math.cos(a) * 0.65 + (s % 2) * 0.15, top.y - 0.5 - s * 0.14, Math.sin(a) * 0.65], [1, 1.4, 1], 1))
  }
  return done()
}

/* ---------- camel ---------- */

export function buildCamel() {
  const { add, done } = bucket()
  const FUR = '#c58e55'
  add(FUR, sphere(1, [0, 2.0, 0], [1.2, 0.62, 0.58]))
  add(FUR, sphere(0.6, [-0.05, 2.55, 0], [1, 0.9, 0.9]))
  add(FUR, cyl(0.22, 0.28, 1.1, 10, [1.1, 2.35, 0], [0, 0, -0.75]))
  add(FUR, sphere(0.36, [1.58, 2.82, 0], [1.4, 0.8, 0.8]))
  for (const [x, z] of [[-0.65, -0.26], [-0.65, 0.26], [0.65, -0.26], [0.65, 0.26]])
    add(FUR, cyl(0.14, 0.16, 1.7, 8, [x, 0.85, z]))
  add('#c8382f', rbox(0.85, 0.16, 1.2, -0.05, 2.38, 0, { r: 0.06 }))
  add('#f2c14e', rbox(0.88, 0.07, 1.22, -0.05, 2.33, 0, { r: 0.03 }))
  return done()
}

/* ---------- clouds ---------- */

export function buildCloud(seed = 1) {
  const gs = []
  const rnd = (i) => Math.abs(Math.sin(seed * 12.9 + i * 78.2))
  for (let i = 0; i < 6; i++) {
    const r = 6 + rnd(i) * 6
    gs.push(sphere(r, [(i - 2.5) * 7 + rnd(i + 9) * 3, rnd(i + 3) * 3, rnd(i + 5) * 6 - 3], [1, 0.75, 1]))
  }
  return [{ color: '#ffffff', geometry: mergeGeometries(gs, false) }]
}

/* ---------- vehicles (front = +x, ground at y = 0) ---------- */

function extrude(points, depth, bevel = 0.05, segs = 3) {
  const s = new THREE.Shape()
  s.moveTo(...points[0])
  points.slice(1).forEach((p) => s.lineTo(...p))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs })
  g.translate(0, 0, -depth / 2)
  return prep(g)
}

const BLACK = '#2a2a2c', SILVER = '#c7ccd3', TIRE = '#1d1d20'

export function buildCarParts() {
  const { add, done } = bucket()
  const WHITE = '#f6f5ef', GLASS = '#2c3e52'
  add(WHITE, extrude([
    [-2.0, 0.45], [1.95, 0.45], [2.03, 0.7], [1.98, 0.9], [1.15, 1.03],
    [0.45, 1.48], [-1.75, 1.5], [-1.98, 1.38], [-2.03, 0.95]
  ], 1.53, 0.16))
  add(GLASS, extrude([[1.12, 1.12], [0.52, 1.54], [-1.76, 1.57], [-1.98, 1.45], [-2.04, 1.12]], 1.92, 0))
  add(WHITE, rbox(0.16, 0.5, 1.96, -0.32, 1.09, 0, { r: 0.05 }))
  add(WHITE, rbox(0.24, 0.48, 1.96, -1.5, 1.1, 0, { r: 0.05 }))
  add(GLASS, xf(prep(new THREE.BoxGeometry(0.84, 0.05, 1.5)), [0.89, 1.4, 0], [0, 0, Math.atan2(0.45, -0.7) - Math.PI]))
  add(GLASS, rbox(0.05, 0.34, 1.4, -2.2, 1.0, 0, { r: 0.02 }))
  add(BLACK, rbox(4.5, 0.32, 1.92, 0, 0.24, 0, { r: 0.14 }))
  for (const x of [-1.33, 1.33]) add(BLACK, cyl(0.62, 0.62, 1.96, 20, [x, 0.42, 0], [Math.PI / 2, 0, 0]))
  add(BLACK, rbox(0.12, 0.28, 1.1, 2.15, 0.52, 0, { r: 0.05 }))
  add(SILVER, rbox(0.12, 0.07, 1.16, 2.17, 0.78, 0, { r: 0.03 }))
  add(SILVER, rbox(0.14, 0.14, 0.95, 2.16, 0.24, 0, { r: 0.05 }))
  for (const z of [-0.63, 0.63]) {
    add(LAMP, rbox(0.1, 0.17, 0.36, 2.13, 0.72, z, { r: 0.05 }))
    add('#d8342c', rbox(0.1, 0.26, 0.22, -2.18, 0.86, z * 1.12, { r: 0.05 }))
    add(WHITE, rbox(0.2, 0.16, 0.24, 1.05, 1.05, z * 1.65, { r: 0.06 }))
    add(BLACK, rbox(2.3, 0.08, 0.09, -0.65, 1.66, z * 1.14, { r: 0.03 }))
    add(BLACK, rbox(0.14, 0.1, 0.1, 0.4, 1.6, z * 1.14, { r: 0.03 }))
    add(BLACK, rbox(0.14, 0.1, 0.1, -1.7, 1.6, z * 1.14, { r: 0.03 }))
  }
  return done()
}

export function buildWheelParts(r, w, { rim = SILVER, rimR = 0.58, spokes = 0 } = {}) {
  const { add, done } = bucket()
  add(TIRE, cyl(r, r, w, 22, [0, 0, 0], [Math.PI / 2, 0, 0]))
  add(TIRE, cyl(r * 1.04, r * 1.04, w * 0.55, 22, [0, 0, 0], [Math.PI / 2, 0, 0]))
  add(spokes ? '#55585e' : rim, cyl(r * rimR, r * rimR, w + 0.03, 16, [0, 0, 0], [Math.PI / 2, 0, 0]))
  if (spokes) {
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2
      add(rim, xf(rbox(r * 0.14, r * rimR * 0.95, w + 0.06, 0, 0, 0, { r: 0.02 }), [0, 0, 0], [0, 0, -a]))
    }
    add(rim, cyl(r * 0.16, r * 0.16, w + 0.08, 10, [0, 0, 0], [Math.PI / 2, 0, 0]))
  } else add(BLACK, rbox(r * 0.25, r * 1.0, w + 0.05, 0, -r * 0.5, 0, { r: 0.02 }))
  return done()
}

export function buildSuvParts() {
  const { add, done } = bucket()
  const PAINT = '#24262d', GLASS = '#1a2633', CHROME = '#d5d9df'
  add(PAINT, extrude([
    [-2.27, 0.5], [2.22, 0.5], [2.32, 0.74], [2.27, 0.96], [1.35, 1.1],
    [0.55, 1.52], [-1.6, 1.55], [-2.17, 1.3], [-2.32, 0.95]
  ], 1.62, 0.16))
  add(GLASS, extrude([[1.28, 1.17], [0.6, 1.58], [-1.58, 1.61], [-2.1, 1.36], [-2.16, 1.17]], 2.0, 0))
  add(PAINT, rbox(0.16, 0.5, 2.04, -0.35, 1.13, 0, { r: 0.05 }))
  add(PAINT, rbox(0.22, 0.48, 2.04, -1.45, 1.14, 0, { r: 0.05 }))
  add(CHROME, rbox(3.5, 0.04, 2.03, -0.45, 1.13, 0, { r: 0.015 }))
  add(GLASS, xf(prep(new THREE.BoxGeometry(0.9, 0.05, 1.58)), [1.03, 1.46, 0], [0, 0, Math.atan2(0.42, -0.8) - Math.PI]))
  add(GLASS, xf(prep(new THREE.BoxGeometry(0.62, 0.05, 1.5)), [-1.94, 1.58, 0], [0, 0, Math.atan2(-0.25, -0.57) - Math.PI]))
  for (const x of [-1.45, 1.45]) add(PAINT, cyl(0.66, 0.66, 2.0, 22, [x, 0.45, 0], [Math.PI / 2, 0, 0]))
  add('#141518', rbox(4.7, 0.22, 2.0, 0, 0.3, 0, { r: 0.1 }))
  add(CHROME, rbox(3.0, 0.05, 2.02, 0, 0.5, 0, { r: 0.02 }))
  // big chrome-barred grille + slim LED lights
  add('#0d0e10', rbox(0.14, 0.4, 1.3, 2.38, 0.5, 0, { r: 0.06 }))
  for (const y of [0.6, 0.7, 0.8]) add(CHROME, rbox(0.16, 0.035, 1.32, 2.39, y, 0, { r: 0.012 }))
  add(CHROME, rbox(0.16, 0.12, 0.2, 2.42, 0.62, 0, { r: 0.05 }))
  for (const z of [-0.66, 0.66]) {
    add(LAMP, rbox(0.1, 0.11, 0.42, 2.33, 0.84, z, { r: 0.04 }))
    add('#d8342c', rbox(0.1, 0.12, 0.42, -2.36, 1.02, z * 1.0, { r: 0.04 }))
    add(PAINT, rbox(0.22, 0.16, 0.26, 1.15, 1.13, z * 1.62, { r: 0.06 }))
    add(CHROME, rbox(2.4, 0.07, 0.08, -0.55, 1.73, z * 1.08, { r: 0.03 }))
  }
  add('#d8342c', rbox(0.08, 0.04, 0.9, -2.37, 1.04, 0, { r: 0.015 }))
  add(CHROME, rbox(0.12, 0.08, 1.2, -2.35, 0.48, 0, { r: 0.03 }))
  for (const z of [-0.4, 0.4]) add(CHROME, cyl(0.05, 0.05, 0.12, 10, [-2.4, 0.42, z], [0, 0, Math.PI / 2]))
  return done()
}


export function buildQuadParts() {
  const { add, done } = bucket()
  const Y = '#f2b705'
  add(BLACK, rbox(1.5, 0.28, 0.6, 0, 0.32, 0, { r: 0.1 }))
  add(Y, rbox(1.55, 0.36, 0.92, 0, 0.48, 0, { r: 0.16 }))
  add(Y, rbox(0.8, 0.3, 1.3, 0.6, 0.6, 0, { r: 0.14 }))
  add(Y, rbox(0.85, 0.3, 1.3, -0.6, 0.62, 0, { r: 0.14 }))
  add(Y, rbox(0.55, 0.32, 0.6, 0.32, 0.75, 0, { r: 0.14 }))
  add('#222226', rbox(0.8, 0.18, 0.5, -0.24, 0.8, 0, { r: 0.08 }))
  add(BLACK, cyl(0.05, 0.05, 0.4, 8, [0.48, 1.08, 0], [0, 0, 0.35]))
  add(BLACK, cyl(0.045, 0.045, 0.9, 8, [0.42, 1.25, 0], [Math.PI / 2, 0, 0]))
  for (const z of [-0.42, 0.42]) add('#3a3a3e', cyl(0.06, 0.06, 0.16, 8, [0.42, 1.25, z], [Math.PI / 2, 0, 0]))
  for (const z of [-0.3, 0.3]) add(LAMP, rbox(0.08, 0.13, 0.2, 1.0, 0.66, z, { r: 0.04 }))
  add(BLACK, rbox(0.55, 0.06, 1.0, 0.62, 0.91, 0, { r: 0.02 }))
  add(BLACK, rbox(0.6, 0.06, 1.0, -0.66, 0.93, 0, { r: 0.02 }))
  add('#d8342c', rbox(0.08, 0.1, 0.24, -1.03, 0.68, 0, { r: 0.03 }))
  return done()
}

/* ---------- the adventurer (faces +z, feet at y = 0) ---------- */

export function buildAdventurer() {
  const SKIN = '#f1b48c', HAIR = '#cf4a1c', BEARD = '#b93d17', SHIRT = '#66713f', SHIRT2 = '#535d30'
  const PANTS = '#b39a6c', PANTS2 = '#9c845a', BOOT = '#4b2f1b', BELT = '#3a2716', PACK = '#7c5a33', SCARF = '#dccb9f'
  const mesh = (geo, c) => {
    const m = new THREE.Mesh(geo, toon(c))
    m.castShadow = true
    return m
  }
  const b = (w, h, d, c, p, r = 0.07, rot) => mesh(cbox(w, h, d, p, { r, ...(rot || {}) }), c)

  const root = new THREE.Group()
  const leg = (side) => {
    const g = new THREE.Group()
    g.position.set(side * 0.16, 0.95, 0)
    g.add(b(0.3, 0.55, 0.32, PANTS, [0, -0.25, 0], 0.1))
    g.add(b(0.27, 0.4, 0.3, PANTS, [0, -0.62, 0], 0.09))
    g.add(b(0.1, 0.22, 0.2, PANTS2, [side * 0.16, -0.3, 0], 0.04))
    g.add(b(0.33, 0.22, 0.46, BOOT, [0, -0.84, 0.06], 0.08))
    return g
  }
  const legL = leg(1), legR = leg(-1)

  const torso = new THREE.Group()
  torso.position.y = 0.95
  torso.add(b(0.68, 0.74, 0.44, SHIRT, [0, 0.4, 0], 0.16))
  torso.add(b(0.72, 0.12, 0.47, BELT, [0, 0.06, 0], 0.05))
  torso.add(b(0.11, 0.09, 0.04, '#d4aa4a', [0, 0.06, 0.24], 0.02))
  for (const s of [-1, 1]) {
    torso.add(b(0.19, 0.17, 0.06, SHIRT2, [s * 0.16, 0.5, 0.22], 0.04))
    torso.add(b(0.08, 0.62, 0.05, PACK, [s * 0.19, 0.42, 0.22], 0.03))
  }
  torso.add(b(0.52, 0.58, 0.28, PACK, [0, 0.44, -0.34], 0.12))
  const roll = mesh(cyl(0.12, 0.12, 0.6, 12, [0, 0.8, -0.34], [0, 0, Math.PI / 2]), '#556b3a')
  torso.add(roll)
  torso.add(b(0.56, 0.15, 0.5, SCARF, [0, 0.8, 0], 0.07))

  const head = new THREE.Group()
  head.position.y = 0.84
  torso.add(head)
  head.add(b(0.46, 0.48, 0.46, SKIN, [0, 0.24, 0], 0.14))
  head.add(b(0.5, 0.17, 0.5, HAIR, [0, 0.5, -0.01], 0.08))
  head.add(b(0.5, 0.34, 0.14, HAIR, [0, 0.33, -0.2], 0.07))
  head.add(b(0.32, 0.12, 0.2, HAIR, [0.06, 0.6, 0.1], 0.05, { rz: 0.15 }))
  for (const s of [-1, 1]) {
    head.add(b(0.07, 0.24, 0.16, HAIR, [s * 0.24, 0.28, 0.02], 0.03))
    head.add(b(0.07, 0.07, 0.03, '#2a1a10', [s * 0.1, 0.33, 0.235], 0.02))
    head.add(b(0.12, 0.04, 0.03, HAIR, [s * 0.1, 0.4, 0.235], 0.015))
  }
  head.add(b(0.5, 0.28, 0.22, BEARD, [0, 0.08, 0.16], 0.1))
  head.add(b(0.34, 0.16, 0.2, BEARD, [0, -0.06, 0.18], 0.08))
  head.add(b(0.28, 0.07, 0.07, BEARD, [0, 0.19, 0.25], 0.03))
  head.add(b(0.09, 0.11, 0.09, SKIN, [0, 0.26, 0.25], 0.03))

  const arm = (side) => {
    const g = new THREE.Group()
    g.position.set(side * 0.43, 0.7, 0)
    g.add(b(0.23, 0.32, 0.25, SHIRT, [0, -0.12, 0], 0.08))
    g.add(b(0.24, 0.07, 0.26, SHIRT2, [0, -0.29, 0], 0.03))
    g.add(b(0.18, 0.32, 0.19, SKIN, [0, -0.46, 0], 0.07))
    g.add(b(0.17, 0.15, 0.17, SKIN, [0, -0.66, 0], 0.06))
    torso.add(g)
    return g
  }
  const armL = arm(1), armR = arm(-1)
  root.add(legL, legR, torso)
  return { root, legL, legR, armL, armR, torso, head }
}

/* ---------- dates (Datteln) ---------- */

export function buildDateCluster() {
  const fruits = [], stems = []
  const n = 7
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const y = (i % 2) * 0.22
    fruits.push(sphere(0.2, [Math.cos(a) * 0.24, y, Math.sin(a) * 0.24], [1, 1.6, 1], 2))
  }
  fruits.push(sphere(0.2, [0, 0.42, 0], [1, 1.6, 1], 2))
  stems.push(cyl(0.035, 0.05, 0.9, 6, [0, 0.75, 0]))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    stems.push(cyl(0.025, 0.025, 0.45, 5, [Math.cos(a) * 0.14, 0.45, Math.sin(a) * 0.14], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]))
  }
  return { fruit: mergeGeometries(fruits, false), stem: mergeGeometries(stems, false) }
}

/* ---------- world layout ---------- */

export const PALMS = [
  [-9.5, 10, 8.5, 0.18, 0.3], [-21, 9, 9.5, -0.2, 1.1], [-27, 4, 7, 0.25, 2.2],
  [11.5, 11, 9, -0.15, 0.7], [22, 7, 8, 0.22, 1.9], [29, -9, 10, 0.2, 3.1],
  [-30, -11, 9, -0.18, 4.2],
  [-33, 12, 7.5, 0.15, 2.7], [33, 4, 7, -0.2, 3.7], [13, -15, 8.5, 0.2, 1.4],
  [-45, 30, 8, 0.2, 6.1], [-52, 26, 9, -0.15, 2.4], [48, 28, 8.5, 0.18, 3.3]
]
export const CAMELS = [[-36, -40, 0.5], [-40.5, -43.5, 0.62], [-45, -46.5, 0.7]].map(([x, z, r]) => ({ x, z, r, y: heightAt(x, z) }))
