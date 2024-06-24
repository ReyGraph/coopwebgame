const socket = io();
const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
let players = {};
let bullets = [];
let currentPlayer;
let obstacles = [];
let gun = null;
let swordAngle = 0;
let isAttacking = false;

const healthDisplay = document.getElementById('healthValue');
const ammoDisplay = document.getElementById('ammoValue');
const leaderboardDisplay = document.querySelector('.leaderboard');

// Mini map canvas
const miniMapCanvas = document.createElement('canvas');
const miniMapCtx = miniMapCanvas.getContext('2d');
miniMapCanvas.width = 200;
miniMapCanvas.height = 150;
miniMapCanvas.style.border = '1px solid #333';
document.body.appendChild(miniMapCanvas);

// Respawn UI
const respawnUI = document.createElement('div');
respawnUI.id = 'respawnUI';
respawnUI.style.display = 'none';
respawnUI.innerHTML = `<button id="respawnButton">Respawn</button>`;
document.body.appendChild(respawnUI);

document.getElementById('playButton').addEventListener('click', () => {
  const username = document.getElementById('usernameInput').value;
  if (username) {
    socket.emit('joinGame', username);
    document.querySelector('.lobby').style.display = 'none';
    document.querySelector('.game-container').style.display = 'block';
  }
});

socket.on('playerAction', (data) => {
  players = data;
  currentPlayer = players[socket.id];
});

socket.on('bulletAction', (data) => {
  bullets = data;
});

socket.on('gunSpawn', (gunData) => {
  gun = gunData;
});

socket.on('gunPickedUp', (playerId) => {
  if (gun && distance(players[playerId], gun) < 50) {
    gun = null;
  }
});

socket.on('obstacles', (data) => {
  obstacles = data;
});

socket.on('playerDeath', (data) => {
  const { victim, killer } = data;
  if (victim === socket.id) {
    respawnUI.style.display = 'block';
  }
  showKillNotification(victim, killer);
  updateScoreboard();
});

document.getElementById('respawnButton').addEventListener('click', () => {
  socket.emit('respawn');
  respawnUI.style.display = 'none';
});

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Center camera on currentPlayer
  if (currentPlayer) {
    context.save();
    context.translate(-currentPlayer.x + canvas.width / 2 - currentPlayer.width / 2, -currentPlayer.y + canvas.height / 2 - currentPlayer.height / 2);
  }

  // Draw obstacles
  context.fillStyle = 'black';
  obstacles.forEach(obstacle => {
    context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  });

  // Draw gun
  if (gun) {
    context.fillStyle = 'gold';
    context.fillRect(gun.x, gun.y, gun.width, gun.height);
  }

  // Draw players
  for (let id in players) {
    const player = players[id];
    context.fillStyle = player.color;
    context.fillRect(player.x, player.y, player.width, player.height);

    // Draw username with glowing effect
    context.font = 'bold 14px Arial';
    context.fillStyle = 'white';
    context.shadowColor = player.color;
    context.shadowBlur = 10;
    context.fillText(player.username, player.x - 10, player.y - 20);
    context.shadowBlur = 0;

    // Draw health bar
    context.fillStyle = 'red';
    context.fillRect(player.x, player.y - 10, player.width * (player.health / 100), 5);

    // Draw sword or gun
    if (player.hasGun) {
      context.fillStyle = 'black';
      context.fillRect(player.x + player.width / 2 - 2, player.y - 10, 4, 20);
    } else {
      context.save();
      context.translate(player.x + player.width / 2, player.y + player.height / 2);
      context.rotate(player.swordAngle);
      context.fillStyle = 'gray';
      context.fillRect(0, -5, 50, 10);
      context.restore();
    }
  }

  // Draw bullets
  bullets.forEach(bullet => {
    context.fillStyle = 'black';
    context.fillRect(bullet.x, bullet.y, 5, 5);
  });

  // Draw mini map
  drawMiniMap();

  if (currentPlayer) {
    context.restore();
  }
}

