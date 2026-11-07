import * as THREE from 'three'

// 3-step ramp = the "comic" cel-shading look
const ramp = new Uint8Array([105, 185, 255])
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
