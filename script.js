
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

/* ==========================================================
   PAINTSTRIKE MULTIPLAYER
   First-person 3D paintball practice game
   Controls: WASD, mouse, click, Shift, Space, R, Escape
   ========================================================== */

const $ = id => document.getElementById(id);
const world = $("world");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9c7dc");
scene.fog = new THREE.Fog("#a9c7dc", 32, 105);

const camera = new THREE.PerspectiveCamera(
  78, window.innerWidth / window.innerHeight, 0.08, 160
);
camera.rotation.order = "YXZ";
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
world.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 85;

const MAT = {
    blue: new THREE.MeshStandardMaterial({
        color: "#168bfa", roughness: .32, metalness: .08
    }),
    blueLight: new THREE.MeshStandardMaterial({
        color: "#6dcfff", emissive: "#087cbb", emissiveIntensity: .3
    }),
    red: new THREE.MeshStandardMaterial({
        color: "#e83e59", roughness: .34
    }),
    floor: new THREE.MeshStandardMaterial({
        color: "#344c50", roughness: .94
    }),
    dark: new THREE.MeshStandardMaterial({
        color: "#192735", roughness: .65, metalness: .16
    }),
    white: new THREE.MeshStandardMaterial({
        color: "#d9e4e9", roughness: .8
    }),
    yellow: new THREE.MeshStandardMaterial({
        color: "#f6c95c", roughness: .45
    })
};
  yellow: new THREE.MeshStandardMaterial({
    color: "#f6c95c", roughness: .45
  })
};

const hemi = new THREE.HemisphereLight("#d9f0ff", "#435343", 2.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight("#fff0d5", 3.0);
sun.position.set(-22, 35, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.00035;
scene.add(sun);

const fillLight = new THREE.DirectionalLight("#6bbfff", 1.0);
fillLight.position.set(25, 14, -25);
scene.add(fillLight);

const colliders = [];
const solidMeshes = [];
const bots = [];
const effects = [];
const projectiles = [];
const paintMarks = [];
const keys = new Set();

let started = false;
let paused = false;
let finished = false;
let pointerLocked = false;
let elapsed = 0;
let timeLeft = 180;
let blueScore = 0;
let redScore = 0;
let kills = 0;
let shotsFired = 0;
let shotsHit = 0;
let ammo = 20;
let reloading = false;
let reloadTime = 0;
let shotCooldown = 0;
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let onGround = true;
let health = 100;
let stamina = 100;
let respawnTime = 0;
let hitFlashTime = 0;
let toastTime = 0;
let announcementTime = 0;
let enemyFireClock = 0;
let roundIndex = 0;
let killsForLevel = 0;
let level = 1;

const PLAYER_RADIUS = 0.43;
const PLAYER_HEIGHT = 1.7;
const PLAYER_SPEED = 7.0;
const SPRINT_SPEED = 10.2;
const BLUE = new THREE.Color("#39baff");
const RED = new THREE.Color("#ff4d68");

const player = {
  position: new THREE.Vector3(0, 0, 16),
  velocity: new THREE.Vector3(),
  alive: true
};

const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);
const choose = arr => arr[Math.floor(Math.random() * arr.length)];

function box(parent, size, position, material, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material
  );
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (options.solid) {
    colliders.push({
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2
    });
    solidMeshes.push(mesh);
  }
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, position, material, segments = 20) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeCanvasTexture(draw, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ---------------------- ARENA ---------------------- */

function createArena() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    MAT.floor
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = -0.08;
  scene.add(ground);

  const grid = new THREE.GridHelper(100, 50, "#71969b", "#526e73");
  grid.position.y = -0.065;
  grid.material.transparent = true;
  grid.material.opacity = 0.15;
  scene.add(grid);

  const boundaryMat = new THREE.MeshStandardMaterial({
    color: "#263d4b", roughness: .8
  });

  box(scene, [70, 6, 1], [0, 3, -35], boundaryMat, { solid: true });
  box(scene, [70, 6, 1], [0, 3, 35], boundaryMat, { solid: true });
  box(scene, [1, 6, 70], [-35, 3, 0], boundaryMat, { solid: true });
  box(scene, [1, 6, 70], [35, 3, 0], boundaryMat, { solid: true });

  // Colored arena walls.
  for (const side of [-1, 1]) {
    box(scene, [16, .35, .18], [side * 16, 1.2, -34.35],
      side < 0 ? MAT.blue : MAT.red);
    box(scene, [.18, .35, 16], [side * 34.35, 1.2, side * 16],
      side < 0 ? MAT.blue : MAT.red);
  }

  // Painted floor markings.
  const stripeMat = new THREE.MeshBasicMaterial({
    color: "#d8e8e6", transparent: true, opacity: .23
  });

  for (let x = -30; x <= 30; x += 10) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(.075, .015, 60), stripeMat
    );
    stripe.position.set(x, -.055, 0);
    scene.add(stripe);
  }

  const centerCircle = new THREE.Mesh(
    new THREE.TorusGeometry(5, .07, 6, 64),
    new THREE.MeshBasicMaterial({ color: "#d5e8ef", transparent: true, opacity: .55 })
  );
  centerCircle.rotation.x = Math.PI / 2;
  centerCircle.position.y = -.045;
  scene.add(centerCircle);

  // Bunkers: beveled-looking, multicolored cover with accent stripes.
  const bunkerSets = [
    [-16, -16, "blue"], [-8, -24, "red"], [8, -24, "blue"],
    [17, -13, "red"], [-21, -3, "red"], [-10, -7, "blue"],
    [0, -12, "yellow"], [11, -4, "red"], [22, 3, "blue"],
    [-21, 12, "blue"], [-10, 20, "red"], [1, 13, "blue"],
    [12, 20, "yellow"], [22, 17, "red"], [1, 27, "blue"],
    [-2, 2, "red"], [15, 8, "yellow"], [-16, 26, "red"]
  ];

  for (const [x, z, type] of bunkerSets) {
    createBunker(x, z, type);
  }

  // Tall rectangular cover and low parkour platforms.
  const cover = new THREE.MeshStandardMaterial({ color: "#344957", roughness: .66 });
  const trim = new THREE.MeshStandardMaterial({
    color: "#85b4c4", emissive: "#163541", emissiveIntensity: .25
  });

  for (const [x, z, w, d, h] of [
    [-27, -18, 3, 5, 4], [27, -22, 3, 5, 4],
    [-28, 20, 3, 5, 4], [28, 23, 3, 5, 4],
    [-5, -30, 5, 2, 2], [5, 30, 5, 2, 2]
  ]) {
    box(scene, [w, h, d], [x, h / 2, z], cover, { solid: true });
    box(scene, [w + .05, .1, d + .05], [x, h + .03, z], trim);
  }

  // Decorative floodlights.
  const lampMat = new THREE.MeshStandardMaterial({
    color: "#e1f4ff", emissive: "#8bd8ff", emissiveIntensity: 2
  });

  for (const [x, z] of [[-31,-31],[31,-31],[-31,31],[31,31]]) {
    cylinder(scene, .12, .16, 7, [x, 3.5, z], MAT.dark, 12);
    box(scene, [.8, .22, .4], [x, 7, z], lampMat);
    const light = new THREE.PointLight("#7fcfff", 22, 13, 2);
    light.position.set(x, 6.7, z);
    scene.add(light);
  }

  // Low skyline beyond the arena gives depth to the horizon.
  const skylineMat = new THREE.MeshStandardMaterial({
    color: "#718b96", roughness: 1
  });
  for (let i = 0; i < 25; i++) {
    const h = rand(7, 19);
    const x = rand(-65, 65);
    const z = -48 - Math.random() * 15;
    box(scene, [rand(3, 8), h, rand(3, 7)], [x, h / 2 - 1, z], skylineMat,
      { castShadow: false });
  }
}

