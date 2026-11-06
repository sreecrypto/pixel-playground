"use strict";

const select = id => document.getElementById(id);
const view = select("arena");
const ctx = view.getContext("2d");
const radar = select("radar");
const map = radar.getContext("2d");
const width = view.width;
const height = view.height;
const columns = 21;
const rows = 15;
const shiftInterval = 7;
const trapKinds = ["spikes", "boulder", "arrows", "dragon", "coil", "gravity"];
const weapons = {
  "1": { kind: "bullet", interval: 0.11, speed: 13, life: 0.7, damage: 1, spread: [0], color: "#83f5ff", pitch: 240 },
  "2": { kind: "buckshot", interval: 0.62, speed: 12, life: 0.26, damage: 1,
    spread: [-0.18, -0.09, 0, 0.09, 0.18], color: "#ffbb72", pitch: 120 },
  "3": { kind: "plasma", interval: 0.85, speed: 8, life: 1.25, damage: 4, spread: [0], color: "#d892ff", pitch: 420 }
};
const enemyTypes = {
  scout: { hp: 2, speed: 1.55, damage: 12, reload: 1.8 },
  sentinel: { hp: 3, speed: 1.22, damage: 18, reload: 2.05 },
  heavy: { hp: 4, speed: 0.95, damage: 23, reload: 2.6 },
  hound: { hp: 2, speed: 1.65, damage: 15, reload: 0 },
  crawler: { hp: 2, speed: 1.3, damage: 16, reload: 0 },
  raptor: { hp: 3, speed: 1.5, damage: 18, reload: 0 },
  specter: { hp: 3, speed: 1.55, damage: 18, reload: 1.65 },
  warden: { hp: 5, speed: 1.1, damage: 23, reload: 2 },
  mantis: { hp: 3, speed: 1.62, damage: 20, reload: 0 },
  brute: { hp: 5, speed: 1.05, damage: 26, reload: 0 }
};
const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const start = { x: 1.5, y: 1.5 };
const exit = { x: columns - 1.5, y: rows - 1.5, kind: "exit" };
const keys = new Set();
const touches = new Map();
const sprites = {};
const depth = new Float32Array(width);
const randomItem = items => items[Math.floor(Math.random() * items.length)];
const cellOf = object => Math.floor(object.y) * columns + Math.floor(object.x);
const center = cell => ({ x: cell % columns + 0.5, y: Math.floor(cell / columns) + 0.5 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
let grid, gates, soldiers, traps, shots, items, portals, player;
let level = 1;
const progressKey = "orbital-escape-cleared-sector";
let clearedThrough = 0;
try {
  const saved = Number(localStorage.getItem(progressKey));
  if (Number.isSafeInteger(saved) && saved > 0 && saved < Number.MAX_SAFE_INTEGER) clearedThrough = saved;
} catch {
  // Keep progress available for the current session when storage is disabled.
}
let playing = false;
let shift, fireCooldown, damageFlash, flash, armor, audio, muted, drag;
let death, blood, elapsed;
let weaponSlot = "1";

function neighbors(cell, step = 1) {
  const x = cell % columns;
  const y = Math.floor(cell / columns);
  return directions.map(([dx, dy]) => [x + dx * step, y + dy * step])
    .filter(([nx, ny]) => nx > 0 && nx < columns - 1 && ny > 0 && ny < rows - 1)
    .map(([nx, ny]) => ny * columns + nx);
}

function generateMaze() {
  grid = new Uint8Array(columns * rows).fill(1);
  const stack = [cellOf(start)];
  grid[stack[0]] = 0;
  while (stack.length) {
    const cell = stack.at(-1);
    const choices = neighbors(cell, 2).filter(next => grid[next]);
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = randomItem(choices);
    grid[(cell + next) / 2] = grid[next] = 0;
    stack.push(next);
  }
  gates = [];
  for (let cell = 0; cell < grid.length; cell++) {
    const x = cell % columns;
    const y = Math.floor(cell / columns);
    if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1 || !grid[cell]) continue;
    const horizontal = !grid[cell - 1] && !grid[cell + 1];
    const vertical = !grid[cell - columns] && !grid[cell + columns];
    if ((horizontal || vertical) && Math.random() < 0.28) {
      grid[cell] = 0;
      gates.push(cell);
    }
  }
}

function routes(goal, rings = []) {
  const next = new Int16Array(grid.length).fill(-1);
  const queue = [goal];
  next[goal] = goal;
  for (const cell of queue) {
    const adjacent = neighbors(cell);
    const ring = rings.indexOf(cell);
    if (ring >= 0) adjacent.push(rings[1 - ring]);
    for (const neighbor of adjacent) {
      if (grid[neighbor] || next[neighbor] >= 0) continue;
      next[neighbor] = cell;
      queue.push(neighbor);
    }
  }
  return { next, queue };
}

function setup() {
  generateMaze();
  const { queue } = routes(cellOf(start));
  const free = queue.map(center).filter(spot => distance(spot, start) > 4.2 &&
    distance(spot, exit) > 1.6 && !gates.includes(cellOf(spot)));
  function take() {
    return free.splice(Math.floor(Math.random() * free.length), 1)[0];
  }
  const first = neighbors(cellOf(start)).find(cell => !grid[cell]);
  const heading = center(first);
  player = { ...start, angle: Math.atan2(heading.y - start.y, heading.x - start.x), hp: 100 };
  const roster = ["scout", "sentinel", "heavy", "hound", "crawler", "raptor"];
  if (level >= 2) roster[1] = "specter";
  if (level >= 3) roster[4] = "mantis";
  if (level >= 4) roster[2] = "warden";
  if (level >= 5) roster[5] = "brute";
  soldiers = roster.map((type, index) => ({
    ...take(), kind: "enemy", type, hp: enemyTypes[type].hp + Math.min(2, Math.floor(level / 4)),
    reload: 1.6 + Math.random(), angle: 0, patrolDelay: index * Math.max(0.25, 0.85 - level * 0.07)
  }));
  traps = Array.from({ length: Math.min(14, 4 + level * 2) }, (_, index) => ({
    ...take(), kind: trapKinds[index % trapKinds.length],
    timer: 1 + Math.random() * 2
  }));
  portals = Array.from({ length: 2 }, () => ({ ...take(), kind: "portal" }));
  items = ["armor", "blast"].map(kind => ({ ...take(), kind }));
  shots = [];
  blood = [];
  death = null;
  elapsed = 0;
  shift = shiftInterval;
  fireCooldown = damageFlash = flash = armor = 0;
  updateHud();
}

function wallAt(x, y) {
  return grid[Math.floor(y) * columns + Math.floor(x)] !== 0;
}

function fits(x, y, radius) {
  return !wallAt(x - radius, y - radius) && !wallAt(x + radius, y - radius) &&
    !wallAt(x - radius, y + radius) && !wallAt(x + radius, y + radius);
}

function move(object, dx, dy, radius) {
  if (fits(object.x + dx, object.y, radius)) object.x += dx;
  if (fits(object.x, object.y + dy, radius)) object.y += dy;
}

function cast(x, y, dx, dy) {
  let col = Math.floor(x);
  let row = Math.floor(y);
  const deltaX = Math.abs(1 / dx);
  const deltaY = Math.abs(1 / dy);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  let sideX = (dx < 0 ? x - col : col + 1 - x) * deltaX;
  let sideY = (dy < 0 ? y - row : row + 1 - y) * deltaY;
  while (true) {
    const vertical = sideX < sideY;
    const hit = vertical ? sideX : sideY;
    if (vertical) {
      col += stepX;
      sideX += deltaX;
    } else {
      row += stepY;
      sideY += deltaY;
    }
    if (grid[row * columns + col]) {
      const coordinate = vertical ? y + dy * hit : x + dx * hit;
      return { hit, vertical, cell: row * columns + col, seam: coordinate - Math.floor(coordinate),
        flip: vertical ? dx < 0 : dy > 0 };
    }
  }
}

function visible(from, to, range) {
  const gap = distance(from, to);
  if (gap < 0.001) return true;
  if (gap > range) return false;
  return cast(from.x, from.y, (to.x - from.x) / gap, (to.y - from.y) / gap).hit > gap;
}

function tone(pitch, length = 0.09, type = "triangle") {
  if (muted || audio?.state !== "running") return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(pitch, now);
  oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.32, now + length);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + length);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + length);
}

