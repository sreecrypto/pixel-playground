"use strict";

const modelCache = new Map();
const metalFaces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
  [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];

function geometry(parts) {
  const faces = [];
  const box = (x, y, z, length, breadth, tall, color) => {
    const a = length / 2;
    const b = breadth / 2;
    const bevel = Math.min(a, b, tall) * 0.30;
    if (bevel > 0.018) {
      const outline = [[-a + bevel,-b], [a - bevel,-b], [a,-b + bevel], [a,b - bevel],
        [a - bevel,b], [-a + bevel,b], [-a,b - bevel], [-a,-b + bevel]];
      const foot = outline.map(([px, py]) => [x + px, y + py, z]);
      const crown = foot.map(([px, py]) => [px, py, z + tall]);
      faces.push({ color, light: 1.36, points: crown });
      const lighting = [0.87, 1.18, 1.08, 0.87, 0.70, 0.57, 0.63, 0.78];
      for (let i = 0; i < outline.length; i++) {
        const next = (i + 1) % outline.length;
        faces.push({ color, light: lighting[i], points: [foot[i], foot[next], crown[next], crown[i]] });
      }
      return;
    }
    const points = [[x-a,y-b,z], [x+a,y-b,z], [x+a,y+b,z], [x-a,y+b,z],
      [x-a,y-b,z+tall], [x+a,y-b,z+tall], [x+a,y+b,z+tall], [x-a,y+b,z+tall]];
    metalFaces.forEach((indices, index) => {
      faces.push({ color, light: [0.43, 1.25, 0.83, 1, 0.68, 0.55][index],
        points: indices.map(i => points[i]) });
    });
  };
  const spike = (x, y, z, radius, tall, color) => {
    const base = [[x-radius,y-radius,z], [x+radius,y-radius,z], [x+radius,y+radius,z], [x-radius,y+radius,z]];
    for (let i = 0; i < 4; i++) {
      faces.push({ color, light: [0.72, 1.2, 0.9, 0.55][i],
        points: [base[i], base[(i + 1) % 4], [x, y, z + tall]] });
    }
  };
  parts(box, spike, (color, light, points) => faces.push({ color, light, points }));
  return faces;
}

