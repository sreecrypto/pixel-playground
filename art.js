"use strict";

const wallArt = new Map();

function wallTexture(type) {
  if (wallArt.has(type)) return wallArt.get(type);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const art = canvas.getContext("2d");
  const box = (x, y, w, h, color, radius = 0) => {
    art.fillStyle = color;
    art.beginPath();
    art.roundRect(x, y, w, h, radius);
    art.fill();
  };
  const fade = (y, end, stops) => {
    const paint = art.createLinearGradient(0, y, 0, end);
    stops.forEach(([position, color]) => paint.addColorStop(position, color));
    return paint;
  };
  const gate = type === "gate";
  const accent = { gate: "#ffab40", bay: "#e96e54", lab: "#31c3b2", viewport: "#4ed5ed" }[type];
  box(0, 0, 256, 256, fade(0, 256, [[0,"#6499b1"], [.35,"#354f78"], [1,"#172a4e"]]));
  box(12, 16, 232, 221, "#142747", 18);
  box(17, 18, 222, 209, accent, 14);
  box(22, 24, 212, 195, fade(24, 220, [[0,"#fcf3d9"], [.5,"#bddce3"], [1,"#7298b1"]]), 13);
  box(28, 31, 200, 5, "#fff7e2", 2);
  if (type === "viewport") {
    box(30, 43, 196, 148, "#355075", 16);
    art.save();
    art.beginPath();
    art.roundRect(36, 49, 184, 136, 12);
    art.clip();
    box(36, 49, 184, 136, fade(48, 190, [[0,"#212451"], [.63,"#505193"], [1,"#b77bbb"]]));
    for (let i = 0; i < 43; i++) {
      const x = 38 + (i * 73 % 179);
      const y = 53 + (i * 37 % 126);
      box(x, y, i % 6 ? 1 : 2, i % 6 ? 1 : 2, i % 2 ? "#f9e5c4" : "#aeeaff");
    }
    art.translate(151, 114);
    art.rotate(-0.31);
    art.strokeStyle = "#ffc791";
    art.lineWidth = 7;
    art.beginPath();
    art.ellipse(0, 0, 81, 20, 0, 0, Math.PI * 2);
    art.stroke();
    const globe = art.createRadialGradient(-17, -18, 2, 0, 0, 50);
    globe.addColorStop(0, "#fff2a1");
    globe.addColorStop(.52, "#ffac65");
    globe.addColorStop(1, "#dd5b80");
    art.fillStyle = globe;
    art.beginPath();
    art.arc(0, 0, 48, 0, Math.PI * 2);
    art.fill();
    art.strokeStyle = "#ffddad";
    art.beginPath();
    art.ellipse(0, 0, 81, 20, 0, 0, Math.PI);
    art.stroke();
    art.restore();
  } else if (gate) {
    box(30, 42, 196, 151, "#563954", 13);
    box(36, 48, 184, 139, fade(48, 187, [[0,"#f39652"], [.5,"#cc5a55"], [1,"#743e59"]]), 10);
    box(124, 49, 8, 136, "#63334d", 2);
    for (const side of [-1, 1]) {
      art.save();
      art.translate(128, 110);
      art.scale(side, 1);
      art.strokeStyle = "#ffce64";
      art.lineWidth = 10;
      art.beginPath();
      art.moveTo(28, -23);
      art.lineTo(58, 0);
      art.lineTo(28, 23);
      art.stroke();
      art.restore();
    }
    box(100, 157, 56, 9, "#ffe4a0", 4);
  } else {
    box(33, 52, 190, 103, accent, 12);
    box(38, 57, 180, 88, "#253957", 9);
    art.fillStyle = "#e5fff6";
    art.font = "bold 23px system-ui";
    art.fillText(type === "lab" ? "BIO LAB" : "CARGO", 48, 88);
    for (let i = 0; i < 8; i++) box(48 + i * 13, 104, 8, 9 + (i * 7 % 15), i < 5 ? accent : "#fbc671", 2);
    for (let i = 0; i < 4; i++) {
      box(45, 162 + i * 8, 166, 5, "#435d77", 2);
      box(47, 162 + i * 8, 162, 1, "#94bac4");
    }
  }
  box(20, 221, 216, 8, accent, 3);
  box(20, 231, 216, 4, "#293c5b", 2);
  for (const x of [26, 223]) for (const y of [35, 205]) {
    box(x, y, 7, 7, "#516c8a", 3);
    box(x + 1, y + 1, 3, 2, "#e2eff0", 1);
  }
  wallArt.set(type, canvas);
  return canvas;
}
