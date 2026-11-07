import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* ---------- tiny geometry toolkit ---------- */

function prep(g, flat = true) {
  g.deleteAttribute('uv')
  const n = g.index ? g.toNonIndexed() : g
  if (flat) n.computeVertexNormals()
  return n
}

function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  )
  return g.applyMatrix4(m)
}

/** box sitting on y (bottom at y) */
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) =>
  xf(prep(new THREE.BoxGeometry(w, h, d)), { p: [x, y + h / 2, z], r: [0, ry, 0] })

/** tapered square prism (pisé tower), bottom at y */
const taper = (wb, wt, h, x = 0, y = 0, z = 0) => {
  const g = new THREE.CylinderGeometry(wt / Math.SQRT2, wb / Math.SQRT2, h, 4, 1)
  g.rotateY(Math.PI / 4)
  return xf(prep(g), { p: [x, y + h / 2, z] })
}

const sphere = (r, p, s = [1, 1, 1], detail = 2) =>
  xf(prep(new THREE.IcosahedronGeometry(r, detail), false), { p, s })

const cyl = (rt, rb, h, seg, p, r = [0, 0, 0]) =>
  xf(prep(new THREE.CylinderGeometry(rt, rb, h, seg)), { p, r })

const merge = (arr) => mergeGeometries(arr, false)

/** group geometries by color, then merge → few draw calls */
function bucket() {
  const parts = {}
  const add = (color, ...gs) => (parts[color] ??= []).push(...gs)
  const done = () => Object.entries(parts).map(([color, gs]) => ({ color, geometry: merge(gs) }))
  return { add, done }
}

/* ---------- Ksar ---------- */

const C = {
  wall: '#d98550',
  tower: '#cf7643',
  house: '#de9358',
  house2: '#d27f4c',
  trim: '#a9542c',
  dark: '#3a1d0e',
  wood: '#7a4320',
  mina: '#e6a66d',
  tile: '#2e8f6c',
  white: '#f3e6d2'
}

/** little tapered merlons around a rectangle */
function merlons(add, color, w, d, y, cx, cz, step = 1.15, size = 0.55) {
  const nx = Math.max(2, Math.round(w / step))
  const nz = Math.max(2, Math.round(d / step))
  for (let i = 0; i <= nx; i++) {
    const x = cx - w / 2 + size / 2 + (i * (w - size)) / nx
    add(color, taper(size, size * 0.45, 0.75, x, y, cz - d / 2 + size / 2))
    add(color, taper(size, size * 0.45, 0.75, x, y, cz + d / 2 - size / 2))
  }
  for (let j = 1; j < nz; j++) {
    const z = cz - d / 2 + size / 2 + (j * (d - size)) / nz
    add(color, taper(size, size * 0.45, 0.75, cx - w / 2 + size / 2, y, z))
    add(color, taper(size, size * 0.45, 0.75, cx + w / 2 - size / 2, y, z))
  }
}

function arch(w, h, depth) {
  const r = w / 2
  const half = new THREE.CylinderGeometry(r, r, depth, 14, 1, false, 0, Math.PI)
  half.rotateX(Math.PI / 2)
  half.rotateZ(Math.PI / 2)
  half.translate(0, h, 0)
  return [prep(new THREE.BoxGeometry(w, h, depth)).translate(0, h / 2, 0), prep(half)]
}

function door(add, x, z, w = 1.4, h = 1.8, ry = 0, frame = true) {
  const place = (g) => xf(g, { p: [x, 0, z], r: [0, ry, 0] })
  arch(w, h, 0.3).forEach((g) => add(C.wood, place(g)))
  if (frame) arch(w * 1.35, h * 1.12, 0.18).forEach((g) => add(C.trim, place(g)))
}

/** windows on a face. face: 'front' (+z) | 'side' (+x) | 'left' (-x) */
function windows(add, cx, cz, halfW, halfD, ys, xs, face = 'front', ww = 0.45, wh = 0.7) {
  for (const y of ys)
    for (const o of xs) {
      if (face === 'front') add(C.dark, box(ww, wh, 0.14, cx + o, y, cz + halfD))
      if (face === 'back') add(C.dark, box(ww, wh, 0.14, cx + o, y, cz - halfD))
      if (face === 'side') add(C.dark, box(0.14, wh, ww, cx + halfW, y, cz + o))
      if (face === 'left') add(C.dark, box(0.14, wh, ww, cx - halfW, y, cz + o))
    }
}

