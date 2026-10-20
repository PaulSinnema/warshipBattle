// Warship Battle - top-down naval combat on an endless 2D ocean
const DEG = Math.PI / 180;
const CHUNK = 1200;           // island generation cell size
const MINI_RANGE = 3000;      // half-width of the minimap view
const DESPAWN_DIST = 4200;    // enemies further away are removed
let maxParticles = 2500;     // set by the quality level
const REPAIR_TIME = 6;        // seconds of damage control
const REPAIR_FRACTION = 0.3;  // part of max HP restored per repair
const REPAIR_COOLDOWN = 40;   // seconds before next damage control
const SPAWN_DELAY = 4;        // seconds between enemy reinforcements
const TORPEDO = { speed: 170, range: 1400, damage: 90, spread: 6 };
const MINE = { damage: 80, arm: 1.5, life: 90, max: 15 };
const MISSILE = { speed0: 60, maxSpeed: 380, accel: 260, turn: 3.2, life: 7, damage: 70, seek: 1800, boost: 0.35 };
// Carrier fighter jets: fly out, drop one bomb, return to rearm
const JET = { speed: 300, accel: 120, turn: 2.2, bombDmg: 35, dropDist: 75, range: 2600, bombFall: 0.9,
    launchInterval: 5, sortieCooldown: 25, catHold: 1.2, catAccel: 260, approachDist: 450, landSpeed: 150, trapDecel: 260,
    taxiSpeed: 32, taxiTurn: 2.5, holdRadius: 560 };
const OVERDRIVE = { time: 6, factor: 2.5 };
const SMOKE = { time: 8, seeDist: 300 };
const GROUND = { cooldown: 0.5, factor: 0.25, min: 3 };  // island collision damage
const SUN = { x: 0.6, y: 0.8 };   // shadow direction (screen space)
let spriteScale = 2;              // resolution of cached ship/island sprites
// Turret positions (fraction of ship length) per turret count
const LAYOUTS = {
    1: [0.3],
    2: [0.3, -0.32],
    3: [0.32, 0.15, -0.34],
    4: [0.32, 0.15, -0.17, -0.34],
    5: [0.34, 0.19, -0.17, -0.3, -0.42]
};
// Enemy classes; reload is deliberately long
const ENEMY_TYPES = [
    { name: 'Patrouille', hp: 50, speed: 85, accel: 22, turn: 40, turretTurn: 30, reload: 5.0, damage: 8, shellSpeed: 420, range: 560, spread: 1.6, length: 85, width: 20, turrets: 2, barrels: 1, bow: -0.05, style: 'jager', hull: '#5a3a34', deck: '#7d625a', turret: '#4a3430' },
    { name: 'Torpedojager', hp: 80, speed: 70, accel: 18, turn: 32, turretTurn: 24, reload: 5.5, damage: 10, shellSpeed: 420, range: 620, spread: 1.6, length: 105, width: 24, turrets: 3, barrels: 2, bow: 0.15, style: 'fregat', hull: '#5c3432', deck: '#7a5752', turret: '#4a2c2a' },
    { name: 'Kruiser', hp: 140, speed: 58, accel: 14, turn: 26, turretTurn: 20, reload: 6.0, damage: 14, shellSpeed: 440, range: 720, spread: 1.4, length: 135, width: 30, turrets: 4, barrels: 2, bow: 0.1, style: 'kruiser', hull: '#52302e', deck: '#74524c', turret: '#432826' }
];
const DEFAULT_DIFF = { enemyHp: 1, enemyDamage: 1, enemyReload: 1, enemySpread: 1, startEnemies: 3, maxEnemies: 8 };
// Particle kinds: layer 0 = under ships, 1 = under additive, 2 = over, 3 = over additive
const KIND_LAYER = { foam: 0, glow: 1, smoke: 2, steam: 2, water: 2, sand: 2, debris: 2, ring: 2, fire: 3, flash: 3, spark: 3, repair: 3 };

let canvas, ctx, mini, mctx, dotnet;
let dpr = 1, vw = 0, vh = 0, zoom = 1;
let baseZoom = 1, userZoom = 1, zoomTarget = 1, pinchStart = 0, pinchZoom = 1;
const ZOOM_MIN = 0.35, ZOOM_MAX = 2.5;
let state = 'start';
let player = null;
let diff = DEFAULT_DIFF;
let enemies = [], shells = [], particles = [], mines = [], missiles = [], jets = [], bombs = [];
let kills = 0, spawnTimer = 0, statusTimer = 0, last = 0, time = 0;
let lastReport = '';
let tex = null;          // generated textures and patterns
let quality = { gpu: false, dprMax: 1, shadows: false };
let water = null;        // WebGL ocean when a GPU is available
let seed = 1;
const chunks = new Map();
const shipSprites = new Map();
const spritedIslands = new Set();   // islands holding a cached sprite
const keys = {};
let specialQueued = false;   // catches clicks shorter than one frame
const mouse = { sx: 0, sy: 0, x: 0, y: 0, down: false };
const cam = { x: 0, y: 0 };

// ---------- helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, t, step) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
function norm(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}
// Small seeded PRNG for deterministic islands
function mulberry32(a) {
    return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Multiplies a hex colour's brightness by f
function shade(hex, f) {
    const [r, g, b] = hexRgb(hex);
    return `rgb(${clamp(r * f, 0, 255) | 0},${clamp(g * f, 0, 255) | 0},${clamp(b * f, 0, 255) | 0})`;
}
function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
}

// ---------- public API (called from Blazor) ----------
export function init(canvasId, miniId, ref) {
    dotnet = ref;
    canvas = document.getElementById(canvasId);
    ctx = canvas.getContext('2d');
    mini = document.getElementById(miniId);
    mctx = mini.getContext('2d');
    // GPU present: WebGL water, full resolution, bigger sprites, more particles
    const gpu = detectGpu();
    quality = gpu.gpu
        ? { gpu: true, dprMax: 2, shadows: true, renderer: gpu.renderer }
        : { gpu: false, dprMax: 1, shadows: false, renderer: gpu.renderer };
    spriteScale = gpu.gpu ? 3 : 1.5;
    maxParticles = gpu.gpu ? 4000 : 1200;
    if (gpu.gpu) water = createWater(canvas);
    if (dotnet) dotnet.invokeMethodAsync('OnGraphics', water ? `GPU: ${gpu.renderer}` : `Geen GPU (${gpu.renderer})`).catch(() => { });
    tex = makeTextures();
    seed = (Math.random() * 1e9) | 0;
    resize();
    bindInput();
    requestAnimationFrame(loop);
}

export function startGame(stats, difficulty) {
    initAudio();
    diff = difficulty || DEFAULT_DIFF;
    kills = 0;
    enemies = [];
    shells = [];
    particles = [];
    mines = [];
    missiles = [];
    jets = [];
    bombs = [];
    seed = (Math.random() * 1e9) | 0;
    chunks.clear();
    spritedIslands.clear();
    islandJobs.clear();
    player = makeShip(stats, 0, 0, -Math.PI / 2, false);
    initCarrier(player);
    setEngine(player.st);
    cam.x = player.x;
    cam.y = player.y;
    for (let i = 0; i < targetEnemies(); i++) spawnEnemy();
    spawnTimer = SPAWN_DELAY;
    setState('playing');
}

export function setShip(stats) {
    if (!player || player.dead) return;
    // Keep damage ratio so swapping is no free repair
    const ratio = player.hp / player.maxHp;
    const fresh = makeShip(stats, player.x, player.y, player.heading, false);
    fresh.hp = Math.max(1, Math.round(fresh.maxHp * ratio));
    fresh.throttle = player.throttle;
    fresh.repairCd = player.repairCd;
    fresh.specialCd = player.specialCd;
    player = fresh;
    initCarrier(player);
    setEngine(player.st);
    report(true);
}

// Renders a ship on a small canvas for the shipyard
export function drawPreview(canvasId, stats) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const main = ctx;
    ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#1b5578');
    g.addColorStop(1, '#0e3a58');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const k = Math.min((c.width - 16) / 300, (c.height - 8) / 66);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(k, k);
    const ship = makeShip(stats, 0, 0, 0, false);
    for (const t of ship.turrets) t.reload = 0;
    drawShip(ship, 0.6);
    ctx = main;
}

export function repairFull() {
    if (!player || player.dead) return;
    player.hp = player.maxHp;
    player.repair = 0;
    report(true);
}

export function setPaused(paused) {
    if (paused && state === 'playing') setState('paused');
    else if (!paused && state === 'paused') setState('playing');
}

export function stopGame() {
    player = null;
    enemies = [];
    shells = [];
    mines = [];
    missiles = [];
    jets = [];
    bombs = [];
    setState('start');
}

// ---------- procedural textures ----------
function noiseGrid(cells) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return g;
}

// Tileable value noise sample, u/v in [0,1)
function sampleGrid(g, cells, u, v) {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = xi % cells, y0 = yi % cells, x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

// Builds a tileable texture from fbm noise; colorFn(n, x, y) returns [r,g,b,a]
function fbmTexture(size, octaves, colorFn) {
    const grids = octaves.map(o => ({ cells: o[0], w: o[1], g: noiseGrid(o[0]) }));
    const total = octaves.reduce((s, o) => s + o[1], 0);
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            let n = 0;
            for (const o of grids) n += sampleGrid(o.g, o.cells, u, v) * o.w;
            const col = colorFn(n / total);
            const i = (y * size + x) * 4;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3];
        }
    }
    g.putImageData(img, 0, 0);
    return c;
}

