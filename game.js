// THEME: Replace these colors and nouns after the theme roulette.
const THEME = {
  background: "#0b1426", grid: "#1b2a43", player: "#70edcf",
  collectible: "#ffdc76", hazard: "#ff778e", collectiblePlural: "sparks"
};

// RULES: Speeds are in Canvas pixels per second.
const RULES = {
  playerSpeed: 270, hazardSpeed: 95, speedPerLevel: 16,
  maxHazardSpeed: 205, pointsPerLevel: 5, maxHazards: 8
};

const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const { width, height } = canvas;
const cellSize = 72;
const columns = width / cellSize;
const rows = height / cellSize;
const wallSize = 8;
const mazeInterval = 10;
const powerColor = "#bb9aff";
const mazeLabel = document.querySelector("#maze-time");
const powerLabel = document.querySelector("#power-status");
const overlay = document.querySelector("#overlay");
const action = document.querySelector("#action");
const scoreLabel = document.querySelector("#score");
const levelLabel = document.querySelector("#level");
const bestLabel = document.querySelector("#best");
const panelDetail = document.querySelector("#panel-detail");
const panelTitle = document.querySelector("#panel-title");
const status = document.querySelector("#status");
const controls = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "];
const keys = new Set();
const touches = new Map();
const storageKey = "pixel-playground-best";

let state = "ready";
let player, collectible, hazards, score, level;
let walls, mazeTime, powerUp, powerSpawnTime, armorTime;
let passages, traps, projectiles;
let portals, portalLocked, gunCooldown, audio;
let best = 0;
let lastTime;

try {
  best = Number(localStorage.getItem(storageKey)) || 0;
} catch {
  // The best score still works for this page if storage is disabled.
}

function resetRound() {
  player = { ...cellCenter(Math.floor(rows / 2) * columns + Math.floor(columns / 2)), size: 14, angle: 0 };
  hazards = [];
  collectible = undefined;
  score = 0;
  level = 1;
  powerUp = undefined;
  powerSpawnTime = 3 + Math.random() * 3;
  armorTime = 0;
  gunCooldown = 0;
  rebuildMaze();
  addHazard();
  addHazard();
  placeCollectible();
  updateHud();
}

function rebuildMaze() {
  const groups = Array.from({ length: columns * rows }, (_, index) => index);
  const edges = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      const x = column * cellSize;
      const y = row * cellSize;
      if (column + 1 < columns) {
        edges.push({ cell, neighbor: cell + 1, x: x + cellSize, y: y + cellSize / 2,
          w: wallSize, h: cellSize + wallSize });
      }
      if (row + 1 < rows) {
        edges.push({ cell, neighbor: cell + columns, x: x + cellSize / 2, y: y + cellSize,
          w: cellSize + wallSize, h: wallSize });
      }
    }
  }
  for (let index = edges.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [edges[index], edges[other]] = [edges[other], edges[index]];
  }
  // Open enough passages to connect every cell, with a few extra escape routes.
  const occupants = [player, ...hazards, collectible, powerUp].filter(Boolean);
  passages = groups.map(() => []);
  walls = edges.filter(edge => {
    const from = groups[edge.cell];
    const to = groups[edge.neighbor];
    if (from === to && Math.random() > 0.18 &&
        occupants.every(object => !hitsWall(object, edge, 2))) return true;
    if (from !== to) {
      for (let index = 0; index < groups.length; index++) {
        if (groups[index] === to) groups[index] = from;
      }
    }
    passages[edge.cell].push(edge.neighbor);
    passages[edge.neighbor].push(edge.cell);
    return false;
  });
  for (const hazard of hazards) hazard.waypoint = undefined;
  projectiles = [];
  traps = [];
  portals = [];
  portalLocked = false;
  addTraps(occupants);
  const entrance = openSpot(34, occupants, 55);
  const exit = entrance && openSpot(34, [...occupants, entrance], 160);
  if (exit) portals = [entrance, exit];
  mazeTime = mazeInterval;
}

function cellAt({ x, y }) {
  return Math.floor(y / cellSize) * columns + Math.floor(x / cellSize);
}

function cellCenter(cell) {
  return { x: (cell % columns + 0.5) * cellSize,
    y: (Math.floor(cell / columns) + 0.5) * cellSize };
}

