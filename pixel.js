// Пиксельная графика: персонажи, кабинет, аватар врача, пикселизация фото.
const PX = (() => {
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hash(str) {
    let h = 2166136261;
    for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }

  function mix(a, b, k) {
    const p = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const x = p(a), y = p(b);
    return '#' + ((1 << 24) | x.reduce((acc, v, i) => acc | (Math.round(v + (y[i] - v) * k) << (16 - 8 * i)), 0)).toString(16).slice(1);
  }

  const SKIN = ['#f6d5b8', '#efc3a1', '#e2ad86', '#c98d66', '#a86c4a', '#7d4f35'];
  const HAIR = ['#2b1d16', '#4a2f1f', '#7a4b2a', '#b07a3c', '#d9b26a', '#141414', '#8a3b22'];
  const GREY = ['#c9c9c9', '#a8a8a8', '#e3e0da'];
  const SHIRT = ['#d9534f', '#4a90d9', '#5cb85c', '#f0ad4e', '#9b59b6', '#e67e22', '#3fb0ac', '#e86f9a', '#6c7a89', '#c0392b'];
  const PANTS = ['#2f3e5c', '#3b3b3b', '#5a4632', '#2d5a7b', '#6b4f7a', '#44546a'];

  const DIM = {
    adult: { H: 46, hw: 10, hh: 11, tw: 12, th: 15, lh: 18 },
    teen: { H: 42, hw: 10, hh: 10, tw: 12, th: 14, lh: 16 },
    child: { H: 34, hw: 10, hh: 10, tw: 10, th: 10, lh: 12 },
    toddler: { H: 26, hw: 10, hh: 9, tw: 8, th: 8, lh: 7 },
  };

  // Описание внешности персонажа, детерминированное по seed.
  function makeLook(seed, kind, sex, extra) {
    const r = rng(seed);
    const old = extra && extra.old;
    const girlStyles = ['long', 'pony', 'bob', 'bun'];
    const boyStyles = ['short', 'spiky', 'short', 'curly'];
    return {
      kind, sex,
      skin: pick(r, SKIN),
      hair: old ? pick(r, GREY) : pick(r, HAIR),
      style: old ? (sex === 'f' ? 'bun' : 'bald') : (sex === 'f' ? pick(r, girlStyles) : pick(r, boyStyles)),
      shirt: pick(r, SHIRT),
      pants: pick(r, PANTS),
      skirt: sex === 'f' && kind !== 'toddler' && r() < 0.5,
      beard: sex === 'm' && kind === 'adult' && r() < 0.35,
      glasses: (old && r() < 0.8) || (kind === 'adult' && r() < 0.2),
      sick: (extra && extra.sick) || [],
      rashSeed: seed ^ 0x9e3779b9,
    };
  }

  // Рисует человечка; (cx, baseY) — центр по x и линия пола.
  function drawPerson(ctx, cx, baseY, s, frame, talking, baby) {
    const D = DIM[s.kind];
    const breathe = (frame >> 2) % 2;
    const top = baseY - D.H;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x), Math.round(top + y), w, h); };
    const pale = s.sick.includes('pale');
    let skin = pale ? shade(s.skin, 0.25) : s.skin;
    if (s.sick.includes('jaundice')) skin = mix(skin, '#e8c547', 0.45);
    const skinD = shade(skin, -0.15);
    const { hw, hh, tw, th, lh } = D;
    const torsoY = hh + 1;
    const legY = torsoY + th;

    // тень
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(Math.round(cx - tw / 2 - 3), baseY - 1, tw + 6, 2);

    // ноги
    if (s.skirt) {
      R(-tw / 2 - 1, legY, tw + 2, Math.ceil(lh * 0.45), s.pants);
      R(-tw / 2 + 2, legY + Math.ceil(lh * 0.45), 2, lh - Math.ceil(lh * 0.45) - 2, skin);
      R(tw / 2 - 4, legY + Math.ceil(lh * 0.45), 2, lh - Math.ceil(lh * 0.45) - 2, skin);
    } else {
      R(-tw / 2 + 1, legY, tw / 2 - 1, lh - 2, s.pants);
      R(1, legY, tw / 2 - 1, lh - 2, shade(s.pants, -0.1));
    }
    R(-tw / 2, baseY - top - 2, tw / 2, 2, '#2a2a2a');
    R(1, baseY - top - 2, tw / 2, 2, '#2a2a2a');

    // туловище и руки
    const sy = torsoY + breathe;
    R(-tw / 2, sy, tw, th - breathe, s.shirt);
    R(tw / 2 - 2, sy, 2, th - breathe, shade(s.shirt, -0.15));
    if (!baby) {
      R(-tw / 2 - 2, sy + 1, 2, th - 4, s.shirt);
      R(tw / 2, sy + 1, 2, th - 4, shade(s.shirt, -0.15));
      R(-tw / 2 - 2, sy + th - 3, 2, 2, skin);
      R(tw / 2, sy + th - 3, 2, 2, skin);
    }
    // шея
    R(-1, hh, 2, 2, skinD);

    // голова
    const hx = -hw / 2;
    if (s.style === 'long') R(hx - 1, 1, hw + 2, hh + 4, s.hair);
    R(hx, 0, hw, hh, skin);
    // уши
    R(hx - 1, Math.floor(hh / 2), 1, 2, skinD);
    R(hx + hw, Math.floor(hh / 2), 1, 2, skinD);
    // волосы
    const hc = s.hair;
    switch (s.style) {
      case 'bald':
        R(hx - 1, 2, 1, 3, hc); R(hx + hw, 2, 1, 3, hc); break;
      case 'spiky':
        R(hx, -1, hw, 3, hc); R(hx + 1, -2, 2, 1, hc); R(hx + 5, -2, 2, 1, hc); R(hx, 2, 1, 2, hc); R(hx + hw - 1, 2, 1, 2, hc); break;
      case 'curly':
        R(hx - 1, -1, hw + 2, 3, hc); R(hx - 1, 2, 2, 3, hc); R(hx + hw - 1, 2, 2, 3, hc); R(hx + 2, -2, 2, 1, hc); R(hx + 6, -2, 2, 1, hc); break;
      case 'bun':
        R(hx, -1, hw, 3, hc); R(-2, -4, 4, 3, hc); R(hx, 2, 1, 3, hc); R(hx + hw - 1, 2, 1, 3, hc); break;
      case 'pony':
        R(hx, -1, hw, 3, hc); R(hx, 2, 1, 2, hc); R(hx + hw - 1, 2, 1, 2, hc); R(hx + hw, 1, 2, 6, hc); break;
      case 'bob':
        R(hx - 1, -1, hw + 2, 3, hc); R(hx - 1, 2, 2, hh - 2, hc); R(hx + hw - 1, 2, 2, hh - 2, hc); break;
      case 'long':
        R(hx, -1, hw, 3, hc); R(hx, 2, 1, 3, hc); R(hx + hw - 1, 2, 1, 3, hc); break;
      default:
        R(hx, -1, hw, 3, hc); R(hx, 2, 1, 2, hc); R(hx + hw - 1, 2, 1, 2, hc);
    }
    // лицо
    const ey = Math.floor(hh / 2);
    const blink = frame % 23 === 0;
    if (blink) { R(-3, ey + 1, 2, 1, '#2a1a12'); R(1, ey + 1, 2, 1, '#2a1a12'); }
    else { R(-3, ey, 1, 2, '#2a1a12'); R(2, ey, 1, 2, '#2a1a12'); }
    if (s.glasses) { R(-4, ey - 1, 3, 1, '#555'); R(1, ey - 1, 3, 1, '#555'); R(-1, ey - 1, 2, 1, '#555'); }
    if (s.sick.includes('fever')) { R(-4, ey + 2, 2, 1, '#ff7b7b'); R(2, ey + 2, 2, 1, '#ff7b7b'); }
    const my = ey + 3;
    if (s.beard) R(hx + 1, my - 1, hw - 2, hh - my + 1, shade(s.hair, 0.1));
    if (talking && frame % 2) R(-1, my, 2, 2, '#5a1f1f');
    else if (s.sick.length) { R(-1, my, 2, 1, '#8a3b3b'); R(-2, my + 1, 1, 1, '#8a3b3b'); R(1, my + 1, 1, 1, '#8a3b3b'); }
    else R(-1, my, 2, 1, '#8a3b3b');

    // сыпь / петехии
    if (s.sick.includes('rash') || s.sick.includes('petechiae')) {
      const rr = rng(s.rashSeed);
      const col = s.sick.includes('petechiae') ? '#6b1a3a' : '#e0474c';
      for (let i = 0; i < 10; i++) R(hx + 1 + Math.floor(rr() * (hw - 2)), 1 + Math.floor(rr() * (hh - 2)), 1, 1, col);
      if (!baby) for (let i = 0; i < 4; i++) R(-tw / 2 - 2 + (i % 2) * (tw + 2), sy + 2 + Math.floor(rr() * (th - 5)), 1, 1, col);
      if (s.skirt || s.sick.includes('petechiae')) for (let i = 0; i < 6; i++) R(-tw / 2 + 1 + Math.floor(rr() * (tw - 2)), legY + 2 + Math.floor(rr() * (lh - 5)), 1, 1, col);
    }

    // младенец на руках
    if (baby) {
      const by = sy + 3;
      let bskin = baby.sick.includes('pale') ? shade(baby.skin, 0.25) : baby.skin;
      if (baby.sick.includes('jaundice')) bskin = mix(bskin, '#e8c547', 0.45);
      R(-7, by + 1, 14, 7, '#f3e6c8');
      R(-7, by + 7, 14, 1, '#d9c9a6');
      R(-7, by - 1, 6, 6, bskin);
      R(-7, by - 2, 6, 2, baby.hair);
      R(-6, by + 2, 1, 1, '#2a1a12'); R(-3, by + 2, 1, 1, '#2a1a12');
      if (baby.sick.includes('fever')) R(-7, by + 3, 1, 1, '#ff7b7b');
      if (talking === 'baby' && frame % 2) R(-5, by + 3, 2, 1, '#5a1f1f');
      // руки взрослого
      R(-tw / 2 - 2, sy + 1, 2, 8, s.shirt);
      R(tw / 2, sy + 1, 2, 8, shade(s.shirt, -0.15));
      R(-tw / 2 - 1, by + 6, 3, 2, skin);
      R(tw / 2 - 2, by + 6, 3, 2, skin);
    }
  }

  // Кабинет педиатра (внутреннее разрешение 240×135).
  function drawRoom(ctx, frame, spec) {
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    R(0, 0, 240, 135, '#bfe3dc');
    for (let x = 0; x < 240; x += 12) R(x, 0, 1, 92, '#b3d9d1');
    R(0, 70, 240, 22, '#93c9bf');
    R(0, 70, 240, 2, '#7fb8ad');
    // пол
    R(0, 92, 240, 43, '#e9dcc4');
    for (let y = 92; y < 135; y += 8) for (let x = ((y / 8) % 2) * 8; x < 240; x += 16) R(x, y, 8, 8, '#e0cfb2');
    R(0, 92, 240, 2, '#c9b38f');
    // окно
    R(14, 14, 46, 40, '#f6f6f2');
    R(17, 17, 40, 34, '#8fd0f5');
    R(17, 40, 40, 11, '#a6dd8a');
    const cl = (frame >> 3) % 60;
    R(20 + cl % 30, 22, 10, 3, '#ffffff'); R(22 + cl % 30, 20, 6, 2, '#ffffff');
    R(36, 17, 2, 34, '#f6f6f2'); R(17, 33, 40, 2, '#f6f6f2');
    R(12, 54, 50, 3, '#d8d8d0');
    // плакат: у педиатра — крест, у гастроэнтеролога — желудок
    R(80, 18, 30, 38, '#fffdf5'); R(80, 18, 30, 2, '#e6e0cc');
    if (spec === 'gastro') {
      R(92, 21, 3, 6, '#e59866');
      R(90, 26, 12, 6, '#e8857a'); R(88, 31, 16, 8, '#e8857a'); R(90, 39, 14, 4, '#e8857a');
      R(98, 43, 6, 2, '#e8857a'); R(102, 41, 3, 6, '#e59866');
      R(91, 33, 4, 3, '#f5b7b1');
    } else { R(91, 24, 8, 20, '#e74c3c'); R(85, 30, 20, 8, '#e74c3c'); }
    R(84, 48, 22, 2, '#9aa'); R(86, 51, 18, 2, '#9aa');
    // ростомер
    R(124, 20, 6, 72, '#f9e79f');
    for (let y = 22; y < 90; y += 6) R(124, y, 3, 1, '#b7950b');
    // кушетка под окном
    R(10, 74, 54, 8, '#ecf0f1'); R(10, 70, 54, 5, '#7fb3d5');
    R(12, 82, 3, 12, '#95a5a6'); R(59, 82, 3, 12, '#95a5a6');
    R(8, 60, 8, 14, '#7fb3d5');
    // шкафчик
    R(150, 46, 22, 46, '#f4f6f6'); R(150, 46, 22, 2, '#d5dbdb');
    R(152, 50, 18, 18, '#d6eaf8'); R(152, 70, 18, 20, '#e5e8e8');
    R(156, 54, 3, 10, '#f5b7b1'); R(161, 56, 3, 8, '#abebc6'); R(166, 53, 2, 11, '#f9e79f');
    R(160, 79, 2, 3, '#7b7d7d');
    // дверь (стоит на полу, с наличником и табличкой)
    R(195, 22, 38, 71, '#8e6b47');
    R(198, 25, 32, 67, '#c49a6c');
    R(201, 29, 26, 26, '#b5895c'); R(201, 59, 26, 29, '#b5895c');
    R(224, 56, 3, 5, '#f1c40f'); R(224, 56, 3, 1, '#d4ac0d');
    R(205, 14, 18, 6, '#fdfefe'); R(207, 16, 14, 2, '#2e86c1');
    R(195, 92, 38, 1, '#a8916c');
  }

  // Случайный аватар врача 32×32.
  function drawDoctorAvatar(canvas, seed) {
    const r = rng(seed);
    const ctx = canvas.getContext('2d');
    canvas.width = 32; canvas.height = 32;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const female = r() < 0.5;
    const skin = pick(r, SKIN), skinD = shade(skin, -0.15);
    const hair = pick(r, HAIR);
    const bg = pick(r, ['#9fd8cb', '#f7d794', '#a4c8f0', '#f3b0c3', '#c7b8ea', '#b8e994']);
    R(0, 0, 32, 32, bg);
    R(0, 28, 32, 4, shade(bg, -0.1));
    const style = female ? pick(r, ['long', 'bun', 'bob']) : pick(r, ['short', 'side', 'bald', 'curly']);
    if (style === 'long') R(7, 6, 18, 20, shade(hair, -0.1));
    // халат
    R(4, 24, 24, 8, '#f4f6f8'); R(4, 24, 2, 8, '#dfe4ea'); R(26, 24, 2, 8, '#dfe4ea');
    const shirt = pick(r, ['#5dade2', '#58d68d', '#af7ac5', '#ec7063', '#f5b041']);
    R(13, 24, 6, 8, shirt);
    R(12, 24, 1, 8, '#c8d0d8'); R(19, 24, 1, 8, '#c8d0d8');
    // шея
    R(13, 21, 6, 4, skinD);
    // стетоскоп
    R(10, 24, 1, 5, '#444'); R(21, 24, 1, 5, '#444'); R(11, 29, 10, 1, '#444'); R(15, 30, 3, 2, '#9aa4ad');
    // голова
    R(9, 7, 14, 15, skin);
    R(9, 7, 1, 1, bg); R(22, 7, 1, 1, bg);
    R(8, 12, 1, 4, skinD); R(23, 12, 1, 4, skinD);
    R(10, 21, 12, 1, skinD);
    // волосы
    switch (style) {
      case 'long': R(8, 4, 16, 5, hair); R(8, 8, 2, 14, hair); R(22, 8, 2, 14, hair); break;
      case 'bun': R(8, 4, 16, 5, hair); R(13, 1, 6, 4, hair); R(8, 8, 2, 5, hair); R(22, 8, 2, 5, hair); break;
      case 'bob': R(7, 4, 18, 5, hair); R(7, 8, 3, 11, hair); R(22, 8, 3, 11, hair); break;
      case 'side': R(8, 4, 16, 4, hair); R(8, 8, 9, 2, hair); R(8, 8, 2, 4, hair); R(22, 8, 1, 4, hair); break;
      case 'bald': R(8, 9, 2, 5, hair); R(22, 9, 2, 5, hair); R(10, 6, 12, 1, shade(skin, 0.15)); break;
      case 'curly': R(7, 3, 18, 6, hair); R(7, 8, 2, 6, hair); R(23, 8, 2, 6, hair); R(9, 2, 3, 1, hair); R(15, 2, 3, 1, hair); R(20, 2, 3, 1, hair); break;
      default: R(8, 4, 16, 5, hair); R(8, 8, 2, 4, hair); R(22, 8, 2, 4, hair);
    }
    // лицо
    R(11, 11, 3, 1, shade(hair, 0.1)); R(18, 11, 3, 1, shade(hair, 0.1));
    R(11, 13, 3, 2, '#ffffff'); R(18, 13, 3, 2, '#ffffff');
    const eye = pick(r, ['#2a1a12', '#3b6ea5', '#4e7d3a', '#5a3a22']);
    R(12, 13, 2, 2, eye); R(19, 13, 2, 2, eye);
    R(15, 15, 2, 2, skinD);
    R(14, 18, 4, 1, '#a04a4a');
    if (female) { R(10, 16, 2, 1, shade(skin, -0.05)); R(20, 16, 2, 1, shade(skin, -0.05)); R(14, 18, 4, 1, '#c0485a'); }
    if (r() < 0.3) { R(10, 12, 5, 1, '#333'); R(17, 12, 5, 1, '#333'); R(10, 12, 1, 4, '#333'); R(14, 12, 1, 4, '#333'); R(17, 12, 1, 4, '#333'); R(21, 12, 1, 4, '#333'); R(15, 13, 2, 1, '#333'); R(10, 15, 5, 1, '#333'); R(17, 15, 5, 1, '#333'); }
    if (!female && r() < 0.3) { R(10, 17, 12, 4, shade(hair, 0.05)); R(14, 18, 4, 1, '#a04a4a'); }
    // шапочка врача иногда
    if (r() < 0.25) { R(9, 3, 14, 5, '#f4f6f8'); R(15, 4, 2, 3, '#e74c3c'); R(14, 5, 4, 1, '#e74c3c'); }
  }

  // Фото → пиксельный портрет 32×32 с ограниченной палитрой.
  function photoToPixel(img, canvas, size, k) {
    size = size || 32; k = k || 14;
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = Math.max(0, (img.height - side) * 0.3);
    // ступенчатое уменьшение — меньше «грязи»
    let src = document.createElement('canvas');
    src.width = src.height = 256;
    let c = src.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
    for (const s of [128, 64, size]) {
      const n = document.createElement('canvas');
      n.width = n.height = s;
      const nc = n.getContext('2d');
      nc.imageSmoothingQuality = 'high';
      nc.drawImage(src, 0, 0, s, s);
      src = n;
    }
    const data = src.getContext('2d').getImageData(0, 0, size, size);
    const px = [];
    for (let i = 0; i < data.data.length; i += 4) {
      // небольшое усиление насыщенности и контраста
      let r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1.25, con = 1.1;
      r = (l + (r - l) * sat - 128) * con + 128;
      g = (l + (g - l) * sat - 128) * con + 128;
      b = (l + (b - l) * sat - 128) * con + 128;
      px.push([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))]);
    }
    // k-means
    let cents = [];
    for (let i = 0; i < k; i++) cents.push(px[Math.floor((i + 0.5) * px.length / k)].slice());
    const assign = new Array(px.length).fill(0);
    for (let it = 0; it < 10; it++) {
      const sum = cents.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < px.length; i++) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < k; j++) {
          const d = (px[i][0] - cents[j][0]) ** 2 + (px[i][1] - cents[j][1]) ** 2 + (px[i][2] - cents[j][2]) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
        assign[i] = best;
        const s = sum[best]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++;
      }
      cents = cents.map((c0, j) => sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c0);
    }
    canvas.width = canvas.height = size;
    const out = canvas.getContext('2d');
    const od = out.createImageData(size, size);
    for (let i = 0; i < px.length; i++) {
      const c0 = cents[assign[i]];
      od.data[i * 4] = c0[0]; od.data[i * 4 + 1] = c0[1]; od.data[i * 4 + 2] = c0[2]; od.data[i * 4 + 3] = 255;
    }
    out.putImageData(od, 0, 0);
  }

  return { rng, hash, makeLook, drawPerson, drawRoom, drawDoctorAvatar, photoToPixel };
})();