function createBunker(x, z, type) {
  const base = type === "blue" ? "#167fc4" :
    type === "red" ? "#bd354b" : "#c59b37";

  const material = new THREE.MeshStandardMaterial({
    color: base, roughness: .38, metalness: .04
  });

  const accent = new THREE.MeshStandardMaterial({
    color: type === "blue" ? "#69d9ff" :
      type === "red" ? "#ff91a1" : "#ffe6a1",
    emissive: base, emissiveIntensity: .15, roughness: .32
  });

  const style = Math.floor(Math.random() * 3);

  if (style === 0) {
    // Rounded inflatable cylinder.
    const obj = cylinder(scene, 1.05, 1.35, 3.3, [x, 1.65, z], material, 24);
    obj.scale.z = .8;
    cylinder(scene, 1.07, 1.07, .16, [x, 2.5, z], accent, 24);
    cylinder(scene, 1.2, 1.2, .13, [x, .9, z], accent, 24);
    colliders.push({ minX:x-1.05, maxX:x+1.05, minZ:z-1.05, maxZ:z+1.05 });
    solidMeshes.push(obj);
  } else if (style === 1) {
    const w = rand(2.1, 3.1), h = rand(2.2, 3.6), d = rand(1.7, 2.4);
    box(scene, [w, h, d], [x, h / 2, z], material, { solid: true });
    box(scene, [w * .8, .13, d + .04], [x, h * .72, z], accent);
    box(scene, [w * .8, .13, d + .04], [x, h * .32, z], accent);
  } else {
    // A slanted-looking triangular wedge.
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, 0);
    shape.lineTo(1.6, 0);
    shape.lineTo(1.05, 2.7);
    shape.lineTo(-1.05, 2.7);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.7, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: .09, bevelThickness: .08
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, 0, z - .85);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    colliders.push({ minX:x-1.7, maxX:x+1.7, minZ:z-.95, maxZ:z+.95 });
    solidMeshes.push(mesh);

    box(scene, [2.5, .12, 1.8], [x, 2.05, z], accent);
  }
}

createArena();

/* ---------------------- PLAYER MARKER ---------------------- */

// Marker model attached to the camera: dark receiver, barrel, hopper and accents.
const weapon = new THREE.Group();
camera.add(weapon);
weapon.position.set(.34, -.30, -.58);
weapon.rotation.set(-.035, -.045, -.015);