function launch(origin, angle, kind, speed, life, damage, radius) {
  shots.push({ x: origin.x, y: origin.y, kind, dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed, life, damage, radius });
}

function hurt(amount, reason, cause) {
  if (damageFlash > 0 || death) return;
  player.hp = Math.max(0, player.hp - amount);
  damageFlash = 0.38;
  tone(100, 0.18, "sawtooth");
  if (!player.hp) {
    death = { cause, reason, time: 0, angle: player.angle };
    playing = false;
    keys.clear();
    touches.clear();
    drag = null;
  }
}

function eliminate(enemy) {
  if (enemy.hp <= 0 && enemy.fallen) return;
  enemy.hp = 0;
  enemy.fallen = true;
  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.25 + Math.random() * 1.25;
    blood.push({ x: enemy.x, y: enemy.y, z: 0.35 + Math.random() * 0.3,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      vz: 0.25 + Math.random() * 1.3, life: 2 + Math.random() * 0.7 });
  }
}

function updateBlood(dt) {
  for (const drop of blood) {
    drop.life -= dt;
    if (drop.z <= 0.015) continue;
    move(drop, drop.vx * dt, drop.vy * dt, 0.015);
    drop.z = Math.max(0.015, drop.z + drop.vz * dt);
    drop.vz -= 5 * dt;
  }
  blood = blood.filter(drop => drop.life > 0);
}