// Soft radial blob used for particles
function softSprite(r, g, b, hard = 0) {
    const c = makeCanvas(64, 64);
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(clamp(hard, 0, 0.9), `rgba(${r},${g},${b},${hard > 0 ? 0.9 : 0.6})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    return c;
}

function makeTextures() {
    const deep = [8, 44, 72], mid = [18, 82, 118], light = [44, 122, 152];
    const water = fbmTexture(256, [[4, 0.4], [8, 0.3], [16, 0.18], [32, 0.12]], n => {
        const t = smooth(0.25, 0.75, n);
        const c = t < 0.5 ? deep.map((v, i) => lerp(v, mid[i], t * 2)) : mid.map((v, i) => lerp(v, light[i], (t - 0.5) * 2));
        return [c[0], c[1], c[2], 255];
    });
    const ripple = fbmTexture(256, [[8, 0.5], [16, 0.3], [32, 0.2]], n => {
        const ridge = 1 - Math.abs(2 * n - 1);
        const a = smooth(0.9, 0.995, ridge) * 110;
        return [225, 240, 250, a];
    });
    const cloud = fbmTexture(256, [[2, 0.45], [4, 0.3], [8, 0.15], [16, 0.1]], n => [0, 0, 0, smooth(0.52, 0.72, n) * 90]);
    return {
        water, ripple, cloud,
        soft: {
            foam: softSprite(255, 255, 255),
            water: softSprite(235, 245, 255, 0.3),
            smoke: softSprite(40, 38, 36),
            steam: softSprite(205, 208, 212),
            sand: softSprite(196, 168, 118),
            fire: softSprite(255, 140, 40),
            flash: softSprite(255, 240, 200, 0.2),
            spark: softSprite(255, 200, 90, 0.4),
            glow: softSprite(255, 150, 60),
            repair: softSprite(120, 220, 255, 0.3)
        }
    };
}

// ---------- endless islands ----------
function chunkIslands(cx, cy) {
    const key = cx + ',' + cy;
    let list = chunks.get(key);
    if (list) return list;
    const rng = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ seed) | 0);
    const r01 = (a, b) => a + rng() * (b - a);
    list = [];
    const roll = rng();
    const count = roll < 0.35 ? 0 : roll < 0.8 ? 1 : 2;
    for (let n = 0, tries = 0; n < count && tries < 10; tries++) {
        const r = r01(70, 220), m = r + 140;
        const x = cx * CHUNK + r01(m, CHUNK - m), y = cy * CHUNK + r01(m, CHUNK - m);
        // Keep the starting area free
        if (Math.hypot(x, y) < r + 700) continue;
        if (list.some(i => Math.hypot(i.x - x, i.y - y) < i.r + r + 260)) continue;
        const pts = [];
        for (let k = 0; k < 24; k++) pts.push(r * r01(0.86, 1.08));
        const trees = [];
        for (let k = 0; k < Math.round(r / 9); k++) {
            const a = r01(0, 2 * Math.PI), d = r01(0, r * 0.62);
            trees.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r01(6, 13) });
        }
        const rocks = [];
        for (let k = 0; k < 2 + Math.floor(rng() * 4); k++) {
            const a = r01(0, 2 * Math.PI), d = r * r01(0.82, 1.0);
            rocks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r01(5, 13) });
        }
        list.push({ x, y, r, pts, trees, rocks, sprite: null, phase: r01(0, 6.28) });
        n++;
    }
    chunks.set(key, list);
    return list;
}

function islandsNear(x, y, rad) {
    const out = [];
    const cx0 = Math.floor((x - rad) / CHUNK), cx1 = Math.floor((x + rad) / CHUNK);
    const cy0 = Math.floor((y - rad) / CHUNK), cy1 = Math.floor((y + rad) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++)
        for (let cy = cy0; cy <= cy1; cy++)
            for (const isl of chunkIslands(cx, cy)) out.push(isl);
    return out;
}

function pruneChunks() {
    if (chunks.size < 500) return;
    const pcx = Math.floor(cam.x / CHUNK), pcy = Math.floor(cam.y / CHUNK);
    for (const key of chunks.keys()) {
        const [cx, cy] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > 8 || Math.abs(cy - pcy) > 8) chunks.delete(key);
    }
}

function onIsland(x, y, pad = 0) {
    return islandsNear(x, y, 300 + pad).some(i => Math.hypot(i.x - x, i.y - y) < i.r * 0.95 + pad);
}

// ---------- setup ----------
function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, quality.dprMax);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    if (water) water.resize();
    baseZoom = clamp(Math.min(vw, vh) / 850, 0.45, 1.1);
    zoom = baseZoom * userZoom;
}

function setZoom(z) {
    zoomTarget = clamp(z, ZOOM_MIN, ZOOM_MAX);
}

function setPointer(x, y) {
    mouse.sx = x;
    mouse.sy = y;
}

function bindInput() {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'KeyF') specialQueued = true;
        if (e.code === 'KeyM') setMuted(!muted);
        if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
        if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
        mouse.down = false;
    });

    canvas.addEventListener('mousemove', e => setPointer(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', e => {
        setPointer(e.clientX, e.clientY);
        if (e.button === 0) mouse.down = true;
        if (e.button === 2) { keys.KeyF = true; specialQueued = true; }   // right click = special
    });
    window.addEventListener('mouseup', e => {
        if (e.button === 0) mouse.down = false;
        if (e.button === 2) keys.KeyF = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // Mouse wheel zoom
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        setZoom(zoomTarget * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    // Touch on the sea: aim and fire
    const onTouch = e => {
        e.preventDefault();
        // Two fingers: pinch zoom, no firing
        if (e.targetTouches.length >= 2) {
            const a = e.targetTouches[0], b = e.targetTouches[1];
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            if (!pinchStart) { pinchStart = d; pinchZoom = zoomTarget; }
            else setZoom(pinchZoom * d / pinchStart);
            mouse.down = false;
            return;
        }
        pinchStart = 0;
        const t = e.targetTouches[0];
        if (t) { setPointer(t.clientX, t.clientY); mouse.down = true; }
        else mouse.down = false;
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
        canvas.addEventListener(ev, onTouch, { passive: false });

    // On-screen buttons map to keys
    document.querySelectorAll('[data-key]').forEach(b => {
        const k = b.dataset.key;
        const on = e => { keys[k] = true; if (k === 'KeyF') specialQueued = true; e.preventDefault(); };
        const off = e => { keys[k] = false; e.preventDefault(); };
        b.addEventListener('touchstart', on, { passive: false });
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
        b.addEventListener('mousedown', on);
        b.addEventListener('mouseup', off);
        b.addEventListener('mouseleave', off);
    });
}

function togglePause() {
    if (state === 'playing') setState('paused');
    else if (state === 'paused') setState('playing');
}

function setState(s) {
    state = s;
    if (audio) { if (s === 'paused') audio.ctx.suspend(); else audio.ctx.resume(); }
    report(true);
}

function report(force) {
    if (!dotnet) return;
    const alive = enemies.filter(e => !e.dead).length;
    const hp = player ? Math.round(100 * player.hp / player.maxHp) : 0;
    // -1 = active, 0 = ready, >0 = cooldown seconds
    const rep = !player ? 0 : player.repair > 0 ? -1 : Math.ceil(player.repairCd);
    const sp = !player ? 0 : player.specialT > 0 ? -1 : Math.ceil(player.specialCd);
    // Jets airborne, -1 when the ship carries none
    const air = player && player.st.jets ? jets.filter(j => AIR_PHASES.includes(j.phase)).length : -1;
    const jetCd = player && player.deck ? Math.ceil(player.deck.sortieCd) : 0;
    const key = `${state}|${kills}|${alive}|${hp}|${rep}|${sp}|${air}|${jetCd}`;
    if (!force && key === lastReport) return;
    lastReport = key;
    dotnet.invokeMethodAsync('OnStatus', state, kills, alive, hp, rep, sp, air, jetCd).catch(() => { });
}

// ---------- ships ----------
function makeShip(st, x, y, heading, enemy) {
    // Custom slots are flat [fx, fy, ...] pairs (fractions of length / width)
    const slots = st.turretSlots && st.turretSlots.length >= 2
        ? Array.from({ length: st.turretSlots.length / 2 }, (_, i) => [st.turretSlots[i * 2], st.turretSlots[i * 2 + 1]])
        : LAYOUTS[clamp(st.turrets || 4, 1, 5)].map(f => [f, 0]);
    return {
        st, x, y, heading, enemy,
        speed: 0, throttle: 0, rudder: 0,
        hp: st.hp, maxHp: st.hp,
        dead: false, sink: 0, wake: 0, smoke: 0, spray: 0,
        repair: 0, repairCd: 0, specialT: 0, specialCd: 0, groundCd: 0,
        deck: null,
        // rel = turret angle relative to hull; aft turrets start facing aft
        turrets: slots.map(([f, fy]) => ({
            off: f * st.length, side: fy * st.width, rel: fy !== 0 ? Math.sign(fy) * Math.PI / 2 : f > 0 ? 0 : Math.PI,
            reload: rand(0, st.reload), err: 1, recoil: 0, blocked: false
        })),
        ai: { side: Math.random() < 0.5 ? 1 : -1, flip: rand(8, 16), avoid: 1, stuck: 0, reverse: 0 }
    };
}

// Fixed enemy count per difficulty; does not grow during play
function targetEnemies() {
    return diff.startEnemies;
}

// Fixed class mix and strength; only the chosen difficulty matters
function enemyStats() {
    const r = Math.random();
    const base = ENEMY_TYPES[r < 0.5 ? 0 : r < 0.85 ? 1 : 2];
    return {
        ...base,
        hp: Math.round(base.hp * diff.enemyHp),
        damage: base.damage * diff.enemyDamage,
        reload: base.reload * diff.enemyReload,
        spread: base.spread * diff.enemySpread
    };
}

function turretPos(s, t) {
    const c = Math.cos(s.heading), n = Math.sin(s.heading), side = t.side || 0;
    return { x: s.x + c * t.off - n * side, y: s.y + n * t.off + c * side };
}

// Turret scale; carriers use small gun mounts
const turretWidth = st => st.turretSize || st.width;

function spawnEnemy() {
    const st = enemyStats();
    const px = player ? player.x : 0, py = player ? player.y : 0;
    for (let k = 0; k < 80; k++) {
        const a = rand(0, 2 * Math.PI), r = rand(1300, 2000);
        const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
        if (onIsland(x, y, 200)) continue;
        enemies.push(makeShip(st, x, y, Math.atan2(py - y, px - x), true));
        return;
    }
}

// ---------- main loop ----------
function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    time += dt;
    // Keyboard / button zoom, eased toward the target
    if (keys.Equal || keys.NumpadAdd || keys.ZoomIn) setZoom(zoomTarget * (1 + dt * 1.5));
    if (keys.Minus || keys.NumpadSubtract || keys.ZoomOut) setZoom(zoomTarget / (1 + dt * 1.5));
    userZoom += (zoomTarget - userZoom) * Math.min(1, dt * 8);
    zoom = baseZoom * userZoom;
    if (state === 'playing' || state === 'gameover') update(dt);
    if (state === 'start') {
        // Slow idle drift
        cam.x = Math.cos(time * 0.05) * 1500;
        cam.y = Math.sin(time * 0.05) * 1500;
        updateParticles(dt);
    }
    updateEngineSound();
    render();
    requestAnimationFrame(loop);
}

function update(dt) {
    mouse.x = cam.x + (mouse.sx - vw / 2) / zoom;
    mouse.y = cam.y + (mouse.sy - vh / 2) / zoom;
    const active = state === 'playing';

    if (player) {
        if (active && !player.dead) controlPlayer(dt);
        updateShip(player, dt);
    }
    for (const e of enemies) {
        if (!e.dead) {
            if (active && player && !player.dead) enemyAI(e, dt);
            else { e.throttle = 0.4; e.rudder = 0.2; }
        }
        updateShip(e, dt);
    }
    separate();
    updateShells(dt);
    updateMissiles(dt);
    updateJets(dt);
    updateMines(dt);
    updateParticles(dt);
    enemies = enemies.filter(e => !(e.dead && e.sink > 4));

    if (active && player && !player.dead) {
        // Drop enemies left far behind; reinforcements refill
        enemies = enemies.filter(e => e.dead || Math.hypot(e.x - player.x, e.y - player.y) < DESPAWN_DIST);
        spawnTimer -= dt;
        if (spawnTimer <= 0 && enemies.filter(e => !e.dead).length < targetEnemies()) {
            spawnEnemy();
            spawnTimer = SPAWN_DELAY;
        }
    }

    if (player && player.dead && active && player.sink > 2.5) setState('gameover');

    if (player) {
        cam.x += (player.x - cam.x) * Math.min(1, dt * 5);
        cam.y += (player.y - cam.y) * Math.min(1, dt * 5);
    }
    pruneChunks();

    statusTimer -= dt;
    if (statusTimer <= 0) {
        statusTimer = 0.25;
        report(false);
    }
}

function controlPlayer(dt) {
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    if (up) player.throttle = Math.min(1, player.throttle + dt * 0.8);
    if (down) player.throttle = Math.max(-0.5, player.throttle - dt * 0.8);
    if (keys.KeyX) player.throttle = 0;
    if (keys.KeyR && player.repairCd <= 0 && player.repair <= 0 && player.hp < player.maxHp) {
        player.repair = REPAIR_TIME;
        player.repairCd = REPAIR_COOLDOWN;
        report(true);
    }
    if ((keys.KeyF || specialQueued) && player.st.special && player.specialCd <= 0) useSpecial(player);
    specialQueued = false;
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    player.rudder = approach(player.rudder, (right ? 1 : 0) - (left ? 1 : 0), dt * 2.5);

    aimTurrets(player, mouse.x, mouse.y, dt);
    if (mouse.down || keys.Space) fireTurrets(player, mouse.x, mouse.y);
}

function useSpecial(s) {
    const st = s.st;
    switch (st.special) {
        case 'torpedo': {
            const n = st.specialCount || 2;
            const base = Math.atan2(mouse.y - s.y, mouse.x - s.x);
            for (let i = 0; i < n; i++) {
                const a = base + (i - (n - 1) / 2) * TORPEDO.spread * DEG;
                shells.push({ x: s.x, y: s.y, dx: Math.cos(a), dy: Math.sin(a), speed: TORPEDO.speed, left: TORPEDO.range, enemy: false, dmg: TORPEDO.damage, done: false, torp: true, trail: 0 });
                addParticle({ kind: 'water', x: s.x + Math.cos(a) * st.width * 0.6, y: s.y + Math.sin(a) * st.width * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, max: 0.6, size: 6, grow: 14, alpha: 0.7 });
            }
            break;
        }
        case 'mines': {
            const n = st.specialCount || 3;
            const c = Math.cos(s.heading), sn = Math.sin(s.heading);
            for (let i = 0; i < n; i++) {
                const side = (i - (n - 1) / 2) * 30;
                const back = st.length * 0.6 + i * 6;
                const mx = s.x - c * back - sn * side, my = s.y - sn * back + c * side;
                mines.push({ x: mx, y: my, arm: MINE.arm, life: MINE.life, bob: rand(0, 6.28) });
                addParticle({ kind: 'ring', x: mx, y: my, vx: 0, vy: 0, max: 1, size: 4, grow: 30, alpha: 0.5 });
            }
            while (mines.length > MINE.max) mines.shift();
            break;
        }
        case 'missile': {
            const n = st.specialCount || 2;
            // Lock on to the enemy closest to the cursor
            const target = nearestEnemy(mouse.x, mouse.y, MISSILE.seek * 2);
            for (let i = 0; i < n; i++) {
                const side = i % 2 ? 1 : -1;
                const p = local(s, st.length * (0.25 - 0.5 * (i / Math.max(1, n - 1))), side * st.width * 0.2);
                missiles.push({ x: p.x, y: p.y, a: s.heading + side * rand(1.2, 1.9), speed: MISSILE.speed0, target, life: MISSILE.life, age: -i * 0.12, trail: 0 });
                addParticle({ kind: 'steam', x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), max: 1.5, size: 8, grow: 18, alpha: 0.6 });
            }
            break;
        }
        case 'overdrive':
            s.specialT = OVERDRIVE.time;
            break;
        case 'smoke':
            s.specialT = SMOKE.time;
            break;
        default:
            return;
    }
    s.specialCd = st.specialCooldown || 15;
    report(true);
}

// World position of a point given in ship-local coordinates
function local(s, lx, ly) {
    const c = Math.cos(s.heading), n = Math.sin(s.heading);
    return { x: s.x + c * lx - n * ly, y: s.y + n * lx + c * ly };
}

function updateShip(s, dt) {
    const st = s.st;
    const reloadRate = s.specialT > 0 && st.special === 'overdrive' ? OVERDRIVE.factor : 1;
    for (const t of s.turrets) {
        t.reload = Math.max(0, t.reload - dt * reloadRate);
        t.recoil = Math.max(0, t.recoil - dt * 3);
    }

    s.repairCd = Math.max(0, s.repairCd - dt);
    s.groundCd = Math.max(0, s.groundCd - dt);
    s.specialCd = Math.max(0, s.specialCd - dt);
    s.specialT = Math.max(0, s.specialT - dt);
    if (s.repair > 0 && !s.dead) {
        const step = Math.min(dt, s.repair);
        s.repair -= step;
        s.hp = Math.min(s.maxHp, s.hp + s.maxHp * REPAIR_FRACTION * step / REPAIR_TIME);
        if (Math.random() < dt * 10)
            addParticle({ kind: 'repair', x: s.x + rand(-st.length / 3, st.length / 3), y: s.y + rand(-st.width / 3, st.width / 3), vx: 0, vy: 0, max: 0.4, size: 3, grow: 6, alpha: 1 });
    }
    if (s.specialT > 0 && !s.dead) {
        if (st.special === 'smoke' && Math.random() < dt * 30) {
            const p = local(s, -st.length * 0.45, rand(-st.width / 3, st.width / 3));
            addParticle({ kind: 'steam', x: p.x, y: p.y, vx: rand(-12, 12), vy: rand(-12, 12), max: 5, size: rand(14, 22), grow: 16, alpha: 0.8 });
        }
        if (st.special === 'overdrive' && Math.random() < dt * 25)
            addParticle({ kind: 'spark', x: s.x + rand(-st.length / 2, st.length / 2), y: s.y + rand(-st.width / 2, st.width / 2), vx: 0, vy: 0, max: 0.3, size: 3, grow: 4, alpha: 1 });
    }

    if (s.dead) {
        s.sink += dt;
        s.speed *= 1 - dt * 0.8;
        // Burning wreck and bubbles
        if (Math.random() < dt * 20 && s.sink < 3) {
            const p = local(s, rand(-st.length / 2.5, st.length / 2.5), rand(-st.width / 3, st.width / 3));
            addParticle({ kind: 'fire', x: p.x, y: p.y, vx: rand(-5, 5), vy: rand(-5, 5), max: rand(0.4, 0.8), size: rand(5, 10), grow: 8, alpha: 0.9 });
        }
        if (Math.random() < dt * 12) {
            const p = local(s, rand(-st.length / 2, st.length / 2), rand(-st.width / 2, st.width / 2));
            addParticle({ kind: 'foam', x: p.x, y: p.y, vx: 0, vy: 0, max: 2, size: 3, grow: 6, alpha: 0.6 });
        }
    } else {
        const target = s.throttle * st.speed * (s.throttle < 0 ? 0.5 : 1);
        s.speed = approach(s.speed, target, st.accel * dt);
        // Rudder needs water flow: weak at low speed
        const eff = clamp(Math.abs(s.speed) / (st.speed * 0.35), 0.15, 1);
        s.heading = norm(s.heading + s.rudder * st.turn * DEG * eff * dt * (s.speed < 0 ? -1 : 1));
    }

    s.x += Math.cos(s.heading) * s.speed * dt;
    s.y += Math.sin(s.heading) * s.speed * dt;

    for (const isl of islandsNear(s.x, s.y, 400)) {
        const dx = s.x - isl.x, dy = s.y - isl.y, d = Math.hypot(dx, dy) || 1;
        const min = isl.r * 0.95 + st.length * 0.3;
        if (d < min) {
            s.x = isl.x + dx / d * min;
            s.y = isl.y + dy / d * min;
            // Running aground: damage scales with impact speed
            if (!s.dead && s.groundCd <= 0 && Math.abs(s.speed) > 5) {
                s.groundCd = GROUND.cooldown;
                const cx = isl.x + dx / d * isl.r * 0.95, cy = isl.y + dy / d * isl.r * 0.95;
                burst(cx, cy, 16, 'sand', 70, 1.0, 7);
                burst(cx, cy, 8, 'spark', 90, 0.35, 3);
                burst(cx, cy, 6, 'water', 50, 0.8, 6);
                damage(s, Math.max(GROUND.min, Math.abs(s.speed) * GROUND.factor), false);
                s.speed *= 0.3;
            }
            s.speed *= 0.85;
        }
    }

    const sp = Math.abs(s.speed), frac = clamp(sp / st.speed, 0, 1);
    if (sp > 8 && !s.dead) {
        // Kelvin wake: churned centre line plus two diverging arms
        s.wake -= dt;
        if (s.wake <= 0) {
            s.wake = 0.045;
            const stern = local(s, -st.length * 0.5, 0);
            const back = s.heading + Math.PI;
            addParticle({ kind: 'foam', x: stern.x + rand(-3, 3), y: stern.y + rand(-3, 3), vx: Math.cos(back) * sp * 0.15, vy: Math.sin(back) * sp * 0.15, max: 4.5, size: st.width * 0.28, grow: 7, alpha: 0.45 * frac + 0.1 });
            for (const side of [-1, 1]) {
                const a = back + side * 19.5 * DEG;
                const out = s.heading + side * Math.PI / 2;
                const p = local(s, -st.length * 0.42, side * st.width * 0.45);
                addParticle({ kind: 'foam', x: p.x, y: p.y, vx: Math.cos(out) * sp * 0.28 + Math.cos(a) * 4, vy: Math.sin(out) * sp * 0.28 + Math.sin(a) * 4, max: 3.5, size: 3.5, grow: 4, alpha: 0.4 * frac + 0.08 });
            }
        }
        // Bow wave: foam peeling off both sides of the bow
        s.spray -= dt;
        if (s.spray <= 0 && s.speed > 0) {
            s.spray = 0.035;
            for (const side of [-1, 1]) {
                const f = rand(0.3, 0.48);
                const p = local(s, st.length * f, side * st.width * (0.5 - f) * 0.9);
                const out = s.heading + side * rand(1.3, 1.8);
                addParticle({ kind: 'foam', x: p.x, y: p.y, vx: Math.cos(out) * sp * 0.3, vy: Math.sin(out) * sp * 0.3, max: 2.4, size: st.width * 0.15, grow: 6, alpha: 0.65 * frac + 0.1 });
            }
        }
    }

    // Damage smoke from the funnel area, fire when badly hurt
    if (!s.dead && s.hp < s.maxHp * 0.6) {
        s.smoke -= dt;
        if (s.smoke <= 0) {
            const hurt = 1 - s.hp / s.maxHp;
            s.smoke = 0.18 - hurt * 0.1;
            const p = local(s, rand(-st.length * 0.2, st.length * 0.1), rand(-st.width / 4, st.width / 4));
            addParticle({ kind: 'smoke', x: p.x, y: p.y, vx: rand(6, 14) - s.speed * Math.cos(s.heading) * 0.3, vy: rand(-4, 4) - s.speed * Math.sin(s.heading) * 0.3, max: 3.5, size: rand(5, 8), grow: 9, alpha: 0.35 + hurt * 0.4 });
            if (s.hp < s.maxHp * 0.3)
                addParticle({ kind: 'fire', x: p.x, y: p.y, vx: 0, vy: 0, max: 0.5, size: rand(4, 7), grow: 5, alpha: 0.9 });
        }
    }
}

function aimTurrets(s, tx, ty, dt) {
    const step = s.st.turretTurn * DEG * dt;
    for (const t of s.turrets) {
        const p = turretPos(s, t);
        const desired = norm(Math.atan2(ty - p.y, tx - p.x) - s.heading);
        const diffA = norm(desired - t.rel);
        t.rel = norm(t.rel + clamp(diffA, -step, step));
        t.err = Math.abs(norm(desired - t.rel));
        t.blocked = fireBlocked(s, p, s.heading + t.rel);
    }
}

// True when point (local coords) lies on the hull; slightly shrunk
function insideHull(st, lx, ly) {
    const L = st.length, hw = st.width / 2 * 0.9, t = L * (st.bow ?? 0.15);
    if (lx > L / 2 || lx < -L / 2) return false;
    let w = hw;
    if (lx > t) w = hw * (1 - ((lx - t) / (L / 2 - t)) ** 2);
    return Math.abs(ly) < w - 3;
}

// True when the line of fire crosses the own ship beyond the barrel
function fireBlocked(s, p, a) {
    const st = s.st, c = Math.cos(s.heading), n = Math.sin(s.heading);
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = turretWidth(st) * 0.75; d < st.length; d += 5) {
        const wx = p.x + dx * d - s.x, wy = p.y + dy * d - s.y;
        if (insideHull(st, wx * c + wy * n, -wx * n + wy * c)) return true;
    }
    return false;
}

function fireTurrets(s, tx, ty) {
    const st = s.st;
    for (const t of s.turrets) {
        if (t.reload > 0 || t.err > 2 * DEG || t.blocked) continue;
        const p = turretPos(s, t);
        const a = s.heading + t.rel + rand(-st.spread, st.spread) * DEG;
        const dist = clamp(Math.hypot(tx - p.x, ty - p.y), 80, st.range) * rand(0.97, 1.03);
        const tw = turretWidth(st);
        const mx = p.x + Math.cos(a) * tw * 0.8, my = p.y + Math.sin(a) * tw * 0.8;
        const mg = st.weapon === 'mg';
        shells.push({ x: mx, y: my, dx: Math.cos(a), dy: Math.sin(a), speed: st.shellSpeed, left: dist, enemy: s.enemy, dmg: st.damage, done: false, mg });
        t.reload = st.reload * rand(0.95, 1.05);
        t.recoil = mg ? 0.35 : 1;
        if (mg) mgFlash(mx, my, a);
        else muzzleFlash(mx, my, a, tw);
    }
}

// True when sailing along heading h for dist units hits no island
function pathClear(s, h, dist) {
    const dx = Math.cos(h), dy = Math.sin(h);
    const pad = s.st.width + 60;
    for (const isl of islandsNear(s.x, s.y, dist + 300)) {
        const cx = isl.x - s.x, cy = isl.y - s.y;
        const t = clamp(cx * dx + cy * dy, 0, dist);
        if (Math.hypot(dx * t - cx, dy * t - cy) < isl.r + pad) return false;
    }
    return true;
}

// Picks the free heading closest to the wanted one
function steerAround(e, desired) {
    const look = 260 + Math.abs(e.speed) * 2.5;
    for (let k = 0; k <= 12; k++) {
        for (const sign of [e.ai.avoid, -e.ai.avoid]) {
            const h = desired + sign * k * 15 * DEG;
            if (pathClear(e, h, look)) {
                if (k > 0) e.ai.avoid = sign;
                return { h, blocked: k > 0 };
            }
            if (k === 0) break;
        }
    }
    return { h: e.heading + Math.PI, blocked: true };
}

function enemyAI(e, dt) {
    const st = e.st;
    const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy);
    const toP = Math.atan2(dy, dx);
    const hidden = player.st.special === 'smoke' && player.specialT > 0 && d > SMOKE.seeDist;

    e.ai.flip -= dt;
    if (e.ai.flip <= 0) { e.ai.flip = rand(8, 16); e.ai.side *= -1; }

    // Close in, then fight broadside
    let desired;
    if (d > st.range * 0.85) desired = toP;
    else if (d < st.range * 0.45) desired = toP + e.ai.side * Math.PI * 0.7;
    else desired = toP + e.ai.side * Math.PI / 2;

    const route = steerAround(e, desired);

    // Stuck against a shore: back off for a moment
    if (e.ai.reverse > 0) {
        e.ai.reverse -= dt;
        e.throttle = -0.6;
        e.rudder = -clamp(norm(route.h - e.heading) * 2, -1, 1);
    } else {
        e.rudder = clamp(norm(route.h - e.heading) * 2, -1, 1);
        // Slow down for sharp evasive turns
        e.throttle = route.blocked && Math.abs(norm(route.h - e.heading)) > 60 * DEG ? 0.5 : 0.85;
        e.ai.stuck = Math.abs(e.speed) < 8 ? e.ai.stuck + dt : 0;
        if (e.ai.stuck > 1.5) { e.ai.stuck = 0; e.ai.reverse = 2; }
    }

    // Player hidden in smoke: hold fire
    if (hidden) return;

    // Lead the target
    const flight = d / st.shellSpeed;
    const tx = player.x + Math.cos(player.heading) * player.speed * flight;
    const ty = player.y + Math.sin(player.heading) * player.speed * flight;
    aimTurrets(e, tx, ty, dt);
    if (d < st.range) fireTurrets(e, tx, ty);
}

function separate() {
    const all = enemies.filter(s => !s.dead);
    if (player && !player.dead) all.push(player);
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            const a = all[i], b = all[j];
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const min = (a.st.length + b.st.length) * 0.3;
            if (d < min) {
                const push = (min - d) / 2;
                a.x -= dx / d * push; a.y -= dy / d * push;
                b.x += dx / d * push; b.y += dy / d * push;
            }
        }
    }
}

// ---------- shells, torpedoes, mines ----------
function updateShells(dt) {
    for (const sh of shells) {
        let travel = sh.speed * dt;
        const isl = islandsNear(sh.x, sh.y, travel + 300);
        if (sh.torp) {
            sh.trail -= dt;
            if (sh.trail <= 0) {
                // Bubble wake streaming out behind the propeller
                sh.trail = 0.02;
                const bx = sh.x - sh.dx * 11, by = sh.y - sh.dy * 11;
                addParticle({ kind: 'foam', x: bx + rand(-1.5, 1.5), y: by + rand(-1.5, 1.5), vx: -sh.dx * 8, vy: -sh.dy * 8, max: 4, size: 2.5, grow: 3.5, alpha: 0.6 });
                if (Math.random() < 0.5)
                    addParticle({ kind: 'foam', x: bx + rand(-3, 3), y: by + rand(-3, 3), vx: rand(-4, 4), vy: rand(-4, 4), max: 1.5, size: 1.2, grow: 1, alpha: 0.8 });
            }
        }
        while (travel > 0 && !sh.done) {
            const step = Math.min(8, travel, sh.left);
            sh.x += sh.dx * step;
            sh.y += sh.dy * step;
            sh.left -= step;
            travel -= step;
            const hit = hitShip(sh);
            if (hit) {
                damage(hit, sh.dmg);
                if (sh.torp) { explosion(sh.x, sh.y, true); waterColumn(sh.x, sh.y, 1.6); }
                else if (sh.mg) mgHit(sh.x, sh.y, sh.dx, sh.dy);
                else hitEffect(sh.x, sh.y, sh.dx, sh.dy);
                sh.done = true;
            } else if (isl.some(i => Math.hypot(i.x - sh.x, i.y - sh.y) < i.r * 0.95)) {
                burst(sh.x, sh.y, 12, 'sand', 60, 1.0, 6);
                burst(sh.x, sh.y, 5, 'spark', 80, 0.3, 3);
                burst(sh.x, sh.y, 4, 'smoke', 20, 1.6, 6);
                sh.done = true;
            } else if (sh.left <= 0) {
                if (sh.mg) mgSplash(sh.x, sh.y);
                else if (!sh.torp) waterColumn(sh.x, sh.y, 1);
                sh.done = true;
            }
        }
    }
    shells = shells.filter(s => !s.done);
}

function nearestEnemy(x, y, maxDist) {
    let best = null, bd = maxDist;
    for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

// Homing missiles: short launch boost, then accelerate and steer to the target
function updateMissiles(dt) {
    for (const m of missiles) {
        m.age += dt;
        if (m.age < 0) continue;           // staggered salvo
        m.life -= dt;
        if (!m.target || m.target.dead) m.target = nearestEnemy(m.x, m.y, MISSILE.seek);
        if (m.age > MISSILE.boost) {
            if (m.target) {
                const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
                m.a = norm(m.a + clamp(norm(want - m.a), -MISSILE.turn * dt, MISSILE.turn * dt));
            }
            m.speed = Math.min(MISSILE.maxSpeed, m.speed + MISSILE.accel * dt);
        }
        // Exhaust smoke trail
        m.trail -= dt;
        if (m.trail <= 0) {
            m.trail = 0.02;
            addParticle({ kind: 'steam', x: m.x, y: m.y, vx: rand(-6, 6), vy: rand(-6, 6), max: rand(1.5, 2.5), size: 3.5, grow: 10, alpha: 0.75 });
        }
        let travel = m.speed * dt;
        while (travel > 0 && !m.done) {
            const step = Math.min(8, travel);
            m.x += Math.cos(m.a) * step;
            m.y += Math.sin(m.a) * step;
            travel -= step;
            const hit = hitShip({ x: m.x, y: m.y, enemy: false });
            if (hit) {
                damage(hit, MISSILE.damage);
                explosion(m.x, m.y, true);
                m.done = true;
            } else if (onIsland(m.x, m.y)) {
                explosion(m.x, m.y, false);
                burst(m.x, m.y, 10, 'sand', 60, 1, 6);
                m.done = true;
            }
        }
        if (!m.done && m.life <= 0) {
            explosion(m.x, m.y, false);
            m.done = true;
        }
    }
    missiles = missiles.filter(m => !m.done);
}

// Carrier air wing: taxi to catapult, launch, strike, hold, land one at a time, taxi to parking
// Deck geometry in fractions of length (x) and width (y)
const CATAPULTS = [{ x0: 0.12, x1: 0.47, y: -0.12 }, { x0: 0.05, x1: 0.44, y: 0.06 }];
const LANE = { ax: -0.46, ay: 0.12, bx: 0.12, by: -0.38, touch: 0.1 };
// Parking spots along the deck edges, clear of catapults and the landing lane
const SPOTS = [
    [-0.42, -0.33], [-0.36, -0.33], [-0.30, -0.33], [-0.24, -0.33],
    [-0.48, 0.34], [-0.42, 0.34], [-0.36, 0.34], [-0.30, 0.34], [-0.24, 0.34], [-0.18, 0.34],
    [0.09, 0.32], [0.15, 0.32], [0.21, 0.32], [0.27, 0.32], [0.33, 0.32], [0.39, 0.32],
    [0.18, -0.34], [0.24, -0.34], [0.30, -0.34], [0.36, -0.34]
];
const DECK_PHASES = ['parked', 'taxiOut', 'cat', 'trap', 'taxiIn'];
const AIR_PHASES = ['air', 'hold', 'approach', 'final'];

// Parked pose: nose angled inboard and forward
function spotPose(st, i) {
    const [fx, fy] = SPOTS[i % SPOTS.length];
    return { x: fx * st.length, y: fy * st.width, a: fy > 0 ? -1.2 : 1.2 };
}

// Puts all jets of a carrier on their parking spots
function initCarrier(c) {
    jets = jets.filter(j => AIR_PHASES.includes(j.phase));
    if (!c.st.jets) { c.deck = null; return; }
    c.deck = { sortieCd: 0, sinceLaunch: JET.launchInterval, cat: [null, null], laneOwner: null };
    for (let i = 0; i < c.st.jets; i++) {
        const p = spotPose(c.st, i);
        const j = { spot: i, phase: 'parked', lx: p.x, ly: p.y, la: p.a, sortied: false, alt: 0, bomb: true, speed: 0, trail: 0, ttl: 8, x: 0, y: 0, a: 0 };
        placeOnDeck(c, j);
        jets.push(j);
    }
}

function placeOnDeck(c, j) {
    const p = local(c, j.lx, j.ly);
    j.x = p.x;
    j.y = p.y;
    j.a = c.heading + j.la;
}

// Moves a jet along its deck path; returns true when the path is finished
function taxi(j, dt) {
    while (j.path.length) {
        const wp = j.path[0];
        const dx = wp.x - j.lx, dy = wp.y - j.ly, d = Math.hypot(dx, dy);
        if (d < 1) { j.path.shift(); if (j.onWaypoint) j.onWaypoint(j.path.length); continue; }
        // Pivot first, then roll forward
        const want = Math.atan2(dy, dx), diffA = norm(want - j.la);
        j.la = norm(j.la + clamp(diffA, -JET.taxiTurn * dt, JET.taxiTurn * dt));
        if (Math.abs(diffA) < 0.5) {
            const step = Math.min(d, JET.taxiSpeed * dt);
            j.lx += Math.cos(want) * step;
            j.ly += Math.sin(want) * step;
        }
        return false;
    }
    return true;
}

function laneInfo(c) {
    const L = c.st.length, W = c.st.width;
    const la = Math.atan2((LANE.by - LANE.ay) * W, (LANE.bx - LANE.ax) * L);
    const tx = lerp(LANE.ax, LANE.bx, LANE.touch) * L, ty = lerp(LANE.ay, LANE.by, LANE.touch) * W;
    const td = local(c, tx, ty);
    const a = c.heading + la;
    return { la, tx, ty, td, a, ap: { x: td.x - Math.cos(a) * JET.approachDist, y: td.y - Math.sin(a) * JET.approachDist } };
}

function steerJet(j, tx, ty, dt) {
    const want = Math.atan2(ty - j.y, tx - j.x);
    j.a = norm(j.a + clamp(norm(want - j.a), -JET.turn * dt, JET.turn * dt));
    j.x += Math.cos(j.a) * j.speed * dt;
    j.y += Math.sin(j.a) * j.speed * dt;
}

function updateJets(dt) {
    const c = player;
    const deck = c && !c.dead && c.st.jets ? c.deck : null;
    if (!deck) jets = jets.filter(j => AIR_PHASES.includes(j.phase));

    if (deck) {
        const L = c.st.length, W = c.st.width;
        deck.sinceLaunch += dt;
        // Turnaround pause after all jets flew one sortie
        if (deck.sortieCd > 0) {
            deck.sortieCd -= dt;
            if (deck.sortieCd <= 0) for (const j of jets) j.sortied = false;
        }
        // Send the closest fresh jet to a free catapult
        const near = state === 'playing' && nearestEnemy(c.x, c.y, JET.range);
        if (near && deck.sortieCd <= 0) {
            for (let k = 0; k < CATAPULTS.length; k++) {
                if (deck.cat[k]) continue;
                const cp = CATAPULTS[k], sx = cp.x0 * L, sy = cp.y * W;
                let best = null, bd = Infinity;
                for (const j of jets) {
                    if (j.phase !== 'parked' || j.sortied) continue;
                    const d = Math.hypot(j.lx - sx, j.ly - sy);
                    if (d < bd) { bd = d; best = j; }
                }
                if (!best) break;
                best.phase = 'taxiOut';
                best.cat = k;
                best.path = [{ x: best.lx, y: best.ly * 0.55 }, { x: sx - 25, y: sy }, { x: sx, y: sy }];
                best.onWaypoint = null;
                deck.cat[k] = best;
                break;
            }
        }
    }

    for (const j of jets) {
        if (DECK_PHASES.includes(j.phase)) {
            if (!deck) { j.done = true; continue; }
            updateDeckJet(c, deck, j, dt);
            placeOnDeck(c, j);
            continue;
        }

        // Airborne
        const finalSpeed = JET.landSpeed + Math.max(0, c ? c.speed : 0);
        j.speed = approach(j.speed, j.phase === 'final' ? finalSpeed : JET.speed, JET.accel * dt);
        if (j.phase !== 'final') j.alt = Math.min(1, j.alt + dt * 0.45);

        if (!deck) {
            // Carrier lost: fly off and disappear
            j.ttl -= dt;
            if (j.ttl <= 0) j.done = true;
            steerJet(j, j.x + Math.cos(j.a) * 100, j.y + Math.sin(j.a) * 100, dt);
        } else if (j.phase === 'air') {
            if (!j.target || j.target.dead) j.target = j.bomb ? nearestEnemy(j.x, j.y, JET.range * 1.5) : null;
            if (!j.target) {
                j.phase = 'hold';
                j.holdSince = time;
            } else {
                const t = j.target;
                const tx = t.x + Math.cos(t.heading) * t.speed * JET.bombFall;
                const ty = t.y + Math.sin(t.heading) * t.speed * JET.bombFall;
                if (j.alt > 0.8 && j.bomb && Math.hypot(t.x - j.x, t.y - j.y) < JET.dropDist) {
                    bombs.push({ sx: j.x, sy: j.y, tx, ty, t: 0 });
                    j.bomb = false;
                    j.target = null;
                }
                steerJet(j, tx, ty, dt);
            }
        } else if (j.phase === 'hold') {
            // Orbit the carrier until the landing lane is free and it is our turn
            const ang = Math.atan2(j.y - c.y, j.x - c.x) + 0.6;
            steerJet(j, c.x + Math.cos(ang) * JET.holdRadius, c.y + Math.sin(ang) * JET.holdRadius, dt);
            if (!deck.laneOwner) {
                const first = jets.filter(o => o.phase === 'hold').sort((a, b) => a.holdSince - b.holdSince)[0];
                if (first === j) { deck.laneOwner = j; j.phase = 'approach'; }
            }
        } else {
            const li = laneInfo(c);
            if (j.phase === 'approach') {
                if (Math.hypot(li.ap.x - j.x, li.ap.y - j.y) < 80) j.phase = 'final';
                steerJet(j, li.ap.x, li.ap.y, dt);
            } else {
                // Final: line up and descend onto the angled deck
                const d = Math.hypot(li.td.x - j.x, li.td.y - j.y);
                j.alt = clamp(d / JET.approachDist, 0, 1);
                const err = Math.abs(norm(Math.atan2(li.td.y - j.y, li.td.x - j.x) - li.a));
                if (err > 1.0 && d > 40) { j.phase = 'approach'; j.alt = Math.max(j.alt, 0.5); }   // wave-off, go around
                steerJet(j, li.td.x, li.td.y, dt);
                if (d < 22) {
                    j.phase = 'trap';
                    j.lx = li.tx; j.ly = li.ty; j.la = li.la;
                    j.deckV = Math.max(0, j.speed - Math.max(0, c.speed));
                    j.stopped = 0;
                    j.alt = 0;
                    addParticle({ kind: 'steam', x: j.x, y: j.y, vx: 0, vy: 0, max: 0.8, size: 4, grow: 10, alpha: 0.4 });
                }
            }
        }

        // Faint vapour trail at altitude
        j.trail -= dt;
        if (j.trail <= 0 && j.alt > 0.5) {
            j.trail = 0.05;
            addParticle({ kind: 'steam', x: j.x - Math.cos(j.a) * 12, y: j.y - Math.sin(j.a) * 12, vx: 0, vy: 0, max: 0.9, size: 1.5, grow: 4, alpha: 0.3 * j.alt });
        }
    }
    jets = jets.filter(j => !j.done);

    for (const b of bombs) {
        b.t += dt;
        if (b.t < JET.bombFall) continue;
        const hit = hitShip({ x: b.tx, y: b.ty, enemy: false });
        if (hit) {
            damage(hit, JET.bombDmg);
            explosion(b.tx, b.ty, false);
            burst(b.tx, b.ty, 4, 'fire', 30, 0.8, 7);
        } else {
            waterColumn(b.tx, b.ty, 1.4);
        }
        b.done = true;
    }
    bombs = bombs.filter(b => !b.done);
}

function updateDeckJet(c, deck, j, dt) {
    const L = c.st.length, W = c.st.width;
    switch (j.phase) {
        case 'taxiOut':
            if (taxi(j, dt)) { j.phase = 'cat'; j.hold = JET.catHold; j.deckV = 0; j.la = 0; }
            break;
        case 'cat': {
            const cp = CATAPULTS[j.cat];
            const enemyNear = state === 'playing' && nearestEnemy(c.x, c.y, JET.range * 1.5);
            if (j.deckV === 0) {
                // Tensioned on the shuttle, steam venting; fires at most once per interval
                j.hold -= dt;
                if (Math.random() < dt * 10) {
                    const p = local(c, j.lx, cp.y * W);
                    addParticle({ kind: 'steam', x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-10, 10), max: 1, size: 3, grow: 8, alpha: 0.45 });
                }
                if (j.hold <= 0 && deck.sinceLaunch >= JET.launchInterval && enemyNear) {
                    deck.sinceLaunch = 0;
                    j.deckV = 1;
                    playSound('jet', j.x, j.y, 1);
                    j.sortied = true;
                    if (jets.every(o => o.sortied || AIR_PHASES.includes(o.phase) && o.sortied)) deck.sortieCd = JET.sortieCooldown;
                }
            } else {
                j.deckV += JET.catAccel * dt;
                j.lx += j.deckV * dt;
                if (Math.random() < dt * 40) {
                    const p = local(c, cp.x0 * L, cp.y * W);
                    addParticle({ kind: 'steam', x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), max: 1.6, size: 4, grow: 12, alpha: 0.6 });
                }
                if (j.lx >= cp.x1 * L) {
                    placeOnDeck(c, j);
                    j.phase = 'air';
                    j.speed = Math.max(0, c.speed) + j.deckV;
                    j.alt = 0;
                    j.target = null;
                    deck.cat[j.cat] = null;
                }
            }
            break;
        }
        case 'trap':
            // Hook caught: hard deceleration along the angled deck, then clear the lane
            j.deckV = Math.max(0, j.deckV - JET.trapDecel * dt);
            j.lx += Math.cos(j.la) * j.deckV * dt;
            j.ly += Math.sin(j.la) * j.deckV * dt;
            if (j.deckV <= 0) {
                j.stopped += dt;
                if (j.stopped > 0.4) {
                    const sp = spotPose(c.st, j.spot);
                    j.phase = 'taxiIn';
                    j.path = [{ x: j.lx, y: sp.y * 0.55 }, { x: sp.x, y: sp.y * 0.55 }, { x: sp.x, y: sp.y }];
                    // Lane is free once the jet has rolled out of it
                    j.onWaypoint = left => { if (left === 2 && deck.laneOwner === j) deck.laneOwner = null; };
                }
            }
            break;
        case 'taxiIn':
            if (taxi(j, dt)) {
                if (deck.laneOwner === j) deck.laneOwner = null;
                j.phase = 'parked';
                j.la = spotPose(c.st, j.spot).a;
                j.bomb = true;   // rearmed
                j.onWaypoint = null;
            }
            break;
    }
}

// Fighter silhouette, nose along +x, about 22 units long
function jetPath(g) {
    g.beginPath();
    g.moveTo(11, 0);
    g.lineTo(5, -1.6);
    g.lineTo(0, -2);
    g.lineTo(-3, -10.5);
    g.lineTo(-6.5, -10.5);
    g.lineTo(-5, -2.2);
    g.lineTo(-8.5, -2.4);
    g.lineTo(-10.5, -5.5);
    g.lineTo(-12, -5.5);
    g.lineTo(-11, -1);
    g.lineTo(-11, 1);
    g.lineTo(-12, 5.5);
    g.lineTo(-10.5, 5.5);
    g.lineTo(-8.5, 2.4);
    g.lineTo(-5, 2.2);
    g.lineTo(-6.5, 10.5);
    g.lineTo(-3, 10.5);
    g.lineTo(0, 2);
    g.lineTo(5, 1.6);
    g.closePath();
}

function drawJetBody(scale, burner) {
    ctx.scale(scale, scale);
    if (burner) {
        ctx.globalCompositeOperation = 'lighter';
        const fl = 5 + Math.random() * 3;
        ctx.drawImage(tex.soft.fire, -11 - fl * 1.6, -fl / 2, fl * 1.8, fl);
        ctx.globalCompositeOperation = 'source-over';
    }
    jetPath(ctx);
    const g = ctx.createLinearGradient(0, -10, 0, 10);
    g.addColorStop(0, '#b4bcc4');
    g.addColorStop(0.5, '#8c959e');
    g.addColorStop(1, '#5b636b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Canopy
    ctx.fillStyle = '#1b3550';
    ctx.beginPath();
    ctx.ellipse(4.5, 0, 2.6, 1, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(5, -0.3, 1.2, 0.35, 0, 0, 2 * Math.PI);
    ctx.fill();
}

function drawJets() {
    for (const j of jets) {
        const alt = j.alt;
        const scale = lerp(0.7, 1.3, alt);   // higher = closer to the camera
        const off = 2 + 36 * alt;
        // Ground shadow; converges with the jet on the deck
        ctx.save();
        ctx.translate(j.x + SUN.x * off, j.y + SUN.y * off);
        ctx.rotate(j.a);
        ctx.scale(scale, scale);
        jetPath(ctx);
        ctx.fillStyle = `rgba(0,10,20,${0.35 - alt * 0.1})`;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(j.x, j.y);
        ctx.rotate(j.a);
        const burner = AIR_PHASES.includes(j.phase) || (j.phase === 'cat' && j.deckV > 0);
        drawJetBody(scale, burner);
        // Bomb under the fuselage until released
        if (j.bomb) {
            ctx.fillStyle = '#2a2d30';
            ctx.beginPath();
            ctx.ellipse(-2, 0, 3, 1, 0, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawBombs() {
    for (const b of bombs) {
        const f = clamp(b.t / JET.bombFall, 0, 1);
        const x = lerp(b.sx, b.tx, f), y = lerp(b.sy, b.ty, f);
        const sh = 1 - f;   // shadow converges as the bomb falls
        ctx.fillStyle = 'rgba(0,10,20,.3)';
        ctx.beginPath();
        ctx.arc(x + SUN.x * 38 * sh, y + SUN.y * 38 * sh, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#1f2224';
        ctx.beginPath();
        ctx.ellipse(x, y, 3.2 * (1 - f * 0.4), 1.4 * (1 - f * 0.4), Math.atan2(b.ty - b.sy, b.tx - b.sx), 0, 2 * Math.PI);
        ctx.fill();
    }
}

function drawMissiles() {
    for (const m of missiles) {
        if (m.age < 0) continue;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.a);
        // Exhaust flame
        ctx.globalCompositeOperation = 'lighter';
        const fl = 6 + Math.random() * 4;
        ctx.drawImage(tex.soft.fire, -8 - fl, -fl / 2, fl * 1.6, fl);
        ctx.drawImage(tex.soft.flash, -9, -3, 6, 6);
        ctx.globalCompositeOperation = 'source-over';
        setShadow(2, 4);
        // Body, nose and fins
        ctx.fillStyle = '#e4e7ea';
        ctx.fillRect(-7, -1.6, 12, 3.2);
        clearShadow();
        ctx.fillStyle = '#b8282a';
        ctx.beginPath();
        ctx.moveTo(5, -1.6); ctx.lineTo(9, 0); ctx.lineTo(5, 1.6);
        ctx.fill();
        ctx.fillStyle = '#7d8389';
        ctx.beginPath();
        ctx.moveTo(-7, -1.6); ctx.lineTo(-9, -4); ctx.lineTo(-4, -1.6);
        ctx.moveTo(-7, 1.6); ctx.lineTo(-9, 4); ctx.lineTo(-4, 1.6);
        ctx.fill();
        ctx.restore();
    }
}

function updateMines(dt) {
    for (const m of mines) {
        m.arm -= dt;
        m.life -= dt;
        if (m.arm > 0 || m.life <= 0) continue;
        for (const e of enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.x - m.x, e.y - m.y) < e.st.length * 0.35 + 20) {
                damage(e, MINE.damage);
                explosion(m.x, m.y, true);
                waterColumn(m.x, m.y, 2);
                m.life = 0;
                break;
            }
        }
    }
    mines = mines.filter(m => m.life > 0);
}

function hitShip(sh) {
    const targets = sh.enemy ? (player ? [player] : []) : enemies;
    for (const s of targets) {
        if (s.dead) continue;
        const dx = sh.x - s.x, dy = sh.y - s.y;
        const c = Math.cos(s.heading), n = Math.sin(s.heading);
        const lx = dx * c + dy * n, ly = -dx * n + dy * c;
        const hl = s.st.length / 2, hw = s.st.width / 2;
        if ((lx * lx) / (hl * hl) + (ly * ly) / (hw * hw) <= 1) return s;
    }
    return null;
}

// byPlayer = false for self-inflicted damage (no coins)
function damage(s, dmg, byPlayer = true) {
    s.hp -= dmg;
    if (s.hp <= 0 && !s.dead) {
        s.hp = 0;
        s.dead = true;
        s.throttle = 0;
        s.rudder = 0;
        explosion(s.x, s.y, true);
        for (let k = 0; k < 3; k++) {
            const p = local(s, rand(-s.st.length / 3, s.st.length / 3), 0);
            explosion(p.x, p.y, false);
        }
        if (s.enemy && byPlayer) {
            kills++;
            if (dotnet) dotnet.invokeMethodAsync('OnKill').catch(() => { });
        }
    }
    if (s === player || s.dead) report(false);
}

// ---------- particles & effects ----------
function addParticle(p) {
    if (particles.length >= maxParticles) particles.shift();
    p.life = 0;
    p.grow = p.grow || 0;
    p.layer = KIND_LAYER[p.kind] ?? 2;
    p.rot = p.rot ?? rand(0, 6.28);
    particles.push(p);
}

function burst(x, y, n, kind, spd, life, size) {
    for (let i = 0; i < n; i++) {
        const a = rand(0, 2 * Math.PI), v = rand(0.2, 1) * spd;
        addParticle({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: life * rand(0.6, 1.2), size: size * rand(0.6, 1.3), grow: size * 0.8, alpha: 1 });
    }
}

function muzzleFlash(x, y, a, w) {
    playSound('cannon', x, y, clamp(w / 26, 0.6, 1.4));
    const k = w / 26;
    addParticle({ kind: 'flash', x, y, vx: 0, vy: 0, max: 0.1, size: 16 * k, grow: 40, alpha: 1 });
    addParticle({ kind: 'glow', x, y, vx: 0, vy: 0, max: 0.2, size: 50 * k, grow: 60, alpha: 0.5 });
    for (let i = 0; i < 4; i++) {
        const b = a + rand(-0.25, 0.25), v = rand(60, 160);
        addParticle({ kind: 'fire', x, y, vx: Math.cos(b) * v, vy: Math.sin(b) * v, max: rand(0.08, 0.18), size: rand(4, 8) * k, grow: 20, alpha: 1 });
    }
    for (let i = 0; i < 5; i++) {
        const b = a + rand(-0.4, 0.4), v = rand(20, 70);
        addParticle({ kind: 'steam', x, y, vx: Math.cos(b) * v, vy: Math.sin(b) * v, max: rand(1.2, 2.2), size: rand(5, 9) * k, grow: 14, alpha: 0.5 });
    }
}

// Machine gun: small flash, bullet sparks and tiny splashes
function mgFlash(x, y, a) {
    playSound('mg', x, y, 1);
    addParticle({ kind: 'flash', x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, vx: 0, vy: 0, max: 0.05, size: 5, grow: 20, alpha: 1 });
    addParticle({ kind: 'steam', x, y, vx: Math.cos(a) * 20, vy: Math.sin(a) * 20, max: 0.5, size: 2, grow: 6, alpha: 0.3 });
}

function mgHit(x, y, dx, dy) {
    playSound('ping', x, y, 1);
    for (let i = 0; i < 4; i++) {
        const a = Math.atan2(-dy, -dx) + rand(-1.3, 1.3), v = rand(60, 160);
        addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.1, 0.25), size: rand(1, 2), grow: 0, alpha: 1 });
    }
    if (Math.random() < 0.3) addParticle({ kind: 'smoke', x, y, vx: 0, vy: 0, max: 1, size: 3, grow: 6, alpha: 0.4 });
}

function mgSplash(x, y) {
    for (let i = 0; i < 3; i++)
        addParticle({ kind: 'water', x, y, vx: rand(-15, 15), vy: rand(-15, 15), max: rand(0.3, 0.5), size: rand(1.5, 3), grow: 6, alpha: 0.7 });
    addParticle({ kind: 'ring', x, y, vx: 0, vy: 0, max: 0.4, size: 1.5, grow: 14, alpha: 0.35 });
}

function waterColumn(x, y, scale) {
    playSound('splash', x, y, clamp(scale, 0.6, 2));
    for (let i = 0; i < 8 * scale; i++) {
        const a = rand(0, 2 * Math.PI), v = rand(5, 35) * scale;
        addParticle({ kind: 'water', x: x + rand(-3, 3), y: y + rand(-3, 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.6, 1.2), size: rand(4, 8) * scale, grow: 18 * scale, alpha: 0.85 });
    }
    addParticle({ kind: 'ring', x, y, vx: 0, vy: 0, max: 1.1, size: 5, grow: 45 * scale, alpha: 0.5 });
    addParticle({ kind: 'foam', x, y, vx: 0, vy: 0, max: 3, size: 8 * scale, grow: 10, alpha: 0.5 });
}

function hitEffect(x, y, dx, dy) {
    playSound('hit', x, y, 1);
    addParticle({ kind: 'flash', x, y, vx: 0, vy: 0, max: 0.12, size: 14, grow: 50, alpha: 1 });
    addParticle({ kind: 'glow', x, y, vx: 0, vy: 0, max: 0.4, size: 50, grow: 50, alpha: 0.45 });
    for (let i = 0; i < 10; i++) {
        const a = Math.atan2(-dy, -dx) + rand(-1.2, 1.2), v = rand(60, 200);
        addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.2, 0.5), size: rand(1.5, 3), grow: 0, alpha: 1 });
    }
    burst(x, y, 4, 'fire', 40, 0.4, 6);
    burst(x, y, 5, 'smoke', 25, 2.5, 7);
    for (let i = 0; i < 3; i++)
        addParticle({ kind: 'debris', x, y, vx: rand(-80, 80), vy: rand(-80, 80), max: rand(0.5, 1), size: rand(1.5, 3), grow: 0, alpha: 1 });
}

function explosion(x, y, big) {
    playSound('boom', x, y, big ? 1 : 0.6);
    const s = big ? 1.6 : 1;
    addParticle({ kind: 'flash', x, y, vx: 0, vy: 0, max: 0.18, size: 30 * s, grow: 160 * s, alpha: 1 });
    addParticle({ kind: 'glow', x, y, vx: 0, vy: 0, max: 0.8, size: 90 * s, grow: 80, alpha: 0.6 });
    for (let i = 0; i < 18 * s; i++) {
        const a = rand(0, 2 * Math.PI), v = rand(20, 130) * s;
        addParticle({ kind: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.4, 0.9), size: rand(6, 12) * s, grow: 16, alpha: 1 });
    }
    for (let i = 0; i < 14 * s; i++) {
        const a = rand(0, 2 * Math.PI), v = rand(10, 60) * s;
        addParticle({ kind: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(2.5, 4.5), size: rand(8, 14) * s, grow: 14, alpha: 0.75 });
    }
    for (let i = 0; i < 16 * s; i++) {
        const a = rand(0, 2 * Math.PI), v = rand(120, 320) * s;
        addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.3, 0.7), size: rand(1.5, 3), grow: 0, alpha: 1 });
    }
    if (big) {
        for (let i = 0; i < 10; i++)
            addParticle({ kind: 'debris', x, y, vx: rand(-160, 160), vy: rand(-160, 160), max: rand(0.8, 1.6), size: rand(2, 4), grow: 0, alpha: 1 });
        addParticle({ kind: 'ring', x, y, vx: 0, vy: 0, max: 1.2, size: 10, grow: 140, alpha: 0.6 });
        addParticle({ kind: 'foam', x, y, vx: 0, vy: 0, max: 4, size: 30, grow: 16, alpha: 0.45 });
    }
}

function updateParticles(dt) {
    for (const p of particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = p.kind === 'spark' || p.kind === 'debris' ? 1.5 : 2.2;
        p.vx *= 1 - dt * drag;
        p.vy *= 1 - dt * drag;
        p.size += p.grow * dt;
        if (p.kind === 'debris') p.rot += dt * 8;
    }
    particles = particles.filter(p => p.life < p.max);
}

// ---------- sound (Web Audio, fully synthesized) ----------
let audio = null;
let muted = false;

function initAudio() {
    if (audio) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ac.destination);
    const master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(comp);

    // Shared white noise buffer
    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    audio = { ctx: ac, master, noise, eng: null, engKey: '', last: {} };
    if (player) setEngine(player.st);
}

function setMuted(m) {
    muted = m;
    if (audio) audio.master.gain.setTargetAtTime(m ? 0 : 0.7, audio.ctx.currentTime, 0.05);
}

// Engine sound profiles: oscillator types, rpm range, filter, rumble, chug (am) and turbine whine
const ENGINE_PROFILES = {
    // Small fast boats: buzzy high-revving engines
    boat: { t1: 'sawtooth', t2: 'square', ratio: 1.5, f0: 55, f1: 150, cut0: 600, cut1: 2200, noiseF: 900, noiseMix: 0.3, am: [12, 30, 0.35], turb: null, vol: 0.75 },
    // Frigates: medium diesels
    diesel: { t1: 'sawtooth', t2: 'square', ratio: 2.02, f0: 32, f1: 62, cut0: 180, cut1: 700, noiseF: 150, noiseMix: 0.8, am: [5, 10, 0.25], turb: null, vol: 1 },
    // Cruisers: gas turbines with a high whine
    turbine: { t1: 'sawtooth', t2: 'triangle', ratio: 2, f0: 30, f1: 55, cut0: 200, cut1: 800, noiseF: 400, noiseMix: 0.7, am: null, turb: [700, 1500, 0.05], vol: 0.9 },
    // Heavy cruisers: deep chugging diesels
    heavy: { t1: 'sawtooth', t2: 'square', ratio: 2.01, f0: 24, f1: 44, cut0: 140, cut1: 450, noiseF: 110, noiseMix: 1.0, am: [3, 6, 0.4], turb: null, vol: 1.1 },
    // Battleships: huge steam turbines
    battleship: { t1: 'sawtooth', t2: 'sine', ratio: 1.5, f0: 20, f1: 34, cut0: 110, cut1: 320, noiseF: 80, noiseMix: 1.2, am: [1.5, 3, 0.2], turb: [300, 520, 0.03], vol: 1.2 },
    // Carrier: massive low rumble plus constant ventilation hum
    carrier: { t1: 'sine', t2: 'sawtooth', ratio: 3, f0: 18, f1: 28, cut0: 90, cut1: 240, noiseF: 70, noiseMix: 1.4, am: null, turb: [60, 62, 0.05], vol: 1.25 }
};
const ENGINE_BY_SHIP = {
    korvet: 'boat', jager: 'boat', wesp: 'boat', horzel: 'boat', specht: 'boat',
    fregat: 'diesel', spin: 'diesel', schim: 'diesel',
    kruiser: 'turbine', valk: 'turbine', orka: 'turbine', arend: 'turbine',
    monitor: 'heavy', zwaar: 'heavy', furie: 'heavy', zeus: 'heavy',
    titan: 'battleship', leviathan: 'battleship', poseidon: 'carrier'
};

function engineKey(st) {
    if (ENGINE_BY_SHIP[st.id]) return ENGINE_BY_SHIP[st.id];
    return st.length < 100 ? 'boat' : st.length < 130 ? 'diesel' : st.length < 160 ? 'heavy' : 'battleship';
}

// (Re)builds the engine audio graph for the given ship
function setEngine(st) {
    if (!audio) return;
    const key = engineKey(st);
    if (audio.eng && audio.engKey === key) return;
    const ac = audio.ctx, t = ac.currentTime;
    if (audio.eng) {
        const old = audio.eng;
        old.out.gain.setTargetAtTime(0, t, 0.1);
        setTimeout(() => old.nodes.forEach(n => { try { n.stop(); } catch { } }), 600);
    }
    const pr = ENGINE_PROFILES[key];
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(audio.master);
    // Chug: amplitude modulation of the engine body
    const body = ac.createGain();
    body.gain.value = 1;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = pr.cut0;
    filter.Q.value = 0.9;
    filter.connect(body);
    body.connect(out);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = pr.t1; o2.type = pr.t2;
    o1.frequency.value = pr.f0; o2.frequency.value = pr.f0 * pr.ratio;
    const o2g = ac.createGain();
    o2g.gain.value = 0.35;
    o1.connect(filter); o2.connect(o2g); o2g.connect(filter);
    const rumble = ac.createBufferSource();
    rumble.buffer = audio.noise;
    rumble.loop = true;
    const rf = ac.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = pr.noiseF;
    rf.Q.value = 0.7;
    const rg = ac.createGain();
    rg.gain.value = pr.noiseMix;
    rumble.connect(rf); rf.connect(rg); rg.connect(filter);
    const nodes = [o1, o2, rumble];
    let lfo = null, lfoG = null;
    if (pr.am) {
        lfo = ac.createOscillator();
        lfo.frequency.value = pr.am[0];
        lfoG = ac.createGain();
        lfoG.gain.value = pr.am[2];
        lfo.connect(lfoG); lfoG.connect(body.gain);
        body.gain.value = 1 - pr.am[2] * 0.5;
        nodes.push(lfo);
    }
    let turb = null, turbG = null;
    if (pr.turb) {
        turb = ac.createOscillator();
        turb.type = 'sine';
        turb.frequency.value = pr.turb[0];
        turbG = ac.createGain();
        turbG.gain.value = pr.turb[2];
        turb.connect(turbG); turbG.connect(out);
        nodes.push(turb);
    }
    nodes.forEach(n => n.start());
    audio.eng = { pr, out, filter, o1, o2, lfo, turb, nodes };
    audio.engKey = key;
}

// Engine pitch, tone and volume follow the throttle and speed
function updateEngineSound() {
    if (!audio || !audio.eng) return;
    const e = audio.eng, pr = e.pr, t = audio.ctx.currentTime;
    const on = player && !player.dead && state === 'playing';
    const frac = on ? clamp(Math.abs(player.speed) / player.st.speed, 0, 1) : 0;
    const thr = on ? Math.abs(player.throttle) : 0;
    const rpm = clamp(frac * 0.8 + thr * 0.2, 0, 1);
    const f = lerp(pr.f0, pr.f1, rpm);
    e.o1.frequency.setTargetAtTime(f, t, 0.25);
    e.o2.frequency.setTargetAtTime(f * pr.ratio, t, 0.25);
    e.filter.frequency.setTargetAtTime(lerp(pr.cut0, pr.cut1, rpm), t, 0.25);
    if (e.lfo) e.lfo.frequency.setTargetAtTime(lerp(pr.am[0], pr.am[1], rpm), t, 0.3);
    if (e.turb) e.turb.frequency.setTargetAtTime(lerp(pr.turb[0], pr.turb[1], rpm), t, 0.4);
    e.out.gain.setTargetAtTime(on ? (0.07 + rpm * 0.17) * pr.vol : 0, t, 0.3);
}

// Distance attenuation and stereo pan relative to the camera
function spatial(x, y, range) {
    const d = Math.hypot(x - cam.x, y - cam.y);
    const v = clamp(1 - d / range, 0, 1);
    return { vol: v * v, pan: clamp((x - cam.x) / 900, -1, 1) };
}

// Noise burst through a falling lowpass; kind: boom | cannon | hit | splash
function playSound(kind, x, y, size = 1) {
    if (!audio || muted || state === 'paused') return;
    const ac = audio.ctx, t = ac.currentTime;
    // Rate limit per kind to avoid stacking dozens of identical sounds
    if (audio.last[kind] && t - audio.last[kind] < (kind === 'mg' ? 0.045 : 0.035)) return;
    audio.last[kind] = t;
    const cfg = {
        boom: { range: 3200, dur: 1.4 * size, f0: 1400, f1: 60, gain: 1.1, thump: 55 },
        // Small guns crack, big guns boom
        cannon: { range: 2400, dur: 0.2 + 0.35 * size, f0: 4200 / size, f1: 160 / size, gain: 0.55, thump: 120 / size },
        jet: { range: 2600, dur: 1.8, f0: 600, f1: 3500, gain: 0.35, thump: 0, rise: true },
        mg: { range: 2000, dur: 0.07, f0: 6000, f1: 1200, gain: 0.3, thump: 140 },
        ping: { range: 1800, dur: 0.06, f0: 7000, f1: 3000, gain: 0.12, thump: 0 },
        hit: { range: 2600, dur: 0.5, f0: 3000, f1: 200, gain: 0.6, thump: 0 },
        splash: { range: 2000, dur: 0.7, f0: 2400, f1: 500, gain: 0.25, thump: 0 }
    }[kind];
    const sp = spatial(x, y, cfg.range);
    const vol = sp.vol * cfg.gain * (kind === 'cannon' ? Math.min(size, 1.3) : size);
    if (vol < 0.01) return;

    const out = ac.createGain();
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { pan.pan.value = sp.pan; out.connect(pan); pan.connect(audio.master); }
    else out.connect(audio.master);

    const src = ac.createBufferSource();
    src.buffer = audio.noise;
    src.playbackRate.value = rand(0.7, 1.1);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cfg.f0, t);
    lp.frequency.exponentialRampToValueAtTime(cfg.f1, t + cfg.dur * (cfg.rise ? 0.5 : 1));
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + (cfg.rise ? 0.3 : 0.008));
    env.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    src.connect(lp); lp.connect(env); env.connect(out);
    src.start(t, rand(0, 1));
    src.stop(t + cfg.dur + 0.05);

    // Low sine thump gives weight to cannons and explosions
    if (cfg.thump) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(cfg.thump * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(cfg.thump * 0.5, t + cfg.dur * 0.6);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur * 0.6);
        o.connect(g); g.connect(out);
        o.start(t);
        o.stop(t + cfg.dur);
    }
}

// ---------- GPU detection & WebGL water ----------
// Returns { gpu, renderer }; software renderers count as no GPU
function detectGpu() {
    const force = /[?&]gpu=1/.test(location.search);
    try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: !force }) || (force && c.getContext('webgl'));
        if (!gl) return { gpu: false, renderer: 'geen (software)' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        const soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return { gpu: force || !soft, renderer: r };
    } catch {
        return { gpu: false, renderer: 'onbekend' };
    }
}

const WATER_VS = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Per-pixel ocean: summed directional waves for normals, fbm for colour, sun specular and crest foam
const WATER_FS = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
uniform float uTime;
uniform float uDpr;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
void wave(vec2 w, vec2 dir, float len, float amp, inout float h, inout vec2 g) {
    vec2 d = normalize(dir);
    float k = 6.2831 / len;
    float c = sqrt(9.8 * 40.0 / k) * 0.35;
    float ph = k * dot(d, w) - k * c * uTime;
    h += amp * sin(ph);
    g += amp * k * cos(ph) * d;
}
void main() {
    vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
    vec2 w = uCam + (px - uRes / (2.0 * uDpr)) / uZoom;
    float h = 0.0;
    vec2 g = vec2(0.0);
    wave(w, vec2(1.0, 0.35), 340.0, 3.2, h, g);
    wave(w, vec2(0.7, 0.9), 210.0, 2.2, h, g);
    wave(w, vec2(-0.4, 1.0), 130.0, 1.3, h, g);
    wave(w, vec2(1.0, -0.6), 85.0, 0.8, h, g);
    wave(w, vec2(0.2, 1.0), 52.0, 0.45, h, g);
    wave(w, vec2(-1.0, 0.3), 33.0, 0.28, h, g);
    wave(w, vec2(0.9, 0.5), 21.0, 0.16, h, g);
    wave(w, vec2(-0.3, -1.0), 13.0, 0.09, h, g);
    // Fine ripples from noise gradient
    vec2 q = w * 0.045 + vec2(uTime * 0.25, -uTime * 0.18);
    float e = 0.35;
    float n0 = fbm(q);
    g += vec2(fbm(q + vec2(e, 0.0)) - n0, fbm(q + vec2(0.0, e)) - n0) * 0.9;
    vec3 nrm = normalize(vec3(-g * 0.9, 1.0));

    float tint = fbm(w * 0.0025 + uTime * 0.01);
    vec3 deep = vec3(0.025, 0.15, 0.25);
    vec3 mid = vec3(0.06, 0.30, 0.43);
    vec3 col = mix(deep, mid, clamp(tint * 1.1 + h * 0.06, 0.0, 1.0));

    vec3 sun = normalize(vec3(-0.45, -0.55, 0.7));
    float diff = clamp(dot(nrm, sun), 0.0, 1.0);
    col *= 0.72 + 0.45 * diff;
    // Sky reflection on tilted facets
    float fres = clamp((1.0 - nrm.z) * 5.0, 0.0, 1.0);
    col = mix(col, vec3(0.5, 0.68, 0.82), fres * 0.35);
    // Sun glints
    vec3 hv = normalize(sun + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(nrm, hv), 0.0), 220.0);
    col += vec3(1.0, 0.96, 0.86) * spec * 0.8;
    // Whitecaps on the highest crests
    float crest = smoothstep(0.45, 0.9, h / 8.0);
    float streak = smoothstep(0.62, 0.85, fbm(w * vec2(0.06, 0.11) - uTime * 0.12));
    col = mix(col, vec3(0.86, 0.92, 0.96), crest * streak * 0.4);
    gl_FragColor = vec4(col, 1.0);
}`;

// Full-screen WebGL ocean on its own canvas behind the 2D game canvas
function createWater(behind) {
    try {
        const c = document.createElement('canvas');
        c.className = 'sea';
        c.style.pointerEvents = 'none';
        behind.parentNode.insertBefore(c, behind);
        const gl = c.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        if (!gl) { c.remove(); return null; }
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, WATER_VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, WATER_FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        const u = n => gl.getUniformLocation(prog, n);
        const uni = { res: u('uRes'), cam: u('uCam'), zoom: u('uZoom'), time: u('uTime'), dpr: u('uDpr') };
        let lost = false;
        c.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
        return {
            canvas: c,
            get ok() { return !lost; },
            resize() {
                c.width = Math.round(vw * dpr);
                c.height = Math.round(vh * dpr);
                c.style.width = vw + 'px';
                c.style.height = vh + 'px';
            },
            draw() {
                if (lost) return;
                gl.viewport(0, 0, c.width, c.height);
                gl.useProgram(prog);
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
                gl.uniform2f(uni.res, c.width, c.height);
                gl.uniform2f(uni.cam, cam.x, cam.y);
                gl.uniform1f(uni.zoom, zoom);
                gl.uniform1f(uni.time, time);
                gl.uniform1f(uni.dpr, dpr);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };
    } catch (err) {
        console.warn('WebGL water disabled:', err);
        return null;
    }
}

// ---------- rendering ----------
function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gpuWater = water && water.ok;
    if (gpuWater) {
        water.draw();
        ctx.clearRect(0, 0, vw, vh);
    } else {
        ctx.fillStyle = '#0b3550';
        ctx.fillRect(0, 0, vw, vh);
    }

    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const hw = vw / 2 / zoom, hh = vh / 2 / zoom;
    const view = { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };

    if (!gpuWater) drawOcean(view);

    const visible = islandsNear(cam.x, cam.y, Math.max(hw, hh) + 400).filter(isl =>
        isl.x + isl.r * 1.8 > view.x0 && isl.x - isl.r * 1.8 < view.x1 && isl.y + isl.r * 1.8 > view.y0 && isl.y - isl.r * 1.8 < view.y1);
    runIslandJobs(Math.max(hw, hh) + 1600);
    for (const isl of visible) drawIsland(isl);
    evictIslandSprites();

    drawParticles(0);
    drawParticles(1);
    drawMines();
    drawTorpedoes();
    for (const e of enemies) drawShip(e);
    if (player) drawShip(player);
    drawShells();
    drawParticles(2);
    drawMissiles();
    drawBombs();
    drawJets();
    drawParticles(3);

    drawClouds(view);
    if (player && !player.dead && state === 'playing') drawAim();
    for (const e of enemies) drawHealthBar(e);

    ctx.restore();
    drawVignette();
    drawMinimap();
}

// Fills the view with a scrolled, scaled pattern
function fillPattern(img, ox, oy, scale, view, alpha, op = 'source-over') {
    const pat = ctx.createPattern(img, 'repeat');
    if (!pat) return;
    const size = img.width * scale;
    const mx = ((ox % size) + size) % size, my = ((oy % size) + size) % size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    // Snap to the tile grid so the pattern stays anchored in world space
    const sx = Math.floor((view.x0 - mx) / size) * size + mx, sy = Math.floor((view.y0 - my) / size) * size + my;
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, (view.x1 - sx) / scale + 1, (view.y1 - sy) / scale + 1);
    ctx.restore();
}

function drawOcean(view) {
    // Large swells, cross swells and fine glinting ripples
    fillPattern(tex.water, time * 6, time * 3, 3, view, 1);
    fillPattern(tex.water, -time * 5, time * 7, 1.7, view, 0.45);
    fillPattern(tex.ripple, time * 14, -time * 8, 0.9, view, 0.3);
    fillPattern(tex.ripple, -time * 10, time * 12, 0.6, view, 0.22);
}

function drawClouds(view) {
    // Drifting cloud shadows over everything on the water
    fillPattern(tex.cloud, time * 14, time * 9, 9, view, 0.4);
}

function drawVignette() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sun = ctx.createRadialGradient(vw * 0.15, vh * 0.1, 0, vw * 0.15, vh * 0.1, Math.max(vw, vh) * 0.8);
    sun.addColorStop(0, 'rgba(255,245,215,.10)');
    sun.addColorStop(1, 'rgba(255,245,215,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, vw, vh);
    const v = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,10,25,.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
}

// ---------- islands ----------
function islandPathOn(g, isl, scale, ox, oy) {
    g.beginPath();
    for (let k = 0; k <= 96; k++) {
        const a = k / 96 * 2 * Math.PI, r = coastRadius(isl, a) * scale;
        if (k === 0) g.moveTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
        else g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
    }
    g.closePath();
}

// Random point inside the island outline at given scale
function islandPoint(isl, scale) {
    const a = rand(0, 2 * Math.PI);
    const k = Math.floor(a / (2 * Math.PI) * isl.pts.length) % isl.pts.length;
    const d = Math.sqrt(Math.random()) * isl.pts[k] * scale;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

// Seeded value noise for island terrain
function hash2(ix, iy, sd) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(sd, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, sd) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, sd), b = hash2(ix + 1, iy, sd), c = hash2(ix, iy + 1, sd), d = hash2(ix + 1, iy + 1, sd);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function vfbm(x, y, sd, oct) {
    let v = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { v += a * vnoise(x, y, sd + i * 31); n += a; x *= 2.03; y *= 2.03; a *= 0.5; }
    return v / n;
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Coast radius at an angle, interpolated from the island outline points
// Smooth (Catmull-Rom) through the outline points, so the coast has no corners
function coastRadius(isl, a) {
    const P = isl.pts, n = P.length;
    const f = ((a / (2 * Math.PI)) % 1 + 1) % 1 * n;
    const i = Math.floor(f) % n, t = f - Math.floor(f);
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

// Aerial-photo style island: per-pixel heightmap with hillshade, beach, forest canopy, rock; palms on top
function* islandSpriteJob(isl) {
    const R = isl.r * 1.8;
    const res = quality.gpu ? 0.9 : 0.6;          // terrain pixels per world unit
    const N = Math.ceil(R * 2 * res);
    const sd = (Math.floor(isl.x * 13 + isl.y * 7) | 0) & 0xffff;
    const hills = isl.r > 110;

    // Pass 1: elevation (0 = coastline, 1 = island centre, < 0 = water)
    const H = new Float32Array(N * N), F = new Float32Array(N * N);
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const x = px / res - R, y = py / res - R;
            const d = Math.hypot(x, y), a = Math.atan2(y, x);
            const edge = d / coastRadius(isl, a);
            const n = vfbm(x * 0.018, y * 0.018, sd, 4);
            let h = 1 - edge + (n - 0.5) * 0.12 * Math.min(1, edge * 1.5);
            if (h > 0) h += (n - 0.5) * 0.5 * h + (hills ? Math.pow(Math.max(0, vfbm(x * 0.008, y * 0.008, sd + 7, 3) - 0.35), 1.5) * 1.6 * h : 0);
            H[py * N + px] = h;
            F[py * N + px] = vfbm(x * 0.03, y * 0.03, sd + 99, 3);   // forest mask
        }
        if (performance.now() > jobDeadline) yield;
    }

    // Pass 2: colour + hillshade
    const tc = makeCanvas(N, N), tg = tc.getContext('2d');
    const img = tg.createImageData(N, N), D = img.data;
    const SHALLOW = [70, 196, 190], SANDBED = [196, 205, 160], WET = [176, 156, 108], SAND = [232, 214, 165], SAND2 = [214, 190, 138];
    const GRASS = [120, 152, 72], GRASS2 = [96, 132, 58], FOREST = [42, 86, 38], FOREST2 = [62, 108, 46], ROCK = [128, 116, 98], ROCK2 = [160, 150, 132];
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const i = py * N + px, h = H[i];
            const o = i * 4;
            if (h < -0.4) { D[o + 3] = 0; continue; }
            const x = px / res - R, y = py / res - R;
            const grain = vnoise(x * 0.9, y * 0.9, sd + 5);
            let c, alpha = 255;
            if (h < 0) {
                // Lagoon: sandy bottom showing through, fading into deep water
                const t = (h + 0.4) / 0.4;
                c = mixc(SHALLOW, SANDBED, Math.pow(t, 3) * 0.55);
                alpha = Math.round(Math.pow(t, 1.4) * 215);
                const ripple = vnoise(x * 0.12, y * 0.12, sd + 3);
                c = mixc(c, [255, 255, 255], ripple * 0.06 * t);
                // Broken white water just off the beach
                const surf = Math.max(0, 1 - Math.abs(h + 0.025) / 0.025) * (0.4 + vnoise(x * 0.25, y * 0.25, sd + 41) * 0.6);
                c = mixc(c, [245, 250, 252], surf * 0.75);
                alpha = Math.max(alpha, Math.round(surf * 230));
            } else if (h < 0.035) {
                c = mixc(WET, SAND, h / 0.035);
            } else if (h < 0.17) {
                c = mixc(SAND, SAND2, grain * 0.5);
            } else {
                const f = F[i];
                const veg = smooth(0.17, 0.3, h + (f - 0.5) * 0.15);
                let land;
                if (f > 0.5 || h > 0.45) {
                    // Forest canopy: individual crowns with bright tops and dark gaps
                    const crown = vnoise(x * 0.32, y * 0.32, sd + 11);
                    const crown2 = vnoise(x * 0.75, y * 0.75, sd + 13);
                    land = mixc(FOREST, FOREST2, crown);
                    const gap = smooth(0.25, 0.05, crown * 0.7 + crown2 * 0.3);
                    land = mixc(land, [22, 48, 24], gap * 0.7);
                    land = mixc(land, [118, 160, 80], Math.max(0, crown2 - 0.7) * 0.8);
                } else {
                    land = mixc(GRASS, GRASS2, vnoise(x * 0.08, y * 0.08, sd + 17));
                    land = mixc(land, [150, 160, 95], grain * 0.25);
                }
                if (hills && h > 0.75) {
                    const rk = smooth(0.75, 1.1, h + (vnoise(x * 0.05, y * 0.05, sd + 23) - 0.5) * 0.4);
                    land = mixc(land, mixc(ROCK, ROCK2, grain), rk * 0.85);
                }
                c = mixc(mixc(SAND, SAND2, grain * 0.5), land, veg);
            }
            // Hillshade: light from the top-left
            if (h > -0.05) {
                const hx = H[i + (px < N - 1 ? 1 : 0)] - H[i - (px > 0 ? 1 : 0)];
                const hy = H[i + (py < N - 1 ? N : 0)] - H[i - (py > 0 ? N : 0)];
                const shadeK = clamp(1 + (hx * 0.6 + hy * 0.8) * -9 / res, 0.6, 1.35);
                c = [c[0] * shadeK, c[1] * shadeK, c[2] * shadeK];
            }
            D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = alpha;
        }
        if (performance.now() > jobDeadline) yield;
    }
    tg.putImageData(img, 0, 0);

    // Final sprite at display resolution
    const S = spriteScale * 0.75;
    const c = makeCanvas(R * 2 * S, R * 2 * S);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(tc, 0, 0, c.width, c.height);
    g.scale(S, S);
    g.translate(R, R);

    // Shore rocks: irregular boulders with shadow
    for (const r of isl.rocks) {
        const pts = [];
        for (let k = 0; k < 7; k++) pts.push(r.r * rand(0.65, 1));
        const poly = (ox, oy) => {
            g.beginPath();
            for (let k = 0; k < 7; k++) {
                const a = k / 7 * 2 * Math.PI;
                g.lineTo(r.x + ox + Math.cos(a) * pts[k], r.y + oy + Math.sin(a) * pts[k] * 0.8);
            }
            g.closePath();
        };
        poly(r.r * 0.35, r.r * 0.45);
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.fill();
        poly(0, 0);
        const rock = g.createRadialGradient(r.x - r.r * 0.35, r.y - r.r * 0.35, 0, r.x, r.y, r.r);
        rock.addColorStop(0, '#b0aaa0');
        rock.addColorStop(1, '#5a554f');
        g.fillStyle = rock;
        g.fill();
    }

    // Palm trees along the beach and the forest edge
    const palms = [];
    for (let k = 0, tries = 0; k < Math.round(isl.r / 7) && tries < 600; tries++) {
        const a = rand(0, 2 * Math.PI), d = coastRadius(isl, a) * rand(0.62, 0.9);
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        const px = Math.floor((x + R) * res), py = Math.floor((y + R) * res);
        const h = H[clamp(py, 0, N - 1) * N + clamp(px, 0, N - 1)];
        if (h < 0.06 || h > 0.4) continue;
        palms.push({ x, y, s: rand(0.8, 1.25), rot: rand(0, 6.28), n: 6 + Math.floor(rand(0, 3)) });
        k++;
    }
    const frondPath = (len, w) => {
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.5, -w, len, w * 0.35);
        g.quadraticCurveTo(len * 0.5, w * 0.5, 0, 0);
        g.closePath();
    };
    // Shadows first so no palm shades another palm's crown
    for (const p of palms) {
        g.save();
        g.translate(p.x + SUN.x * 7 * p.s, p.y + SUN.y * 7 * p.s);
        g.rotate(p.rot);
        g.fillStyle = 'rgba(0,20,0,.28)';
        for (let k = 0; k < p.n; k++) {
            g.rotate(2 * Math.PI / p.n);
            frondPath(9 * p.s, 2.6 * p.s);
            g.fill();
        }
        g.restore();
    }
    for (const p of palms) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        for (let k = 0; k < p.n; k++) {
            g.rotate(2 * Math.PI / p.n + rand(-0.15, 0.15));
            const len = 9 * p.s * rand(0.85, 1.1);
            const fg = g.createLinearGradient(0, 0, len, 0);
            fg.addColorStop(0, '#2f5e22');
            fg.addColorStop(0.5, '#4f8a33');
            fg.addColorStop(1, '#6d9e40');
            frondPath(len, 2.6 * p.s);
            g.fillStyle = fg;
            g.fill();
            // Midrib
            g.strokeStyle = 'rgba(200,210,120,.35)';
            g.lineWidth = 0.35;
            g.beginPath();
            g.moveTo(0, 0);
            g.quadraticCurveTo(len * 0.5, -0.6 * p.s, len, 0.9 * p.s);
            g.stroke();
        }
        g.fillStyle = '#5a4128';
        g.beginPath();
        g.arc(0, 0, 1.1 * p.s, 0, 2 * Math.PI);
        g.fill();
        g.restore();
    }
    return { canvas: c, R };
}