const gunDark = new THREE.MeshStandardMaterial({
  color: "#202c39", roughness: .38, metalness: .48
});
const gunBlack = new THREE.MeshStandardMaterial({
  color: "#10171e", roughness: .3, metalness: .58
});
const gunBlue = new THREE.MeshStandardMaterial({
  color: "#36baff", emissive: "#0d5282", emissiveIntensity: .65
});

function gunBox(size, pos, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  weapon.add(mesh);
  return mesh;
}

gunBox([.15,.16,.43], [0,0,0], gunDark);
gunBox([.12,.09,.30], [0,-.045,-.25], gunBlack);
gunBox([.055,.055,.48], [0,.025,-.47], gunDark);
gunBox([.065,.065,.12], [0,.025,-.72], gunBlack);
gunBox([.17,.07,.18], [0,.12,-.08], gunDark);
gunBox([.12,.13,.12], [0,.205,-.08], gunBlue);
gunBox([.035,.035,.19], [0,.07,-.28], gunBlue);
gunBox([.10,.12,.12], [0,-.17,.04], gunBlack);

const hopper = new THREE.Mesh(
  new THREE.SphereGeometry(.105, 16, 12),
  new THREE.MeshStandardMaterial({ color: "#263746", roughness: .24, metalness: .3 })
);
hopper.scale.set(1, .65, 1.1);
hopper.position.set(0, .17, -.12);
weapon.add(hopper);

const hopperRing = new THREE.Mesh(
  new THREE.TorusGeometry(.093, .012, 8, 20),
  gunBlue
);
hopperRing.position.set(0, .17, -.12);
hopperRing.rotation.x = Math.PI / 2;
weapon.add(hopperRing);

const gunLight = new THREE.PointLight("#49caff", 1.4, 2);
gunLight.position.set(0, .02, -.65);
weapon.add(gunLight);

/* ---------------------- BOTS ---------------------- */

function createBot(id) {
  const group = new THREE.Group();
  const redBody = new THREE.MeshStandardMaterial({
    color: "#d94c5f", roughness: .5
  });
  const darkBody = new THREE.MeshStandardMaterial({
    color: "#24303e", roughness: .65
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: "#70e3ff", emissive: "#1785bb", emissiveIntensity: .8,
    metalness: .3, roughness: .2
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(.72, .82, .42), redBody);
  torso.position.y = 1.02;
  torso.castShadow = true;
  torso.userData.botId = id;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.26, 16, 12),
    darkBody
  );
  head.position.y = 1.63;
  head.castShadow = true;
  head.userData.botId = id;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(.38, .105, .08), visorMat
  );
  visor.position.set(0, 1.65, -.215);
  visor.userData.botId = id;
  group.add(visor);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(.285, 16, 10, 0, Math.PI * 2, 0, Math.PI * .56),
    MAT.dark
  );
  helmet.position.y = 1.72;
  group.add(helmet);

  // Shoulder pads.
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(
      new THREE.SphereGeometry(.19, 12, 10), redBody
    );
    pad.scale.set(1.15, .8, 1);
    pad.position.set(side * .43, 1.28, 0);
    group.add(pad);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.24, .56, .27), darkBody);
    leg.position.set(side * .19, .34, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(.15, .14, .48), gunDark
  );
  gunBody.position.z = -.15;
  gun.add(gunBody);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(.045, .045, .35, 10),
    gunBlack
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -.5;
  gun.add(barrel);
  gun.position.set(.43, 1.12, -.2);
  group.add(gun);

  scene.add(group);

  const spawn = choose([
    new THREE.Vector3(-24, 0, -24),
    new THREE.Vector3(24, 0, -22),
    new THREE.Vector3(26, 0, 10),
    new THREE.Vector3(-26, 0, 18),
    new THREE.Vector3(18, 0, 27),
    new THREE.Vector3(-18, 0, -2),
    new THREE.Vector3(7, 0, -29)
  ]);

  group.position.copy(spawn);

  const bot = {
    id, group, legs, gun, torso, head, visor,
    health: 100,
    alive: true,
    speed: rand(2.5, 3.7),
    fireCooldown: rand(.6, 1.6),
    respawn: 0,
    strafe: Math.random() < .5 ? -1 : 1,
    strafeTime: rand(1, 3),
    walkPhase: rand(0, 6),
    hitTime: 0
  };

  group.traverse(obj => {
    if (obj.isMesh) obj.userData.bot = bot;
  });

  bots.push(bot);
  return bot;
}

for (let i = 0; i < 6; i++) createBot(i + 1);

function respawnBot(bot) {
  const spawn = choose([
    [-26, 0, -24], [26, 0, -20], [28, 0, 12],
    [-27, 0, 20], [16, 0, 28], [-17, 0, -4], [8, 0, -29]
  ]);
  bot.group.position.set(...spawn);
  bot.group.visible = true;
  bot.health = 100;
  bot.alive = true;
  bot.fireCooldown = rand(.5, 1.4);
  bot.group.rotation.set(0, 0, 0);
}

/* ---------------------- PARTICLES ---------------------- */

function paintMaterial(color, transparent = false) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent,
    opacity: transparent ? .9 : 1,
    depthWrite: !transparent
  });
}