function addTraps(occupants) {
  const kinds = ["spikes", "boulder", "arrows", "dragon", "spikes", "arrows"];
  const target = Math.min(18, 6 + (level - 1) * 2);
  while (traps.length < target) {
    const cells = passages.map((_, cell) => cell).filter(cell => {
      const spot = { ...cellCenter(cell), size: 40 };
      return Math.hypot(spot.x - player.x, spot.y - player.y) > 125 &&
        [...occupants, ...traps, ...portals].every(object => !overlaps(spot, object, 20));
    });
    if (!cells.length) break;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    const neighbors = passages[cell];
    const destination = cellCenter(neighbors[Math.floor(Math.random() * neighbors.length)]);
    const spot = cellCenter(cell);
    traps.push({ ...spot, size: 32, kind: kinds[traps.length % kinds.length],
      angle: Math.atan2(destination.y - spot.y, destination.x - spot.x),
      clock: 1.3 + Math.random() * 2.5 });
  }
}

function hitsWall(object, wall, gap = 0) {
  return Math.abs(object.x - wall.x) < (object.size + wall.w) / 2 + gap &&
    Math.abs(object.y - wall.y) < (object.size + wall.h) / 2 + gap;
}

function updateHud() {
  scoreLabel.textContent = score;
  levelLabel.textContent = level;
  bestLabel.textContent = best;
  mazeLabel.textContent = Math.ceil(mazeTime);
  powerLabel.textContent = armorTime > 0 ? `Armor ${Math.ceil(armorTime)}s`
    : powerUp ? powerUp.kind : "—";
}

function startRound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  }
  clearInput();
  resetRound();
  state = "playing";
  lastTime = undefined;
  overlay.hidden = true;
  canvas.focus();
}

function endRound(reason) {
  state = "over";
  clearInput();
  status.textContent = "RUN COMPLETE";
  panelTitle.textContent = reason;
  panelDetail.textContent = `Score ${score} · Level ${level} · Best ${best}`;
  action.textContent = "Play again";
  overlay.hidden = false;
  action.focus();
}

// All positions describe the center of an object.
function overlaps(a, b, gap = 0) {
  const reach = (a.size + b.size) / 2 + gap;
  return Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach;
}

function openSpot(size, blockers, gap = 0) {
  // Scan a grid so placement always finishes, even when the arena gets busy.
  const spots = [];
  for (let y = 24; y <= height - 24; y += 28) {
    for (let x = 24; x <= width - 24; x += 28) {
      const spot = { x, y, size };
      if (walls.every(wall => !hitsWall(spot, wall, 2)) &&
          blockers.every(blocker => !overlaps(spot, blocker, gap)) &&
          [...traps, ...portals].every(object => !overlaps(spot, object, 8))) spots.push(spot);
    }
  }
  return spots[Math.floor(Math.random() * spots.length)];
}

function addHazard() {
  const blockers = [player, collectible, powerUp, ...hazards].filter(Boolean);
  const spot = openSpot(24, blockers, 145) ?? openSpot(24, blockers, 65);
  if (!spot) return;
  hazards.push({ ...spot, angle: 0, reload: 1.2 });
}