// Frees sprites of islands far outside the view
function evictIslandSprites() {
    for (const isl of spritedIslands) {
        if (Math.hypot(isl.x - cam.x, isl.y - cam.y) > 3500) {
            isl.sprite = null;
            spritedIslands.delete(isl);
        }
    }
    for (const isl of islandJobs.keys())
        if (Math.hypot(isl.x - cam.x, isl.y - cam.y) > 3500) islandJobs.delete(isl);
}

// Builds island sprites in the background: a few ms per frame, nearest first, ahead of the view
const islandJobs = new Map();
let jobDeadline = 0;
function runIslandJobs(radius) {
    for (const isl of islandsNear(cam.x, cam.y, radius))
        if (!isl.sprite && !islandJobs.has(isl)) islandJobs.set(isl, islandSpriteJob(isl));
    if (!islandJobs.size) return;
    jobDeadline = performance.now() + 5;
    const order = [...islandJobs.keys()].sort((a, b) => Math.hypot(a.x - cam.x, a.y - cam.y) - Math.hypot(b.x - cam.x, b.y - cam.y));
    for (const isl of order) {
        if (performance.now() > jobDeadline) break;
        const r = islandJobs.get(isl).next();
        if (r.done) {
            isl.sprite = r.value;
            spritedIslands.add(isl);
            islandJobs.delete(isl);
        }
    }
}