function spawnSplash(position, color, count = 18, scale = 1) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const palette = [
    c, c.clone().lerp(new THREE.Color("#ffffff"), .4),
    c.clone().multiplyScalar(.65)
  ];

  // A quick, colorful paint impact burst.
  for (let i = 0; i < count; i++) {
    const radius = rand(.035, .105) * scale;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 7, 6),
      paintMaterial(choose(palette))
    );
    mesh.position.copy(position);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      rand(-1, 1), rand(-.25, 1.25), rand(-1, 1)
    ).normalize().multiplyScalar(rand(1.3, 5) * scale);

    effects.push({
      mesh, velocity, life: rand(.22, .55),
      maxLife: .55, gravity: 6.5, shrink: true
    });
  }

  // A larger translucent paint puff.
  const puff = new THREE.Mesh(
    new THREE.SphereGeometry(.16 * scale, 12, 10),
    new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: .48,
      depthWrite: false
    })
  );
  puff.position.copy(position);
  scene.add(puff);
  effects.push({
    mesh: puff, velocity: new THREE.Vector3(0, .45, 0),
    life: .23, maxLife: .23, gravity: 0, puff: true
  });

  // Persistent tiny splat on a nearby surface.
  if (Math.random() < .48) {
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(rand(.12, .23), 9, 7),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .72 })
    );
    mark.scale.set(1, .13, 1);
    mark.position.copy(position);
    mark.position.y += .025;
    scene.add(mark);
    paintMarks.push(mark);
    if (paintMarks.length > 100) {
      scene.remove(paintMarks.shift());
    }
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;

    if (e.life <= 0) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }

    e.mesh.position.addScaledVector(e.velocity, dt);
    e.velocity.y -= e.gravity * dt;

    if (e.puff) {
      const k = 1 - e.life / e.maxLife;
      e.mesh.scale.setScalar(1 + k * 2.8);
      e.mesh.material.opacity = .48 * (1 - k);
    } else if (e.shrink) {
      e.mesh.scale.setScalar(Math.max(.05, e.life / e.maxLife));
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.velocity.y -= 1.7 * dt;

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function createProjectile(start, end, color, speed = 85) {
  const direction = end.clone().sub(start).normalize();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(.055, 10, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.position.copy(start);
  scene.add(mesh);

  projectiles.push({
    mesh, velocity: direction.multiplyScalar(speed), life: .22
  });
}

/* ---------------------- MOVEMENT / COLLISION ---------------------- */

function collides(x, z, radius = PLAYER_RADIUS) {
  // The arena boundary.
  if (x < -32.5 + radius || x > 32.5 - radius ||
      z < -32.5 + radius || z > 32.5 - radius) return true;

  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX &&
        z + radius > c.minZ && z - radius < c.maxZ) {
      return true;
    }
  }
  return false;
}

function moveWithCollision(position, dx, dz, radius = PLAYER_RADIUS) {
  const nx = position.x + dx;
  if (!collides(nx, position.z, radius)) position.x = nx;

  const nz = position.z + dz;
  if (!collides(position.x, nz, radius)) position.z = nz;
}

