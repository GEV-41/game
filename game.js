import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const menu = document.getElementById("menu");
const statusText = document.getElementById("status");
const playButton = document.getElementById("playButton");
const hud = document.getElementById("hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101827);
scene.fog = new THREE.Fog(0x101827, 35, 100);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 1.7, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc5ddff, 0x263044, 2));

const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 5);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: 0x303b4d })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

scene.add(new THREE.GridHelper(100, 50, 0x526680, 0x344357));

function addBox(x, y, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

for (let i = -45; i <= 45; i += 15) {
  addBox(i, 1.5, -48, 8, 3, 1, 0x53667f);
  addBox(i, 1.5, 48, 8, 3, 1, 0x53667f);
  addBox(-48, 1.5, i, 1, 3, 8, 0x53667f);
  addBox(48, 1.5, i, 1, 3, 8, 0x53667f);
}

for (let i = 0; i < 24; i++) {
  const x = (Math.random() - 0.5) * 75;
  const z = (Math.random() - 0.5) * 75;
  if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;

  addBox(x, 1, z, 3, 2, 3, i % 2 ? 0x46566b : 0x38485c);
}

let socket;
let myId;
let myPlayer;
let started = false;
let yaw = 0;
let pitch = 0;
let lastSend = 0;

const keys = {};
const remotePlayers = {};
const raycaster = new THREE.Raycaster();

function createPlayer(player) {
  const group = new THREE.Group();
  const color = player.team === "RED" ? 0xff384c : 0x268bff;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1, 0.4),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.y = 1.1;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd1ad })
  );
  head.position.y = 1.8;
  group.add(head);

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x202630 })
  );
  gun.position.set(0.45, 1.2, -0.4);
  group.add(gun);

  scene.add(group);
  return group;
}

function updatePlayer(player) {
  if (player.id === myId) return;

  if (!remotePlayers[player.id]) {
    remotePlayers[player.id] = createPlayer(player);
  }

  const model = remotePlayers[player.id];
  model.position.set(player.x, 0, player.z);
  model.rotation.y = player.rotation || 0;
}

function updatePlayerCount() {
  document.getElementById("playerCount").textContent =
    "Players: " + (Object.keys(remotePlayers).length + (myPlayer ? 1 : 0));
}

function updateHealth() {
  const health = Math.max(0, myPlayer?.health ?? 100);
  document.getElementById("healthText").textContent = health;
  document.getElementById("healthFill").style.width = health + "%";
}

playButton.addEventListener("click", () => {
  if (started) return;

  if (typeof window.io !== "function") {
    statusText.textContent = "Multiplayer server is not connected.";
    return;
  }

  playButton.disabled = true;
  statusText.textContent = "Connecting...";

  socket = window.io();

  socket.on("connect_error", () => {
    statusText.textContent = "Connection failed. Check your server.";
    playButton.disabled = false;
  });

  socket.on("welcome", data => {
    myId = data.id;
    myPlayer = data.players[myId];

    if (!myPlayer) {
      statusText.textContent = "Could not load player.";
      playButton.disabled = false;
      return;
    }

    for (const id in data.players) {
      if (id !== myId) updatePlayer(data.players[id]);
    }

    document.getElementById("redScore").textContent = data.scores.RED;
    document.getElementById("blueScore").textContent = data.scores.BLUE;

    camera.position.set(myPlayer.x, 1.7, myPlayer.z);
    started = true;
    menu.style.display = "none";
    hud.hidden = false;
    updatePlayerCount();
  });

  socket.on("playerJoined", updatePlayer);
  socket.on("playerMoved", updatePlayer);

  socket.on("playerLeft", id => {
    if (remotePlayers[id]) {
      scene.remove(remotePlayers[id]);
      delete remotePlayers[id];
    }
    updatePlayerCount();
  });

  socket.on("playerHit", data => {
    if (data.id === myId) {
      myPlayer.health = data.health;
      updateHealth();
    }
  });

  socket.on("playerRespawned", player => {
    if (player.id === myId) {
      myPlayer = player;
      camera.position.set(player.x, 1.7, player.z);
      updateHealth();
    } else {
      updatePlayer(player);
    }
  });

  socket.on("scores", scores => {
    document.getElementById("redScore").textContent = scores.RED;
    document.getElementById("blueScore").textContent = scores.BLUE;
  });
});

document.addEventListener("keydown", e => keys[e.code] = true);
document.addEventListener("keyup", e => keys[e.code] = false);

document.addEventListener("mousemove", e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.002;
  pitch -= e.movementY * 0.002;
  pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
});

renderer.domElement.addEventListener("click", () => {
  if (!started) return;

  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const models = Object.values(remotePlayers);
  const hits = raycaster.intersectObjects(models, true);

  if (hits.length) {
    let model = hits[0].object;
    while (model.parent && !models.includes(model)) model = model.parent;

    const targetId = Object.keys(remotePlayers).find(
      id => remotePlayers[id] === model
    );

    if (targetId) socket.emit("shoot", targetId);
  }
});

function animate(time = 0) {
  requestAnimationFrame(animate);

  if (started && myPlayer) {
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    const speed = keys.ShiftLeft ? 0.16 : 0.09;
    let forward = Number(!!keys.KeyW) - Number(!!keys.KeyS);
    let side = Number(!!keys.KeyD) - Number(!!keys.KeyA);
    const length = Math.hypot(forward, side);

    if (length) {
      forward /= length;
      side /= length;

      camera.position.x +=
        (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed;

      camera.position.z +=
        (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed;
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -46, 46);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -46, 46);
    camera.position.y = 1.7;

    myPlayer.x = camera.position.x;
    myPlayer.z = camera.position.z;
    myPlayer.rotation = yaw;

    if (socket && time - lastSend > 50) {
      socket.emit("move", {
        x: myPlayer.x,
        z: myPlayer.z,
        rotation: yaw
      });
      lastSend = time;
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