function tower(add, x, z, wb = 3.6, wt = 2.8, h = 10.5) {
  add(C.tower, taper(wb, wt, h, x, 0, z))
  const wAt = (y) => wb - (wb - wt) * (y / h)
  // trim band + crown
  const yb = h * 0.68
  add(C.trim, box(wAt(yb) + 0.25, 0.3, wAt(yb) + 0.25, x, yb, z))
  add(C.tower, box(wt + 0.3, 0.35, wt + 0.3, x, h, z))
  merlons(add, C.tower, wt + 0.3, wt + 0.3, h + 0.35, x, z, 0.95, 0.5)
  // decorative slits on the 4 faces
  for (const y of [h * 0.76, h * 0.86]) {
    const hw = wAt(y) / 2
    for (const o of [-0.65, 0, 0.65]) {
      add(C.dark, box(0.22, 0.5, 0.3, x + o, y, z + hw))
      add(C.dark, box(0.22, 0.5, 0.3, x + o, y, z - hw))
      add(C.dark, box(0.3, 0.5, 0.22, x + hw, y, z + o))
      add(C.dark, box(0.3, 0.5, 0.22, x - hw, y, z + o))
    }
  }
  // a couple of small windows lower down
  const hw = wAt(4) / 2
  add(C.dark, box(0.4, 0.6, 0.3, x, 4, z + hw))
  add(C.dark, box(0.3, 0.6, 0.4, x + hw, 4, z))
  add(C.dark, box(0.3, 0.6, 0.4, x - hw, 4, z))
}

function house(add, { x, z, w, d, h, color = C.house, door: hasDoor = true, side = 'side' }) {
  add(color, box(w, h, d, x, 0, z))
  add(color, box(w + 0.25, 0.3, d + 0.25, x, h, z)) // parapet lip
  add(color, box(w + 0.25, 0.45, 0.3, x, h + 0.3, z + d / 2 - 0.02))
  add(color, box(w + 0.25, 0.45, 0.3, x, h + 0.3, z - d / 2 + 0.02))
  add(color, box(0.3, 0.45, d, x + w / 2 - 0.02, h + 0.3, z))
  add(color, box(0.3, 0.45, d, x - w / 2 + 0.02, h + 0.3, z))
  const cols = w > 5 ? [-w / 3, 0, w / 3] : [-w / 4, w / 4]
  const rows = h > 5 ? [1.6, h - 1.6] : [h - 1.8]
  windows(add, x, z, w / 2, d / 2, rows, cols.filter((c) => !hasDoor || Math.abs(c) > 0.6), 'front')
  windows(add, x, z, w / 2, d / 2, [h - 1.8], [-d / 4, d / 4], side)
  if (hasDoor) door(add, x, z + d / 2, 1.2, 1.6, 0, false)
}

