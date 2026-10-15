(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const W = 480, H = 270;
  const WATER_Y = 40;
  const STEP = 1 / 60;
  const BASE_SCROLL = 24;
  const TIME_LIMIT = 240;
  const ARENA_X = 3000;
  const CHECKPOINTS = [470, 1150, 2250];
  const METAL = [1180, 2230];
  const PLAYER_MIN_Y = WATER_Y + 16;
  const AIR_Y = 28;
  const NOSE_X = 33, NOSE_Y = 3;

  const A = window.ATLAS;
  const F = window.PixelFont;
  const SFX = window.SFX;

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('screen');
  const view = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  buf.width = W;
  buf.height = H;
  const ctx = buf.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const IMAGES = {};
  function loadImage(name, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { IMAGES[name] = img; resolve(); };
      img.onerror = () => reject(new Error(src));
      img.src = src;
    });
  }

  let scale = 2;
  function resize() {
    scale = Math.max(1, Math.floor(Math.min(innerWidth / W, (innerHeight - 70) / H)));
    canvas.width = W * scale;
    canvas.height = H * scale;
    view.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- sprites
  const tintCache = new Map();
  function tinted(name, color, amount) {
    const key = `${name}|${color}|${amount}`;
    let c = tintCache.get(key);
    if (!c) {
      const [sx, sy, w, h] = A[name];
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(IMAGES.atlas, sx, sy, w, h, 0, 0, w, h);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = amount;
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      tintCache.set(key, c);
    }
    return c;
  }

  const NO = {};
  function spr(name, cx, cy, o = NO) {
    const r = A[name];
    if (!r) return;
    const w = r[2], h = r[3];
    let src = IMAGES.atlas, sx = r[0], sy = r[1];
    if (o.flash) { src = tinted(name, '#ffffff', 0.85); sx = sy = 0; }
    else if (o.tint) { src = tinted(name, o.tint, o.amt ?? 0.6); sx = sy = 0; }
    if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha));
    const scale = o.scale ?? 1;
    if (o.rot || scale !== 1) {
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(cy));
      if (o.rot) ctx.rotate(o.rot);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(src, sx, sy, w, h, -(w >> 1), -(h >> 1), w, h);
      ctx.restore();
    } else {
      ctx.drawImage(src, sx, sy, w, h, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    }
    if (o.alpha !== undefined) ctx.globalAlpha = 1;
  }
  const size = name => (A[name] ? [A[name][2], A[name][3]] : [8, 8]);
  const sprBottom = (name, cx, by, o) => spr(name, cx, by - size(name)[1] / 2, o);

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  function mulberry(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerpKeys(keys, x) {
    if (x <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [x1, y1] = keys[i];
      if (x <= x1) {
        const [x0, y0] = keys[i - 1];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return keys[keys.length - 1][1];
  }

  // ---------------------------------------------------------------- terrain
  // Segment A: ice shelf with open leads, B: refinery platforms, C: trench under an ice plate.
  const FLOOR_KEYS = [
    [0, 250], [200, 246], [420, 238], [600, 248], [800, 242], [1050, 250],
    [1200, 250], [1270, 250], [1300, 230], [1480, 230], [1510, 250], [1640, 250],
    [1670, 216], [1820, 216], [1850, 236], [2000, 236], [2030, 250], [2230, 250],
    [2350, 242], [2500, 226], [2650, 218], [2800, 224], [2950, 236], [3060, 250], [3800, 250],
  ];
  const SHELVES = [[-80, 360], [560, 920], [1080, 1250], [2250, 4000]];
  const TRENCH_KEYS = [[2250, 14], [2400, 38], [2550, 50], [2700, 48], [2850, 34], [2960, 18], [4000, 16]];
  const isMetal = x => x >= METAL[0] && x <= METAL[1];

  function floorBase(x) {
    let y = lerpKeys(FLOOR_KEYS, x);
    if (!isMetal(x)) y += 3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13 + 1) + 1.2 * Math.sin(x * 0.37);
    return y;
  }

  function ceilThick(x) {
    for (const [a, b] of SHELVES) {
      if (x <= a || x >= b) continue;
      const edge = Math.min(1, (x - a) / 36, (b - x) / 36);
      const base = a >= 2250 ? lerpKeys(TRENCH_KEYS, x) : 20 + 6 * Math.sin(x * 0.021 + a);
      return Math.max(0, (base + 3 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.19 + 2)) * edge);
    }
    return 0;
  }
  const ceilBase = x => WATER_Y + ceilThick(x);
  const ceilRock = x => x >= 2700;

  // Large terrain pieces are solid: they reshape the collision height map.
  const FORMS = (() => {
    const list = [
      ['rock_coral', 150], ['kelp_big', 330, 'deco'], ['rock_spire', 470], ['rock_mound', 740], ['rock_coral', 1010],
      ['ruin_platform', 1225], ['ruin_pipes', 1575], ['ruin_container', 1930], ['ruin_pipes', 2110],
      ['rock_spire', 2380], ['rock_mound', 2540], ['kelp_big', 2650, 'deco'], ['rock_coral', 2730], ['rock_spire', 2880],
      ['ceil_ice_a', 200, 'ceil'], ['ceil_ice_b', 700, 'ceil'], ['ceil_ice_a', 860, 'ceil'],
      ['ceil_ice_b', 2480, 'ceil'], ['ceil_ice_a', 2620, 'ceil'], ['ceil_rock_a', 2790, 'ceil'], ['ceil_rock_b', 2930, 'ceil'],
    ];
    return list.map(([name, x, kind]) => {
      const [sw, sh] = size(name);
      const ceil = kind === 'ceil';
      const box = name.startsWith('ruin_');
      return {
        name, x, sw, sh, ceil, solid: kind !== 'deco', box,
        hw: sw * (box ? 0.46 : 0.4), hh: sh * (ceil ? 0.55 : box ? 0.85 : 0.68),
        by: ceil ? 0 : floorBase(x) + 5, ty: ceil ? ceilBase(x) - 4 : 0,
      };
    });
  })();
  const FLOOR_FORMS = FORMS.filter(f => !f.ceil && f.solid);
  const CEIL_FORMS = FORMS.filter(f => f.ceil);

  function bump(f, x) {
    const d = Math.abs(x - f.x);
    if (d >= f.hw) return 0;
    return f.box ? f.hh : f.hh * (1 - (d / f.hw) ** 1.5);
  }

  function floorY(x) {
    let y = floorBase(x);
    for (const f of FLOOR_FORMS) if (Math.abs(x - f.x) < f.hw) y = Math.min(y, f.by - bump(f, x));
    return y;
  }

  function ceilY(x) {
    let y = ceilBase(x);
    for (const f of CEIL_FORMS) if (Math.abs(x - f.x) < f.hw) y = Math.max(y, f.ty + bump(f, x));
    return y;
  }

  const solidAt = (x, y) => y >= floorY(x) || (y <= ceilY(x) && ceilThick(x) > 1);

  // ---------------------------------------------------------------- input
  const down = new Set();
  const hit = new Set();
  const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F1', 'F2', 'Backquote']);
  addEventListener('keydown', e => {
    if (!e.repeat) hit.add(e.code);
    down.add(e.code);
    if (BLOCK.has(e.code)) e.preventDefault();
    SFX.unlock();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => down.clear());
  addEventListener('pointerdown', () => SFX.unlock());

  let padPrev = [];
  function readInput() {
    const k = (...codes) => codes.some(c => down.has(c));
    const inp = {
      x: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      y: (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0),
      fire: k('KeyJ', 'KeyZ', 'Space'),
      depth: k('KeyK', 'KeyX'),
      start: hit.has('Enter'),
      pause: hit.has('Escape') || hit.has('KeyP'),
      restart: hit.has('KeyR'),
      debug: hit.has('F1') || hit.has('Backquote'),
      skip: hit.has('F2'),
      god: hit.has('KeyG'),
      mute: hit.has('KeyM'),
    };
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const pad = pads.find(Boolean);
    if (pad) {
      const b = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const edge = i => b(i) && !padPrev[i];
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.25) inp.x = clamp((Math.abs(ax) - 0.25) / 0.65, 0, 1) * Math.sign(ax);
      if (Math.abs(ay) > 0.25) inp.y = clamp((Math.abs(ay) - 0.25) / 0.65, 0, 1) * Math.sign(ay);
      if (b(14)) inp.x = -1;
      if (b(15)) inp.x = 1;
      if (b(12)) inp.y = -1;
      if (b(13)) inp.y = 1;
      inp.fire = inp.fire || b(0) || b(7);
      inp.depth = inp.depth || b(1) || b(2) || b(5);
      if (edge(9)) { if (state === 'play' || state === 'pause') inp.pause = true; else inp.start = true; }
      if (edge(0) && state !== 'play') inp.start = true;
      padPrev = pad.buttons.map(x => x.pressed);
    }
    hit.clear();
    return inp;
  }

  // ---------------------------------------------------------------- decor (deterministic)
  const DECOR = (() => {
    const r = mulberry(1993);
    const pick = arr => arr[Math.floor(r() * arr.length)];
    const bergs = [];
    for (let lx = 10; lx < 1400; lx += 70 + r() * 120) bergs.push({ name: r() < 0.5 ? 'floe_big' : 'floe_small', lx });
    const mid = [];
    for (let lx = 60; lx < 400; lx += 90 + r() * 70) mid.push({ name: 'wreck', lx, by: 236 });
    for (let lx = 640; lx < 1300; lx += 46 + r() * 60) mid.push({ name: pick(['pipe_straight', 'pipe_elbow', 'pipe_valve', 'container', 'pipe_straight']), lx, by: 236 - r() * 30 });
    for (let lx = 1300; lx < 1900; lx += 110 + r() * 90) mid.push({ name: pick(['wreck', 'debris_big', 'ruin_platform']), lx, by: 238 });
    const floor = [];
    for (let x = -20; x < 3600; x += 14 + r() * 22) {
      const metal = isMetal(x);
      if (metal && r() < 0.55) continue;
      const name = metal ? pick(['barrel', 'pipe_straight', 'weed_1', 'urchins'])
        : pick(['rock', 'coral', 'weed_0', 'weed_1', 'weed_2', 'anemone', 'tubeworms', 'starfish', 'urchins', 'coral', 'weed_1']);
      floor.push({ name, x });
    }
    const lamps = [];
    for (let x = METAL[0] + 40; x < METAL[1]; x += 80 + r() * 50) lamps.push({ x });
    const fore = [];
    for (let lx = 160; lx < 4300; lx += 260 + r() * 240) fore.push({ name: pick(['debris_big', 'rock', 'wreck', 'rock_mound']), lx });
    const snow = [];
    for (let i = 0; i < 90; i++) snow.push({ x: r() * W, y: WATER_Y + r() * (H - WATER_Y), k: 0.3 + r() * 0.6, p: r() * 6 });
    const icicles = [];
    for (let x = 0; x < 4000; x += 3 + Math.floor(r() * 6)) icicles.push({ x, len: 2 + Math.floor(r() * 6) });
    return { bergs, mid, floor, lamps, fore, snow, icicles };
  })();

  // ---------------------------------------------------------------- game state
  let state = 'title';
  let G = null;
  let debug = false;
  let god = false;
  let hiscore = Number(localStorage.getItem('abyssal-hiscore') || 0);
  let clears = Number(localStorage.getItem('abyssal-clears') || 0);

  function makePlayer(camX, weapon = 'torpedo', tier = 1, bombTier = 1) {
    const x = camX + 90;
    return {
      x, y: clamp(140, ceilY(x) + 30, floorY(x) - 30), vx: 0, vy: 0, w: 36, h: 11,
      hp: 3, inv: 2, weapon, tier, cd: 0, dcd: 0, bombTier, bombCd: 0, roll: 0, bob: 0, muzzle: 0, hitFlash: 0, scrape: 0,
      dead: false, deathT: 0, deathVar: 'a', t: 0, backT: 0, thrust: 0, keep: null,
    };
  }

  const TANKS = [1320, 1362, 1525, 1692, 2062];
  const RELAYS = [835, 1428, 1762, 2660];
  const ICE_X = [300, 610, 2400, 2580];

  function newGame() {
    const props = [];
    for (const x of TANKS) {
      const [sw, sh] = size('tank');
      props.push({ kind: 'tank', x, y: floorY(x) + 6 - sh / 2, w: sw * 0.7, h: sh * 0.85, sw, sh, hp: 6, flash: 0, dead: false });
    }
    for (const x of RELAYS) {
      const [sw, sh] = size('relay');
      props.push({ kind: 'relay', x, y: floorY(x) + 7 - sh / 2, w: sw * 0.34, h: sh * 0.8, sw, sh, hp: 12, flash: 0, dead: false });
    }
    const [iw, ih] = size('ice_chunk');
    const ice = ICE_X.map(x => {
      const y0 = ceilY(x) + ih / 2 - 6;
      return { x, y0, y: y0, w: iw * 0.6, h: ih * 0.7, state: 'hang', t: 0, vy: 0 };
    });
    G = {
      t: 0, cam: { x: 0, speed: BASE_SCROLL }, time: TIME_LIMIT, score: 0, lives: 3, chain: 0, relays: 0,
      checkpoint: 0, spawnIdx: 0, spawnSeq: 0, arena: false, bossT: 0, boss: null, clearT: 0,
      player: makePlayer(0), enemies: [], pshots: [], eshots: [], fx: [], parts: [], pops: [], pickups: [],
      props, ice, timers: [], banner: null, shake: 0, hurt: 0, lastBeep: 99, result: null, bonus: 0,
      secondWeapon: clears === 0 ? 'wave' : (Math.random() < 0.5 ? 'wave' : 'spread'),
    };
  }

  function banner(text, color = '#ffe46a', dur = 1.6) {
    G.banner = { text, color, t: dur };
  }

  function addScore(base, x, y, chained = true) {
    const mult = chained ? 1 + Math.min(4, Math.floor(G.chain / 5)) * 0.5 : 1;
    const pts = Math.round(base * mult);
    G.score += pts;
    G.pops.push({ x, y, text: String(pts), t: 0.8 });
  }

  // ---------------------------------------------------------------- effects
  const FX_SMALL = ['fx_flash', 'fx_boom_a', 'fx_smoke'];
  const FX_BIG = ['fx_flash', 'fx_fireball', 'fx_boom_b', 'fx_ring'];

  function explode(x, y, kind = 'small', silent = false) {
    G.fx.push({ frames: kind === 'big' ? FX_BIG : FX_SMALL, fps: kind === 'big' ? 11 : 15, x, y, t: 0 });
    const n = kind === 'big' ? 14 : 7;
    for (let i = 0; i < n; i++) bubble(x + rand(-10, 10), y + rand(-8, 8), rand(1, 2.5));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(30, 100);
      G.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.4), color: Math.random() < 0.5 ? '#ffd860' : '#ff7a30' });
    }
    G.shake = Math.max(G.shake, kind === 'big' ? 3 : 1.5);
    if (!silent) SFX.play(kind === 'big' ? 'bigBoom' : 'boom');
  }

  function bubble(x, y, r = 1) {
    if (G.parts.length > 500) return;
    G.parts.push({ kind: 'bubble', x, y, vx: rand(-4, 4), vy: rand(-36, -18), life: rand(0.8, 2.4), r });
  }

  function hitSpark(x, y, color = '#ffffff') {
    for (let i = 0; i < 4; i++) {
      G.parts.push({ kind: 'spark', x, y, vx: rand(-60, 20), vy: rand(-40, 40), life: rand(0.08, 0.18), color });
    }
  }

  // ---------------------------------------------------------------- shots
  function pshot(kind, x, y, vx, vy, dmg, o = {}) {
    G.pshots.push({ kind, x, y, vx, vy, dmg, t: 0, w: o.w ?? 6, h: o.h ?? 3, pierce: !!o.pierce, hits: new Set(), hitAny: false, g: o.g ?? 0, ax: o.ax ?? 0, maxV: o.maxV ?? 999, dead: false });
  }

  function eshot(kind, x, y, vx, vy, o = {}) {
    G.eshots.push({ kind, x, y, vx, vy, t: 0, w: o.w ?? 5, h: o.h ?? 4, g: o.g ?? 0, hp: o.hp ?? 0, life: o.life ?? 8, sprite: o.sprite, dead: false });
  }

  const WEAPON_NAMES = { torpedo: 'TORPEDO', hmg: 'HEAVY MG', wave: 'WAVE CANNON', spread: 'SPREAD' };
  const WEAPON_COLORS = { torpedo: '#d8e4ec', hmg: '#ffd34a', wave: '#5fe4ff', spread: '#ff9a3a' };
  const CAPSULES = { hmg: 'capsule_hmg', wave: 'capsule_wave', spread: 'capsule_spread' };

  function fireWeapon(p) {
    const nx = p.x + NOSE_X, ny = p.y + NOSE_Y, t = p.tier;
    const base = G.cam.speed;
    switch (p.weapon) {
      case 'torpedo': {
        p.cd = 0.24;
        const lanes = t === 1 ? [0] : t === 2 ? [-5, 5] : [-9, 0, 9];
        for (const dy of lanes) pshot('torpedo', nx, ny + dy, base + 140, 0, 1, { w: 14, h: 5, ax: 520, maxV: base + 320 });
        SFX.play('torpedo');
        break;
      }
      case 'hmg': {
        p.cd = [0.085, 0.07, 0.058][t - 1];
        for (let i = 0; i < t; i++) pshot('tracer', nx, ny + (i - (t - 1) / 2) * 6 + rand(-1.5, 1.5), base + 360, rand(-16, 16), 0.42, { w: 8, h: 3 });
        SFX.play('hmg');
        break;
      }
      case 'wave': {
        p.cd = 0.36;
        pshot('wave', nx, ny, base + 160, 0, 1.1 + 0.35 * t, { w: 9, h: 14 + t * 6, pierce: true });
        SFX.play('wave');
        break;
      }
      case 'spread': {
        p.cd = 0.3;
        const n = [3, 5, 7][t - 1];
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.13;
          pshot('pellet', nx, ny, base + Math.cos(a) * 240, Math.sin(a) * 240, 0.65, { w: 5, h: 5 });
        }
        SFX.play('spread');
        break;
      }
    }
    p.muzzle = 0.06;
  }

  function dropDepthCharge(p) {
    if (p.bombCd > 0) return;
    p.bombCd = 0.65;
    const bt = p.bombTier;
    const count = bt;
    const baseVx = G.cam.speed + 30 + p.vx * 0.2;
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * 18 : 0;
      pshot('depth', p.x + 6 + spread, p.y - 10, baseVx, -150, 3 + bt, { w: 7, h: 9, g: 240 });
    }
    SFX.play('depth');
  }

  function fireVolley(p) {
    if (p.cd <= 0) fireWeapon(p);
    if (p.bombCd <= 0) dropDepthCharge(p);
  }

  // ---------------------------------------------------------------- enemies
  const dt = STEP;
  const nose = e => [e.x - e.sw / 2 + 3, e.y + (e.d.noseY || 0) * e.sh];
  function aimAt(x, y, speed, spread = 0) {
    const p = G.player;
    const a = Math.atan2(p.y - y, p.x + G.cam.speed * 0.6 - x) + spread;
    return [Math.cos(a) * speed, Math.sin(a) * speed];
  }

  function tryFire(e, interval, fire, windup = 0.3, cond = true) {
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) { e.windup = 0; fire(); e.fireT = interval; e.fired = 0.18; }
      return;
    }
    e.fireT -= dt;
    const sx = e.x - G.cam.x;
    if (e.fireT <= 0 && cond && sx < W - 16 && sx > 24 && !G.player.dead) {
      e.windup = windup;
      SFX.play('telegraph');
    }
  }

  const followFloor = e => { e.y = floorY(e.x) - e.sh / 2 + 3; };
  const hoverAt = (e, wx, leaveAfter) => {
    const leaving = e.t > leaveAfter;
    const tx = leaving ? G.cam.x - 100 : wx + Math.sin(e.t * 0.9) * 36;
    e.x += (tx - e.x) * Math.min(1, dt * (leaving ? 0.7 : 1.2));
    e.y = AIR_Y + Math.sin(e.t * 2) * 2;
    return !leaving;
  };

  const ED = {
    drone: {
      frames: ['drone_0', 'drone_1'], fireFrame: 'drone_2', fps: 8, hp: 1, score: 100,
      init: e => { e.vx = e.data.vx ?? -48; e.amp = e.data.amp ?? 7; e.fireT = 0.4 + (e.phase % 3) * 0.35; },
      update: e => {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 3 + e.phase) * e.amp;
        if (!e.shot) tryFire(e, 99, () => {
          e.shot = true;
          const [nx, ny] = nose(e);
          for (const s of [95, 76]) { const [vx, vy] = aimAt(nx, ny, s); eshot('pellet', nx, ny, vx, vy, { w: 3, h: 3 }); }
        }, 0.3, e.x - G.cam.x < W - 70);
      },
    },
    carrier: {
      frames: ['drone_0', 'drone_1'], fps: 8, hp: 2, score: 200, carrier: true,
      update: e => { e.x += G.cam.speed * 0.45 * dt; e.y = e.baseY + Math.sin(e.t * 2) * 4; },
      onDeath: e => spawnPickup('capsule', e.x, e.y + 12, e.data.weapon),
    },
    mine: {
      frames: ['mine_0'], hp: 4, score: 150, isMine: true, depthMul: 3, noClamp: true,
      update: e => {
        e.y = e.baseY + Math.sin(e.t * 2 + e.phase) * 2;
        const p = G.player;
        if (!p.dead && !e.armed && dist(e, p) < 36) { e.armed = 0.5; SFX.play('beep'); }
        if (e.armed) {
          e.armed -= dt;
          if (e.armed <= 0) {
            e.dead = true;
            explode(e.x, e.y, 'big');
            if (!p.dead && dist(e, p) < 38) hurtPlayer();
          }
        }
      },
    },
    jet: {
      frames: ['jet_0', 'jet_1', 'jet_2'], fps: 12, hp: 3, score: 300, air: true,
      init: e => { e.y = AIR_Y; e.vx = -105; e.fireT = 0.3; },
      update: e => {
        e.x += e.vx * dt;
        tryFire(e, 0.9, () => eshot('bomb', e.x, e.y + 6, -50, 30, { sprite: 'enemy_bomb', g: 150, w: 7, h: 7, hp: 1 }), 0.25);
      },
    },
    heli: {
      frames: ['heli_0', 'heli_1'], fps: 16, hp: 5, score: 400, air: true,
      init: e => { e.y = AIR_Y; e.fireT = 1; },
      update: e => {
        const active = hoverAt(e, e.data.wx ?? G.cam.x + 320, 11);
        tryFire(e, 1.5, () => eshot('bomb', e.x, e.y + 8, -8, 25, { sprite: 'heli_bomb', g: 150, w: 7, h: 6, hp: 1 }), 0.35, active);
      },
    },
    transport: {
      frames: ['transport_0', 'transport_1'], fireFrame: 'transport_drop', fps: 14, hp: 8, score: 700, air: true,
      init: e => { e.y = AIR_Y; e.fireT = 1.2; },
      update: e => {
        const active = hoverAt(e, e.data.wx ?? G.cam.x + 300, 13);
        tryFire(e, 2.6, () => eshot('minelet', e.x, e.y + 14, -6, 18, { sprite: 'mine_0', w: 10, h: 10, hp: 2, life: 12 }), 0.7, active);
      },
    },
    gunboat: {
      frames: ['gunboat_0', 'gunboat_1', 'gunboat_2'], fps: 6, hp: 8, score: 600, surface: true,
      init: e => { e.vx = 4; e.fireT = 1.2; },
      update: e => {
        e.x += e.vx * dt;
        tryFire(e, 1.7, () => eshot('barrel', e.x + 6, WATER_Y + 3, -4, 32, { sprite: 'enemy_bomb', w: 8, h: 8, hp: 1, life: 10 }), 0.3);
      },
    },
    destroyer: {
      frames: ['destroyer_0', 'destroyer_1', 'destroyer_2'], fps: 5, hp: 14, score: 1200, surface: true,
      init: e => { e.vx = 3; e.fireT = 1.5; },
      update: e => {
        e.x += e.vx * dt;
        tryFire(e, 2.8, () => {
          for (let i = 0; i < 3; i++) {
            G.timers.push({ t: i * 0.25, fn: () => !e.dead && eshot('barrel', e.x + 20 - i * 14, WATER_Y + 3, -6, 30, { sprite: 'enemy_bomb', w: 8, h: 8, hp: 1, life: 10 }) });
          }
        }, 0.45);
      },
    },
    hunter: {
      frames: ['hunter_0', 'hunter_1'], fireFrame: 'hunter_2', fps: 6, hp: 4, score: 300,
      init: e => { e.vx = -36; },
      update: e => {
        e.x += e.vx * dt;
        const p = G.player;
        e.y += Math.sign(p.y - e.y) * Math.min(Math.abs(p.y - e.y), 26 * dt);
        tryFire(e, 1.8, () => { const [nx, ny] = nose(e); eshot('torp', nx, ny, -140, 0, { sprite: 'enemy_torpedo', w: 12, h: 5, hp: 1 }); }, 0.3, Math.abs(p.y - e.y) < 14);
      },
    },
    angler: {
      frames: ['angler_0', 'angler_1'], fps: 4, hp: 4, score: 300, noseY: 0.1,
      init: e => { e.vx = -25; e.stay = 6; },
      update: e => {
        if (e.x - G.cam.x < W - 80 && e.stay > 0) { e.stay -= dt; e.x += G.cam.speed * dt; } else e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 1.5) * 9;
        tryFire(e, 1.6, () => { const [nx, ny] = nose(e); const [vx, vy] = aimAt(nx, ny, 80); eshot('orb', nx, ny, vx, vy, { sprite: 'enemy_orb', w: 7, h: 6 }); });
      },
    },
    manta: {
      frames: ['manta_0', 'manta_1'], fps: 5, hp: 2, score: 200,
      init: e => { e.vx = -80; },
      update: e => { e.x += e.vx * dt; e.y = e.baseY + Math.sin(e.t * 2.4 + e.phase) * 32; },
    },
    minisub: {
      frames: ['minisub_0', 'minisub_1'], fps: 6, hp: 1, score: 80,
      init: e => { e.vx = -95; },
      update: e => { e.x += e.vx * dt; e.y = e.baseY + Math.sin(e.t * 3 - e.phase * 0.55) * 24; },
    },
    driller: {
      frames: ['driller'], hp: 3, score: 300,
      init: e => { e.vx = -40; e.mode = 'enter'; e.aimT = 0.8; },
      update: e => {
        const p = G.player;
        if (e.mode === 'enter') {
          e.x += e.vx * dt;
          if (e.x - G.cam.x < W - 70) { e.mode = 'aim'; e.windup = e.aimT; SFX.play('telegraph'); }
        } else if (e.mode === 'aim') {
          e.x += G.cam.speed * dt;
          e.y += clamp(p.y - e.y, -50 * dt, 50 * dt);
          e.windup -= dt;
          if (e.windup <= 0) { e.windup = 0; e.mode = 'dash'; SFX.play('torpedo'); }
        } else {
          e.x -= 270 * dt;
          if (Math.random() < 0.6) bubble(e.x + e.sw / 2, e.y, 1);
        }
      },
    },
    divers: {
      frames: ['divers_0', 'divers_1'], fps: 4, hp: 3, score: 250, noseY: 0.05,
      init: e => { e.vx = -20; },
      update: e => {
        e.x += e.vx * dt;
        const p = G.player;
        e.y += Math.sign(p.y - e.y) * Math.min(Math.abs(p.y - e.y), 16 * dt);
        tryFire(e, 1.4, () => { const [nx, ny] = nose(e); eshot('harpoon', nx, ny, -160, 0, { w: 9, h: 2 }); });
      },
    },
    barge: {
      frames: ['barge_0', 'barge_1', 'barge_2'], fps: 3, hp: 16, score: 900, noseY: -0.35,
      init: e => { e.vx = -10; },
      update: e => {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 0.7) * 6;
        tryFire(e, 1.8, () => {
          for (const [ox, d] of [[-0.25, 0], [0.15, 0.18]]) {
            G.timers.push({ t: d, fn: () => {
              if (e.dead) return;
              const gx = e.x + e.sw * ox, gy = e.y - e.sh * 0.35;
              for (const s of [-0.12, 0, 0.12]) { const [vx, vy] = aimAt(gx, gy, 90, s); eshot('pellet', gx, gy, vx, vy, { w: 3, h: 3 }); }
            } });
          }
        }, 0.4);
      },
    },
    torpsub: {
      frames: ['torpsub_0', 'torpsub_1'], fps: 4, hp: 6, score: 500,
      init: e => { e.vx = -12; },
      update: e => {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 0.8) * 10;
        tryFire(e, 2.2, () => {
          const [nx, ny] = nose(e);
          for (const vy of [-18, 18]) eshot('torp', nx, ny, -120, vy, { sprite: 'enemy_torpedo', w: 12, h: 5, hp: 1 });
        }, 0.45);
      },
    },
    squid: {
      frames: ['squid_0', 'squid_1'], fps: 4, hp: 4, score: 350, noseY: -0.1,
      init: e => { e.vx = -30; e.vy = 0; e.pulse = 0.5; },
      update: e => {
        e.pulse -= dt;
        if (e.pulse <= 0) { e.pulse = 1.3; e.vx = -78; e.vy = G.player.y > e.y ? 30 : -30; }
        e.vx += (-15 - e.vx) * Math.min(1, 2 * dt);
        e.vy *= 1 - 1.5 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        tryFire(e, 2, () => {
          const [nx, ny] = nose(e);
          for (const s of [-0.3, 0, 0.3]) { const [vx, vy] = aimAt(nx, ny, 66, s); eshot('orb', nx, ny, vx, vy, { sprite: 'enemy_orb', w: 7, h: 6 }); }
        }, 0.35);
      },
    },
    eel: {
      frames: ['eel_0', 'eel_1'], fps: 6, hp: 3, score: 300,
      init: e => { e.vx = -52; },
      update: e => {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 3.5 + e.phase) * 18;
        tryFire(e, 2.4, () => { const [nx, ny] = nose(e); eshot('bolt', nx, ny, -130, 0, { w: 12, h: 5 }); }, 0.3);
      },
    },
    jelly: {
      frames: ['jelly_0', 'jelly_1'], fps: 3, hp: 5, score: 400, glintY: 0.15,
      init: e => { e.vx = -8; },
      update: e => {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 1.2) * 12;
        tryFire(e, 2.6, () => eshot('minelet', e.x, e.y + e.sh * 0.35, -12, 16, { sprite: 'enemy_bomb', w: 8, h: 8, hp: 1, life: 8 }), 0.4);
      },
    },
    crawler: {
      frames: ['crawler_0', 'crawler_1'], fps: 4, hp: 7, score: 500, ground: true, depthMul: 2,
      init: e => { e.vx = -6; },
      update: e => {
        e.x += e.vx * dt;
        followFloor(e);
        tryFire(e, 2.3, () => {
          const p = G.player, nx = e.x - e.sw * 0.15, ny = e.y - e.sh * 0.45, tt = 1.1;
          const vx = (p.x + G.cam.speed * tt - nx) / tt, vy = (p.y - ny) / tt - 0.5 * 120 * tt;
          eshot('shell', nx, ny, vx, vy, { sprite: 'enemy_orb', g: 120, w: 7, h: 6 });
        }, 0.4);
      },
    },
    crab: {
      frames: ['crab_0', 'crab_1'], fps: 4, hp: 6, score: 450, ground: true, depthMul: 2,
      init: e => { e.vx = -10; },
      update: e => {
        e.x += e.vx * dt;
        followFloor(e);
        tryFire(e, 2.4, () => {
          const nx = e.x + e.sw * 0.1, ny = e.y - e.sh * 0.45;
          const [vx, vy] = aimAt(nx, ny, 90);
          eshot('rocket', nx, ny, vx, vy, { sprite: 'enemy_torpedo', w: 9, h: 5, hp: 1 });
        }, 0.45);
      },
    },
    walker: {
      frames: ['walker'], hp: 4, score: 350, ground: true, depthMul: 2, noseY: -0.2,
      init: e => { e.vx = -20; },
      update: e => {
        e.x += e.vx * dt;
        followFloor(e);
        tryFire(e, 1.6, () => { const [nx, ny] = nose(e); const [vx, vy] = aimAt(nx, ny, 100); eshot('pellet', nx, ny, vx, vy, { w: 3, h: 3 }); }, 0.3);
      },
    },
    turret: {
      frames: ['turret_floor_0'], windFrame: 'turret_floor_1', fireFrame: 'turret_floor_2', hp: 6, score: 400, mount: 'floor', depthMul: 2, noseY: -0.25,
      update: e => tryFire(e, 2.0, () => { const [nx, ny] = nose(e); const [vx, vy] = aimAt(nx, ny, 95); eshot('orb', nx, ny, vx, vy, { sprite: 'enemy_orb', w: 7, h: 6 }); }, 0.5),
    },
    ceilturret: {
      frames: ['turret_ceil_0'], windFrame: 'turret_ceil_1', hp: 6, score: 400, mount: 'ceil', glintY: 0.3,
      update: e => tryFire(e, 2.2, () => {
        const gx = e.x, gy = e.y + e.sh * 0.4;
        for (const s of [-0.22, 0, 0.22]) { const [vx, vy] = aimAt(gx, gy, 80, s); eshot('pellet', gx, gy, vx, vy, { w: 3, h: 3 }); }
      }, 0.5),
    },
    silo: {
      frames: ['silo_0'], windFrame: 'silo_1', fireFrame: 'silo_2', hp: 8, score: 600, mount: 'floor', depthMul: 2, glintY: -0.4,
      update: e => tryFire(e, 3.2, () => eshot('homing', e.x, e.y - e.sh, 0, -90, { sprite: 'missile', w: 10, h: 6, hp: 1, life: 5 }), 0.7),
    },
    urchin: {
      frames: ['urchin_0'], windFrame: 'urchin_1', hp: 3, score: 250, mount: 'floor', depthMul: 3, glintY: -0.1,
      update: e => tryFire(e, 2.6, () => {
        for (let i = 0; i < 8; i++) {
          const a = Math.PI + (i / 7) * Math.PI;
          eshot('pellet', e.x, e.y - 4, Math.cos(a) * 70, Math.sin(a) * 70, { w: 3, h: 3 });
        }
      }, 0.55, Math.abs(G.player.x - e.x) < 120),
    },
    hatch: {
      frames: ['hatch_0'], windFrame: 'hatch_1', fireFrame: 'hatch_2', hp: 10, score: 800, mount: 'floor', depthMul: 2, glintY: -0.3,
      update: e => tryFire(e, 3.0, () => spawn('drone', { x: e.x - 6, y: e.y - e.sh, data: { vx: -55, amp: 10 } }), 0.6),
    },
  };

  function spawn(type, o = {}) {
    const d = ED[type];
    const [sw, sh] = size(d.frames[0]);
    const e = {
      type, d, x: o.x ?? G.cam.x + W + sw / 2 + 6, y: o.y ?? 140, vx: 0, vy: 0, hp: d.hp, t: 0, flash: 0,
      fireT: 0.6 + (G.spawnSeq % 3) * 0.4, windup: 0, fired: 0, sw, sh,
      w: Math.round(sw * 0.72), h: Math.round(sh * 0.62), baseY: 0, phase: o.phase ?? G.spawnSeq, data: o.data || {}, dead: false,
    };
    if (d.isMine) { e.w = e.h = Math.round(sw * 0.8); }
    if (d.ground || d.mount === 'floor') e.y = floorY(e.x) - sh / 2 + 3;
    if (d.mount === 'ceil') e.y = ceilY(e.x) + sh / 2 - 3;
    if (d.surface) e.y = WATER_Y + 4 - sh / 2;
    e.baseY = e.y;
    G.spawnSeq++;
    if (d.init) d.init(e);
    G.enemies.push(e);
    return e;
  }

  function group(type, n, y, dy = 0, dx = 20, extra = {}) {
    for (let i = 0; i < n; i++) spawn(type, { ...extra, x: G.cam.x + W + 24 + i * dx, y: y + i * dy, phase: i });
  }

  function anchoredMine(y, xOff = 0) {
    spawn('mine', { y, x: G.cam.x + W + 20 + xOff });
  }

  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.06;
    if (e.hp <= 0) killEnemy(e);
    else SFX.play('hit');
  }

  function killEnemy(e) {
    e.dead = true;
    G.chain++;
    addScore(e.d.score, e.x, e.y - 6);
    explode(e.x, e.y, e.sw > 44 ? 'big' : 'small');
    if (e.d.onDeath) e.d.onDeath(e);
    if (e.sw > 44 && G.spawnSeq % 2 === 0) spawnPickup('orb', e.x, e.y, 'red');
  }

  // ---------------------------------------------------------------- level script
  const at = (x, fn) => ({ at: x, fn });
  const place = (type, x) => ({ at: x - W - 40, px: x, fn: () => spawn(type, { x }) });

  const SCRIPT = [
    // Segment A: ice shelf approach (open leads at 360-560 and 920-1080)
    at(40, () => group('drone', 3, 100, 18, 24)),
    at(140, () => anchoredMine(212)),
    at(220, () => spawn('carrier', { y: 120, data: { weapon: 'hmg' } })),
    at(500, () => spawnPickup('capsule', G.cam.x + 240, 150, 'bomb')),
    at(290, () => group('drone', 4, 200, -16, 22, { data: { amp: 12 } })),
    at(300, () => spawn('heli', { x: G.cam.x + W + 40, data: { wx: 470 } })),
    place('urchin', 540),
    at(400, () => group('minisub', 6, 175, 0, 18)),
    place('ceilturret', 770),
    place('ceilturret', 1160),
    at(480, () => { anchoredMine(110); anchoredMine(195, 70); }),
    at(560, () => { spawn('manta', { y: 120 }); spawn('manta', { y: 190, x: G.cam.x + W + 60 }); }),
    at(650, () => spawn('hunter', { y: 170 })),
    at(720, () => spawn('driller', { y: 140 })),
    at(780, () => spawn('gunboat', { x: G.cam.x + W + 60, data: {} })),
    place('turret', 1060),
    at(860, () => spawn('eel', { y: 150 })),
    at(940, () => { group('drone', 3, 90, 14, 22); anchoredMine(210, 50); }),
    place('hatch', 1130),
    // Segment B: flooded refinery (open surface)
    at(1180, () => spawn('crawler')),
    at(1220, () => spawn('transport', { x: G.cam.x + W + 50, data: { wx: 1480 } })),
    at(1260, () => spawn('angler', { y: 130 })),
    at(1300, () => spawn('carrier', { y: 110, data: { weapon: G.secondWeapon } })),
    at(1550, () => spawnPickup('capsule', G.cam.x + 220, 140, 'bomb')),
    at(1360, () => spawn('divers', { y: 180 })),
    at(1420, () => spawn('jet')),
    at(1470, () => spawn('barge', { y: 150 })),
    place('silo', 1580),
    at(1540, () => spawn('jelly', { y: 110 })),
    at(1600, () => { spawn('hunter', { y: 100 }); spawn('hunter', { y: 190, x: G.cam.x + W + 60 }); }),
    at(1640, () => spawn('destroyer', { x: G.cam.x + W + 60 })),
    place('turret', 1810),
    at(1700, () => spawn('crab')),
    at(1760, () => spawn('squid', { y: 140 })),
    at(1820, () => spawn('torpsub', { y: 165 })),
    place('hatch', 1995),
    at(1880, () => { group('drone', 4, 80, 12, 20); spawn('jet'); }),
    at(1940, () => group('minisub', 6, 130, 0, 18)),
    at(2000, () => { for (let i = 0; i < 3; i++) anchoredMine(110 + i * 45, i * 40); }),
    place('silo', 2180),
    at(2060, () => { spawn('walker'); spawn('walker', { x: G.cam.x + W + 70 }); }),
    at(2100, () => spawn('heli', { x: G.cam.x + W + 40, data: { wx: 2180 } })),
    // Segment C: polar trench under the ice plate
    at(2260, () => { spawn('eel', { y: 150 }); spawn('eel', { y: 195, x: G.cam.x + W + 60 }); }),
    at(2320, () => spawn('carrier', { y: 160, data: { weapon: G.player.weapon === 'hmg' ? G.secondWeapon : 'hmg' } })),
    place('urchin', 2470),
    place('ceilturret', 2700),
    place('turret', 2600),
    place('ceilturret', 2860),
    place('silo', 2830),
    at(2380, () => { spawn('crawler'); spawn('angler', { y: 150 }); }),
    at(2460, () => { spawn('driller', { y: 140 }); spawn('driller', { y: 185, x: G.cam.x + W + 50 }); }),
    at(2540, () => { spawn('torpsub', { y: 160 }); group('drone', 3, 185, -12, 22); }),
    at(2620, () => group('minisub', 6, 160, 0, 18)),
    at(2700, () => { spawn('manta', { y: 140 }); spawn('manta', { y: 185, x: G.cam.x + W + 40 }); }),
    at(2780, () => spawn('barge', { y: 165 })),
    at(2860, () => spawn('walker')),
  ].sort((a, b) => a.at - b.at);

  // ---------------------------------------------------------------- pickups & props
  function spawnPickup(kind, x, y, value) {
    y = clamp(y, ceilY(x) + 14, floorY(x) - 14);
    G.pickups.push({ kind, x, y, value, t: 0, w: kind === 'capsule' ? 14 : 11, h: kind === 'capsule' ? 18 : 11, life: kind === 'capsule' ? 14 : 10 });
    if (kind === 'capsule') {
      const label = value === 'bomb' ? 'DEPTH CHARGE' : WEAPON_NAMES[value];
      const color = value === 'bomb' ? '#ff9a3a' : WEAPON_COLORS[value];
      banner(`${label}!`, color, 1.2);
      SFX.play('orb');
    }
  }

  function collectPickup(pk) {
    const p = G.player;
    if (pk.kind === 'capsule') {
      if (pk.value === 'bomb') {
        if (p.bombTier < 3) p.bombTier++;
        else addScore(1000, pk.x, pk.y, false);
        banner(`DEPTH CHARGE LV${p.bombTier}`, '#ff9a3a', 1.2);
      } else if (p.weapon === pk.value) {
        if (p.tier < 3) p.tier++;
        else addScore(1000, pk.x, pk.y, false);
        banner(`${WEAPON_NAMES[p.weapon]} LV${p.tier}`, WEAPON_COLORS[p.weapon], 1.2);
      } else {
        p.weapon = pk.value;
        banner(`${WEAPON_NAMES[p.weapon]} LV${p.tier}`, WEAPON_COLORS[p.weapon], 1.2);
      }
      SFX.play('pickup');
      banner(`${WEAPON_NAMES[p.weapon]} LV${p.tier}`, WEAPON_COLORS[p.weapon], 1.2);
      for (let i = 0; i < 12; i++) G.parts.push({ kind: 'spark', x: pk.x, y: pk.y, vx: rand(-80, 80), vy: rand(-80, 80), life: rand(0.2, 0.4), color: WEAPON_COLORS[pk.value] });
    } else {
      addScore(pk.value === 'gold' ? 500 : 100, pk.x, pk.y - 6, false);
      SFX.play('orb');
    }
    G.fx.push({ frames: ['fx_spark_0', 'fx_spark_1'], fps: 14, x: pk.x, y: pk.y, t: 0 });
  }

  function damageProp(pr, dmg) {
    if (pr.dead) return;
    pr.hp -= dmg;
    pr.flash = 0.06;
    if (pr.hp <= 0) destroyProp(pr);
    else SFX.play('hit');
  }

  function destroyProp(pr) {
    pr.dead = true;
    explode(pr.x, pr.y, 'big');
    if (pr.kind === 'tank') {
      addScore(200, pr.x, pr.y - 10);
      blast(pr.x, pr.y, 48, 5, { source: pr, hurtsPlayer: true });
      spawnPickup('orb', pr.x, pr.y - 24, 'red');
    } else {
      G.relays++;
      addScore(1000, pr.x, pr.y - 10);
      banner(`RELAY ${Math.min(G.relays, 3)}/3`, G.relays >= 3 ? '#7dff9a' : '#ffe46a');
      spawnPickup('orb', pr.x - 10, pr.y - 26, 'gold');
      spawnPickup('orb', pr.x + 10, pr.y - 26, 'red');
    }
  }

  function blast(x, y, r, dmg, { source = null, hurtsPlayer = false, depth = false } = {}) {
    const c = { x, y };
    for (const e of G.enemies) {
      if (!e.dead && dist(c, e) < r + e.w / 2) damageEnemy(e, dmg * (depth ? e.d.depthMul || 1 : 1));
    }
    for (const pr of G.props) {
      if (pr === source || pr.dead || dist(c, pr) > r + pr.w / 2) continue;
      if (pr.kind === 'tank') G.timers.push({ t: 0.16, fn: () => damageProp(pr, 99) });
      else damageProp(pr, dmg);
    }
    for (const s of G.eshots) if (s.hp > 0 && dist(c, s) < r) { s.dead = true; hitSpark(s.x, s.y); }
    const b = G.boss;
    if (b && b.state !== 'dying' && dist(c, b) < r + b.w / 2) damageBoss(b, dmg, false);
    if (hurtsPlayer && dist(c, G.player) < r * 0.75) hurtPlayer();
  }

  // ---------------------------------------------------------------- boss
  function spawnBoss() {
    const [sw, sh] = size('carrier_0');
    G.boss = {
      x: G.cam.x + W + sw / 2 + 10, y: 155, sw, sh, w: sw * 0.84, h: sh * 0.5,
      hp: 240, max: 240, t: 0, state: 'enter', flash: 0, weak: 0, windup: 0, phase: 1,
      volleyT: 2.2, droneT: 3.2, mineT: 4.5, orbT: 1.6, chargeT: 6, st: 0, dyingT: 0, chargeY: 155,
      homeX: G.cam.x + W - sw / 2 - 10,
    };
    SFX.music('boss');
  }

  const weakRect = b => ({ x: b.x + b.sw * 0.18, y: b.y + b.sh * 0.22, w: b.sw * 0.3, h: b.sh * 0.3 });
  const bossNose = b => [b.x - b.sw / 2 + 6, b.y + b.sh * 0.12];
  const bossRange = b => [ceilY(b.x) + b.sh / 2 + 4, floorY(b.x) - b.sh / 2 - 4];

  function damageBoss(b, dmg, weakHit) {
    if (b.state === 'dying' || b.state === 'enter') return;
    b.hp -= weakHit ? dmg * 2 : dmg;
    b.flash = 0.05;
    if (weakHit) b.weak = 0.08;
    SFX.play('hit');
    if (b.hp <= 0) {
      b.hp = 0;
      b.state = 'dying';
      b.dyingT = 0;
      G.eshots.length = 0;
      for (const e of G.enemies) if (!e.dead) { e.dead = true; explode(e.x, e.y, 'small', true); }
      SFX.play('bigBoom');
    }
  }

  function updateBoss(b) {
    b.t += dt;
    b.flash -= dt;
    b.weak -= dt;
    const p = G.player;
    if (b.state === 'dying') {
      b.dyingT += dt;
      b.y += 8 * dt;
      G.shake = Math.max(G.shake, 2);
      if (Math.floor(b.dyingT * 9) !== Math.floor((b.dyingT - dt) * 9)) {
        explode(b.x + rand(-b.sw * 0.4, b.sw * 0.4), b.y + rand(-b.sh * 0.3, b.sh * 0.3), Math.random() < 0.4 ? 'big' : 'small', Math.random() < 0.5);
      }
      if (b.dyingT > 3) {
        for (let i = 0; i < 6; i++) explode(b.x + rand(-50, 50), b.y + rand(-24, 24), 'big', i > 0);
        addScore(10000, b.x, b.y, false);
        G.boss = null;
        G.clearT = 2.5;
        G.shake = 6;
      }
      return;
    }

    const phase = b.hp > b.max * 0.66 ? 1 : b.hp > b.max * 0.33 ? 2 : 3;
    b.phase = phase;
    const [minY, maxY] = bossRange(b);
    const midY = (minY + maxY) / 2, amp = (maxY - minY) / 2;
    switch (b.state) {
      case 'enter':
        b.x -= 44 * dt;
        b.y += (midY - b.y) * Math.min(1, 2 * dt);
        if (b.x <= b.homeX) b.state = 'fight';
        break;
      case 'fight': {
        b.y += (midY + Math.sin(b.t * 0.7) * amp - b.y) * Math.min(1, 1.5 * dt);
        b.x += (b.homeX - b.x) * Math.min(1, 1.2 * dt);
        if (b.windup > 0) {
          b.windup -= dt;
          if (b.windup <= 0) {
            const [nx, ny] = bossNose(b);
            const lanes = phase === 3 ? [-44, -22, 0, 22, 44] : [-30, 0, 30];
            for (const vy of lanes) eshot('torp', nx, ny, -125, vy, { sprite: 'enemy_torpedo', w: 12, h: 5, hp: 1 });
            SFX.play('torpedo');
          }
        } else if ((b.volleyT -= dt) <= 0) {
          b.volleyT = phase === 1 ? 2.4 : 2.0;
          b.windup = 0.5;
          SFX.play('telegraph');
        }
        if (phase >= 2 && (b.droneT -= dt) <= 0) {
          b.droneT = 3.4;
          const wr = weakRect(b);
          spawn('drone', { x: wr.x, y: wr.y, data: { vx: -58, amp: 10 } });
        }
        if (phase >= 2 && (b.mineT -= dt) <= 0) {
          b.mineT = 4.5;
          eshot('minelet', b.x, b.y + b.sh * 0.4, -24, 14, { sprite: 'enemy_bomb', w: 8, h: 8, hp: 2, life: 9 });
        }
        if (phase === 3) {
          if ((b.orbT -= dt) <= 0) {
            b.orbT = 1.6;
            const ox = b.x - b.sw * 0.05, oy = b.y - b.sh * 0.38;
            const [vx, vy] = aimAt(ox, oy, 85);
            eshot('orb', ox, oy, vx, vy, { sprite: 'enemy_orb', w: 7, h: 6 });
          }
          if ((b.chargeT -= dt) <= 0) {
            b.state = 'telegraph';
            b.st = 0.9;
            b.chargeY = clamp(p.y, minY, maxY);
            SFX.play('alarm');
          }
        }
        break;
      }
      case 'telegraph':
        b.st -= dt;
        b.y += (b.chargeY - b.y) * Math.min(1, 3 * dt);
        b.x = b.homeX + Math.sin(b.t * 60);
        if (b.st <= 0) b.state = 'charge';
        break;
      case 'charge':
        b.x -= 180 * dt;
        bubble(b.x + b.sw / 2, b.y + rand(-12, 12), 2);
        if (b.x - b.sw / 2 < G.cam.x + 16) b.state = 'return';
        break;
      case 'return':
        b.x += 72 * dt;
        if (b.x >= b.homeX) { b.state = 'fight'; b.chargeT = 7; }
        break;
    }
    b.y = clamp(b.y, minY, maxY);
  }

  // ---------------------------------------------------------------- player
  function hurtPlayer() {
    const p = G.player;
    if (p.dead || p.inv > 0 || god) return;
    p.hp--;
    p.inv = 1.0;
    p.hitFlash = 0.1;
    G.hurt = 0.35;
    G.shake = 4;
    G.chain = 0;
    SFX.play('playerHit');
    if (p.hp <= 0) killPlayer();
  }

  function killPlayer() {
    const p = G.player;
    p.dead = true;
    p.deathT = 0;
    p.deathVar = Math.random() < 0.5 ? 'a' : 'b';
    p.keep = [p.weapon, Math.max(1, p.tier - 1), Math.max(1, p.bombTier - 1)];
    G.lives--;
    explode(p.x, p.y, 'big');
    for (let i = 0; i < 7; i++) {
      G.parts.push({ kind: 'debris', sprite: `debris_${i}`, x: p.x + rand(-14, 14), y: p.y, vx: rand(-55, 55), vy: rand(-75, -10), life: rand(1.4, 2.2), rot: 0, vr: rand(-6, 6) });
    }
  }

  function respawn() {
    const [weapon, tier, bombTier] = G.player.keep;
    G.enemies.length = 0;
    if (!G.arena) {
      const cp = G.checkpoint;
      G.cam.x = cp;
      G.cam.speed = BASE_SCROLL;
      const idx = SCRIPT.findIndex(s => s.at > cp);
      G.spawnIdx = idx < 0 ? SCRIPT.length : idx;
      for (let i = 0; i < G.spawnIdx; i++) if (SCRIPT[i].px > cp) SCRIPT[i].fn();
      for (const ic of G.ice) if (ic.x > cp) { ic.state = 'hang'; ic.y = ic.y0; ic.vy = 0; ic.t = 0; }
    }
    G.eshots.length = 0;
    G.pshots.length = 0;
    G.chain = 0;
    G.player = makePlayer(G.cam.x, weapon, tier, bombTier);
    banner('READY', '#9fd7ff', 1.0);
  }

  function terrainLimits(x) {
    let top = 0, bottom = H;
    for (const ox of [-28, -14, 0, 14, 28]) {
      top = Math.max(top, ceilY(x + ox));
      bottom = Math.min(bottom, floorY(x + ox));
    }
    return [top, bottom];
  }

  function updatePlayer(p, inp) {
    p.t += dt;
    if (p.dead) {
      p.deathT += dt;
      p.y = Math.min(p.y + 14 * dt, floorY(p.x) - 10);
      p.x += G.cam.speed * dt * 0.5;
      if (Math.random() < 0.4) bubble(p.x + rand(-14, 14), p.y + rand(-6, 6), rand(1, 2));
      if (p.deathT > 2.2) {
        if (G.lives > 0) respawn();
        else { state = 'over'; G.result = 'GAME OVER'; finish(); }
      }
      return;
    }

    const ACC = 560, MAX_X = 88, MAX_Y = 84, DRAG = 7;
    p.vx += inp.x * ACC * dt;
    p.vy += inp.y * ACC * dt;
    if (!inp.x) p.vx -= p.vx * Math.min(1, DRAG * dt);
    if (!inp.y) p.vy -= p.vy * Math.min(1, DRAG * dt);
    p.vx = clamp(p.vx, -MAX_X, MAX_X);
    p.vy = clamp(p.vy, -MAX_Y, MAX_Y);
    if (Math.abs(p.vx) < 0.5 && !inp.x) p.vx = 0;
    if (Math.abs(p.vy) < 0.5 && !inp.y) p.vy = 0;
    p.thrust += ((inp.x > 0 ? 1 : inp.x < 0 ? 0.25 : 0.45) - p.thrust) * Math.min(1, 6 * dt);
    p.backT = inp.x < 0 ? p.backT + dt : 0;

    p.x += (p.vx + G.cam.speed) * dt;
    p.y += p.vy * dt;
    const sx = p.x - G.cam.x;
    if (sx < 36) { p.x = G.cam.x + 36; p.vx = Math.max(0, p.vx); }
    if (sx > W - 70) { p.x = G.cam.x + W - 70; p.vx = Math.min(0, p.vx); }

    const [top, bottom] = terrainLimits(p.x);
    const minY = Math.max(PLAYER_MIN_Y, top + p.h / 2 + 4);
    const maxY = bottom - p.h / 2 - 4;
    let scraping = false;
    if (minY > maxY) p.y = (minY + maxY) / 2;
    else if (p.y < minY) { p.y = minY; p.vy = Math.max(0, p.vy); scraping = top > WATER_Y + 2; }
    else if (p.y > maxY) { p.y = maxY; p.vy = Math.min(0, p.vy); scraping = true; }
    if (scraping) {
      p.scrape += dt;
      if (Math.random() < 0.5) hitSpark(p.x + rand(-20, 20), p.y + (p.y === maxY ? p.h / 2 : -p.h / 2), '#ffd080');
      if (p.scrape > 0.45) { p.scrape = 0; hurtPlayer(); }
    } else p.scrape = Math.max(0, p.scrape - dt);

    p.inv -= dt;
    p.hitFlash -= dt;
    p.muzzle -= dt;
    p.cd -= dt;
    p.bombCd -= dt;

    // Roll animation from vertical movement
    const targetRoll = clamp(p.vy * -0.008, -0.12, 0.12);
    p.roll += (targetRoll - p.roll) * Math.min(1, 8 * dt);

    // Bob from thrust
    p.bob = Math.sin(p.t * (8 + p.thrust * 18)) * (0.3 + p.thrust * 0.4);

    if (inp.fire) fireVolley(p);
    if (inp.depth) dropDepthCharge(p);
    const rate = 8 + p.thrust * 22;
    if (Math.floor(p.t * rate) !== Math.floor((p.t - dt) * rate)) bubble(p.x - 34, p.y + 2 + rand(-2, 2), p.thrust > 0.7 ? 1.5 : 1);
  }

  function updateCamera(p) {
    if (G.arena) { G.cam.speed = 0; return; }
    const minSpeed = p.backT > 1.5 ? 15 : 8;
    const target = p.dead ? BASE_SCROLL * 0.5 : clamp(BASE_SCROLL + (p.vx > 0 ? p.vx * 0.4 : p.vx * 0.22), minSpeed, 60);
    G.cam.speed += (target - G.cam.speed) * Math.min(1, 2.5 * dt);
    G.cam.x += G.cam.speed * dt;
    if (G.cam.x >= ARENA_X) {
      G.cam.x = ARENA_X;
      G.arena = true;
      G.cam.speed = 0;
      G.bossT = 2.4;
      banner('WARNING', '#ff4a3a', 2.4);
      SFX.play('alarm');
      SFX.music(null);
    }
  }

  // ---------------------------------------------------------------- update
  function update(inp) {
    if (state === 'title') {
      G.cam.x += 16 * dt;
      if (G.cam.x > 2900) G.cam.x = 0;
      G.t += dt;
      updateParticles();
      return;
    }
    if (state !== 'play') return;

    G.t += dt;
    const p = G.player;
    updateCamera(p);

    if (G.arena && !G.boss && G.bossT > 0) {
      G.bossT -= dt;
      if (G.bossT <= 0) spawnBoss();
    }
    for (const cp of CHECKPOINTS) {
      if (G.cam.x >= cp && G.checkpoint < cp) { G.checkpoint = cp; banner('CHECKPOINT', '#7dff9a'); SFX.play('checkpoint'); }
    }
    while (G.spawnIdx < SCRIPT.length && G.cam.x >= SCRIPT[G.spawnIdx].at) SCRIPT[G.spawnIdx++].fn();

    if (G.clearT > 0) {
      G.clearT -= dt;
      if (G.clearT <= 0) { state = 'clear'; G.result = 'STAGE CLEAR'; finish(); }
    } else if (!p.dead) {
      G.time -= dt;
      const frac = G.time / TIME_LIMIT;
      const beepGap = frac < 0.05 ? 0.25 : frac < 0.1 ? 0.5 : 99;
      G.lastBeep += dt;
      if (G.lastBeep >= beepGap) { G.lastBeep = 0; SFX.play('beep'); }
      if (G.time <= 0) { G.time = 0; state = 'over'; G.result = 'TIME OVER'; finish(); return; }
    }

    updatePlayer(p, inp);
    for (const e of G.enemies) {
      e.t += dt; e.flash -= dt; e.fired -= dt;
      e.d.update(e);
      if (!e.d.air && !e.d.surface && !e.d.ground && !e.d.mount && !e.d.noClamp) {
        e.y = clamp(e.y, ceilY(e.x) + e.sh / 2 + 2, floorY(e.x) - e.sh / 2 - 2);
      }
    }
    if (G.boss) updateBoss(G.boss);
    updateIce(p);
    updateShots();
    updateEnemyShots(p);
    updatePickups(p);
    collidePlayer(p);
    for (const pr of G.props) pr.flash -= dt;
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const tm = G.timers[i];
      if ((tm.t -= dt) <= 0) { G.timers.splice(i, 1); tm.fn(); }
    }
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t * f.fps < f.frames.length);
    updateParticles();
    for (const pp of G.pops) { pp.t -= dt; pp.y -= 14 * dt; }
    G.pops = G.pops.filter(pp => pp.t > 0);
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    G.shake = Math.max(0, G.shake - 12 * dt);
    G.hurt -= dt;

    const camX = G.cam.x;
    G.enemies = G.enemies.filter(e => !e.dead && e.x - camX > -90 && e.x - camX < W + 320);
  }

  function updateIce(p) {
    for (const ic of G.ice) {
      if (ic.state === 'gone') continue;
      ic.t += dt;
      if (ic.state === 'hang' && !p.dead && ic.x - p.x < 120 && ic.x - p.x > -10) { ic.state = 'crack'; ic.t = 0; SFX.play('crack'); }
      else if (ic.state === 'crack' && ic.t > 0.85) { ic.state = 'fall'; ic.t = 0; }
      else if (ic.state === 'fall') {
        ic.vy = Math.min(180, ic.vy + 250 * dt);
        ic.y += ic.vy * dt;
        if (ic.y + ic.h / 2 > floorY(ic.x)) shatterIce(ic);
      }
      if (ic.state !== 'gone' && !p.dead && overlap(ic, p)) {
        hurtPlayer();
        if (ic.state === 'fall') shatterIce(ic);
      }
    }
  }

  function shatterIce(ic) {
    ic.state = 'gone';
    SFX.play('shatter');
    for (let i = 0; i < 16; i++) G.parts.push({ kind: 'ice', x: ic.x + rand(-16, 16), y: ic.y + rand(-10, 10), vx: rand(-70, 70), vy: rand(-70, 10), life: rand(0.5, 1.1) });
    for (let i = 0; i < 10; i++) bubble(ic.x + rand(-18, 18), ic.y, 2);
  }

  function updateShots() {
    const camX = G.cam.x;
    for (const s of G.pshots) {
      s.t += dt;
      if (s.ax) s.vx = Math.min(s.maxV, s.vx + s.ax * dt);
      s.vy += s.g * dt;
      if (s.kind === 'depth') {
        if (s.y > WATER_Y) s.vy = Math.min(s.vy, 115);
        if (s.vy < 0 || Math.random() < 0.3) bubble(s.x, s.y + 3, 1);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.kind === 'torpedo' && Math.random() < 0.5) bubble(s.x - 12, s.y, 1);

      if (s.kind === 'depth') {
        const hitsCeiling = s.vy < 0 && ceilThick(s.x) > 1 && s.y < ceilY(s.x);
        if (s.y >= floorY(s.x) - 2 || hitsCeiling || s.t > 3) { detonateDepth(s); continue; }
        const victim = G.enemies.find(e => !e.dead && overlap(s, e)) || G.props.find(pr => !pr.dead && overlap(s, pr)) || G.eshots.find(es => es.hp > 0 && overlap(s, es));
        if (victim || (G.boss && G.boss.state !== 'dying' && overlap(s, G.boss))) detonateDepth(s);
        continue;
      }

      if (solidAt(s.x + 4, s.y)) { s.dead = true; s.hitAny = true; hitSpark(s.x, s.y, '#bfefff'); continue; }

      for (const ic of G.ice) {
        if (ic.state !== 'gone' && overlap(s, ic)) { s.dead = true; s.hitAny = true; SFX.play('clink'); hitSpark(s.x, s.y); break; }
      }
      if (s.dead) continue;

      for (const e of G.enemies) {
        if (e.dead || e.d.air || e.d.surface || s.hits.has(e) || !overlap(s, e)) continue;
        s.hitAny = true;
        hitSpark(s.x, s.y);
        if (s.pierce) { s.hits.add(e); damageEnemy(e, s.dmg); if (e.d.hp > 4 && !e.dead) { s.dead = true; break; } }
        else { damageEnemy(e, s.dmg); s.dead = true; break; }
      }
      if (s.dead) continue;

      for (const pr of G.props) {
        if (pr.dead || !overlap(s, pr)) continue;
        s.hitAny = true;
        s.dead = true;
        hitSpark(s.x, s.y);
        damageProp(pr, s.dmg);
        break;
      }
      if (s.dead) continue;

      for (const es of G.eshots) {
        if (es.hp <= 0 || es.dead || !overlap(s, es)) continue;
        es.hp -= 1;
        if (es.hp <= 0) { es.dead = true; explode(es.x, es.y, 'small', true); SFX.play('hit'); }
        s.hitAny = true;
        if (!s.pierce) { s.dead = true; break; }
      }
      if (s.dead) continue;

      const b = G.boss;
      if (b && b.state !== 'dying' && !s.hits.has(b) && overlap(s, b)) {
        s.hitAny = true;
        hitSpark(s.x, s.y);
        damageBoss(b, s.dmg, overlap(s, weakRect(b)));
        if (s.pierce) s.hits.add(b); else s.dead = true;
      }
    }
    for (const s of G.pshots) {
      const sx = s.x - camX;
      if (!s.dead && (sx > W + 16 || sx < -16 || s.y < -30 || s.y > H)) {
        s.dead = true;
        if (!s.hitAny && s.kind !== 'depth') G.chain = 0;
      }
    }
    G.pshots = G.pshots.filter(s => !s.dead);
  }

  function detonateDepth(s) {
    s.dead = true;
    const radius = 24 + (s.dmg - 3) * 6;
    explode(s.x, s.y, 'small');
    G.fx.push({ frames: ['fx_ring'], fps: 12, x: s.x, y: s.y, t: 0 });
    blast(s.x, s.y, radius, s.dmg, { depth: true });
  }

  function updateEnemyShots(p) {
    const camX = G.cam.x;
    const shotDt = dt * 0.82;
    for (const s of G.eshots) {
      s.t += dt;
      s.life -= dt;
      s.vy += s.g * shotDt;
      if (s.kind === 'bomb' && s.y > WATER_Y) { s.vy = Math.min(s.vy, 55); s.vx *= 1 - 2 * shotDt; s.g = 40; }
      if (s.kind === 'barrel') s.x += Math.sin(s.t * 4) * 0.3;
      if (s.kind === 'minelet') { s.vx *= 1 - 0.3 * shotDt; s.vy = 14 + Math.sin(s.t * 3) * 6; }
      if (s.kind === 'homing') {
        const a = Math.atan2(s.vy, s.vx);
        const want = Math.atan2(p.y - s.y, p.x + G.cam.speed - s.x);
        let d = want - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = a + clamp(d, -1.7 * shotDt, 1.7 * shotDt);
        const sp = Math.min(110, Math.hypot(s.vx, s.vy) + 30 * shotDt);
        s.vx = Math.cos(na) * sp;
        s.vy = Math.sin(na) * sp;
        if (Math.random() < 0.6) bubble(s.x - Math.cos(na) * 6, s.y - Math.sin(na) * 6, 1);
      }
      s.x += s.vx * shotDt;
      s.y += s.vy * shotDt;
      if ((s.kind === 'torp' || s.kind === 'rocket') && Math.random() < 0.4) bubble(s.x + 7, s.y, 1);
      const sx = s.x - camX;
      if (s.life <= 0 || sx < -30 || sx > W + 40 || s.y < -30) { s.dead = true; continue; }
      const inAir = s.y < WATER_Y;
      const hitsIce = s.vy > 0 && ceilThick(s.x) > 1 && s.y > WATER_Y - 2 && s.y < ceilY(s.x) && (s.kind === 'bomb' || s.kind === 'barrel');
      if (hitsIce || (!inAir && s.kind !== 'homing' && solidAt(s.x, s.y) && s.y > WATER_Y + 4)) {
        s.dead = true;
        if (s.kind === 'barrel' || s.kind === 'bomb' || s.kind === 'minelet') explode(s.x, s.y, 'small', true);
        else hitSpark(s.x, s.y, '#ff9080');
        continue;
      }
      if (!p.dead && p.inv <= 0 && overlap(s, p)) {
        s.dead = true;
        hitSpark(s.x, s.y);
        if (s.kind === 'barrel' || s.kind === 'bomb' || s.kind === 'minelet' || s.kind === 'homing') explode(s.x, s.y, 'small');
        hurtPlayer();
      }
    }
    G.eshots = G.eshots.filter(s => !s.dead);
  }

  function updatePickups(p) {
    for (const pk of G.pickups) {
      pk.t += dt;
      pk.life -= dt;
      if (pk.kind === 'capsule') pk.x += G.cam.speed * 0.5 * dt;
      pk.y += Math.sin(pk.t * 3) * 0.15;
      if (!p.dead && overlap(pk, { x: p.x, y: p.y, w: p.w + 10, h: p.h + 14 })) { pk.life = 0; collectPickup(pk); }
    }
    G.pickups = G.pickups.filter(pk => pk.life > 0 && pk.x - G.cam.x > -20);
  }

  function collidePlayer(p) {
    if (p.dead) return;
    for (const e of G.enemies) {
      if (e.dead || e.d.air || e.d.surface || e.d.carrier || !overlap(e, p)) continue;
      if (e.d.isMine) { e.armed = 0.01; continue; }
      if (p.inv <= 0) { hurtPlayer(); damageEnemy(e, 2); }
    }
    for (const pr of G.props) {
      if (!pr.dead && overlap(pr, p)) { hurtPlayer(); p.y = Math.min(p.y, pr.y - pr.h / 2 - p.h / 2); }
    }
    const b = G.boss;
    if (b && b.state !== 'dying' && overlap(b, p)) hurtPlayer();
  }

  function updateParticles() {
    for (const pt of G.parts) {
      pt.life -= dt;
      if (pt.kind === 'bubble') {
        pt.x += (pt.vx + Math.sin((pt.life + pt.y) * 5) * 6) * dt;
        pt.y += pt.vy * dt;
        if (pt.y < ceilY(pt.x) + 2) pt.life = 0;
      } else if (pt.kind === 'spark') {
        pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.9; pt.vy *= 0.9;
      } else if (pt.kind === 'debris' || pt.kind === 'ice') {
        pt.vy += 70 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.98;
        if (pt.rot !== undefined) pt.rot += pt.vr * dt;
      }
    }
    G.parts = G.parts.filter(pt => pt.life > 0);
  }

  function finish() {
    if (state === 'clear') {
      G.bonus = Math.ceil(G.time) * 50 + Math.min(G.relays, 4) * 2000;
      G.score += G.bonus;
      clears++;
      localStorage.setItem('abyssal-clears', String(clears));
    }
    if (G.score > hiscore) { hiscore = G.score; localStorage.setItem('abyssal-hiscore', String(hiscore)); }
    SFX.music(null);
  }

  // ---------------------------------------------------------------- render
  let skyGrad, waterGrad, PAT = {};
  function initRender() {
    skyGrad = ctx.createLinearGradient(0, 0, 0, WATER_Y);
    skyGrad.addColorStop(0, '#4d9be0');
    skyGrad.addColorStop(1, '#cdeeff');
    waterGrad = ctx.createLinearGradient(0, WATER_Y, 0, H);
    waterGrad.addColorStop(0, '#2c8bb0');
    waterGrad.addColorStop(0.4, '#17608a');
    waterGrad.addColorStop(1, '#081d36');
    for (const k of ['tex_rock', 'tex_metal', 'tex_ice']) PAT[k] = ctx.createPattern(IMAGES[k], 'repeat');
  }

  function render() {
    const camX = Math.round(G.cam.x);
    const sh = G.shake;
    ctx.save();
    if (sh > 0) ctx.translate(Math.round(rand(-sh, sh)), Math.round(rand(-sh, sh)));
    drawBackground(camX);
    drawTerrain(camX);
    drawWorld(camX);
    drawForeground(camX);
    ctx.restore();
    if (G.hurt > 0) {
      ctx.fillStyle = `rgba(255,30,30,${(G.hurt / 0.35) * 0.55})`;
      ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3); ctx.fillRect(0, 0, 3, H); ctx.fillRect(W - 3, 0, 3, H);
    }
    if (state === 'title') drawTitle();
    else { drawHUD(); drawOverlay(); }
    if (debug) drawDebug(camX);
    view.drawImage(buf, 0, 0, W * scale, H * scale);
  }

  function drawLayerImage(img, offset, alpha) {
    if (alpha <= 0) return;
    const w = img.width;
    let x = -(((offset % w) + w) % w);
    ctx.globalAlpha = alpha;
    for (; x < W; x += w) ctx.drawImage(img, Math.round(x), WATER_Y);
    ctx.globalAlpha = 1;
  }

  function drawBackground(camX) {
    const t = G.t;
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, WATER_Y);
    for (let x = 0; x < W; x++) {
      const lx = x + camX * 0.1;
      const h = Math.round(6 + 8 * Math.abs(Math.sin(lx * 0.016)) + 3 * Math.sin(lx * 0.07));
      ctx.fillStyle = '#b8dcf0';
      ctx.fillRect(x, WATER_Y - h, 1, h);
      ctx.fillStyle = '#eaf8ff';
      ctx.fillRect(x, WATER_Y - h, 1, 1);
    }
    for (const b of DECOR.bergs) {
      const x = b.lx - camX * 0.35;
      if (x > -70 && x < W + 70) sprBottom(b.name, x, WATER_Y + 5, NO);
    }

    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
    const refinery = Math.min(smooth(METAL[0] - 300, METAL[0] - 20, camX), 1 - smooth(METAL[1] - 260, METAL[1], camX));
    const trench = smooth(2100, 2450, camX);
    drawLayerImage(IMAGES.bg_ice, camX * 0.12, 1 - refinery);
    drawLayerImage(IMAGES.bg_refinery, camX * 0.12, refinery);

    for (const m of DECOR.mid) {
      const x = m.lx - camX * 0.5;
      if (x > -60 && x < W + 60) sprBottom(m.name, x, m.by, { tint: '#0f3048', amt: 0.55 });
    }
    ctx.fillStyle = 'rgba(16,60,90,0.25)';
    ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
    if (trench > 0) {
      ctx.fillStyle = `rgba(2,10,28,${0.42 * trench})`;
      ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
    }

    ctx.fillStyle = `rgba(170,235,255,${0.06 * (1 - trench * 0.7)})`;
    for (let i = 0; i < 5; i++) {
      const x0 = ((i * 150 - camX * 0.15 + t * 3) % 760 + 760) % 760 - 120;
      ctx.beginPath();
      ctx.moveTo(x0, WATER_Y);
      ctx.lineTo(x0 + 18 + i * 4, WATER_Y);
      ctx.lineTo(x0 + 90 + i * 6, H);
      ctx.lineTo(x0 + 50, H);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(160,215,235,0.5)';
    for (const s of DECOR.snow) {
      const x = ((s.x - camX * s.k) % W + W) % W;
      const y = s.y + Math.sin(t * 0.8 + s.p) * 3;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }

    for (const l of DECOR.lamps) {
      const x = l.x - camX;
      if (x < -30 || x > W + 30) continue;
      ctx.fillStyle = `rgba(255,150,60,${0.12 + 0.05 * Math.sin(t * 4 + l.x)})`;
      ctx.beginPath(); ctx.arc(x, floorBase(l.x) - 8, 16, 0, Math.PI * 2); ctx.fill();
    }
  }

  function fillPattern(pat, camX, path) {
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, -camX, 0]));
    ctx.fillStyle = pat;
    ctx.beginPath();
    path();
    ctx.fill();
  }

  function drawTerrain(camX) {
    const t = G.t;
    // Ceiling: ice shelf (or rock deeper in the trench) and its above-water slab.
    for (let x = 0; x < W; x++) {
      const wx = x + camX;
      if (ceilThick(wx) > 1) {
        ctx.fillStyle = '#d8f2fc';
        ctx.fillRect(x, WATER_Y - 4, 1, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, WATER_Y - 5, 1, 1);
      }
    }
    const ceilSpans = [['tex_ice', x => !ceilRock(x)], ['tex_rock', ceilRock]];
    for (const [tex, test] of ceilSpans) {
      fillPattern(PAT[tex], camX, () => {
        let open = false;
        for (let x = 0; x <= W; x += 2) {
          const wx = x + camX;
          const inside = ceilThick(wx) > 0.5 && test(wx);
          if (inside && !open) { ctx.moveTo(x, WATER_Y); open = true; }
          if (inside) ctx.lineTo(x, ceilBase(wx));
          if (open && (!inside || x >= W)) { ctx.lineTo(x, WATER_Y); ctx.closePath(); open = false; }
        }
      });
    }
    for (let x = 0; x < W; x++) {
      const wx = x + camX;
      if (ceilThick(wx) <= 0.5) continue;
      const y = Math.round(ceilBase(wx));
      const rock = ceilRock(wx);
      ctx.fillStyle = rock ? '#09121b' : '#1d4a66';
      ctx.fillRect(x, y - 3, 1, 3);
      ctx.fillStyle = rock ? '#3b5568' : '#bfefff';
      ctx.fillRect(x, y - 1, 1, 1);
    }
    ctx.fillStyle = '#cdf3ff';
    for (const ic of DECOR.icicles) {
      const x = ic.x - camX;
      if (x < 0 || x >= W || ceilThick(ic.x) <= 3 || ceilRock(ic.x)) continue;
      ctx.fillRect(x, Math.round(ceilBase(ic.x)), 1, ic.len);
    }

    // Floor: rock seabed and riveted refinery decks.
    const floorSpans = [['tex_rock', x => !isMetal(x)], ['tex_metal', isMetal]];
    for (const [tex, test] of floorSpans) {
      fillPattern(PAT[tex], camX, () => {
        let open = false;
        for (let x = 0; x <= W; x += 2) {
          const wx = x + camX;
          const inside = test(wx);
          if (inside && !open) { ctx.moveTo(x, H); open = true; }
          if (inside) ctx.lineTo(x, floorBase(wx));
          if (open && (!inside || x >= W)) { ctx.lineTo(x, H); ctx.closePath(); open = false; }
        }
      });
    }
    const shade = ctx.createLinearGradient(0, 200, 0, H);
    shade.addColorStop(0, 'rgba(0,8,18,0)');
    shade.addColorStop(1, 'rgba(0,8,18,0.55)');
    for (let x = 0; x < W; x += 2) {
      const wx = x + camX;
      const y = Math.round(floorBase(wx));
      const metal = isMetal(wx);
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, 2, H - y);
      ctx.fillStyle = metal ? '#8fa7b0' : '#4a7088';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = metal ? '#22303a' : '#16293a';
      ctx.fillRect(x, y + 1, 2, 2);
      if (metal && wx % 24 < 2) { ctx.fillStyle = '#c87a3a'; ctx.fillRect(x, y + 3, 1, 1); }
    }

    for (const f of DECOR.floor) {
      const x = f.x - camX;
      if (x > -30 && x < W + 30) sprBottom(f.name, x, floorBase(f.x) + 4, NO);
    }
    for (const l of DECOR.lamps) {
      const x = l.x - camX;
      if (x > -20 && x < W + 20) sprBottom('lamp', x, floorBase(l.x) + 2, NO);
    }
    for (const f of FORMS) {
      const x = f.x - camX;
      if (x < -f.sw || x > W + f.sw) continue;
      if (f.ceil) spr(f.name, x, f.ty + f.sh / 2, NO);
      else sprBottom(f.name, x, f.by, NO);
    }
    // Water surface shimmer over open water.
    ctx.fillStyle = '#e8fbff';
    for (let x = 0; x < W; x++) {
      if (ceilThick(x + camX) > 1) continue;
      if (Math.sin((x + camX) * 0.35 + t * 3) > 0.55) ctx.fillRect(x, WATER_Y - 1, 1, 1);
    }
    ctx.fillStyle = 'rgba(232,251,255,0.55)';
    ctx.fillRect(0, WATER_Y, W, 1);
  }

  function drawWorld(camX) {
    for (const pr of G.props) {
      const x = pr.x - camX;
      if (x < -50 || x > W + 50) continue;
      if (pr.dead) sprBottom(pr.kind === 'relay' ? 'relay_dead' : 'debris_big', x, pr.y + pr.sh / 2 + 2, { tint: '#000000', amt: 0.35 });
      else {
        spr(pr.kind, x, pr.y, { flash: pr.flash > 0 });
        if (pr.kind === 'relay' && Math.floor(G.t * 3) % 2) {
          ctx.fillStyle = 'rgba(255,60,40,0.25)';
          ctx.beginPath(); ctx.arc(x, pr.y - 3, 8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    for (const ic of G.ice) {
      if (ic.state === 'gone') continue;
      const x = ic.x - camX;
      if (x < -50 || x > W + 50) continue;
      const name = ic.state === 'hang' ? 'ice_chunk' : ic.state === 'crack' ? 'ice_cracked' : 'ice_breaking';
      const jitter = ic.state === 'crack' ? Math.round(Math.sin(G.t * 50)) : 0;
      spr(name, x + jitter, ic.y, NO);
    }

    for (const pk of G.pickups) {
      const x = pk.x - camX;
      if (pk.life < 2 && Math.floor(pk.t * 10) % 2) continue;
      if (pk.kind === 'capsule') {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.1 * Math.sin(pk.t * 8)})`;
        ctx.beginPath(); ctx.arc(x, pk.y, 12, 0, Math.PI * 2); ctx.fill();
        spr(CAPSULES[pk.value], x, pk.y, NO);
      } else {
        spr(pk.value === 'gold' ? 'orb_gold' : `orb_red_${Math.floor(pk.t * 6) % 2}`, x, pk.y, NO);
      }
    }

    for (const e of G.enemies) drawEnemy(e, camX);
    if (G.boss) drawBoss(G.boss, camX);
    if (state !== 'title') drawPlayer(G.player);

    for (const s of G.pshots) drawPlayerShot(s, camX);
    for (const s of G.eshots) drawEnemyShot(s, camX);

    for (const f of G.fx) {
      const i = Math.min(f.frames.length - 1, Math.floor(f.t * f.fps));
      spr(f.frames[i], f.x - camX, f.y - f.t * 6, i === f.frames.length - 1 ? { alpha: 0.75 } : NO);
    }
    for (const pt of G.parts) {
      const x = Math.round(pt.x - camX), y = Math.round(pt.y);
      if (pt.kind === 'bubble') {
        ctx.fillStyle = 'rgba(205,243,255,0.75)';
        if (pt.r >= 2) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
        else ctx.fillRect(x, y, 1, 1);
      } else if (pt.kind === 'spark') {
        ctx.fillStyle = pt.color;
        ctx.fillRect(x, y, 1, 1);
      } else if (pt.kind === 'ice') {
        ctx.fillStyle = '#d8f6ff';
        ctx.fillRect(x, y, 2, 2);
      } else if (pt.kind === 'debris') {
        spr(pt.sprite, x, y, { rot: pt.rot, alpha: Math.min(1, pt.life) });
      }
    }
    for (const pp of G.pops) F.draw(ctx, pp.text, pp.x - camX, pp.y, '#ffffff', 1, 'center');
  }

  function drawEnemy(e, camX) {
    const d = e.d;
    const x = e.x - camX;
    if (x < -90 || x > W + 90) return;
    let name = d.frames[Math.floor(e.t * (d.fps || 6)) % d.frames.length];
    if (d.windFrame && e.windup > 0) name = d.windFrame;
    if (d.fireFrame && (e.fired > 0 || (!d.windFrame && e.windup > 0))) name = d.fireFrame;
    let y = e.y;
    if (d.isMine) {
      if (e.armed) name = Math.floor(e.t * 16) % 2 ? 'mine_2' : 'mine_1';
      const chainTop = Math.round(e.y + e.sh - e.sw / 2);
      const bottom = floorY(e.x) + 4;
      for (let cy = chainTop; cy < bottom; cy += 2) {
        ctx.fillStyle = (cy >> 1) % 2 ? '#2a3038' : '#4a525c';
        ctx.fillRect(Math.round(x), cy, 1, 2);
      }
      y = e.y + (e.sh - e.sw) / 2;
    }
    if (d.carrier) {
      ctx.fillStyle = '#3a4048';
      ctx.fillRect(Math.round(x), Math.round(e.y + 4), 1, 5);
      spr(CAPSULES[e.data.weapon], x, e.y + 15, { flash: Math.floor(e.t * 4) % 4 === 0 });
    }
    spr(name, x, y, { flash: e.flash > 0 });
    if (e.windup > 0) {
      const gx = d.glintY !== undefined ? x : x - e.sw / 2 + 3;
      const gy = d.glintY !== undefined ? e.y + d.glintY * e.sh : e.y + (d.noseY || 0) * e.sh;
      drawGlint(gx, gy, e.t);
    }
  }

  function drawGlint(x, y, t) {
    const on = Math.floor(t * 20) % 2;
    ctx.fillStyle = on ? '#ffffff' : '#ff4a3a';
    x = Math.round(x); y = Math.round(y);
    ctx.fillRect(x - 3, y, 7, 1);
    ctx.fillRect(x, y - 3, 1, 7);
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  function drawBoss(b, camX) {
    const x = b.x - camX;
    const flicker = b.state === 'dying' && Math.floor(b.dyingT * 12) % 2;
    const red = b.state === 'telegraph' && Math.floor(b.t * 12) % 2;
    spr(`carrier_${Math.floor(b.t * 3) % 2}`, x, b.y, { flash: b.flash > 0 || flicker, tint: red ? '#ff2020' : undefined, amt: 0.45 });
    if (b.state !== 'dying') {
      const wr = weakRect(b);
      const pulse = b.weak > 0 ? 0.6 : Math.floor(b.t * 2.5) % 3 === 0 ? 0.35 : 0;
      if (pulse) {
        ctx.fillStyle = `rgba(255,180,40,${pulse})`;
        ctx.fillRect(Math.round(wr.x - camX - wr.w / 2), Math.round(wr.y - wr.h / 2), Math.round(wr.w), Math.round(wr.h));
      }
      if (b.windup > 0) { const [nx, ny] = bossNose(b); drawGlint(nx - camX, ny, b.t); }
    }
  }

  // The hull is one static sprite; motion comes from the propeller blur, wake and lights,
  // so it never jitters between differently cropped frames.
  function drawPlayer(p) {
    const SCALE = 0.78;
    const x = Math.round(p.x - G.cam.x), y = Math.round(p.y + p.bob);
    if (p.dead) {
      const i = Math.min(5, Math.floor(p.deathT * 4));
      spr(`player_death_${p.deathVar}_${i}`, x, y, { alpha: p.deathT > 1.6 ? 1 - (p.deathT - 1.6) / 0.6 : 1, scale: SCALE });
      return;
    }
    const ghost = p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0;

    const beamA = 0.05 + 0.015 * Math.sin(p.t * 3);
    ctx.fillStyle = `rgba(210,245,255,${beamA})`;
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 10);
    ctx.lineTo(x + 150, y - 34);
    ctx.lineTo(x + 150, y + 14);
    ctx.closePath();
    ctx.fill();

    const glow = p.thrust;
    if (glow > 0.3) {
      const glowW = Math.round((6 + glow * 8) * SCALE);
      const glowH = Math.round(6 * SCALE);
      ctx.fillStyle = `rgba(110,230,255,${0.25 * glow})`;
      ctx.fillRect(x - Math.round(40 * SCALE), y - Math.round(2 * SCALE), glowW, glowH);
      ctx.fillStyle = `rgba(220,255,255,${0.5 * glow})`;
      ctx.fillRect(x - Math.round(37 * SCALE), y, Math.round((2 + glow * 4) * SCALE), Math.round(2 * SCALE));
    }

    spr('player_hd', x, y, { flash: p.hitFlash > 0, alpha: ghost ? 0.35 : undefined, scale: SCALE, rot: p.roll });

    const blade = Math.floor(p.t * (14 + p.thrust * 24)) % 3;
    const ph = [10, 4, 7][blade];
    const propX = x - Math.round(31 * SCALE);
    ctx.fillStyle = 'rgba(190,210,222,0.55)';
    ctx.fillRect(propX, y + 2 - (ph >> 1), Math.round(2 * SCALE), ph);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(propX, y + 2 - (ph >> 2), Math.round(1 * SCALE), ph >> 1);

    if (Math.floor(p.t * 1.5) % 2 === 0) {
      ctx.fillStyle = '#ff5040';
      ctx.fillRect(x + 1, y - 15, 1, 1);
    }
    if (p.muzzle > 0) {
      const noseX = x + Math.round(NOSE_X * SCALE);
      const noseY = y + Math.round(NOSE_Y * SCALE);
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(noseX, noseY - 1, 4, 3);
      ctx.fillStyle = '#ffb040';
      ctx.fillRect(noseX + 4, noseY, 3, 1);
    }
  }

  function drawPlayerShot(s, camX) {
    const x = Math.round(s.x - camX), y = Math.round(s.y);
    switch (s.kind) {
      case 'torpedo': spr('torpedo', x - 5, y, NO); break;
      case 'tracer':
        ctx.fillStyle = '#ff9a30'; ctx.fillRect(x - 7, y, 3, 1);
        ctx.fillStyle = '#fff6a0'; ctx.fillRect(x - 4, y, 8, 1);
        break;
      case 'pellet':
        ctx.fillStyle = '#ff7a20'; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
        ctx.fillStyle = '#ffe890'; ctx.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'wave': {
        const half = s.h / 2;
        for (let i = -half; i <= half; i++) {
          const off = Math.round(Math.sqrt(Math.max(0, 1 - (i / half) ** 2)) * 5);
          ctx.fillStyle = '#5fe4ff'; ctx.fillRect(x + off - 2, y + i, 2, 1);
          ctx.fillStyle = '#e8ffff'; ctx.fillRect(x + off, y + i, 1, 1);
        }
        break;
      }
      case 'depth':
        const pulse = Math.sin(s.t * 12) > 0.6;
        spr('depth_charge', x, y, { rot: s.t * 4 });
        if (pulse) {
          ctx.fillStyle = 'rgba(255,160,60,0.5)';
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
  }

  function drawEnemyShot(s, camX) {
    const x = Math.round(s.x - camX), y = Math.round(s.y);
    switch (s.kind) {
      case 'pellet':
        ctx.fillStyle = '#ff3b2f'; ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = '#ffd0c0'; ctx.fillRect(x, y, 1, 1);
        break;
      case 'harpoon':
        ctx.fillStyle = '#c8d0d8'; ctx.fillRect(x - 3, y, 9, 1);
        ctx.fillStyle = '#ff5040'; ctx.fillRect(x - 4, y - 1, 2, 3);
        break;
      case 'bolt':
        for (let i = 0; i < 14; i += 2) {
          const oy = ((i + Math.floor(s.t * 30)) % 4) - 1;
          ctx.fillStyle = '#7fefff'; ctx.fillRect(x - 7 + i, y + oy, 2, 1);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 7 + i, y + oy, 1, 1);
        }
        break;
      case 'torp':
      case 'rocket':
      case 'orb':
      case 'shell':
      case 'homing':
        spr(s.sprite, x, y, { rot: Math.atan2(s.vy, s.vx) - Math.PI });
        break;
      case 'bomb':
        spr(s.sprite, x, y, s.sprite === 'heli_bomb' ? { rot: Math.atan2(s.vy, s.vx) - Math.PI } : NO);
        break;
      default:
        spr(s.sprite, x, y, NO);
        if (Math.floor(s.t * 6) % 2) { ctx.fillStyle = '#ff3b2f'; ctx.fillRect(x, y - 1, 1, 1); }
    }
  }

  function drawForeground(camX) {
    for (const f of DECOR.fore) {
      const x = f.lx - camX * 1.35;
      if (x > -90 && x < W + 90) sprBottom(f.name, x, H + 10, { tint: '#02070d', amt: 0.85 });
    }
  }

  function drawHUD() {
    const p = G.player;
    F.draw(ctx, '1P', 6, 4, '#ffd34a');
    F.draw(ctx, String(G.score).padStart(8, '0'), 17, 4, '#ffffff');
    F.draw(ctx, 'HI', 6, 11, '#8fd0ff');
    F.draw(ctx, String(Math.max(hiscore, G.score)).padStart(8, '0'), 17, 11, '#8fd0ff');
    if (G.chain >= 5) F.draw(ctx, `CHAIN ${G.chain} X${(1 + Math.min(4, Math.floor(G.chain / 5)) * 0.5).toFixed(1)}`, 6, 18, '#ffb040');

    const frac = G.time / TIME_LIMIT;
    const blink = Math.floor(G.t * 4) % 2;
    const tcol = frac < 0.1 ? (blink ? '#ff3b3b' : '#ffffff') : frac < 0.25 ? '#ffa030' : '#ffe46a';
    F.draw(ctx, 'TIME', W / 2, 3, '#1f4f7a', 1, 'center', '#e8f6ff');
    F.draw(ctx, String(Math.ceil(G.time)), W / 2, 10, tcol, 2, 'center');

    F.draw(ctx, 'LIFE', W - 50, 4, '#1f4f7a', 1, 'right', '#e8f6ff');
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(W - 46 + i * 14, 3, 12, 7);
      ctx.fillStyle = i < p.hp ? '#ff4040' : '#4a2020';
      ctx.fillRect(W - 45 + i * 14, 4, 10, 5);
      if (i < p.hp) { ctx.fillStyle = '#ffb0a0'; ctx.fillRect(W - 44 + i * 14, 5, 3, 1); }
    }
    F.draw(ctx, `SUB X${Math.max(0, G.lives)}`, W - 6, 13, '#1f4f7a', 1, 'right', '#e8f6ff');

    const by = H - 9;
    ctx.fillStyle = 'rgba(0,6,12,0.55)';
    ctx.fillRect(0, by - 3, W, 12);
    F.draw(ctx, 'POWER', 6, by, '#8fd0ff');
    ctx.fillStyle = WEAPON_COLORS[p.weapon];
    ctx.fillRect(29, by, 5, 5);
    F.draw(ctx, `${WEAPON_NAMES[p.weapon]} LV${p.tier}`, 37, by, WEAPON_COLORS[p.weapon]);
    F.draw(ctx, `RELAY ${Math.min(G.relays, 3)}/3`, W - 6, by, G.relays >= 3 ? '#7dff9a' : '#8fd0ff', 1, 'right');
    const bombColor = p.bombCd <= 0 ? '#7dff9a' : '#556070';
    F.draw(ctx, `DEPTH LV${p.bombTier}`, W - 80, by, bombColor, 1, 'right');

    const b = G.boss;
    if (b) {
      const bw = 180, bx = (W - bw) / 2;
      F.draw(ctx, 'BOSS', bx - 4, H - 22, '#ff8060', 1, 'right');
      ctx.fillStyle = '#000000'; ctx.fillRect(bx - 1, H - 23, bw + 2, 7);
      ctx.fillStyle = '#4a1010'; ctx.fillRect(bx, H - 22, bw, 5);
      ctx.fillStyle = b.phase === 3 ? '#ff3b2f' : '#ff9a3a';
      ctx.fillRect(bx, H - 22, Math.round(bw * b.hp / b.max), 5);
    }

    if (G.banner && (G.banner.t > 0.4 || Math.floor(G.t * 10) % 2)) {
      F.draw(ctx, G.banner.text, W / 2, 104, G.banner.color, 2, 'center');
    }
  }

  function drawOverlay() {
    const cy = H / 2;
    if (state === 'pause') {
      dim(0.5);
      F.draw(ctx, 'PAUSE', W / 2, cy - 30, '#ffffff', 3, 'center');
      F.draw(ctx, 'ESC - CONTINUE   R - RESTART', W / 2, cy + 2, '#9fd7ff', 1, 'center');
      F.draw(ctx, 'M - SOUND   F1 - DEBUG', W / 2, cy + 12, '#9fd7ff', 1, 'center');
    } else if (state === 'over' || state === 'clear') {
      dim(0.55);
      const ok = state === 'clear';
      F.draw(ctx, G.result, W / 2, cy - 60, ok ? '#7dff9a' : '#ff4a3a', 3, 'center');
      F.draw(ctx, `SCORE ${G.score}`, W / 2, cy - 26, '#ffffff', 2, 'center');
      if (ok) F.draw(ctx, `TIME+RELAY BONUS ${G.bonus}`, W / 2, cy - 6, '#ffe46a', 1, 'center');
      F.draw(ctx, `RELAYS DESTROYED ${G.relays}/${RELAYS.length}`, W / 2, cy + 4, '#9fd7ff', 1, 'center');
      F.draw(ctx, `HI ${hiscore}`, W / 2, cy + 14, '#9fd7ff', 1, 'center');
      F.draw(ctx, 'PRESS ENTER', W / 2, cy + 38, '#ffffff', 1, 'center');
    }
  }

  function dim(a) {
    ctx.fillStyle = `rgba(0,8,16,${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    dim(0.35);
    const cy = H / 2;
    F.draw(ctx, 'ABYSSAL FRONT', W / 2, cy - 76, '#ff7a3a', 4, 'center', '#3a0a00');
    F.draw(ctx, 'SOUTH POLE', W / 2, cy - 46, '#e8f6ff', 2, 'center');
    F.draw(ctx, 'TEST STAGE - NEREID-01', W / 2, cy - 30, '#9fd7ff', 1, 'center');
    spr('player_hd', W / 2, cy - 6, NO);
    if (Math.floor(G.t * 2) % 2 === 0) F.draw(ctx, 'PRESS ENTER', W / 2, cy + 22, '#ffe46a', 2, 'center');
    F.draw(ctx, 'WASD/ARROWS - MOVE    J/Z/SPACE - FIRE    K/X - DEPTH CHARGE', W / 2, cy + 52, '#e8f6ff', 1, 'center');
    F.draw(ctx, 'ESC - PAUSE    M - SOUND    GAMEPAD: STICK  A - FIRE  B/RB - DEPTH', W / 2, cy + 62, '#9fd7ff', 1, 'center');
    F.draw(ctx, `HI ${String(hiscore).padStart(8, '0')}`, W / 2, cy + 82, '#8fd0ff', 1, 'center');
  }

  let fps = 60, fpsFrames = 0, fpsT = 0;
  function drawDebug(camX) {
    const p = G.player;
    const lines = [
      `FPS ${fps}`, `CAM ${camX} SPD ${G.cam.speed.toFixed(1)}`, `TIME ${G.time.toFixed(1)}`,
      `P ${Math.round(p.x - camX)} ${Math.round(p.y)}`, `E ${G.enemies.length} PS ${G.pshots.length} ES ${G.eshots.length}`,
      `FX ${G.fx.length} PT ${G.parts.length}`, `SPAWN ${G.spawnIdx}/${SCRIPT.length}`, god ? 'GOD ON (G)' : 'G - GOD  F2 - BOSS',
    ];
    lines.forEach((l, i) => F.draw(ctx, l, 6, 30 + i * 7, '#7dff9a'));
    ctx.lineWidth = 1;
    const box = (o, color) => {
      ctx.strokeStyle = color;
      ctx.strokeRect(Math.round(o.x - camX - o.w / 2) + 0.5, Math.round(o.y - o.h / 2) + 0.5, Math.round(o.w), Math.round(o.h));
    };
    box(p, '#7dff9a');
    G.enemies.forEach(e => box(e, '#ff5050'));
    G.eshots.forEach(s => box(s, '#ffb050'));
    G.pshots.forEach(s => box(s, '#50d0ff'));
    G.props.forEach(pr => !pr.dead && box(pr, '#ffff50'));
    G.ice.forEach(ic => ic.state !== 'gone' && box(ic, '#ffffff'));
    G.pickups.forEach(pk => box(pk, '#ff50ff'));
    if (G.boss) { box(G.boss, '#ff5050'); box(weakRect(G.boss), '#ffb000'); }
    ctx.fillStyle = '#ff50ff';
    for (let x = 0; x < W; x += 2) {
      ctx.fillRect(x, Math.round(floorY(x + camX)), 1, 1);
      if (ceilThick(x + camX) > 1) ctx.fillRect(x, Math.round(ceilY(x + camX)), 1, 1);
    }
  }

  // ---------------------------------------------------------------- main loop
  function startGame() {
    newGame();
    state = 'play';
    banner('READY', '#9fd7ff', 1.4);
    SFX.unlock();
    SFX.music('stage');
  }

  function handleMeta(inp) {
    if (inp.mute) SFX.toggleMute();
    if (inp.debug) debug = !debug;
    if (debug && inp.god) god = !god;
    if (state === 'title' && inp.start) startGame();
    else if (state === 'play') {
      if (inp.pause) state = 'pause';
      if (debug && inp.skip && !G.arena) {
        G.cam.x = ARENA_X - 40;
        G.spawnIdx = SCRIPT.length;
        G.checkpoint = CHECKPOINTS[CHECKPOINTS.length - 1];
        G.enemies.length = 0;
        G.player.x = G.cam.x + 90;
      }
    } else if (state === 'pause') {
      if (inp.pause || inp.start) state = 'play';
      if (inp.restart) startGame();
    } else if ((state === 'over' || state === 'clear') && (inp.start || inp.restart)) startGame();
  }

  let last = 0, acc = 0;
  function frame(ts) {
    const delta = Math.min(0.1, (ts - last) / 1000 || 0);
    last = ts;
    acc += delta;
    const inp = readInput();
    handleMeta(inp);
    let steps = 0;
    while (acc >= STEP && steps < 6) { update(inp); acc -= STEP; steps++; }
    if (steps === 6) acc = 0;
    render();
    fpsFrames++;
    fpsT += delta;
    if (fpsT >= 1) { fps = fpsFrames; fpsFrames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }

  window.__game = { get G() { return G; }, get state() { return state; }, floorY, ceilY };

  Promise.all([
    loadImage('atlas', 'assets/atlas.png'),
    ...['tex_rock', 'tex_metal', 'tex_ice', 'bg_ice', 'bg_refinery'].map(n => loadImage(n, `assets/${n}.png`)),
  ]).then(() => {
    initRender();
    newGame();
    requestAnimationFrame(frame);
  }).catch(err => {
    document.body.insertAdjacentHTML('beforeend', `<p style="color:#f66">Не удалось загрузить ${err.message} — запустите python game/tools/bake_atlas.py</p>`);
  });
})();