function placeCollectible() {
  const blockers = [player, powerUp, ...hazards].filter(Boolean);
  collectible = openSpot(22, blockers, 20) ?? openSpot(22, blockers);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moveAlong(object, axis, distance, limit) {
  const start = object[axis];
  const edge = object.size / 2;
  const target = start + distance;
  object[axis] = clamp(target, edge, limit - edge);
  if (walls.some(wall => hitsWall(object, wall))) {
    object[axis] = start;
    return false;
  }
  return object[axis] === target;
}

function held(key) {
  return keys.has(key) || [...touches.values()].includes(key);
}

function movePlayer(dt) {
  const dx = Number(held("arrowright") || held("d")) - Number(held("arrowleft") || held("a"));
  const dy = Number(held("arrowdown") || held("s")) - Number(held("arrowup") || held("w"));
  // Normalize so moving diagonally is just as fast.
  const distance = RULES.playerSpeed * dt / (Math.hypot(dx, dy) || 1);
  moveAlong(player, "x", dx * distance, width);
  moveAlong(player, "y", dy * distance, height);
  if (dx || dy) player.angle = Math.atan2(dy, dx);
}

function updatePortals() {
  const pad = portals.findIndex(portal => overlaps(player, portal));
  if (pad < 0) {
    portalLocked = false;
  } else if (!portalLocked) {
    const destination = portals[1 - pad];
    player.x = destination.x;
    player.y = destination.y;
    portalLocked = true;
  }
}

function fireMachineGun(dt) {
  gunCooldown -= dt;
  if (held(" ") && gunCooldown <= 0) {
    launch(player, player.angle, "playerBullet", 540, 6, 0.65);
    gunCooldown = 0.11;
  }
}

function moveHazards(dt) {
  const speed = Math.min(RULES.maxHazardSpeed, RULES.hazardSpeed + (level - 1) * RULES.speedPerLevel);
  const goal = cellAt(player);
  const next = [];
  const queue = [goal];
  next[goal] = goal;
  for (const cell of queue) {
    for (const neighbor of passages[cell]) {
      if (next[neighbor] !== undefined) continue;
      next[neighbor] = cell;
      queue.push(neighbor);
    }
  }
  for (const hazard of hazards) {
    const cell = cellAt(hazard);
    const canShoot = Math.hypot(player.x - hazard.x, player.y - hazard.y) < 260 &&
      clearShot(hazard, player);
    if (canShoot) {
      hazard.angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
    }
    if (canShoot && hazard.reload <= 0) {
      launch(hazard, hazard.angle, "bullet", 330, 7, 0.85);
      hazard.reload = 1.55;
    }
    hazard.reload -= dt;
    if (!hazard.waypoint) {
      const center = cellCenter(cell);
      const centered = hazard.x === center.x && hazard.y === center.y;
      hazard.waypoint = centered ? cellCenter(next[cell]) : center;
    }
    const target = cell === goal ? player : hazard.waypoint;
    const dx = target.x - hazard.x;
    const dy = target.y - hazard.y;
    if (!canShoot && (dx || dy)) hazard.angle = Math.atan2(dy, dx);
    moveAlong(hazard, "x", clamp(dx, -speed * dt, speed * dt), width);
    moveAlong(hazard, "y", clamp(dy, -speed * dt, speed * dt), height);
    if (cell === goal || (hazard.x === target.x && hazard.y === target.y)) {
      hazard.waypoint = undefined;
    }
  }
}

function clearShot(from, to) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4);
  for (let step = 1; step < steps; step++) {
    const fraction = step / steps;
    const point = { x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction, size: 7 };
    if (walls.some(wall => hitsWall(point, wall))) return false;
  }
  return true;
}

function launch(origin, angle, kind, speed, size, life) {
  projectiles.push({ x: origin.x, y: origin.y, size, kind, angle, life,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  if (kind === "bullet" || kind === "playerBullet") playGunSound(kind);
}

function playGunSound(kind) {
  if (audio?.state !== "running") return;
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const volume = audio.createGain();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(kind === "playerBullet" ? 230 : 140, now);
  tone.frequency.exponentialRampToValueAtTime(55, now + 0.055);
  volume.gain.setValueAtTime(0.13, now);
  volume.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
  tone.connect(volume);
  volume.connect(audio.destination);
  tone.start(now);
  tone.stop(now + 0.07);
}

function updateTraps(dt) {
  for (const trap of traps) {
    trap.clock -= dt;
    if (trap.kind === "spikes") {
      if (trap.clock <= -0.65) trap.clock = 2.8;
      if (trap.clock <= 0 && overlaps(player, trap)) return "Impaled by spikes!";
    } else if (trap.clock <= 0) {
      if (trap.kind === "boulder") launch(trap, trap.angle, "boulder", 180, 34, 3);
      if (trap.kind === "arrows") launch(trap, trap.angle, "arrow", 390, 8, 2);
      if (trap.kind === "dragon") launch(trap, trap.angle, "flame", 225, 28, 0.65);
      trap.clock = trap.kind === "boulder" ? 4.1 : 3.1;
    }
  }
}

const projectileDeaths = {
  bullet: "Shot by a drone!", boulder: "Crushed by a boulder!",
  arrow: "Hit by a trap arrow!", flame: "Caught in dragon fire!"
};

function moveProjectiles(dt) {
  for (const shot of projectiles) {
    const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt / 5));
    for (let step = 0; step < steps && shot.life > 0; step++) {
      shot.life -= dt / steps;
      shot.x += shot.vx * dt / steps;
      shot.y += shot.vy * dt / steps;
      const edge = shot.size / 2;
      if (shot.x < edge || shot.x > width - edge || shot.y < edge || shot.y > height - edge ||
          walls.some(wall => hitsWall(shot, wall))) {
        shot.life = 0;
      } else if (shot.kind === "playerBullet") {
        const hit = hazards.findIndex(hazard => overlaps(hazard, shot));
        if (hit >= 0) {
          hazards.splice(hit, 1);
          shot.life = 0;
        }
      } else if (overlaps(player, shot)) {
        if (shot.kind !== "bullet" || armorTime <= 0) return projectileDeaths[shot.kind];
        shot.life = 0;
      }
    }
  }
  projectiles = projectiles.filter(shot => shot.life > 0);
}