export function buildKsar() {
  const { add, done } = bucket()

  // --- main kasbah (courtyard + 4 towers)
  const kx = 0, kz = -4, S = 16, H = 5.8, T = 0.9
  add(C.wall, box(S, H, T, kx, 0, kz + S / 2 - T / 2))
  add(C.wall, box(S, H, T, kx, 0, kz - S / 2 + T / 2))
  add(C.wall, box(T, H, S, kx + S / 2 - T / 2, 0, kz))
  add(C.wall, box(T, H, S, kx - S / 2 + T / 2, 0, kz))
  add(C.trim, box(S - 3.6, 0.25, 0.12, kx, H - 1.0, kz + S / 2)) // frieze
  merlons(add, C.wall, S - 3, S - 3, H, kx, kz, 1.2, 0.6)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(add, kx + dx * S / 2, kz + dz * S / 2)
  door(add, kx, kz + S / 2, 2.0, 2.6)
  windows(add, kx, kz, S / 2, S / 2, [3.6], [-4, 4], 'front', 0.5, 0.75)
  windows(add, kx, kz, S / 2, S / 2, [3.6], [-3.5, 0, 3.5], 'side', 0.5, 0.75)
  windows(add, kx, kz, S / 2, S / 2, [3.6], [-3.5, 0, 3.5], 'left', 0.5, 0.75)

  // inner keep peeking over the walls
  add(C.house2, box(7, 8.2, 6, kx - 1, 0, kz - 3.5))
  add(C.house2, box(7.3, 0.3, 6.3, kx - 1, 8.2, kz - 3.5))
  merlons(add, C.house2, 7.2, 6.2, 8.5, kx - 1, kz - 3.5, 1.1, 0.5)
  windows(add, kx - 1, kz - 3.5, 3.5, 3, [6.6], [-2, 0, 2], 'front')
  windows(add, kx - 1, kz - 3.5, 3.5, 3, [6.6], [-1.5, 1.5], 'side')

  // --- village houses
  const houses = [
    { x: -15.5, z: 3, w: 6.5, d: 5, h: 4.6, side: 'side' },
    { x: -13.5, z: -8, w: 5.5, d: 6, h: 6.2, color: C.house2, side: 'left', door: false },
    { x: 15, z: 3.5, w: 7, d: 5, h: 4.2, color: C.house2, side: 'side' },
    { x: 16.5, z: -7, w: 5, d: 5.5, h: 6.8, side: 'side', door: false },
    { x: -22.5, z: -2.5, w: 4.2, d: 4.2, h: 3.6, color: C.house2, side: 'left' },
    { x: 23, z: -1, w: 4.5, d: 5, h: 3.6, side: 'side' },
    { x: 6, z: -17, w: 6, d: 5, h: 5.2, color: C.house2, side: 'side', door: false },
    { x: -6, z: -18, w: 5, d: 4.5, h: 4.4, side: 'left', door: false }
  ]
  houses.forEach((h) => house(add, h))

  // --- minaret
  const mx = -10.5, mz = -16, mw = 2.8, mh = 14
  add(C.mina, box(mw, mh, mw, mx, 0, mz))
  add(C.tile, box(mw + 0.3, 0.6, mw + 0.3, mx, mh - 2.4, mz))
  add(C.mina, box(mw + 0.35, 0.35, mw + 0.35, mx, mh, mz))
  merlons(add, C.mina, mw + 0.35, mw + 0.35, mh + 0.35, mx, mz, 0.9, 0.45)
  add(C.mina, box(1.3, 2.0, 1.3, mx, mh + 0.35, mz))
  add(C.tile, taper(1.6, 0.2, 1.2, mx, mh + 2.35, mz))
  add('#e9c25a', cyl(0.05, 0.05, 1.0, 6, [mx, mh + 3.9, mz]))
  add('#e9c25a', sphere(0.17, [mx, mh + 4.0, mz], [1, 1, 1], 1))
  for (const y of [mh - 4.2, mh - 7.5]) {
    add(C.dark, box(0.45, 1.0, 0.14, mx, y, mz + mw / 2))
    add(C.dark, box(0.14, 1.0, 0.45, mx + mw / 2, y, mz))
  }

  // --- low garden walls
  add(C.wall, box(9, 1.3, 0.6, -12.5, 0, 9.5))
  add(C.wall, box(0.6, 1.3, 5, -17, 0, 7.2))
  add(C.wall, box(10, 1.3, 0.6, 17, 0, 9.2))
  add(C.wall, box(0.6, 1.3, 4.5, 22, 0, 7.2))

  return done()
}

/* ---------- Duster-ish SUV (≈4.3 m) ---------- */

function extrude(points, depth, bevel = 0.05) {
  const s = new THREE.Shape()
  s.moveTo(...points[0])
  points.slice(1).forEach((p) => s.lineTo(...p))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2
  })
  g.translate(0, 0, -depth / 2)
  return prep(g, false)
}

