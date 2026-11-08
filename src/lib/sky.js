import * as THREE from 'three'
import { smooth } from './terrain.js'

const D = Math.PI / 180
const LAT = 31.1 * D // Merzouga

/** direction of a body with declination `dec` at clock hour (solar time ≈ local). −z east, +x south */
function bodyAt(hours, decDeg) {
  const dec = decDeg * D
  const H = (hours - 12) * 15 * D
  const sinEl = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H)
  const el = Math.asin(sinEl)
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT)) + Math.PI
  const n = Math.cos(az) * Math.cos(el), e = Math.sin(az) * Math.cos(el)
  return { dir: new THREE.Vector3(-n, sinEl, -e).normalize(), elDeg: el / D }
}
export const sunAt = (h) => bodyAt(h, -16.3) // early November
export const moonAt = (h) => bodyAt(h - 12.6, 14) // roughly opposite the sun

const col = (cs, ts) => {
  const c = new THREE.Color(cs[0])
  for (let i = 0; i < ts.length; i++) c.lerp(new THREE.Color(cs[i + 1]), ts[i])
  return c
}

export function palette(el) {
  const ts = [smooth(-14, -3, el), smooth(-3, 6, el), smooth(6, 32, el)]
  return {
    top: col(['#060a22', '#262a62', '#3b4fa0', '#2f86de'], ts),
    horizon: col(['#141c40', '#8a4f7e', '#ff8c4f', '#b4e0f2'], ts),
    hemiSky: col(['#3a4c96', '#6a5fa0', '#ffb08a', '#cfe6ff'], ts),
    hemiGround: col(['#2a2440', '#5a3348', '#c96a3a', '#e3a46c'], ts),
    hemiI: 0.7 + 0.05 * ts[0] + 0.0 * ts[1] + 0.3 * ts[2],
    sunCol: col(['#ff4f1c', '#ff4f1c', '#ffa65e', '#fff2dd'], [0, smooth(-1, 9, el), ts[2]]),
    sunI: 2.0 * smooth(-1.5, 4, el) + 0.45 * ts[2],
    disk: col(['#ff4a1a', '#ff4a1a', '#ffb347', '#fff8e3'], [0, smooth(-2, 12, el), ts[2]]),
    night: 1 - smooth(-12, -2, el)
  }
}

export function fmt(hours) {
  const h = ((Math.floor(hours) % 24) + 24) % 24
  const m = Math.floor((hours - Math.floor(hours)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function phase(hours, el) {
  const am = hours % 24 < 12
  if (el < -12) return 'Night'
  if (el < -0.8) return am ? 'Dawn' : 'Dusk'
  if (el < 7) return am ? 'Sunrise' : 'Sunset'
  if (el < 18) return am ? 'Golden morning' : 'Golden hour'
  if (el < 34) return am ? 'Morning' : 'Afternoon'
  return 'Midday'
}

/* ---------- sky objects ---------- */

export function createSky() {
  const group = new THREE.Group()
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float t = pow(clamp(d.y / 0.65, 0.0, 1.0), 0.65);
        t = mix(t, floor(t * 7.0) / 7.0, 0.5);
        vec3 c = mix(horizon, top, t);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 10.0) * 0.45 + pow(s, 120.0) * 0.4);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat)
  dome.renderOrder = -10
  dome.frustumCulled = false
  group.add(dome)

  // stars
  const N = 1400, pts = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const u = Math.random(), a = Math.random() * Math.PI * 2
    const y = 0.04 + u * 0.96
    const r = Math.sqrt(1 - y * y)
    pts.set([Math.cos(a) * r * 1300, y * 1300, Math.sin(a) * r * 1300], i * 3)
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  const starMat = new THREE.PointsMaterial({ color: '#fff8e8', size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false })
  const stars = new THREE.Points(sg, starMat)
  stars.frustumCulled = false
  group.add(stars)

  // sun
  const diskMat = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false })
  const haloMat = new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false })
  const sun = new THREE.Group()
  sun.add(new THREE.Mesh(new THREE.CircleGeometry(30, 40), diskMat))
  const halo = new THREE.Mesh(new THREE.CircleGeometry(52, 40), haloMat)
  halo.position.z = -1
  sun.add(halo)
  group.add(sun)

  // moon (chunky, with craters)
  const moon = new THREE.Group()
  const moonMat = new THREE.MeshBasicMaterial({ color: '#f3efd8', fog: false, toneMapped: false, transparent: true })
  const craterMat = new THREE.MeshBasicMaterial({ color: '#cfc8ad', fog: false, toneMapped: false, transparent: true })
  const moonHalo = new THREE.MeshBasicMaterial({ color: '#9fb4ff', fog: false, transparent: true, opacity: 0.15, depthWrite: false })
  moon.add(new THREE.Mesh(new THREE.CircleGeometry(22, 40), moonMat))
  for (const [x, y, r] of [[-7, 5, 5], [6, -4, 4], [4, 9, 2.5], [-3, -10, 3]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(r, 20), craterMat)
    c.position.set(x, y, 0.5)
    moon.add(c)
  }
  const mh = new THREE.Mesh(new THREE.CircleGeometry(40, 40), moonHalo)
  mh.position.z = -1
  moon.add(mh)
  group.add(moon)

  const tmp = new THREE.Vector3()
  const nightLight = new THREE.Color('#9fb2ff')

  function update(hours, camPos) {
    const s = sunAt(hours), m = moonAt(hours)
    const p = palette(s.elDeg)
    group.position.copy(camPos)
    skyMat.uniforms.top.value.copy(p.top)
    skyMat.uniforms.horizon.value.copy(p.horizon)
    skyMat.uniforms.sunCol.value.copy(p.disk).multiplyScalar(1 - p.night)
    skyMat.uniforms.sunDir.value.copy(s.dir)
    diskMat.color.copy(p.disk)
    haloMat.color.copy(p.disk)
    sun.position.copy(s.dir).multiplyScalar(900)
    sun.lookAt(tmp.set(0, 0, 0))
    sun.visible = s.elDeg > -3
    moon.position.copy(m.dir).multiplyScalar(900)
    moon.lookAt(tmp.set(0, 0, 0))
    const moonVis = smooth(-2, 4, m.elDeg) * (0.35 + 0.65 * p.night)
    moon.visible = moonVis > 0.01
    moonMat.opacity = craterMat.opacity = moonVis
    starMat.opacity = p.night

    const moonI = 0.75 * p.night * smooth(-2, 10, m.elDeg)
    const useSun = p.sunI >= moonI
    return {
      palette: p,
      sunEl: s.elDeg,
      night: p.night,
      lightDir: useSun ? s.dir : m.dir,
      lightColor: useSun ? p.sunCol : nightLight,
      lightI: useSun ? p.sunI : moonI
    }
  }

  return { group, update }
}
