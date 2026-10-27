const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
const scores = { blue: 0, orange: 0 };

function createPlayer(id) {
  const blue = Object.values(players).filter(p => p.team === "blue").length;
  const orange = Object.values(players).filter(p => p.team === "orange").length;
  const team = blue <= orange ? "blue" : "orange";

  return {
    id,
    team,
    x: team === "blue" ? -8 : 8,
    y: 1.7,
    z: Math.random() * 8 - 4,
    rot: 0,
    health: 100,
    alive: true,
    lastShot: 0
  };
}

function broadcastState() {
  io.emit("state", { players, scores });
}

function respawn(p) {
  p.health = 100;
  p.alive = true;
  p.x = p.team === "blue" ? -8 : 8;
  p.y = 1.7;
  p.z = Math.random() * 8 - 4;
  io.emit("respawn", {
    id: p.id, x: p.x, y: p.y, z: p.z, health: 100
  });
  broadcastState();
}

io.on("connection", socket => {
  players[socket.id] = createPlayer(socket.id);

  socket.emit("welcome", {
    id: socket.id,
    team: players[socket.id].team,
    state: { players, scores }
  });

  broadcastState();

  socket.on("move", data => {
    const p = players[socket.id];
    if (!p || !p.alive || !data) return;

    if (![data.x, data.z, data.rot].every(Number.isFinite)) return;

    p.x = Math.max(-27, Math.min(27, data.x));
    p.z = Math.max(-27, Math.min(27, data.z));
    p.rot = data.rot;
    p.y = 1.7;
  });

  socket.on("shoot", data => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive) return;

    const now = Date.now();
    if (now - shooter.lastShot < 250) return;
    shooter.lastShot = now;

    const target = data && players[data.targetId];

    io.emit("paintball", {
      shooterId: shooter.id,
      targetId: target ? target.id : null,
      from: { x: shooter.x, y: shooter.y, z: shooter.z }
    });

    if (!target || !target.alive || target.team === shooter.team) return;

    const dx = target.x - shooter.x;
    const dz = target.z - shooter.z;
    if (Math.hypot(dx, dz) > 45) return;

    target.health = Math.max(0, target.health - 25);

    io.emit("hit", {
      targetId: target.id,
      shooterId: shooter.id,
      health: target.health
    });

    if (target.health === 0) {
      target.alive = false;
      scores[shooter.team]++;
      io.emit("scores", scores);

      setTimeout(() => {
        if (players[target.id]) respawn(players[target.id]);
      }, 1800);
    }

    broadcastState();
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    broadcastState();
  });
});

setInterval(broadcastState, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`PAINTSTRIKE running on port ${PORT}`);
});