function usePortal(actor) {
  const ring = portals.findIndex(pad => distance(actor, pad) < 0.24);
  if (ring < 0) {
    actor.portalLocked = false;
    return false;
  }
  if (actor.portalLocked) return false;
  const destination = portals[1 - ring];
  actor.x = destination.x;
  actor.y = destination.y;
  actor.portalLocked = true;
  return true;
}

function updateSoldiers(dt) {
  const goal = cellOf(player);
  const rings = portals.map(cellOf);
  const { next } = routes(goal, rings);
  let walking;
  for (const soldier of soldiers) {
    if (!playing) break;
    if (usePortal(soldier)) soldier.target = undefined;
    const type = enemyTypes[soldier.type];
    const cell = cellOf(soldier);
    const gap = distance(soldier, player);
    soldier.reload -= dt;
    const sees = visible(soldier, player, 5.5);
    if (!sees && elapsed < soldier.patrolDelay) continue;
    if (sees) soldier.angle = Math.atan2(player.y - soldier.y, player.x - soldier.x);
    if (type.reload && sees && soldier.reload <= 0 && gap > 0.4) {
      launch(soldier, soldier.angle, "enemyShot", 6, 1.05, type.damage, 0.08);
      soldier.reload = Math.max(type.reload * 0.6, type.reload - (level - 1) * 0.07);
      tone(130);
    }
    if (gap < 0.44) {
      if (armor > 0) eliminate(soldier);
      else hurt(type.damage + 4, type.reload ? "A guard caught you in the corridor." :
        "A station creature caught you.", type.reload ? "guard" : "creature");
    }
    if (soldier.hp <= 0 || (type.reload && sees && gap < 1.05)) continue;
    if (!soldier.target || distance(soldier, soldier.target) < 0.025) {
      const spot = center(cell);
      let nextCell = next[cell];
      if (rings.includes(cell) && rings.includes(nextCell) && cell !== nextCell) {
        // Leave the arrival pad before trying to travel back through it.
        if (soldier.portalLocked) {
          walking ??= routes(goal).next;
          nextCell = walking[cell];
        } else {
          nextCell = cell;
        }
      }
      soldier.target = distance(soldier, spot) >= 0.025 || nextCell < 0 ? spot : center(nextCell);
    }
    const target = cell === goal ? player : soldier.target;
    const step = Math.min(distance(soldier, target), dt * (type.speed + Math.min(0.65, (level - 1) * 0.055)));
    const angle = Math.atan2(target.y - soldier.y, target.x - soldier.x);
    if (!sees) soldier.angle = angle;
    move(soldier, Math.cos(angle) * step, Math.sin(angle) * step, 0.19);
    if (usePortal(soldier) || cell === goal) soldier.target = undefined;
  }
}

const trapFire = {
  boulder: ["rock", 3.6, 1.6, 45, 0.30],
  arrows: ["dart", 9, 0.9, 32, 0.08],
  dragon: ["flame", 5, 0.65, 40, 0.27]
};
const trapDeaths = {
  spikes: "Hull spikes breached your suit.", boulder: "A boulder crushed your suit.",
  arrows: "A dart pierced your suit.", dragon: "Dragon fire burned through your suit.",
  coil: "An arc coil overloaded your suit.", gravity: "A gravity well crushed your suit."
};
const projectileTraps = { rock: "boulder", dart: "arrows", flame: "dragon" };
const trapDamage = amount => amount + Math.min(22, (level - 1) * 2);

