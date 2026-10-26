
"use strict";

/* =========================================================
   NIGHTFALL — COMPLETE PLAYABLE CORE
   Three.js | First-person hospital survival
   Replace the entire contents of game.js with this file.
   ========================================================= */

(() => {
  const $ = id => document.getElementById(id);
  const THREE = window.THREE;

  if (!THREE) {
    alert("Three.js failed to load. Check your internet connection.");
    return;
  }

  const canvas = $("scene");
  if (!canvas) {
    alert("Missing canvas with id='scene'. Check index.html.");
    return;
  }

  const state = {
    started: false,
    paused: false,
    ended: false,
    health: 100,
    stamina: 100,
    battery: 100,
    files: 0,
    power: false,
    hasKey: false,
    flashlight: true,
    weapon: "knife",
    time: 0,
    floor: 0,
    scareUntil: 0,
    invulnerableUntil: 0,
    exitUnlocked: false,
    playerName: "Survivor"
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090c11);
  scene.fog = new THREE.FogExp2(0x10151b, 0.012);

  const camera = new THREE.PerspectiveCamera(
    76, innerWidth / innerHeight, 0.08, 160
  );
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 17);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const clock = new THREE.Clock();
  const world = new THREE.Group();
  scene.add(world);

  const keys = Object.create(null);
  const solids = [];
  const interactables = [];
  const lamps = [];
  const ghosts = [];
  const particles = [];
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();

  const player = {
    radius: 0.34,
    speed: 3.5,
    sprintSpeed: 6,
    yaw: 0,
    pitch: 0,
    moving: false,
    grounded: true
  };

  // ---------- MATERIALS ----------

  function makeTexture(base, kind) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1800; i++) {
      ctx.globalAlpha = Math.random() * 0.13;
      ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
      const size = Math.random() * 5 + 1;
      ctx.fillRect(
        Math.random() * 256,
        Math.random() * 256,
        size, size
      );
    }

    if (kind === "floor") {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#121619";
      ctx.lineWidth = 2;

      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
    }

    if (kind === "wall") {
      for (let i = 0; i < 30; i++) {
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2 + Math.random() * 3;
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.random() * 5, y + 15 + Math.random() * 60);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  const mats = {
    floor: new THREE.MeshStandardMaterial({
      map: makeTexture("#515556", "floor"),
      roughness: 0.36,
      metalness: 0.05
    }),
    wall: new THREE.MeshStandardMaterial({
      map: makeTexture("#414343", "wall"),
      roughness: 0.95
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: makeTexture("#25292c", "wall"),
      roughness: 1
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x596168, metalness: 0.55, roughness: 0.4
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x382921, roughness: 0.85
    }),
    bed: new THREE.MeshStandardMaterial({
      color: 0x929b9e, roughness: 0.8
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x15191d, roughness: 0.9
    }),
    blood: new THREE.MeshStandardMaterial({
      color: 0x4d080d, roughness: 0.35
    })
  };

  // ---------- WORLD HELPERS ----------

  function box(x, y, z, w, h, d, mat, solid = true) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d), mat
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);

    if (solid) {
      solids.push({
        x, z, hx: w / 2, hz: d / 2,
        bottom: y - h / 2,
        top: y + h / 2,
        height: h
      });
    }
    return mesh;
  }

  function light(x, y, z, intensity = 1.4) {
    const l = new THREE.PointLight(0xb8d4ff, intensity, 12);
    l.position.set(x, y, z);
    world.add(l);
    lamps.push({
      light: l,
      base: intensity,
      enabled: true,
      phase: Math.random() * 8
    });
    return l;
  }

  function addBed(x, z, floorY) {
    box(x, floorY + 0.4, z, 1.6, 0.18, 2.6, mats.metal);
    box(x, floorY + 0.55, z, 1.5, 0.16, 2.5, mats.bed);
    box(x, floorY + 0.7, z + 1, 1.4, 0.2, 0.25, mats.bed);

    for (const dx of [-0.6, 0.6]) {
      for (const dz of [-1, 1]) {
        box(x + dx, floorY + 0.18, z + dz,
          0.1, 0.36, 0.1, mats.metal);
      }
    }

    box(x + 1.35, floorY + 0.45, z, 0.6, 0.9, 0.65, mats.wood);
  }

  function addLampFixture(x, y, z) {
    box(x, y + 0.18, z, 1.6, 0.08, 0.45, mats.metal, false);
    light(x, y, z, 1.5);
  }

  function makeHospital() {
    // Floors and ceiling.
    box(0, -0.25, 0, 24, 0.5, 42, mats.floor, false);

    // Upper floor split into side wings around the lobby.
    box(-7.9, 5.25, -4, 8.2, 0.5, 30, mats.floor, false);
    box(7.9, 5.25, -4, 8.2, 0.5, 30, mats.floor, false);
    box(0, 5.25, -17, 7.6, 0.5, 4, mats.floor, false);

    box(0, 10.5, -4, 24, 0.35, 30, mats.ceiling, false);

    // Exterior walls.
    box(-12, 2.5, 0, 0.5, 5.5, 42, mats.wall);
    box(12, 2.5, 0, 0.5, 5.5, 42, mats.wall);
    box(0, 2.5, -21, 24, 5.5, 0.5, mats.wall);
    box(0, 2.5, 21, 24, 5.5, 0.5, mats.wall);

    // Room partitions leave openings near the center corridor.
    for (const z of [-14, -6, 4, 13]) {
      box(-9.5, 2.1, z, 4.5, 4.2, 0.25, mats.wall);
      box(9.5, 2.1, z, 4.5, 4.2, 0.25, mats.wall);
      box(-9.5, 7.3, z, 4.5, 4.2, 0.25, mats.wall);
      box(9.5, 7.3, z, 4.5, 4.2, 0.25, mats.wall);
    }

    // Upper outer walls.
    box(-12, 7.5, -4, 0.5, 4.2, 30, mats.wall);
    box(12, 7.5, -4, 0.5, 4.2, 30, mats.wall);

    // Staircase. The movement system uses a ramp-shaped walkable zone.
    for (let i = 0; i < 14; i++) {
      box(5.8 - i * 0.38, 0.2 + i * 0.39,
        9 - i * 0.85, 2.8, 0.38, 1, mats.wood);
    }

    // Rails and balcony.
    box(-4.7, 6.05, 10, 5.4, 0.15, 0.15, mats.metal);
    box(4.7, 6.05, 10, 5.4, 0.15, 0.15, mats.metal);

    for (const x of [-7, -6, -5, 5, 6, 7]) {
      box(x, 5.65, 10, 0.1, 0.8, 0.1, mats.metal);
    }

    // Beds on both floors.
    for (const z of [-16, -8, 1, 9, 16]) {
      addBed(-9.2, z, 0);
      addBed(9.2, z, 0);
      addBed(-9.2, z, 5.5);
      addBed(9.2, z, 5.5);
    }

    // Reception desk.
    box(0, 0.9, 17.4, 5.8, 1.5, 1, mats.wood);
    box(0, 1.7, 17.4, 6, 0.12, 1.1, mats.metal);

    // Lighting fixtures.
    for (const y of [3.8, 9.0]) {
      for (const z of [-16, -8, 0, 8, 16]) {
        addLampFixture(0, y, z);
      }
    }

    // Scattered stains.
    for (let i = 0; i < 18; i++) {
      const stain = new THREE.Mesh(
        new THREE.CircleGeometry(0.25 + Math.random() * 0.5, 16),
        mats.blood
      );
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(
        (Math.random() - 0.5) * 8,
        0.015,
        -18 + Math.random() * 30
      );
      world.add(stain);
    }

    // Switchable electrical breaker.
    const breaker = box(-10.8, 1.6, 16, 0.15, 1.3, 0.8, mats.metal);
    interactables.push({
      type: "power",
      object: breaker,
      label: "Restore hospital power"
    });

    // Exit door.
    const exit = box(0, 1.5, -20.5, 2.6, 3, 0.25, mats.wood);
    interactables.push({
      type: "exit",
      object: exit,
      label: "Hospital exit"
    });

    // Five patient files.
    const filePositions = [
      [-8.7, 0.95, -16, 0],
      [8.7, 0.95, -8, 0],
      [-8.7, 6.45, 1, 5.5],
      [8.7, 6.45, 9, 5.5],
      [-8.7, 0.95, 16, 0]
    ];

    for (const [x, y, z, floorY] of filePositions) {
      const file = box(x, y, z, 0.45, 0.08, 0.35,
        new THREE.MeshStandardMaterial({
          color: 0xd0c7a6, roughness: 0.9
        }), false);

      interactables.push({
        type: "file",
        object: file,
        label: "Collect patient file",
        floorY
      });
    }

    // A key hidden near the reception.
    const key = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.035, 8, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe2b94d, metalness: 0.7, roughness: 0.3
      })
    );
    key.position.set(2.5, 1.8, 17.2);
    world.add(key);

    interactables.push({
      type: "key",
      object: key,
      label: "Take exit key"
    });
  }

  makeHospital();

  // ---------- LIGHTING AND FLASHLIGHT ----------

  scene.add(new THREE.HemisphereLight(0x9aaec6, 0x16100c, 0.4));

  const moon = new THREE.DirectionalLight(0x8294ad, 0.45);
  moon.position.set(-8, 15, -10);
  scene.add(moon);

  const flashlight = new THREE.SpotLight(
    0xd9e9ff, 85, 30, Math.PI / 7, 0.55, 1.2
  );
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight);
  camera.add(flashlight.target);
  scene.add(camera);

  camera.position.set(0, 1.7, 17);

  // ---------- GHOST MODELS ----------

  function createGhost(x, z, floorY = 0) {
    const group = new THREE.Group();

    const ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xc3d4d9,
      transparent: true,
      opacity: 0.58,
      roughness: 0.3,
      emissive: 0x1c3037,
      emissiveIntensity: 0.8,
      side: THREE.DoubleSide
    });

    const robe = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 1.55, 12, 3),
      ghostMaterial
    );
    robe.position.y = 0.82;
    robe.scale.z = 0.75;
    group.add(robe);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      ghostMaterial
    );
    head.position.y = 1.72;
    head.scale.set(0.8, 1.1, 0.8);
    group.add(head);

    const eyes = new THREE.MeshBasicMaterial({ color: 0x050608 });

    for (const ex of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8), eyes
      );
      eye.position.set(ex, 1.77, -0.22);
      group.add(eye);
    }

    group.position.set(x, floorY, z);
    world.add(group);

    ghosts.push({
      object: group,
      homeX: x,
      homeY: floorY,
      homeZ: z,
      phase: Math.random() * 8,
      cooldown: 0,
      speed: 0.25 + Math.random() * 0.3,
      alerted: false
    });
  }

  [
    [-8, -17, 0], [8, -11, 0], [-7, 0, 0],
    [7, 8, 0], [-8, 15, 0],
    [-8, -15, 5.5], [8, -7, 5.5],
    [-7, 4, 5.5], [8, 15, 5.5]
  ].forEach(p => createGhost(...p));

  // ---------- UI HELPERS ----------

  function showToast(message, duration = 2400) {
    const el = $("toast");
    if (!el) return;

    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      el.textContent = "";
    }, duration);
  }

  function setObjective(text) {
    if ($("objective")) $("objective").textContent = text;
    updateUI();
  }

  function updateUI() {
    const setText = (id, text) => {
      if ($(id)) $(id).textContent = text;
    };

    const setWidth = (id, value) => {
      if ($(id)) $(id).style.width =
        Math.max(0, Math.min(100, value)) + "%";
    };

    setText("health-value", Math.ceil(state.health));
    setText("stamina-value", Math.ceil(state.stamina));
    setText("battery-value", Math.ceil(state.battery) + "%");
    setText("mission-count", `Patient files: ${state.files} / 5`);
    setText("floor-label", state.floor ? "UPPER FLOOR" : "GROUND FLOOR");

    setWidth("health-fill", state.health);
    setWidth("stamina-fill", state.stamina);
    setWidth("battery-fill", state.battery);
    setWidth("mission-fill", state.files / 5 * 100);

    const descriptions = {
      knife: "Close-range defense",
      flare: "Stuns nearby ghosts",
      medkit: "Restores health"
    };
    setText("weapon-description", descriptions[state.weapon]);

    document.querySelectorAll(".weapon-slot").forEach(button => {
      button.classList.toggle(
        "selected", button.dataset.weapon === state.weapon
      );
    });

    setText("network-status", "SOLO");
  }

  function showHUD(visible) {
    [
      "top-hud", "mission-panel", "status-panel",
      "weapon-panel", "control-help", "center-reticle"
    ].forEach(id => {
      if ($(id)) $(id).classList.toggle("hidden", !visible);
    });
  }

  function finishGame(won) {
    state.ended = true;
    state.paused = true;
    document.exitPointerLock?.();

    $("end-screen")?.classList.remove("hidden");
    $("end-title").textContent = won ? "YOU ESCAPED" : "YOU WERE LOST";
    $("end-eyebrow").textContent = won ? "MISSION COMPLETE" : "MISSION FAILED";
    $("end-message").textContent = won
      ? "You escaped the hospital. The things inside remain."
      : "The hospital has claimed another survivor.";
  }

  // ---------- MISSION AND INTERACTIONS ----------

  function currentFloorY() {
    return state.floor ? 5.5 : 0;
  }

  function nearestInteractable() {
    let best = null;
    let bestDistance = 2.7;

    for (const item of interactables) {
      if (!item.object.parent) continue;
      if (item.type === "file" && item.floorY !== currentFloorY()) continue;

      const d = camera.position.distanceTo(item.object.position);
      if (d < bestDistance) {
        best = item;
        bestDistance = d;
      }
    }

    return best;
  }

  function interact() {
    const item = nearestInteractable();

    if (!item) {
      showToast("Nothing to interact with.");
      return;
    }

    if (item.type === "file") {
      world.remove(item.object);
      item.object = new THREE.Object3D();
      state.files++;

      showToast(`Patient file collected (${state.files}/5).`);

      if (state.files >= 5) {
        setObjective("Find the exit key and escape.");
      } else {
        setObjective("Collect all five patient files.");
      }
    }

    if (item.type === "power") {
      if (!state.power) {
        state.power = true;
        for (const lamp of lamps) {
          lamp.enabled = true;
          lamp.light.intensity = lamp.base;
        }
        showToast("Power restored. The hospital lights flicker on.");
        setObjective("Collect five patient files and find the exit key.");
      } else {
        showToast("The power is already restored.");
      }
    }

    if (item.type === "key") {
      if (!state.hasKey) {
        state.hasKey = true;
        world.remove(item.object);
        item.object = new THREE.Object3D();
        showToast("You found the exit key.");
        setObjective("Reach the hospital exit.");
      }
    }

    if (item.type === "exit") {
      if (state.files < 5) {
        showToast("The exit is blocked. Find all five patient files.");
      } else if (!state.hasKey) {
        showToast("The exit is locked. Find the key.");
      } else {
        finishGame(true);
      }
    }

    updateUI();
  }

  // ---------- COLLISION ----------

  function collides(x, z) {
    const r = player.radius;

    for (const s of solids) {
      // Only collide with tall wall-sized objects at player height.
      if (s.height < 0.7) continue;
      if (s.top < 0.1 || s.bottom > 2.2) continue;

      if (
        x + r > s.x - s.hx &&
        x - r < s.x + s.hx &&
        z + r > s.z - s.hz &&
        z - r < s.z + s.hz
      ) {
        return true;
      }
    }
    return false;
  }

  function movePlayer(dx, dz) {
    const x = camera.position.x;
    const z = camera.position.z;

    if (!collides(x + dx, z)) camera.position.x += dx;
    if (!collides(camera.position.x, z + dz)) camera.position.z += dz;

    // Hospital boundary safety.
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -11.2, 11.2);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -20, 20);
  }

  // ---------- STAIRS AND FLOOR HEIGHT ----------

  function updateFloor() {
    const x = camera.position.x;
    const z = camera.position.z;

    // A walkable ramp path alongside the visual staircase.
    const onStairRamp =
      x > 3.0 && x < 8.2 && z > -3.5 && z < 10.5;

    if (onStairRamp) {
      const t = THREE.MathUtils.clamp((10.5 - z) / 14, 0, 1);
      const y = t * 5.5;

      camera.position.y = 1.7 + y;
      state.floor = y > 2.8 ? 1 : 0;
    } else {
      // Snap to the nearest floor only when close to its level.
      const targetY = state.floor ? 7.2 : 1.7;
      camera.position.y += (targetY - camera.position.y) * 0.2;

      if (camera.position.y < 4.3) {
        camera.position.y = 1.7;
        state.floor = 0;
      } else {
        state.floor = 1;
        camera.position.y = 7.2;
      }
    }
  }

  // ---------- WEAPONS ----------

  function useWeapon() {
    if (!state.started || state.paused || state.ended) return;

    if (state.weapon === "medkit") {
      if (state.health >= 100) {
        showToast("Your health is already full.");
      } else {
        state.health = Math.min(100, state.health + 40);
        showToast("You used a medkit.");
        updateUI();
      }
      return;
    }

    const candidates = ghosts
      .map(g => ({
        ghost: g,
        distance: camera.position.distanceTo(g.object.position)
      }))
      .filter(x => x.distance < (state.weapon === "knife" ? 2.3 : 8))
      .sort((a, b) => a.distance - b.distance);

    if (!candidates.length) {
      showToast(state.weapon === "knife"
        ? "You swing at empty air."
        : "The flare fades into the darkness.");
      return;
    }

    const target = candidates[0].ghost;

    if (state.weapon === "knife") {
      target.cooldown = performance.now() + 2500;
      target.object.visible = false;
      setTimeout(() => {
        if (target.object.parent) target.object.visible = true;
      }, 2500);
      showToast("The ghost dissolves into the darkness.");
    } else {
      target.alerted = false;
      target.homeX = target.object.position.x;
      target.homeZ = target.object.position.z;
      target.object.visible = false;
      target.cooldown = performance.now() + 5000;
      setTimeout(() => {
        if (target.object.parent) target.object.visible = true;
      }, 5000);
      showToast("The flare stuns the ghost temporarily.");
    }
  }

  function selectWeapon(name) {
    if (!["knife", "flare", "medkit"].includes(name)) return;
    state.weapon = name;
    updateUI();
  }

  // ---------- GHOST AI AND JUMPSCARES ----------

  function triggerScare() {
    const now = performance.now();
    if (now < state.scareUntil || now < state.invulnerableUntil) return;

    state.scareUntil = now + 1800;
    state.invulnerableUntil = now + 3000;
    state.health = Math.max(0, state.health - 18);

    const overlay = $("jumpscare");
    if (overlay) {
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");

      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
      }, 850);
    }

    const flash = $("damage-flash");
    if (flash) {
      flash.style.opacity = "0.8";
      setTimeout(() => { flash.style.opacity = "0"; }, 180);
    }

    showToast("IT SAW YOU.", 1500);
    updateUI();

    if (state.health <= 0) finishGame(false);
  }

  function updateGhosts(dt) {
    const now = performance.now();

    camera.getWorldDirection(direction);
    raycaster.set(camera.position, direction);

    for (const g of ghosts) {
      const obj = g.object;
      if (!obj.visible) continue;

      g.phase += dt;

      const distance = camera.position.distanceTo(obj.position);
      const playerFloor = state.floor ? 5.5 : 0;

      if (Math.abs(g.homeY - playerFloor) > 1) {
        obj.position.x += (g.homeX - obj.position.x) * dt * 0.3;
        obj.position.z += (g.homeZ - obj.position.z) * dt * 0.3;
        continue;
      }

      obj.position.y = g.homeY + Math.sin(g.phase * 2) * 0.1;

      // Ghosts slowly approach when they detect the player.
      if (distance < 9 && distance > 2.1 && now > g.cooldown) {
        g.alerted = true;

        const dx = camera.position.x - obj.position.x;
        const dz = camera.position.z - obj.position.z;
        const length = Math.max(0.001, Math.hypot(dx, dz));

        obj.position.x += dx / length * g.speed * dt;
        obj.position.z += dz / length * g.speed * dt;
      } else if (!g.alerted) {
        obj.position.x = g.homeX + Math.sin(g.phase * 0.4) * 0.6;
        obj.position.z = g.homeZ + Math.cos(g.phase * 0.3) * 0.4;
      }

      obj.lookAt(camera.position.x, obj.position.y + 1, camera.position.z);

      // Looking directly at a nearby ghost triggers the scare.
      if (distance < 11 && distance > 1.2 && now > g.cooldown) {
        const hits = raycaster.intersectObject(obj, true);
        if (hits.length && hits[0].distance < 11) {
          g.cooldown = now + 7000;
          triggerScare();
        }
      }

      // Touching a ghost is also dangerous.
      if (distance < 1.45 && now > g.cooldown) {
        g.cooldown = now + 3500;
        triggerScare();
      }
    }
  }

  // ---------- INTERACTION PROMPT ----------

  function updateInteractionPrompt() {
    const item = nearestInteractable();
    const prompt = $("interaction-prompt");

    if (!prompt) return;

    if (item && state.started && !state.paused) {
      prompt.textContent = "E — " + item.label;
      prompt.classList.remove("hidden");
    } else {
      prompt.classList.add("hidden");
    }
  }

  // ---------- INPUT ----------

  function toggleFlashlight() {
    state.flashlight = !state.flashlight;
    flashlight.visible = state.flashlight && state.battery > 0;
    showToast(state.flashlight ? "Flashlight ON" : "Flashlight OFF");
  }

  function startGame() {
    if (state.started) return;

    state.started = true;
    state.paused = false;
    state.ended = false;

    state.playerName = $("player-name")?.value.trim() || "Survivor";

    $("menu")?.classList.add("hidden");
    $("pause-screen")?.classList.add("hidden");
    $("end-screen")?.classList.add("hidden");

    showHUD(true);
    updateUI();
    setObjective("Restore hospital power.");
    showToast("Find the breaker, then collect five patient files.");

    canvas.requestPointerLock?.();
  }

  function pauseGame() {
    if (!state.started || state.ended) return;
    state.paused = true;
    $("pause-screen")?.classList.remove("hidden");
    document.exitPointerLock?.();
  }

  function resumeGame() {
    if (state.ended) return;
    state.paused = false;
    $("pause-screen")?.classList.add("hidden");
    canvas.requestPointerLock?.();
  }

  document.addEventListener("keydown", e => {
    keys[e.code] = true;

    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }

    if (e.repeat) return;

    if (e.code === "Escape") {
      if (state.started && !state.paused) pauseGame();
      return;
    }

    if (e.code === "KeyE") interact();
    if (e.code === "KeyF") toggleFlashlight();
    if (e.code === "Digit1") selectWeapon("knife");
    if (e.code === "Digit2") selectWeapon("flare");
    if (e.code === "Digit3") selectWeapon("medkit");
  });

  document.addEventListener("keyup", e => {
    keys[e.code] = false;
  });

  document.addEventListener("mousemove", e => {
    if (!state.started || state.paused || document.pointerLockElement !== canvas) return;

    player.yaw -= e.movementX * 0.002;
    player.pitch -= e.movementY * 0.002;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch, -Math.PI / 2.1, Math.PI / 2.1
    );

    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  });

  canvas.addEventListener("click", () => {
    if (state.started && !state.paused && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    } else {
      useWeapon();
    }
  });

  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    document.exitPointerLock?.();
  });

  document.querySelectorAll(".weapon-slot").forEach(button => {
    button.addEventListener("click", () => {
      selectWeapon(button.dataset.weapon);
    });
  });

  $("soloBtn")?.addEventListener("click", startGame);
  $("resumeBtn")?.addEventListener("click", resumeGame);

  $("restartBtn")?.addEventListener("click", () => location.reload());
  $("end-restart")?.addEventListener("click", () => location.reload());

  $("return-menu")?.addEventListener("click", () => {
    location.reload();
  });

  document.addEventListener("pointerlockchange", () => {
    if (
      state.started &&
      !state.paused &&
      !state.ended &&
      document.pointerLockElement !== canvas
    ) {
      showToast("Click the game to capture the mouse.");
    }
  });

  // ---------- MAIN UPDATE ----------

  function updatePlayer(dt) {
    if (!state.started || state.paused || state.ended) return;

    const forward =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) -
      (keys.KeyS || keys.ArrowDown ? 1 : 0);

    const strafe =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0);

    const moving = forward !== 0 || strafe !== 0;
    const sprint = moving && keys.ShiftLeft && state.stamina > 0;

    player.moving = moving;

    if (sprint) {
      state.stamina = Math.max(0, state.stamina - 28 * dt);
    } else {
      state.stamina = Math.min(100, state.stamina + 18 * dt);
    }

    const speed = sprint ? player.sprintSpeed : player.speed;
    const length = Math.hypot(forward, strafe) || 1;
    const f = forward / length;
    const s = strafe / length;

    const dx = (
      -Math.sin(player.yaw) * f +
      Math.cos(player.yaw) * s
    ) * speed * dt;

    const dz = (
      -Math.cos(player.yaw) * f -
      Math.sin(player.yaw) * s
    ) * speed * dt;

    if (moving) movePlayer(dx, dz);

    updateFloor();

    if (state.flashlight && state.battery > 0) {
      state.battery = Math.max(0, state.battery - 0.32 * dt);
      flashlight.visible = true;
    } else {
      flashlight.visible = false;
    }

    if (state.battery <= 0 && state.flashlight) {
      state.flashlight = false;
      showToast("Flashlight battery depleted.");
    }

    updateInteractionPrompt();
  }

  function updateLights(dt) {
    state.time += dt;

    for (const lamp of lamps) {
      lamp.phase += dt;

      if (!state.power) {
        // Unpowered lights remain mostly dark with occasional flickers.
        lamp.light.intensity =
          Math.random() < 0.004 ? lamp.base * 0.8 : 0.04;
      } else {
        // Small electrical flickers.
        const flicker = Math.random() < 0.008 ? 0.25 : 1;
        lamp.light.intensity = lamp.base * flicker;
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (state.started && !state.paused && !state.ended) {
      updatePlayer(dt);
      updateLights(dt);
      updateGhosts(dt);
      updateUI();
    }

    renderer.render(scene, camera);
  }

  // ---------- RESIZE AND INITIALIZE ----------

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(innerWidth, innerHeight);
  });

  showHUD(false);
  flashlight.visible = true;
  updateUI();
  animate();

  console.log("NIGHTFALL initialized. Click ENTER THE HOSPITAL to play.");
})();
