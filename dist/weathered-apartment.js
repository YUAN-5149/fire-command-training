// 富錦街鄰棟公寓・外觀升級示範（不改配置，只換材質、加附屬設備）
// - 牆面：程序化二丁掛磁磚 + 雨痕、冷氣滴水、鐵窗鏽痕、頂緣污痕、牆腳潮濕、角落陰影（烘焙進貼圖）
// - 法線貼圖：磁磚縫的凹凸
// - 附屬：落水管、黃色瓦斯管、冷氣排水管、外牆電纜、電錶箱
// 所有貼圖都在瀏覽器裡用 canvas 畫出，不需要額外圖檔。加 ?look=classic 可看原版。
import * as T from 'three';

const FRONT_W = 11.7, DEPTH = 7.5, HALF_W = FRONT_W / 2, HALF_D = DEPTH / 2;
const SIDE_U0 = 12.0;                 // 圖集裡側牆區的起點（公尺），中間留 0.3m 間隔避免滲色
const ATLAS_W = SIDE_U0 + DEPTH;      // 圖集總寬（公尺）
const PPM = 80;                       // 每公尺像素

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
// willReadFrequently：讓瀏覽器用軟體畫布，getImageData 不必從 GPU 讀回（快很多）
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function tex(c, srgb = true, repeat = false) {
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
// 低解析度亂數放大，做出大範圍色差
function mottle(ctx, w, h, cell, r, alpha, dark = [60, 54, 44], light = [255, 250, 235]) {
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), [c, x] = canvas(cw, ch), id = x.createImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    const v = r(), d = v < .5, col = d ? dark : light, a = Math.abs(v - .5) * 2;
    id.data.set([col[0], col[1], col[2], 255 * a * alpha], i * 4);
  }
  x.putImageData(id, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${Math.max(1, cell * .45)}px)`;   // 放大後柔化，避免看出方格
  ctx.drawImage(c, -cell, -cell, w + cell * 2, h + cell * 2);
  ctx.filter = 'none';
}
function grain(ctx, w, h, amt, r) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n * .9; }
  ctx.putImageData(id, 0, 0);
}
// 一道垂流污痕：上濃下淡，略帶擺動
function streak(ctx, x, y, len, w, rgb, a, r) {
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.35, `rgba(${rgb},${a * .55})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath();
  const wob = (r() - .5) * w * 1.4;
  ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y);
  ctx.quadraticCurveTo(x + w * .35 + wob, y + len * .55, x + w * .15 + wob, y + len);
  ctx.lineTo(x - w * .15 + wob, y + len);
  ctx.quadraticCurveTo(x - w * .35 + wob, y + len * .55, x - w / 2, y);
  ctx.fill();
}
function softBand(ctx, x0, x1, y, h, a) {   // 烘焙陰影：在突出物正下方
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(30,28,24,${a})`); g.addColorStop(1, 'rgba(30,28,24,0)');
  ctx.fillStyle = g; ctx.fillRect(x0, y, x1 - x0, h);
}

/* ---------------- 牆面圖集（正面 + 側面） ---------------- */
function wallAtlas(h, floors, layout) {
  const W = Math.round(ATLAS_W * PPM), H = Math.round(h * PPM), r = rng(5149);
  const [c, x] = canvas(W, H);
  const px = X => (X + HALF_W) * PPM, py = Y => (h - Y) * PPM;   // 正面座標 → 像素

  // 1) 二丁掛磁磚（22.7 x 6.5 cm，交錯排列），每片微小色差；同時算高度圖給法線用
  const tw = .227 * PPM, th = .065 * PPM, height = new Float32Array(W * H);
  // 一次逐像素算完：磁磚底色、磁磚縫、細雜訊、高度（比逐片 fillRect 快很多）
  const id = x.createImageData(W, H), d = id.data, cols = Math.ceil(W / tw) + 2;
  const tileShade = new Float32Array(Math.ceil(H / th + 1) * cols * 3);
  for (let k = 0; k < tileShade.length; k += 3) {
    const v = (r() - .5) * 10, rare = r(), bump = rare < .012 ? 14 : rare < .02 ? -16 : 0;  // 少數補貼過的新、舊磁磚
    tileShade[k] = 196 + v + bump; tileShade[k + 1] = 190 + v + bump; tileShade[k + 2] = 172 + v * .8 + bump * .85;
  }
  for (let j = 0; j < H; j++) {
    const row = Math.floor(j / th), fy = j - row * th, off = (row % 2) * tw / 2;
    for (let i = 0; i < W; i++) {
      const sx = i + off, col = Math.floor(sx / tw), fx = sx - col * tw;
      const e = Math.min(fx, tw - fx, fy, th - fy), p = j * W + i, q = p * 4, n = (r() - .5) * 10;
      if (e < 1) { d[q] = 180 + n; d[q + 1] = 177 + n; d[q + 2] = 162 + n; height[p] = 0; }   // 磁磚縫（水泥色）
      else {
        const t = (row * cols + col) * 3, s = e < 2 ? .94 : 1;
        d[q] = tileShade[t] * s + n; d[q + 1] = tileShade[t + 1] * s + n; d[q + 2] = tileShade[t + 2] * s + n * .9;
        height[p] = e < 2 ? .7 : 1;   // 平面磁磚，邊緣只有一像素斜角
      }
      d[q + 3] = 255;
    }
  }
  x.putImageData(id, 0, 0);
  // 2) 大範圍色差與污漬
  mottle(x, W, H, 48, r, .1, [84, 76, 60]);
  mottle(x, W, H, 14, r, .05, [84, 76, 60]);

  // 3) 正面：依窗戶位置畫雨痕、冷氣滴水、鐵窗鏽痕、烘焙陰影
  const ctx = x;
  for (let f = 0; f < floors; f++) {
    const base = f * 3.2;
    // 樓層線下方陰影
    if (f > 0) softBand(ctx, px(-HALF_W), px(HALF_W), py(base + .47), .22 * PPM, .32);
    for (const wx of layout.windowX) {
      if (f === 0 && Math.abs(wx) < 2) continue;
      if (f > 0) {
        const sillY = base + .74, sx0 = px(wx - 1.17), sx1 = px(wx + 1.17);
        softBand(ctx, sx0, sx1, py(sillY), .18 * PPM, .38);            // 窗台下陰影
        // 窗台兩端是雨水最集中的地方：濃、長
        for (const end of [sx0 + 6, sx1 - 6]) for (let n = 0; n < 4; n++)
          streak(ctx, end + (r() - .5) * 18, py(sillY), (1.1 + r() * 1.5) * PPM, 4 + r() * 10, '58,52,42', .32 + r() * .2, r);
        // 中段：細、淡
        for (let n = 0; n < 16; n++)
          streak(ctx, sx0 + r() * (sx1 - sx0), py(sillY), (.4 + r() * 1.3) * PPM, 2 + r() * 6, '64,58,46', .12 + r() * .14, r);
        // 鐵窗鏽痕（有鐵窗的窗戶）
        if ((f + layout.windowX.indexOf(wx)) % 3 !== 0)
          for (let n = 0; n < 7; n++)
            streak(ctx, sx0 + 10 + r() * (sx1 - sx0 - 20), py(sillY), (.3 + r() * .9) * PPM, 2 + r() * 4, '128,72,34', .18 + r() * .16, r);
        // 窗型冷氣滴水：窄、深、偏綠
        if ((layout.windowX.indexOf(wx) + f) % 2 === 0) {
          const ax = px(wx + .5);
          streak(ctx, ax, py(base + 2.36), (1.6 + r() * .8) * PPM, 16, '46,52,40', .42, r);
          streak(ctx, ax + 4, py(base + 2.36), (2.2 + r()) * PPM, 7, '70,88,58', .28, r);
        }
      }
      // 窗框外圍一圈薄灰
      ctx.strokeStyle = 'rgba(40,38,32,.18)'; ctx.lineWidth = 5;
      ctx.strokeRect(px(wx - 1.08), py(base + 2.78), 2.16 * PPM, 1.86 * PPM);
    }
  }
  // 頂緣（女兒牆）往下流的黑色污痕
  for (let n = 0; n < 70; n++) {
    const X = -HALF_W + r() * FRONT_W;
    streak(ctx, px(X), 0, (.4 + r() * 2.6) * PPM, 4 + r() * 22, '42,40,34', .14 + r() * .22, r);
  }
  // 側牆區：頂緣污痕 + 垂直髒污
  for (let n = 0; n < 45; n++) {
    const u = (SIDE_U0 + r() * DEPTH) * PPM;
    streak(ctx, u, 0, (.5 + r() * 4) * PPM, 6 + r() * 26, '44,42,36', .12 + r() * .2, r);
    if (n < 12) streak(ctx, u, (r() * h * .6) * PPM, (1 + r() * 3) * PPM, 3 + r() * 6, '52,48,40', .1, r);
  }
  // 4) 牆角變暗（左右邊緣）、牆腳潮濕
  for (const [u0, u1] of [[0, FRONT_W], [SIDE_U0, ATLAS_W]]) {
    for (const [edge, dir] of [[u0, 1], [u1, -1]]) {
      const g = ctx.createLinearGradient(edge * PPM, 0, (edge + dir * .35) * PPM, 0);
      g.addColorStop(0, 'rgba(36,34,28,.32)'); g.addColorStop(1, 'rgba(36,34,28,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(edge, edge + dir * .35) * PPM, 0, .35 * PPM, H);
    }
  }
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let u = 0; u <= W; u += 20) ctx.lineTo(u, H - (.45 + Math.sin(u * .013) * .08 + r() * .14) * PPM);
  ctx.lineTo(W, H); ctx.closePath(); ctx.clip();
  const damp = ctx.createLinearGradient(0, H - .7 * PPM, 0, H);
  damp.addColorStop(0, 'rgba(58,64,50,.18)'); damp.addColorStop(1, 'rgba(40,44,34,.55)');
  ctx.fillStyle = damp; ctx.fillRect(0, H - .8 * PPM, W, .8 * PPM);
  ctx.restore();
  for (let n = 0; n < 160; n++) {      // 地面濺泥
    const u = r() * W, v = H - r() * .35 * PPM;
    ctx.fillStyle = `rgba(48,44,36,${.08 + r() * .12})`; ctx.fillRect(u, v, 1 + r() * 3, 1 + r() * 3);
  }

  // 法線貼圖：由高度圖求梯度
  const [nc, nx] = canvas(W, H), nid = nx.createImageData(W, H), nd = nid.data, S = .7;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const hl = height[j * W + Math.max(i - 1, 0)], hr = height[j * W + Math.min(i + 1, W - 1)];
    const hu = height[Math.max(j - 1, 0) * W + i], hd = height[Math.min(j + 1, H - 1) * W + i];
    let ax = (hl - hr) * S, ay = (hd - hu) * S, az = 1; const l = Math.hypot(ax, ay, az);
    const k = (j * W + i) * 4;
    nd[k] = (ax / l * .5 + .5) * 255; nd[k + 1] = (ay / l * .5 + .5) * 255; nd[k + 2] = (az / l * .5 + .5) * 255; nd[k + 3] = 255;
  }
  nx.putImageData(nid, 0, 0);
  return { map: tex(c), normal: tex(nc, false) };
}

// 把牆面方塊的 UV 改成對應圖集的世界座標，讓污痕剛好落在窗台下方
function atlasUV(mesh, h) {
  const g = mesh.geometry.clone(); mesh.geometry = g;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, o = mesh.position;
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i) + o.x, Y = p.getY(i) + o.y, Z = p.getZ(i) + o.z, nx = n.getX(i), nz = n.getZ(i);
    let um;
    if (nz > .5) um = X + HALF_W;
    else if (nx > .5) um = SIDE_U0 + (HALF_D - Z);
    else if (nx < -.5) um = SIDE_U0 + (Z + HALF_D);
    else if (nz < -.5) um = SIDE_U0 + (X + HALF_W) * DEPTH / FRONT_W;
    else um = SIDE_U0 + .2;
    uv.setXY(i, um / ATLAS_W, Math.min(1, Math.max(0, Y / h)));
  }
  uv.needsUpdate = true;
}

// 一般方塊：依實際尺寸投影 UV（每公尺 1 個重複），避免貼圖被長條方塊拉長
function metricUV(mesh) {
  const g = mesh.geometry.clone(); mesh.geometry = g;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, X, Z); else if (ax >= az) uv.setXY(i, Z, Y); else uv.setXY(i, X, Y);
  }
  uv.needsUpdate = true;
}

/* ---------------- 小型重複貼圖 ---------------- */
function grimeTex(seed, rust = false) {   // 近白底 + 髒污，乘上原本顏色
  const Z = 256, [c, x] = canvas(Z, Z), r = rng(seed);
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, Z, Z);
  mottle(x, Z, Z, 24, r, .26, [96, 90, 76]);
  mottle(x, Z, Z, 6, r, .1, [86, 80, 68]);
  if (rust) for (let n = 0; n < 60; n++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const cx = r() * Z, cy = r() * Z, rad = 3 + r() * 16;
    x.fillStyle = `rgba(${150 + r() * 40},${70 + r() * 30},${30},${.35 + r() * .35})`;
    x.beginPath(); x.ellipse(cx, cy, rad * .6, rad, 0, 0, 7); x.fill();
  }
  grain(x, Z, Z, 22, r);
  return tex(c, true, true);
}
function glassTex(kind, seed) {
  const W = 256, H = 220, [c, x] = canvas(W, H), r = rng(seed);
  x.fillStyle = '#2f3d40'; x.fillRect(0, 0, W, H);
  if (kind === 1) {               // 拉開的窗簾
    const col = ['#c9bfa6', '#a9b8bd', '#c8a99a'][seed % 3];
    for (const [x0, w] of [[0, 70 + r() * 30], [W - 60 - r() * 30, 90]]) {
      x.fillStyle = col; x.fillRect(x0, 0, w, H);
      for (let k = 0; k < w; k += 9) { x.fillStyle = `rgba(0,0,0,${.06 + r() * .1})`; x.fillRect(x0 + k, 0, 4, H); }
    }
  } else if (kind === 2) {        // 百葉
    for (let y = 0; y < H * .75; y += 7) { x.fillStyle = `rgba(214,212,200,${.75})`; x.fillRect(0, y, W, 4); }
  } else {                        // 室內：天花板燈管與家具輪廓
    x.fillStyle = 'rgba(210,214,200,.35)'; x.fillRect(W * .3, 22, W * .4, 6);
    x.fillStyle = 'rgba(20,24,24,.55)'; x.fillRect(20, H * .55, 90, H * .45); x.fillRect(150, H * .62, 80, H * .38);
  }
  // 天空反光（上亮下暗）+ 斜向高光
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(196,212,214,.55)'); g.addColorStop(.5, 'rgba(150,168,170,.18)'); g.addColorStop(1, 'rgba(40,50,52,.1)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.12)';
  x.beginPath(); x.moveTo(W * .55, 0); x.lineTo(W * .75, 0); x.lineTo(W * .35, H); x.lineTo(W * .15, H); x.fill();
  // 角落積灰
  const v = x.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, W * .75);
  v.addColorStop(0, 'rgba(120,112,96,0)'); v.addColorStop(1, 'rgba(120,112,96,.35)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  return tex(c);
}
function acTex() {                  // 窗型冷氣背面：散熱鰭片 + 風扇
  const Z = 256, [c, x] = canvas(Z, Z), r = rng(77);
  x.fillStyle = '#d4d0c2'; x.fillRect(0, 0, Z, Z);
  x.fillStyle = '#3f4442'; x.fillRect(18, 22, Z - 36, Z - 52);
  x.strokeStyle = '#2a2e2d'; x.lineWidth = 3; x.beginPath(); x.arc(Z / 2, Z / 2 - 4, 72, 0, 7); x.stroke();
  for (let k = 0; k < 3; k++) { x.save(); x.translate(Z / 2, Z / 2 - 4); x.rotate(k * 2.09 + .3); x.fillStyle = '#585e5b'; x.beginPath(); x.ellipse(32, 0, 34, 13, .4, 0, 7); x.fill(); x.restore(); }
  for (let u = 20; u < Z - 18; u += 5) { x.fillStyle = 'rgba(180,186,180,.55)'; x.fillRect(u, 22, 1.6, Z - 52); }
  const g = x.createLinearGradient(0, Z * .6, 0, Z);
  g.addColorStop(0, 'rgba(90,70,40,0)'); g.addColorStop(1, 'rgba(110,74,36,.55)');
  x.fillStyle = g; x.fillRect(0, 0, Z, Z);
  grain(x, Z, Z, 18, r);
  return tex(c);
}
function shutterTex() {             // 鐵捲門：橫向肋條 + 下緣髒污
  const W = 512, H = 384, [c, x] = canvas(W, H), r = rng(31);
  for (let y = 0; y < H; y += 12) {
    const g = x.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, '#7f8a86'); g.addColorStop(.5, '#a3ada8'); g.addColorStop(1, '#5c6663');
    x.fillStyle = g; x.fillRect(0, y, W, 12);
  }
  mottle(x, W, H, 30, r, .2, [50, 46, 38]);
  const g = x.createLinearGradient(0, H * .55, 0, H);
  g.addColorStop(0, 'rgba(56,50,40,0)'); g.addColorStop(1, 'rgba(56,50,40,.6)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let n = 0; n < 18; n++) streak(x, r() * W, 0, 60 + r() * 200, 3 + r() * 10, '120,74,40', .15 + r() * .15, r);
  grain(x, W, H, 14, r);
  return tex(c);
}
function meterTex() {               // 電錶箱：兩個錶窗
  const W = 128, H = 180, [c, x] = canvas(W, H);
  x.fillStyle = '#9ea5a1'; x.fillRect(0, 0, W, H);
  for (const y of [28, 98]) { x.fillStyle = '#1f2826'; x.fillRect(22, y, 84, 54); x.fillStyle = '#d9dfd6'; x.fillRect(32, y + 10, 64, 14); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(22, y, 84, 10); }
  x.strokeStyle = '#6c7470'; x.lineWidth = 3; x.strokeRect(4, 4, W - 8, H - 8);
  return tex(c);
}

/* ---------------- 主程式 ---------------- */
export function weatherApartment(g, { height: h, tileMat, seed = 1 }) {
  const floors = Math.round(h / 3.2), layout = { windowX: [-4, -1.35, 1.3, 3.95] };
  const r = rng(seed * 97 + 3);
  const atlas = wallAtlas(h, floors, layout);
  const wallMat = new T.MeshStandardMaterial({ map: atlas.map, normalMap: atlas.normal, normalScale: new T.Vector2(.35, .35), roughness: .9 });
  const grime = grimeTex(11), rusty = grimeTex(23, true);
  const M = (color, extra = {}) => new T.MeshStandardMaterial({ color, map: grime, roughness: .9, ...extra });
  const glass = [0, 1, 2].map(k => new T.MeshStandardMaterial({ map: glassTex(k, k + 1), roughness: .22, metalness: .15 }));
  const swap = {
    'c1c5b7': M('#c9ccc0', { metalness: .45, roughness: .45 }),        // 鋁窗框
    'b9bcae': M('#c3c5b8', { metalness: .45, roughness: .45 }),
    'abad9d': M('#b3b4a6'),                                             // 窗台
    'c1c5bd': new T.MeshStandardMaterial({ map: acTex(), roughness: .6 }), // 窗型冷氣
    '946c5c': M('#9a705f'), '8e8070': M('#94866f'), '875e51': M('#8c6253'),   // 樓層線
    '8e9990': new T.MeshStandardMaterial({ color: '#97a39a', map: rusty, roughness: .7, metalness: .3 }), // 鐵窗
    '9fa79b': new T.MeshStandardMaterial({ color: '#a6aea2', map: rusty, roughness: .7, metalness: .3 }),
    '78958a': M('#7e9a8f', { roughness: .6, metalness: .25 }),           // 雨遮
    'b8b9a5': M('#bcbca8'),                                             // 一樓雨庇
    '53635e': new T.MeshStandardMaterial({ map: shutterTex(), roughness: .55, metalness: .35 }), // 鐵捲門
    '7d877e': M('#8a948c', { metalness: .35, roughness: .5 }),
    '9d9e90': M('#a3a395'),                                             // 屋頂女兒牆
  };
  let glassIndex = 0;
  g.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === tileMat) { atlasUV(o, h); o.material = wallMat; return; }
    const hex = o.material.color?.getHexString();
    if (hex === '536362') { o.material = glass[(glassIndex++ * 7 + 3) % 3]; return; }
    if (swap[hex]) {
      o.material = swap[hex];
      if (o.material.map === grime || o.material.map === rusty) metricUV(o);
    }
  });

  /* 附屬設備（全部貼在正面 z = 3.75 外側，不擋門窗） */
  const add = (geo, mat, x, y, z, rot) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const pvc = M('#c8cac2', { roughness: .7 }), bracket = M('#6f7470', { metalness: .5, roughness: .5 });
  const gas = new T.MeshStandardMaterial({ color: '#d9b437', map: grime, roughness: .55 });
  const cable = new T.MeshStandardMaterial({ color: '#202322', roughness: .8 });
  const FZ = 3.75;
  // 落水管：左右兩側從屋頂下到地面，含彎頭與管束
  for (const x of [-5.6, 5.6]) {
    const PZ = FZ + .3;   // 管子離牆 30 公分，避開一樓雨庇與樓層線
    add(new T.CylinderGeometry(.055, .055, h - .2, 12), pvc, x, (h - .2) / 2, PZ);
    add(new T.CylinderGeometry(.055, .055, .36, 12), pvc, x, h - .15, FZ + .12, [Math.PI / 2, 0, 0]);
    add(new T.CylinderGeometry(.07, .055, .12, 12), pvc, x, .06, PZ);
    for (let y = 1.2; y < h - .3; y += 1.6) {
      add(new T.CylinderGeometry(.068, .068, .05, 12), bracket, x, y, PZ);
      add(new T.BoxGeometry(.03, .03, .26), bracket, x, y, FZ + .15);
    }
  }
  // 黃色瓦斯立管：沿左側上到四樓，每層有接入分支與錶頭
  const gasTop = Math.min(h - 2.6, 3.2 * 3 + 1.4);
  const GZ = FZ + .26;
  add(new T.CylinderGeometry(.026, .026, gasTop - .3, 8), gas, -5.32, (gasTop + .3) / 2, GZ);
  for (let f = 0; f * 3.2 + 1.3 < gasTop; f++) {
    const y = f * 3.2 + 1.3;
    add(new T.CylinderGeometry(.022, .022, .26, 8), gas, -5.32, y, FZ + .13, [Math.PI / 2, 0, 0]);
    add(new T.BoxGeometry(.12, .16, .08), M('#8f938c'), -5.32, y + .22, GZ);
  }
  // 冷氣排水管：從每台窗型冷氣底部垂下一小段
  for (let f = 1; f < floors; f++) layout.windowX.forEach((wx, k) => {
    if ((k + f) % 2 !== 0) return;
    add(new T.CylinderGeometry(.012, .012, .45, 6), cable, wx + .62, f * 3.2 + 2.13, FZ + .32);
  });
  // 外牆電纜：一樓雨庇與二樓樓層線之間兩條，每兩公尺一個線夾，下垂一點
  for (const [dy, dz] of [[0, 0], [.06, .03]]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60, X = -HALF_W + .1 + t * (FRONT_W - .2), seg = (X + HALF_W) % 2 / 2; pts.push(new T.Vector3(X, 3.4 + dy - Math.sin(seg * Math.PI) * .06, FZ + .07 + dz)); }
    add(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 120, .011, 5), cable, 0, 0, 0);
  }
  for (let X = -HALF_W + .1; X < HALF_W; X += 2) add(new T.BoxGeometry(.04, .1, .06), bracket, X, 3.43, FZ + .06);
  // 電錶箱：入口右側，電纜從上方接下來
  add(new T.BoxGeometry(.5, .7, .14), new T.MeshStandardMaterial({ map: meterTex(), roughness: .6, metalness: .2 }), 1.6, 1.75, FZ + .07);
  return g;
}
