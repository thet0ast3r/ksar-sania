import * as THREE from 'three'

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** playable area (soft walls) — −z is east (Erg Chebbi), +z west (hamada) */
export const BOUNDS = { x0: -270, x1: 270, z0: -470, z1: 140 }

/** asymmetric dune profile: gentle windward climb, steep slip face → jumps */
function ridge(u, a) {
  const p = u - Math.floor(u)
  const f = p < a ? p / a : (1 - p) / (1 - a)
  return f * f * (3 - 2 * f) * 0.6 + f * 0.4
}

/** erg mask: 0 near village / west, 1 deep in the dunes (east) */
export const ergAt = (x, z) => smooth(-25, -115, z + 10 * Math.sin(x * 0.012))

export function heightAt(x, z) {
  const village = smooth(36, 72, Math.hypot(x, z + 2))
  const erg = ergAt(x, z)

  const wx = x + 18 * Math.sin(z * 0.017) + 7 * Math.sin(z * 0.043 + 1.3)
  const wz = z + 14 * Math.sin(x * 0.019 + 0.7) + 5 * Math.sin(x * 0.051)

  const amp1 = 9.5 + 4.5 * Math.sin(wx * 0.013 + 0.4)
  const r1 = ridge(wz / 74, 0.3) * amp1
  const r2 = ridge((wx * 0.6 + wz * 0.8) / 46, 0.35) * 3.2
  let dunes = (r1 + r2) * (0.18 + 0.82 * erg) * village

  // the big star dune landmark (still climbable with momentum)
  const bx = (x - 25) / 175, bz = (z + 345) / 140
  const e2 = bx * bx + bz * bz
  if (e2 < 1) {
    const e = Math.sqrt(e2)
    const big = 68 * (0.7 * (1 - e2) * (1 - e2) + 0.3 * (1 - e) * (1 - e))
    dunes = Math.max(dunes, big + dunes * 0.3)
  }

  const rip = 0.12 * Math.sin(x * 0.7 + Math.sin(z * 0.3) * 2) * Math.sin(z * 0.55)
  return dunes + rip * village - 0.05
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.6
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z)
  const hd = heightAt(x, z - e), hu = heightAt(x, z + e)
  return out.set(hl - hr, 2 * e, hd - hu).normalize()
}

/* ---------- visual mesh ---------- */

const C = {
  packed: new THREE.Color('#d6955c'),
  hamada: new THREE.Color('#dba56d'),
  stone: new THREE.Color('#c08a5b'),
  sand: new THREE.Color('#eea25b'),
  dune: new THREE.Color('#f28a41'),
  crest: new THREE.Color('#f47335')
}

function colorAt(x, z, h, c) {
  const r = Math.hypot(x, z + 2)
  const erg = ergAt(x, z)
  c.copy(C.packed).lerp(C.hamada, smooth(25, 50, r))
  const spots = Math.sin(x * 0.21) * Math.sin(z * 0.17 + Math.sin(x * 0.05) * 3)
  c.lerp(C.stone, (1 - erg) * smooth(0.55, 0.9, spots) * smooth(40, 70, r) * 0.7)
  c.lerp(C.sand, erg)
  c.lerp(C.dune, smooth(3, 14, h)).lerp(C.crest, smooth(22, 60, h))
  return c
}

function makePlane(w, d, sx, sz, cz, heightFn) {
  const g = new THREE.PlaneGeometry(w, d, sx, sz)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, cz)
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, heightFn(x, z, h))
    colorAt(x, z, h, c).toArray(colors, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

export function buildTerrainGeometries() {
  const cz = (BOUNDS.z0 + BOUNDS.z1) / 2
  const W = BOUNDS.x1 - BOUNDS.x0 + 60
  const D = BOUNDS.z1 - BOUNDS.z0 + 60
  const near = makePlane(W, D, Math.round(W / 2), Math.round(D / 2), cz, (x, z, h) => h)
  const inside = (x, z) =>
    Math.abs(x) < W / 2 - 25 && z > cz - D / 2 + 25 && z < cz + D / 2 - 25
  const far = makePlane(3200, 3200, 160, 160, cz, (x, z, h) => (inside(x, z) ? h - 30 : h - 0.3))
  return { near, far }
}

/* ---------- date pickups ---------- */

function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function datePositions(n = 30) {
  const r = rng(42)
  const out = []
  // a few easy ones right at the first dunes
  const easy = [[-12, -58], [18, -66], [-40, -80]]
  for (const [x, z] of easy) out.push(new THREE.Vector3(x, heightAt(x, z) + 1.4, z))
  let guard = 0
  while (out.length < n && guard++ < 5000) {
    const x = BOUNDS.x0 + 25 + r() * (BOUNDS.x1 - BOUNDS.x0 - 50)
    const z = -70 - r() * 330
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 30)) continue
    const h = heightAt(x, z)
    // prefer crests a bit: reject some low spots
    if (h < 4 && r() < 0.6) continue
    out.push(new THREE.Vector3(x, h + 1.4, z))
  }
  return out
}