function updatePlayer(dt) {
  if (!player.alive) {
    respawnTime -= dt;
    if (respawnTime <= 0) respawnPlayer();
    return;
  }

  let forward = 0, side = 0;
  if (keys.has("KeyW")) forward += 1;
  if (keys.has("KeyS")) forward -= 1;
  if (keys.has("KeyD")) side += 1;
  if (keys.has("KeyA")) side -= 1;

  const moving = forward !== 0 || side !== 0;
  const sprinting = moving && keys.has("ShiftLeft") && stamina > 0;

  if (sprinting) stamina = Math.max(0, stamina - 29 * dt);
  else stamina = Math.min(100, stamina + 18 * dt);

  if (forward || side) {
    const len = Math.hypot(forward, side);
    forward /= len;
    side /= len;

    const speed = sprinting ? SPRINT_SPEED : PLAYER_SPEED;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const dx = (side * cos - forward * sin) * speed * dt;
    const dz = (-forward * cos - side * sin) * speed * dt;

    moveWithCollision(player.position, dx, dz);
    weapon.position.x = .34 + Math.sin(elapsed * (sprinting ? 17 : 11)) * .009;
    weapon.position.y = -.30 + Math.abs(Math.sin(elapsed * (sprinting ? 17 : 11))) * .012;
  } else {
    weapon.position.x = THREE.MathUtils.damp(weapon.position.x, .34, 7, dt);
    weapon.position.y = THREE.MathUtils.damp(weapon.position.y, -.30, 7, dt);
  }

  if (keys.has("Space") && onGround && player.alive) {
    verticalVelocity = 7.1;
    onGround = false;
  }

  verticalVelocity -= 18 * dt;
  player.position.y += verticalVelocity * dt;

  if (player.position.y <= 0) {
    player.position.y = 0;
    verticalVelocity = 0;
    onGround = true;
  }

  camera.position.set(
    player.position.x,
    player.position.y + PLAYER_HEIGHT,
    player.position.z
  );
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

function respawnPlayer() {
  player.position.set(rand(-3, 3), 0, 25);
  player.velocity.set(0, 0, 0);
  player.alive = true;
  health = 100;
  respawnTime = 0;
  verticalVelocity = 0;
  onGround = true;
  showToast("BACK IN THE ARENA");
  updateHUD();
}

/* ---------------------- SHOOTING ---------------------- */

function shoot() {
  if (!started || paused || finished || !pointerLocked ||
      reloading || !player.alive || shotCooldown > 0) return;

  if (ammo <= 0) {
    showToast("EMPTY MARKER — PRESS R TO RELOAD");
    return;
  }

  ammo--;
  shotsFired++;
  shotCooldown = .19;
  weapon.rotation.x = -.12;
  weapon.position.z = -.50;

  $("crosshair").classList.add("shooting");
  setTimeout(() => $("crosshair").classList.remove("shooting"), 65);

  const origin = camera.position.clone();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  raycaster.set(origin, direction);

  const targets = [...solidMeshes];
  for (const bot of bots) {
    if (bot.alive) {
      bot.group.traverse(obj => {
        if (obj.isMesh) targets.push(obj);
      });
    }
  }

  const hits = raycaster.intersectObjects(targets, false);
  let end = origin.clone().addScaledVector(direction, 65);

  if (hits.length) {
    end.copy(hits[0].point);
    const obj = hits[0].object;
    const bot = obj.userData.bot;

    if (bot && bot.alive) {
      shotsHit++;
      damageBot(bot, 34);
      $("crosshair").classList.add("hit");
      $("hitmarker").classList.remove("show");
      void $("hitmarker").offsetWidth;
      $("hitmarker").classList.add("show");
      setTimeout(() => $("crosshair").classList.remove("hit"), 110);
    } else {
      spawnSplash(end, BLUE, 10, .65);
    }
  }

  const muzzle = new THREE.Vector3();
  weapon.localToWorld(muzzle.set(0, .02, -.73));
  createProjectile(muzzle, end, "#54d4ff", 105);

  updateHUD();
}

function damageBot(bot, amount) {
  bot.health -= amount;
  bot.hitTime = .12;
  spawnSplash(
    bot.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
    BLUE, 14, .8
  );

  if (bot.health <= 0) {
    bot.alive = false;
    bot.group.visible = false;
    bot.respawn = rand(3.5, 5.5);
    blueScore++;
    kills++;
    killsForLevel++;

    addFeed("YOU", "BOT " + bot.id);
    showAnnouncement("ELIMINATION +100", "#75d9ff");

    if (killsForLevel >= 4) {
      killsForLevel = 0;
      level++;
      showToast("LEVEL UP! YOU ARE NOW LEVEL " + level);
      $("level").textContent = String(level).padStart(2, "0");
    }

    updateHUD();
  }
}

function enemyShoot(bot) {
  if (!player.alive) return;

  const start = bot.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const end = camera.position.clone();
  end.x += rand(-.8, .8);
  end.y += rand(-.5, .5);
  end.z += rand(-.8, .8);

  createProjectile(start, end, "#ff536c", 42);

  // Simulated incoming paintball accuracy.
  const distance = start.distanceTo(camera.position);
  const hitChance = clamp(.62 - distance * .014, .16, .55);

  if (Math.random() < hitChance) {
    health = Math.max(0, health - rand(5, 10));
    $("damage-flash").classList.remove("show");
    void $("damage-flash").offsetWidth;
    $("damage-flash").classList.add("show");
    hitFlashTime = .3;
    updateHUD();

    if (health <= 0) {
      player.alive = false;
      respawnTime = 3;
      redScore++;
      addFeed("BOT " + bot.id, "YOU");
      showAnnouncement("YOU WERE TAGGED", "#ff6a7f");
      showToast("RESPAWNING IN 3 SECONDS");
      updateHUD();
    }
  }
}

/* ---------------------- BOT AI ---------------------- */

function updateBots(dt) {
  for (const bot of bots) {
    if (!bot.alive) {
      bot.respawn -= dt;
      if (bot.respawn <= 0 && !finished) respawnBot(bot);
      continue;
    }

    bot.fireCooldown -= dt;
    bot.strafeTime -= dt;
    bot.walkPhase += dt * 8;

    if (bot.strafeTime <= 0) {
      bot.strafe *= -1;
      bot.strafeTime = rand(1.1, 2.6);
    }

    const pos = bot.group.position;
    const target = player.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > .01) {
      // Face the player.
      bot.group.rotation.y = Math.atan2(-dx, -dz);

      // Approach, retreat if too close, and strafe to avoid standing still.
      let forward = dist > 10 ? 1 : dist < 5 ? -.45 : 0;
      let strafe = dist < 20 ? bot.strafe * .45 : 0;

      let vx = (dx / dist) * forward + (dz / dist) * strafe;
      let vz = (dz / dist) * forward - (dx / dist) * strafe;
      const len = Math.hypot(vx, vz);

      if (len > .01) {
        vx /= len;
        vz /= len;
        const stepX = vx * bot.speed * dt;
        const stepZ = vz * bot.speed * dt;

        if (!collides(pos.x + stepX, pos.z, .5)) pos.x += stepX;
        if (!collides(pos.x, pos.z + stepZ, .5)) pos.z += stepZ;

        bot.legs[0].rotation.x = Math.sin(bot.walkPhase) * .48;
        bot.legs[1].rotation.x = Math.sin(bot.walkPhase + Math.PI) * .48;
        bot.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * .035;
      } else {
        bot.legs[0].rotation.x = THREE.MathUtils.damp(bot.legs[0].rotation.x, 0, 8, dt);
        bot.legs[1].rotation.x = THREE.MathUtils.damp(bot.legs[1].rotation.x, 0, 8, dt);
        bot.group.position.y = 0;
      }
    }

    // Shoot only when reasonably close, with line-of-sight checks.
    if (dist < 27 && dist > 3.5 && bot.fireCooldown <= 0) {
      const from = pos.clone().add(new THREE.Vector3(0, 1.35, 0));
      const to = camera.position.clone();
      const direction = to.sub(from).normalize();

      raycaster.set(from, direction);
      raycaster.far = dist;

      const wallHits = raycaster.intersectObjects(solidMeshes, false);
      raycaster.far = 85;

      if (!wallHits.length || wallHits[0].distance > dist - 1) {
        enemyShoot(bot);
      }

      bot.fireCooldown = rand(1.0, 1.9);
    }
  }
}