function drawIsland(isl) {
    const sp = isl.sprite;
    if (sp) ctx.drawImage(sp.canvas, isl.x - sp.R, isl.y - sp.R, sp.R * 2, sp.R * 2);
    else {
        // Simple stand-in while the detailed sprite is still being built
        islandPathOn(ctx, isl, 1, isl.x, isl.y);
        ctx.fillStyle = '#dcc690';
        ctx.fill();
        islandPathOn(ctx, isl, 0.78, isl.x, isl.y);
        ctx.fillStyle = '#4c7d36';
        ctx.fill();
    }
    // Swell rolling in toward the beach, fading as it breaks
    for (let k = 0; k < 2; k++) {
        const u = ((time * 0.12 + isl.phase / 6.28 + k * 0.5) % 1 + 1) % 1;
        const sc = 1.14 - 0.11 * u;
        islandPathOn(ctx, isl, sc, isl.x, isl.y);
        ctx.strokeStyle = `rgba(240,248,255,${0.32 * Math.sin(u * Math.PI)})`;
        ctx.lineWidth = 2 + u * 2;
        ctx.stroke();
    }
}

// ---------- ships ----------
// bow = x-fraction where the bow taper starts (lower = sharper)
function hullPath(L, W, bow = 0.15) {
    const t = L * bow, c = (L / 2 + t) / 2;
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.quadraticCurveTo(c, -W / 2, t, -W / 2);
    ctx.lineTo(-L * 0.42, -W / 2);
    ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2, -W * 0.3);
    ctx.lineTo(-L / 2, W * 0.3);
    ctx.quadraticCurveTo(-L / 2, W / 2, -L * 0.42, W / 2);
    ctx.lineTo(t, W / 2);
    ctx.quadraticCurveTo(c, W / 2, L / 2, 0);
    ctx.closePath();
}

