<script>
  import * as THREE from 'three'
  import { T, useThrelte, useTask } from '@threlte/core'
  import { buildTerrainGeometries, heightAt, datePositions } from './terrain.js'
  import * as M from './models.js'
  import { Vehicle, CAR, QUAD, SUV, separate } from './vehicle.js'
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
  const { rects, vrects, prects, platforms } = ksar
  const circles = [...ksar.circles]
  const vSolids = [...rects, ...vrects]

  for (const [x, z, h, lean, seed] of M.PALMS) {
    const g = M.group(M.buildPalm(h, lean, seed))
    g.position.set(x, heightAt(x, z) - 0.1, z)
    g.rotation.y = seed * 1.7
    world.add(g)
    circles.push({ x, z, r: 0.8 })
  }
  // the climbable palm in the courtyard
  const CP = M.CLIMB_PALM
  let climbPalmMats = []
  let palmFade = 1
  {
    const g = M.group(M.buildPalm(CP.h, 0, 2.0))
    g.position.set(CP.x, heightAt(CP.x, CP.z) - 0.1, CP.z)
    g.traverse((m) => m.isMesh && (m.material = m.material.clone()))
    world.add(g)
    climbPalmMats = []
    g.traverse((m) => m.isMesh && climbPalmMats.push(m.material))
    circles.push({ x: CP.x, z: CP.z, r: 0.75 })
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
  const VK = ['car', 'quad', 'suv']
  const vehicles = {
    car: new Vehicle(CAR, 6, 20, 0.35),
    quad: new Vehicle(QUAD, -6, 22, 0.15),
    suv: new Vehicle(SUV, 16.5, 23.5, 0.55)
  }

  function vehicleView(cfg, bodyParts, wheelParts, lamp) {
    const root = new THREE.Group()
    const body = M.group(bodyParts)
    body.position.y = -cfg.comY
    root.add(body)
    const wheels = cfg.wheels.map(([x, z]) => {
      const steer = new THREE.Group()
      steer.position.set(x, cfg.attachY - cfg.rest, z)
      const spin = M.group(wheelParts)
      if (z < 0) spin.rotation.x = Math.PI // rims face outward on both sides
      const holder = new THREE.Group()
      holder.add(spin)
      steer.add(holder)
      root.add(steer)
      return { steer, spin: holder, flip: z < 0 }
    })
    const lights = lamp.z.map((z) => {
      const s = new THREE.SpotLight('#ffe7a8', 0, 65, 0.55, 0.65, 1.1)
      s.position.set(lamp.x, lamp.y - cfg.comY, z)
      s.target.position.set(lamp.x + 15, lamp.y - cfg.comY - 2.2, z * 3)
      root.add(s, s.target)
      return s
    })
    world.add(root)
    return { root, body, wheels, lights }
  }
  const views = {
    car: vehicleView(CAR, M.buildCarParts(), M.buildWheelParts(0.42, 0.34), { x: 2.25, y: 0.72, z: [-0.63, 0.63] }),
    quad: vehicleView(QUAD, M.buildQuadParts(), M.buildWheelParts(0.34, 0.3), { x: 1.1, y: 0.66, z: [0] }),
    suv: vehicleView(SUV, M.buildSuvParts(), M.buildWheelParts(0.46, 0.36, { rimR: 0.66, spokes: 5 }), { x: 2.4, y: 0.84, z: [-0.66, 0.66] })
  }

  /* ---------- player ---------- */
  const player = new Player(0, 30, Math.PI)
  const rig = M.buildAdventurer()
  world.add(rig.root)

  /* ---------- dates ---------- */
  const climbBase = heightAt(CP.x, CP.z)
  const crown = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + 0.3
    return new THREE.Vector3(CP.x + Math.cos(a) * 1.05, climbBase + CP.h - 1.0, CP.z + Math.sin(a) * 1.05)
  })
  const dates = [...datePositions(30), ...ksar.rampartDates, ...crown]
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

  /* ---------- tyre tracks + dust ---------- */
  const TRK = 1800
  const trackIM = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#6e3a1c', transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    TRK
  )
  trackIM.frustumCulled = false
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < TRK; i++) trackIM.setMatrixAt(i, zero)
  let trackHead = 0
  const lastMark = Object.fromEntries(VK.map((k) => [k, [null, null, null, null]]))

  const DN = 200
  const dustIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), toon('#e8b47c'), DN)
  dustIM.frustumCulled = false
  const dust = Array.from({ length: DN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 1, max: 1, size: 0 }))
  let dustHead = 0
  const dustAcc = Object.fromEntries(VK.map((k) => [k, 0]))

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
  let camYaw = 0.45, camPitch = 0.32, zoom = 1, lastDrag = -10, camDist = 6.5
  const focus = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0))
  const tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fv = new THREE.Vector3()
  const mtx = new THREE.Matrix4(), qy = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3()
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3()
  const Y = new THREE.Vector3(0, 1, 0)

  /** first hit distance of a ray against building boxes (for camera collision) */
  function rayHit(o, d, maxT) {
    let best = maxT
    for (const b of rects) {
      let t0 = 0, t1 = best, ok = true
      const mins = [b.x - b.hw, -1, b.z - b.hd], maxs = [b.x + b.hw, b.h, b.z + b.hd]
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z]
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(dd[i]) < 1e-6) { if (oo[i] < mins[i] || oo[i] > maxs[i]) ok = false; continue }
        let ta = (mins[i] - oo[i]) / dd[i], tb = (maxs[i] - oo[i]) / dd[i]
        if (ta > tb) [ta, tb] = [tb, ta]
        t0 = Math.max(t0, ta)
        t1 = Math.min(t1, tb)
        if (t0 > t1) ok = false
      }
      if (ok && t0 > 0.01 && t0 < best) best = t0
    }
    return best
  }

  /* ---------- mode switching ---------- */
  let mode = 'foot'
  function pose(kind) {
    const seated = kind === 'seat'
    rig.legL.rotation.set(seated ? -1.25 : 0, 0, seated ? 0.18 : 0)
    rig.legR.rotation.set(seated ? -1.25 : 0, 0, seated ? -0.18 : 0)
    rig.armL.rotation.set(seated ? -1.15 : 0, 0, 0)
    rig.armR.rotation.set(seated ? -1.15 : 0, 0, 0)
    rig.torso.position.y = 0.95
    rig.torso.rotation.set(seated ? 0.15 : 0, 0, 0)
  }
  const TOASTS = { car: 'Duster time 🚙', quad: 'Quad time 🏍️', suv: 'Touareg · full power 🖤' }
  function enter(name) {
    mode = name
    hud.mode = name
    hud.near = null
    if (name === 'quad') {
      views.quad.body.add(rig.root)
      rig.root.position.set(-0.3, 0.05, 0)
      rig.root.rotation.set(0, Math.PI / 2, 0)
      pose('seat')
    } else rig.root.visible = false
    toast(TOASTS[name], 1300)
  }
  function exit() {
    const v = vehicles[mode]
    const f = v.forward(fv)
    const right = tmp.set(0, 0, 1).applyQuaternion(v.q)
    const off = v.cfg.dims[2] / 2 + 0.9
    const px = v.pos.x - right.x * off, pz = v.pos.z - right.z * off
    player.pos.set(px, player.groundAt(px, pz, v.pos.y, platforms), pz)
    player.vel.set(0, 0, 0)
    player.vy = 0
    player.yaw = Math.atan2(f.x, f.z)
    world.add(rig.root)
    rig.root.visible = true
    rig.root.rotation.set(0, 0, 0)
    pose('stand')
    mode = 'foot'
    hud.mode = 'foot'
  }
  function startClimb() {
    player.startClimb(CP)
    mode = 'climb'
    hud.mode = 'climb'
    hud.near = null
    camPitch = -0.08
    camYaw = Math.atan2(player.pos.x - CP.x, player.pos.z - CP.z) + 0.5
    toast('Climb with ▲ / W', 1400)
  }
  function stopClimb() {
    player.stopClimb()
    pose('stand')
    mode = 'foot'
    hud.mode = 'foot'
  }

  if (typeof window !== 'undefined') window.__ksar = { enter, exit, startClimb, vehicles, player, dates, setCam: (y, p) => { camYaw = y; camPitch = p } }

  const IDLE = { throttle: 0, steer: 0, handbrake: false }
  let t = 0, frame = 0

  useTask((delta) => {
    const dt = Math.min(delta, 1 / 30)
    t += dt
    frame++
    const ax = axes()
    const active = vehicles[mode] ?? null

    // camera input
    if (input.camDX || input.camDY) lastDrag = t
    camYaw -= input.camDX * 0.006
    camPitch = Math.min(1.2, Math.max(-0.1, camPitch + input.camDY * 0.004))
    zoom = Math.min(2.6, Math.max(0.55, zoom * (1 + input.zoom * 0.0015)))
    input.camDX = input.camDY = input.zoom = 0

    // actions
    if (input.action) {
      input.action = false
      if (mode === 'foot') {
        if (hud.near === 'palm') startClimb()
        else if (hud.near) enter(hud.near)
      } else if (mode === 'climb') stopClimb()
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
      player.update(dt, fx * ax.y - fz * ax.x, fz * ax.y + fx * ax.x, input.jump, {
        rects, prects, platforms, circles, vehicles: VK.map((k) => vehicles[k])
      })
    } else if (mode === 'climb') {
      if (player.updateClimb(dt, ax.y) || input.jump) stopClimb()
    }
    input.jump = false

    // vehicles
    for (const k of VK) {
      const v = vehicles[k]
      const flipped = v.step(dt, v === active ? { throttle: ax.y, steer: ax.x, handbrake: ax.hand } : IDLE)
      if (flipped && v === active) toast('Back on its wheels 🙃', 1200)
      v.collide(vSolids, circles)
    }
    separate(vehicles.car, vehicles.quad)
    separate(vehicles.car, vehicles.suv)
    separate(vehicles.quad, vehicles.suv)

    // proximity prompts
    if (mode === 'foot') {
      let best = null, bd = Infinity
      for (const k of VK) {
        const v = vehicles[k]
        const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) - v.cfg.bodyR
        if (d < 1.4 && d < bd) { bd = d; best = k }
      }
      const dp = Math.hypot(CP.x - player.pos.x, CP.z - player.pos.z)
      if (player.onGround && dp < 1.6 && dp - 1.0 < bd) best = 'palm'
      if (hud.near !== best) hud.near = best
    }

    // dates
    const cp = active ? active.pos : player.pos
    const feet = active ? active.pos.y - active.cfg.comY : player.pos.y
    const cr = mode === 'suv' ? 3.6 : mode === 'car' ? 3.4 : mode === 'quad' ? 2.8 : mode === 'climb' ? 2.4 : 1.8
    let nd = Infinity, ni = -1
    for (let i = 0; i < N; i++) {
      const p = dates[i]
      let s = 1.6, y = p.y + Math.sin(t * 2.2 + i) * 0.25
      if (!collected[i]) {
        const d = Math.hypot(p.x - cp.x, p.z - cp.z)
        if (d < cr && Math.abs(p.y - 1.4 - feet) < 3.2) {
          collected[i] = true
          hud.dates++
          blip(620 + hud.dates * 15)
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

    // vehicle visuals, tracks, dust
    for (const k of VK) {
      const v = vehicles[k], view = views[k]
      view.root.position.copy(v.pos)
      view.root.quaternion.copy(v.q)
      const fwd = v.forward(fv)
      v.wheels.forEach((wh, i) => {
        const W = view.wheels[i]
        W.steer.position.y = v.cfg.attachY - wh.susp
        W.steer.rotation.y = wh.front ? v.steer : 0
        W.spin.rotation.z = -wh.spin
        // tracks
        const lm = lastMark[k]
        if (!wh.contact) { lm[i] = null; return }
        if (Math.abs(wh.vLong) < 0.5 && Math.abs(wh.vLat) < 0.5) return
        if (lm[i] && lm[i].distanceTo(wh.cp) < 0.5) return
        const len = lm[i] ? Math.min(1.2, lm[i].distanceTo(wh.cp) + 0.05) : 0.5
        by.copy(wh.n)
        bz.copy(fwd).addScaledVector(by, -fwd.dot(by)).normalize()
        bx.crossVectors(by, bz)
        mtx.makeBasis(bx, by, bz)
        mtx.scale(sc.set(k === 'quad' ? 0.26 : 0.34, 1, len))
        mtx.setPosition(tmp.copy(lm[i] ?? wh.cp).add(wh.cp).multiplyScalar(lm[i] ? 0.5 : 1).addScaledVector(by, 0.04))
        trackIM.setMatrixAt(trackHead, mtx)
        trackHead = (trackHead + 1) % TRK
        lm[i] = (lm[i] ?? new THREE.Vector3()).copy(wh.cp)
      })
      // dust
      const sp = Math.abs(v.speed)
      if (v.grounded) {
        dustAcc[k] += dt * ((sp > 3 ? sp * 0.9 : 0) + v.slip * 60)
        while (dustAcc[k] >= 1) {
          dustAcc[k] -= 1
          const wh = v.wheels[2 + Math.floor(Math.random() * 2)]
          if (!wh.contact) continue
          const d = dust[dustHead]
          dustHead = (dustHead + 1) % DN
          d.p.copy(wh.cp)
          d.v.copy(v.vel).multiplyScalar(-0.12).add(tmp2.set((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2))
          d.life = 0
          d.max = 0.8 + Math.random() * 0.8
          d.size = (k === 'quad' ? 0.7 : 1.1) * (0.6 + Math.random() * 0.8) * (0.6 + Math.min(1, sp / 15))
        }
      }
    }
    trackIM.instanceMatrix.needsUpdate = true
    for (let i = 0; i < DN; i++) {
      const d = dust[i]
      let s = 0
      if (d.life < d.max) {
        d.life += dt
        d.p.addScaledVector(d.v, dt)
        d.v.y += 0.4 * dt
        d.v.multiplyScalar(1 - 1.8 * dt)
        s = d.size * Math.sin(Math.PI * Math.min(1, d.life / d.max)) * (1 + d.life)
      }
      mtx.compose(d.p, qy.identity(), sc.setScalar(s))
      dustIM.setMatrixAt(i, mtx)
    }
    dustIM.instanceMatrix.needsUpdate = true

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
      rig.armL.rotation.z = rig.armR.rotation.z = 0
      rig.torso.position.y = 0.95 + Math.abs(Math.cos(player.phase)) * 0.06 * s + Math.sin(t * 2) * 0.008
      rig.head.rotation.y = Math.sin(t * 0.5) * 0.15 * (1 - s)
    } else if (mode === 'climb') {
      rig.root.position.copy(player.pos)
      rig.root.rotation.y = player.yaw
      const c = Math.sin(player.phase)
      rig.armL.rotation.set(-2.5 + c * 0.45, 0, -0.25)
      rig.armR.rotation.set(-2.5 - c * 0.45, 0, 0.25)
      rig.legL.rotation.set(-0.9 - c * 0.35, 0, 0.25)
      rig.legR.rotation.set(-0.9 + c * 0.35, 0, -0.25)
      rig.torso.rotation.x = 0.12
      rig.head.rotation.y = player.atTop ? Math.sin(t * 1.3) * 0.5 : 0
    } else if (mode === 'quad') {
      rig.torso.rotation.z = -vehicles.quad.steer * 0.4
    }

    // fade the climbable palm while on it so the crown doesn't block the view
    const fadeT = mode === 'climb' ? 0.35 : 1
    if (Math.abs(palmFade - fadeT) > 0.01) {
      palmFade += (fadeT - palmFade) * Math.min(1, Math.max(dt * 6, 0.25))
      for (const m of climbPalmMats) {
        m.transparent = palmFade < 0.99
        m.opacity = palmFade
        m.depthWrite = palmFade > 0.99
      }
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
    const base = mode === 'suv' ? 11 : mode === 'car' ? 10 : mode === 'quad' ? 7.5 : mode === 'climb' ? 8 : 6.5
    const want = base * zoom * (cam.aspect < 0.9 ? 1.35 : 1)
    tmp.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch))
    const hit = rayHit(focus, tmp, want)
    const target = hit < want ? Math.max(1.2, hit - 0.4) : want
    camDist = target < camDist ? target : camDist + (target - camDist) * (1 - Math.exp(-dt * 3))
    cam.position.copy(focus).addScaledVector(tmp, camDist)
    const gy = heightAt(cam.position.x, cam.position.z) + 0.8
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
    for (const k of VK) for (const s of views[k].lights) s.intensity = env.night * (k === 'quad' ? 22 : 30)

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
<T is={trackIM} />
<T is={dustIM} />
