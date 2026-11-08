<script>
  import * as THREE from 'three'
  import { T, useThrelte, useTask } from '@threlte/core'
  import { buildTerrainGeometries, heightAt, datePositions } from './terrain.js'
  import * as M from './models.js'
  import { Vehicle, CAR, QUAD, separate } from './vehicle.js'
  import { Player, lerpAngle } from './player.js'
  import { input, axes } from './input.svelte.js'
  import { hud, toast, blip } from './hud.svelte.js'
  import { createSky } from './sky.js'
  import { toon, GLOW, LAMP } from './toon.js'

  let { hours } = $props()
  const { scene } = useThrelte()

  /* ---------- world ---------- */
  const world = new THREE.Group()
  const { near, far } = buildTerrainGeometries()
  world.add(M.toMesh({ geometry: near, color: '#ffffff', vertexColors: true }))
  world.add(M.toMesh({ geometry: far, color: '#ffffff', vertexColors: true }, { cast: false }))

  const ksar = M.buildKsar()
  world.add(M.group(ksar.parts))
  const rects = ksar.rects
  const circles = []
  for (const [x, z, h, lean, seed] of M.PALMS) {
    const g = M.group(M.buildPalm(h, lean, seed))
    g.position.set(x, heightAt(x, z) - 0.1, z)
    g.rotation.y = seed * 1.7
    world.add(g)
    circles.push({ x, z, r: 0.8 })
  }
  const camelParts = M.buildCamel()
  for (const c of M.CAMELS) {
    const g = M.group(camelParts)
    g.position.set(c.x, c.y, c.z)
    g.rotation.y = c.r
    world.add(g)
    circles.push({ x: c.x, z: c.z, r: 1.5 })
  }
  for (const [x, y, z, s] of [[-160, 110, -380, 1.3], [90, 125, -430, 2.1], [280, 95, -220, 3.7], [-300, 120, -150, 4.4], [40, 140, 280, 5.9], [200, 115, 120, 7.1]]) {
    const g = M.group(M.buildCloud(s), { cast: false, receive: false })
    g.position.set(x, y, z)
    world.add(g)
  }

  /* ---------- vehicles ---------- */
  const car = new Vehicle(CAR, 6, 20, 0.35)
  const quad = new Vehicle(QUAD, -6, 22, 0.15)
  const vehicles = { car, quad }

  function vehicleView(cfg, bodyParts, wheelParts, lamp) {
    const root = new THREE.Group()
    const body = M.group(bodyParts)
    body.position.y = -cfg.comY
    root.add(body)
    const wheels = cfg.wheels.map(([x, z]) => {
      const steer = new THREE.Group()
      steer.position.set(x, cfg.attachY - cfg.rest, z)
      const spin = M.group(wheelParts)
      steer.add(spin)
      root.add(steer)
      return { steer, spin }
    })
    const lights = lamp.z.map((z) => {
      const s = new THREE.SpotLight('#ffe7a8', 0, 60, 0.55, 0.65, 1.1)
      s.position.set(lamp.x, lamp.y - cfg.comY, z)
      s.target.position.set(lamp.x + 15, lamp.y - cfg.comY - 2.2, z * 3)
      root.add(s, s.target)
      return s
    })
    return { root, body, wheels, lights }
  }
  const views = {
    car: vehicleView(CAR, M.buildCarParts(), M.buildWheelParts(0.42, 0.34), { x: 2.25, y: 0.72, z: [-0.63, 0.63] }),
    quad: vehicleView(QUAD, M.buildQuadParts(), M.buildWheelParts(0.34, 0.3), { x: 1.1, y: 0.66, z: [0] })
  }
  world.add(views.car.root, views.quad.root)

  /* ---------- player ---------- */
  const player = new Player(0, 27, Math.PI)
  const rig = M.buildAdventurer()
  world.add(rig.root)

  /* ---------- dates ---------- */
  const dates = datePositions(30)
  const N = dates.length
  hud.total = N
  const dg = M.buildDateCluster()
  const fruitIM = new THREE.InstancedMesh(dg.fruit, toon('#8a3a12'), N)
  const stemIM = new THREE.InstancedMesh(dg.stem, toon('#d8a640'), N)
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 18, 10, 1, true)
  beamGeo.translate(0, 9, 0)
  const beamIM = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), N)
  for (const im of [fruitIM, stemIM, beamIM]) im.frustumCulled = false
  fruitIM.castShadow = true
  const collected = new Array(N).fill(false)
  const pop = new Array(N).fill(0)

  /* ---------- lights / sky / camera ---------- */
  const light = new THREE.DirectionalLight()
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  Object.assign(light.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 600 })
  light.shadow.camera.updateProjectionMatrix()
  light.shadow.bias = -0.0005
  light.shadow.normalBias = 0.08
  const hemi = new THREE.HemisphereLight()
  scene.fog = new THREE.Fog('#ffffff', 170, 780)
  const sky = createSky()

  const cam = new THREE.PerspectiveCamera(55, 1, 0.3, 3000)
  let camYaw = 0.55, camPitch = 0.34, zoom = 1, lastDrag = -10
  const focus = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0))
  const tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), fv = new THREE.Vector3()
  const mtx = new THREE.Matrix4(), qy = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3()
  const Y = new THREE.Vector3(0, 1, 0)

  /* ---------- mode switching ---------- */
  let mode = 'foot'
  function pose(seated) {
    rig.legL.rotation.set(seated ? -1.25 : 0, 0, seated ? 0.18 : 0)
    rig.legR.rotation.set(seated ? -1.25 : 0, 0, seated ? -0.18 : 0)
    rig.armL.rotation.set(seated ? -1.15 : 0, 0, 0)
    rig.armR.rotation.set(seated ? -1.15 : 0, 0, 0)
    rig.torso.position.y = 0.95
    rig.torso.rotation.x = seated ? 0.15 : 0
  }
  function enter(name) {
    mode = name
    hud.mode = name
    hud.near = null
    if (name === 'quad') {
      views.quad.body.add(rig.root)
      rig.root.position.set(-0.3, 0.05, 0)
      rig.root.rotation.set(0, Math.PI / 2, 0)
      pose(true)
    } else rig.root.visible = false
    toast(name === 'car' ? 'Duster time 🚙' : 'Quad time 🏍️', 1200)
  }
  function exit() {
    const v = vehicles[mode]
    const f = v.forward(fv)
    const right = tmp.set(0, 0, 1).applyQuaternion(v.q)
    const off = v.cfg.dims[2] / 2 + 0.9
    const px = v.pos.x - right.x * off, pz = v.pos.z - right.z * off
    player.pos.set(px, heightAt(px, pz), pz)
    player.vel.set(0, 0, 0)
    player.vy = 0
    player.yaw = Math.atan2(f.x, f.z)
    world.add(rig.root)
    rig.root.visible = true
    rig.root.rotation.set(0, 0, 0)
    pose(false)
    mode = 'foot'
    hud.mode = 'foot'
  }

  if (typeof window !== 'undefined') window.__ksar = { enter: (n) => enter(n), exit: () => exit(), car, quad, player, dates, setCam: (y, p) => { camYaw = y; camPitch = p } }

  const IDLE = { throttle: 0, steer: 0, handbrake: false }
  let t = 0, frame = 0

  useTask((delta) => {
    const dt = Math.min(delta, 1 / 30)
    t += dt
    frame++
    const ax = axes()
    const active = mode === 'foot' ? null : vehicles[mode]

    // camera input
    if (input.camDX || input.camDY) lastDrag = t
    camYaw -= input.camDX * 0.006
    camPitch = Math.min(1.2, Math.max(0.05, camPitch + input.camDY * 0.004))
    zoom = Math.min(2.6, Math.max(0.55, zoom * (1 + input.zoom * 0.0015)))
    input.camDX = input.camDY = input.zoom = 0

    // actions
    if (input.action) {
      input.action = false
      if (mode === 'foot') { if (hud.near) enter(hud.near) }
      else if (Math.abs(active.speed) < 7) exit()
      else toast('Slow down to hop out')
    }
    if (input.reset) {
      input.reset = false
      if (active) active.reset()
    }

    // player
    if (mode === 'foot') {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw)
      player.update(dt, fx * ax.y - fz * ax.x, fz * ax.y + fx * ax.x, input.jump, rects, circles, [car, quad])
    }
    input.jump = false

    // vehicles
    for (const k of ['car', 'quad']) {
      const v = vehicles[k]
      const flipped = v.step(dt, v === active ? { throttle: ax.y, steer: ax.x, handbrake: ax.hand } : IDLE)
      if (flipped && v === active) toast('Flipped back! 🙃', 1200)
      v.collide(rects, circles)
    }
    separate(car, quad)

    // proximity
    if (mode === 'foot') {
      let best = null, bd = Infinity
      for (const k of ['car', 'quad']) {
        const v = vehicles[k]
        const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) - v.cfg.bodyR
        if (d < 1.4 && d < bd) { bd = d; best = k }
      }
      if (hud.near !== best) hud.near = best
    }

    // dates
    const cp = active ? active.pos : player.pos
    const cr = mode === 'car' ? 3.4 : mode === 'quad' ? 2.8 : 1.8
    let nd = Infinity, ni = -1
    for (let i = 0; i < N; i++) {
      const p = dates[i]
      let s = 1.6, y = p.y + Math.sin(t * 2.2 + i) * 0.25
      if (!collected[i]) {
        const d = Math.hypot(p.x - cp.x, p.z - cp.z)
        if (d < cr && Math.abs(p.y - 1.4 - (cp.y - (active ? active.cfg.comY : 0))) < 3.5) {
          collected[i] = true
          hud.dates++
          blip(620 + hud.dates * 18)
          toast(hud.dates === N ? 'Alle Datteln gesammelt! 🎉' : `+1 Dattel · ${hud.dates}/${N}`, hud.dates === N ? 5000 : 1300)
        } else if (d < nd) { nd = d; ni = i }
      }
      if (collected[i]) {
        if (pop[i] < 0.45) { pop[i] += dt; s = 1.6 * (1 + pop[i]) * (1 - pop[i] / 0.45); y += pop[i] * 9 }
        else s = 0
      }
      qy.setFromAxisAngle(Y, t * 1.4 + i)
      mtx.compose(ps.set(p.x, y, p.z), qy, sc.setScalar(s))
      fruitIM.setMatrixAt(i, mtx)
      stemIM.setMatrixAt(i, mtx)
      mtx.compose(ps.set(p.x, p.y - 1.6, p.z), qy.identity(), sc.setScalar(collected[i] ? 0 : 1))
      beamIM.setMatrixAt(i, mtx)
    }
    fruitIM.instanceMatrix.needsUpdate = stemIM.instanceMatrix.needsUpdate = beamIM.instanceMatrix.needsUpdate = true

    // vehicle visuals
    for (const k of ['car', 'quad']) {
      const v = vehicles[k], view = views[k]
      view.root.position.copy(v.pos)
      view.root.quaternion.copy(v.q)
      v.wheels.forEach((wh, i) => {
        const W = view.wheels[i]
        W.steer.position.y = v.cfg.attachY - wh.susp
        W.steer.rotation.y = wh.front ? v.steer : 0
        W.spin.rotation.z = -wh.spin
      })
    }

    // player visuals
    if (mode === 'foot') {
      rig.root.position.copy(player.pos)
      rig.root.rotation.y = player.yaw
      const s = player.moving, sw = Math.sin(player.phase) * 0.8 * s
      if (player.onGround) {
        rig.legL.rotation.x = sw
        rig.legR.rotation.x = -sw
      } else {
        rig.legL.rotation.x = -0.6
        rig.legR.rotation.x = 0.35
      }
      rig.armL.rotation.x = -sw * 0.8
      rig.armR.rotation.x = sw * 0.8
      rig.torso.position.y = 0.95 + Math.abs(Math.cos(player.phase)) * 0.06 * s + Math.sin(t * 2) * 0.008
      rig.head.rotation.y = Math.sin(t * 0.5) * 0.15 * (1 - s)
    } else if (mode === 'quad') {
      rig.torso.rotation.z = -quad.steer * 0.4
    }

    // camera
    if (active) tgt.copy(active.pos).y += 1.0
    else tgt.copy(player.pos).y += 1.5
    focus.lerp(tgt, 1 - Math.exp(-dt * 12))
    if (active && t - lastDrag > 1.2 && Math.abs(active.speed) > 1.5) {
      const f = active.forward(fv)
      const behind = Math.atan2(-f.x, -f.z) + (active.speed < -1 ? Math.PI : 0)
      camYaw = lerpAngle(camYaw, behind, 1 - Math.exp(-dt * 2.5))
    }
    const dist = (mode === 'car' ? 10 : mode === 'quad' ? 7.5 : 6.5) * zoom * (cam.aspect < 0.9 ? 1.35 : 1)
    cam.position.set(
      focus.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
      focus.y + Math.sin(camPitch) * dist,
      focus.z + Math.cos(camYaw) * Math.cos(camPitch) * dist
    )
    const gy = heightAt(cam.position.x, cam.position.z) + 1.0
    if (cam.position.y < gy) cam.position.y = gy
    cam.lookAt(focus)
    const fov = cam.aspect < 0.9 ? 68 : 55
    if (cam.fov !== fov) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    // sky & lights
    const env = sky.update(hours, cam.position)
    const pal = env.palette
    light.color.copy(env.lightColor)
    light.intensity = env.lightI
    light.target.position.copy(focus)
    light.position.copy(env.lightDir).multiplyScalar(260).add(focus)
    hemi.color.copy(pal.hemiSky)
    hemi.groundColor.copy(pal.hemiGround)
    hemi.intensity = pal.hemiI
    scene.fog.color.copy(pal.horizon)
    toon(GLOW).emissive.setRGB(1, 0.55, 0.2).multiplyScalar(env.night * 0.85)
    toon(LAMP).emissive.setRGB(1, 0.95, 0.7).multiplyScalar(env.night)
    for (const k of ['car', 'quad']) for (const s of views[k].lights) s.intensity = env.night * (k === 'car' ? 30 : 22)

    // hud (throttled)
    if (frame % 4 === 0) {
      hud.speed = active ? Math.round(Math.abs(active.speed) * 3.6) : 0
      if (ni >= 0) {
        const p = dates[ni]
        const ff = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw))
        const ft = Math.atan2(p.x - cp.x, p.z - cp.z)
        hud.nearestDist = Math.round(nd)
        hud.nearestAngle = ((ff - ft) * 180) / Math.PI
      } else hud.nearestDist = -1
    }
  })
</script>

<T is={cam} makeDefault />
<T is={light} />
<T is={light.target} />
<T is={hemi} />
<T is={sky.group} />
<T is={world} />
<T is={fruitIM} />
<T is={stemIM} />
<T is={beamIM} />