function funnel(x, y, rx, ry, color = '#2e3236') {
    const g = ctx.createRadialGradient(x - rx * 0.4, y - ry * 0.4, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, shade(color.startsWith('#') ? color : '#2e3236', 1.8));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, 2 * Math.PI);
    ctx.fill();
}

function block(x, y, w, h, color, r = 2) {
    // Superstructure with lit top-left and shaded bottom-right edges
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2 + 1.2, y - h / 2 + 1.6, w, h, r);
    ctx.fill();
    const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    g.addColorStop(0, shade(color, 1.18));
    g.addColorStop(1, shade(color, 0.82));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Bridge windows
    if (w > 6 && h > 6) {
        ctx.fillStyle = 'rgba(20,35,50,.8)';
        ctx.fillRect(x + w / 2 - 1.8, y - h / 2 + 1.5, 1.2, h - 3);
    }
}

// Deck markings for special equipment
function drawSpecialGear(special, L, W) {
    switch (special) {
        case 'torpedo':
            // Torpedo tubes on both sides
            for (const y of [-0.36, 0.36]) {
                block(0, W * y, L * 0.17, 4, '#3a3f44', 1.5);
                block(0, W * y - 5 * Math.sign(y), L * 0.17, 4, '#3a3f44', 1.5);
            }
            break;
        case 'mines':
            // Mine rails at the stern
            ctx.strokeStyle = '#1c1f22';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-L * 0.28, -W * 0.3); ctx.lineTo(-L * 0.48, -W * 0.3);
            ctx.moveTo(-L * 0.28, W * 0.3); ctx.lineTo(-L * 0.48, W * 0.3);
            ctx.stroke();
            for (const x of [-0.32, -0.39, -0.46])
                for (const y of [-0.3, 0.3]) {
                    const g = ctx.createRadialGradient(L * x - 1, W * y - 1, 0, L * x, W * y, 3.2);
                    g.addColorStop(0, '#5a5a5a');
                    g.addColorStop(1, '#151515');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(L * x, W * y, 3.2, 0, 2 * Math.PI);
                    ctx.fill();
                }
            break;
        case 'missile':
            // Vertical launch cells fore and aft of the bridge
            for (const cx of [0.08, -0.12]) {
                for (let i = 0; i < 3; i++)
                    for (let j = 0; j < 2; j++) {
                        const x = L * cx + (i - 1) * 4.2, y = (j - 0.5) * 4.6 + W * 0.3 * (cx > 0 ? -1 : 1);
                        ctx.fillStyle = '#2c3034';
                        ctx.fillRect(x - 1.8, y - 1.8, 3.6, 3.6);
                        ctx.fillStyle = 'rgba(255,255,255,.18)';
                        ctx.fillRect(x - 1.8, y - 1.8, 3.6, 0.8);
                    }
            }
            break;
        case 'overdrive':
            // Hazard trim
            ctx.strokeStyle = 'rgba(255,190,40,.7)';
            ctx.lineWidth = 1.5;
            hullPath(L * 0.9, W * 0.82, 0.12);
            ctx.stroke();
            break;
        case 'smoke':
            // Smoke generators at the stern
            for (const y of [-0.25, 0.25]) funnel(-L * 0.44, W * y, W * 0.1, W * 0.1, '#7d8389');
            break;
    }
}