function enemyModel(type) {
  const palette = {
    scout: ["#6d827f", "#9be8de", "#cfc6a5"], sentinel: ["#9e7453", "#ffd08d", "#813c43"],
    heavy: ["#696d7b", "#ffc36c", "#493442"], specter: ["#55536b", "#dcb0fa", "#35304e"],
    warden: ["#758a80", "#a8ffe1", "#355952"]
  };
  return geometry((box, spike, face) => {
    if (palette[type]) {
      const [plate, visor, cloth] = palette[type];
      const wide = ["heavy", "warden"].includes(type) ? 1.22 : 1;
      for (const side of [-1, 1]) {
        box(0.035, side * 0.11 * wide, 0.015, 0.19, 0.14, 0.095, "#1e2330");
        box(-0.025, side * 0.11 * wide, 0.105, 0.14, 0.115, 0.28, plate);
        box(0.054, side * 0.11 * wide, 0.18, 0.04, 0.11, 0.09, "#22232d");
        box(-0.005, side * 0.24 * wide, 0.37, 0.18, 0.105, 0.23, plate);
        for (let layer = 0; layer < 3; layer++) {
          box(-0.04, side * (0.20 + layer * 0.021) * wide, 0.59 - layer * 0.031,
            0.20 - layer * 0.023, 0.13, 0.038, layer === 0 ? "#c0ac82" : plate);
        }
        box(0.038, side * 0.24 * wide, 0.38, 0.13, 0.115, 0.085, "#6f4a39");
        box(0.065, side * 0.15 * wide, 0.34, 0.105, 0.074, 0.075, "#503d35");
      }
      box(-0.02, 0, 0.33, 0.21, 0.33 * wide, 0.27, "#272a35");
      box(0.073, 0, 0.43, 0.075, 0.29 * wide, 0.15, plate);
      box(0.12, 0, 0.48, 0.02, 0.075, 0.025, visor);
      box(0.11, 0, 0.44, 0.027, 0.19 * wide, 0.021, "#e4cf9f");
      box(-0.025, 0, 0.61, 0.20, 0.22, 0.17, plate);
      box(0.078, 0, 0.634, 0.03, 0.18, 0.103, "#151721");
      for (const side of [-1, 1]) box(0.098, side * 0.048, 0.707, 0.015, 0.065, 0.022, visor);
      const hood = type === "scout" || type === "specter";
      const crown = hood ? cloth : plate;
      for (const side of [-1, 1]) {
        face(crown, 0.85, [[-0.14, side * 0.10, 0.64], [0.105, side * 0.106, 0.67],
          [0.12, side * 0.10, 0.75], [-0.02, side * 0.065, 0.845], [-0.13, side * 0.07, 0.79]]);
        face(crown, 1.24, [[-0.13, side * 0.07, 0.79], [-0.02, side * 0.065, 0.845],
          [0.12, side * 0.10, 0.75], [hood ? 0.16 : 0.112, 0, 0.765], [-0.025, 0, 0.86]]);
        face(cloth, 0.92, [[-0.15, side * 0.14, 0.59], [-0.15, 0, 0.60],
          [-0.27, 0, 0.16], [-0.25, side * 0.19, type === "warden" ? 0.12 : 0.23]]);
        face(cloth, 1.14, [[0.095, side * 0.105, 0.395], [0.125, side * 0.035, 0.395],
          [0.14, side * 0.041, 0.20], [0.105, side * 0.12, 0.235]]);
      }
      box(0.005, 0, 0.366, 0.25, 0.37 * wide, 0.035, "#47322c");
      box(0.143, 0, 0.37, 0.022, 0.068, 0.032, "#ccac72");
      box(0.16, 0.14, 0.425, 0.32, 0.09, 0.078, "#4d5667");
      box(0.33, 0.14, 0.448, 0.11, 0.046, 0.041, "#1e222c");
      if (type === "scout") box(-0.08, -0.10, 0.74, 0.025, 0.025, 0.18, "#aab9c2");
      if (type === "heavy") box(-0.17, 0, 0.38, 0.15, 0.42, 0.28, plate);
      if (type === "specter") spike(-0.08, -0.20, 0.61, 0.08, 0.22, plate);
      if (type === "warden") spike(-0.08, 0.22, 0.65, 0.07, 0.17, plate);
      return;
    }
    const colors = { hound: "#c85f6e", crawler: "#48a790", raptor: "#687cd0",
      mantis: "#92ad4c", brute: "#ba754e" };
    const color = colors[type];
    const upright = ["raptor", "mantis"].includes(type);
    const broad = type === "brute" ? 1.25 : 1;
    const height = upright ? 0.49 : 0.26;
    box(-0.05, 0, height, 0.39, 0.26 * broad, 0.16, color);
    box(0.18, 0, height + 0.07, 0.20, 0.18 * broad, 0.14, color);
    box(0.29, 0, height + 0.06, 0.15, 0.105, 0.07, "#30212c");
    for (const side of [-1, 1]) {
      box(0.264, side * 0.059, height + 0.15, 0.026, 0.05, 0.026, "#ff7950");
      spike(0.15, side * 0.07, height + 0.20, 0.036, type === "hound" ? 0.115 : 0.06, color);
      for (const x of upright ? [-0.11, 0.14] : [-0.19, 0.13]) {
        const leg = upright && x > 0 ? 0.24 : 0.035;
        box(x, side * 0.14 * broad, leg, 0.10, 0.085, height - leg + 0.055, color);
        box(x + 0.04, side * 0.15 * broad, leg, 0.14, 0.083, 0.055, "#31313b");
      }
      if (type === "crawler" || type === "mantis") {
        box(-0.025, side * 0.225, 0.10, 0.12, 0.17, 0.075, color);
      }
    }
    for (const x of [-0.17, -0.06, 0.05]) spike(x, 0, height + 0.14, 0.06, 0.11, color);
    box(-0.29, 0, height - 0.06, 0.25, 0.075, 0.075, color);
  });
}