function updateTraps(dt) {
  for (const trap of traps) {
    const gap = distance(player, trap);
    const range = ({ spikes: 0.95, gravity: 1.7, coil: 2.25 }[trap.kind] ?? 3.2) +
      Math.min(0.65, (level - 1) * 0.07);
    if (!trap.target && trap.timer <= 0 && visible(trap, player, range)) {
      trap.target = { x: player.x, y: player.y };
      trap.warning = (trap.kind === "gravity" ? 0.95 : 0.65) - Math.min(0.26, (level - 1) * 0.028);
      trap.angle = Math.atan2(player.y - trap.y, player.x - trap.x);
      if (trap.kind === "coil" || trap.kind === "gravity") tone(85, 0.18, "sawtooth");
    }
    trap.timer -= dt;
    if (!trap.target) continue;
    trap.warning -= dt;
    if (trap.warning > 0) continue;
    if (trap.kind === "spikes") {
      if (gap < 0.61) hurt(trapDamage(55), trapDeaths.spikes, "spikes");
      if (trap.warning > -0.5) continue;
    } else if (trap.kind === "coil") {
      if (trap.warning > -0.45 && visible(trap, player, 1.65)) {
        hurt(trapDamage(35), trapDeaths.coil, "coil");
      }
      if (trap.warning > -0.45) continue;
    } else if (trap.kind === "gravity") {
      if (trap.warning > -0.85) {
        if (visible(trap, player, 1.65)) {
          if (gap > 0.02) {
            const pull = Math.min(gap, dt * (2.2 + Math.min(0.85, level * 0.07))) / gap;
            move(player, (trap.x - player.x) * pull, (trap.y - player.y) * pull, 0.19);
          }
          if (gap < 0.38) hurt(trapDamage(48), trapDeaths.gravity, "gravity");
        }
        continue;
      }
    } else {
      const [kind, speed, life, damage, radius] = trapFire[trap.kind];
      launch(trap, trap.angle, kind, speed * (1 + Math.min(0.4, (level - 1) * 0.035)),
        life, trapDamage(damage), radius);
    }
    trap.target = undefined;
    trap.timer = Math.max(1.1, 2.1 - (level - 1) * 0.085);
  }
}

function updateShots(dt) {
  for (const shot of shots) {
    const steps = Math.max(1, Math.ceil(Math.hypot(shot.dx, shot.dy) * dt / 0.09));
    for (let i = 0; i < steps && shot.life > 0; i++) {
      shot.x += shot.dx * dt / steps;
      shot.y += shot.dy * dt / steps;
      shot.life -= dt / steps;
      if (!fits(shot.x, shot.y, shot.radius)) {
        shot.life = 0;
      } else if (["bullet", "buckshot", "plasma"].includes(shot.kind)) {
        const soldier = soldiers.find(enemy => enemy.hp > 0 && distance(shot, enemy) < 0.22 + shot.radius);
        if (soldier) {
          soldier.hp -= shot.damage;
          if (soldier.hp <= 0) eliminate(soldier);
          shot.life = 0;
        }
      } else if (distance(shot, player) < shot.radius + 0.19) {
        if (shot.kind !== "enemyShot" || armor <= 0) {
          const cause = projectileTraps[shot.kind] ?? "guard";
          hurt(shot.damage, trapDeaths[cause] ?? "A guard shot through your suit.", cause);
        }
        shot.life = 0;
      }
    }
  }
  shots = shots.filter(shot => shot.life > 0);
  soldiers = soldiers.filter(soldier => soldier.hp > 0);
}

function shiftBulkheads() {
  for (const gate of gates) {
    const spot = center(gate);
    const occupied = [player, ...soldiers, ...shots].some(object =>
      Math.abs(object.x - spot.x) < 0.85 && Math.abs(object.y - spot.y) < 0.85);
    if (!occupied && Math.random() < 0.65) grid[gate] = grid[gate] ? 0 : 2;
  }
  for (const soldier of soldiers) soldier.target = undefined;
}

const held = key => keys.has(key) || [...touches.values()].includes(key);