/* ---------------------- HUD / MATCH ---------------------- */

function updateHUD() {
  $("healthText").textContent = Math.ceil(health) + " / 100";
  $("healthBar").style.width = health + "%";
  $("staminaText").textContent = Math.ceil(stamina) + "%";
  $("staminaBar").style.width = stamina + "%";
  $("ammo").textContent = ammo;
  $("ammoBar").style.width = (ammo / 20 * 100) + "%";
  $("blueScore").textContent = blueScore;
  $("redScore").textContent = redScore;
  $("level").textContent = String(level).padStart(2, "0");

  $("healthBar").style.background =
    health < 30 ? "linear-gradient(90deg,#ff435d,#ff8a9a)" :
    "linear-gradient(90deg,#20d6a1,#9df3c5)";

  $("statusMessage").textContent = !player.alive ?
    "RESPAWNING..." : health < 30 ? "WARNING: LOW HEALTH" :
    stamina < 20 ? "STAMINA LOW" : "READY FOR ACTION";
  $("statusMessage").style.color = health < 30 ? "#ff6175" : "#61e6b3";
}

function updateTimer(dt) {
  if (!started || paused || finished) return;
  timeLeft -= dt;

  if (timeLeft <= 0) {
    timeLeft = 0;
    finishMatch();
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = Math.floor(timeLeft % 60);
  $("timer").textContent =
    String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

function finishMatch() {
  finished = true;
  started = false;
  document.exitPointerLock?.();

  $("endScreen").classList.remove("hidden");
  $("endTitle").innerHTML =
    blueScore === redScore ? 'DRAW<span>.</span>' :
    blueScore > redScore ? 'VICTORY<span>.</span>' : 'DEFEAT<span>.</span>';

  $("endSummary").textContent =
    `Final score: Blue ${blueScore} — Red ${redScore}.`;
  $("finalKills").textContent = kills;
  $("finalAccuracy").textContent =
    shotsFired ? Math.round(shotsHit / shotsFired * 100) + "%" : "0%";
}

function addFeed(killer, victim) {
  const feed = document.createElement("div");
  feed.className = "feed-item";
  feed.innerHTML =
    `<span class="killer"></span> <span class="weapon">[PAINT]</span> <span class="victim"></span>`;
  feed.querySelector(".killer").textContent = killer;
  feed.querySelector(".victim").textContent = victim;
  $("killFeed").prepend(feed);

  while ($("killFeed").children.length > 4) {
    $("killFeed").lastElementChild.remove();
  }
}

function showAnnouncement(text, color = "#ffffff") {
  const el = $("announcement");
  el.textContent = text;
  el.style.color = color;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  announcementTime = 1.6;
}

function showToast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  toastTime = 2.1;
}

function startReload() {
  if (!started || paused || finished || reloading || ammo === 20) return;
  reloading = true;
  reloadTime = 1.45;
  $("reloadText").textContent = "RELOADING...";
  showToast("RELOADING MARKER");
}

function resetMatch() {
  blueScore = 0;
  redScore = 0;
  kills = 0;
  shotsFired = 0;
  shotsHit = 0;
  ammo = 20;
  reloading = false;
  reloadTime = 0;
  health = 100;
  stamina = 100;
  level = 1;
  killsForLevel = 0;
  elapsed = 0;
  timeLeft = 180;
  roundIndex = 0;
  player.alive = true;
  player.position.set(0, 0, 16);
  verticalVelocity = 0;
  onGround = true;
  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  camera.position.set(0, PLAYER_HEIGHT, 16);
  $("killFeed").replaceChildren();
  $("timer").textContent = "03:00";
  $("reloadText").innerHTML = "LMB FIRE <span>·</span> R RELOAD";

  for (const bot of bots) respawnBot(bot);
  updateHUD();
}

function beginMatch() {
  resetMatch();
  started = true;
  paused = false;
  finished = false;
  $("startScreen").classList.add("hidden");
  $("pauseScreen").classList.add("hidden");
  $("endScreen").classList.add("hidden");
  showAnnouncement("ROUND START", "#74dcff");
  renderer.domElement.requestPointerLock();
}

function togglePause() {
  if (!started || finished) return;
  if (paused) {
    paused = false;
    $("pauseScreen").classList.add("hidden");
    renderer.domElement.requestPointerLock();
  } else {
    paused = true;
    $("pauseScreen").classList.remove("hidden");
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

/* ---------------------- INPUT ---------------------- */

$("playButton").addEventListener("click", beginMatch);
$("resumeButton").addEventListener("click", () => {
  if (started && paused) togglePause();
});
$("restartButton").addEventListener("click", beginMatch);
$("againButton").addEventListener("click", beginMatch);

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;

  if (!pointerLocked && started && !paused && !finished) {
    paused = true;
    $("pauseScreen").classList.remove("hidden");
  }
});

document.addEventListener("mousemove", e => {
  if (!pointerLocked || paused || !started) return;

  yaw -= e.movementX * .0021;
  pitch -= e.movementY * .0018;
  pitch = clamp(pitch, -1.35, 1.35);
});

document.addEventListener("mousedown", e => {
  if (e.button === 0) shoot();
});

document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }

  keys.add(e.code);

  if (e.code === "Escape" && started && !finished) {
    // Pointer-lock loss automatically opens the pause menu.
    if (pointerLocked) document.exitPointerLock();
  }

  if (e.code === "KeyR") startReload();
});