// Deck details per ship style (ship-local coords, +x = bow)
function drawDetails(style, L, W, bow) {
    switch (style) {
        case 'jager': {
            // Dazzle camouflage clipped to the hull
            ctx.save();
            hullPath(L, W, bow);
            ctx.clip();
            ctx.fillStyle = 'rgba(25,35,30,.35)';
            for (let k = -3; k <= 3; k++) {
                ctx.beginPath();
                ctx.moveTo(k * L * 0.14, -W);
                ctx.lineTo(k * L * 0.14 + L * 0.06, -W);
                ctx.lineTo(k * L * 0.14 - L * 0.02, W);
                ctx.lineTo(k * L * 0.14 - L * 0.08, W);
                ctx.fill();
            }
            ctx.restore();
            block(L * 0.06, 0, L * 0.08, W * 0.44, '#a9b6ad');
            funnel(-L * 0.03, 0, W * 0.13, W * 0.11);
            funnel(-L * 0.09, 0, W * 0.13, W * 0.11);
            break;
        }
        case 'kruiser': {
            block(L * 0.04, 0, L * 0.11, W * 0.52, '#aab4c8');
            block(L * 0.05, 0, L * 0.05, W * 0.3, '#d0d7e4');
            funnel(-L * 0.05, 0, W * 0.14, W * 0.12);
            funnel(-L * 0.1, 0, W * 0.14, W * 0.12);
            // Mast and yardarm
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(L * 0.09, 0); ctx.lineTo(-L * 0.12, 0);
            ctx.moveTo(L * 0.02, -W * 0.35); ctx.lineTo(L * 0.02, W * 0.35);
            ctx.stroke();
            ctx.strokeStyle = '#e8eef8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(L * 0.02, 0, W * 0.12, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
            break;
        }
        case 'zwaar': {
            block(-L * 0.01, 0, L * 0.2, W * 0.58, '#b8a690', 3);
            block(L * 0.05, 0, L * 0.05, W * 0.36, '#d8c8b0');
            funnel(-L * 0.02, 0, W * 0.12, W * 0.1);
            funnel(-L * 0.06, 0, W * 0.12, W * 0.1);
            funnel(-L * 0.1, 0, W * 0.12, W * 0.1);
            // Secondary guns along the sides
            for (const x of [0.22, 0.06, -0.08, -0.24]) {
                for (const y of [-0.38, 0.38]) {
                    const g = ctx.createRadialGradient(L * x - 1, W * y - 1, 0, L * x, W * y, W * 0.07);
                    g.addColorStop(0, '#8a7a6a');
                    g.addColorStop(1, '#3e3226');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(L * x, W * y, W * 0.07, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
            break;
        }
        case 'titan': {
            // Teak deck planks
            ctx.save();
            hullPath(L * 0.88, W * 0.8, bow);
            ctx.clip();
            ctx.fillStyle = '#a58a62';
            ctx.fillRect(-L / 2, -W / 2, L, W);
            ctx.strokeStyle = 'rgba(60,40,20,.35)';
            ctx.lineWidth = 0.6;
            for (let y = -W * 0.4; y <= W * 0.4; y += 2.2) {
                ctx.beginPath();
                ctx.moveTo(-L / 2, y); ctx.lineTo(L / 2, y);
                ctx.stroke();
            }
            ctx.restore();
            // Gold trim along the hull
            hullPath(L * 0.95, W * 0.9, bow);
            ctx.strokeStyle = 'rgba(210,175,80,.7)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            block(-L * 0.01, 0, L * 0.22, W * 0.62, '#7c848b', 4);
            block(L * 0.05, 0, L * 0.07, W * 0.42, '#a3abb2', 3);
            block(L * 0.06, 0, L * 0.03, W * 0.22, '#c7ced4', 2);
            funnel(-L * 0.05, 0, W * 0.16, W * 0.12, '#25292c');
            funnel(-L * 0.09, 0, W * 0.14, W * 0.11, '#25292c');
            // Anti-air guns
            ctx.fillStyle = '#2a2e32';
            for (let k = 0; k < 6; k++) {
                const x = L * (0.1 - k * 0.04);
                ctx.fillRect(x - 2, -W * 0.42, 4, 4);
                ctx.fillRect(x - 2, W * 0.42 - 4, 4, 4);
            }
            // Flag at the stern
            ctx.fillStyle = '#ae2828';
            ctx.fillRect(-L * 0.49, -W * 0.08, L * 0.04, W * 0.06);
            ctx.fillStyle = '#eee';
            ctx.fillRect(-L * 0.49, -W * 0.02, L * 0.04, W * 0.06);
            ctx.fillStyle = '#1d4a94';
            ctx.fillRect(-L * 0.49, W * 0.04, L * 0.04, W * 0.06);
            break;
        }
        case 'carrier': {
            ctx.save();
            hullPath(L * 0.92, W * 0.8, bow);
            ctx.clip();
            // Non-skid flight deck
            ctx.fillStyle = '#4c5257';
            ctx.fillRect(-L / 2, -W / 2, L, W);
            for (let k = 0; k < L * W / 6; k++) {
                ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.05)';
                ctx.fillRect(rand(-L / 2, L / 2), rand(-W / 2, W / 2), rand(0.6, 2.5), rand(0.4, 1.2));
            }
            // Angled landing deck edges
            const ax = -L * 0.46, ay = W * 0.12, bx = L * 0.12, by = -W * 0.38;
            ctx.strokeStyle = 'rgba(255,255,255,.75)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(ax, ay - W * 0.14); ctx.lineTo(bx, by - W * 0.14);
            ctx.moveTo(ax, ay + W * 0.14); ctx.lineTo(bx, by + W * 0.14);
            ctx.stroke();
            // Landing centreline and catapult tracks
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
            ctx.moveTo(L * 0.12, -W * 0.12); ctx.lineTo(L * 0.46, -W * 0.12);
            ctx.moveTo(L * 0.05, W * 0.06); ctx.lineTo(L * 0.43, W * 0.06);
            ctx.stroke();
            ctx.setLineDash([]);
            // Arresting wires
            ctx.strokeStyle = 'rgba(20,20,20,.7)';
            for (let k = 0; k < 4; k++) {
                const t = 0.08 + k * 0.05;
                const cx = lerp(ax, bx, t), cy = lerp(ay, by, t);
                ctx.beginPath();
                ctx.moveTo(cx - W * 0.08, cy - W * 0.12); ctx.lineTo(cx + W * 0.08, cy + W * 0.12);
                ctx.stroke();
            }
            // Edge safety line and deck number
            ctx.strokeStyle = 'rgba(240,200,60,.7)';
            ctx.lineWidth = 0.8;
            hullPath(L * 0.88, W * 0.74, bow);
            ctx.stroke();
            ctx.save();
            ctx.translate(L * 0.36, W * 0.24);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.font = `bold ${W * 0.2}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('77', 0, W * 0.07);
            ctx.restore();
            // Aircraft elevators
            ctx.fillStyle = 'rgba(255,255,255,.07)';
            ctx.fillRect(-L * 0.1, -W * 0.4, L * 0.07, W * 0.14);
            ctx.fillRect(L * 0.18, W * 0.27, L * 0.07, W * 0.13);
            ctx.restore();
            // Island superstructure on the starboard side
            block(-L * 0.02, W * 0.33, L * 0.17, W * 0.15, '#868d94', 2);
            block(L * 0.01, W * 0.33, L * 0.06, W * 0.1, '#a9b0b6', 1.5);
            funnel(-L * 0.05, W * 0.33, W * 0.05, W * 0.045);
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(L * 0.02, W * 0.26); ctx.lineTo(L * 0.02, W * 0.41);
            ctx.stroke();
            break;
        }
        default: {
            // Fregat style
            block(-L * 0.01, 0, L * 0.15, W * 0.52, '#8a8f94', 1.5);
            funnel(-L * 0.03, 0, W * 0.16, W * 0.16);
            break;
        }
    }
}

// Pre-renders hull, deck and superstructure into a cached sprite
function buildShipSprite(st) {
    const L = st.length, W = st.width, bow = st.bow ?? 0.15, pad = 6, S = spriteScale;
    const c = makeCanvas((L + pad * 2) * S, (W + pad * 2) * S);
    const main = ctx;
    ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.translate(L / 2 + pad, W / 2 + pad);

    // Hull sides: rounded shading across the beam
    hullPath(L, W, bow);
    const side = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
    side.addColorStop(0, shade(st.hull, 1.25));
    side.addColorStop(0.5, shade(st.hull, 1.0));
    side.addColorStop(1, shade(st.hull, 0.6));
    ctx.fillStyle = side;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();

    // Deck plating
    hullPath(L * 0.92, W * 0.8, bow);
    const deck = ctx.createLinearGradient(-L / 2, -W / 2, L / 2, W / 2);
    deck.addColorStop(0, shade(st.deck, 1.12));
    deck.addColorStop(1, shade(st.deck, 0.85));
    ctx.fillStyle = deck;
    ctx.fill();
    ctx.save();
    hullPath(L * 0.92, W * 0.8, bow);
    ctx.clip();
    // Panel seams and grime
    ctx.strokeStyle = 'rgba(0,0,0,.14)';
    ctx.lineWidth = 0.5;
    for (let x = -L / 2; x < L / 2; x += L * 0.06) {
        ctx.beginPath();
        ctx.moveTo(x, -W / 2); ctx.lineTo(x, W / 2);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0);
    ctx.stroke();
    for (let k = 0; k < L * W / 12; k++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)';
        ctx.fillRect(rand(-L / 2, L / 2), rand(-W / 2, W / 2), rand(0.5, 2), rand(0.5, 1.2));
    }
    ctx.restore();
    // Deck edge highlight (sunlit gunwale)
    hullPath(L * 0.96, W * 0.88, bow);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Anchors and bollards at the bow
    ctx.fillStyle = '#1b1d1f';
    for (const y of [-0.22, 0.22]) {
        ctx.beginPath();
        ctx.arc(L * 0.4, W * y, 1.3, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,30,30,.7)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(L * 0.4, -W * 0.22); ctx.lineTo(L * 0.3, -W * 0.05);
    ctx.moveTo(L * 0.4, W * 0.22); ctx.lineTo(L * 0.3, W * 0.05);
    ctx.stroke();

    drawDetails(st.style, L, W, bow);
    drawSpecialGear(st.special, L, W);

    ctx = main;
    return { canvas: c, w: L + pad * 2, h: W + pad * 2 };
}

function shipSprite(st) {
    const key = `${st.style}|${st.hull}|${st.deck}|${st.length}|${st.width}|${st.bow}|${st.special || ''}`;
    let sp = shipSprites.get(key);
    if (!sp) {
        sp = buildShipSprite(st);
        shipSprites.set(key, sp);
    }
    return sp;
}

function setShadow(blur, dist) {
    if (!quality.shadows) return;   // blurred shadows are costly without a GPU
    // Shadow offsets ignore the transform, so they stay in screen space
    const k = zoom * dpr;
    ctx.shadowColor = 'rgba(0,10,20,.55)';
    ctx.shadowBlur = blur * k;
    ctx.shadowOffsetX = SUN.x * dist * k;
    ctx.shadowOffsetY = SUN.y * dist * k;
}

function clearShadow() {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

function drawShip(s, shadowScale = 1) {
    const st = s.st, L = st.length, W = st.width, bow = st.bow ?? 0.15;
    const sp = shipSprite(st);
    const frac = clamp(Math.abs(s.speed) / st.speed, 0, 1);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    if (s.dead) {
        ctx.globalAlpha = clamp(1 - s.sink / 3.5, 0, 1);
        ctx.scale(1 - s.sink * 0.04, 1 - s.sink * 0.06);
    }

    // Soft foam glow along the waterline (blurred via shadow)
    if (!s.dead && quality.shadows) {
        const k = zoom * dpr;
        ctx.shadowColor = `rgba(235,245,255,${0.35 + frac * 0.45})`;
        ctx.shadowBlur = (5 + frac * 7) * k;
        hullPath(L * 1.01, W * 1.04, bow);
        ctx.fillStyle = `rgba(235,245,255,${0.15 + frac * 0.2})`;
        ctx.fill();
        clearShadow();
    }

    // Hull sprite with sun shadow
    setShadow(8 * shadowScale, 7 * shadowScale);
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    clearShadow();

    // Parked jets for previews; in play the jets are drawn individually
    if (st.jets && s !== player && !s.dead) {
        for (let i = 0; i < st.jets; i++) {
            const p = spotPose(st, i);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            setShadow(2, 2);
            drawJetBody(0.7, false);
            clearShadow();
            ctx.restore();
        }
    }

    // Live animated radar on cruisers
    if (st.style === 'kruiser' && !s.dead) {
        ctx.strokeStyle = 'rgba(235,240,250,.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(L * 0.02, 0, W * 0.12, time * 3 - Math.PI / 2, time * 3 + Math.PI / 2);
        ctx.stroke();
    }
    // Scorch damage
    const hurt = 1 - s.hp / s.maxHp;
    if (hurt > 0.2 || s.dead) {
        hullPath(L * 0.9, W * 0.78, bow);
        ctx.fillStyle = `rgba(15,10,5,${s.dead ? 0.55 : hurt * 0.3})`;
        ctx.fill();
    }
    ctx.restore();

    // Turrets
    const n = st.barrels || 2;
    for (const t of s.turrets) {
        const p = turretPos(s, t);
        const TW = turretWidth(st), R = TW * 0.26;
        ctx.save();
        if (s.dead) ctx.globalAlpha = clamp(1 - s.sink / 3.5, 0, 1);
        ctx.translate(p.x, p.y);
        ctx.rotate(s.heading + t.rel);
        setShadow(3 * shadowScale, 3 * shadowScale);
        const len = TW * 0.78 - t.recoil * TW * 0.22;
        const bw = Math.max(1.6, TW * 0.065);
        for (let b = 0; b < n; b++) {
            const y = (b - (n - 1) / 2) * TW * 0.13;
            const g = ctx.createLinearGradient(0, y - bw / 2, 0, y + bw / 2);
            g.addColorStop(0, '#5a6066');
            g.addColorStop(0.5, '#2a2e32');
            g.addColorStop(1, '#151719');
            ctx.fillStyle = g;
            ctx.fillRect(R * 0.4, y - bw / 2, len - R * 0.4, bw);
            ctx.fillStyle = '#0d0e0f';
            ctx.fillRect(len - 1.2, y - bw / 2, 1.2, bw);
        }
        // Armoured gun house: flat front, rounded back
        const dome = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 0, 0, 0, R * 1.2);
        dome.addColorStop(0, shade(st.turret, 1.55));
        dome.addColorStop(0.6, shade(st.turret, 1.0));
        dome.addColorStop(1, shade(st.turret, 0.6));
        ctx.fillStyle = dome;
        ctx.beginPath();
        ctx.moveTo(R * 0.75, -R * 0.75);
        ctx.lineTo(R * 0.75, R * 0.75);
        ctx.arc(0, 0, R * 1.06, Math.PI * 0.25, Math.PI * 1.75);
        ctx.closePath();
        ctx.fill();
        clearShadow();
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Rangefinder and hatch
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(-R * 0.55, -R * 0.95, R * 0.25, R * 1.9);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.beginPath();
        ctx.arc(-R * 0.1, -R * 0.35, R * 0.18, 0, 2 * Math.PI);
        ctx.fill();
        // Reload ring for the player
        if (!s.enemy && !s.dead && t.reload > 0) {
            ctx.strokeStyle = 'rgba(255,215,90,.85)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(0, 0, R * 1.35, 0, 2 * Math.PI * (1 - t.reload / st.reload));
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawHealthBar(s) {
    if (s.dead) return;
    const bw = 60, bx = s.x - bw / 2, by = s.y - s.st.length * 0.55 - 14;
    const f = s.hp / s.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath();
    ctx.roundRect(bx - 1, by - 1, bw + 2, 7, 3);
    ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#e0603a' : f > 0.25 ? '#e0402a' : '#c02020';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw * f, 5, 2.5);
    ctx.fill();
}

function drawTorpedoes() {
    for (const sh of shells) {
        if (!sh.torp) continue;
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(Math.atan2(sh.dy, sh.dx));
        // Submerged: dark, slightly blurred silhouette
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#1a2a33';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 2.4, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }
}

function drawShells() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of shells) {
        if (sh.torp) continue;
        if (sh.mg) {
            ctx.strokeStyle = sh.enemy ? 'rgba(255,120,80,.9)' : 'rgba(255,235,150,.9)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sh.x - sh.dx * 12, sh.y - sh.dy * 12);
            ctx.lineTo(sh.x, sh.y);
            ctx.stroke();
            continue;
        }
        const tail = 22;
        const g = ctx.createLinearGradient(sh.x - sh.dx * tail, sh.y - sh.dy * tail, sh.x, sh.y);
        g.addColorStop(0, 'rgba(255,140,40,0)');
        g.addColorStop(1, sh.enemy ? 'rgba(255,110,70,.95)' : 'rgba(255,220,140,.95)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(sh.x - sh.dx * tail, sh.y - sh.dy * tail);
        ctx.lineTo(sh.x, sh.y);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(tex.soft.flash, sh.x - 5, sh.y - 5, 10, 10);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

function drawMines() {
    for (const m of mines) {
        const bob = 1 + Math.sin(time * 2 + m.bob) * 0.06;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.scale(bob, bob);
        // Ripple ring around the floating mine
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 13 + Math.sin(time * 2 + m.bob) * 1.5, 0, 2 * Math.PI);
        ctx.stroke();
        setShadow(3, 3);
        const g = ctx.createRadialGradient(-2.5, -2.5, 0, 0, 0, 8);
        g.addColorStop(0, '#6a6e72');
        g.addColorStop(1, '#151719');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, 2 * Math.PI);
        ctx.fill();
        clearShadow();
        ctx.strokeStyle = '#26292c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3;
            ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
            ctx.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5);
        }
        ctx.stroke();
        // Blinking light once armed
        if (m.arm <= 0 && Math.sin(time * 8) > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(tex.soft.fire, -6, -6, 12, 12);
        }
        ctx.restore();
    }
}

function drawParticles(layer) {
    const additive = layer === 1 || layer === 3;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
        if (p.layer !== layer) continue;
        const t = p.life / p.max;
        let a = p.alpha * (1 - t);
        if (p.kind === 'smoke' || p.kind === 'steam') a = p.alpha * Math.min(1, p.life / 0.15) * (1 - t) * (1 - t * 0.3);
        if (a <= 0.003) continue;
        ctx.globalAlpha = a;
        if (p.kind === 'ring') {
            ctx.strokeStyle = 'rgba(255,255,255,1)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (p.kind === 'debris') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
            ctx.restore();
        } else {
            const img = tex.soft[p.kind] || tex.soft.foam;
            ctx.drawImage(img, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
    }
    ctx.restore();
}

function drawAim() {
    const st = player.st;
    // Range circle
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(player.x, player.y, st.range, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair: green when a loaded turret is on target
    const ready = player.turrets.some(t => t.reload === 0 && t.err <= 2 * DEG && !t.blocked);
    const inRange = Math.hypot(mouse.x - player.x, mouse.y - player.y) <= st.range;
    ctx.strokeStyle = !inRange ? 'rgba(255,150,60,.9)' : ready ? 'rgba(90,255,120,.9)' : 'rgba(255,255,255,.8)';
    ctx.lineWidth = 2 / zoom;
    const r = 14 / zoom;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, r, 0, 2 * Math.PI);
    ctx.moveTo(mouse.x - r * 1.6, mouse.y); ctx.lineTo(mouse.x - r * 0.5, mouse.y);
    ctx.moveTo(mouse.x + r * 0.5, mouse.y); ctx.lineTo(mouse.x + r * 1.6, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - r * 1.6); ctx.lineTo(mouse.x, mouse.y - r * 0.5);
    ctx.moveTo(mouse.x, mouse.y + r * 0.5); ctx.lineTo(mouse.x, mouse.y + r * 1.6);
    ctx.stroke();
}

function drawMinimap() {
    // Centered on the camera; the ocean has no edge
    const size = mini.width, k = size / (MINI_RANGE * 2);
    const ox = cam.x - MINI_RANGE, oy = cam.y - MINI_RANGE;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = 'rgba(12,50,80,.85)';
    mctx.fillRect(0, 0, size, size);
    mctx.fillStyle = '#d8c48a';
    for (const isl of islandsNear(cam.x, cam.y, MINI_RANGE + 300)) {
        mctx.beginPath();
        mctx.arc((isl.x - ox) * k, (isl.y - oy) * k, Math.max(1.5, isl.r * k), 0, 2 * Math.PI);
        mctx.fill();
    }
    mctx.fillStyle = '#ff5a4a';
    for (const e of enemies) {
        if (e.dead) continue;
        const x = clamp((e.x - ox) * k, 2, size - 2), y = clamp((e.y - oy) * k, 2, size - 2);
        mctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (player && !player.dead) {
        mctx.fillStyle = '#fff';
        mctx.beginPath();
        mctx.arc((player.x - ox) * k, (player.y - oy) * k, 3, 0, 2 * Math.PI);
        mctx.fill();
    }
    // Visible area
    const hw = vw / 2 / zoom * k, hh = vh / 2 / zoom * k;
    mctx.strokeStyle = 'rgba(255,255,255,.5)';
    mctx.lineWidth = 1;
    mctx.strokeRect(size / 2 - hw, size / 2 - hh, hw * 2, hh * 2);
}