function trapModel(kind, active) {
  return geometry((box, spike) => {
    const metal = "#546171";
    const trim = active ? "#ff5037" : "#de9b45";
    box(0, 0, 0.012, 0.75, 0.70, 0.075, "#293548");
    for (const side of [-1, 1]) {
      box(0, side * 0.32, 0.081, 0.69, 0.045, 0.027, trim);
      for (const x of [-0.28, 0.28]) box(x, side * 0.245, 0.086, 0.065, 0.065, 0.027, metal);
    }
    if (kind === "spikes") {
      for (const x of [-0.22, 0, 0.22]) for (const y of [-0.18, 0.18]) {
        box(x, y, 0.088, 0.13, 0.13, 0.02, "#121c29");
        spike(x, y, 0.106, 0.057, active ? 0.53 : 0.055, "#aebcc8");
      }
    } else if (kind === "coil" || kind === "gravity") {
      const color = kind === "coil" ? "#66cce8" : "#a673ed";
      for (const y of [-0.20, 0.20]) {
        box(0, y, 0.09, 0.12, 0.12, 0.31, metal);
        for (const z of [0.18, 0.26, 0.34]) box(0, y, z, 0.17, 0.17, 0.035, color);
      }
      box(0, 0, 0.09, 0.27, 0.24, 0.08, "#242338");
      if (active) {
        box(0, 0, 0.34, 0.045, 0.39, 0.045, color);
        spike(0, 0, 0.33, 0.10, 0.16, color);
      }
    } else if (kind === "dragon") {
      box(-0.12, 0, 0.09, 0.22, 0.28, 0.29, metal);
      box(0.015, 0, 0.31, 0.40, 0.33, 0.19, "#79505e");
      box(0.21, 0, 0.30, 0.27, 0.24, 0.12, "#815244");
      box(0.26, 0, 0.285, 0.15, 0.17, 0.025, trim);
      for (const y of [-0.105, 0.105]) {
        spike(-0.13, y, 0.49, 0.065, 0.19, metal);
        box(0.12, y * 1.58, 0.424, 0.082, 0.027, 0.032, "#ff503c");
      }
    } else {
      box(-0.08, 0, 0.10, 0.48, 0.46, 0.32, metal);
      box(0.18, 0, 0.13, 0.11, 0.39, 0.24, "#141d2b");
      for (const y of [-0.15, 0.15]) box(0.22, y, 0.15, 0.17, 0.06, 0.17, metal);
      if (kind === "boulder") spike(0.18, 0, 0.15, 0.16, 0.22, "#7a737d");
      else for (const y of [-0.095, 0, 0.095]) box(0.22, y, 0.24, 0.17, 0.033, 0.038, "#a0b3c3");
    }
  });
}

function meshFor(object) {
  const active = Boolean(object.target);
  const key = object.kind === "enemy" ? object.type : object.kind + (active ? "-active" : "");
  if (!modelCache.has(key)) modelCache.set(key, object.kind === "enemy" ?
    enemyModel(object.type) : trapModel(object.kind, active));
  return modelCache.get(key);
}

function cameraPoint(x, y, z, headingX, headingY) {
  const dx = x - player.x;
  const dy = y - player.y;
  return [dy * headingX - dx * headingY, z, dx * headingX + dy * headingY];
}

function clipNear(points) {
  const result = [];
  const near = 0.09;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a[2] >= near) result.push(a);
    if ((a[2] >= near) !== (b[2] >= near)) {
      const fraction = (near - a[2]) / (b[2] - a[2]);
      result.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, near]);
    }
  }
  return result;
}

function projectPoint([x, z, forward], plane) {
  return [width / 2 + x * width / (2 * plane * forward),
    height / 2 + (0.5 - z) * height * 0.78 / forward];
}