document.addEventListener("keyup", e => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

/* ---------------------- RESIZE / MAIN LOOP ---------------------- */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
});

function updateWeapon(dt) {
  shotCooldown = Math.max(0, shotCooldown - dt);
  weapon.rotation.x = THREE.MathUtils.damp(weapon.rotation.x, 0, 13, dt);
  weapon.position.z = THREE.MathUtils.damp(weapon.position.z, -.58, 13, dt);

  if (reloading) {
    reloadTime -= dt;
    weapon.rotation.x = -.28 * Math.sin((1.45 - reloadTime) / 1.45 * Math.PI);

    if (reloadTime <= 0) {
      ammo = 20;
      reloading = false;
      $("reloadText").innerHTML = "LMB FIRE <span>·</span> R RELOAD";
      showToast("MARKER READY");
      updateHUD();
    }
  }

  if (hitFlashTime > 0) hitFlashTime -= dt;
  if (toastTime > 0) {
    toastTime -= dt;
    if (toastTime <= 0) $("toast").classList.remove("show");
  }
  if (announcementTime > 0) announcementTime -= dt;
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), .033);
  elapsed += dt;

  if (started && !paused && !finished) {
    updatePlayer(dt);
    updateBots(dt);
    updateTimer(dt);
    updateWeapon(dt);
    updateEffects(dt);

    if (player.alive) {
      camera.position.set(
        player.position.x,
        player.position.y + PLAYER_HEIGHT,
        player.position.z
      );
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
  } else {
    updateEffects(dt);
    updateWeapon(dt);
  }

  renderer.render(scene, camera);
}

updateHUD();
camera.position.set(0, PLAYER_HEIGHT, 16);
animate();

/* ==========================================================
   PAINTSTRIKE — PEERJS MULTIPLAYER CONNECTION
   Append this after the existing animate(); call.
   ========================================================== */