function update(dt) {
  mazeTime -= dt;
  if (mazeTime <= 0) rebuildMaze();
  armorTime = Math.max(0, armorTime - dt);
  if (!powerUp) {
    powerSpawnTime -= dt;
    if (powerSpawnTime <= 0) {
      const blockers = [player, collectible, ...hazards].filter(Boolean);
      const spot = openSpot(24, blockers, 35) ?? openSpot(24, blockers, 0);
      if (spot) powerUp = { ...spot, kind: Math.random() < 0.5 ? "Armor" : "Blast" };
    }
  }
  movePlayer(dt);
  updatePortals();
  fireMachineGun(dt);
  moveHazards(dt);
  if (powerUp && overlaps(player, powerUp)) {
    if (powerUp.kind === "Armor") {
      armorTime = 6;
    } else {
      // The blast takes out up to two of the closest drones, even through walls.
      hazards.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) -
        Math.hypot(b.x - player.x, b.y - player.y));
      hazards.splice(0, 2);
    }
    powerUp = undefined;
    powerSpawnTime = 4 + Math.random() * 5;
  }
  if (armorTime > 0) hazards = hazards.filter(hazard => !overlaps(player, hazard));
  const death = updateTraps(dt) ?? moveProjectiles(dt) ??
    (hazards.some(hazard => overlaps(player, hazard)) ? "Drone collision!" : undefined);
  if (death) {
    endRound(death);
    return;
  }
  if (collectible && overlaps(player, collectible)) {
    score += 1;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(storageKey, best);
      } catch {
        // Keep the in-memory score.
      }
    }
    if (score % RULES.pointsPerLevel === 0) {
      level += 1;
      addTraps([player, collectible, powerUp, ...hazards].filter(Boolean));
    }
    const targetDrones = Math.min(RULES.maxHazards, level + 1);
    if (hazards.length < targetDrones) addHazard();
    placeCollectible();
  }
  updateHud();
}

function drawSquare(object, color) {
  ctx.fillStyle = color;
  const half = object.size / 2;
  ctx.fillRect(object.x - half, object.y - half, object.size, object.size);
}

