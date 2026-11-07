<script>
  import * as THREE from 'three'
  import { T, useThrelte } from '@threlte/core'
  import { OrbitControls } from '@threlte/extras'
  import Part from './Part.svelte'
  import { sunAt, palette } from './sun.js'
  import { buildKsar, buildCar, buildPalm, buildCamel, buildCloud, buildTerrain, heightAt } from './geo.js'

  let { hours, portrait = false } = $props()

  const { scene, invalidate } = useThrelte()

  /* ---------- static geometry (built once) ---------- */
  const terrain = buildTerrain()
  const ksar = buildKsar()
  const car = buildCar()
  const camel = buildCamel()

  const palms = [
    [-8.5, 9, 8.5, 0.18, 0.3], [-20, 8, 9.5, -0.2, 1.1], [-25, 3.5, 7, 0.25, 2.2],
    [10.5, 9.5, 9, -0.15, 0.7], [20, 6, 8, 0.22, 1.9], [27, -8, 10, 0.2, 3.1],
    [-28, -10, 9, -0.18, 4.2], [3, -1.5, 7.5, 0.12, 5.1], [-3.5, -6, 6.5, -0.15, 0.9],
    [-30, 10, 7.5, 0.15, 2.7], [31, 4, 7, -0.2, 3.7], [12, -13, 8.5, 0.2, 1.4]
  ].map(([x, z, h, lean, seed]) => ({ x, z, rot: seed * 1.7, parts: buildPalm(h, lean, seed) }))

  const camels = [
    [-34, -30, 0.5], [-38.5, -33.5, 0.62], [-43, -36.5, 0.7]
  ].map(([x, z, r]) => ({ x, z, r, y: heightAt(x, z) }))

  const clouds = [
    [-140, 95, -330, 1.3], [90, 110, -380, 2.1], [260, 80, -200, 3.7], [-280, 105, -150, 4.4], [30, 125, 260, 5.9]
  ].map(([x, y, z, s]) => ({ x, y, z, parts: buildCloud(s) }))

  /* ---------- lights / sky / fog ---------- */
  const sun = new THREE.DirectionalLight()
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 10, far: 800 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.12
  sun.target.position.set(0, 0, -45)

  const hemi = new THREE.HemisphereLight()
  scene.fog = new THREE.Fog('#ffffff', 180, 820)

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float t = pow(clamp(d.y / 0.65, 0.0, 1.0), 0.65);
        float band = floor(t * 7.0) / 7.0;          // poster-style banding
        t = mix(t, band, 0.55);
        vec3 c = mix(horizon, top, t);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 10.0) * 0.45 + pow(s, 120.0) * 0.4);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  })

  const diskMat = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false })
  const haloMat = new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false })
  const sunGroup = new THREE.Group()

  const info = $derived(sunAt(hours))
  const pal = $derived(palette(info.elDeg))

  $effect(() => {
    const { dir } = info
    const p = pal
    sun.position.copy(dir).multiplyScalar(350).add(sun.target.position)
    sun.color.copy(p.light)
    sun.intensity = p.lightI
    hemi.color.copy(p.hemiSky)
    hemi.groundColor.copy(p.hemiGround)
    hemi.intensity = p.hemiI
    scene.fog.color.copy(p.horizon)
    skyMat.uniforms.top.value.copy(p.top)
    skyMat.uniforms.horizon.value.copy(p.horizon)
    skyMat.uniforms.sunCol.value.copy(p.disk)
    skyMat.uniforms.sunDir.value.copy(dir)
    diskMat.color.copy(p.disk)
    haloMat.color.copy(p.disk)
    sunGroup.position.copy(dir).multiplyScalar(900)
    sunGroup.lookAt(0, 0, 0)
    invalidate()
  })

  const camPos = $derived(portrait ? [40, 14, 54] : [30, 10.5, 42])
  const fov = $derived(portrait ? 58 : 40)
</script>

<T.PerspectiveCamera makeDefault position={camPos} {fov} near={0.5} far={3000}>
  <OrbitControls
    target={portrait ? [0, 9, -8] : [0, 2.5, -8]}
    enableDamping
    maxPolarAngle={1.47}
    minDistance={10}
    maxDistance={120}
    enablePan={false}
  />
</T.PerspectiveCamera>

<T is={sun} />
<T is={sun.target} />
<T is={hemi} />

<!-- sky dome + sun disk -->
<T.Mesh material={skyMat} renderOrder={-10}>
  <T.SphereGeometry args={[1400, 32, 16]} />
</T.Mesh>
<T is={sunGroup}>
  <T.Mesh material={diskMat}>
    <T.CircleGeometry args={[30, 40]} />
  </T.Mesh>
  <T.Mesh position.z={-0.5}>
    <T.RingGeometry args={[29.5, 33, 40]} />
    <T.MeshBasicMaterial color="#2b140a" fog={false} />
  </T.Mesh>
  <T.Mesh material={haloMat} position.z={-1}>
    <T.CircleGeometry args={[52, 40]} />
  </T.Mesh>
</T>

<!-- desert -->
<Part geometry={terrain} vertexColors outline={0} />

<!-- ksar -->
{#each ksar as p}
  <Part geometry={p.geometry} color={p.color} outline={0.1} />
{/each}

{#each palms as palm}
  <T.Group position={[palm.x, 0, palm.z]} rotation.y={palm.rot}>
    {#each palm.parts as p}
      <Part geometry={p.geometry} color={p.color} outline={0.06} />
    {/each}
  </T.Group>
{/each}

{#each camels as c}
  <T.Group position={[c.x, c.y, c.z]} rotation.y={c.r}>
    {#each camel as p}
      <Part geometry={p.geometry} color={p.color} outline={0.05} />
    {/each}
  </T.Group>
{/each}

<!-- our rental: white Duster -->
<T.Group position={[3, 0, 18]} rotation.y={-0.3} scale={1.3}>
  {#each car as p}
    <Part geometry={p.geometry} color={p.color} outline={0.035} />
  {/each}
</T.Group>

{#each clouds as cl}
  <T.Group position={[cl.x, cl.y, cl.z]}>
    {#each cl.parts as p}
      <Part geometry={p.geometry} color={p.color} outline={0.9} castShadow={false} receiveShadow={false} />
    {/each}
  </T.Group>
{/each}
