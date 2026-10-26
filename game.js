
/* ============================================================
   NIGHTFALL — PART 1
   First-person 3D horror foundation
   Requires Three.js loaded before this file.
   Optional PeerJS support is retained for later co-op upgrades.
   ============================================================ */

"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const canvas = $("scene");
  if (!canvas || !window.THREE) {
    console.error("NIGHTFALL: #scene or Three.js is missing.");
    return;
  }

  const THREE = window.THREE;
  const clock = new THREE.Clock();

  // ---------- GAME STATE ----------

  const game = {
    started: false,
    ended: false,
    health: 100,
    stamina: 100,
    medkits: 1,
    hasKey: false,
    flashlightOn: true,
    sprinting: false,
    moving: false,
    locked: false,
    lastScare: 0,
    nextScare: 18,
    time: 0,
    peer: null,
    connections: new Map(),
    remotePlayers: new Map(),
    playerId: "player-" + Math.random().toString(36).slice(2, 8)
  };

  const keys = Object.create(null);
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  // ---------- RENDERER ----------

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(canvas.clientWidth || innerWidth,
                   canvas.clientHeight || innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ---------- WORLD ----------

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030508);
  scene.fog = new THREE.FogExp2(0x080d13, 0.023);

  const camera = new THREE.PerspectiveCamera(
    76, 1, 0.08, 120
  );
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 26);

  const world = new THREE.Group();
  scene.add(world);

  const colliders = [];
  const interactables = [];
  const lights = [];
  const decorativeObjects = [];

  function material(color, roughness = 0.9, extra = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.02,
      ...extra
    });
  }

  const mats = {
    floor: material(0x34383b),
    wall: material(0x68635a),
    darkWall: material(0x25292d),
    ceiling: material(0x4b4b47),
    wood: material(0x44352a),
    metal: material(0x444b50, 0.5, { metalness: 0.35 }),
    glass: material(0x263d48, 0.25, {
      transparent: true, opacity: 0.28
    }),
    blood: material(0x36090c, 0.8),
    monster: material(0x080b0c, 0.95),
    eye: new THREE.MeshStandardMaterial({
      color: 0xff2419,
      emissive: 0xaa0800,
      emissiveIntensity: 2.5
    })
  };

  function box(x, y, z, sx, sy, sz, mat, solid = true) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz), mat
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);

    if (solid) {
      colliders.push({
        x, z, hx: sx / 2, hz: sz / 2,
        minY: y - sy / 2, maxY: y + sy / 2
      });
    }
    return mesh;
  }

  function addPointLight(x, y, z, color, intensity, distance) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, y, z);
    world.add(light);
    lights.push({ light, base: intensity, phase: Math.random() * 8 });
    return light;
  }

  function makeRoom() {
    // Main corridor
    box(0, -0.25, 0, 18, 0.5, 68, mats.floor, false);
    box(0, 4.2, 0, 18, 0.4, 68, mats.ceiling, false);

    // Outer walls
    box(-9, 2, 0, 0.5, 4.5, 68, mats.wall);
    box(9, 2, 0, 0.5, 4.5, 68, mats.wall);
    box(0, 2, -34, 18, 4.5, 0.5, mats.darkWall);
    box(0, 2, 34, 18, 4.5, 0.5, mats.wall);

    // Classroom dividers, leaving openings for movement
    for (const z of [-22, -10, 2, 14]) {
      box(-5.9, 1.8, z, 6.2, 3.7, 0.25, mats.wall);
      box(5.9, 1.8, z, 6.2, 3.7, 0.25, mats.wall);
    }

    // Classroom furniture
    for (const z of [-27, -16, -5, 6, 17]) {
      for (const x of [-6.7, 6.7]) {
        box(x, 0.95, z, 1.2, 0.15, 0.85, mats.wood);
        box(x, 0.45, z, 0.12, 0.85, 0.12, mats.metal);
        box(x, 0.45, z + 0.3, 0.12, 0.85, 0.12, mats.metal);
      }
    }

    // Ceiling fixtures
    for (const z of [-28, -18, -8, 2, 12, 22, 30]) {
      box(0, 3.96, z, 2.2, 0.08, 0.6, mats.metal, false);
      const light = addPointLight(0, 3.6, z, 0xb8d5ff, 1.15, 10);
      light.castShadow = false;
    }

    // Wall stains and broken panels
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? -1 : 1;
      const stain = box(
        side * 8.73,
        0.7 + Math.random() * 2.3,
        -30 + Math.random() * 60,
        0.025 + Math.random() * 0.025,
        0.3 + Math.random() * 1.1,
        0.2 + Math.random() * 0.8,
        i % 3 === 0 ? mats.blood : mats.darkWall,
        false
      );
      stain.rotation.x = Math.random() * 0.15;
    }

    // Exit door
    const door = box(0, 1.55, -32.7, 2.5, 3.1, 0.2, mats.wood);
    door.userData.kind = "exit";
    interactables.push({
      type: "exit",
      object: door,
      label: "Exit door"
    });

    // Key pickup
    const key = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.045, 8, 18),
      mats.metal
    );
    ring.rotation.x = Math.PI / 2;
    key.add(ring);
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.07, 0.48), mats.metal
    );
    shaft.position.z = -0.27;
    key.add(shaft);
    key.position.set(6.8, 1.2, -20);
    world.add(key);
    interactables.push({
      type: "key",
      object: key,
      label: "School key"
    });

    // Medkit
    const medkit = box(-6.5, 0.45, 8, 0.65, 0.38, 0.5,
                       material(0x8f171b), false);
    const crossA = box(-6.5, 0.66, 8, 0.12, 0.035, 0.34,
                       material(0xf4eeee), false);
    const crossB = box(-6.5, 0.66, 8, 0.34, 0.035, 0.12,
                       material(0xf4eeee), false);
    interactables.push({
      type: "medkit",
      object: medkit,
      extras: [crossA, crossB],
      label: "Medkit"
    });

    // Blood trail
    for (let i = 0; i < 10; i++) {
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.18 + Math.random() * 0.5, 12),
        mats.blood
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(
        (Math.random() - 0.5) * 3,
        0.012,
        -25 + Math.random() * 16
      );
      puddle.scale.y = 0.5 + Math.random();
      world.add(puddle);
    }
  }

  makeRoom();

  // ---------- LIGHTING / FLASHLIGHT ----------

  scene.add(new THREE.HemisphereLight(0x71839b, 0x17120d, 0.38));

  const moon = new THREE.DirectionalLight(0x8297b4, 0.55);
  moon.position.set(-5, 12, -8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -24;
  moon.shadow.camera.right = 24;
  moon.shadow.camera.top = 24;
  moon.shadow.camera.bottom = -24;
  scene.add(moon);

  const flashlight = new THREE.SpotLight(
    0xd9e8ff, 95, 30, Math.PI / 7, 0.45, 1.2
  );
  flashlight.position.set(0, 0, 0);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  camera.add(flashlight);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);
  scene.add(camera);

  // ---------- MONSTER MODEL ----------

  const monster = new THREE.Group();
  monster.name = "NightfallMonster";

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.48, 1.35, 5, 8),
    mats.monster
  );
  body.position.y = 1.3;
  body.castShadow = true;
  monster.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    mats.monster
  );
  head.position.set(0, 2.35, -0.04);
  head.scale.set(0.82, 1.2, 0.82);
  head.castShadow = true;
  monster.add(head);

  for (const x of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8), mats.eye
    );
    eye.position.set(x, 2.4, -0.37);
    monster.add(eye);
  }

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 1.0, 4, 6), mats.monster
    );
    arm.position.set(side * 0.62, 1.25, 0);
    arm.rotation.z = side * -0.12;
    monster.add(arm);

    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.75, 4, 6), mats.monster
    );
    leg.position.set(side * 0.24, 0.38, 0);
    monster.add(leg);
  }

  monster.position.set(0, 0, -24);
  monster.visible = true;
  world.add(monster);

  const monsterState = {
    mode: "stalk",
    speed: 1.15,
    attackDistance: 1.65,
    lastAttack: 0,
    seenPlayer: false,
    searchTime: 0,
    target: new THREE.Vector3(0, 0, 16)
  };

  // ---------- PLAYER MOVEMENT ----------

  let yaw = 0;
  let pitch = 0;
  const playerRadius = 0.42;
  const playerHeight = 1.7;

  function isBlocked(x, z) {
    for (const c of colliders) {
      if (1.0 > c.maxY || 0.0 < c.minY) continue;
      const dx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
      const dz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
      const ox = x - dx;
      const oz = z - dz;
      if (ox * ox + oz * oz < playerRadius * playerRadius) return true;
    }
    return false;
  }

  function tryMove(dx, dz) {
    const p = camera.position;
    if (!isBlocked(p.x + dx, p.z)) p.x += dx;
    if (!isBlocked(p.x, p.z + dz)) p.z += dz;

    p.x = THREE.MathUtils.clamp(p.x, -8.15, 8.15);
    p.z = THREE.MathUtils.clamp(p.z, -33, 33);
  }

  canvas.addEventListener("click", () => {
    if (game.started && !game.ended) {
      canvas.requestPointerLock?.();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    game.locked = document.pointerLockElement === canvas;
  });

  document.addEventListener("mousemove", (event) => {
    if (!game.locked || game.ended) return;
    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0018;
    pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  });

  document.addEventListener("keydown", (event) => {
    keys[event.code] = true;

    if (["Space", "ArrowUp", "ArrowDown"].includes(event.code)) {
      event.preventDefault();
    }

    if (event.repeat) return;

    if (event.code === "KeyF") {
      game.flashlightOn = !game.flashlightOn;
      flashlight.visible = game.flashlightOn;
    }
    if (event.code === "KeyE") interact();
    if (event.code === "KeyQ") useMedkit();
  });

  document.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  // ---------- INTERACTION ----------

  function interact() {
    const target = nearestInteractable(2.8);
    if (!target) {
      message("Nothing nearby to interact with.");
      return;
    }

    if (target.type === "key") {
      game.hasKey = true;
      world.remove(target.object);
      message("You found the school key.");
      setObjective("Find the exit door.");
    } else if (target.type === "medkit") {
      game.medkits++;
      world.remove(target.object);
      for (const extra of target.extras || []) world.remove(extra);
      message("Medkit collected. Press Q to heal.");
    } else if (target.type === "exit") {
      if (!game.hasKey) {
        message("The door is locked. Find the key.");
      } else {
        winGame();
      }
    }
  }

  function nearestInteractable(maxDistance) {
    let best = null;
    let bestDistance = maxDistance;
    for (const item of interactables) {
      if (!item.object.parent) continue;
      const d = camera.position.distanceTo(item.object.position);
      if (d < bestDistance) {
        bestDistance = d;
        best = item;
      }
    }
    return best;
  }

  function useMedkit() {
    if (game.medkits <= 0) {
      message("You have no medkits.");
      return;
    }
    if (game.health >= 100) {
      message("Your health is already full.");
      return;
    }
    game.medkits--;
    game.health = Math.min(100, game.health + 40);
    updateHUD();
    message("You used a medkit.");
  }

  // ---------- MONSTER AI ----------

  function updateMonster(dt) {
    if (game.ended) return;

    const p = camera.position;
    const m = monster.position;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const distance = Math.hypot(dx, dz);

    // The creature notices close players, then pursues them.
    if (distance < 12) {
      monsterState.mode = "chase";
      monsterState.seenPlayer = true;
      monsterState.target.set(p.x, 0, p.z);
    } else if (monsterState.mode === "chase" && distance > 19) {
      monsterState.mode = "search";
      monsterState.searchTime = 5;
    }

    if (monsterState.mode === "search") {
      monsterState.searchTime -= dt;
      if (monsterState.searchTime <= 0) {
        monsterState.mode = "stalk";
        monsterState.target.set(0, 0, 15);
      }
    }

    if (monsterState.mode === "stalk" && distance < 19) {
      monsterState.target.set(p.x, 0, p.z);
    }

    const tx = monsterState.target.x - m.x;
    const tz = monsterState.target.z - m.z;
    const len = Math.hypot(tx, tz) || 1;
    const speed = monsterState.mode === "chase" ? 2.65 : 1.15;

    if (distance > monsterState.attackDistance) {
      const nx = m.x + (tx / len) * speed * dt;
      const nz = m.z + (tz / len) * speed * dt;

      // Basic collision avoidance: try axis movement independently.
      if (!isMonsterBlocked(nx, m.z)) m.x = nx;
      if (!isMonsterBlocked(m.x, nz)) m.z = nz;
    } else if (performance.now() - monsterState.lastAttack > 1300) {
      monsterState.lastAttack = performance.now();
      game.health = Math.max(0, game.health - 18);
      updateHUD();
      triggerScare(0.65);
      message("The creature attacked you!");

      if (game.health <= 0) loseGame();
    }

    monster.rotation.y = Math.atan2(dx, dz);
    const run = monsterState.mode === "chase";
    const step = Math.sin(game.time * (run ? 12 : 4)) * 0.035;
    monster.position.y = Math.abs(step);
    body.rotation.z = run ? Math.sin(game.time * 10) * 0.08 : 0;
  }

  function isMonsterBlocked(x, z) {
    for (const c of colliders) {
      const closestX = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
      const closestZ = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < 0.48 * 0.48) return true;
    }
    return false;
  }

  // ---------- HORROR EVENTS ----------

  let scareOverlay = null;

  function createScareOverlay() {
    scareOverlay = document.createElement("div");
    scareOverlay.id = "nightfall-scare";
    Object.assign(scareOverlay.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.93)",
      color: "#d71919",
      font: "900 min(35vw,300px) sans-serif",
      zIndex: "9999",
      pointerEvents: "none",
      textShadow: "0 0 35px #ff0000"
    });
    scareOverlay.textContent = "◉";
    document.body.appendChild(scareOverlay);
  }
  createScareOverlay();

  let shakeTime = 0;
  let shakeStrength = 0;

  function triggerScare(strength = 1) {
    const now = performance.now();
    if (now - game.lastScare < 1800) return;
    game.lastScare = now;
    shakeTime = 0.45;
    shakeStrength = strength;

    scareOverlay.style.display = "flex";
    scareOverlay.style.opacity = "1";
    setTimeout(() => {
      if (scareOverlay) scareOverlay.style.display = "none";
    }, 170 + Math.random() * 180);

    // Generated sound; browsers may require an earlier user gesture.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(130, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          38, ctx.currentTime + 0.42
        );
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.18, ctx.currentTime + 0.025
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001, ctx.currentTime + 0.48
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        osc.onended = () => ctx.close();
      }
    } catch (error) {
      console.warn("NIGHTFALL audio unavailable:", error);
    }
  }

  function updateHorrorEvents(dt) {
    game.nextScare -= dt;
    const distance = camera.position.distanceTo(monster.position);

    if (game.nextScare <= 0 && distance > 5 && distance < 22) {
      triggerScare(0.4);
      game.nextScare = 22 + Math.random() * 28;
    }

    if (distance < 7 && Math.random() < dt * 0.12) {
      triggerScare(0.55);
    }

    if (shakeTime > 0) {
      shakeTime -= dt;
      camera.rotation.z = (Math.random() - 0.5) *
                          shakeStrength * 0.045;
    } else {
      camera.rotation.z = 0;
    }
  }

  // ---------- HUD HELPERS ----------

  function message(text) {
    const objective = $("objective");
    if (objective) {
      objective.textContent = text;
      objective.style.opacity = "1";
    }
    console.log("[NIGHTFALL]", text);
  }

  function setObjective(text) {
    const objective = $("objective");
    if (objective) objective.textContent = text;
  }

  function updateHUD() {
    const health = $("healthFill");
    const stamina = $("staminaFill");
    if (health) health.style.width = game.health + "%";
    if (stamina) stamina.style.width = game.stamina + "%";

    const healthText = $("healthValue");
    if (healthText) healthText.textContent = Math.round(game.health);
  }

  function showElement(id, show) {
    const element = $(id);
    if (element) element.style.display = show ? "" : "none";
  }

  function startGame() {
    game.started = true;
    game.ended = false;
    showElement("menu", false);
    showElement("hud", true);
    showElement("winScreen", false);
    message("Find the key. Escape the school.");
    setObjective("Find the key.");
    canvas.requestPointerLock?.();
  }

  function winGame() {
    game.ended = true;
    document.exitPointerLock?.();
    showElement("winScreen", true);
    message("You escaped NIGHTFALL.");
  }

  function loseGame() {
    game.ended = true;
    document.exitPointerLock?.();
    showElement("winScreen", true);
    const title = $("winTitle");
    if (title) title.textContent = "YOU WERE CAUGHT";
    message("The creature caught you.");
  }

  function resetGame() {
    camera.position.set(0, playerHeight, 26);
    yaw = 0;
    pitch = 0;
    camera.rotation.set(0, 0, 0, "YXZ");

    monster.position.set(0, 0, -24);
    monsterState.mode = "stalk";
    monsterState.searchTime = 0;
    monsterState.lastAttack = 0;

    game.health = 100;
    game.stamina = 100;
    game.medkits = 1;
    game.hasKey = false;
    game.ended = false;
    game.nextScare = 18;
    game.lastScare = 0;

    updateHUD();
    showElement("winScreen", false);
    startGame();
  }

  // ---------- BUTTON WIRING ----------

  function wireButton(id, callback) {
    const element = $(id);
    if (element) element.addEventListener("click", callback);
  }

  wireButton("soloBtn", startGame);
  wireButton("startBtn", startGame);
  wireButton("againBtn", resetGame);
  wireButton("menuBtn", () => {
    game.started = false;
    game.ended = false;
    document.exitPointerLock?.();
    showElement("winScreen", false);
    showElement("menu", true);
  });

  // ---------- OPTIONAL PEERJS FOUNDATION ----------

  function setupPeer() {
    if (!window.Peer) {
      console.warn("PeerJS is not loaded; offline play remains available.");
      return;
    }

    try {
      game.peer = new Peer();

      game.peer.on("open", (id) => {
        console.log("NIGHTFALL peer ID:", id);
        const roomCode = $("roomCode");
        if (roomCode) roomCode.textContent = id;
      });

      game.peer.on("connection", (conn) => attachConnection(conn));
      game.peer.on("error", (error) => {
        console.warn("PeerJS:", error.type, error.message);
      });
    } catch (error) {
      console.warn("PeerJS initialization failed:", error);
    }
  }

  function attachConnection(conn) {
    conn.on("open", () => {
      game.connections.set(conn.peer, conn);
      conn.send({
        type: "hello",
        id: game.playerId,
        x: camera.position.x,
        z: camera.position.z
      });
    });

    conn.on("data", (data) => {
      if (!data || typeof data !== "object") return;
      if (data.type === "position") {
        game.remotePlayers.set(conn.peer, {
          x: Number(data.x) || 0,
          z: Number(data.z) || 0,
          yaw: Number(data.yaw) || 0
        });
      }
    });

    conn.on("close", () => {
      game.connections.delete(conn.peer);
      game.remotePlayers.delete(conn.peer);
    });
  }

  function sendPlayerPosition() {
    const packet = {
      type: "position",
      x: camera.position.x,
      z: camera.position.z,
      yaw
    };
    for (const conn of game.connections.values()) {
      if (conn.open) {
        try { conn.send(packet); } catch (_) {}
      }
    }
  }

  wireButton("hostBtn", () => {
    if (!game.peer) setupPeer();
    message("Hosting requires a reachable PeerJS room connection.");
  });

  wireButton("joinBtn", () => {
    const input = $("roomInput");
    const id = input?.value?.trim();
    if (!id) {
      message("Enter the host's full Peer ID to join.");
      return;
    }
    if (!game.peer) {
      setupPeer();
      message("Peer is starting. Try joining again in a moment.");
      return;
    }

    const conn = game.peer.connect(id, { reliable: true });
    attachConnection(conn);
    message("Connecting to host...");
  });

  setupPeer();

  // ---------- MAIN UPDATE LOOP ----------

  let networkTimer = 0;

  function updatePlayer(dt) {
    if (!game.started || game.ended) return;

    direction.set(0, 0, 0);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    if (keys.KeyW || keys.ArrowUp) direction.add(forward);
    if (keys.KeyS || keys.ArrowDown) direction.sub(forward);
    if (keys.KeyD || keys.ArrowRight) direction.add(right);
    if (keys.KeyA || keys.ArrowLeft) direction.sub(right);

    game.moving = direction.lengthSq() > 0;
    if (game.moving) direction.normalize();

    game.sprinting = !!keys.ShiftLeft && game.moving &&
                     game.stamina > 1;

    const speed = game.sprinting ? 6.5 : 3.25;
    if (game.sprinting) {
      game.stamina = Math.max(0, game.stamina - 25 * dt);
    } else {
      game.stamina = Math.min(100, game.stamina + 15 * dt);
    }

    tryMove(direction.x * speed * dt, direction.z * speed * dt);
    updateHUD();
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    game.time += dt;

    updatePlayer(dt);
    updateMonster(dt);
    updateHorrorEvents(dt);

    // Flicker a few lights for atmosphere.
    for (const item of lights) {
      if (Math.random() < dt * 0.12) {
        item.light.intensity = item.base *
          (0.25 + Math.random() * 0.9);
      }
    }

    networkTimer += dt;
    if (networkTimer > 0.1) {
      sendPlayerPosition();
      networkTimer = 0;
    }

    // Keep aspect ratio correct on browser resizing.
    const width = canvas.clientWidth || innerWidth;
    const height = canvas.clientHeight || innerHeight;
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
  }

  updateHUD();
  showElement("hud", false);
  animate();

  // Useful for debugging in the browser console.
  window.NIGHTFALL = {
    game,
    scene,
    camera,
    monster,
    startGame,
    resetGame,
    triggerScare
  };

  console.log("NIGHTFALL Part 1 loaded.");
})();
