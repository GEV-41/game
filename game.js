
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const players = {};
const scores = { blue: 0, orange: 0 };
const MAX_HEALTH = 100;

app.use(express.static("public"));

function makePlayer(id) {
  const blueCount = Object.values(players).filter(
    p => p.team === "blue"
  ).length;
  const orangeCount = Object.values(players).filter(
    p => p.team === "orange"
  ).length;
  const team = blueCount <= orangeCount ? "blue" : "orange";

  return {
    id,
    name: "Player " + id.slice(0, 4),
    team,
    x: team === "blue" ? -8 : 8,
    y: 1.7,
    z: Math.random() * 6 - 3,
    rot: 0,
    health: MAX_HEALTH,
    alive: true,
    lastShot: 0
  };
}

function publicState() {
  return {
    players,
    scores
  };
}

function respawn(player) {
  player.health = MAX_HEALTH;
  player.alive = true;
  player.x = player.team === "blue" ? -8 : 8;
  player.y = 1.7;
  player.z = Math.random() * 6 - 3;
  io.emit("respawn", {
    id: player.id,
    x: player.x,
    y: player.y,
    z: player.z,
    health: player.health
  });
}

io.on("connection", socket => {
  players[socket.id] = makePlayer(socket.id);

  socket.emit("welcome", {
    id: socket.id,
    team: players[socket.id].team,
    state: publicState()
  });

  io.emit("state", publicState());

  socket.on("move", data => {
    const p = players[socket.id];
    if (!p || !p.alive || !data) return;

    const x = Number(data.x);
    const z = Number(data.z);
    const rot = Number(data.rot);

    if (![x, z, rot].every(Number.isFinite)) return;

    // Keep players inside the arena.
    p.x = Math.max(-23, Math.min(23, x));
    p.z = Math.max(-23, Math.min(23, z));
    p.rot = rot;
  });

  socket.on("shoot", data => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive) return;

    const now = Date.now();
    if (now - shooter.lastShot < 250) return;
    shooter.lastShot = now;

    const target = data && players[data.targetId];

    io.emit("paintball", {
      shooterId: socket.id,
      targetId: target ? target.id : null,
      from: { x: shooter.x, y: shooter.y, z: shooter.z }
    });

    if (!target || !target.alive) return;
    if (target.team === shooter.team) return;

    // Basic range validation.
    const dx = target.x - shooter.x;
    const dz = target.z - shooter.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > 45) return;

    target.health = Math.max(0, target.health - 25);

    io.emit("hit", {
      targetId: target.id,
      shooterId: shooter.id,
      health: target.health
    });

    if (target.health <= 0) {
      target.alive = false;
      scores[shooter.team] += 1;
      io.emit("scores", scores);

      setTimeout(() => {
        if (players[target.id]) respawn(players[target.id]);
      }, 1800);
    }

    io.emit("state", publicState());
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("state", publicState());
  });
});

setInterval(() => {
  io.emit("state", publicState());
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PAINTSTRIKE is running on port ${PORT}`);
});
