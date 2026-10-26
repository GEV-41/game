
"use strict";

/* =========================================================
   NIGHTFALL — GAME ENGINE
   PART 1: Renderer, materials, hospital, and lighting
   Keep all later parts in this same game.js file.
   ========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  if (!window.THREE) {
    alert("Three.js did not load. Check your internet connection.");
    return;
  }

  const THREE = window.THREE;
  const canvas = $("scene");

  if (!canvas) {
    console.error("NIGHTFALL: canvas #scene is missing.");
    return;
  }

  const state = {
    running: false,
    paused: false,
    ended: false,
    health: 100,
    stamina: 100,
    battery: 100,
    files: 0,
    totalFiles: 5,
    hasKey: false,
    powerRestored: false,
    floor: 0,
    time: 0,
    flashlightOn: true,
    selectedWeapon: "knife",
    playerName: "Survivor",
    scareCooldown: 0,
    toastTimer: 0
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a0e);
  scene.fog = new THREE.FogExp2(0x10151b, 0.018);

  const camera = new THREE.PerspectiveCamera(
    76,
    innerWidth / innerHeight,
    0.08,
    180
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const clock = new THREE.Clock();
  const world = new THREE.Group();
  scene.add(world);

  // Shared collections used by later engine parts.
  const colliders = [];
  const interactables = [];
  const lamps = [];
  const ghosts = [];
  const weapons = {};
  const keysDown = Object.create(null);

  const player = {
    radius: 0.36,
    height: 1.7,
    speed: 3.4,
    sprintSpeed: 6.2,
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.7,
    verticalVelocity: 0,
    onGround: true,
    moving: false,
    sprinting: false
  };

  // ---------------------------------------------------------
  // MATERIALS AND PROCEDURAL TEXTURES
  // ---------------------------------------------------------

  function createTexture(base, kind) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const size = 1 + Math.random() * 8;

      ctx.globalAlpha = Math.random() * 0.12;
      ctx.fillStyle = Math.random() > 0.5
        ? "#ffffff" : "#000000";

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (kind === "wall") {
      for (let i = 0; i < 75; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;

        ctx.globalAlpha = 0.08 + Math.random() * 0.12;
        ctx.strokeStyle = "#080b0d";
        ctx.lineWidth = 1 + Math.random() * 5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.random() * 5, y + 15 + Math.random() * 100);
        ctx.stroke();
      }
    }

    if (kind === "floor") {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = "#14191d";
      ctx.lineWidth = 3;

      for (let n = 0; n <= 512; n += 64) {
        ctx.beginPath();
        ctx.moveTo(n, 0);
        ctx.lineTo(n, 512);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, n);
        ctx.lineTo(512, n);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(
      renderer.capabilities.getMaxAnisotropy(), 4
    );

    return texture;
  }

  const mat = {
    floor: new THREE.MeshStandardMaterial({
      map: createTexture("#55595a", "floor"),
      roughness: 0.3,
      metalness: 0.08
    }),

    wall: new THREE.MeshStandardMaterial({
      map: createTexture("#454544", "wall"),
      roughness: 0.94
    }),

    ceiling: new THREE.MeshStandardMaterial({
      map: createTexture("#24282b", "ceiling"),
      roughness: 1
    }),

    dark: new THREE.MeshStandardMaterial({
      color: 0x171b20,
      roughness: 0.85
    }),

    wood: new THREE.MeshStandardMaterial({
      color: 0x392b23,
      roughness: 0.8
    }),

    metal: new THREE.MeshStandardMaterial({
      color: 0x58616a,
      metalness: 0.55,
      roughness: 0.4
    }),

    bed: new THREE.MeshStandardMaterial({
      color: 0x899397,
      roughness: 0.65
    }),

    blood: new THREE.MeshStandardMaterial({
      color: 0x39090d,
      roughness: 0.3
    })
  };

  // ---------------------------------------------------------
  // WORLD GEOMETRY HELPERS
  // ---------------------------------------------------------

  function addBox(
    x, y, z, width, height, depth,
    material, solid = true
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);

    if (solid) {
      colliders.push({
        x, y, z,
        hx: width / 2,
        hy: height / 2,
        hz: depth / 2,
        top: y + height / 2,
        bottom: y - height / 2
      });
    }

    return mesh;
  }

  function addLamp(x, y, z, color = 0xc4d9ff, intensity = 1.7) {
    const light = new THREE.PointLight(color, intensity, 13);
    light.position.set(x, y, z);
    light.castShadow = false;
    world.add(light);

    lamps.push({
      light,
      base: intensity,
      enabled: true,
      flicker: Math.random() * 10
    });

    return light;
  }

  function addRoomFurniture(x, z, floorY, side) {
    const bedX = x + side * 1.5;

    // Bed frame and mattress
    addBox(
      bedX, floorY + 0.42, z,
      1.5, 0.18, 2.5, mat.metal
    );

    addBox(
      bedX, floorY + 0.58, z,
      1.4, 0.16, 2.4, mat.bed
    );

    addBox(
      bedX, floorY + 0.76, z + 1.05,
      1.35, 0.25, 0.25, mat.bed
    );

    // Bed legs
    for (const dx of [-0.58, 0.58]) {
      for (const dz of [-1.0, 1.0]) {
        addBox(
          bedX + dx, floorY + 0.2, z + dz,
          0.1, 0.4, 0.1, mat.metal
        );
      }
    }

    // Bedside cabinet
    addBox(
      x + side * 3.2, floorY + 0.5, z,
      0.7, 1, 0.7, mat.wood
    );
  }

  function addStaircase() {
    const steps = 14;

    for (let i = 0; i < steps; i++) {
      const stepX = 5.8 - i * 0.39;
      const stepZ = 8.8 - i * 0.86;
      const stepY = 0.18 + i * 0.39;

      addBox(
        stepX, stepY, stepZ,
        3.0, 0.36, 1.0, mat.wood
      );
    }

    // Railings
    addBox(7.15, 2.9, 3.3, 0.13, 5.2, 13, mat.dark);
    addBox(4.25, 2.9, 3.3, 0.13, 5.2, 13, mat.dark);
  }

  // ---------------------------------------------------------
  // BUILD THE TWO-STORY HOSPITAL
  // ---------------------------------------------------------

  function buildHospital() {
    // Ground floor
    addBox(0, -0.25, 0, 24, 0.5, 42, mat.floor, false);

    // Upper floor around the central lobby opening
    addBox(-7.8, 5.25, -4, 8.4, 0.5, 30, mat.floor, false);
    addBox(7.8, 5.25, -4, 8.4, 0.5, 30, mat.floor, false);
    addBox(0, 5.25, -16.8, 7.5, 0.5, 4.4, mat.floor, false);

    // Main ceiling
    addBox(0, 10.6, -4, 24, 0.4, 30, mat.ceiling, false);

    // Exterior walls
    addBox(-12, 2.5, 0, 0.5, 5.5, 42, mat.wall);
    addBox(12, 2.5, 0, 0.5, 5.5, 42, mat.wall);
    addBox(0, 2.5, -21, 24, 5.5, 0.5, mat.wall);
    addBox(0, 2.5, 21, 24, 5.5, 0.5, mat.wall);

    // Interior room partitions with openings at corridor edges
    for (const z of [-14, -6, 3, 12]) {
      addBox(-9.0, 2.1, z, 5.5, 4.2, 0.25, mat.wall);
      addBox(9.0, 2.1, z, 5.5, 4.2, 0.25, mat.wall);

      addBox(-9.0, 7.25, z, 5.5, 4.2, 0.25, mat.wall);
      addBox(9.0, 7.25, z, 5.5, 4.2, 0.25, mat.wall);
    }

    // Upper level side walls
    addBox(-12, 7.4, -4, 0.5, 4.2, 30, mat.wall);
    addBox(12, 7.4, -4, 0.5, 4.2, 30, mat.wall);

    // Balcony rails
    addBox(-4.7, 6.05, 10, 5.4, 0.15, 0.15, mat.dark);
    addBox(4.7, 6.05, 10, 5.4, 0.15, 0.15, mat.dark);

    for (let x = -7.2; x <= 7.2; x += 0.8) {
      if (Math.abs(x) < 2.8) continue;
      addBox(x, 5.65, 10, 0.1, 0.8, 0.1, mat.metal);
    }

    // Stairs and hospital beds
    addStaircase();

    for (const z of [-16, -8, 1, 9, 16]) {
      addRoomFurniture(-9.0, z, 0, 1);
      addRoomFurniture(9.0, z, 0, -1);
      addRoomFurniture(-9.0, z, 5.5, 1);
      addRoomFurniture(9.0, z, 5.5, -1);
    }

    // Reception counter
    addBox(0, 0.9, 17.4, 5.8, 1.5, 1.0, mat.wood);
    addBox(0, 1.7, 17.4, 6, 0.12, 1.1, mat.metal);

    // Ceiling lights on both levels
    for (const y of [3.8, 9.1]) {
      for (const z of [-16, -8, 0, 8, 16]) {
        addBox(0, y + 0.3, z, 1.8, 0.08, 0.5, mat.metal, false);
        addLamp(0, y, z, 0xb6d1ff, 1.7);
      }
    }

    // Bloodstains on selected floor locations
    for (let i = 0; i < 18; i++) {
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.2 + Math.random() * 0.45, 16),
        mat.blood
      );

      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(
        (Math.random() - 0.5) * 8,
        0.012,
        -18 + Math.random() * 29
      );
      puddle.scale.y = 0.55 + Math.random();
      world.add(puddle);
    }

    // Exit door
    const exit = addBox(
      0, 1.5, -20.55,
      2.6, 3.0, 0.25, mat.wood
    );

    interactables.push({
      type: "exit",
      object: exit,
      label: "Hospital exit"
    });
  }

  buildHospital();

  // ---------------------------------------------------------
  // ATMOSPHERIC LIGHTING
  // ---------------------------------------------------------

  scene.add(new THREE.HemisphereLight(
    0x9aacc2, 0x17110c, 0.42
  ));

  const moonlight = new THREE.DirectionalLight(0x8294ad, 0.55);
  moonlight.position.set(-8, 13, -10);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(1024, 1024);
  moonlight.shadow.camera.left = -20;
  moonlight.shadow.camera.right = 20;
  moonlight.shadow.camera.top = 20;
  moonlight.shadow.camera.bottom = -20;
  scene.add(moonlight);

  // Flashlight attached to the first-person camera
  const flashlight = new THREE.SpotLight(
    0xd7e7ff,
    100,
    32,
    Math.PI / 7,
    0.55,
    1.2
  );

  flashlight.position.set(0, 0, 0);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.target.position.set(0, 0, -1);

  camera.add(flashlight);
  camera.add(flashlight.target);
  scene.add(camera);

  // ---------------------------------------------------------
  // EXPORT SHARED ENGINE OBJECTS FOR LATER PARTS
  // ---------------------------------------------------------

  window.NIGHTFALL = {
    THREE,
    scene,
    world,
    camera,
    renderer,
    clock,
    state,
    player,
    keysDown,
    colliders,
    interactables,
    lamps,
    ghosts,
    weapons,
    flashlight,
    addBox,
    addLamp,
    mat,
    $,
    showToast: (message) => {
      const toast = $("toast");
      if (toast) toast.textContent = message;
    }
  };

  console.log("NIGHTFALL: Part 1 — 3D hospital engine initialized.");
})();