(() => {
  const createBtn = $("create-room-btn");
  const joinBtn = $("join-room-btn");
  const roomInput = $("room-code-input");
  const status = $("multiplayer-status");
  const codeDisplay = $("room-code-display");
  const copyBtn = $("copy-room-btn");

  if (!createBtn || !joinBtn || !roomInput || !status) {
    console.error("Multiplayer menu elements are missing from index.html.");
    return;
  }

  const PeerClass = window.Peer;
  let peer = null;
  let isHost = false;
  let localPlayerId = "";
  let sendTimer = null;

  const connections = new Map();
  const remotePlayers = new Map();

  function setStatus(message) {
    status.textContent = message;
  }

  function createRemotePlayer(id) {
    if (remotePlayers.has(id)) return remotePlayers.get(id);

    const group = new THREE.Group();

    const isBlue = id === "host";
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isBlue ? "#168bfa" : "#e83e59",
      roughness: 0.55
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: "#192735",
      roughness: 0.6
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: "#70e3ff",
      emissive: "#1785bb",
      emissiveIntensity: 0.7
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.82, 0.42),
      bodyMat
    );
    body.position.y = 1.02;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 14, 10),
      darkMat
    );
    head.position.y = 1.63;
    head.castShadow = true;
    group.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.1, 0.08),
      visorMat
    );
    visor.position.set(0, 1.65, -0.215);
    group.add(visor);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.65),
      darkMat
    );
    marker.position.set(0.43, 1.12, -0.35);
    group.add(marker);

    scene.add(group);

    const remote = { group, lastSeen: performance.now() };
    remotePlayers.set(id, remote);

    return remote;
  }

  function removeRemotePlayer(id) {
    const remote = remotePlayers.get(id);
    if (!remote) return;

    scene.remove(remote.group);
    remote.group.traverse(object => {
      if (object.isMesh) {
        object.geometry.dispose();
        // Materials are shared or local; don't dispose shared materials.
      }
    });

    remotePlayers.delete(id);
  }

  function updateRemotePlayer(id, state) {
    if (!state || !Number.isFinite(state.x) ||
        !Number.isFinite(state.y) || !Number.isFinite(state.z) ||
        !Number.isFinite(state.yaw)) {
      return;
    }

    const remote = createRemotePlayer(id);
    remote.lastSeen = performance.now();

    remote.group.position.set(state.x, state.y, state.z);
    remote.group.rotation.y = state.yaw;
  }

  function sendToAll(message, exceptPeer = null) {
    for (const [peerId, connection] of connections) {
      if (peerId === exceptPeer) continue;
      if (connection.open) {
        try {
          connection.send(message);
        } catch (error) {
          console.warn("Could not send multiplayer message:", error);
        }
      }
    }
  }

  function playerStateMessage() {
    return {
      type: "player-state",
      playerId: localPlayerId,
      state: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw
      }
    };
  }

  function handleMessage(connection, message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "player-state") {
      if (typeof message.playerId !== "string" ||
          message.playerId === localPlayerId) return;

      updateRemotePlayer(message.playerId, message.state);

      // The room host relays guest movement to other guests.
      if (isHost) sendToAll(message, connection.peer);
    }
  }

  function registerConnection(connection) {
    connections.set(connection.peer, connection);

    connection.on("open", () => {
      setStatus("Connected to room!");
      connection.send({ type: "welcome" });
    });

    connection.on("data", message => {
      handleMessage(connection, message);
    });

    connection.on("close", () => {
      connections.delete(connection.peer);
      removeRemotePlayer(connection.peer);
      setStatus(
        connections.size
          ? "Connected. Players: " + (connections.size + 1)
          : "A player disconnected."
      );
    });

    connection.on("error", error => {
      console.error("Peer connection error:", error);
      setStatus("Connection problem. Check the room code and try again.");
    });
  }

  function startStateSync() {
    if (sendTimer) clearInterval(sendTimer);

    sendTimer = setInterval(() => {
      if (!peer || peer.destroyed) return;

      const message = playerStateMessage();

      if (isHost) {
        sendToAll(message);
      } else {
        const hostConnection = connections.values().next().value;
        if (hostConnection && hostConnection.open) {
          try {
            hostConnection.send(message);
          } catch (error) {
            console.warn("Could not send player state:", error);
          }
        }
      }
    }, 50);
  }

  function createRoom() {
    if (!PeerClass) {
      setStatus("PeerJS did not load. Check the PeerJS script in index.html.");
      return;
    }

    if (peer) {
      setStatus("You already have a room or connection.");
      return;
    }

    isHost = true;
    localPlayerId = "host";

    const roomCode = Math.random().toString(36)
      .slice(2, 8).toUpperCase();

    const roomPeerId = "paintstrike-room-" + roomCode;

    setStatus("Creating room...");

    try {
      peer = new PeerClass(roomPeerId);
    } catch (error) {
      console.error(error);
      setStatus("Could not create room. Please try again.");
      peer = null;
      return;
    }

    peer.on("open", () => {
      codeDisplay.textContent = "ROOM CODE: " + roomCode;
      if (copyBtn) copyBtn.hidden = false;
      roomInput.value = roomCode;
      setStatus("Room ready! Share the code with a friend.");
      startStateSync();
    });

    peer.on("connection", connection => {
      registerConnection(connection);
      setStatus("A player is joining...");
    });

    peer.on("error", error => {
      console.error("PeerJS room error:", error);

      if (error.type === "unavailable-id") {
        setStatus("Room code collision. Click CREATE ROOM again.");
      } else {
        setStatus("Could not create room: " + error.type);
      }

      if (peer && !peer.open) {
        peer.destroy();
        peer = null;
      }
    });
  }

  function joinRoom() {
    if (!PeerClass) {
      setStatus("PeerJS did not load. Check the PeerJS script in index.html.");
      return;
    }

    if (peer) {
      setStatus("You already have a room or connection.");
      return;
    }

    const roomCode = roomInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      setStatus("Enter the complete 6-character room code.");
      roomInput.focus();
      return;
    }

    isHost = false;
    localPlayerId = "";

    setStatus("Connecting to room...");

    try {
      peer = new PeerClass();
    } catch (error) {
      console.error(error);
      setStatus("Could not start PeerJS. Please refresh the page.");
      peer = null;
      return;
    }

    peer.on("open", () => {
      localPlayerId = peer.id;
      const connection = peer.connect(
        "paintstrike-room-" + roomCode,
        { reliable: true }
      );

      registerConnection(connection);
    });

    peer.on("error", error => {
      console.error("PeerJS join error:", error);
      setStatus(
        error.type === "peer-unavailable"
          ? "Room not found. Ask the host to create it again."
          : "Connection failed: " + error.type
      );
    });
  }

  createBtn.addEventListener("click", createRoom);
  joinBtn.addEventListener("click", joinRoom);

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const roomCode = roomInput.value.trim();

      try {
        await navigator.clipboard.writeText(roomCode);
        setStatus("Room code copied: " + roomCode);
      } catch {
        roomInput.focus();
        roomInput.select();
        setStatus("Copy failed. Select the room code and copy it manually.");
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    if (sendTimer) clearInterval(sendTimer);
    if (peer) peer.destroy();
  });
})();