function update(dt) {
  elapsed += dt;
  updateBlood(dt);
  damageFlash = Math.max(0, damageFlash - dt);
  flash = Math.max(0, flash - dt);
  armor = Math.max(0, armor - dt);
  shift -= dt;
  if (shift <= 0) {
    shiftBulkheads();
    shift += shiftInterval;
  }
  const turn = Number(held("arrowright")) - Number(held("arrowleft"));
  player.angle += turn * dt * 2.25;
  const forward = Number(held("w") || held("arrowup")) - Number(held("s") || held("arrowdown"));
  const strafe = Number(held("d")) - Number(held("a"));
  const speed = 2.8 * dt / (Math.hypot(forward, strafe) || 1);
  const c = Math.cos(player.angle);
  const s = Math.sin(player.angle);
  move(player, (c * forward - s * strafe) * speed, (s * forward + c * strafe) * speed, 0.19);
  if (distance(player, exit) < 0.40) {
    if (level > clearedThrough) {
      clearedThrough = level;
      try {
        localStorage.setItem(progressKey, String(clearedThrough));
      } catch {
        // The menu still uses the current session's progress.
      }
    }
    level++;
    tone(440, 0.3);
    showPanel("AIRLOCK SECURED", "Sector clear.", "Enter next sector");
    return;
  }
  if (usePortal(player)) tone(540, 0.22);
  items = items.filter(item => {
    if (distance(item, player) > 0.28) return true;
    if (item.kind === "armor") armor = 6;
    else {
      soldiers.sort((a, b) => distance(a, player) - distance(b, player));
      soldiers.slice(0, 2).forEach(eliminate);
      soldiers = soldiers.filter(enemy => enemy.hp > 0);
    }
    tone(380, 0.16);
    return false;
  });
  fireCooldown -= dt;
  if (held(" ") && fireCooldown <= 0) {
    const weapon = weapons[weaponSlot];
    for (const offset of weapon.spread) {
      launch(player, player.angle + offset, weapon.kind, weapon.speed, weapon.life,
        weapon.damage, weaponSlot === "3" ? 0.11 : 0.05);
    }
    fireCooldown = weapon.interval;
    flash = 0.065;
    tone(weapon.pitch, weaponSlot === "1" ? 0.065 : 0.15, weaponSlot === "3" ? "sine" : "square");
  }
  updateSoldiers(dt);
  if (playing) updateTraps(dt);
  if (playing) updateShots(dt);
  updateHud();
}

function polygon(context, color, points) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.closePath();
  context.fill();
}

function buildSprites() {
  const kinds = ["exit", "portal", "armor", "blast", "rock", "dart", "flame", "enemyShot",
    ...Object.values(weapons).map(weapon => weapon.kind)];
  for (const kind of kinds) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const art = canvas.getContext("2d");
    const rect = (color, x, y, w, h) => {
      art.fillStyle = color;
      art.fillRect(x, y, w, h);
    };
    const shape = (color, points) => polygon(art, color, points);
    if (kind === "exit") {
      rect("#26374a", 10, 2, 44, 60);
      rect("#79ffad", 12, 4, 40, 57);
      rect("#081e20", 16, 8, 32, 53);
      shape("#79ffad", [[22, 30], [35, 30], [31, 24], [36, 24], [43, 33], [36, 42], [31, 42], [35, 36], [22, 36]]);
    } else if (["portal", "armor", "blast"].includes(kind)) {
      const color = { portal: "#bd8cff", armor: "#73f4ff", blast: "#ffcc69" }[kind];
      art.strokeStyle = color;
      art.lineWidth = 4;
      art.beginPath();
      art.ellipse(32, 34, 20, 26, 0, 0, Math.PI * 2);
      art.stroke();
      shape(color, [[32, 21], [42, 34], [32, 47], [22, 34]]);
    } else if (kind === "rock") {
      shape("#626273", [[8, 28], [18, 16], [38, 12], [54, 23], [59, 40], [46, 54], [23, 57], [8, 47]]);
      shape("#93909c", [[9, 29], [18, 17], [38, 12], [51, 22], [39, 32], [23, 33]]);
      shape("#3c3b47", [[39, 32], [51, 22], [59, 40], [46, 54], [27, 55]]);
      shape("#bdacaf", [[16, 26], [29, 20], [26, 26], [33, 29], [21, 29], [24, 24]]);
    } else if (kind === "dart") {
      shape("#ccd5df", [[5, 30], [41, 30], [41, 24], [61, 32], [41, 40], [41, 34], [5, 34]]);
      rect("#ff884d", 8, 29, 9, 6);
    } else {
      const color = Object.values(weapons).find(weapon => weapon.kind === kind)?.color ??
        (kind === "flame" ? "#ff5b36" : "#ff5579");
      shape(color, [[32, 2], [58, 35], [49, 55], [32, 62], [11, 52], [7, 34]]);
      shape("#fff0bd", [[32, 16], [46, 39], [32, 54], [20, 43]]);
    }
    sprites[kind] = canvas;
  }
}