function polygon(color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function drawTraps() {
  for (const trap of traps) {
    ctx.save();
    ctx.translate(trap.x, trap.y);
    const warning = trap.clock <= 0.65;
    const color = warning ? "#ff9d58" : "#8390a8";
    if (trap.kind === "spikes") {
      drawSquare({ x: 0, y: 0, size: 32 }, "#29364a");
      for (const x of [-12, 0, 12]) {
        const tip = trap.clock <= 0 ? -13 : -2;
        polygon(color, [[x - 5, 9], [x, tip], [x + 5, 9]]);
      }
    } else {
      ctx.rotate(trap.angle);
      if (trap.kind === "dragon") {
        polygon(color, [[-17, 15], [-14, -5], [-21, -17], [-7, -12], [-3, -21],
          [2, -9], [17, -7], [22, -1], [10, 2], [20, 7], [8, 11], [-2, 7], [-6, 15]]);
        ctx.fillStyle = "#172235";
        ctx.fillRect(1, -6, 5, 4);
      } else {
        drawSquare({ x: 0, y: 0, size: 28 }, "#29364a");
        if (trap.kind === "boulder") {
          polygon(color, [[-12, -6], [-5, -12], [8, -10], [12, 1], [6, 11], [-8, 9]]);
        } else {
          polygon(color, [[-10, -3], [1, -3], [1, -9], [12, 0], [1, 9], [1, 3], [-10, 3]]);
        }
      }
      if (warning) {
        ctx.fillStyle = "#ff9d58";
        ctx.fillRect(23, -1, 13, 2);
      }
    }
    ctx.restore();
  }
}

function drawProjectiles() {
  for (const shot of projectiles) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.kind === "boulder" ? shot.life * 8 : shot.angle);
    if (shot.kind === "boulder") {
      polygon("#aeb4be", [[-16, -7], [-7, -16], [9, -14], [17, -3],
        [13, 12], [0, 17], [-14, 10]]);
      polygon("#737f93", [[-9, -6], [0, -12], [11, -5], [5, 5], [-5, 7]]);
    } else if (shot.kind === "flame") {
      polygon("#ff714a", [[-18, -11], [-6, -7], [3, -14], [16, 0], [4, 14],
        [-7, 8], [-19, 11], [-13, 0]]);
      polygon("#ffdc76", [[-11, -4], [1, -6], [10, 0], [0, 6], [-10, 4]]);
    } else if (shot.kind === "arrow") {
      polygon("#ffdc76", [[-8, -1], [1, -1], [1, -4], [6, 0], [1, 4], [1, 1], [-8, 1]]);
    } else {
      drawSquare({ x: 0, y: 0, size: shot.size },
        shot.kind === "playerBullet" ? THEME.player : THEME.hazard);
    }
    ctx.restore();
  }
}

function draw() {
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = THEME.grid;
  for (let x = 0; x < width; x += 24) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 24) ctx.fillRect(0, y, width, 1);
  ctx.fillStyle = mazeTime <= 2 ? "#e7a564" : "#56719d";
  for (const wall of walls) {
    ctx.fillRect(wall.x - wall.w / 2, wall.y - wall.h / 2, wall.w, wall.h);
  }
  drawTraps();
  for (const portal of portals) {
    ctx.strokeStyle = "#83c5ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, 15, 0, Math.PI * 2);
    ctx.stroke();
    drawSquare({ ...portal, size: 7 }, "#83c5ff");
  }

  if (powerUp) {
    drawSquare(powerUp, powerColor);
    ctx.fillStyle = THEME.background;
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(powerUp.kind === "Armor" ? "A" : "B", powerUp.x, powerUp.y);
  }
  if (collectible) {
    ctx.save();
    ctx.translate(collectible.x, collectible.y);
    ctx.rotate(Math.PI / 4);
    drawSquare({ x: 0, y: 0, size: collectible.size / Math.SQRT2 }, THEME.collectible);
    ctx.restore();
  }
  for (const hazard of hazards) {
    drawSquare(hazard, THEME.hazard);
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.rotate(hazard.angle);
    ctx.fillStyle = hazard.reload <= 0.25 ? "#ffdc76" : "#dae4f4";
    ctx.fillRect(7, -3, 13, 6);
    ctx.restore();
    ctx.fillStyle = THEME.background;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×", hazard.x, hazard.y + 1);
  }
  drawProjectiles();
  drawSquare(player, armorTime > 0 ? powerColor : THEME.player);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = "#dae4f4";
  ctx.fillRect(5, -2, 9, 4);
  ctx.restore();
  ctx.fillStyle = THEME.background;
  ctx.fillRect(player.x - 4, player.y - 2, 2, 3);
  ctx.fillRect(player.x + 2, player.y - 2, 2, 3);
}

function frame(time) {
  // Cap the step after interruptions to avoid jumping across the arena.
  const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;
  if (state === "playing" && !document.hidden) update(dt);
  draw();
  requestAnimationFrame(frame);
}

function clearInput() {
  keys.clear();
  touches.clear();
}

action.addEventListener("click", startRound);
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (state !== "playing" || !controls.includes(key) ||
      event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  keys.add(key);
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", clearInput);
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", event => {
    if (state !== "playing") return;
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.key === "fire" ? " " : button.dataset.key);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, event => touches.delete(event.pointerId));
  }
}

resetRound();
requestAnimationFrame(frame);