export function buildCar() {
  const { add, done } = bucket()
  const WHITE = '#f6f5ef', BLACK = '#2a2a2c', GLASS = '#2c3e52', SILVER = '#c7ccd3'

  // body side profile, front = +x
  add(WHITE, extrude([
    [-2.12, 0.34], [2.08, 0.34], [2.16, 0.62], [2.1, 0.94], [1.25, 1.08],
    [0.5, 1.6], [-1.85, 1.64], [-2.08, 1.5], [-2.14, 0.95]
  ], 1.7))

  // side glass band
  add(GLASS, extrude([[1.16, 1.12], [0.55, 1.54], [-1.8, 1.57], [-2.0, 1.45], [-2.04, 1.13]], 1.84, 0))
  // pillars over glass
  add(WHITE, box(0.12, 0.48, 1.88, -0.32, 1.1, 0))
  add(WHITE, box(0.2, 0.46, 1.88, -1.5, 1.11, 0))

  // windshield + rear glass
  const ws = new THREE.BoxGeometry(0.86, 0.04, 1.5)
  add(GLASS, xf(prep(ws), { p: [0.9, 1.39, 0], r: [0, 0, Math.atan2(0.52, -0.75) - Math.PI] }))
  add(GLASS, box(0.04, 0.32, 1.4, -2.19, 1.17, 0))

  // black plastic cladding & arches (Duster trademark)
  add(BLACK, box(4.34, 0.26, 1.86, 0, 0.3, 0))
  for (const x of [-1.33, 1.33]) add(BLACK, cyl(0.52, 0.52, 1.88, 18, [x, 0.4, 0], [Math.PI / 2, 0, 0]))

  // wheels
  for (const x of [-1.33, 1.33])
    for (const z of [-0.79, 0.79]) {
      add('#1b1b1d', cyl(0.36, 0.36, 0.27, 18, [x, 0.36, z], [Math.PI / 2, 0, 0]))
      add(SILVER, cyl(0.2, 0.2, 0.29, 10, [x, 0.36, z], [Math.PI / 2, 0, 0]))
    }

  // face
  add(BLACK, box(0.07, 0.24, 1.05, 2.15, 0.6, 0)) // grille
  add(SILVER, box(0.08, 0.05, 1.12, 2.16, 0.78, 0)) // chrome bar
  add(SILVER, box(0.1, 0.12, 0.9, 2.14, 0.3, 0)) // skid plate
  for (const z of [-0.62, 0.62]) {
    add('#fff4bf', box(0.07, 0.14, 0.34, 2.12, 0.8, z)) // headlights
    add('#d8342c', box(0.07, 0.24, 0.2, -2.16, 0.98, z * 1.12)) // tail lights
    add(WHITE, box(0.16, 0.13, 0.2, 1.05, 1.12, z * 1.6)) // mirrors
    add(BLACK, box(2.3, 0.06, 0.07, -0.65, 1.74, z * 1.13)) // roof rails
    add(BLACK, box(0.12, 0.09, 0.09, 0.4, 1.68, z * 1.13))
    add(BLACK, box(0.12, 0.09, 0.09, -1.7, 1.68, z * 1.13))
  }
  add(SILVER, box(0.08, 0.08, 0.6, -2.19, 0.62, 0)) // rear plate area

  return done()
}

/* ---------- palms ---------- */

export function buildPalm(h = 8, lean = 0.2, seed = 0) {
  const { add, done } = bucket()
  const n = 7
  let prev = new THREE.Vector3(0, 0, 0)
  const curve = (t) => new THREE.Vector3(lean * h * t * t, h * t, 0)
  for (let i = 0; i < n; i++) {
    const a = curve(i / n), b = curve((i + 1) / n)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const r = 0.34 - 0.13 * (i / n)
    const g = prep(new THREE.CylinderGeometry(r * 0.88, r, len * 1.02, 7))
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
    g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray())
    add(i % 2 ? '#8a5a32' : '#a0703f', g)
    prev = b
  }
  const top = prev
  const k = 9
  for (let i = 0; i < k; i++) {
    const g = new THREE.ConeGeometry(0.42, 3.6, 4, 1)
    g.rotateZ(-Math.PI / 2)
    g.scale(1, 0.18, 1)
    g.translate(1.8, 0, 0)
    g.rotateZ(-0.35 - 0.35 * Math.abs(Math.sin(i * 2.3 + seed)))
    g.rotateY((i / k) * Math.PI * 2 + seed)
    g.translate(top.x, top.y, top.z)
    add(i % 2 ? '#4f8f2c' : '#68a83a', prep(g))
  }
  add('#e08a2a', sphere(0.32, [top.x + 0.2, top.y - 0.4, 0.2], [1, 1, 1], 1))
  return done()
}

/* ---------- camels ---------- */