const stars = Array.from({ length: 220 }, (_, i) => ({
  x: ((i * 271.39) % 2048), y: ((i * 73.91) % (height * 0.48)), size: i % 12 === 0 ? 2 : 1
}));

function drawWorld() {
  const horizon = height / 2;
  const headingX = Math.cos(player.angle);
  const headingY = Math.sin(player.angle);
  const plane = 0.70;
  ctx.fillStyle = "#0a1021";
  ctx.fillRect(0, 0, width, horizon);
  ctx.fillStyle = "#a7d6ff";
  for (const star of stars) {
    const x = ((star.x - player.angle * 325) % 2048 + 2048) % 2048;
    if (x < width) ctx.fillRect(x, star.y, star.size, star.size);
  }
  const floor = ctx.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, "#29284c");
  floor.addColorStop(1, "#315678");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, width, horizon);
  drawDeck(headingX, headingY, plane);
  for (let x = 0; x < width; x += 2) {
    const offset = (2 * x / width - 1) * plane;
    const ray = cast(player.x, player.y, headingX - headingY * offset, headingY + headingX * offset);
    depth[x] = depth[x + 1] = ray.hit;
    const size = height * 0.78 / Math.max(0.025, ray.hit);
    const bottom = horizon + size * 0.5;
    const top = bottom - size;
    const gate = grid[ray.cell] === 2;
    drawWallStrip(x, top, size, ray, gate);
  }
  const objects = [exit, ...portals, ...items, ...shots].map(object => {
    const dx = object.x - player.x;
    const dy = object.y - player.y;
    return { object, z: dx * headingX + dy * headingY, side: dy * headingX - dx * headingY };
  }).filter(object => object.z > 0.08).sort((a, b) => b.z - a.z);
  for (const { object, z, side } of objects) {
    const airborne = "life" in object;
    const kind = object.kind;
    const scale = airborne ? Math.max(0.12, object.radius * 2) :
      (["exit", "portal"].includes(kind) ? 1 : 0.57);
    const size = height * 0.78 * scale / z;
    const left = width / 2 + side * width / (2 * plane * z) - size / 2;
    const top = airborne && kind !== "rock" ? horizon - size / 2 : horizon + height * 0.39 / z - size;
    for (let x = Math.max(0, Math.ceil(left)); x < Math.min(width, left + size); x++) {
      if (z >= depth[x]) continue;
      ctx.drawImage(sprites[kind], clamp(Math.floor((x - left) * 64 / size), 0, 63), 0, 1, 64,
        x, top, 1, size);
    }
  }
  drawMeshes(headingX, headingY, plane);
  if (!death) drawWeapon();
}

function drawWallStrip(x, top, size, ray, gate) {
  const row = Math.floor(ray.cell / columns);
  const column = ray.cell % columns;
  const type = gate ? "gate" : (row * 3 + column * 5) % 7 === 0 ? "viewport" :
    (row + column) % 2 ? "lab" : "bay";
  const texture = wallTexture(type);
  const u = Math.min(255, Math.floor(ray.seam * 256));
  ctx.drawImage(texture, ray.flip ? 255 - u : u, 0, 1, 256, x, top, 2, size);
  ctx.globalAlpha = Math.min(0.66, ray.hit * 0.07 + (ray.vertical ? 0.03 : 0.11));
  ctx.fillStyle = "#31234e";
  ctx.fillRect(x, top, 2, size);
  ctx.globalAlpha = 1;
}

