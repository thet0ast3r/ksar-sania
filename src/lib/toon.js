import * as THREE from 'three'

// soft 3-step ramp → chunky cel look without outlines
const ramp = new Uint8Array([135, 200, 255])
export const gradientMap = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat)
gradientMap.minFilter = THREE.NearestFilter
gradientMap.magFilter = THREE.NearestFilter
gradientMap.generateMipmaps = false
gradientMap.needsUpdate = true

const cache = new Map()
export function toon(color, vertexColors = false) {
  const key = color + (vertexColors ? ':v' : '')
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap, vertexColors }))
  }
  return cache.get(key)
}

/** special colours whose emissive we drive at night */
export const GLOW = '#3b1e0f' // lit windows
export const LAMP = '#fff4c0' // headlights