export function buildCamel() {
  const { add, done } = bucket()
  const FUR = '#c58e55'
  add(FUR, sphere(1, [0, 1.95, 0], [1.15, 0.55, 0.48]))
  add(FUR, sphere(0.5, [-0.05, 2.45, 0], [1, 0.9, 0.85]))
  add(FUR, cyl(0.15, 0.2, 1.1, 8, [1.05, 2.3, 0], [0, 0, -0.75]))
  add(FUR, sphere(0.3, [1.5, 2.75, 0], [1.4, 0.75, 0.75]))
  for (const [x, z] of [[-0.65, -0.22], [-0.65, 0.22], [0.65, -0.22], [0.65, 0.22]])
    add(FUR, cyl(0.08, 0.1, 1.7, 6, [x, 0.85, z]))
  add('#c8382f', box(0.75, 0.12, 1.0, -0.05, 2.32, 0))
  add('#f2c14e', box(0.78, 0.05, 1.02, -0.05, 2.28, 0))
  return done()
}

/* ---------- comic clouds ---------- */

export function buildCloud(seed = 1) {
  const gs = []
  const rnd = (i) => Math.abs(Math.sin(seed * 12.9 + i * 78.2)) % 1
  for (let i = 0; i < 6; i++) {
    const r = 5 + rnd(i) * 5
    gs.push(sphere(r, [(i - 2.5) * 6 + rnd(i + 9) * 3, rnd(i + 3) * 3, rnd(i + 5) * 6 - 3], [1, 0.75, 1], 2))
  }
  return [{ color: '#ffffff', geometry: merge(gs) }]
}

/* ---------- terrain: Erg Chebbi ---------- */

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const DUNES = [
  // the big one, with star-dune arms
  { x: 8, z: -165, h: 62, rx: 95, rz: 62, p: 1.45 },
  { x: 8, z: -165, h: 44, rx: 150, rz: 22, p: 1.3, rot: 0.55 },
  { x: 8, z: -165, h: 40, rx: 140, rz: 20, p: 1.3, rot: -0.7 },
  { x: 8, z: -165, h: 36, rx: 110, rz: 20, p: 1.3, rot: 1.6 },
  { x: -95, z: -130, h: 32, rx: 60, rz: 40, p: 1.5 },
  { x: 110, z: -125, h: 36, rx: 70, rz: 42, p: 1.5 },
  { x: -45, z: -88, h: 13, rx: 34, rz: 22, p: 1.6 },
  { x: 52, z: -84, h: 11, rx: 30, rz: 20, p: 1.6 },
  { x: -160, z: -60, h: 20, rx: 55, rz: 35, p: 1.5 },
  { x: 170, z: -45, h: 22, rx: 55, rz: 35, p: 1.5 },
  { x: -25, z: -240, h: 50, rx: 120, rz: 60, p: 1.4 },
  { x: 160, z: -230, h: 55, rx: 110, rz: 60, p: 1.4 },
  { x: -170, z: -210, h: 45, rx: 100, rz: 55, p: 1.4 }
]

export function heightAt(x, z) {
  let h = 0
  for (const d of DUNES) {
    let dx = x - d.x + 7 * Math.sin(z * 0.03 + d.x)
    let dz = z - d.z
    if (d.rot) {
      const c = Math.cos(d.rot), s = Math.sin(d.rot)
      ;[dx, dz] = [dx * c - dz * s, dx * s + dz * c]
    }
    const rz = dz > 0 ? d.rz * 0.85 : d.rz * 1.2 // steeper slip face toward the village
    const e = Math.sqrt((dx / d.rx) ** 2 + (dz / rz) ** 2)
    if (e < 1) h = Math.max(h, d.h * Math.pow(1 - e, d.p))
  }
  const r = Math.hypot(x, z + 4)
  const away = smooth(34, 80, r)
  const ripple =
    0.35 * Math.sin(x * 0.18 + Math.sin(z * 0.09) * 2) * Math.sin(z * 0.13) +
    1.6 * Math.sin(x * 0.035 + 1) * Math.sin(z * 0.04 + 2)
  return h + ripple * away - 0.05
}

export function buildTerrain() {
  const g = new THREE.PlaneGeometry(1000, 900, 300, 270)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, -150)
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const ground = new THREE.Color('#e7a868')
  const packed = new THREE.Color('#d39560')
  const dune = new THREE.Color('#f08e45')
  const crest = new THREE.Color('#f47a35')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, h)
    c.copy(packed).lerp(ground, smooth(22, 45, Math.hypot(x, z + 4)))
    c.lerp(dune, smooth(0.5, 14, h)).lerp(crest, smooth(20, 55, h))
    c.toArray(colors, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}