function drawMiniMap() {
  miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  // Draw obstacles
  miniMapCtx.fillStyle = 'black';
  obstacles.forEach(obstacle => {
    miniMapCtx.fillRect(obstacle.x / 8, obstacle.y / 8, obstacle.width / 8, obstacle.height / 8);
  });

  // Draw players
  for (let id in players) {
    const player = players[id];
    miniMapCtx.fillStyle = player.color;
    miniMapCtx.fillRect(player.x / 8, player.y / 8, player.width / 8, player.height / 8);
  }

  // Draw current player with different color
  if (currentPlayer) {
    miniMapCtx.fillStyle = 'blue';
    miniMapCtx.fillRect(currentPlayer.x / 8, currentPlayer.y / 8, currentPlayer.width / 8, currentPlayer.height / 8);
  }
}

let keys = {};

document.addEventListener('keydown', (event) => {
  keys[event.key] = true;
  if (event.key === '1') {
    socket.emit('switchToSword');
  } else if (event.key === '2') {
    socket.emit('switchToGun');
  }
});

document.addEventListener('keyup', (event) => {
  keys[event.key] = false;
});

function movePlayer() {
  if (!currentPlayer) return;

  const speed = 5;
  const originalX = currentPlayer.x;
  const originalY = currentPlayer.y;

  if (keys['ArrowUp']) {
    currentPlayer.y -= speed;
  }
  if (keys['ArrowDown']) {
    currentPlayer.y += speed;
  }
  if (keys['ArrowLeft']) {
    currentPlayer.x -= speed;
  }
  if (keys['ArrowRight']) {
    currentPlayer.x += speed;
  }

  if (checkCollisionWithObstacles(currentPlayer)) {
    currentPlayer.x = originalX;
    currentPlayer.y = originalY;
  }

  // Send updated player data to the server
  socket.emit('playerAction', currentPlayer);
}

canvas.addEventListener('mousemove', (event) => {
  if (!currentPlayer) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - (currentPlayer.x + currentPlayer.width / 2);
  const y = event.clientY - rect.top - (currentPlayer.y + currentPlayer.height / 2);
  currentPlayer.swordAngle = Math.atan2(y, x);
  socket.emit('playerAction', currentPlayer);
});

canvas.addEventListener('mousedown', (event) => {
  if (!currentPlayer) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (currentPlayer.hasGun && currentPlayer.ammo > 0) {
    const angle = Math.atan2(y - (currentPlayer.y + currentPlayer.height / 2), x - (currentPlayer.x + currentPlayer.width / 2));
    const bullet = {
      x: currentPlayer.x + currentPlayer.width / 2,
      y: currentPlayer.y + currentPlayer.height / 2,
      vx: 10 * Math.cos(angle),
      vy: 10 * Math.sin(angle),
      owner: socket.id
    };
    socket.emit('shootBullet', bullet);
  } else {
    isAttacking = true;
    socket.emit('playerAction', currentPlayer);
  }
});

canvas.addEventListener('mouseup', (event) => {
  if (!currentPlayer) return;

  isAttacking = false;
  if (gun && distance(currentPlayer, gun) < 50) {
    socket.emit('pickUpGun');
  }
});

function distance(obj1, obj2) {
  return Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));
}

function checkCollisionWithObstacles(obj) {
  for (let obstacle of obstacles) {
    if (obj.x < obstacle.x + obstacle.width &&
      obj.x + obj.width > obstacle.x &&
      obj.y < obstacle.y + obstacle.height &&
      obj.y + obj.height > obstacle.y) {
      return true;
    }
  }
  return false;
}

function showKillNotification(victim, killer) {
  const notificationBox = document.createElement('div');
  notificationBox.className = 'kill-notification';
  notificationBox.innerText = `${players[victim].username} was killed by ${players[killer].username}`;
  document.body.appendChild(notificationBox);

  setTimeout(() => {
    notificationBox.style.transform = 'translateX(-100%)';
  }, 3000);

  setTimeout(() => {
    document.body.removeChild(notificationBox);
  }, 5000);
}

function updateScoreboard() {
  const sortedPlayers = Object.values(players).sort((a, b) => b.kills - a.kills);
  leaderboardDisplay.innerHTML = '';

  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'leaderboard-entry';
    playerDiv.innerText = `${index + 1}. ${player.username} - ${player.kills} kills`;
    leaderboardDisplay.appendChild(playerDiv);
  });
}

function gameLoop() {
  movePlayer();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
