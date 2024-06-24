const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let players = {};
let bullets = [];
let gun = null;
const mapSize = { width: 1600, height: 1200 };

// Static obstacles
const obstacles = [
  { x: 100, y: 100, width: 300, height: 50 },
  { x: 500, y: 300, width: 100, height: 300 },
  { x: 700, y: 100, width: 50, height: 200 },
  { x: 900, y: 500, width: 300, height: 50 },
  { x: 200, y: 700, width: 100, height: 300 },
  { x: 1100, y: 800, width: 300, height: 50 },
  { x: 1300, y: 200, width: 100, height: 300 },
  { x: 1400, y: 600, width: 50, height: 200 }
];

io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  socket.on('joinGame', (username) => {
    players[socket.id] = {
      id: socket.id,
      username: username,
      x: Math.random() * mapSize.width,
      y: Math.random() * mapSize.height,
      width: 50,
      height: 50,
      color: 'blue',
      health: 100,
      hasGun: false,
      ammo: 10,
      swordAngle: 0,
      kills: 0
    };
    io.to(socket.id).emit('playerAction', players);
    if (!gun) {
      spawnGun();
    }
    io.to(socket.id).emit('obstacles', obstacles);
  });

  socket.on('playerAction', (playerData) => {
    if (players[socket.id]) {
      players[socket.id] = playerData;
      io.emit('playerAction', players);
    }
  });

  socket.on('switchToSword', () => {
    if (players[socket.id]) {
      players[socket.id].hasGun = false;
      io.emit('playerAction', players);
    }
  });

  socket.on('switchToGun', () => {
    if (players[socket.id]) {
      players[socket.id].hasGun = true;
      io.emit('playerAction', players);
    }
  });

  socket.on('shootBullet', (bullet) => {
    bullets.push(bullet);
    io.emit('bulletAction', bullets);
  });

  socket.on('pickUpGun', () => {
    if (gun && distance(players[socket.id], gun) < 50) {
      players[socket.id].hasGun = true;
      players[socket.id].ammo = 10;
      gun = null;
      io.emit('gunPickedUp', socket.id);
      io.emit('playerAction', players);
    }
  });

  socket.on('respawn', () => {
    players[socket.id] = {
      ...players[socket.id],
      x: Math.random() * mapSize.width,
      y: Math.random() * mapSize.height,
      health: 100,
      hasGun: false,
      ammo: 10
    };
    io.to(socket.id).emit('playerAction', players);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerAction', players);
    console.log('A user disconnected: ' + socket.id);
  });

  setInterval(updateGame, 1000 / 60);

  function updateGame() {
    bullets = bullets.filter(bullet => {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      for (let id in players) {
        if (id !== bullet.owner && distance(bullet, players[id]) < 25) {
          players[id].health -= 10;
          if (players[id].health <= 0) {
            const killer = bullet.owner;
            io.to(id).emit('playerDeath', { victim: id, killer: killer });
            players[killer].kills += 1;
            delete players[id];
          }
          return false;
        }
      }
      // Check for collisions with obstacles
      for (let obstacle of obstacles) {
        if (
          bullet.x < obstacle.x + obstacle.width &&
          bullet.x + 5 > obstacle.x &&
          bullet.y < obstacle.y + obstacle.height &&
          bullet.y + 5 > obstacle.y
        ) {
          return false;
        }
      }
      return bullet.x >= 0 && bullet.x <= mapSize.width && bullet.y >= 0 && bullet.y <= mapSize.height;
    });

    io.emit('playerAction', players);
    io.emit('bulletAction', bullets);

    if (!gun) {
      spawnGun();
    }
  }

  function spawnGun() {
    gun = {
      x: Math.random() * (mapSize.width - 20),
      y: Math.random() * (mapSize.height - 20),
      width: 20,
      height: 20
    };
    io.emit('gunSpawn', gun);
  }
});

function distance(obj1, obj2) {
  return Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));
}

server.listen(3000, () => {
  console.log('listening on *:3000');
});
