import * as THREE from 'three'

const D = Math.PI / 180
// Merzouga ≈ 31.1°N, early November (declination ≈ −16°)
const LAT = 31.1 * D
const DEC = -16.3 * D

/**
 * Sun direction for a solar clock time (hours).
 * World axes: −z = east (dune side), +x = south, +z = west, −x = north.
 */
export function sunAt(hours) {
  const H = (hours - 12) * 15 * D
  const sinEl = Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H)
  const el = Math.asin(sinEl)
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(DEC) * Math.cos(LAT)) + Math.PI
  const n = Math.cos(az) * Math.cos(el)
  const e = Math.sin(az) * Math.cos(el)
  return { dir: new THREE.Vector3(-n, sinEl, -e).normalize(), elDeg: el / D, azDeg: az / D }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const col = (a, b, c, t1, t2) => new THREE.Color(a).lerp(new THREE.Color(b), t1).lerp(new THREE.Color(c), t2)

export function palette(el) {
  const dawn = smooth(-5, 5, el) // twilight → risen
  const day = smooth(5, 32, el) // golden → full day
  return {
    top: col('#20265a', '#3b4fa0', '#2f86de', dawn, day),
    horizon: col('#7a4a7e', '#ff8c4f', '#b4e0f2', dawn, day),
    light: col('#ff4f1c', '#ffa65e', '#fff2dd', smooth(-1, 9, el), day),
    lightI: 2.2 * smooth(-1.5, 4, el) + 0.4 * day,
    hemiSky: col('#5a5fa0', '#ffb08a', '#cfe6ff', dawn, day),
    hemiGround: col('#5a3348', '#c96a3a', '#e3a46c', dawn, day),
    hemiI: 0.75 + 0.25 * day,
    disk: col('#ff4a1a', '#ffb347', '#fff8e3', smooth(-2, 12, el), day)
  }
}

export function fmt(hours) {
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function phase(hours, el) {
  if (el < -0.8) return hours < 12 ? 'Before sunrise' : 'Blue hour'
  if (el < 7) return hours < 12 ? 'Sunrise' : 'Sunset glow'
  if (el < 18) return hours < 12 ? 'Golden morning' : 'Golden hour'
  if (el < 34) return hours < 12 ? 'Morning' : 'Afternoon'
  return 'Midday'
}