function drawWeapon() {
  const x = width / 2;
  ctx.strokeStyle = "#d6f6ff";
  ctx.beginPath();
  ctx.moveTo(x - 8, height / 2);
  ctx.lineTo(x + 8, height / 2);
  ctx.moveTo(x, height / 2 - 8);
  ctx.lineTo(x, height / 2 + 8);
  ctx.stroke();
  const kick = flash > 0 ? 9 : 0;
  polygon(ctx, "#182234", [[x - 67, height], [x - 35, height - 57 + kick],
    [x - 16, height - 99 + kick], [x + 16, height - 99 + kick],
    [x + 36, height - 56 + kick], [x + 67, height]]);
  polygon(ctx, "#7087a5", [[x - 30, height - 52 + kick], [x - 14, height - 92 + kick],
    [x + 14, height - 92 + kick], [x + 30, height - 52 + kick]]);
  const weapon = weapons[weaponSlot];
  if (weaponSlot === "2") {
    ctx.fillStyle = "#788493";
    for (const side of [-1, 1]) ctx.fillRect(x + side * 10 - 7, height - 108 + kick, 14, 37);
    ctx.fillStyle = "#272c36";
    ctx.fillRect(x - 23, height - 73 + kick, 46, 13);
  } else if (weaponSlot === "3") {
    polygon(ctx, "#443966", [[x - 41, height - 44], [x - 30, height - 82 + kick],
      [x, height - 113 + kick], [x + 30, height - 82 + kick], [x + 41, height - 44]]);
    ctx.fillStyle = weapon.color;
    for (const side of [-1, 1]) ctx.fillRect(x + side * 16 - 3, height - 87 + kick, 6, 25);
  }
  ctx.fillStyle = armor > 0 ? "#b998ff" : weapon.color;
  ctx.fillRect(x - 10, height - 59 + kick, 20, 3);
  if (flash > 0) polygon(ctx, "#ffcb71", [[x - 12, height - 91], [x - 23, height - 114],
    [x - 6, height - 111], [x, height - 136], [x + 9, height - 109], [x + 21, height - 117], [x + 12, height - 91]]);
  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(220,30,65,${damageFlash * 0.6})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawMap() {
  const tile = radar.width / columns;
  map.fillStyle = "#101829";
  map.fillRect(0, 0, radar.width, radar.height);
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    map.fillStyle = grid[i] === 2 ? "#ae734a" : "#2c3e5a";
    map.fillRect((i % columns) * tile, Math.floor(i / columns) * tile, tile, tile);
  }
  const mark = (object, color, size) => {
    map.fillStyle = color;
    map.fillRect(object.x * tile - size / 2, object.y * tile - size / 2, size, size);
  };
  mark(start, "#6b9eff", 7);
  mark(exit, "#78ff9b", 9);
  for (const portal of portals) mark(portal, "#bd8cff", 5);
  for (const trap of traps) mark(trap, trap.target ? "#ff7454" : "#ffc06e", 4);
  for (const soldier of soldiers) mark(soldier, enemyTypes[soldier.type].reload ? "#ff4f75" : "#ee93de", 6);
  map.save();
  map.translate(player.x * tile, player.y * tile);
  map.rotate(player.angle);
  polygon(map, "#76f8ff", [[8, 0], [-4, -4], [-2, 0], [-4, 4]]);
  map.restore();
}

function updateHud() {
  select("level").textContent = String(level).padStart(2, "0");
  select("health").textContent = `${player.hp}%`;
  const bar = select("health-bar");
  bar.value = player.hp;
  bar.dataset.condition = player.hp <= 30 ? "critical" : player.hp <= 60 ? "damaged" : "good";
  const danger = traps.find(trap => trap.target && distance(trap, player) < 3.5 &&
    visible(trap, player, 3.5));
  const warnings = { coil: "ARC DISCHARGE", gravity: "GRAVITY WELL", spikes: "SPIKE PLATE",
    dragon: "FLAME TURRET", boulder: "BOULDER RELEASE", arrows: "DART BATTERY" };
  select("signal").textContent = danger ? warnings[danger.kind] :
    armor > 0 ? `ARMOR ${Math.ceil(armor)}S` : "FIND THE EXIT";
  select("shift").textContent = `${Math.ceil(shift)}s`;
}

function showPanel(status, title, button, guardKill = false) {
  playing = false;
  keys.clear();
  touches.clear();
  drag = null;
  select("status").textContent = status;
  select("title").textContent = title;
  select("detail").textContent = "Reach the green airlock on the minimap to advance.";
  select("action").textContent = button;
  const overlay = select("overlay");
  overlay.classList.toggle("guard-death", guardKill);
  overlay.hidden = false;
  select("action").focus();
}