function shadeHex(hex, factor) {
  const rgb = parseInt(hex.slice(1), 16);
  const channel = shift => Math.round(clamp(((rgb >> shift) & 255) * factor, 0, 255));
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

function drawMeshes(headingX, headingY, plane) {
  const faces = [];
  for (const object of [...soldiers, ...traps]) {
    if (distance(player, object) > 13) continue;
    const angle = object.angle ?? 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const stride = object.kind === "enemy" ? Math.sin(elapsed * 12 + object.x) * 0.025 : 0;
    for (const face of meshFor(object)) {
      const points = clipNear(face.points.map(([x, y, z]) => cameraPoint(
        object.x + c * x - s * y, object.y + s * x + c * y, z + stride, headingX, headingY)));
      if (points.length < 3) continue;
      const forward = points.reduce((sum, point) => sum + point[2], 0) / points.length;
      const screen = points.map(point => projectPoint(point, plane));
      faces.push({ screen, forward, color: shadeHex(face.color, face.light / (1 + forward * 0.10)) });
    }
  }
  faces.sort((a, b) => b.forward - a.forward);
  for (const { screen, forward, color } of faces) {
    const left = Math.max(0, Math.floor(Math.min(...screen.map(point => point[0]))));
    const right = Math.min(width, Math.ceil(Math.max(...screen.map(point => point[0]))));
    if (right <= left) continue;
    ctx.save();
    ctx.beginPath();
    for (let x = left; x < right;) {
      if (depth[x] <= forward) {
        x++;
        continue;
      }
      const start = x++;
      while (x < right && depth[x] > forward) x++;
      ctx.rect(start, 0, x - start, height);
    }
    ctx.clip();
    polygon(ctx, color, screen);
    ctx.restore();
  }
  for (const drop of blood) {
    const point = cameraPoint(drop.x, drop.y, drop.z, headingX, headingY);
    if (point[2] < 0.09) continue;
    const [x, y] = projectPoint(point, plane);
    if (x < 0 || x >= width || point[2] >= depth[Math.floor(x)]) continue;
    ctx.globalAlpha = Math.min(1, drop.life * 1.7);
    ctx.fillStyle = drop.z > 0.02 ? "#c9233d" : "#79132a";
    ctx.beginPath();
    const radius = clamp((drop.z > 0.02 ? 3.0 : 5.0) / point[2], 1, 14);
    ctx.ellipse(x, y, radius, radius * (drop.z > 0.02 ? 1 : 0.34), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDeck(headingX, headingY, plane) {
  const tileAt = (x, y, padding) => clipNear([
    [x + padding, y + padding], [x + 1 - padding, y + padding],
    [x + 1 - padding, y + 1 - padding], [x + padding, y + 1 - padding]
  ].map(([px, py]) => cameraPoint(px, py, 0, headingX, headingY)));
  const tiles = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (grid[y * columns + x] || Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y) > 10) continue;
    const points = tileAt(x, y, 0.013);
    if (points.length >= 3) tiles.push({ points, x, y });
  }
  for (const { points, x, y } of tiles) {
    const gap = Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y);
    const screen = points.map(point => projectPoint(point, plane));
    polygon(ctx, shadeHex((x + y) % 2 ? "#426a87" : "#577f98", 1 / (1 + gap * 0.11)), screen);
    if ((x + y * 2) % 6 === 0) {
      const marker = clipNear([[x + 0.12,y + 0.11], [x + 0.88,y + 0.11],
        [x + 0.88,y + 0.17], [x + 0.12,y + 0.17]]
        .map(([px, py]) => cameraPoint(px, py, 0, headingX, headingY)));
      if (marker.length >= 3) polygon(ctx, shadeHex("#65e4d1", 1 / (1 + gap * 0.13)),
        marker.map(point => projectPoint(point, plane)));
    }
    if (gap < 6 && (x * 3 + y) % 5 === 0) {
      const insert = tileAt(x, y, 0.22).map(point => projectPoint(point, plane));
      if (insert.length >= 3) {
        ctx.strokeStyle = shadeHex("#648a9f", 1 / (1 + gap * 0.25));
        ctx.beginPath();
        ctx.moveTo(...insert[0]);
        for (const point of insert.slice(1)) ctx.lineTo(...point);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }
}

function drawDeathEffect(scene) {
  const progress = clamp(scene.time / 1.15, 0, 1);
  const centerX = width / 2;
  const centerY = height / 2;
  const cause = scene.cause;
  const veil = (color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  };
  if (cause === "spikes") {
    const heightAt = height * Math.min(0.85, progress * 2.7);
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.25) * width / 8;
      const tip = height - heightAt * (0.55 + (i * 7 % 5) / 10);
      polygon(ctx, "#505968", [[x - 40, height], [x + 24, tip], [x + 58, height]]);
      polygon(ctx, "#c4ced9", [[x - 40, height], [x + 24, tip], [x + 8, height]]);
    }
    veil("#900522", progress * 0.48);
  } else if (cause === "boulder") {
    const radius = Math.min(width, 22 + progress * width);
    const outline = Array.from({ length: 10 }, (_, i) => {
      const angle = i * Math.PI / 5 + progress * 1.4;
      const edge = radius * (0.74 + i % 3 * 0.12);
      return [centerX + Math.cos(angle) * edge, centerY + Math.sin(angle) * edge];
    });
    polygon(ctx, "#41404b", outline);
    polygon(ctx, "#8d8588", [outline[0], outline[2], outline[3], [centerX - radius * 0.23, centerY]]);
    veil("#090911", progress * 0.70);
  } else if (cause === "arrows") {
    for (let i = 0; i < 5; i++) {
      const p = clamp(progress * 3 - i * 0.15, 0, 1);
      const x = width * (i % 2 ? p : 1 - p);
      const y = height * (0.27 + 0.10 * i);
      polygon(ctx, "#b8c7d0", [[x - 44, y + 3], [x + 19, y], [x - 39, y - 3]]);
      ctx.strokeStyle = "#da3150";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 37 * p, y - 22 * p);
      ctx.lineTo(x + 61 * p, y - 19 * p);
      ctx.stroke();
    }
    veil("#630e2c", progress * 0.46);
  } else if (cause === "dragon") {
    for (let i = 0; i < 24; i++) {
      const x = i * width / 23;
      const tip = height - progress * height * (0.56 + 0.34 * Math.abs(Math.sin(i * 12 + scene.time * 20)));
      polygon(ctx, i % 3 ? "#fa5621" : "#ffd269", [[x - 37, height], [x + 12, tip],
        [x + 37, height * 0.89], [x + 62, height]]);
    }
    veil("#a31e12", progress * 0.45);
  } else if (cause === "coil") {
    veil("#286995", progress * 0.30);
    ctx.strokeStyle = "#a2edff";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const x = width * i / 5;
      ctx.beginPath();
      ctx.moveTo(x, i % 2 ? 0 : height);
      for (let j = 1; j <= 5; j++) {
        const fraction = j / 5;
        ctx.lineTo(x + (centerX - x) * fraction + Math.sin(j * 15 + i * 8 + scene.time * 30) * 28,
          (i % 2 ? 0 : height) + (i % 2 ? centerY : -centerY) * fraction);
      }
      ctx.stroke();
    }
  } else if (cause === "gravity") {
    veil("#25123c", progress * 0.47);
    for (let i = 0; i < 7; i++) {
      const radius = (1.02 - progress * 0.7) * (42 + i * 47);
      ctx.strokeStyle = i % 2 ? "#9864e6" : "#da99ff";
      ctx.lineWidth = 1 + progress * 2;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radius, radius * 0.56, progress * 1.9 + i * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const angle = i * 2.39;
      const radius = (120 + i * 17) * progress;
      ctx.fillStyle = i % 2 ? "#90112d" : "#c92040";
      ctx.beginPath();
      ctx.ellipse(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius,
        5 + i % 4 * 3, 4 + i % 3 * 3, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    veil("#49051b", progress * 0.52);
  }
}