function startSector(sector) {
  level = sector;
  select("mission-menu").hidden = true;
  select("game-cabinet").hidden = false;
  select("touch-controls").hidden = false;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio && !muted) {
    audio ??= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  }
  setup();
  playing = true;
  select("overlay").classList.remove("guard-death");
  select("overlay").hidden = true;
  view.focus();
}

function showMainMenu(focus = true) {
  playing = false;
  death = null;
  keys.clear();
  touches.clear();
  drag = null;
  select("game-cabinet").hidden = true;
  select("touch-controls").hidden = true;
  select("mission-menu").hidden = false;
  const startButton = select("start-mission");
  startButton.textContent = `${clearedThrough ? "Continue to" : "Start"} Sector ${String(clearedThrough + 1).padStart(2, "0")}`;
  select("sector-empty").hidden = clearedThrough > 0;
  const list = select("sector-list");
  list.replaceChildren();
  for (let sector = 1; sector <= clearedThrough; sector++) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Replay Sector ${String(sector).padStart(2, "0")}`;
    button.addEventListener("click", () => startSector(sector));
    item.append(button);
    list.append(item);
  }
  if (focus) startButton.focus();
}

select("start-mission").addEventListener("click", () => startSector(clearedThrough + 1));
select("return-menu").addEventListener("click", () => showMainMenu());
select("action").addEventListener("click", () => startSector(level));

select("mute").addEventListener("click", event => {
  muted = !muted;
  event.currentTarget.textContent = muted ? "Sound off" : "Sound on";
  event.currentTarget.setAttribute("aria-pressed", String(Boolean(muted)));
  if (!muted) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      audio ??= new Audio();
      if (audio.state === "suspended") audio.resume().catch(() => {});
    }
  }
});

const supported = ["w", "a", "s", "d", "arrowleft", "arrowright", "arrowup", "arrowdown", " "];
const weaponButtons = [...document.querySelectorAll("[data-weapon]")];
function selectWeapon(slot) {
  weaponSlot = slot;
  for (const button of weaponButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.weapon === slot));
  }
}
for (const button of weaponButtons) {
  button.addEventListener("click", () => {
    selectWeapon(button.dataset.weapon);
    if (playing) view.focus();
  });
}
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (playing && Object.hasOwn(weapons, key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    selectWeapon(key);
    return;
  }
  if (!playing || !supported.includes(key) || event.altKey || event.ctrlKey || event.metaKey ||
      (key === " " && event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  keys.add(key);
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); touches.clear(); drag = null; });
document.addEventListener("visibilitychange", () => { keys.clear(); touches.clear(); drag = null; });
view.addEventListener("pointerdown", event => {
  if (!playing || event.button !== 0) return;
  view.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX };
});
view.addEventListener("pointermove", event => {
  if (!playing || drag?.id !== event.pointerId) return;
  player.angle += (event.clientX - drag.x) * 0.009;
  drag.x = event.clientX;
});
view.addEventListener("lostpointercapture", () => { drag = null; });
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", event => {
    if (!playing) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.key);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, event => touches.delete(event.pointerId));
  }
}

buildSprites();
showMainMenu(false);
let last;
function frame(time) {
  const dt = last === undefined || document.hidden ? 0 : Math.min(0.035, (time - last) / 1000);
  last = time;
  if (select("game-cabinet").hidden) {
    requestAnimationFrame(frame);
    return;
  }
  if (playing) update(dt);
  if (death && !death.finished) {
    death.time += dt;
    const progress = Math.min(1, death.time / 1.15);
    const steady = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!steady) player.angle = death.angle + progress * (death.cause === "gravity" ? 0.62 : -0.24);
    ctx.save();
    if (!steady) {
      const tilt = progress * (death.cause === "boulder" ? -0.18 : 0.11);
      ctx.translate(width / 2, height / 2);
      ctx.rotate(tilt);
      ctx.scale(1 + progress * 0.38, 1 + progress * 0.38);
      ctx.translate(-width / 2, -height / 2);
    }
    drawWorld();
    ctx.restore();
    drawDeathEffect(death);
    if (progress === 1) {
      death.finished = true;
      const guardKill = death.cause === "guard";
      showPanel(guardKill ? "SUIT SIGNAL TERMINATED" : "SIGNAL LOST",
        guardKill ? "YOU’RE DEAD" : death.reason, "Replay sector", guardKill);
      if (guardKill) select("detail").textContent = death.reason;
    }
  } else if (!death) {
    drawWorld();
  }
  drawMap();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
