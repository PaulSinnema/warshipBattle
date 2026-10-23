// Warship Battle - top-down naval combat on an endless 2D ocean
const DEG = Math.PI / 180;
const CHUNK = 9000;           // island generation cell size
const ISLAND_CHANCE = 0.8;    // chance a chunk holds an island
const ISLAND_ASPECT = [1.8, 3.2];  // length / width range of islands
const ISLAND_BASE_MAX_R = 2400;    // radius of a round island with the same area
const HOVER = { land: 0.35 };  // hovercraft: speed factor on land
const ISLAND_MIN_R = 500;     // smallest equal-area radius
const ISLAND_MAX_R = Math.ceil(ISLAND_BASE_MAX_R * Math.sqrt(ISLAND_ASPECT[1]));   // largest coast radius (search range)
const MINI_RANGE = 3000;      // minimum half-width of the radar map view
const DESPAWN_DIST = 6000;    // enemies further away are removed
const RANGE_FACTOR = 2.5;     // gun range multiplier (realistic long-range gunnery)
const MG_RANGE_FACTOR = 1.5;  // machine guns stay short-ranged
const SHELL_FACTOR = 1.6;     // shell speed multiplier so long shots still arrive
const RADAR_RPM = 2.6;        // radar antenna rotation (rad/s)
// Ships fitted with a search radar (radar map + rotating antenna)
const RADAR_SHIPS = new Set(['fregat', 'jager', 'kruiser', 'horzel', 'valk', 'zwaar', 'orka', 'arend', 'titan', 'schim', 'furie', 'zeus', 'poseidon', 'leviathan',
    'zeeslang', 'bever', 'kraken', 'vulkaan', 'ragnarok', 'schildpad', 'bastion', 'bliksem', 'tempest', 'ooievaar', 'feniks', 'hydra', 'storm', 'tornado']);
let maxParticles = 2500;     // set by the quality level
const REPAIR_TIME = 6;        // seconds of damage control
const REPAIR_FRACTION = 0.3;  // part of max HP restored per repair
const REPAIR_COOLDOWN = 40;   // seconds before next damage control
const SPAWN_DELAY = 2.5;      // seconds between enemy reinforcements
const SPAWN_MIN = 900;        // enemies never appear closer than this
const SPAWN_MAX = 3200;       // ...or further than this
const ENEMY_MIN = 1, ENEMY_MAX = 4;   // number of enemy ships alive at once
const MAX_ATTACKERS = 2;      // enemies allowed to attack at the same time
const SPAWN_SPREAD = 45;      // reinforcements arrive within ± this many degrees of one direction
const MG_MAG = 20;            // machine gun rounds per belt
const MG_RELOAD = 3;          // seconds to load a new belt
const TORPEDO = { speed: 170, range: 1400, damage: 90, spread: 6 };
const MINE = { damage: 80, arm: 1.5, life: 90, max: 15 };
const MISSILE = { speed0: 60, maxSpeed: 420, accel: 260, turn: 3.2, life: 16, damage: 70, seek: 4500, boost: 0.35 };
// Carrier fighter jets: fly out, drop one bomb, return to rearm
const JET = { speed: 300, accel: 120, turn: 2.2, bombs: 5, dropDist: 75, bombFall: 0.9,
    launchInterval: 15, sortieCooldown: 60, catHold: 1.2, catAccel: 260, approachDist: 450, landSpeed: 150, trapDecel: 260,
    taxiSpeed: 32, taxiTurn: 2.5, holdRadius: 560 };
const OVERDRIVE = { time: 6, factor: 2.5 };
const SMOKE = { time: 8, seeDist: 300 };
// New specials
const SEEKMINE = { range: 420, speed: 55, life: 120 };          // homing mines drift towards enemies
const BARRAGE = { speed: 700, damage: 22, scatter: 140, interval: 0.07 };  // unguided rocket salvo
const SHIELD = { time: 8, reduce: 0.7 };                         // active armour: damage reduction
const EMP = { radius: 1400, stun: 6 };                           // disables enemy engines and guns
const HEAL = { time: 8, fraction: 0.45 };                        // repair crews: part of max HP over time
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
// Enemy classes; reload is deliberately long. w = spawn weight, torp = torpedoes per salvo,
// weapon 'mg' = machine guns, hover = hovercraft (crosses land)
const ENEMY_TYPES = [
    // Small craft
    { w: 10, name: 'Patrouille', hp: 50, speed: 85, accel: 22, turn: 40, turretTurn: 30, reload: 5.0, damage: 8, shellSpeed: 420, range: 560, spread: 1.6, length: 85, width: 20, turrets: 2, barrels: 1, bow: -0.05, style: 'jager', hull: '#5a3a34', deck: '#7d625a', turret: '#4a3430' },
    { w: 6, name: 'MG-boot', hp: 40, speed: 120, accel: 35, turn: 55, turretTurn: 90, reload: 0.14, damage: 1.2, shellSpeed: 850, range: 420, spread: 2.6, length: 70, width: 17, turrets: 2, barrels: 2, bow: -0.05, style: 'jager', hull: '#4a3d33', deck: '#6e5f52', turret: '#2e2620', weapon: 'mg', turretSize: 13 },
    { w: 6, name: 'Kanonneerboot', hp: 65, speed: 75, accel: 20, turn: 36, turretTurn: 26, reload: 5.5, damage: 14, shellSpeed: 430, range: 600, spread: 1.5, length: 80, width: 22, turrets: 1, barrels: 2, bow: 0.1, style: 'fregat', hull: '#5e4030', deck: '#82654f', turret: '#46301f' },
    { w: 5, name: 'Torpedoboot', hp: 45, speed: 115, accel: 30, turn: 48, turretTurn: 34, reload: 5.5, damage: 6, shellSpeed: 420, range: 520, spread: 1.8, length: 78, width: 18, turrets: 1, barrels: 1, bow: -0.05, style: 'jager', hull: '#3e3a44', deck: '#625e6a', turret: '#2e2a34', torp: 2 },
    { w: 4, name: 'Snelle aanvalsboot', hp: 55, speed: 130, accel: 40, turn: 52, turretTurn: 40, reload: 4.5, damage: 7, shellSpeed: 440, range: 540, spread: 1.7, length: 82, width: 19, turrets: 2, barrels: 1, bow: -0.08, style: 'jager', hull: '#44302a', deck: '#6a5048', turret: '#33221e', torp: 1 },
    { w: 4, name: 'Hovercraft-raider', hp: 55, speed: 150, accel: 45, turn: 55, turretTurn: 80, reload: 0.16, damage: 1.1, shellSpeed: 820, range: 400, spread: 2.8, length: 72, width: 32, turrets: 1, barrels: 2, bow: 0.35, style: 'hover', hull: '#5c4a3a', deck: '#857260', turret: '#3a2e24', weapon: 'mg', turretSize: 14, turretSlots: [0.36, 0], hover: true },
    { w: 5, name: 'Kustwachter', hp: 70, speed: 90, accel: 24, turn: 38, turretTurn: 30, reload: 5.0, damage: 9, shellSpeed: 430, range: 580, spread: 1.5, length: 92, width: 21, turrets: 2, barrels: 1, bow: 0.05, style: 'jager', hull: '#6a4a3a', deck: '#8e7060', turret: '#4e3426' },
    { w: 5, name: 'Korvet', hp: 75, speed: 95, accel: 25, turn: 38, turretTurn: 32, reload: 4.8, damage: 9, shellSpeed: 440, range: 600, spread: 1.5, length: 95, width: 21, turrets: 2, barrels: 2, bow: -0.02, style: 'jager', hull: '#503632', deck: '#765a54', turret: '#3e2824' },
    // Escorts
    { w: 8, name: 'Torpedojager', hp: 80, speed: 70, accel: 18, turn: 32, turretTurn: 24, reload: 5.5, damage: 10, shellSpeed: 420, range: 620, spread: 1.6, length: 105, width: 24, turrets: 3, barrels: 2, bow: 0.15, style: 'fregat', hull: '#5c3432', deck: '#7a5752', turret: '#4a2c2a', torp: 2 },
    { w: 6, name: 'Fregat', hp: 95, speed: 72, accel: 18, turn: 30, turretTurn: 26, reload: 5.2, damage: 11, shellSpeed: 440, range: 650, spread: 1.4, length: 112, width: 25, turrets: 3, barrels: 1, bow: 0.12, style: 'fregat', hull: '#4e3a38', deck: '#73605c', turret: '#3a2a28' },
    { w: 4, name: 'Luchtafweerfregat', hp: 90, speed: 70, accel: 18, turn: 30, turretTurn: 40, reload: 2.6, damage: 6, shellSpeed: 520, range: 600, spread: 1.8, length: 115, width: 25, turrets: 4, barrels: 1, bow: 0.12, style: 'fregat', hull: '#4a4040', deck: '#6e6464', turret: '#383030' },
    { w: 3, name: 'Mijnenveger', hp: 85, speed: 55, accel: 14, turn: 30, turretTurn: 24, reload: 5.5, damage: 9, shellSpeed: 420, range: 560, spread: 1.6, length: 98, width: 24, turrets: 2, barrels: 1, bow: 0.2, style: 'fregat', hull: '#5a4a32', deck: '#806e52', turret: '#443622' },
    { w: 3, name: 'Hulpkruiser', hp: 110, speed: 52, accel: 12, turn: 24, turretTurn: 20, reload: 6.0, damage: 11, shellSpeed: 420, range: 640, spread: 1.7, length: 130, width: 28, turrets: 3, barrels: 1, bow: 0.25, style: 'fregat', hull: '#4c3c34', deck: '#9a8a70', turret: '#3a2c24' },
    { w: 3, name: 'Monitor', hp: 150, speed: 42, accel: 10, turn: 20, turretTurn: 16, reload: 7.5, damage: 28, shellSpeed: 450, range: 800, spread: 1.2, length: 100, width: 32, turrets: 1, barrels: 3, bow: 0.3, style: 'fregat', hull: '#4a3a36', deck: '#6c5a54', turret: '#342622' },
    // Cruisers
    { w: 6, name: 'Kruiser', hp: 140, speed: 58, accel: 14, turn: 26, turretTurn: 20, reload: 6.0, damage: 14, shellSpeed: 440, range: 720, spread: 1.4, length: 135, width: 30, turrets: 4, barrels: 2, bow: 0.1, style: 'kruiser', hull: '#52302e', deck: '#74524c', turret: '#432826' },
    { w: 4, name: 'Lichte kruiser', hp: 120, speed: 68, accel: 16, turn: 30, turretTurn: 24, reload: 5.0, damage: 12, shellSpeed: 450, range: 700, spread: 1.4, length: 122, width: 27, turrets: 3, barrels: 2, bow: 0.06, style: 'kruiser', hull: '#583a36', deck: '#7c5e58', turret: '#46302c' },
    { w: 3, name: 'Torpedokruiser', hp: 130, speed: 64, accel: 16, turn: 28, turretTurn: 22, reload: 6.0, damage: 12, shellSpeed: 440, range: 700, spread: 1.4, length: 132, width: 28, turrets: 3, barrels: 2, bow: 0.06, style: 'kruiser', hull: '#2e2c3a', deck: '#565466', turret: '#22202c', torp: 4 },
    { w: 3, name: 'Zware kruiser', hp: 190, speed: 56, accel: 13, turn: 24, turretTurn: 20, reload: 6.2, damage: 20, shellSpeed: 460, range: 780, spread: 1.3, length: 145, width: 31, turrets: 4, barrels: 3, bow: 0.18, style: 'zwaar', hull: '#5a3e2e', deck: '#806450', turret: '#46301f' },
    { w: 2, name: 'Pantserschip', hp: 240, speed: 46, accel: 11, turn: 20, turretTurn: 16, reload: 6.8, damage: 24, shellSpeed: 460, range: 800, spread: 1.3, length: 140, width: 34, turrets: 3, barrels: 3, bow: 0.25, style: 'zwaar', hull: '#463a34', deck: '#6a5e58', turret: '#342a24' },
    { w: 2, name: 'Slagkruiser', hp: 260, speed: 62, accel: 14, turn: 22, turretTurn: 18, reload: 6.5, damage: 26, shellSpeed: 480, range: 860, spread: 1.2, length: 160, width: 33, turrets: 4, barrels: 3, bow: 0.12, style: 'zwaar', hull: '#5e2a26', deck: '#84504a', turret: '#481e1a' },
    // Capital ships (rare)
    { w: 1.5, name: 'Slagschip', hp: 340, speed: 45, accel: 10, turn: 16, turretTurn: 14, reload: 7.0, damage: 34, shellSpeed: 490, range: 920, spread: 1.1, length: 172, width: 37, turrets: 4, barrels: 3, bow: 0.28, style: 'titan', hull: '#3e2e2a', deck: '#665650', turret: '#2e201c' },
    { w: 0.8, name: 'Dreadnought', hp: 420, speed: 40, accel: 9, turn: 14, turretTurn: 12, reload: 7.5, damage: 38, shellSpeed: 500, range: 980, spread: 1.0, length: 195, width: 41, turrets: 5, barrels: 3, bow: 0.3, style: 'titan', hull: '#322a28', deck: '#5a504c', turret: '#241c1a' },
    // Submarine: submerged, only torpedoes; shells pass over it (use depth charges or torpedoes)
    { w: 3, name: 'Onderzeeër', hp: 80, speed: 55, accel: 14, turn: 26, turretTurn: 0, reload: 99, damage: 0, shellSpeed: 400, range: 400, spread: 1, length: 95, width: 14, turrets: 0, barrels: 1, bow: 0.1, style: 'sub', hull: '#24303a', deck: '#34424c', turret: '#1a2228', torp: 2, sub: true }
];
const ENEMY_WEIGHT = ENEMY_TYPES.reduce((a, t) => a + t.w, 0);
const ENEMY_TORP_CD = 14;     // seconds between enemy torpedo salvos
const DEFAULT_DIFF = { enemyHp: 1, enemyDamage: 1, enemyReload: 1, enemySpread: 1, startEnemies: 3, maxEnemies: 8 };
// Particle kinds: layer 0 = under ships, 1 = under additive, 2 = over, 3 = over additive
const KIND_LAYER = { foam: 0, glow: 1, smoke: 2, steam: 2, water: 2, sand: 2, debris: 2, ring: 2, fire: 3, flash: 3, spark: 3, repair: 3 };

let canvas, ctx, mini, mctx, dotnet;
let dpr = 1, vw = 0, vh = 0, zoom = 1;
let baseZoom = 1, userZoom = 1, zoomTarget = 1, pinchStart = 0, pinchZoom = 1;
const ZOOM_MIN = 0.65, ZOOM_MAX = 2.5;
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
    // Wrap to -PI..PI without loops (an infinite angle would otherwise hang the game)
    if (!Number.isFinite(a)) return 0;
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
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
    gpuInfo = gpu;
    quality = gpu.gpu
        ? { gpu: true, dprMax: 2, shadows: true, renderer: gpu.renderer }
        : { gpu: false, dprMax: 1, shadows: false, renderer: gpu.renderer };
    spriteScale = gpu.gpu ? 3 : 1.5;
    maxParticles = gpu.gpu ? 4000 : 1200;
    if (gpu.gpu) water = waterObj = createWater(canvas);
    if (dotnet) dotnet.invokeMethodAsync('OnGraphics', water ? `GPU: ${gpu.renderer}` : `Geen GPU (${gpu.renderer})`).catch(() => { });
    tex = makeTextures();
    seed = (Math.random() * 1e9) | 0;
    // Saved graphics level (-1 = automatic)
    let lvl = -1;
    try { lvl = parseInt(localStorage.getItem('wb-gfx') ?? '-1', 10); } catch { }
    if (lvl >= 0) applyGraphics(lvl);
    resize();
    bindInput();
    requestAnimationFrame(loop);
}

// ---------- graphics levels: 0 ultra low .. 4 ultra ----------
const GFX = [
    { name: 'Ultra laag', dprMax: 0.6, shadows: false, sprite: 0.9, particles: 300, water: false, hq: false },
    { name: 'Laag', dprMax: 0.85, shadows: false, sprite: 1.2, particles: 700, water: false, hq: false },
    { name: 'Middel', dprMax: 1, shadows: false, sprite: 1.5, particles: 1500, water: true, hq: false },
    { name: 'Hoog', dprMax: 1.5, shadows: true, sprite: 2.25, particles: 3000, water: true, hq: true },
    { name: 'Ultra', dprMax: 2, shadows: true, sprite: 3, particles: 5000, water: true, hq: true }
];
let gpuInfo = { gpu: false, renderer: '' }, waterObj = null;

function applyGraphics(level) {
    const g = GFX[clamp(level | 0, 0, GFX.length - 1)];
    quality = { gpu: g.hq, dprMax: g.dprMax, shadows: g.shadows, renderer: gpuInfo.renderer };
    spriteScale = g.sprite;
    maxParticles = g.particles;
    // WebGL ocean: created on demand, hidden when not used
    if (g.water && !waterObj) waterObj = createWater(canvas);
    water = g.water ? waterObj : null;
    if (waterObj) waterObj.canvas.style.display = water ? '' : 'none';
    // Throw away cached sprites so they are rebuilt at the new resolution
    shipSprites.clear();
    planeSprites.clear();
    for (const isl of spritedIslands) { isl.sprite = null; isl.tiles = null; }
    spritedIslands.clear();
    islandJobs.clear();
    tileJobs.clear();
}

// Called from Blazor: level -1 = automatic (by GPU), 0..4 = ultra low .. ultra
export function setGraphics(level) {
    try { localStorage.setItem('wb-gfx', String(level)); } catch { }
    if (level < 0) {
        // Automatic: like the original detection — Ultra with a GPU, Middel without (2D water)
        applyGraphics(gpuInfo.gpu ? 4 : 2);
        if (!gpuInfo.gpu) {
            water = null;
            if (waterObj) waterObj.canvas.style.display = 'none';
        }
    } else applyGraphics(level);
    resize();
}

export function getGraphics() {
    try { return parseInt(localStorage.getItem('wb-gfx') ?? '-1', 10); } catch { return -1; }
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
    enemyTargetT = 0;
    for (let i = 0; i < targetEnemies(); i++) spawnEnemy();
    spawnTimer = SPAWN_DELAY;
    resetExtras();
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
    try {
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
    } finally {
        // Always hand the main canvas back to the game
        ctx = main;
    }
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
    resetExtras();
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
    // Rare: most chunks are open sea
    const count = rng() < ISLAND_CHANCE ? 1 : 0;
    for (let n = 0, tries = 0; n < count && tries < 10; tries++) {
        // Size skewed towards medium, occasionally huge
        const base = lerp(ISLAND_MIN_R, ISLAND_BASE_MAX_R, Math.pow(rng(), 1.6));
        // Stretched but with the same area as a round island of radius base
        const aspect = r01(ISLAND_ASPECT[0], ISLAND_ASPECT[1]), rot = r01(0, Math.PI);
        const r = base * Math.sqrt(aspect), m = Math.min(r + 160, CHUNK / 2 - 1);
        const x = cx * CHUNK + r01(m, CHUNK - m), y = cy * CHUNK + r01(m, CHUNK - m);
        // Keep the starting area free
        if (Math.hypot(x, y) < r + 1200) continue;
        // Classic gently irregular coast, stretched into a long island
        const raw = [];
        for (let k = 0; k < 24; k++) {
            const a = k / 24 * 2 * Math.PI;
            raw.push(r01(0.86, 1.08) / Math.hypot(Math.cos(a - rot), Math.sin(a - rot) * aspect));
        }
        const peak = Math.max(...raw);
        const pts = raw.map(v => v / peak * r);
        const isl = { x, y, r, pts, trees: [], rocks: [], sprite: null, phase: r01(0, 6.28) };
        for (let k = 0; k < 3 + Math.floor(rng() * (r / 60)); k++) {
            const a = r01(0, 2 * Math.PI), d = coastRadius(isl, a) * r01(0.82, 1.0);
            isl.rocks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: r01(5, 13) });
        }
        // Some islands have a harbor: pier sticking out from the coast
        if (rng() < HARBOR.chance) {
            const a = r01(0, 2 * Math.PI);
            isl.harbor = { a, cr: coastRadius(isl, a), cd: 0 };
        }
        // Big islands may have an airstrip along their long axis
        if (r > 1100 && rng() < AIRSTRIP.chance) isl.airstrip = { a: rot, len: Math.min(AIRSTRIP.len, r * 0.45) };
        list.push(isl);
        n++;
    }
    chunks.set(key, list);
    return list;
}

function islandsNear(x, y, rad) {
    const out = [];
    // Guard: a non-finite position or radius would make the chunk loops endless (game freezes)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rad)) return out;
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

// Coast radius of an island in the direction of a world point
function coastAt(isl, x, y) {
    return coastRadius(isl, Math.atan2(y - isl.y, x - isl.x));
}

// True if (x, y) lies on land (or within pad of the coast)
function insideIsland(isl, x, y, pad = 0) {
    const d = Math.hypot(x - isl.x, y - isl.y);
    return d < isl.r + pad && d < coastAt(isl, x, y) * 0.95 + pad;
}

// Terrain height at a world point (< 0 = water, 0..0.17 = beach); -1 in open sea
function terrainHeight(x, y) {
    let best = -1;
    for (const isl of islandsNear(x, y, ISLAND_MAX_R + 100)) {
        if (Math.hypot(x - isl.x, y - isl.y) > isl.r * 1.05) continue;
        best = Math.max(best, islandHeight(isl, x - isl.x, y - isl.y, islandSeed(isl)));
    }
    return best;
}

function onIsland(x, y, pad = 0) {
    return islandsNear(x, y, ISLAND_MAX_R + pad + 100).some(i => insideIsland(i, x, y, pad));
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
    zoomTarget = clamp(z, zoomMin(), ZOOM_MAX);
}

function setPointer(x, y) {
    mouse.sx = x;
    mouse.sy = y;
}

// ---------- phone controls: joystick, throttle lever, aim assist ----------
const WHEEL_MAX = 135;        // rudder scale: wheelAngle / WHEEL_MAX = rudder -1..1
const AIM_SNAP = 90;          // touch aim snaps onto an enemy within this many screen pixels
let wheelAngle = 0, autoAim = false, fireHeld = false, touchAim = false;
let stickX = 0, stickY = 0;   // joystick knob offset, -1..1
// Joystick up/down = throttle (-1..1); only applied once the joystick has been used (keyboard players unaffected)
let stickThrottle = 0, stickUsed = false, stickActive = false;

function bindTouchControls() {
            // Push left/right to steer, up/down for ahead/astern; springs back to the centre on release
    const stick = document.getElementById('stick');
    if (stick) {
        let id = null;
        const move = t => {
            const r = stick.getBoundingClientRect(), rad = r.width / 2;
            let dx = (t.clientX - (r.left + rad)) / rad, dy = (t.clientY - (r.top + rad)) / rad;
            const d = Math.hypot(dx, dy);
            if (d > 1) { dx /= d; dy /= d; }
            stickX = dx;
            stickY = dy;
            // Small dead zone in the middle, then a soft curve for fine control
            const curve = v => Math.abs(v) < 0.1 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.1) / 0.9, 1.3);
            wheelAngle = curve(dx) * WHEEL_MAX;
            stickThrottle = -curve(dy);   // up = ahead / more power
            stickUsed = true;
            stickActive = true;
        };
        stick.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.changedTouches[0];
            id = t.identifier;
            move(t);
        }, { passive: false });
        stick.addEventListener('touchmove', e => {
            e.preventDefault();
            for (const t of e.changedTouches) if (t.identifier === id) move(t);
        }, { passive: false });
        const end = e => {
            for (const t of e.changedTouches) {
                if (t.identifier !== id) continue;
                id = null;
                stickX = stickY = 0;
                wheelAngle = 0;
                stickThrottle = 0;
                stickActive = false;
            }
        };
        stick.addEventListener('touchend', end);
        stick.addEventListener('touchcancel', end);
    }

    const wheel = document.getElementById('wheel');
    if (wheel) {
        let last = null, id = null;
        const angleOf = t => {
            const r = wheel.getBoundingClientRect();
            return Math.atan2(t.clientY - (r.top + r.height / 2), t.clientX - (r.left + r.width / 2)) / DEG;
        };
        wheel.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.changedTouches[0], r = wheel.getBoundingClientRect();
            // Tap on the hub: rudder amidships
            if (Math.hypot(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2)) < r.width * 0.17) { wheelAngle = 0; return; }
            id = t.identifier;
            last = angleOf(t);
        }, { passive: false });
        wheel.addEventListener('touchmove', e => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier !== id || last === null) continue;
                const a = angleOf(t);
                let d = a - last;
                if (d > 180) d -= 360;
                if (d < -180) d += 360;
                wheelAngle = clamp(wheelAngle + d, -WHEEL_MAX, WHEEL_MAX);
                last = a;
            }
        }, { passive: false });
        const end = e => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; last = null; } };
        wheel.addEventListener('touchend', end);
        wheel.addEventListener('touchcancel', end);
    }

    const thr = document.getElementById('throttle');
    if (thr) {
        // Aircraft power lever: top = full power, bottom = minimum (only shown in the air)
        const setFrom = t => {
            const r = thr.getBoundingClientRect();
            const f = clamp((t.clientY - r.top) / r.height, 0, 1);
            if (flying) flying.thr = clamp(1 - f, 0, 1);
        };
        const on = e => { e.preventDefault(); setFrom(e.targetTouches[0] || e.changedTouches[0]); };
        thr.addEventListener('touchstart', on, { passive: false });
        thr.addEventListener('touchmove', on, { passive: false });
    }

    const auto = document.getElementById('autoBtn');
    if (auto) {
        auto.addEventListener('touchstart', e => {
            e.preventDefault();
            autoAim = !autoAim;
            auto.classList.toggle('on', autoAim);
        }, { passive: false });
    }

    const fire = document.getElementById('fireBtn');
    if (fire) {
        fire.addEventListener('touchstart', e => { e.preventDefault(); fireHeld = true; }, { passive: false });
        fire.addEventListener('touchend', e => { e.preventDefault(); fireHeld = false; }, { passive: false });
        fire.addEventListener('touchcancel', () => { fireHeld = false; });
    }
}

// Mirrors the current rudder/throttle onto the wheel and lever
function updateTouchUi() {
    const rim = document.getElementById('wheelRim');
    if (rim) rim.style.transform = `rotate(${wheelAngle}deg)`;
    const knob2 = document.getElementById('stickKnob');
    if (knob2) knob2.style.transform = `translate(${stickX * 55}%, ${stickY * 55}%)`;
    // Power lever: visible only while your aircraft is in the air
    const lever = document.getElementById('throttle');
    const showLever = !!flying && flying.phase === 'air' && state === 'playing';
    if (lever) lever.style.display = showLever ? '' : 'none';
    const knob = document.getElementById('thrKnob');
    if (knob && showLever) {
        const t = clamp(flying.thr, 0, 1);
        knob.style.top = (1 - t) * 100 + '%';
        const lbl = document.getElementById('thrLabel');
        if (lbl) lbl.textContent = Math.round(t * 100) + '%';
    }
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

    canvas.addEventListener('mousemove', e => { setPointer(e.clientX, e.clientY); touchAim = false; });
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
        if (t) { setPointer(t.clientX, t.clientY); mouse.down = true; touchAim = true; }
        else mouse.down = false;
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
        canvas.addEventListener(ev, onTouch, { passive: false });

    bindTouchControls();

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
    // >0 = rearm seconds left, -1 = waiting for all jets to land
    const jetCd = player && player.deck ? (player.deck.recovering ? -1 : Math.ceil(player.deck.sortieCd)) : 0;
    const key = `${state}|${kills}|${alive}|${hp}|${rep}|${sp}|${air}|${jetCd}`;
    if (!force && key === lastReport) return;
    lastReport = key;
    dotnet.invokeMethodAsync('OnStatus', state, kills, alive, hp, rep, sp, air, jetCd).catch(() => { });
}

// ---------- ships ----------
// Applies the long-range gunnery factors once
function scaleRange(st) {
    if (st.rangeScaled) return st;
    // Gunless missile ships (carrier): range is how far the missiles fly
    if (st.turrets === 0 && st.special === 'missile') return { ...st, range: missileReach(), rangeScaled: true };
    const f = st.weapon === 'mg' ? MG_RANGE_FACTOR : RANGE_FACTOR;
    return { ...st, range: st.range * f, shellSpeed: st.shellSpeed * (st.weapon === 'mg' ? 1.2 : SHELL_FACTOR), rangeScaled: true };
}

// Distance a missile covers in its lifetime (accelerate to max speed, then cruise), minus a margin for turning
function missileReach() {
    const tAcc = Math.min(MISSILE.life, (MISSILE.maxSpeed - MISSILE.speed0) / MISSILE.accel);
    const d = (MISSILE.speed0 + MISSILE.maxSpeed) / 2 * tAcc + MISSILE.maxSpeed * (MISSILE.life - tAcc);
    return Math.round(d * 0.9);
}

function hasRadar(st) {
    if (st.radar !== undefined && st.radar !== null) return !!st.radar;
    return st.id ? RADAR_SHIPS.has(st.id) : st.length >= 100;
}

// Despawn range grows when zoomed far out, so spawns stay off-screen
function despawnDist() {
    return Math.max(DESPAWN_DIST, Math.hypot(vw / 2 / zoom, vh / 2 / zoom) + 1800);
}

// Smaller ships cannot zoom out as far
function zoomMin() {
    const L = player ? player.st.length : 160;
    return clamp(ZOOM_MIN * Math.pow(160 / L, 0.8), 0.4, 1.0);
}

function makeShip(st, x, y, heading, enemy) {
    st = scaleRange(st);
    // Custom slots are flat [fx, fy, ...] pairs (fractions of length / width)
    const pairs = a => Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2], a[i * 2 + 1]]);
    const slots = st.turrets === 0 ? []
        : st.turretSlots && st.turretSlots.length >= 2 ? pairs(st.turretSlots)
        : LAYOUTS[clamp(st.turrets || 4, 1, 5)].map(f => [f, 0]);
    // Missile launch boxes, aimed like turrets
    const launchers = st.launcherSlots && st.launcherSlots.length >= 2 ? pairs(st.launcherSlots) : [];
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
        launchers: launchers.map(([f, fy]) => ({ off: f * st.length, side: fy * st.width, rel: fy !== 0 ? Math.sign(fy) * 0.6 : 0, recoil: 0 })),
        nextLauncher: 0,
        ai: { side: Math.random() < 0.5 ? 1 : -1, flip: rand(8, 16), avoid: 1, stuck: 0, reverse: 0 }
    };
}

// Enemy count wanders randomly between ENEMY_MIN and ENEMY_MAX
let enemyTarget = 2, enemyTargetT = 0, spawnFront = 0;
function targetEnemies() {
    if (time >= enemyTargetT) {
        enemyTarget = ENEMY_MIN + Math.floor(Math.random() * (ENEMY_MAX - ENEMY_MIN + 1));
        enemyTargetT = time + rand(25, 50);
        spawnFront = rand(0, 2 * Math.PI);
    }
    return enemyTarget;
}

// Fixed class mix and strength; only the chosen difficulty matters
function enemyStats() {
    // Weighted pick: small craft common, capital ships rare
    let r = Math.random() * ENEMY_WEIGHT, base = ENEMY_TYPES[0];
    for (const t of ENEMY_TYPES) { if ((r -= t.w) <= 0) { base = t; break; } }
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
// Turret size relative to the beam; scaled down for a realistic look
const TURRET_SCALE = 0.72;
const turretWidth = st => (st.turretSize || st.width) * TURRET_SCALE;

// True if a point (plus margin) lies inside the visible screen area
function inView(x, y, margin) {
    return Math.abs(x - cam.x) < vw / 2 / zoom + margin && Math.abs(y - cam.y) < vh / 2 / zoom + margin;
}

// Only a few enemies attack at once (nearest first, current attackers keep their turn);
// the rest wait outside gun range
function assignAttackers() {
    const alive = enemies.filter(e => !e.dead);
    const score = e => e.boss ? -1e9 : Math.hypot(e.x - player.x, e.y - player.y) - (e.ai.engaged ? 600 : 0);
    alive.sort((a, b) => score(a) - score(b));
    alive.forEach((e, i) => { e.ai.engaged = i < MAX_ATTACKERS; });
}

function spawnEnemy(stOverride) {
    const st = stOverride || enemyStats();
    const px = player ? player.x : 0, py = player ? player.y : 0;
    // Only outside the screen, never closer than SPAWN_MIN; stays inside despawn range
    const viewR = Math.hypot(vw / 2 / zoom, vh / 2 / zoom);
    const rMin = Math.max(SPAWN_MIN + st.length, Math.min(vw, vh) / 2 / zoom);
    const rMax = Math.min(Math.max(rMin + 600, SPAWN_MAX, viewR + 600), despawnDist() - 300);
    for (let k = 0; k < 80; k++) {
        // Reinforcements come from one general direction, not from all sides
        const a = spawnFront + rand(-SPAWN_SPREAD, SPAWN_SPREAD) * DEG, r = rand(rMin, rMax);
        const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
        if (inView(x, y, st.length + 60)) continue;
        if (onIsland(x, y, 200)) continue;
        const ship = makeShip(st, x, y, Math.atan2(py - y, px - x), true);
        enemies.push(ship);
        return ship;
    }
    return null;
}

// ---------- main loop ----------
let loopErrors = 0, lastFrameError = '', lastFrameErrorT = -99;

function loop(ts) {
    // Schedule the next frame first: an error in one frame must never stop the game
    requestAnimationFrame(loop);
    try {
        frame(ts);
    } catch (err) {
        if (loopErrors++ < 5) console.error('warshipBattle frame error:', err);
        lastFrameError = String(err && err.message || err);
        lastFrameErrorT = time;
        try {
            // A sprite builder may have left the global context pointing at an off-screen canvas
            ctx = canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = 'none';
        } catch { }
    }
    // Show a persisting error on screen, so it can be reported
    if (time - lastFrameErrorT < 3 && lastFrameError) {
        try {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.font = 'bold 13px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(0,0,0,.6)';
            ctx.fillRect(8, vh - 34, Math.min(vw - 16, 12 + lastFrameError.length * 7), 24);
            ctx.fillStyle = '#ff8a7a';
            ctx.textAlign = 'start';
            ctx.textBaseline = 'middle';
            ctx.fillText('Fout: ' + lastFrameError, 14, vh - 22);
        } catch { }
    }
}

function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    time += dt;
    // Keyboard / button zoom, eased toward the target
    if (keys.Equal || keys.NumpadAdd || keys.ZoomIn) setZoom(zoomTarget * (1 + dt * 1.5));
    if (keys.Minus || keys.NumpadSubtract || keys.ZoomOut) setZoom(zoomTarget / (1 + dt * 1.5));
    // Zoom-out limit follows the current ship size
    zoomTarget = clamp(zoomTarget, zoomMin(), ZOOM_MAX);
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
    updateTouchUi();
}

function update(dt) {
    mouse.x = cam.x + (mouse.sx - vw / 2) / zoom;
    mouse.y = cam.y + (mouse.sy - vh / 2) / zoom;
    const active = state === 'playing';

    if (player) {
        if (active && !player.dead) {
            if (flying) { player.throttle = 0; controlPlane(dt); }
            else controlPlayer(dt);
        }
        updateShip(player, dt);
    }
    if (player) assignAttackers();
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
    if (player) updateExtras(dt, active);
    updateParticles(dt);
    enemies = enemies.filter(e => !(e.dead && e.sink > 4));

    if (active && player && !player.dead) {
        // Drop enemies left far behind; reinforcements refill
        enemies = enemies.filter(e => e.dead || Math.hypot(e.x - player.x, e.y - player.y) < despawnDist());
        spawnTimer -= dt;
        if (spawnTimer <= 0 && enemies.filter(e => !e.dead).length < targetEnemies()) {
            spawnEnemy();
            spawnTimer = SPAWN_DELAY;
        }
    }

    if (player && player.dead && active && player.sink > 2.5) {
        saveScore();
        setState('gameover');
    }

    if (player) {
        // Camera follows your own aircraft while flying
        const tgt = flying || player;
        cam.x += (tgt.x - cam.x) * Math.min(1, dt * 5);
        cam.y += (tgt.y - cam.y) * Math.min(1, dt * 5);
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
    // Phone joystick: up = ahead (up to full), down = astern (up to half)
    if (stickUsed && !up && !down) player.throttle = stickThrottle >= 0 ? stickThrottle : stickThrottle * 0.5;
    if (keys.KeyR && player.repairCd <= 0 && player.repair <= 0 && (player.hp < player.maxHp || hasPartDamage(player))) {
        player.repair = REPAIR_TIME;
        player.repairCd = REPAIR_COOLDOWN;
        // Emergency repair also fixes knocked-out turrets, fire and engine
        fixPartDamage(player);
        report(true);
    }
    // Depth charges (G / 💣)
    if (keys.KeyG && depthCd <= 0) dropDepthCharges();
    // Take off with your own aircraft from a nearby airstrip (T / ✈)
    const tNow = !!keys.KeyT;
    if (tNow && !tLatch) tryTakeOff();
    tLatch = tNow;
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    // Keys steer directly; otherwise the touch wheel position sets the rudder
    const rudderTarget = left || right ? (right ? 1 : 0) - (left ? 1 : 0) : wheelAngle / WHEEL_MAX;
    player.rudder = approach(player.rudder, rudderTarget, dt * 2.5);

    // Touch aim assist: aiming near an enemy (aircraft first) locks exactly onto it (with lead) and follows it
    if (touchAim) {
        const pl = nearestPlane(mouse.x, mouse.y, AIM_SNAP / zoom);
        const e = pl ? null : nearestEnemy(mouse.x, mouse.y, AIM_SNAP / zoom);
        if (pl) {
            const t = Math.hypot(pl.x - player.x, pl.y - player.y) / (player.st.shellSpeed || 500);
            mouse.x = pl.x + Math.cos(pl.a) * PLANE.speed * t;
            mouse.y = pl.y + Math.sin(pl.a) * PLANE.speed * t;
        } else if (e) {
            const t = Math.hypot(e.x - player.x, e.y - player.y) / (player.st.shellSpeed || 500);
            mouse.x = e.x + Math.cos(e.heading) * e.speed * t;
            mouse.y = e.y + Math.sin(e.heading) * e.speed * t;
        }
    }

    // Auto-aim: lock on the nearest enemy in range, lead the target and keep firing
    let autoFire = false;
    if (autoAim && !mouse.down) {
        const e = nearestEnemy(player.x, player.y, player.st.range);
        if (e) {
            const t = Math.hypot(e.x - player.x, e.y - player.y) / (player.st.shellSpeed || 500);
            mouse.x = e.x + Math.cos(e.heading) * e.speed * t;
            mouse.y = e.y + Math.sin(e.heading) * e.speed * t;
            autoFire = true;
        }
    }

    // Special weapon aims at the (auto-)aim point
    if ((keys.KeyF || specialQueued) && player.st.special && player.specialCd <= 0) useSpecial(player);
    specialQueued = false;

    aimTurrets(player, mouse.x, mouse.y, dt);
    aimLaunchers(player, mouse.x, mouse.y, dt);
    if (mouse.down || keys.Space || fireHeld || autoFire) fireTurrets(player, mouse.x, mouse.y);
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
            // Carrier: exactly one missile per single-tube launcher
            const single = !!st.jets && s.launchers.length > 0;
            const n = single ? s.launchers.length : (st.specialCount || 2);
            // Lock on to the enemy closest to the cursor
            const target = nearestEnemy(mouse.x, mouse.y, MISSILE.seek * 2);
            for (let i = 0; i < n; i++) {
                // Fired out of the launch tubes in turn
                const ln = s.launchers.length ? s.launchers[(single ? i : s.nextLauncher++) % s.launchers.length] : null;
                let p, a;
                if (ln) {
                    const lp = turretPos(s, ln);
                    a = s.heading + ln.rel;
                    p = { x: lp.x + Math.cos(a) * 7, y: lp.y + Math.sin(a) * 7 };
                } else {
                    const side = i % 2 ? 1 : -1;
                    p = local(s, st.length * (0.25 - 0.5 * (i / Math.max(1, n - 1))), side * st.width * 0.2);
                    a = s.heading + side * rand(1.2, 1.9);
                }
                missiles.push({ x: p.x, y: p.y, a, speed: MISSILE.speed0, target, life: MISSILE.life, age: -i * 0.25, trail: 0, launcher: ln, owner: s });
            }
            break;
        }
        case 'seekmines': {
            // Homing mines, dropped in a fan behind the stern
            const n = st.specialCount || 3;
            for (let i = 0; i < n; i++) {
                const p = local(s, -st.length * 0.6 - i * 8, (i - (n - 1) / 2) * 34);
                mines.push({ x: p.x, y: p.y, arm: MINE.arm, life: SEEKMINE.life, bob: rand(0, 6.28), seek: true });
                addParticle({ kind: 'ring', x: p.x, y: p.y, vx: 0, vy: 0, max: 1, size: 4, grow: 30, alpha: 0.5 });
            }
            while (mines.length > MINE.max) mines.shift();
            break;
        }
        case 'barrage': {
            // Queue a rocket salvo on the cursor area (clamped to gun range)
            const d = Math.hypot(mouse.x - s.x, mouse.y - s.y), k = Math.min(1, st.range / Math.max(1, d));
            s.barrage = { n: st.specialCount || 8, t: 0, x: s.x + (mouse.x - s.x) * k, y: s.y + (mouse.y - s.y) * k };
            break;
        }
        case 'shield':
            s.specialT = SHIELD.time;
            break;
        case 'emp':
            // Electromagnetic pulse: stuns every enemy in range
            s.specialT = 1;
            addParticle({ kind: 'ring', x: s.x, y: s.y, vx: 0, vy: 0, max: 0.9, size: 20, grow: EMP.radius / 0.9, alpha: 0.9 });
            for (const e of enemies) {
                if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) < EMP.radius) e.stunT = EMP.stun;
            }
            playSound('ping', s.x, s.y, 3);
            break;
        case 'heal':
            s.specialT = HEAL.time;
            break;
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
    // EMP-stunned ships: no reloading, engines dead
    s.stunT = Math.max(0, (s.stunT || 0) - dt);
    const reloadRate = s.stunT > 0 ? 0 : s.specialT > 0 && st.special === 'overdrive' ? OVERDRIVE.factor : 1;
    if (s.stunT > 0) {
        s.throttle = 0;
        if (Math.random() < dt * 12)
            addParticle({ kind: 'repair', x: s.x + rand(-st.length / 2.5, st.length / 2.5), y: s.y + rand(-st.width / 2, st.width / 2), vx: 0, vy: 0, max: 0.25, size: 2, grow: 10, alpha: 1 });
    }
    // Rocket salvo in flight
    if (s.barrage && s.barrage.n > 0 && !s.dead) {
        s.barrage.t -= dt;
        while (s.barrage.t <= 0 && s.barrage.n > 0) {
            s.barrage.t += BARRAGE.interval;
            s.barrage.n--;
            const p = local(s, -st.length * 0.25, rand(-st.width / 4, st.width / 4));
            const r = Math.sqrt(Math.random()) * BARRAGE.scatter, a0 = rand(0, 2 * Math.PI);
            const tx = s.barrage.x + Math.cos(a0) * r, ty = s.barrage.y + Math.sin(a0) * r;
            const a = Math.atan2(ty - p.y, tx - p.x);
            shells.push({ x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), speed: BARRAGE.speed, left: Math.hypot(tx - p.x, ty - p.y), enemy: s.enemy, dmg: BARRAGE.damage, done: false });
            addParticle({ kind: 'flash', x: p.x, y: p.y, vx: 0, vy: 0, max: 0.08, size: 6, grow: 20, alpha: 1 });
            addParticle({ kind: 'steam', x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), max: rand(1, 1.6), size: 5, grow: 12, alpha: 0.6 });
            playSound('launch', p.x, p.y, 0.7);
        }
    }
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
        // Active armour: glowing points around the hull outline
        if (st.special === 'shield' && Math.random() < dt * 40) {
            const a = rand(0, 2 * Math.PI), p = local(s, Math.cos(a) * st.length * 0.58, Math.sin(a) * st.width * 0.9);
            addParticle({ kind: 'repair', x: p.x, y: p.y, vx: 0, vy: 0, max: 0.35, size: 3, grow: 5, alpha: 0.9 });
        }
        // Repair crews: restore HP over time
        if (st.special === 'heal') {
            s.hp = Math.min(s.maxHp, s.hp + s.maxHp * HEAL.fraction * dt / HEAL.time);
            if (Math.random() < dt * 15)
                addParticle({ kind: 'repair', x: s.x + rand(-st.length / 3, st.length / 3), y: s.y + rand(-st.width / 3, st.width / 3), vx: 0, vy: 0, max: 0.5, size: 3, grow: 6, alpha: 1 });
        }
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
        const target = s.throttle * st.speed * (s.throttle < 0 ? 0.5 : 1) * (st.hover && s.onLand ? HOVER.land : 1) * (s.engineHit ? 0.5 : 1);
        s.speed = approach(s.speed, target, st.accel * dt);
        // Rudder needs water flow: weak at low speed
        const eff = clamp(Math.abs(s.speed) / (st.speed * 0.35), 0.15, 1);
        s.heading = norm(s.heading + s.rudder * st.turn * DEG * eff * dt * (s.speed < 0 ? -1 : 1));
    }

    s.x += Math.cos(s.heading) * s.speed * dt;
    s.y += Math.sin(s.heading) * s.speed * dt;

    // Hovercraft: can go anywhere on land (beach, grass, through the trees), just slower
    if (st.hover) {
        s.onLand = terrainHeight(s.x, s.y) > 0;
        if (s.onLand && !s.dead && Math.abs(s.speed) > 10 && Math.random() < dt * 25) {
            const p = local(s, -st.length * 0.45, rand(-st.width / 3, st.width / 3));
            addParticle({ kind: 'sand', x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), max: 1.2, size: 5, grow: 10, alpha: 0.5 });
        }
    }

    for (const isl of st.hover ? [] : islandsNear(s.x, s.y, ISLAND_MAX_R + 300)) {
        const dx = s.x - isl.x, dy = s.y - isl.y, d = Math.hypot(dx, dy) || 1;
        if (d > isl.r + st.length) continue;
        const coast = coastAt(isl, s.x, s.y) * 0.95;
        const min = coast + st.length * 0.3;
        if (d < min) {
            s.x = isl.x + dx / d * min;
            s.y = isl.y + dy / d * min;
            // Running aground: damage scales with impact speed
            if (!s.dead && s.groundCd <= 0 && Math.abs(s.speed) > 5) {
                s.groundCd = GROUND.cooldown;
                const cx = isl.x + dx / d * coast, cy = isl.y + dy / d * coast;
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

// True when the line of fire crosses the own ship beyond the barrel:
// it may pass over the own deck for a short clearance, but not run along it or re-enter it
function fireBlocked(s, p, a) {
    const st = s.st, c = Math.cos(s.heading), n = Math.sin(s.heading);
    const dx = Math.cos(a), dy = Math.sin(a);
    const clear = Math.max((st.turretSize || st.width) * 0.75, st.width * 0.7);
    let left = false;
    for (let d = 0; d < st.length; d += 4) {
        const wx = p.x + dx * d - s.x, wy = p.y + dy * d - s.y;
        const inside = insideHull(st, wx * c + wy * n, -wx * n + wy * c);
        if (!inside) left = true;
        else if (left || d > clear) return true;
    }
    return false;
}

function fireTurrets(s, tx, ty) {
    const st = s.st;
    if (s.stunT > 0) return;
    for (const t of s.turrets) {
        if (t.reload > 0 || t.err > 2 * DEG || t.blocked || t.broken) continue;
        const p = turretPos(s, t);
        // Knocked-out radar (flagship) ruins the fire control
        const a = s.heading + t.rel + rand(-st.spread, st.spread) * (s.radarDead ? 3 : 1) * DEG;
        const dist = clamp(Math.hypot(tx - p.x, ty - p.y), 80, st.range) * rand(0.97, 1.03);
        const tw = turretWidth(st);
        const mx = p.x + Math.cos(a) * tw * 0.8, my = p.y + Math.sin(a) * tw * 0.8;
        const mg = st.weapon === 'mg';
        shells.push({ x: mx, y: my, dx: Math.cos(a), dy: Math.sin(a), speed: st.shellSpeed, left: dist, enemy: s.enemy, dmg: st.damage, done: false, mg });
        t.reload = st.reload * rand(0.95, 1.05);
        // Machine guns: belt of MG_MAG rounds, then a longer reload
        if (mg && (t.shots = (t.shots || 0) + 1) >= MG_MAG) {
            t.shots = 0;
            t.reload = MG_RELOAD;
        }
        t.reloadMax = t.reload;
        t.recoil = mg ? 0.35 : 1;
        if (mg) mgFlash(mx, my, a);
        else muzzleFlash(mx, my, a, tw);
    }
}

// True when sailing along heading h for dist units hits no island
function pathClear(s, h, dist) {
    const dx = Math.cos(h), dy = Math.sin(h);
    const pad = s.st.width + 60;
    for (const isl of islandsNear(s.x, s.y, dist + ISLAND_MAX_R + 300)) {
        const cx = isl.x - s.x, cy = isl.y - s.y;
        const t = clamp(cx * dx + cy * dy, 0, dist);
        // Quick reject with the bounding circle, then sample along the path against the real coast
        if (Math.hypot(dx * t - cx, dy * t - cy) >= isl.r + pad) continue;
        for (let u = 0; u <= dist; u += 40) {
            if (insideIsland(isl, s.x + dx * u, s.y + dy * u, pad)) return false;
        }
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

    // Engaged ships close in, then fight broadside; the others hang back outside gun range
    let desired;
    if (!e.ai.engaged) desired = d < st.range * 1.3 ? toP + Math.PI + e.ai.side * 0.5 : toP + e.ai.side * Math.PI / 2;
    else if (d > st.range * 0.85 || !inView(e.x, e.y, -40)) desired = toP;   // close in until visible
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
        e.throttle = (route.blocked && Math.abs(norm(route.h - e.heading)) > 60 * DEG ? 0.5 : 0.85) * (e.ai.engaged ? 1 : 0.6);
        e.ai.stuck = Math.abs(e.speed) < 8 ? e.ai.stuck + dt : 0;
        if (e.ai.stuck > 1.5) { e.ai.stuck = 0; e.ai.reverse = 2; }
    }

    // Player hidden in smoke, or waiting for a turn to attack: hold fire
    if (hidden || !e.ai.engaged) return;
    // Only fire when visible on the player's screen (no shots from off-screen)
    if (!inView(e.x, e.y, 0)) return;
    // Night / fog: no firing beyond visual range
    if (d > envVisibility()) return;

    // Lead the target
    const flight = d / st.shellSpeed;
    const tx = player.x + Math.cos(player.heading) * player.speed * flight;
    const ty = player.y + Math.sin(player.heading) * player.speed * flight;
    aimTurrets(e, tx, ty, dt);
    if (d < st.range) fireTurrets(e, tx, ty);

    // Torpedo boats: a fan of torpedoes at the player's predicted position now and then
    if (st.torp && !(e.stunT > 0)) {
        if (e.torpCd === undefined) e.torpCd = rand(4, 10);
        e.torpCd -= dt;
        if (e.torpCd <= 0 && d < TORPEDO.range * 0.85) {
            e.torpCd = ENEMY_TORP_CD * rand(0.8, 1.2);
            const tt = d / TORPEDO.speed;
            const base = Math.atan2(player.y + Math.sin(player.heading) * player.speed * tt - e.y, player.x + Math.cos(player.heading) * player.speed * tt - e.x);
            for (let i = 0; i < st.torp; i++) {
                const a = base + (i - (st.torp - 1) / 2) * TORPEDO.spread * DEG;
                shells.push({ x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), speed: TORPEDO.speed, left: TORPEDO.range, enemy: true, dmg: TORPEDO.damage * 0.6 * diff.enemyDamage, done: false, torp: true, trail: 0 });
                addParticle({ kind: 'water', x: e.x + Math.cos(a) * st.width * 0.6, y: e.y + Math.sin(a) * st.width * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, max: 0.6, size: 6, grow: 14, alpha: 0.7 });
            }
        }
    }
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
        const isl = islandsNear(sh.x, sh.y, travel + ISLAND_MAX_R + 100).filter(i => Math.hypot(i.x - sh.x, i.y - sh.y) < i.r + travel + 20);
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
            // Always make progress (a shell with no range left must not loop forever)
            const step = Math.max(0.5, Math.min(8, travel, sh.left));
            sh.x += sh.dx * step;
            sh.y += sh.dy * step;
            sh.left -= step;
            travel -= step;
            // Player fire can bring down enemy aircraft (aim at them!)
            if (!sh.enemy && !sh.torp) {
                // Plane guns get a bigger hit radius: dogfights against enemy aircraft
                const pl = planeAt(sh.x, sh.y, sh.fromPlane ? 34 : 22);
                if (pl) { hitPlane(pl, sh.dmg); burst(sh.x, sh.y, 4, 'spark', 80, 0.3, 3); sh.done = true; break; }
            }
            const hit = hitShip(sh);
            if (hit) {
                damage(hit, sh.dmg);
                if (sh.torp) { explosion(sh.x, sh.y, true); waterColumn(sh.x, sh.y, 1.6); }
                else if (sh.mg) mgHit(sh.x, sh.y, sh.dx, sh.dy);
                else hitEffect(sh.x, sh.y, sh.dx, sh.dy);
                sh.done = true;
            } else if (sh.torp && isl.some(i => insideIsland(i, sh.x, sh.y))) {
                // Only torpedoes run aground; shells fly over islands
                burst(sh.x, sh.y, 12, 'sand', 60, 1.0, 6);
                burst(sh.x, sh.y, 5, 'spark', 80, 0.3, 3);
                burst(sh.x, sh.y, 4, 'smoke', 20, 1.6, 6);
                sh.done = true;
            } else if (!(sh.left > 0)) {
                if (!sh.torp && onIsland(sh.x, sh.y)) {
                    // Impact on land
                    burst(sh.x, sh.y, sh.mg ? 3 : 12, 'sand', 60, 1.0, sh.mg ? 3 : 6);
                    if (!sh.mg) burst(sh.x, sh.y, 4, 'smoke', 20, 1.6, 6);
                } else if (sh.mg) mgSplash(sh.x, sh.y);
                else if (!sh.torp) waterColumn(sh.x, sh.y, 1);
                sh.done = true;
            }
        }
    }
    shells = shells.filter(s => !s.done);
}

// Any enemy the jets can attack (submerged submarines are not bomb targets)
function anyEnemy() {
    return enemies.some(e => !e.dead && !e.st.sub);
}

// Jets prefer distant ships that no other jet is already attacking
function pickJetTarget(j, c) {
    const taken = new Set(jets.filter(o => o !== j && o.target).map(o => o.target));
    const falling = new Set(bombs.map(b => b.target));   // already doomed by a falling bomb
    let best = null, bs = -Infinity;
    for (const e of enemies) {
        if (e.dead || falling.has(e) || e.st.sub) continue;
        const score = Math.hypot(e.x - c.x, e.y - c.y) - (taken.has(e) ? 5000 : 0);
        if (score > bs) { bs = score; best = e; }
    }
    return best;
}

function aimLaunchers(s, tx, ty, dt) {
    for (const ln of s.launchers) {
        const p = turretPos(s, ln);
        const want = norm(Math.atan2(ty - p.y, tx - p.x) - s.heading);
        ln.rel = norm(ln.rel + clamp(norm(want - ln.rel), -2.5 * dt, 2.5 * dt));
        ln.recoil = Math.max(0, ln.recoil - dt * 2);
    }
}

// Box launcher with four tubes; loaded tubes show red nose caps
function drawLaunchers(s) {
    if (!s.launchers.length) return;
    const ready = !s.st.special || s.specialCd <= 0;
    for (const ln of s.launchers) {
        const p = turretPos(s, ln);
        ctx.save();
        if (s.dead) ctx.globalAlpha = clamp(1 - s.sink / 3.5, 0, 1);
        ctx.translate(p.x, p.y);
        // Mount ring
        ctx.fillStyle = '#2a2e32';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.rotate(s.heading + ln.rel);
        ctx.translate(-ln.recoil * 1.5, 0);
        setShadow(3, 3);
        const g = ctx.createLinearGradient(0, -5, 0, 5);
        g.addColorStop(0, '#9aa2a8');
        g.addColorStop(0.5, '#6c747a');
        g.addColorStop(1, '#41474c');
        ctx.fillStyle = g;
        ctx.beginPath();
        const single = !!s.st.jets;
        if (single) ctx.roundRect(-6, -3, 13, 6, 1.5);
        else ctx.roundRect(-6, -5, 13, 10, 1.5);
        ctx.fill();
        clearShadow();
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        // Tube mouths on the front face (carrier: one tube per launcher)
        const tubes = single ? [[0, 0]] : [[-2.5, 0], [-2.5, 1], [2.5, 0], [2.5, 1]];
        for (const [ty, tz] of tubes) {
            const x = 7 - tz * 0.01, y = ty;
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(x - 1 - tz * 2.6, y, 1.6, 0, 2 * Math.PI);
            ctx.fill();
            if (ready) {
                ctx.fillStyle = '#b8282a';
                ctx.beginPath();
                ctx.arc(x - 1 - tz * 2.6, y, 0.9, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function nearestEnemy(x, y, maxDist, withSubs = false) {
    let best = null, bd = maxDist;
    for (const e of enemies) {
        // Submerged subs are not valid gun/missile targets
        if (e.dead || (e.st.sub && !withSubs)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

// Homing missiles: short launch boost, then accelerate and steer to the target
function updateMissiles(dt) {
    for (const m of missiles) {
        const wasWaiting = m.age < 0;
        // Until it fires, a queued missile sits in its tube and moves/turns with the launcher
        if (wasWaiting && m.launcher && m.owner) {
            const lp = turretPos(m.owner, m.launcher);
            m.a = m.owner.heading + m.launcher.rel;
            m.x = lp.x + Math.cos(m.a) * 7;
            m.y = lp.y + Math.sin(m.a) * 7;
        }
        m.age += dt;
        if (m.age < 0) continue;           // staggered salvo
        if (wasWaiting || !m.fired) {
            m.fired = true;
            if (m.launcher) m.launcher.recoil = 1;
            addParticle({ kind: 'flash', x: m.x, y: m.y, vx: 0, vy: 0, max: 0.1, size: 8, grow: 30, alpha: 1 });
            for (let k = 0; k < 6; k++)
                addParticle({ kind: 'steam', x: m.x, y: m.y, vx: -Math.cos(m.a) * rand(20, 60) + rand(-15, 15), vy: -Math.sin(m.a) * rand(20, 60) + rand(-15, 15), max: rand(1.2, 2), size: 5, grow: 14, alpha: 0.6 });
            playSound('launch', m.x, m.y, 1);
        }
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
            }
            // Missiles fly over islands
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
const DECK_PHASES = ['parked', 'taxiOut', 'cat', 'trap', 'taxiIn', 'park'];
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
    c.deck = { sortieCd: 0, recovering: false, sinceLaunch: JET.launchInterval, cat: [null, null], laneOwner: null, approachOwner: null };
    for (let i = 0; i < c.st.jets; i++) {
        const p = spotPose(c.st, i);
        const j = { spot: i, phase: 'parked', lx: p.x, ly: p.y, la: p.a, sortied: false, alt: 0, bomb: JET.bombs, speed: 0, trail: 0, ttl: 8, x: 0, y: 0, a: 0 };
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
        // After every jet flew: wait until all have landed and parked, then rearm for a minute
        if (deck.recovering && jets.every(j => j.phase === 'parked')) {
            deck.recovering = false;
            deck.sortieCd = JET.sortieCooldown;
        }
        if (deck.sortieCd > 0) {
            deck.sortieCd -= dt;
            if (deck.sortieCd <= 0) for (const j of jets) { j.sortied = false; j.bomb = JET.bombs; }
        }
        // Send the closest fresh jet to a free catapult
        const near = state === 'playing' && anyEnemy();
        if (near && deck.sortieCd <= 0 && !deck.recovering) {
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
        // Pattern speed while approaching and on final, so the jet can turn onto the landing line
        j.speed = approach(j.speed, j.phase === 'final' || j.phase === 'approach' ? finalSpeed : JET.speed, JET.accel * dt);
        if (j.phase !== 'final') j.alt = Math.min(1, j.alt + dt * 0.45);

        if (!deck) {
            // Carrier lost: fly off and disappear
            j.ttl -= dt;
            if (j.ttl <= 0) j.done = true;
            steerJet(j, j.x + Math.cos(j.a) * 100, j.y + Math.sin(j.a) * 100, dt);
        } else if (j.phase === 'air') {
            if (!j.target || j.target.dead) j.target = j.bomb > 0 ? pickJetTarget(j, c) : null;
            if (!j.target && j.bomb > 0 && anyEnemy()) {
                // Bombs left but every ship is already being bombed: loiter over the enemy, not the carrier
                const e = nearestEnemy(j.x, j.y, Infinity);
                if (e) {
                    const ang = Math.atan2(j.y - e.y, j.x - e.x) + 0.6;
                    steerJet(j, e.x + Math.cos(ang) * 350, e.y + Math.sin(ang) * 350, dt);
                }
            } else if (!j.target) {
                j.phase = 'hold';
                j.holdSince = time;
            } else {
                const t = j.target;
                const tx = t.x + Math.cos(t.heading) * t.speed * JET.bombFall;
                const ty = t.y + Math.sin(t.heading) * t.speed * JET.bombFall;
                if (j.alt > 0.8 && j.bomb > 0 && Math.hypot(t.x - j.x, t.y - j.y) < JET.dropDist) {
                    bombs.push({ sx: j.x, sy: j.y, tx, ty, t: 0, target: t });
                    j.bomb--;
                    j.target = null;   // next bomb goes to another ship
                }
                steerJet(j, tx, ty, dt);
            }
        } else if (j.phase === 'hold' && j.bomb > 0 && anyEnemy()) {
            // New enemies while waiting to land: go back out and use the remaining bombs
            j.phase = 'air';
            j.target = null;
        } else if (j.phase === 'hold') {
            // Orbit the carrier until the landing lane is free and it is our turn
            const ang = Math.atan2(j.y - c.y, j.x - c.x) + 0.6;
            steerJet(j, c.x + Math.cos(ang) * JET.holdRadius, c.y + Math.sin(ang) * JET.holdRadius, dt);
            // Next in line may start its approach while the previous jet is still landing
            if (!deck.approachOwner) {
                const first = jets.filter(o => o.phase === 'hold').sort((a, b) => a.holdSince - b.holdSince)[0];
                if (first === j) { deck.approachOwner = j; j.phase = 'approach'; }
            }
        } else {
            const li = laneInfo(c);
            if (j.phase === 'approach') {
                if (Math.hypot(li.ap.x - j.x, li.ap.y - j.y) < 150) {
                    // Only one jet on final / on the landing deck at a time
                    if (!deck.laneOwner || deck.laneOwner === j) {
                        deck.laneOwner = j;
                        if (deck.approachOwner === j) deck.approachOwner = null;
                        j.phase = 'final';
                    } else {
                        const ang = Math.atan2(j.y - li.ap.y, j.x - li.ap.x) + 0.8;
                        steerJet(j, li.ap.x + Math.cos(ang) * 160, li.ap.y + Math.sin(ang) * 160, dt);
                    }
                } else steerJet(j, li.ap.x, li.ap.y, dt);
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
        // Generous hit test around the aimed ship; a bomb sinks any ship outright
        let hit = null;
        const t = b.target;
        if (t && !t.dead) {
            const dx = b.tx - t.x, dy = b.ty - t.y, c2 = Math.cos(t.heading), n2 = Math.sin(t.heading);
            const lx = (dx * c2 + dy * n2) / (t.st.length * 0.75), ly = (-dx * n2 + dy * c2) / (t.st.width * 1.2);
            if (lx * lx + ly * ly <= 1) hit = t;
        }
        hit = hit || hitShip({ x: b.tx, y: b.ty, enemy: false });
        if (hit) {
            // Sinks any ship outright, except the flagship: a bomb costs it only part of its armour
            damage(hit, hit.boss ? hit.maxHp * BOSS.jetBomb : hit.hp + 1);
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
            const enemyNear = state === 'playing' && anyEnemy();
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
                    if (jets.every(o => o.sortied)) deck.recovering = true;
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
                j.phase = 'park';
                j.onWaypoint = null;
            }
            break;
        case 'park': {
            // Pivot slowly into the parking orientation
            const want = spotPose(c.st, j.spot).a, d = norm(want - j.la);
            j.la = norm(j.la + clamp(d, -JET.taxiTurn * 0.5 * dt, JET.taxiTurn * 0.5 * dt));
            if (Math.abs(d) < 0.01) { j.la = want; j.phase = 'parked'; }
            break;
        }
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

// Carrier's own strike jets: same detailed model as the player's aircraft, a bit larger
const DECK_JET = { id: 'deck-jet', name: 'Straaljager', length: 28, span: 25, color: '#8c959e', jet: true, ord: 'bomb' };

function drawJets() {
    for (const j of jets) {
        // Engine off when parked; full burner in the air and on the catapult, idle while taxiing
        const jetPower = j.phase === 'parked' ? false : (AIR_PHASES.includes(j.phase) || j.phase === 'cat') ? 1 : 0.25;
        drawPlane(DECK_JET, j.x, j.y, j.a, j.alt, 1, 1, jetPower);
        // Remaining bombs: one under the fuselage, the rest under the wings
        ctx.save();
        ctx.translate(j.x, j.y);
        ctx.rotate(j.a);
        const k = (0.85 + 0.15 * j.alt) * DECK_JET.length / 22;
        ctx.scale(k, k);
        ctx.fillStyle = '#2a2d30';
        const slots = [[-2, 0], [-3, -4], [-3, 4], [-4, -7], [-4, 7]];
        for (let n = 0; n < Math.min(j.bomb || 0, slots.length); n++) {
            ctx.beginPath();
            ctx.ellipse(slots[n][0], slots[n][1], 2.6, 0.9, 0, 0, 2 * Math.PI);
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
        // Homing mines drift towards the nearest enemy in range
        if (m.seek) {
            const e = nearestEnemy(m.x, m.y, SEEKMINE.range);
            if (e) {
                const d = Math.hypot(e.x - m.x, e.y - m.y) || 1;
                m.x += (e.x - m.x) / d * SEEKMINE.speed * dt;
                m.y += (e.y - m.y) / d * SEEKMINE.speed * dt;
            }
        }
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
    // Enemy fire can also hit escorted friendly ships
    const targets = sh.enemy ? (player ? [player, ...friendlies] : friendlies) : enemies;
    for (const s of targets) {
        if (s.dead) continue;
        // Submerged submarines: only torpedoes and depth charges reach them
        if (s.st.sub && !sh.torp) continue;
        const dx = sh.x - s.x, dy = sh.y - s.y;
        const c = Math.cos(s.heading), n = Math.sin(s.heading);
        const lx = dx * c + dy * n, ly = -dx * n + dy * c;
        const hl = s.st.length / 2, hw = s.st.width / 2;
        if ((lx * lx) / (hl * hl) + (ly * ly) / (hw * hw) <= 1) {
            if (s.boss) bossPartHit(s, sh.x, sh.y, sh.dmg || MISSILE.damage);
            return s;
        }
    }
    return null;
}

// byPlayer = false for self-inflicted damage (no coins)
function damage(s, dmg, byPlayer = true) {
    // Active armour absorbs most of the damage
    if (s.st.special === 'shield' && s.specialT > 0) dmg *= 1 - SHIELD.reduce;
    onDamaged(s, dmg);
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
            onEnemyKilled(s);
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
    // Brown noise (integrated white) for deep rumbles and water
    const brown = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const bd = brown.getChannelData(0);
    let lastB = 0;
    for (let i = 0; i < bd.length; i++) { lastB = (lastB + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = lastB * 3.5; }

    audio = { ctx: ac, master, noise, brown, eng: null, engKey: '', last: {} };
    if (player) setEngine(player.st);
}

function setMuted(m) {
    muted = m;
    if (audio) audio.master.gain.setTargetAtTime(m ? 0 : 0.7, audio.ctx.currentTime, 0.05);
}

// Engine sound profiles, mostly noise-based (real ships sound like rushing water and machinery, not tones)
// tone: [type, f0, f1, cut0, cut1, mix] quiet harmonic body; pulse: [freq, Q, mix] machinery noise band;
// am: [hz0, hz1, depth] firing-rate chug on the pulse band; rumble: [lowpass, mix] brown-noise hull rumble;
// wash: [freq, mix] bow wave/wake, scales with speed; whine: [f0, f1, gain] turbine; wind: [freq, Q, mix] wind over deck
const ENGINE_PROFILES = {
    // Small fast boats: high-revving engine bark and loud bow spray
    boat: { tone: ['sawtooth', 45, 120, 300, 1400, 0.16], pulse: [650, 0.8, 0.55], am: [12, 32, 0.8], rumble: [130, 0.35], wash: [1500, 1.0], whine: null, wind: null, vol: 0.8 },
    // Frigates: medium-speed diesels, clear chug
    diesel: { tone: ['sawtooth', 28, 55, 150, 500, 0.14], pulse: [220, 0.9, 0.8], am: [5, 11, 0.85], rumble: [90, 0.6], wash: [900, 0.75], whine: null, wind: null, vol: 1 },
    // Cruisers: gas turbines, jet-like roar with a faint whine
    turbine: { tone: ['triangle', 30, 55, 150, 450, 0.07], pulse: [1800, 0.6, 0.45], am: null, rumble: [80, 0.6], wash: [950, 0.75], whine: [900, 2200, 0.02], wind: null, vol: 0.9 },
    // Heavy cruisers: slow, deep diesel thumping
    heavy: { tone: ['sawtooth', 22, 40, 120, 350, 0.14], pulse: [160, 0.9, 0.9], am: [3, 6.5, 0.85], rumble: [70, 0.8], wash: [700, 0.85], whine: null, wind: null, vol: 1.1 },
    // Battleships: steam turbines, hiss and deep rumble
    battleship: { tone: ['sine', 20, 32, 100, 250, 0.12], pulse: [500, 0.5, 0.35], am: null, rumble: [60, 1.0], wash: [600, 0.95], whine: [320, 560, 0.012], wind: null, vol: 1.2 },
    // Carrier: broadband rush — low-frequency hull rumble, ventilation and wind across the flight deck
    carrier: { tone: null, pulse: [250, 0.7, 0.45], am: null, rumble: [110, 1.2], wash: [550, 1.0], whine: null, wind: [700, 0.5, 0.55], vol: 1.25 }
};
const ENGINE_BY_SHIP = {
    korvet: 'boat', jager: 'boat', wesp: 'boat', horzel: 'boat', specht: 'boat',
    fregat: 'diesel', spin: 'diesel', schim: 'diesel',
    kruiser: 'turbine', valk: 'turbine', orka: 'turbine', arend: 'turbine',
    monitor: 'heavy', zwaar: 'heavy', furie: 'heavy', zeus: 'heavy',
    titan: 'battleship', leviathan: 'battleship', poseidon: 'carrier',
    zwaluw: 'turbine', storm: 'turbine', tornado: 'turbine'
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
    const nodes = [];
    const loopNoise = buf => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rand(0.9, 1.1); nodes.push(s); return s; };
    const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const lfoTo = (param, f, depth) => { const o = ac.createOscillator(); o.frequency.value = f; const g = gain(depth); o.connect(g); g.connect(param); nodes.push(o); return o; };
    const e = { pr, out, nodes };
    // Quiet harmonic engine body
    if (pr.tone) {
        e.o1 = ac.createOscillator();
        e.o1.type = pr.tone[0];
        e.o1.frequency.value = pr.tone[1];
        e.toneF = filt('lowpass', pr.tone[3], 0.7);
        e.o1.connect(e.toneF);
        e.toneF.connect(gain(pr.tone[5])).connect(out);
        nodes.push(e.o1);
    }
    // Machinery noise band, pulsed at firing rate for diesels
    {
        const [f, q, mix] = pr.pulse;
        e.pulseBase = f;
        e.pulseF = filt('bandpass', f, q);
        const g = gain(pr.am ? mix * (1 - pr.am[2] * 0.5) : mix);
        loopNoise(audio.noise).connect(e.pulseF);
        e.pulseF.connect(g);
        g.connect(out);
        if (pr.am) e.lfo = lfoTo(g.gain, pr.am[0], mix * pr.am[2] * 0.5);
    }
    // Deep hull rumble
    {
        const lp = filt('lowpass', pr.rumble[0], 0.5);
        loopNoise(audio.brown).connect(lp);
        lp.connect(gain(pr.rumble[1])).connect(out);
    }
    // Bow wave and wake: water rush that grows with speed, with a slow swell
    {
        e.washF = filt('bandpass', pr.wash[0], 0.5);
        e.washG = gain(0);
        loopNoise(audio.noise).connect(e.washF);
        e.washF.connect(e.washG);
        const sw = gain(1);
        e.washG.connect(sw);
        sw.connect(out);
        lfoTo(sw.gain, 0.17, 0.25);
    }
    // Wind gusting across a large flat deck
    if (pr.wind) {
        const bp = filt('bandpass', pr.wind[0], pr.wind[1]);
        e.windG = gain(pr.wind[2] * 0.5);
        loopNoise(audio.noise).connect(bp);
        bp.connect(e.windG);
        const sw = gain(1);
        e.windG.connect(sw);
        sw.connect(out);
        lfoTo(sw.gain, 0.11, 0.35);
    }
    // Turbine whine
    if (pr.whine) {
        e.turb = ac.createOscillator();
        e.turb.type = 'sine';
        e.turb.frequency.value = pr.whine[0];
        e.turb.connect(gain(pr.whine[2])).connect(out);
        nodes.push(e.turb);
    }
    nodes.forEach(n => n.start());
    audio.eng = e;
    audio.engKey = key;
}

// Engine pitch, tone and volume follow the throttle and speed
function updateEngineSound() {
    updatePlaneSound();
    if (!audio || !audio.eng) return;
    const e = audio.eng, pr = e.pr, t = audio.ctx.currentTime;
    // Ship engine falls silent while you fly
    const on = player && !player.dead && state === 'playing' && !flying;
    const frac = on ? clamp(Math.abs(player.speed) / player.st.speed, 0, 1) : 0;
    const thr = on ? Math.abs(player.throttle) : 0;
    const rpm = clamp(frac * 0.8 + thr * 0.2, 0, 1);
    if (e.o1) {
        e.o1.frequency.setTargetAtTime(lerp(pr.tone[1], pr.tone[2], rpm), t, 0.25);
        e.toneF.frequency.setTargetAtTime(lerp(pr.tone[3], pr.tone[4], rpm), t, 0.25);
    }
    e.pulseF.frequency.setTargetAtTime(e.pulseBase * (0.8 + rpm * 0.6), t, 0.3);
    if (e.lfo) e.lfo.frequency.setTargetAtTime(lerp(pr.am[0], pr.am[1], rpm), t, 0.3);
    if (e.turb) e.turb.frequency.setTargetAtTime(lerp(pr.whine[0], pr.whine[1], rpm), t, 0.4);
    // Water noise follows actual speed through the water
    e.washG.gain.setTargetAtTime(pr.wash[1] * Math.pow(frac, 1.3) * 1.4, t, 0.4);
    e.washF.frequency.setTargetAtTime(pr.wash[0] * (0.7 + frac * 0.6), t, 0.4);
    if (e.windG) e.windG.gain.setTargetAtTime(pr.wind[2] * (0.4 + frac * 0.8), t, 0.5);
    e.out.gain.setTargetAtTime(on ? (0.05 + rpm * 0.09) * pr.vol : 0, t, 0.3);
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
    const range = { boom: 3400, cannon: 2600, launch: 2400, jet: 2600, mg: 2000, ping: 1800, hit: 2600, splash: 2000 }[kind];
    const base = { boom: 1.1, cannon: 0.6, launch: 0.5, jet: 0.35, mg: 0.3, ping: 0.12, hit: 0.55, splash: 0.3 }[kind];
    if (!range) return;
    const sp = spatial(x, y, range);
    const vol = sp.vol * base * (kind === 'cannon' ? Math.min(size, 1.3) : size);
    if (vol < 0.01) return;
    const s = clamp(size, 0.4, 2.5);

    // Output chain: air absorption (distant sounds lose their highs) -> pan -> master
    const out = ac.createGain();
    const air = ac.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = lerp(14000, 900, clamp(Math.hypot(x - cam.x, y - cam.y) / range, 0, 1));
    out.connect(air);
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { pan.pan.value = sp.pan; air.connect(pan); pan.connect(audio.master); }
    else air.connect(audio.master);

    // Filtered noise burst with attack/decay envelope
    const burst = o => {
        const t0 = t + (o.delay || 0);
        const src = ac.createBufferSource();
        src.buffer = o.brown ? audio.brown : audio.noise;
        src.loop = true;
        src.playbackRate.value = rand(0.8, 1.15);
        const f = ac.createBiquadFilter();
        f.type = o.type || 'lowpass';
        f.Q.value = o.q || 0.7;
        f.frequency.setValueAtTime(o.f0, t0);
        if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
        const env = ac.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t0 + (o.at || 0.003));
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
        src.connect(f); f.connect(env); env.connect(out);
        src.start(t0, rand(0, 1.5));
        src.stop(t0 + o.dur + 0.05);
    };
    // Sine with falling pitch: pressure wave / body
    const thump = o => {
        const t0 = t + (o.delay || 0);
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(o.f0, t0);
        osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur * 0.7);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
        osc.connect(g); g.connect(out);
        osc.start(t0);
        osc.stop(t0 + o.dur + 0.05);
    };

    switch (kind) {
        case 'cannon':
            // Sharp muzzle crack, blast body, low punch and a rolling echo over the water
            burst({ type: 'highpass', f0: 2500, q: 0.5, at: 0.001, dur: 0.04 + 0.03 * s, g: vol * 0.7 });
            burst({ type: 'lowpass', f0: 2600 / s, f1: 220 / s, at: 0.002, dur: 0.18 + 0.35 * s, g: vol });
            thump({ f0: 110 / s, f1: 40 / s, dur: 0.15 + 0.25 * s, g: vol * 0.9 });
            burst({ brown: true, type: 'lowpass', f0: 500, f1: 150, at: 0.06, dur: 0.8 + 1.0 * s, g: vol * 0.45, delay: 0.05 });
            break;
        case 'mg':
            // Short dry report
            burst({ type: 'highpass', f0: 1800, at: 0.001, dur: 0.035, g: vol });
            burst({ type: 'lowpass', f0: 1800, f1: 400, at: 0.001, dur: 0.08, g: vol * 0.6 });
            thump({ f0: 160, f1: 80, dur: 0.05, g: vol * 0.5 });
            break;
        case 'boom': {
            // Shock crack, darkening blast, sub-bass pressure wave, long rumble and debris crackle
            burst({ type: 'highpass', f0: 1200, at: 0.001, dur: 0.06, g: vol * 0.6 });
            burst({ type: 'lowpass', f0: 3000, f1: 180, at: 0.004, dur: 0.6 + 0.5 * s, g: vol });
            thump({ f0: 70, f1: 28, dur: 0.8 + 0.6 * s, g: vol * 1.1 });
            burst({ brown: true, type: 'lowpass', f0: 400, f1: 90, at: 0.15, dur: 1.8 + 1.4 * s, g: vol * 0.8, delay: 0.05 });
            const n = Math.round(4 + 4 * s);
            for (let i = 0; i < n; i++) {
                burst({ type: 'bandpass', f0: rand(1500, 4500), q: 2, at: 0.001, dur: rand(0.03, 0.09), g: vol * rand(0.15, 0.35), delay: rand(0.1, 1.2) });
            }
            break;
        }
        case 'hit':
            // Shell on armour: metallic ring plus a short blast
            for (const f of [rand(700, 900), rand(1500, 1900), rand(2900, 3400)]) {
                burst({ type: 'bandpass', f0: f, q: 18, at: 0.001, dur: rand(0.25, 0.45), g: vol * 4 });
            }
            burst({ type: 'lowpass', f0: 2500, f1: 200, at: 0.002, dur: 0.35, g: vol * 0.7 });
            thump({ f0: 120, f1: 50, dur: 0.2, g: vol * 0.6 });
            break;
        case 'splash':
            // Dull plop, water column, then hiss of falling spray
            thump({ f0: 90, f1: 45, dur: 0.18, g: vol * 0.7 });
            burst({ type: 'bandpass', f0: 900, f1: 350, q: 0.8, at: 0.015, dur: 0.5, g: vol });
            burst({ type: 'highpass', f0: 3000, at: 0.12, dur: 0.9, g: vol * 0.4, delay: 0.15 });
            break;
        case 'launch':
            // Missile ignition pop followed by a roaring rocket hiss
            thump({ f0: 140, f1: 60, dur: 0.12, g: vol * 0.6 });
            burst({ type: 'bandpass', f0: 1200, f1: 2600, q: 0.7, at: 0.02, dur: 1.1, g: vol });
            burst({ brown: true, type: 'lowpass', f0: 500, f1: 250, at: 0.03, dur: 1.0, g: vol * 0.7 });
            break;
        case 'jet':
            // Rising jet roar
            burst({ type: 'lowpass', f0: 600, f1: 3500, at: 0.3, dur: 1.8, g: vol });
            burst({ brown: true, type: 'lowpass', f0: 300, at: 0.4, dur: 2.0, g: vol * 0.8 });
            break;
        case 'ping':
            burst({ type: 'highpass', f0: 3000, at: 0.001, dur: 0.06, g: vol });
            break;
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

    const visible = islandsNear(cam.x, cam.y, Math.max(hw, hh) + ISLAND_MAX_R * 1.6).filter(isl =>
        isl.x + isl.r * 1.6 > view.x0 && isl.x - isl.r * 1.6 < view.x1 && isl.y + isl.r * 1.6 > view.y0 && isl.y - isl.r * 1.6 < view.y1);
    runIslandJobs(Math.max(hw, hh) + 1600 + ISLAND_MAX_R);
    for (const isl of visible) drawIsland(isl);
    evictIslandSprites(Math.max(hw, hh) + 2400 + ISLAND_MAX_R);

    drawParticles(0);
    drawParticles(1);
    drawMines();
    drawTorpedoes();
    drawHarbors(view);
    drawDepthCharges();
    for (const e of enemies) drawShip(e);
    for (const f of friendlies) drawShip(f);
    if (player) drawShip(player);
    drawShells();
    drawParticles(2);
    drawMissiles();
    drawBombs();
    drawJets();
    drawAir();
    drawParticles(3);

    drawClouds(view);
    if (player && !player.dead && state === 'playing' && !flying) drawAim();
    for (const e of enemies) drawHealthBar(e);
    for (const f of friendlies) drawHealthBar(f);
    drawMissionMarker();

    ctx.restore();
    drawEnvironment();
    drawVignette();
    drawMinimap();
    drawHudOverlay();
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
const islandSeed = isl => (Math.floor(isl.x * 13 + isl.y * 7) | 0) & 0xffff;

// Elevation at an island-local point (0 = coastline, 1 = island centre, < 0 = water)
function islandHeight(isl, x, y, sd) {
    const d = Math.hypot(x, y), a = Math.atan2(y, x);
    const edge = d / coastRadius(isl, a);
    // Far out in the water: skip the noise (fully transparent anyway)
    if (edge > 1.5) return -1;
    const n = vfbm(x * 0.018, y * 0.018, sd, 4);
    let h = 1 - edge + (n - 0.5) * 0.12 * Math.min(1, edge * 1.5);
    if (h > 0) h += (n - 0.5) * 0.5 * h + (isl.r > 110 ? Math.pow(Math.max(0, vfbm(x * 0.008, y * 0.008, sd + 7, 3) - 0.35), 1.5) * 1.6 * h : 0);
    return h;
}

// Forest trees: grid spacing, crown radius (world units) and number of sprite variants
const TREE = { cell: 12, r: 8, variants: 6 };
let treeSpriteCache = null;

// Pre-rendered tree crowns (clustered leaf blobs, lit from the top-left) plus matching shadows
function treeSprites() {
    if (treeSpriteCache) return treeSpriteCache;
    const P = 64, greens = [[46, 96, 40], [60, 112, 44], [38, 82, 46], [72, 118, 48], [52, 104, 36], [34, 74, 34]];
    const crown = [], shadow = [];
    for (let v = 0; v < TREE.variants; v++) {
        const base = greens[v % greens.length];
        const blobs = [];
        const n = 6 + Math.floor(rand(0, 4));
        for (let k = 0; k < n; k++) {
            const a = rand(0, 2 * Math.PI), d = rand(0, P * 0.2);
            blobs.push({ x: P / 2 + Math.cos(a) * d, y: P / 2 + Math.sin(a) * d, r: rand(P * 0.16, P * 0.24) });
        }
        // Shadow silhouette
        const sc = makeCanvas(P, P), sg = sc.getContext('2d');
        sg.fillStyle = 'rgba(0,25,0,.32)';
        for (const b of blobs) { sg.beginPath(); sg.arc(b.x, b.y, b.r, 0, 2 * Math.PI); sg.fill(); }
        shadow.push(sc);
        // Crown: dark rim, lit leaf clusters, small highlights
        const cc = makeCanvas(P, P), cg = cc.getContext('2d');
        for (const b of blobs) {
            cg.fillStyle = `rgb(${base[0] * 0.55},${base[1] * 0.55},${base[2] * 0.55})`;
            cg.beginPath(); cg.arc(b.x + 1, b.y + 1.5, b.r, 0, 2 * Math.PI); cg.fill();
        }
        for (const b of blobs) {
            const gr = cg.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, 0, b.x, b.y, b.r);
            gr.addColorStop(0, `rgb(${base[0] * 1.6},${base[1] * 1.45},${base[2] * 1.3})`);
            gr.addColorStop(0.6, `rgb(${base[0]},${base[1]},${base[2]})`);
            gr.addColorStop(1, `rgb(${base[0] * 0.7},${base[1] * 0.7},${base[2] * 0.7})`);
            cg.fillStyle = gr;
            cg.beginPath(); cg.arc(b.x, b.y, b.r * 0.92, 0, 2 * Math.PI); cg.fill();
        }
        // Leaf texture speckles
        for (let k = 0; k < 40; k++) {
            const b = blobs[k % blobs.length], a = rand(0, 2 * Math.PI), d = rand(0, b.r * 0.8);
            cg.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,200,.12)' : 'rgba(0,30,0,.18)';
            cg.beginPath(); cg.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, rand(1, 2.5), 0, 2 * Math.PI); cg.fill();
        }
        crown.push(cc);
    }
    return treeSpriteCache = { crown, shadow };
}

// Palm trees along the beach and forest edge; generated once per island so tiles match
function islandPalms(isl) {
    if (isl.palms) return isl.palms;
    const sd = islandSeed(isl), palms = [];
    for (let k = 0, tries = 0; k < Math.round(isl.r / 7) && tries < Math.round(isl.r / 7) * 20; tries++) {
        const a = rand(0, 2 * Math.PI), d = coastRadius(isl, a) * rand(0.62, 0.95);
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        const h = islandHeight(isl, x, y, sd);
        if (h < 0.06 || h > 0.4) continue;
        const n = 6 + Math.floor(rand(0, 3));
        palms.push({ x, y, s: rand(1.4, 2.1), rot: rand(0, 6.28), n,
            jr: Array.from({ length: n }, () => rand(-0.15, 0.15)), jl: Array.from({ length: n }, () => rand(0.85, 1.1)) });
        k++;
    }
    return isl.palms = palms;
}

// Renders an island region: the whole island (overview, capped resolution) or one full-detail tile
function* islandSpriteJob(isl, tile = null) {
    const R = isl.r * 1.5;
    const x0 = tile ? tile.x0 : -R, y0 = tile ? tile.y0 : -R, size = tile ? tile.size : R * 2;
    // Tile entirely in open water: nothing to draw
    if (tile) {
        const cx = clamp(0, x0, x0 + size), cy = clamp(0, y0, y0 + size);
        if (Math.hypot(cx, cy) > isl.r * 1.42) return null;
    }
    // Terrain pixels per world unit; the overview is capped so huge islands stay affordable
    const full = quality.gpu ? 2.4 : 1.2;
    // Overview (seen from afar) is much sharper with a GPU; tiles follow their detail level
    const res = tile ? Math.min(full, tile.S * 0.8) : Math.min(full, (quality.gpu ? 2048 : 1200) / size);
    const N = Math.ceil(size * res);
    const sd = islandSeed(isl);
    const hills = isl.r > 110;

    // Pass 1: elevation and forest mask
    const H = new Float32Array(N * N), F = new Float32Array(N * N);
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const x = x0 + px / res, y = y0 + py / res;
            const h = islandHeight(isl, x, y, sd);
            H[py * N + px] = h;
            // Forest mask only matters on land
            F[py * N + px] = h > 0.1 ? vfbm(x * 0.03, y * 0.03, sd + 99, 3) : 0;
        }
        if (performance.now() > jobDeadline) yield;
    }

    // Pass 2: colour
    const tc = makeCanvas(N, N), tg = tc.getContext('2d');
    const img = tg.createImageData(N, N), D = img.data;
    const SHALLOW = [70, 196, 190], SANDBED = [196, 205, 160], WET = [176, 156, 108], SAND = [232, 214, 165], SAND2 = [214, 190, 138];
    const GRASS = [120, 152, 72], GRASS2 = [96, 132, 58], FOREST = [42, 86, 38], FOREST2 = [62, 108, 46], ROCK = [128, 116, 98], ROCK2 = [160, 150, 132];
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const i = py * N + px, h = H[i];
            const o = i * 4;
            if (h < -0.4) { D[o + 3] = 0; continue; }
            const x = x0 + px / res, y = y0 + py / res;
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
                if (f > 0.47) {
                    // Forest floor; the individual trees are drawn on top
                    land = mixc(FOREST, FOREST2, vnoise(x * 0.1, y * 0.1, sd + 11));
                    land = mixc(land, [90, 110, 60], grain * 0.25);
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
            D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = alpha;
        }
        if (performance.now() > jobDeadline) yield;
    }
    tg.putImageData(img, 0, 0);

    // Final sprite at display resolution
    const S = tile ? tile.S : Math.min(spriteScale, (quality.gpu ? 4096 : 3072) / size);
    const c = makeCanvas(size * S, size * S);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(tc, 0, 0, c.width, c.height);
    g.scale(S, S);
    g.translate(-x0, -y0);
    const inRegion = (x, y, m) => x > x0 - m && x < x0 + size + m && y > y0 - m && y < y0 + size + m;

    // Shore rocks: irregular boulders with shadow (shape stored so tiles match)
    for (const r of isl.rocks) {
        if (!inRegion(r.x, r.y, r.r * 2)) continue;
        if (!r.pts) r.pts = Array.from({ length: 7 }, () => r.r * rand(0.65, 1));
        const pts = r.pts;
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

    // Individual forest trees (deterministic grid, so tiles and overview match)
    const trees = [];
    const cell = TREE.cell;
    for (let gy = Math.floor((y0 - 15) / cell); gy <= Math.ceil((y0 + size + 15) / cell); gy++) {
        for (let gx = Math.floor((x0 - 15) / cell); gx <= Math.ceil((x0 + size + 15) / cell); gx++) {
            const hs = hash2(gx, gy, sd + 201);
            if (hs < 0.06) continue;
            const x = (gx + hash2(gx, gy, sd + 202)) * cell, y = (gy + hash2(gx, gy, sd + 203)) * cell;
            const d = Math.hypot(x, y);
            if (d > isl.r) continue;
            const h = islandHeight(isl, x, y, sd);
            if (h < 0.2 || (hills && h > 0.85)) continue;
            const f = vfbm(x * 0.03, y * 0.03, sd + 99, 3);
            // Dense in forest, a few loose trees on the grass
            if (f < 0.47 && hs < 0.95) continue;
            trees.push({ x, y, s: 0.75 + hash2(gx, gy, sd + 204) * 0.7, v: Math.floor(hash2(gx, gy, sd + 205) * TREE.variants) });
        }
        if (performance.now() > jobDeadline) yield;
    }
    const ts = treeSprites();
    // Shadows first, then crowns
    for (let k = 0; k < trees.length; k++) {
        const t = trees[k], R = TREE.r * t.s * 1.25;
        g.drawImage(ts.shadow[t.v], t.x + SUN.x * 4 * t.s - R, t.y + SUN.y * 4 * t.s - R, R * 2, R * 2);
        if ((k & 1023) === 1023 && performance.now() > jobDeadline) yield;
    }
    for (let k = 0; k < trees.length; k++) {
        const t = trees[k], R = TREE.r * t.s * 1.25;
        g.drawImage(ts.crown[t.v], t.x - R, t.y - R, R * 2, R * 2);
        if ((k & 1023) === 1023 && performance.now() > jobDeadline) yield;
    }

    // Palm trees along the beach and the forest edge
    const palms = islandPalms(isl).filter(p => inRegion(p.x, p.y, 40));
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
            g.rotate(2 * Math.PI / p.n + p.jr[k]);
            const len = 9 * p.s * p.jl[k];
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
    return { canvas: c, R, x0, y0, size, S };
}

// Frees sprites of islands far outside the view
function evictIslandSprites(keep) {
    const far = Math.max(3500, keep);
    for (const isl of spritedIslands) {
        if (Math.hypot(isl.x - cam.x, isl.y - cam.y) > far) {
            isl.sprite = null;
            isl.tiles = null;
            spritedIslands.delete(isl);
        }
    }
    for (const isl of islandJobs.keys())
        if (Math.hypot(isl.x - cam.x, isl.y - cam.y) > far) islandJobs.delete(isl);
    // Detail tiles: keep only those near the view, at the current detail level (or one still in use as stand-in)
    const hw = vw / 2 / zoom, hh = vh / 2 / zoom, m = ISL_TILE * 1.5, lvl = tileLevel();
    for (const isl of spritedIslands) {
        if (!isl.tiles) continue;
        for (const [key, t] of isl.tiles) {
            const [l, cell] = key.split('|');
            const [i, j] = cell.split(',').map(Number);
            const wx = isl.x + tileOrigin(isl, i) + ISL_TILE / 2, wy = isl.y + tileOrigin(isl, j) + ISL_TILE / 2;
            const far = Math.abs(wx - cam.x) > hw + m || Math.abs(wy - cam.y) > hh + m;
            const stale = +l !== lvl && isl.tiles.get(lvl + '|' + cell) !== undefined;
            if (zoom * dpr < isl.sprite.S * 0.8 || far || stale) isl.tiles.delete(key);
        }
    }
    for (const [key, job] of tileJobs) {
        const wx = job.isl.x + job.cx, wy = job.isl.y + job.cy;
        if (!job.isl.tiles || !job.isl.sprite || job.lvl !== lvl || zoom * dpr < job.isl.sprite.S * 0.8 || Math.abs(wx - cam.x) > hw + m || Math.abs(wy - cam.y) > hh + m) tileJobs.delete(key);
    }
}

// ---------- full-detail island tiles (used when zoomed in) ----------
const ISL_TILE = 800;         // tile size in world units
const tileJobs = new Map();
// Detail levels: sprite pixels per world unit; top level beats the ship sprites (3 with GPU, 1.5 without)
const TILE_LEVELS = [0.6, 1.2, 1.8, 2.4, 3.6];
// Tiles take over once the overview sprite would be magnified on screen
const needsTiles = sp => zoom * dpr > sp.S * 1.1;
const tileOrigin = (isl, i) => -isl.r * 1.5 + i * ISL_TILE;

// Lowest detail level that is at least as sharp as the screen
function tileLevel() {
    // Highest level: at least as sharp as the ship sprites
    let max = TILE_LEVELS.findIndex(v => v >= spriteScale * 1.15);
    if (max < 0) max = TILE_LEVELS.length - 1;
    // Fully zoomed in: never below the ship sprites' sharpness
    const need = Math.max(zoom * dpr, userZoom >= ZOOM_MAX * 0.9 ? spriteScale : 0);
    for (let l = 0; l <= max; l++) if (TILE_LEVELS[l] >= need) return l;
    return max;
}

// Draws visible detail tiles (or the matching part of the overview while a tile is building); false when zoomed out
function drawIslandTiles(isl) {
    const sp = isl.sprite;
    // Overview sharp enough at this zoom: no tiles needed
    if (!sp || !needsTiles(sp)) return false;
    if (!isl.tiles) isl.tiles = new Map();
    const hw = vw / 2 / zoom, hh = vh / 2 / zoom;
    const k = sp.canvas.width / (sp.R * 2), cw = sp.canvas.width;
    const n = Math.ceil(isl.r * 3 / ISL_TILE), lvl = tileLevel();
    for (let i = 0; i < n; i++) {
        const lx = tileOrigin(isl, i), wx = isl.x + lx;
        if (wx + ISL_TILE < cam.x - hw || wx > cam.x + hw) continue;
        for (let j = 0; j < n; j++) {
            const ly = tileOrigin(isl, j), wy = isl.y + ly;
            if (wy + ISL_TILE < cam.y - hh || wy > cam.y + hh) continue;
            const cell = i + ',' + j, key = lvl + '|' + cell;
            const t = isl.tiles.get(key);
            if (t) {
                // Tiny overlap hides hairline seams between tiles
                ctx.drawImage(t.canvas, wx, wy, ISL_TILE + 0.6, ISL_TILE + 0.6);
                continue;
            }
            if (t === null) continue;   // open water
            const jk = isl.x + ',' + isl.y + ':' + key;
            if (!tileJobs.has(jk))
                tileJobs.set(jk, { isl, key, lvl, cx: lx + ISL_TILE / 2, cy: ly + ISL_TILE / 2,
                    gen: islandSpriteJob(isl, { x0: lx, y0: ly, size: ISL_TILE, S: TILE_LEVELS[lvl] }) });
            // Stand-in while building: the same tile at another detail level, else the overview
            let alt = null;
            for (let l = TILE_LEVELS.length - 1; l >= 0 && !alt; l--) if (l !== lvl) alt = isl.tiles.get(l + '|' + cell);
            if (alt) {
                ctx.drawImage(alt.canvas, wx, wy, ISL_TILE + 0.6, ISL_TILE + 0.6);
            } else {
                const sx = (lx + sp.R) * k, sy = (ly + sp.R) * k;
                const sw = Math.min(ISL_TILE * k, cw - sx), sh = Math.min(ISL_TILE * k, cw - sy);
                if (sw > 0 && sh > 0) ctx.drawImage(sp.canvas, sx, sy, sw, sh, wx, wy, sw / k, sh / k);
            }
        }
    }
    return true;
}

// Builds queued detail tiles within the remaining frame budget, nearest first
function runTileJobs() {
    if (!tileJobs.size || performance.now() > jobDeadline) return;
    const order = [...tileJobs.entries()].sort((a, b) =>
        Math.hypot(a[1].isl.x + a[1].cx - cam.x, a[1].isl.y + a[1].cy - cam.y) - Math.hypot(b[1].isl.x + b[1].cx - cam.x, b[1].isl.y + b[1].cy - cam.y));
    for (const [jk, job] of order) {
        if (performance.now() > jobDeadline) break;
        let r;
        try { r = job.gen.next(); }
        catch (err) {
            // e.g. out of canvas memory on a phone: skip this tile instead of failing every frame
            console.warn('island tile failed:', err);
            r = { done: true, value: null };
        }
        if (r.done) {
            if (job.isl.tiles) job.isl.tiles.set(job.key, r.value || null);
            tileJobs.delete(jk);
        }
    }
}

// Builds island sprites in the background: a few ms per frame, nearest first, ahead of the view
const islandJobs = new Map();
let jobDeadline = 0;
function runIslandJobs(radius) {
    for (const isl of islandsNear(cam.x, cam.y, radius))
        if (!isl.sprite && !islandJobs.has(isl) && !(isl.failT > time - 15)) islandJobs.set(isl, islandSpriteJob(isl));
    jobDeadline = performance.now() + (quality.gpu ? 8 : 5);
    if (!islandJobs.size) { runTileJobs(); return; }
    const order = [...islandJobs.keys()].sort((a, b) => Math.hypot(a.x - cam.x, a.y - cam.y) - Math.hypot(b.x - cam.x, b.y - cam.y));
    for (const isl of order) {
        if (performance.now() > jobDeadline) break;
        let r;
        try { r = islandJobs.get(isl).next(); }
        catch (err) {
            // Failed build (memory): keep the simple stand-in and retry later
            console.warn('island sprite failed:', err);
            isl.failT = time;
            islandJobs.delete(isl);
            continue;
        }
        if (r.done) {
            isl.sprite = r.value || null;
            if (isl.sprite) spritedIslands.add(isl);
            else isl.failT = time;
            islandJobs.delete(isl);
        }
    }
    runTileJobs();
}

function drawIsland(isl) {
    const sp = isl.sprite;
    if (sp) {
        // Zoomed in: detail tiles (overview fills gaps); zoomed out: overview only
        if (!drawIslandTiles(isl)) ctx.drawImage(sp.canvas, isl.x - sp.R, isl.y - sp.R, sp.R * 2, sp.R * 2);
    } else {
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
// Hull outline per ship style; set before drawing a ship
let hullShape = 'std';
const SHAPE_BY_STYLE = { jager: 'slim', fregat: 'std', kruiser: 'cruiser', zwaar: 'heavy', titan: 'battle', carrier: 'carrier' };
const shapeOf = st => SHAPE_BY_STYLE[st.style] || 'std';

// Carrier flight deck outline (fractions of length / width): angled-deck overhang to port, island sponson to starboard
const CARRIER_DECK = [
    [0.50, -0.16], [0.50, 0.14], [0.44, 0.30], [0.20, 0.40], [-0.05, 0.42], [-0.30, 0.40], [-0.47, 0.34],
    [-0.50, 0.20], [-0.50, -0.30], [-0.45, -0.40], [-0.10, -0.50], [0.12, -0.45], [0.40, -0.38]
];

function hullPath(L, W, bow = 0.15) {
    const t = L * bow, c = (L / 2 + t) / 2;
    ctx.beginPath();
    switch (hullShape) {
        case 'carrier':
            CARRIER_DECK.forEach(([fx, fy], i) => i ? ctx.lineTo(fx * L, fy * W) : ctx.moveTo(fx * L, fy * W));
            ctx.closePath();
            return;
        case 'slim':
            // Pointed bow, narrow transom
            ctx.moveTo(L / 2, 0);
            ctx.quadraticCurveTo(c, -W / 2, t, -W / 2);
            ctx.lineTo(-L * 0.22, -W / 2);
            ctx.quadraticCurveTo(-L * 0.46, -W * 0.46, -L / 2, -W * 0.15);
            ctx.lineTo(-L / 2, W * 0.15);
            ctx.quadraticCurveTo(-L * 0.46, W * 0.46, -L * 0.22, W / 2);
            ctx.lineTo(t, W / 2);
            ctx.quadraticCurveTo(c, W / 2, L / 2, 0);
            ctx.closePath();
            return;
        case 'cruiser':
            // Flared clipper bow, round cruiser stern
            ctx.moveTo(L / 2, 0);
            ctx.bezierCurveTo(L * 0.42, -W * 0.16, L * 0.3, -W / 2, t, -W / 2);
            ctx.lineTo(-L * 0.3, -W / 2);
            ctx.bezierCurveTo(-L * 0.44, -W / 2, -L / 2, -W * 0.3, -L / 2, 0);
            ctx.bezierCurveTo(-L / 2, W * 0.3, -L * 0.44, W / 2, -L * 0.3, W / 2);
            ctx.lineTo(t, W / 2);
            ctx.bezierCurveTo(L * 0.3, W / 2, L * 0.42, W * 0.16, L / 2, 0);
            ctx.closePath();
            return;
        case 'heavy':
            // Blunt bow, full midship, wide rounded transom
            ctx.moveTo(L / 2, 0);
            ctx.quadraticCurveTo(L * 0.44, -W * 0.44, t, -W / 2);
            ctx.lineTo(-L * 0.38, -W / 2);
            ctx.quadraticCurveTo(-L / 2, -W * 0.48, -L / 2, -W * 0.2);
            ctx.lineTo(-L / 2, W * 0.2);
            ctx.quadraticCurveTo(-L / 2, W * 0.48, -L * 0.38, W / 2);
            ctx.lineTo(t, W / 2);
            ctx.quadraticCurveTo(L * 0.44, W * 0.44, L / 2, 0);
            ctx.closePath();
            return;
        case 'battle':
            // Long fine bow, beam aft of midship, tapering stern
            ctx.moveTo(L / 2, 0);
            ctx.bezierCurveTo(L * 0.4, -W * 0.1, L * 0.25, -W / 2, t, -W / 2);
            ctx.lineTo(-L * 0.05, -W / 2);
            ctx.bezierCurveTo(-L * 0.22, -W / 2, -L * 0.42, -W * 0.18, -L / 2, -W * 0.07);
            ctx.lineTo(-L / 2, W * 0.07);
            ctx.bezierCurveTo(-L * 0.42, W * 0.18, -L * 0.22, W / 2, -L * 0.05, W / 2);
            ctx.lineTo(t, W / 2);
            ctx.bezierCurveTo(L * 0.25, W / 2, L * 0.4, W * 0.1, L / 2, 0);
            ctx.closePath();
            return;
    }
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
        case 'barrage':
            // Rocket launcher box with a grid of tubes on the aft deck
            block(-L * 0.28, 0, L * 0.16, W * 0.5, '#3a3f44', 1.5);
            ctx.fillStyle = '#121416';
            for (let i = 0; i < 4; i++)
                for (let j = 0; j < 3; j++) {
                    ctx.beginPath();
                    ctx.arc(-L * 0.34 + i * L * 0.04, (j - 1) * W * 0.13, Math.min(2, W * 0.04), 0, 2 * Math.PI);
                    ctx.fill();
                }
            break;
        case 'shield':
            // Heavy armour belt along the hull
            ctx.strokeStyle = 'rgba(150,190,220,.75)';
            ctx.lineWidth = 2.2;
            hullPath(L * 0.94, W * 0.86, 0.15);
            ctx.stroke();
            break;
        case 'emp':
            // Pulse emitter dish on the foredeck
            ctx.fillStyle = '#2c3238';
            ctx.beginPath();
            ctx.arc(L * 0.2, 0, W * 0.16, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#7fd4ff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(L * 0.2, 0, W * 0.11, 0, 2 * Math.PI);
            ctx.moveTo(L * 0.2 - W * 0.05, 0); ctx.lineTo(L * 0.2 + W * 0.05, 0);
            ctx.stroke();
            break;
        case 'heal': {
            // Helipad with a red cross at the stern
            const hx = -L * 0.34, hr = W * 0.24;
            ctx.fillStyle = '#e8e8e8';
            ctx.beginPath();
            ctx.arc(hx, 0, hr, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#c42424';
            ctx.fillRect(hx - hr * 0.6, -hr * 0.2, hr * 1.2, hr * 0.4);
            ctx.fillRect(hx - hr * 0.2, -hr * 0.6, hr * 0.4, hr * 1.2);
            break;
        }
        case 'seekmines':
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
            hullPath(L * 0.97, W * 0.95, bow);
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
            hullPath(L * 0.95, W * 0.92, bow);
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
        case 'hover': {
            // Black rubber skirt around the hull
            ctx.strokeStyle = '#1b1d1f';
            ctx.lineWidth = Math.max(2, W * 0.09);
            hullPath(L * 1.0, W * 1.0, bow);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,.12)';
            ctx.lineWidth = 0.8;
            hullPath(L * 0.97, W * 0.93, bow);
            ctx.stroke();
            // Cabin forward
            block(L * 0.18, 0, L * 0.2, W * 0.45, '#9aa3ab', 2);
            // Two big lift/thrust fans in ducts at the stern
            for (const y of [-0.24, 0.24]) {
                const fx = -L * 0.36, fy = W * y, fr = W * 0.2;
                ctx.fillStyle = '#2a2e32';
                ctx.beginPath();
                ctx.arc(fx, fy, fr * 1.15, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#4a5056';
                for (let k = 0; k < 5; k++) {
                    const a = k / 5 * 2 * Math.PI;
                    ctx.beginPath();
                    ctx.ellipse(fx + Math.cos(a) * fr * 0.5, fy + Math.sin(a) * fr * 0.5, fr * 0.45, fr * 0.16, a, 0, 2 * Math.PI);
                    ctx.fill();
                }
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.arc(fx, fy, fr * 0.2, 0, 2 * Math.PI);
                ctx.fill();
                // Rudder vanes behind the fan
                ctx.fillStyle = '#3a3f44';
                ctx.fillRect(fx - fr * 1.35, fy - fr * 0.8, 1.2, fr * 1.6);
            }
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

// Radar mast position on the superstructure per ship style (ship-local)
function radarPos(st, L, W) {
    switch (st.style) {
        case 'jager': return [L * 0.07, 0];
        case 'kruiser': return [L * 0.05, 0];
        case 'zwaar': return [L * 0.05, 0];
        case 'titan': return [L * 0.06, 0];
        case 'carrier': return [L * 0.015, W * 0.33];
        case 'hover': return [L * 0.2, 0];
        default: return [L * 0.01, 0];
    }
}

// Rotating radar antenna; stops when the ship is sunk
function drawRadar(s, L, W) {
    if (s.radarPh === undefined) s.radarPh = rand(0, 2 * Math.PI);
    const [x, y] = radarPos(s.st, L, W);
    const A = clamp(W * 0.3, 5, 14);
    ctx.save();
    ctx.translate(x, y);
    // Mast platform
    ctx.fillStyle = '#2a2e32';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.6, A * 0.18), 0, 2 * Math.PI);
    ctx.fill();
    if (!s.dead && !s.radarDead) s.radarA = s.radarPh + time * RADAR_RPM;
    ctx.rotate(s.radarA || 0);
    setShadow(1.5, 1.5);
    // Antenna bar with reflector face
    ctx.fillStyle = '#d8dde3';
    ctx.fillRect(-0.9, -A / 2, 1.8, A);
    clearShadow();
    ctx.fillStyle = '#6b737a';
    ctx.fillRect(0.4, -A / 2, 0.9, A);
    ctx.restore();
}

// Pre-renders hull, deck and superstructure into a cached sprite
function buildShipSprite(st) {
    const L = st.length, W = st.width, bow = st.bow ?? 0.15, pad = 6, S = spriteScale;
    const c = makeCanvas((L + pad * 2) * S, (W + pad * 2) * S);
    const main = ctx;
    ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.translate(L / 2 + pad, W / 2 + pad);
    hullShape = shapeOf(st);
    if (hullShape === 'carrier') {
        // Narrow hull under the overhanging flight deck
        hullShape = 'battle';
        hullPath(L * 0.97, W * 0.62, 0.3);
        ctx.fillStyle = shade(st.hull, 0.7);
        ctx.fill();
        hullShape = 'carrier';
    }

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

    hullShape = 'std';
    ctx = main;
    return { canvas: c, w: L + pad * 2, h: W + pad * 2 };
}

function shipSprite(st) {
    const key = `${st.id || st.name}|${st.style}|${st.hull}|${st.deck}|${st.length}|${st.width}|${st.bow}|${st.special || ''}`;
    let sp = shipSprites.get(key);
    if (!sp) {
        // Sprite builders swap the global context: always restore it, even after an error
        const main = ctx;
        try { sp = buildShipSprite(st); }
        finally { ctx = main; hullShape = 'std'; }
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
    // Submarines are drawn submerged, without a ship sprite
    if (s.st.sub) { drawSub(s); return; }
    const st = s.st, L = st.length, W = st.width, bow = st.bow ?? 0.15;
    const sp = shipSprite(st);
    const frac = clamp(Math.abs(s.speed) / st.speed, 0, 1);
    hullShape = shapeOf(st);
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
            drawPlane(DECK_JET, p.x, p.y, p.a, 0, 1, 1, false);
        }
    }

    // Rotating search radar antenna on the mast
    if (hasRadar(st)) drawRadar(s, L, W);
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
        drawGunHouse(turretShape(st), R, t.broken ? '#2b2826' : st.turret);   // knocked-out turrets are scorched
        // Reload ring for the player
        if (!s.enemy && !s.dead && t.reload > 0) {
            ctx.strokeStyle = 'rgba(255,215,90,.85)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(0, 0, R * (turretShape(st) === 'battle' ? 1.6 : 1.35), 0, 2 * Math.PI * (1 - t.reload / (t.reloadMax || st.reload)));
            ctx.stroke();
        }
        ctx.restore();
    }
    drawLaunchers(s);
    hullShape = 'std';
}

// Gun house shape per ship: round, box (cruiser), battle (battleship), mount (modern single gun), shield (open MG shield)
const TURRET_BY_SHIP = {
    korvet: 'mount', jager: 'mount', wesp: 'mount', horzel: 'mount', fregat: 'mount', spin: 'mount', schim: 'mount',
    specht: 'shield', monitor: 'round', poseidon: 'round',
    kruiser: 'box', valk: 'box', orka: 'box', arend: 'box',
    zwaar: 'battle', furie: 'battle', zeus: 'battle', titan: 'battle', leviathan: 'battle'
};

function turretShape(st) {
    if (st.turretShape) return st.turretShape;
    if (TURRET_BY_SHIP[st.id]) return TURRET_BY_SHIP[st.id];
    if (st.weapon === 'mg') return 'shield';
    if ((st.barrels || 2) <= 1) return 'mount';
    return st.width >= 34 ? 'battle' : 'box';
}

// Polygon helper (points scaled by R)
function polyPath(R, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * R, pts[0][1] * R);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * R, pts[i][1] * R);
    ctx.closePath();
}

// Draws the gun house in turret-local space (x = gun direction); shadow is still active on entry
function drawGunHouse(shape, R, color) {
    const plate = ctx.createLinearGradient(-R, -R, R, R);
    plate.addColorStop(0, shade(color, 1.5));
    plate.addColorStop(0.55, shade(color, 1.0));
    plate.addColorStop(1, shade(color, 0.6));
    const edge = () => {
        clearShadow();
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    };
    switch (shape) {
        case 'box': {
            // WWII cruiser turret: sloped front faces, flat back
            ctx.fillStyle = plate;
            polyPath(R, [[0.95, -0.6], [0.95, 0.6], [0.35, 1.0], [-1.05, 1.0], [-1.05, -1.0], [0.35, -1.0]]);
            ctx.fill();
            edge();
            // Roof seam, rangefinder ears and hatch
            ctx.strokeStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath();
            ctx.moveTo(0.35 * R, -R); ctx.lineTo(0.35 * R, R);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,.4)';
            ctx.fillRect(-0.7 * R, -1.18 * R, 0.28 * R, 2.36 * R);
            ctx.fillStyle = 'rgba(255,255,255,.12)';
            ctx.fillRect(-0.35 * R, -0.55 * R, 0.3 * R, 0.3 * R);
            break;
        }
        case 'battle': {
            // Battleship turret: long armoured house, sloped face, rear overhang
            ctx.fillStyle = plate;
            polyPath(R, [[1.0, -0.55], [1.0, 0.55], [0.45, 0.95], [-1.25, 0.95], [-1.42, 0.72], [-1.42, -0.72], [-1.25, -0.95], [0.45, -0.95]]);
            ctx.fill();
            edge();
            ctx.strokeStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath();
            ctx.moveTo(0.45 * R, -0.95 * R); ctx.lineTo(0.45 * R, 0.95 * R);
            ctx.moveTo(-1.0 * R, -0.95 * R); ctx.lineTo(-1.0 * R, 0.95 * R);
            ctx.stroke();
            // Rangefinder housing sticking out both sides
            ctx.fillStyle = shade(color, 0.55);
            ctx.fillRect(-0.75 * R, -1.3 * R, 0.3 * R, 2.6 * R);
            ctx.fillStyle = 'rgba(255,255,255,.12)';
            ctx.fillRect(-0.3 * R, -0.6 * R, 0.28 * R, 0.28 * R);
            ctx.fillRect(-0.3 * R, 0.32 * R, 0.28 * R, 0.28 * R);
            break;
        }
        case 'mount': {
            // Modern faceted single-gun mount (stealth shape)
            ctx.fillStyle = plate;
            polyPath(R, [[1.05, -0.32], [1.05, 0.32], [0.2, 0.82], [-0.85, 0.72], [-1.0, 0], [-0.85, -0.72], [0.2, -0.82]]);
            ctx.fill();
            edge();
            // Facet ridges
            ctx.strokeStyle = 'rgba(255,255,255,.18)';
            ctx.beginPath();
            ctx.moveTo(1.05 * R, 0); ctx.lineTo(-1.0 * R, 0);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,.22)';
            ctx.beginPath();
            ctx.moveTo(0.2 * R, -0.82 * R); ctx.lineTo(0.2 * R, 0.82 * R);
            ctx.stroke();
            break;
        }
        case 'shield': {
            // Open pedestal mount with curved gun shield
            ctx.fillStyle = shade(color, 0.7);
            ctx.beginPath();
            ctx.arc(0, 0, R * 0.5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = plate;
            ctx.beginPath();
            ctx.arc(0, 0, R * 1.0, -1.15, 1.15);
            ctx.arc(0, 0, R * 0.74, 1.15, -1.15, true);
            ctx.closePath();
            ctx.fill();
            edge();
            // Gunner seat
            ctx.fillStyle = 'rgba(0,0,0,.45)';
            ctx.fillRect(-0.75 * R, -0.18 * R, 0.35 * R, 0.36 * R);
            break;
        }
        default: {
            // Round armoured house: flat front, rounded back
            const dome = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 0, 0, 0, R * 1.2);
            dome.addColorStop(0, shade(color, 1.55));
            dome.addColorStop(0.6, shade(color, 1.0));
            dome.addColorStop(1, shade(color, 0.6));
            ctx.fillStyle = dome;
            ctx.beginPath();
            ctx.moveTo(R * 0.75, -R * 0.75);
            ctx.lineTo(R * 0.75, R * 0.75);
            ctx.arc(0, 0, R * 1.06, Math.PI * 0.25, Math.PI * 1.75);
            ctx.closePath();
            ctx.fill();
            edge();
            // Rangefinder and hatch
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.fillRect(-R * 0.55, -R * 0.95, R * 0.25, R * 1.9);
            ctx.fillStyle = 'rgba(255,255,255,.12)';
            ctx.beginPath();
            ctx.arc(-R * 0.1, -R * 0.35, R * 0.18, 0, 2 * Math.PI);
            ctx.fill();
        }
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
    ctx.fillStyle = s.friendly ? '#4ad06a' : f > 0.5 ? '#e0603a' : f > 0.25 ? '#e0402a' : '#c02020';
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
        // Homing mines: yellow seeker band
        if (m.seek) {
            ctx.strokeStyle = '#e0b020';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, 2 * Math.PI);
            ctx.stroke();
        }
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
    // Radar map only on ships fitted with radar
    const radar = !!player && !player.dead && hasRadar(player.st);
    mini.style.display = radar ? '' : 'none';
    if (!radar) return;
    // Centered on the camera; covers at least the own gun range
    const R = Math.max(MINI_RANGE, player.st.range * 1.4);
    const size = mini.width, k = size / (R * 2);
    const ox = cam.x - R, oy = cam.y - R;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = 'rgba(12,50,80,.85)';
    mctx.fillRect(0, 0, size, size);
    // Rotating sweep, synced with the ship's antenna
    const sa = player.heading + (player.radarA || 0);
    const sx = (player.x - ox) * k, sy = (player.y - oy) * k;
    const sweep = mctx.createRadialGradient(sx, sy, 0, sx, sy, size);
    sweep.addColorStop(0, 'rgba(90,255,140,.28)');
    sweep.addColorStop(1, 'rgba(90,255,140,0)');
    mctx.fillStyle = sweep;
    mctx.beginPath();
    mctx.moveTo(sx, sy);
    mctx.arc(sx, sy, size, sa - 0.5, sa);
    mctx.closePath();
    mctx.fill();
    // Own gun range ring
    mctx.strokeStyle = 'rgba(255,255,255,.25)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(sx, sy, player.st.range * k, 0, 2 * Math.PI);
    mctx.stroke();
    mctx.fillStyle = '#d8c48a';
    for (const isl of islandsNear(cam.x, cam.y, R + ISLAND_MAX_R)) {
        // Real coastline outline
        islandPathOn(mctx, isl, k, (isl.x - ox) * k, (isl.y - oy) * k);
        mctx.fill();
    }
    // Harbors
    mctx.fillStyle = '#ffffff';
    for (const isl of islandsNear(cam.x, cam.y, R + ISLAND_MAX_R)) {
        if (isl.airstrip) {
            // Airstrip: short yellow line along the runway
            const a = isl.airstrip.a, hl = Math.max(4, isl.airstrip.len / 2 * k);
            mctx.strokeStyle = '#ffd84a';
            mctx.lineWidth = 2;
            mctx.beginPath();
            mctx.moveTo((isl.x - ox) * k - Math.cos(a) * hl, (isl.y - oy) * k - Math.sin(a) * hl);
            mctx.lineTo((isl.x - ox) * k + Math.cos(a) * hl, (isl.y - oy) * k + Math.sin(a) * hl);
            mctx.stroke();
        }
        if (!isl.harbor) continue;
        const h = harborTip(isl);
        mctx.fillRect((h.x - ox) * k - 2.5, (h.y - oy) * k - 2.5, 5, 5);
    }
    // Escort and mission destination
    mctx.fillStyle = '#4ad06a';
    for (const f of friendlies) if (!f.dead) mctx.fillRect(clamp((f.x - ox) * k, 2, size - 2) - 2, clamp((f.y - oy) * k, 2, size - 2) - 2, 4, 4);
    if (mission && mission.dest) {
        mctx.strokeStyle = '#4ad06a';
        mctx.beginPath();
        mctx.arc(clamp((mission.dest.x - ox) * k, 4, size - 4), clamp((mission.dest.y - oy) * k, 4, size - 4), 4, 0, 2 * Math.PI);
        mctx.stroke();
    }
    // Aircraft
    mctx.fillStyle = '#ffd84a';
    for (const p of planes) if (!p.down) mctx.fillRect(clamp((p.x - ox) * k, 2, size - 2) - 1.5, clamp((p.y - oy) * k, 2, size - 2) - 1.5, 3, 3);
    mctx.fillStyle = '#ff5a4a';
    for (const e of enemies) {
        // Submerged submarines do not show on radar
        if (e.dead || e.st.sub) continue;
        const x = clamp((e.x - ox) * k, 2, size - 2), y = clamp((e.y - oy) * k, 2, size - 2);
        mctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (player && !player.dead) {
        mctx.fillStyle = '#fff';
        mctx.beginPath();
        mctx.arc((player.x - ox) * k, (player.y - oy) * k, 3, 0, 2 * Math.PI);
        mctx.fill();
    }
    if (flying) {
        mctx.fillStyle = '#9fe0ff';
        mctx.beginPath();
        mctx.arc((flying.x - ox) * k, (flying.y - oy) * k, 3.5, 0, 2 * Math.PI);
        mctx.fill();
    }
    if (parkedPlane) {
        // Parked plane, clamped to the radar edge when far away
        mctx.fillStyle = '#9fe0ff';
        mctx.fillRect(clamp((parkedPlane.x - ox) * k, 3, size - 3) - 3, clamp((parkedPlane.y - oy) * k, 3, size - 3) - 3, 6, 6);
    }
    if (flying && player && !player.dead) {
        mctx.fillStyle = '#fff';
        mctx.beginPath();
        mctx.arc(clamp((player.x - ox) * k, 3, size - 3), clamp((player.y - oy) * k, 3, size - 3), 3, 0, 2 * Math.PI);
        mctx.fill();
    }
    // Visible area
    const hw = vw / 2 / zoom * k, hh = vh / 2 / zoom * k;
    mctx.strokeStyle = 'rgba(255,255,255,.5)';
    mctx.lineWidth = 1;
    mctx.strokeRect(size / 2 - hw, size / 2 - hh, hw * 2, hh * 2);
}

// =====================================================================
// Extras: partial damage, harbors, missions, flagship boss, aircraft + AA,
// submarines + depth charges, weather / day-night, medals and high scores
// =====================================================================
const PART = { turret: 0.012, fire: 0.008, engine: 0.006, minDmg: 10, fireDps: 2.5, fireTime: 12 };
const HARBOR = { chance: 0.55, pier: 130, dockDist: 170, dockSpeed: 30, cooldown: 45 };
const BOSS = { every: 8, hp: 1800, turretHp: 70, radarHp: 90, reward: 10, jetBomb: 0.08 };
const PLANE = { every: [45, 80], hp: 18, speed: 260, bombDmg: 35, bombR: 75, aaRange: 650, aaRate: 0.12, aaDmg: 2.5, aaHit: 0.55 };
const DEPTH = { cd: 7, n: 3, fuse: 1.6, radius: 170, damage: 90 };
const ENV = { min: 70, max: 130, fade: 4, wind: 35 };
const MEDALS = [
    { id: 'first', name: 'Eerste overwinning', desc: 'Breng je eerste schip tot zinken' },
    { id: 'streak10', name: 'Onaantastbaar', desc: '10 kills zonder schade' },
    { id: 'run20', name: 'Zeeheld', desc: '20 kills in één ronde' },
    { id: 'kills50', name: 'Veteraan', desc: '50 schepen in totaal' },
    { id: 'kills250', name: 'Admiraal', desc: '250 schepen in totaal' },
    { id: 'kills1000', name: 'Zeekoning', desc: '1000 schepen in totaal' },
    { id: 'mission', name: 'Opdracht volbracht', desc: 'Voltooi een missie' },
    { id: 'missions10', name: 'Huurling', desc: 'Voltooi 10 missies' },
    { id: 'convoy', name: 'Escorte', desc: 'Breng een konvooi veilig aan' },
    { id: 'sub', name: 'Onderzeebootjager', desc: 'Breng een onderzeeër tot zinken' },
    { id: 'plane', name: 'Luchtafweer', desc: 'Haal een vliegtuig neer' },
    { id: 'planes10', name: 'Aas van de lucht', desc: 'Haal 10 vliegtuigen neer' },
    { id: 'airkill', name: 'Luchtaanval', desc: 'Breng een schip tot zinken vanuit je eigen vliegtuig' },
    { id: 'airkills25', name: 'Bommenwerperpiloot', desc: '25 schepen vanuit je eigen vliegtuig' },
    { id: 'landing', name: 'Zachte landing', desc: 'Land je vliegtuig op een baan' },
    { id: 'carrierLanding', name: 'Vanghaak', desc: 'Land op een vliegdekschip' },
    { id: 'storm', name: 'Stormvast', desc: 'Overleef 60 seconden storm' },
    { id: 'night', name: 'Nachtjager', desc: 'Breng \'s nachts een schip tot zinken' },
    { id: 'fog', name: 'Mistvaarder', desc: 'Breng in de mist een schip tot zinken' },
    { id: 'harbor', name: 'Thuishaven', desc: 'Meer aan in een haven' },
    { id: 'harbor5', name: 'Zeebonk', desc: 'Meer 5 keer aan in een haven' },
    { id: 'ships5', name: 'Vlootbouwer', desc: 'Heb 5 schepen in bezit' },
    { id: 'ships15', name: 'Admiraliteit', desc: 'Heb 15 schepen in bezit' },
    { id: 'shipsAll', name: 'Complete vloot', desc: 'Heb alle schepen in bezit' },
    { id: 'planes1', name: 'Piloot', desc: 'Koop je eerste vliegtuig' },
    { id: 'planesAll', name: 'Luchtmacht', desc: 'Heb alle vliegtuigen in bezit' },
    { id: 'upgradeMax', name: 'Volledig opgewaardeerd', desc: 'Breng een upgrade naar het maximum' },
    { id: 'legend', name: 'Levende legende', desc: 'Bereik de rang Legende' },
    { id: 'all', name: 'Prestatie der prestaties', desc: 'Haal alle andere prestaties' }
];

// Ranks by total ships sunk: Brons .. Legende, each in levels 1-3
const RANK_TIERS = [
    { name: 'Brons', color: '#cd7f32', at: [0, 10, 25] },
    { name: 'Zilver', color: '#c0c7cf', at: [50, 75, 100] },
    { name: 'Goud', color: '#f2c94c', at: [150, 200, 275] },
    { name: 'Platina', color: '#9fe3e0', at: [350, 450, 550] },
    { name: 'Smaragd', color: '#3ccf7a', at: [700, 850, 1000] },
    { name: 'Diamant', color: '#7fc8ff', at: [1250, 1500, 1800] },
    { name: 'Legende', color: '#ff7ad9', at: [2200, 2700, 3500] }
];
const RANKS = RANK_TIERS.flatMap(t => t.at.map((k, i) => ({ name: `${t.name} ${i + 1}`, tier: t.name, color: t.color, kills: k })));

function rankIndex(kills) {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (kills >= RANKS[i].kills) r = i;
    return r;
}

const totalKills = () => { try { return +localStorage.getItem('wb-total-kills') || 0; } catch { return 0; } };

// Persistent counters for achievements
function incStat(key) {
    const s = loadJson('wb-stats', {});
    s[key] = (s[key] || 0) + 1;
    saveJson('wb-stats', s);
    return s[key];
}

let friendlies = [], planes = [], airBombs = [], depthCharges = [], aaTracers = [];
let mission = null, missionT = 0, toasts = [], killsSinceBoss = 0, planeTimer = 60, depthCd = 0, aaT = 0;
let env = { kind: 'clear', prev: 'clear', next: 0, fade: 1, wind: { x: 0, y: 0 } }, lightning = 0, envCanvas = null;
let runStats = { kills: 0, noDmg: 0, stormT: 0, start: 0 };

function resetExtras() {
    friendlies = []; planes = []; airBombs = []; depthCharges = []; aaTracers = [];
    mission = null; missionT = time + 15; toasts = []; killsSinceBoss = 0;
    planeTimer = rand(40, 70); depthCd = 0; lightning = 0;
    env = { kind: 'clear', prev: 'clear', next: time + rand(ENV.min, ENV.max) * 0.6, fade: 1, wind: { x: 0, y: 0 } };
    runStats = { kills: 0, noDmg: 0, stormT: 0, start: time };
    flying = null; parkedPlane = null; planeCd = 0; playerBombs = []; tLatch = false; eLatch = false;
}

function toast(text, color = '#ffe08a') {
    toasts.push({ text, color, t: 4 });
    if (toasts.length > 4) toasts.shift();
}

function reward(amount, text) {
    amount = Math.round(amount);
    toast(`${text}  +🪙 ${amount}`, '#9fe870');
    if (dotnet) dotnet.invokeMethodAsync('OnReward', amount).catch(() => { });
}

// ---------- partial damage (player) ----------
const hasPartDamage = s => s.fireT > 0 || !!s.engineHit || s.turrets.some(t => t.broken);
function fixPartDamage(s) {
    s.fireT = 0;
    s.engineHit = false;
    for (const t of s.turrets) t.broken = false;
}

function onDamaged(s, dmg) {
    if (s !== player || s.dead || dmg <= 0.5) return;
    runStats.noDmg = 0;
    if (dmg < PART.minDmg) return;
    const r = Math.random();
    if (r < PART.turret) {
        const ok = s.turrets.filter(t => !t.broken);
        if (ok.length > 1) {
            ok[Math.floor(Math.random() * ok.length)].broken = true;
            toast('Geschutstoren uitgeschakeld! (R = repareren)', '#ff9a7a');
        }
    } else if (r < PART.turret + PART.fire) {
        if (!(s.fireT > 0)) toast('Brand aan boord! (R = blussen)', '#ff9a7a');
        s.fireT = PART.fireTime;
    } else if (r < PART.turret + PART.fire + PART.engine) {
        if (!s.engineHit) toast('Motor geraakt: halve kracht (R = repareren)', '#ff9a7a');
        s.engineHit = true;
    }
}

function updatePartDamage(s, dt) {
    if (s.dead) return;
    if (s.fireT > 0) {
        s.fireT -= dt;
        damage(s, PART.fireDps * dt, false);
        if (Math.random() < dt * 20) {
            const p = local(s, rand(-s.st.length / 3, s.st.length / 3), rand(-s.st.width / 4, s.st.width / 4));
            addParticle({ kind: 'fire', x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-10, 10), max: 0.6, size: 5, grow: 8, alpha: 0.9 });
            addParticle({ kind: 'smoke', x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-10, 10), max: 2.2, size: 6, grow: 16, alpha: 0.5 });
        }
    }
    if (s.engineHit && Math.random() < dt * 8) {
        const p = local(s, -s.st.length * 0.25, 0);
        addParticle({ kind: 'smoke', x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(-8, 8), max: 2.5, size: 6, grow: 18, alpha: 0.6 });
    }
    for (const t of s.turrets) {
        if (t.broken && Math.random() < dt * 4) {
            const p = turretPos(s, t);
            addParticle({ kind: 'smoke', x: p.x, y: p.y, vx: rand(-6, 6), vy: rand(-6, 6), max: 1.8, size: 4, grow: 12, alpha: 0.5 });
        }
    }
}

// ---------- harbors ----------
function harborTip(isl) {
    const h = isl.harbor, d = h.cr + HARBOR.pier;
    return { x: isl.x + Math.cos(h.a) * d, y: isl.y + Math.sin(h.a) * d };
}

function updateHarbors() {
    if (player.dead) return;
    for (const isl of islandsNear(player.x, player.y, ISLAND_MAX_R + 400)) {
        if (!isl.harbor || time < isl.harbor.cd) continue;
        const tip = harborTip(isl);
        if (Math.hypot(player.x - tip.x, player.y - tip.y) > HARBOR.dockDist || Math.abs(player.speed) > HARBOR.dockSpeed) continue;
        // Docked: free full repair, resupply and maybe a new mission
        isl.harbor.cd = time + HARBOR.cooldown;
        player.hp = player.maxHp;
        player.repair = 0;
        fixPartDamage(player);
        player.specialCd = 0;
        depthCd = 0;
        toast('⚓ Haven: gerepareerd en bevoorraad');
        unlockMedal('harbor');
        if (incStat('harbors') >= 5) unlockMedal('harbor5');
        if (!mission) newMission(isl);
        report(true);
    }
}

function drawHarbors(view) {
    for (const isl of islandsNear(cam.x, cam.y, Math.max(view.x1 - view.x0, view.y1 - view.y0) / 2 + ISLAND_MAX_R)) {
        if (isl.airstrip) drawAirstrip(isl);
        const h = isl.harbor;
        if (!h) continue;
        const bx = isl.x + Math.cos(h.a) * h.cr, by = isl.y + Math.sin(h.a) * h.cr;
        if (bx < view.x0 - 300 || bx > view.x1 + 300 || by < view.y0 - 300 || by > view.y1 + 300) continue;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(h.a);
        // Pier: planks on posts
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(-20 + 4, -11 + 4, HARBOR.pier + 20, 22);
        ctx.fillStyle = '#8a6a44';
        ctx.fillRect(-20, -11, HARBOR.pier + 20, 22);
        ctx.strokeStyle = 'rgba(40,25,10,.45)';
        ctx.lineWidth = 1;
        for (let x = -16; x < HARBOR.pier; x += 7) { ctx.beginPath(); ctx.moveTo(x, -11); ctx.lineTo(x, 11); ctx.stroke(); }
        ctx.fillStyle = '#3e2c1a';
        for (let x = 0; x <= HARBOR.pier; x += 26) { ctx.fillRect(x - 2, -14, 4, 4); ctx.fillRect(x - 2, 10, 4, 4); }
        // Warehouse and crane on land
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(-92, -26, 60, 48);
        ctx.fillStyle = '#a8443a';
        ctx.fillRect(-96, -30, 60, 48);
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(-96, -30, 60, 6);
        ctx.strokeStyle = '#e0b030';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-20, 18); ctx.lineTo(30, 18); ctx.stroke();
        // Beacon at the pier head: green = ready to dock
        const ready = time >= h.cd;
        ctx.fillStyle = ready ? '#5af07a' : '#f0a040';
        ctx.beginPath();
        ctx.arc(HARBOR.pier, 0, 5 + Math.sin(time * 4) * 1.2, 0, 2 * Math.PI);
        ctx.fill();
        if (ready) {
            ctx.strokeStyle = 'rgba(90,240,122,.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(HARBOR.pier, 0, HARBOR.dockDist * 0.6, 0, 2 * Math.PI);
            ctx.stroke();
        }
        ctx.restore();
    }
}

// ---------- missions ----------
const MERCHANT = { name: 'Vrachtschip', hp: 260, speed: 58, accel: 12, turn: 20, turretTurn: 0, reload: 99, damage: 0, shellSpeed: 400, range: 1, spread: 1, length: 130, width: 26, turrets: 0, barrels: 1, bow: 0.2, style: 'fregat', hull: '#38584a', deck: '#a08a64', turret: '#333' };

// fromIsl: the harbor island where the mission is picked up (escorts only start at a harbor)
function newMission(fromIsl = null) {
    const r = Math.random(), base = (diff && diff.reward) || 1000;
    // Escort: from this harbor to a harbor on another island
    const targets = fromIsl ? islandsNear(player.x, player.y, 9000).filter(i => i !== fromIsl && i.harbor && Math.hypot(i.x - fromIsl.x, i.y - fromIsl.y) > 2500) : [];
    if (targets.length && r < 0.5) {
        const to = targets[Math.floor(Math.random() * targets.length)];
        const from = harborTip(fromIsl), dest = harborTip(to);
        const out = { x: Math.cos(fromIsl.harbor.a), y: Math.sin(fromIsl.harbor.a) };
        const sx = from.x + out.x * 160, sy = from.y + out.y * 160;
        const ship = makeShip(MERCHANT, sx, sy, Math.atan2(out.y, out.x), false);
        ship.friendly = true;
        friendlies.push(ship);
        mission = { type: 'escort', ship, dest, until: time + 360, reward: base * 5 };
    } else if (r < 0.75) {
        const need = 3 + Math.floor(Math.random() * 4);
        mission = { type: 'kill', need, got: 0, until: time + 60 + need * 40, reward: base * need * 0.8 };
    } else {
        mission = { type: 'planes', need: 3, got: 0, until: time + 240, reward: base * 2.5 };
        planeTimer = Math.min(planeTimer, 6);
    }
    toast('📜 Nieuwe missie: ' + missionText(), '#8ad0ff');
}

function missionText() {
    if (!mission) return '';
    const left = Math.max(0, Math.ceil(mission.until - time));
    switch (mission.type) {
        case 'kill': return `vernietig ${mission.got}/${mission.need} schepen (${left}s)`;
        case 'planes': return `haal ${mission.got}/${mission.need} vliegtuigen neer (${left}s)`;
        case 'escort': return `escorteer het vrachtschip naar de haven bij de groene markering (${left}s)`;
    }
    return '';
}

function endMission(ok) {
    if (!mission) return;
    if (ok) {
        reward(mission.reward, '✔ Missie voltooid');
        unlockMedal('mission');
        if (incStat('missions') >= 10) unlockMedal('missions10');
        if (mission.type === 'escort') unlockMedal('convoy');
    } else toast('✖ Missie mislukt', '#ff8a7a');
    if (mission.ship) mission.ship.leaving = true;
    mission = null;
    missionT = time + 40;
}

function updateMission(dt) {
    if (!mission) {
        if (time > missionT) newMission();
        return;
    }
    if (time > mission.until) { endMission(false); return; }
    if ((mission.type === 'kill' || mission.type === 'planes') && mission.got >= mission.need) endMission(true);
    else if (mission.type === 'escort') {
        const s = mission.ship;
        if (s.dead) endMission(false);
        else if (Math.hypot(s.x - mission.dest.x, s.y - mission.dest.y) < 260) endMission(true);
    }
}

// Friendly ships steer around islands towards their destination
function updateFriendlies(dt) {
    for (const f of friendlies) {
        if (!f.dead) {
            const dest = mission && mission.ship === f ? mission.dest : { x: f.x + Math.cos(f.heading) * 1000, y: f.y + Math.sin(f.heading) * 1000 };
            const want = Math.atan2(dest.y - f.y, dest.x - f.x);
            let h = want;
            for (const off of [0, 25, -25, 50, -50, 80, -80, 120, -120]) {
                if (pathClear(f, want + off * DEG, 500)) { h = want + off * DEG; break; }
            }
            f.rudder = clamp(norm(h - f.heading) / (30 * DEG), -1, 1);
            f.throttle = 0.8;
        }
        updateShip(f, dt);
    }
    friendlies = friendlies.filter(f => !(f.dead && f.sink > 4) && !(f.leaving && Math.hypot(f.x - player.x, f.y - player.y) > despawnDist()));
}

function drawMissionMarker() {
    if (!mission || !mission.dest) return;
    const d = mission.dest;
    ctx.strokeStyle = 'rgba(74,208,106,.8)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.arc(d.x, d.y, 260, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
}

// ---------- flagship boss ----------
// Hits near a turret or the radar damage that part as well
function bossPartHit(s, x, y, dmg) {
    const tw = turretWidth(s.st);
    for (const t of s.turrets) {
        if (t.broken) continue;
        const p = turretPos(s, t);
        if (Math.hypot(p.x - x, p.y - y) > tw * 0.9) continue;
        t.hp -= dmg;
        if (t.hp <= 0) {
            t.broken = true;
            explosion(p.x, p.y, false);
            toast('💥 Toren van het vlaggenschip vernietigd');
        }
        return;
    }
    if (!s.radarDead) {
        const [rx, ry] = radarPos(s.st, s.st.length, s.st.width);
        const rp = local(s, rx, ry);
        if (Math.hypot(rp.x - x, rp.y - y) < 22) {
            s.radarHp -= dmg;
            if (s.radarHp <= 0) {
                s.radarDead = true;
                explosion(rp.x, rp.y, false);
                toast('📡 Radar van het vlaggenschip uit: hij schiet veel slechter');
            }
        }
    }
}

function onEnemyKilled(s) {
    runStats.kills++;
    runStats.noDmg++;
    killsSinceBoss++;
    let total = 0;
    const before = rankIndex(totalKills());
    try { total = (+localStorage.getItem('wb-total-kills') || 0) + 1; localStorage.setItem('wb-total-kills', total); } catch { }
    // Promotion to a new rank
    const after = rankIndex(total);
    if (after > before) toast(`⭐ Nieuwe rang: ${RANKS[after].name}`, RANKS[after].color);
    if (RANKS[after].tier === 'Legende') unlockMedal('legend');
    unlockMedal('first');
    if (runStats.noDmg >= 10) unlockMedal('streak10');
    if (runStats.kills >= 20) unlockMedal('run20');
    if (total >= 50) unlockMedal('kills50');
    if (total >= 250) unlockMedal('kills250');
    if (total >= 1000) unlockMedal('kills1000');
    if (s.st.sub) unlockMedal('sub');
    if (flying && flying.phase === 'air') {
        unlockMedal('airkill');
        if (incStat('airKills') >= 25) unlockMedal('airkills25');
    }
    if (envLevel('night') > 0.5) unlockMedal('night');
    if (envLevel('fog') > 0.5) unlockMedal('fog');
    if (s.boss) {
        reward(diff.reward * BOSS.reward, '🏆 Vlaggenschip tot zinken gebracht!');
        unlockMedal('boss');
    }
    if (mission && mission.type === 'kill') mission.got++;
}

// ---------- aircraft and anti-aircraft ----------
function spawnPlanes() {
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    const viewR = Math.hypot(vw / 2 / zoom, vh / 2 / zoom);
    const a = spawnFront + rand(-SPAWN_SPREAD, SPAWN_SPREAD) * DEG;
    const cx = player.x + Math.cos(a) * (viewR + 500), cy = player.y + Math.sin(a) * (viewR + 500);
    const h = a + Math.PI;
    for (let i = 0; i < n; i++) {
        // V-formation: wide lateral spacing, each plane keeps its own offset all the way in
        const side = (i - (n - 1) / 2) * 110, back = Math.abs(side) * 0.8;
        planes.push({ x: cx - Math.sin(h) * side - Math.cos(h) * back, y: cy + Math.cos(h) * side - Math.sin(h) * back, a: h, hp: PLANE.hp, bombed: false, down: 0, off: side });
    }
    playSound('jet', cx, cy, 1);
    toast('✈ Vijandelijke bommenwerpers!', '#ffd84a');
}

function updateAir(dt) {
    planeTimer -= dt;
    if (planeTimer <= 0 && !player.dead) {
        spawnPlanes();
        planeTimer = rand(PLANE.every[0], PLANE.every[1]);
    }
    for (const p of planes) {
        if (p.down > 0) {
            // Shot down: spiral into the sea
            p.down -= dt;
            p.a += dt * 4;
            p.x += Math.cos(p.a) * PLANE.speed * 0.5 * dt;
            p.y += Math.sin(p.a) * PLANE.speed * 0.5 * dt;
            if (Math.random() < dt * 30) addParticle({ kind: 'smoke', x: p.x, y: p.y, vx: 0, vy: 0, max: 1.5, size: 5, grow: 14, alpha: 0.6 });
            if (p.down <= 0) { waterColumn(p.x, p.y, 1.2); playSound('splash', p.x, p.y, 1); p.gone = true; }
            continue;
        }
        if (!p.bombed) {
            // Home in on a point beside the player (formation offset), release the bomb when overhead
            const tx = player.x - Math.sin(p.a) * (p.off || 0) * 0.5, ty = player.y + Math.cos(p.a) * (p.off || 0) * 0.5;
            const want = Math.atan2(ty - p.y, tx - p.x);
            p.a += clamp(norm(want - p.a), -1.2 * dt, 1.2 * dt);
            if (Math.hypot(tx - p.x, ty - p.y) < 70) {
                p.bombed = true;
                airBombs.push({ x: p.x, y: p.y, vx: Math.cos(p.a) * 60, vy: Math.sin(p.a) * 60, t: 1.2 });
            }
        }
        p.x += Math.cos(p.a) * PLANE.speed * dt;
        p.y += Math.sin(p.a) * PLANE.speed * dt;
        // Keep a safe distance from the other bombers
        for (const q of planes) {
            if (q === p || q.down) continue;
            const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
            if (d > 0.01 && d < 80) {
                p.x += dx / d * (80 - d) * 0.5;
                p.y += dy / d * (80 - d) * 0.5;
            }
        }
        if (p.bombed && Math.hypot(p.x - player.x, p.y - player.y) > despawnDist()) p.gone = true;
    }
    planes = planes.filter(p => !p.gone);

    for (const b of airBombs) {
        b.t -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.t <= 0) {
            explosion(b.x, b.y, true);
            if (!onIsland(b.x, b.y)) waterColumn(b.x, b.y, 1.4);
            for (const s of [player, ...friendlies]) {
                if (!s.dead && Math.hypot(s.x - b.x, s.y - b.y) < PLANE.bombR + s.st.width / 2) damage(s, PLANE.bombDmg * diff.enemyDamage, false);
            }
        }
    }
    airBombs = airBombs.filter(b => b.t > 0);
    for (const t of aaTracers) t.t -= dt;
    aaTracers = aaTracers.filter(t => t.t > 0);
}

// Enemy aircraft hit by player fire (shells, machine guns, own plane)
function planeAt(x, y, r) {
    for (const p of planes) if (!p.down && Math.hypot(p.x - x, p.y - y) < r) return p;
    return null;
}

function nearestPlane(x, y, maxDist) {
    let best = null, bd = maxDist;
    for (const p of planes) {
        if (p.down) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = p; }
    }
    return best;
}

function hitPlane(p, dmg) {
    if (p.down) return;
    p.hp -= dmg;
    if (p.hp > 0) return;
    p.down = 1.6;
    explosion(p.x, p.y, false);
    reward(diff.reward * 0.5, '✈ Vliegtuig neergehaald');
    unlockMedal('plane');
    if (incStat('planesDown') >= 10) unlockMedal('planes10');
    if (mission && mission.type === 'planes') mission.got++;
}

function drawAir() {
    // AA tracers
    ctx.strokeStyle = 'rgba(255,220,120,.85)';
    ctx.lineWidth = 1.5;
    for (const t of aaTracers) { ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke(); }
    // Falling bombs: shrinking dark dot with a target ring
    for (const b of airBombs) {
        ctx.strokeStyle = 'rgba(255,80,60,.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x + b.vx * b.t, b.y + b.vy * b.t, PLANE.bombR * (0.4 + 0.6 * b.t / 1.2), 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2 + b.t * 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    for (const p of planes) {
        // Shot-down planes shrink as they spiral into the sea
        const sc = p.down > 0 ? 0.6 + p.down * 0.25 : 1;
        drawPlane(ENEMY_PLANE, p.x, p.y, p.a, p.down > 0 ? p.down / 1.6 : 1, sc);
    }
    drawPlayerPlane();
}

function planePath() {
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(10, -2.5); ctx.lineTo(2, -3); ctx.lineTo(1, -22); ctx.lineTo(-5, -22); ctx.lineTo(-5, -3);
    ctx.lineTo(-14, -2.5); ctx.lineTo(-16, -8); ctx.lineTo(-19, -8); ctx.lineTo(-18, 0);
    ctx.lineTo(-19, 8); ctx.lineTo(-16, 8); ctx.lineTo(-14, 2.5); ctx.lineTo(-5, 3);
    ctx.lineTo(-5, 22); ctx.lineTo(1, 22); ctx.lineTo(2, 3); ctx.lineTo(10, 2.5);
    ctx.closePath();
}

// ---------- submarines and depth charges ----------
function drawSub(s) {
    const L = s.st.length, W = s.st.width;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    ctx.globalAlpha = s.dead ? clamp(0.5 - s.sink / 6, 0, 0.5) : 0.5;
    ctx.fillStyle = s.st.hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, L / 2, W / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
    // Conning tower and periscope wake
    ctx.globalAlpha = s.dead ? 0 : 0.8;
    ctx.fillStyle = s.st.deck;
    ctx.beginPath();
    ctx.roundRect(L * 0.02, -W * 0.22, L * 0.18, W * 0.44, 3);
    ctx.fill();
    ctx.restore();
    if (!s.dead && Math.random() < 0.3) {
        const p = local(s, L * 0.12, 0);
        addParticle({ kind: 'foam', x: p.x, y: p.y, vx: 0, vy: 0, max: 1.4, size: 3, grow: 8, alpha: 0.5 });
    }
}

function dropDepthCharges() {
    depthCd = DEPTH.cd;
    for (let i = 0; i < DEPTH.n; i++) {
        // A straight row along the wake, right behind the stern
        const p = local(player, -player.st.length * 0.55 - i * 30, 0);
        depthCharges.push({ x: p.x, y: p.y, t: DEPTH.fuse + i * 0.25 });
        addParticle({ kind: 'water', x: p.x, y: p.y, vx: 0, vy: 0, max: 0.6, size: 4, grow: 14, alpha: 0.7 });
    }
    playSound('splash', player.x, player.y, 0.8);
}

function updateDepthCharges(dt) {
    depthCd = Math.max(0, depthCd - dt);
    for (const c of depthCharges) {
        c.t -= dt;
        if (c.t > 0) continue;
        waterColumn(c.x, c.y, 2.2);
        addParticle({ kind: 'ring', x: c.x, y: c.y, vx: 0, vy: 0, max: 0.8, size: 10, grow: DEPTH.radius * 1.5, alpha: 0.7 });
        playSound('boom', c.x, c.y, 0.8);
        for (const e of enemies) {
            if (e.dead) continue;
            const d = Math.hypot(e.x - c.x, e.y - c.y);
            if (d < DEPTH.radius + e.st.width / 2) damage(e, DEPTH.damage * (1 - 0.5 * d / DEPTH.radius));
        }
    }
    depthCharges = depthCharges.filter(c => c.t > 0);
}

function drawDepthCharges() {
    for (const c of depthCharges) {
        ctx.globalAlpha = clamp(c.t / DEPTH.fuse, 0.15, 0.9);
        ctx.fillStyle = '#2a2e30';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ---------- weather and day/night ----------
const envLevel = k => (env.kind === k ? env.fade : 0) + (env.prev === k ? 1 - env.fade : 0);

// Distance at which enemies can see (and shoot) the player
function envVisibility() {
    let v = Infinity;
    if (envLevel('night') > 0.5) v = 1100;
    if (envLevel('fog') > 0.5) v = Math.min(v, 800);
    return v;
}

function updateEnvironment(dt) {
    if (time >= env.next) {
        const opts = ['clear', 'clear', 'night', 'fog', 'storm'].filter(k => k !== env.kind);
        env.prev = env.kind;
        env.kind = opts[Math.floor(Math.random() * opts.length)];
        env.fade = 0;
        env.next = time + rand(ENV.min, ENV.max);
        const a = rand(0, 2 * Math.PI);
        env.wind = { x: Math.cos(a) * ENV.wind, y: Math.sin(a) * ENV.wind };
        const names = { clear: '☀ Het weer klaart op', night: '🌙 De nacht valt: zichtbaarheid beperkt', fog: '🌫 Dichte mist: vertrouw op je radar', storm: '⛈ Storm! Wind en hoge golven' };
        toast(names[env.kind], '#cfe0ff');
    }
    env.fade = Math.min(1, env.fade + dt / ENV.fade);
    const storm = envLevel('storm');
    if (storm > 0) {
        // Wind drift on all ships
        for (const s of [player, ...enemies, ...friendlies]) {
            if (s.dead) continue;
            s.x += env.wind.x * storm * dt;
            s.y += env.wind.y * storm * dt;
        }
        if (Math.random() < dt * 0.12 * storm) {
            lightning = 0.35;
            playSound('boom', cam.x + rand(-2000, 2000), cam.y + rand(-2000, 2000), 1.5);
        }
        if (storm > 0.9 && !player.dead) {
            runStats.stormT += dt;
            if (runStats.stormT >= 60) unlockMedal('storm');
        }
    }
    lightning = Math.max(0, lightning - dt);
}

function drawEnvironment() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const night = envLevel('night'), fog = envLevel('fog'), storm = envLevel('storm');
    const me = flying || player;   // light / clear area follows your aircraft while flying
    const px = me ? vw / 2 + (me.x - cam.x) * zoom : vw / 2, py = me ? vh / 2 + (me.y - cam.y) * zoom : vh / 2;
    if (night > 0.01 || fog > 0.01) {
        if (!envCanvas) envCanvas = document.createElement('canvas');
        if (envCanvas.width !== Math.ceil(vw) || envCanvas.height !== Math.ceil(vh)) { envCanvas.width = Math.ceil(vw); envCanvas.height = Math.ceil(vh); }
        const g = envCanvas.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, vw, vh);
        const dark = night >= fog;
        g.fillStyle = dark ? 'rgba(4,8,24,.8)' : 'rgba(190,200,206,.92)';
        g.fillRect(0, 0, vw, vh);
        g.globalCompositeOperation = 'destination-out';
        const r = (dark ? 330 : 650) * zoom;
        const rg = g.createRadialGradient(px, py, r * 0.3, px, py, r);
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, vw, vh);
        if (dark && player && !player.dead) {
            // Searchlight / landing-light cone: towards the aim point, or straight ahead when flying
            const a = flying ? flying.a : Math.atan2(mouse.y - player.y, mouse.x - player.x), len = 1100 * zoom, half = 16 * DEG;
            const cg = g.createRadialGradient(px, py, 0, px, py, len);
            cg.addColorStop(0, 'rgba(0,0,0,.95)');
            cg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = cg;
            g.beginPath();
            g.moveTo(px, py);
            g.arc(px, py, len, a - half, a + half);
            g.closePath();
            g.fill();
            // Fires and explosions light up the night
            let n = 0;
            for (const p of particles) {
                if ((p.kind !== 'fire' && p.kind !== 'flash') || n++ > 40) continue;
                const sx = vw / 2 + (p.x - cam.x) * zoom, sy = vh / 2 + (p.y - cam.y) * zoom, lr = 90 * zoom;
                const fg = g.createRadialGradient(sx, sy, 0, sx, sy, lr);
                fg.addColorStop(0, 'rgba(0,0,0,.7)');
                fg.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = fg;
                g.fillRect(sx - lr, sy - lr, lr * 2, lr * 2);
            }
        }
        ctx.globalAlpha = Math.max(night, fog);
        ctx.drawImage(envCanvas, 0, 0, vw, vh);
        ctx.globalAlpha = 1;
    }
    if (storm > 0.01) {
        ctx.fillStyle = `rgba(15,25,35,${0.35 * storm})`;
        ctx.fillRect(0, 0, vw, vh);
        // Rain streaks blown by the wind
        ctx.strokeStyle = `rgba(200,215,230,${0.35 * storm})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const wx = env.wind.x / ENV.wind * 10, wy = 22;
        for (let i = 0; i < 160 * storm; i++) {
            const x = Math.random() * vw, y = Math.random() * vh;
            ctx.moveTo(x, y);
            ctx.lineTo(x + wx, y + wy);
        }
        ctx.stroke();
    }
    if (lightning > 0) {
        ctx.fillStyle = `rgba(230,240,255,${lightning * 1.6})`;
        ctx.fillRect(0, 0, vw, vh);
    }
}

// ---------- medals and high scores ----------
function loadJson(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}

function saveJson(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { }
}

function unlockMedal(id) {
    const got = loadJson('wb-medals', []);
    if (got.includes(id)) return;
    got.push(id);
    // Everything else done: the achievement of achievements
    const allNow = !got.includes('all') && MEDALS.every(m => m.id === 'all' || got.includes(m.id));
    if (allNow) got.push('all');
    saveJson('wb-medals', got);
    const m = MEDALS.find(x => x.id === id);
    if (m) toast(`🏅 Prestatie: ${m.name}`, '#ffd24a');
    if (allNow) toast('🏆 Prestatie der prestaties!', '#ffd24a');
    if (player) playSound('ping', player.x, player.y, 2);
}

// Called from Blazor after loading / buying: collection achievements
export function checkCollection(ships, shipsTotal, planesOwned, planesTotal, maxUpgrade) {
    if (ships >= 5) unlockMedal('ships5');
    if (ships >= 15) unlockMedal('ships15');
    if (ships >= shipsTotal) unlockMedal('shipsAll');
    if (planesOwned >= 1) unlockMedal('planes1');
    if (planesOwned >= planesTotal) unlockMedal('planesAll');
    if (maxUpgrade) unlockMedal('upgradeMax');
}

// Current rank for the menus
export function getRank() {
    const k = totalKills(), i = rankIndex(k), r = RANKS[i], next = RANKS[i + 1];
    return {
        name: r.name, color: r.color, kills: k,
        next: next ? next.name : '', nextKills: next ? next.kills : k,
        progress: next ? (k - r.kills) / (next.kills - r.kills) : 1,
        ladder: RANKS.map(x => ({ name: x.name, color: x.color, kills: x.kills, done: k >= x.kills }))
    };
}

function saveScore() {
    if (!diff || !runStats) return;
    const all = loadJson('wb-scores', {});
    const list = all[diff.id] || [];
    list.push({ kills, secs: Math.round(time - runStats.start), date: new Date().toISOString().slice(0, 10), ship: player ? player.st.name : '' });
    list.sort((a, b) => b.kills - a.kills || a.secs - b.secs);
    all[diff.id] = list.slice(0, 5);
    saveJson('wb-scores', all);
}

export function getMedals() {
    const got = loadJson('wb-medals', []);
    return MEDALS.map(m => ({ name: m.name, desc: m.desc, done: got.includes(m.id) }));
}

export function getScores(diffId) {
    return loadJson('wb-scores', {})[diffId] || [];
}

// ---------- per-frame update and screen overlay ----------
function updateExtras(dt, active) {
    for (const t of toasts) t.t -= dt;
    toasts = toasts.filter(t => t.t > 0);
    if (!active) return;
    updatePartDamage(player, dt);
    updateFriendlies(dt);
    updateDepthCharges(dt);
    updateFlying(dt);
    if (player.dead) return;
    updateHarbors();
    updateMission(dt);
    updateAir(dt);
    updateEnvironment(dt);
}

function drawHudOverlay() {
    if (state !== 'playing' && state !== 'paused') return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = 10;
    const line = (text, color, size = 15) => {
        ctx.font = `bold ${size}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillText(text, vw / 2 + 1, y + 1);
        ctx.fillStyle = color;
        ctx.fillText(text, vw / 2, y);
        y += size + 6;
    };
    // Flagship health bar
    const boss = enemies.find(e => e.boss && !e.dead);
    if (boss) {
        const bw = Math.min(360, vw * 0.5), bx = vw / 2 - bw / 2;
        line(`VLAGGENSCHIP  •  torens ${boss.turrets.filter(t => !t.broken).length}/${boss.turrets.length}  •  radar ${boss.radarDead ? 'uit' : 'aan'}`, '#ff8a7a', 13);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(bx - 2, y - 2, bw + 4, 12);
        ctx.fillStyle = '#d0402a';
        ctx.fillRect(bx, y, bw * boss.hp / boss.maxHp, 8);
        y += 18;
    }
    if (mission) line('📜 ' + missionText(), '#8ad0ff', 14);
    if (flying) {
        const f = flying, st = f.st;
        const ordName = { bomb: 'bommen', rocket: 'raketten', torpedo: 'torpedo', missile: 'geleide raketten' }[st.ord];
        line(`✈ ${st.name}  •  pantser ${Math.max(0, Math.round(f.hp))}/${st.hp}${ordName ? `  •  ${ordName}: ${f.ord} (F)` : ''}`, '#cfe0ff', 13);
        if (f.phase === 'landed') line('🛬 Op de grond — taxi met W/S en A/D, lijn uit op de baan, T: opstijgen  •  E: naar je schip', '#9fe870', 14);
        else if (f.phase === 'takeoff') line('🛫 Opstijgen…', '#cfe0ff', 14);
        else if (f.phase === 'landing') line('🛬 Landen…', '#cfe0ff', 14);
        else line(`⛽ brandstof ${Math.max(0, Math.ceil(f.fuel))}s  •  landen: langzaam en recht over een baan, dan T`, f.fuel < 15 ? '#ff6a5a' : '#cfe0ff', 13);
    } else if (parkedPlane && player && !player.dead) {
        line(`✈ T: terug naar je vliegtuig (${parkedPlane.st.name})`, '#ffe08a', 14);
    } else if (player && !player.dead && planeSel && (isCarrier(player) || airstripNear(player.x, player.y, AIRSTRIP.near))) {
        line(planeCd > 0 ? `✈ Vliegtuig gereed over ${Math.ceil(planeCd)}s` : isCarrier(player) ? `✈ T: katapultstart met ${planeSel.name}` : `✈ T: opstijgen met ${planeSel.name}`, '#ffe08a', 14);
    }
    if (player && !player.dead && !flying) {
        const parts = [];
        if (player.fireT > 0) parts.push('🔥 brand');
        if (player.engineHit) parts.push('⚙ motor kapot');
        const broken = player.turrets.filter(t => t.broken).length;
        if (broken) parts.push(`🎯 ${broken} toren(s) kapot`);
        if (parts.length) line(parts.join('  •  ') + '  (R)', '#ff9a7a', 13);
        line(depthCd > 0 ? `💣 dieptebommen ${Math.ceil(depthCd)}s` : '💣 dieptebommen gereed (G)', 'rgba(220,235,255,.8)', 12);
    }
    for (const t of toasts) {
        ctx.globalAlpha = clamp(t.t, 0, 1);
        line(t.text, t.color, 16);
    }
    ctx.globalAlpha = 1;
    // Where is the other vehicle: the ship while flying, the parked plane while sailing
    if (flying && player && !player.dead) drawLocator(player.x, player.y, '🚢 je schip');
    else if (parkedPlane) drawLocator(parkedPlane.x, parkedPlane.y, '✈ je vliegtuig');
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

// ---------- airstrips and flying your own aircraft ----------
const AIRSTRIP = { chance: 0.6, len: 640, width: 46, near: 500, landDist: 260, cooldown: 25, flakRange: 700, taxi: 45, gunMul: 2.5, ordMul: 1.6, fuelMul: 3 };
let planeSel = null, flying = null, parkedPlane = null, planeCd = 0, tLatch = false, eLatch = false, playerBombs = [];

// Selected aircraft from the hangar (null = none owned)
export function setPlane(p) { planeSel = p || null; }

// Plane selected instead of a ship: start on the runway of the nearest airstrip island;
// the ship waits at sea off that island as home base
export function startFlying() {
    if (!planeSel || !player) return;
    let isl = null;
    for (let r = 6000; r <= 30000 && !isl; r += 6000) {
        const list = islandsNear(player.x, player.y, r).filter(i => i.airstrip);
        list.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
        isl = list[0] || null;
    }
    if (!isl) return;
    // Park the ship in open water just off the island
    for (let k = 0; k < 40; k++) {
        const a = rand(0, 2 * Math.PI), d = coastRadius(isl, a) + 350 + k * 20;
        const x = isl.x + Math.cos(a) * d, y = isl.y + Math.sin(a) * d;
        if (onIsland(x, y, 200)) continue;
        player.x = x;
        player.y = y;
        player.heading = a;
        break;
    }
    launchFrom(isl);
    cam.x = flying.x;
    cam.y = flying.y;
}

// Airstrip island when (x, y) is on it or within `extra` of its coast
function airstripNear(x, y, extra) {
    for (const isl of islandsNear(x, y, ISLAND_MAX_R + extra)) {
        if (!isl.airstrip) continue;
        if (Math.hypot(x - isl.x, y - isl.y) < coastAt(isl, x, y) + extra) return isl;
    }
    return null;
}

// A "strip" is an island with an airstrip, or { carrier: ship } for an aircraft carrier deck (moves with the ship)
const isCarrier = s => !!s && !s.dead && s.st.jets > 0;

function stripFrame(strip) {
    if (strip.carrier) {
        const c = strip.carrier;
        return { x: c.x, y: c.y, a: c.heading, len: c.st.length * 0.8, width: c.st.width * 0.6, vx: Math.cos(c.heading) * c.speed, vy: Math.sin(c.heading) * c.speed, deck: true };
    }
    return { x: strip.x, y: strip.y, a: strip.airstrip.a, len: strip.airstrip.len, width: AIRSTRIP.width, vx: 0, vy: 0, deck: false };
}

// Plane position along (u) / across (v) a runway or flight deck
function runwayLocal(strip, x, y) {
    const fr = stripFrame(strip), dx = x - fr.x, dy = y - fr.y;
    return { u: dx * Math.cos(fr.a) + dy * Math.sin(fr.a), v: -dx * Math.sin(fr.a) + dy * Math.cos(fr.a) };
}

// Hangar footprint beside the runway (see drawAirstrip), with a small margin
function onHangar(strip, x, y) {
    if (strip.carrier) return false;
    const { u, v } = runwayLocal(strip, x, y), W = AIRSTRIP.width;
    return u > -52 && u < 48 && v > W / 2 + 8 && v < W / 2 + 74;
}

// Explode when the runway ends before lift-off or roll-out
function runwayOverrun(f) {
    toast('💥 Baan te kort — je vliegtuig is verongelukt', '#ff6a5a');
    endFlight(true);
}

// Plane standing still at the runway threshold (or the carrier's stern), engine off; T starts the take-off
function launchFrom(strip, dir = 1) {
    const p = planeSel, fr = stripFrame(strip), a = fr.a + (dir < 0 ? Math.PI : 0), half = fr.len / 2;
    flying = {
        st: p, x: fr.x - Math.cos(a) * half * 0.85, y: fr.y - Math.sin(a) * half * 0.85, a,
        speed: 0, thr: 0, hp: p.hp, fuel: p.fuel * AIRSTRIP.fuelMul, ord: p.ordCount, gunT: 0, ordT: 0,
        phase: 'landed', alt: 0, strip
    };
    if (fr.deck) {
        // Position on the deck, so the plane rides along with the carrier
        flying.deckU = -half * 0.85;
        flying.deckV = 0;
        flying.deckRel = 0;
    }
    player.throttle = strip.carrier ? player.throttle : 0;
    toast(fr.deck ? `✈ ${p.name} staat klaar op de katapult — T: opstijgen` : `✈ ${p.name} staat klaar op de baan — T: opstijgen`, '#cfe0ff');
}

function tryTakeOff() {
    // A plane left parked on a runway: switch straight back to it, however far away
    if (parkedPlane) {
        flying = parkedPlane;
        parkedPlane = null;
        player.throttle = 0;
        toast('✈ Terug in je vliegtuig', '#cfe0ff');
        return;
    }
    if (!planeSel) { toast('✈ Koop eerst een vliegtuig in de hangar', '#ffb08a'); return; }
    if (planeCd > 0) { toast(`✈ Nieuw vliegtuig gereed over ${Math.ceil(planeCd)}s`, '#ffb08a'); return; }
    // Aircraft carrier: catapult launch from your own deck, anywhere
    if (isCarrier(player)) { launchFrom({ carrier: player }); return; }
    const isl = airstripNear(player.x, player.y, AIRSTRIP.near);
    if (!isl) { toast('✈ Vaar naar een eiland met een landingsbaan (gele streep op de radar)', '#ffb08a'); return; }
    launchFrom(isl);
}

function endFlight(crashed) {
    if (!flying) return;
    if (crashed) {
        explosion(flying.x, flying.y, true);
        if (!onIsland(flying.x, flying.y)) waterColumn(flying.x, flying.y, 1.4);
        toast('✈ Je vliegtuig is verloren — je gaat verder op je schip', '#ff8a7a');
        planeCd = AIRSTRIP.cooldown;
        parkedPlane = null;
    } else {
        // Landed plane stays parked on the airfield; T brings you back to it
        if (flying.phase === 'landed') { flying.speed = 0; parkedPlane = flying; }
        toast('🚢 Terug op je schip — T: terug naar je vliegtuig', '#cfe0ff');
    }
    flying = null;
}

// Try to start a landing: low and slow, lined up with a runway or your carrier's deck
function tryLanding(f) {
    const st = f.st;
    const strips = islandsNear(f.x, f.y, ISLAND_MAX_R).filter(i => i.airstrip);
    if (isCarrier(player)) strips.unshift({ carrier: player });
    for (const strip of strips) {
        const fr = stripFrame(strip), { u, v } = runwayLocal(strip, f.x, f.y), half = fr.len / 2;
        if (Math.abs(u) > half + AIRSTRIP.landDist || Math.abs(v) > fr.width * 2.5) continue;
        // Runways: either direction; carrier: only in the ship's direction of travel
        const err = Math.abs(norm(f.a - fr.a)), diffA = fr.deck ? err : Math.min(err, Math.PI - err);
        if (diffA > 35 * DEG) { toast(fr.deck ? '✈ Nader het vliegdekschip van achteren, in zijn vaarrichting' : '✈ Vlieg recht over de landingsbaan om te landen', '#ffb08a'); return; }
        if (f.speed > st.minSpeed * 1.4) { toast('✈ Te snel om te landen: minder gas (S)', '#ffb08a'); return; }
        f.phase = 'landing';
        f.strip = strip;
        f.a = err < Math.PI / 2 ? fr.a : fr.a + Math.PI;
        // Line up exactly on the centre line
        const uu = clamp(u, -half, half);
        f.x = fr.x + Math.cos(fr.a) * uu;
        f.y = fr.y + Math.sin(fr.a) * uu;
        toast(fr.deck ? '✈ Landen op het vliegdekschip… vanghaak uit' : '✈ Landen…', '#cfe0ff');
        return;
    }
    toast('✈ Landen kan alleen boven een landingsbaan of je vliegdekschip', '#ffb08a');
}

// Keeps a plane standing on a carrier deck in place as the ship moves and turns
function rideDeck(f) {
    if (!f.strip || !f.strip.carrier) return;
    const c = f.strip.carrier, ca = Math.cos(c.heading), sa = Math.sin(c.heading);
    f.x = c.x + ca * f.deckU - sa * f.deckV;
    f.y = c.y + sa * f.deckU + ca * f.deckV;
    f.a = c.heading + f.deckRel;
}

function controlPlane(dt) {
    const f = flying, st = f.st;
    const tNow = !!keys.KeyT, eNow = !!keys.KeyE;
    const tPress = tNow && !tLatch, ePress = eNow && !eLatch;
    tLatch = tNow;
    eLatch = eNow;
    // Phone joystick on the ground: up = taxi forward, down = reverse (in the air: see direction steering below)
    if (stickUsed && f.phase !== 'air' && !(keys.KeyW || keys.ArrowUp || keys.KeyS || keys.ArrowDown))
        f.thr = stickThrottle >= 0 ? stickThrottle : stickThrottle * 0.5;

    // Ground phases: take-off roll, landing roll-out, parked on the runway
    if (f.phase === 'takeoff') {
        const fr = stripFrame(f.strip);
        // Carrier: steam catapult; runway: normal take-off run
        const acc = fr.deck ? st.minSpeed * 1.6 : Math.max(60, st.minSpeed * 0.45);
        f.speed = Math.min(st.minSpeed * 1.05, f.speed + dt * acc);
        f.alt = clamp((f.speed - st.minSpeed * 0.6) / (st.minSpeed * 0.45), 0, 1);
        f.x += (Math.cos(f.a) * f.speed + fr.vx) * dt;
        f.y += (Math.sin(f.a) * f.speed + fr.vy) * dt;
        // Runway / deck ends before lift-off: the plane crashes
        const rl = runwayLocal(f.strip, f.x, f.y);
        if (f.alt < 1 && (Math.abs(rl.u) > fr.len / 2 + 15 || Math.abs(rl.v) > fr.width * 0.5)) { runwayOverrun(f); return; }
        if (f.speed >= st.minSpeed) { f.phase = 'air'; f.alt = 1; toast('✈ In de lucht — boven een landingsbaan of je vliegdekschip T om te landen', '#cfe0ff'); }
        return;
    }
    if (f.phase === 'landing') {
        const fr = stripFrame(f.strip), rl = runwayLocal(f.strip, f.x, f.y);
        // Brake hard enough to stop on what is left of the runway (arrester wires on a carrier)
        const dir = Math.cos(norm(f.a - fr.a)) >= 0 ? 1 : -1;
        const left = Math.max(20, fr.len / 2 - rl.u * dir);
        const brake = Math.max(fr.deck ? st.minSpeed * 1.5 : 70, f.speed * f.speed / (2 * left * 0.85));
        f.speed = Math.max(0, f.speed - dt * brake);
        f.alt = Math.max(0, f.alt - dt * (fr.deck ? 2 : 0.9));
        f.x += (Math.cos(f.a) * f.speed + fr.vx) * dt;
        f.y += (Math.sin(f.a) * f.speed + fr.vy) * dt;
        const nl = runwayLocal(f.strip, f.x, f.y);
        if (Math.abs(nl.u) > fr.len / 2 + 15 || Math.abs(nl.v) > fr.width * 0.6) { runwayOverrun(f); return; }
        if (f.speed <= 0) {
            // Landed: refuel, rearm and repair
            f.phase = 'landed';
            f.alt = 0;
            f.thr = 0;
            f.fuel = st.fuel * AIRSTRIP.fuelMul;
            f.ord = st.ordCount;
            f.hp = st.hp;
            unlockMedal(fr.deck ? 'carrierLanding' : 'landing');
            if (fr.deck) {
                // Remember the deck spot so the plane rides along with the carrier
                f.deckU = nl.u;
                f.deckV = nl.v;
                f.deckRel = norm(f.a - fr.a);
                toast('✈ Geland op het vliegdekschip: bijgetankt en herbewapend — taxi terug naar achteren, dan T: katapultstart  •  E: naar je schip', '#9fe870');
            } else toast('✈ Geland: bijgetankt en herbewapend — taxi naar de baan en T: opstijgen  •  E: naar je schip', '#9fe870');
        }
        return;
    }
    if (f.phase === 'landed' && f.strip && f.strip.carrier) {
        // On the carrier deck: rides along; taxi back to the stern yourself, then T = catapult launch
        if (f.strip.carrier.dead) { endFlight(true); return; }
        if (ePress) { rideDeck(f); endFlight(false); return; }
        const fr = stripFrame(f.strip);
        const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
        if (up) f.thr = Math.min(1, f.thr + dt * 0.8);
        if (down) f.thr = Math.max(-0.5, f.thr - dt * 0.8);   // below 0 = reverse
        f.speed = approach(f.speed, AIRSTRIP.taxi * 0.6 * f.thr, dt * 40);
        const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
        const steer = left || right ? (right ? 1 : 0) - (left ? 1 : 0) : wheelAngle / WHEEL_MAX;
        // Steering works both ways (reversed when rolling backwards, like a car)
        f.deckRel = norm(f.deckRel + steer * 70 * DEG * dt * clamp(f.speed / 12, -1, 1));
        const nu = f.deckU + Math.cos(f.deckRel) * f.speed * dt, nv = f.deckV + Math.sin(f.deckRel) * f.speed * dt;
        // Stay on the deck
        if (Math.abs(nu) < fr.len / 2 && Math.abs(nv) < fr.width / 2) { f.deckU = nu; f.deckV = nv; } else f.speed = 0;
        rideDeck(f);
        if (tPress) {
            // Launch from where you stand, nose forward; too little deck left means a crash
            if (Math.abs(norm(f.deckRel)) < 15 * DEG && Math.abs(f.deckV) < fr.width * 0.35) {
                f.a = fr.a;
                f.speed = 0;
                f.phase = 'takeoff';
                toast(`✈ Katapultstart met ${st.name}…`, '#cfe0ff');
                playSound('jet', f.x, f.y, 1);
            } else toast('✈ Taxi naar het midden van het dek en draai met de neus naar voren (W/S rijden, A/D sturen)', '#ffb08a');
        }
        return;
    }
    if (f.phase === 'landed') {
        if (ePress) { endFlight(false); return; }
        // Taxi on the ground: W/S or the lever to roll, A/D or the wheel to steer
        const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
        if (up) f.thr = Math.min(1, f.thr + dt * 0.8);
        if (down) f.thr = Math.max(-0.5, f.thr - dt * 0.8);   // below 0 = reverse
        f.speed = approach(f.speed, AIRSTRIP.taxi * f.thr, dt * 40);
        const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
        const steer = left || right ? (right ? 1 : 0) - (left ? 1 : 0) : wheelAngle / WHEEL_MAX;
        f.a += steer * 70 * DEG * dt * clamp(f.speed / 15, -1, 1);
        const nx = f.x + Math.cos(f.a) * f.speed * dt, ny = f.y + Math.sin(f.a) * f.speed * dt;
        // Stays on land and off the hangar
        if (terrainHeight(nx, ny) > 0.02 && !onHangar(f.strip, nx, ny)) { f.x = nx; f.y = ny; } else f.speed = 0;
        if (tPress) {
            // Take off from where you are: on the runway and lined up with it
            const rl = runwayLocal(f.strip, f.x, f.y), half = f.strip.airstrip.len / 2;
            const err = Math.abs(norm(f.a - f.strip.airstrip.a)), aligned = Math.min(err, Math.PI - err) < 15 * DEG;
            if (Math.abs(rl.u) < half - 10 && Math.abs(rl.v) < AIRSTRIP.width * 0.4 && aligned) {
                // A short remaining runway is your own risk: run out of it and the plane crashes
                f.a = err < Math.PI / 2 ? f.strip.airstrip.a : f.strip.airstrip.a + Math.PI;
                f.phase = 'takeoff';
                toast(`✈ Opstijgen met ${st.name}…`, '#cfe0ff');
                playSound('jet', f.x, f.y, 1);
            } else toast('✈ Taxi eerst op de baan en draai in de lengterichting (W/S rijden, A/D sturen)', '#ffb08a');
        }
        return;
    }

    if (tPress) tryLanding(f);
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    if (up) f.thr = Math.min(1, f.thr + dt * 0.8);
    if (down) f.thr = Math.max(0, f.thr - dt * 0.8);
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    const stickMag = Math.hypot(stickX, stickY);
    if (!left && !right && stickActive && stickMag > 0.2) {
        // Phone joystick = direction: the plane turns towards where the stick points (up = up on screen);
        // power comes from the lever (or W/S)
        const want = Math.atan2(stickY, stickX);
        f.a += clamp(norm(want - f.a), -st.turn * DEG * dt, st.turn * DEG * dt);
    } else {
        const steer = left || right ? (right ? 1 : 0) - (left ? 1 : 0) : 0;
        f.a += steer * st.turn * DEG * dt;
    }
    f.speed = approach(f.speed, lerp(st.minSpeed, st.speed, f.thr), dt * 120);
    f.x += Math.cos(f.a) * f.speed * dt;
    f.y += Math.sin(f.a) * f.speed * dt;
    f.fuel -= dt;

    // Forward-firing guns
    f.gunT -= dt;
    if ((mouse.down || keys.Space || fireHeld) && f.gunT <= 0) {
        f.gunT = st.gunRate;
        const cannon = st.gun === 'cannon', c = Math.cos(f.a), n = Math.sin(f.a);
        for (let i = 0; i < st.guns; i++) {
            const off = (i - (st.guns - 1) / 2) * (st.span / (st.guns + 1));
            const x = f.x + c * st.length * 0.35 - n * off, y = f.y + n * st.length * 0.35 + c * off;
            const a = f.a + rand(-1.2, 1.2) * DEG;
            shells.push({ x, y, dx: Math.cos(a), dy: Math.sin(a), speed: 1100 + f.speed, left: cannon ? 800 : 650, enemy: false, dmg: st.gunDamage * AIRSTRIP.gunMul, mg: true, done: false, fromPlane: true });
        }
        playSound('mg', f.x, f.y, cannon ? 1.3 : 0.8);
    }
    // Bombs / rockets / torpedo / guided missiles
    f.ordT -= dt;
    if ((keys.KeyF || specialQueued) && f.ord > 0 && f.ordT <= 0) {
        dropOrdnance(f);
        f.ordT = 0.6;
    }
    specialQueued = false;
}

function dropOrdnance(f) {
    const st = f.st, dx = Math.cos(f.a), dy = Math.sin(f.a), dmg = st.ordDamage * AIRSTRIP.ordMul;
    f.ord--;
    switch (st.ord) {
        case 'bomb':
            playerBombs.push({ x: f.x, y: f.y, vx: dx * f.speed * 0.5, vy: dy * f.speed * 0.5, t: 0.9, dmg });
            break;
        case 'rocket':
            shells.push({ x: f.x, y: f.y, dx, dy, speed: 900 + f.speed, left: 1000, enemy: false, dmg, done: false, fromPlane: true });
            addParticle({ kind: 'steam', x: f.x, y: f.y, vx: -dx * 40, vy: -dy * 40, max: 1, size: 4, grow: 10, alpha: 0.6 });
            playSound('launch', f.x, f.y, 0.7);
            break;
        case 'torpedo':
            shells.push({ x: f.x + dx * 30, y: f.y + dy * 30, dx, dy, speed: TORPEDO.speed, left: TORPEDO.range, enemy: false, dmg, done: false, torp: true, trail: 0 });
            addParticle({ kind: 'water', x: f.x + dx * 30, y: f.y + dy * 30, vx: 0, vy: 0, max: 0.7, size: 6, grow: 16, alpha: 0.7 });
            playSound('splash', f.x, f.y, 0.8);
            break;
        case 'missile': {
            const target = nearestEnemy(f.x + dx * 600, f.y + dy * 600, 2500);
            missiles.push({ x: f.x, y: f.y, a: f.a, speed: f.speed, target, life: MISSILE.life, age: 0, trail: 0 });
            playSound('launch', f.x, f.y, 0.8);
            break;
        }
    }
}

function updateFlying(dt) {
    planeCd = Math.max(0, planeCd - dt);
    for (const b of playerBombs) {
        b.t -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.t > 0) continue;
        explosion(b.x, b.y, true);
        if (onIsland(b.x, b.y)) burst(b.x, b.y, 14, 'sand', 70, 1.2, 7);
        else waterColumn(b.x, b.y, 1.6);
        for (const e of enemies) {
            if (e.dead || e.st.sub) continue;
            if (Math.hypot(e.x - b.x, e.y - b.y) < 70 + e.st.width / 2) damage(e, b.dmg);
        }
    }
    playerBombs = playerBombs.filter(b => b.t > 0);
    // A plane parked on the carrier deck sails along with the ship
    if (parkedPlane && parkedPlane.strip && parkedPlane.strip.carrier) {
        if (parkedPlane.strip.carrier.dead) parkedPlane = null;
        else rideDeck(parkedPlane);
    }
    if (!flying) return;
    if (player.dead) { endFlight(true); return; }
    // Enemy flak against your aircraft
    for (const e of enemies) {
        if (flying.phase !== 'air') break;
        if (e.dead || e.st.sub || !e.turrets.length) continue;
        if (Math.hypot(e.x - flying.x, e.y - flying.y) > AIRSTRIP.flakRange || Math.random() > dt * 0.9) continue;
        addParticle({ kind: 'smoke', x: flying.x + rand(-45, 45), y: flying.y + rand(-45, 45), vx: 0, vy: 0, max: 1.2, size: 5, grow: 12, alpha: 0.7 });
        if (Math.random() < 0.35) flying.hp -= 5 * diff.enemyDamage;
    }
    if (flying.fuel <= 0 || flying.hp <= 0) endFlight(true);
}

function drawPlayerPlane() {
    // Falling bombs from your aircraft
    for (const b of playerBombs) {
        ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2 + b.t * 4, 0, 2 * Math.PI);
        ctx.fill();
    }
    if (parkedPlane) drawPlane(parkedPlane.st, parkedPlane.x, parkedPlane.y, parkedPlane.a, 0, 1, 1, false);
    if (!flying) return;
    const f = flying, st = f.st;
    // Standing still on the ground with the throttle closed: engine off
    // Standing still with the throttle closed, or rolling backwards (pushback): engine off
    const engOff = f.phase === 'landed' && ((Math.abs(f.speed) < 1 && Math.abs(f.thr) < 0.05) || f.speed < 0 || f.thr < 0);
    const power = f.phase === 'air' ? 0.25 + f.thr * 0.75 : f.phase === 'takeoff' ? 1 : f.phase === 'landing' ? 0.2 : 0.15 + Math.abs(f.speed) / AIRSTRIP.taxi * 0.25;
    drawPlane(st, f.x, f.y, f.a, f.alt ?? 1, 1, 1, engOff ? false : power);
    // Jet exhaust trail
    if (st.jet && f.alt > 0.5 && Math.random() < 0.6) {
        addParticle({ kind: 'steam', x: f.x - Math.cos(f.a) * st.length * 0.55, y: f.y - Math.sin(f.a) * st.length * 0.55, vx: 0, vy: 0, max: 0.5, size: 3, grow: 8, alpha: 0.4 });
    }
}

function fighterJetPath() {
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(8, -2.5); ctx.lineTo(-2, -3); ctx.lineTo(-10, -18); ctx.lineTo(-14, -18); ctx.lineTo(-10, -3);
    ctx.lineTo(-16, -3); ctx.lineTo(-20, -9); ctx.lineTo(-22, -9); ctx.lineTo(-20, 0);
    ctx.lineTo(-22, 9); ctx.lineTo(-20, 9); ctx.lineTo(-16, 3); ctx.lineTo(-10, 3);
    ctx.lineTo(-14, 18); ctx.lineTo(-10, 18); ctx.lineTo(-2, 3); ctx.lineTo(8, 2.5);
    ctx.closePath();
}

// Runway with markings, hangar and windsock
function drawAirstrip(isl) {
    const s = isl.airstrip, L = s.len, W = AIRSTRIP.width;
    ctx.save();
    ctx.translate(isl.x, isl.y);
    ctx.rotate(s.a);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillRect(-L / 2 + 4, -W / 2 + 4, L, W);
    ctx.fillStyle = '#3c3f42';
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.strokeStyle = 'rgba(240,240,240,.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-L / 2 + 3, -W / 2 + 3, L - 6, W - 6);
    ctx.setLineDash([22, 18]);
    ctx.beginPath(); ctx.moveTo(-L / 2 + 40, 0); ctx.lineTo(L / 2 - 40, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,240,240,.85)';
    for (const end of [-1, 1]) for (let k = -3; k <= 3; k++) ctx.fillRect(end * (L / 2 - 22) - 8, k * 5 - 1.5, 16, 3);
    // Hangar and windsock beside the runway
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-36, W / 2 + 22, 76, 44);
    ctx.fillStyle = '#7d8790';
    ctx.fillRect(-40, W / 2 + 18, 76, 44);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let x = -36; x < 36; x += 8) ctx.fillRect(x, W / 2 + 18, 3, 44);
    ctx.fillStyle = '#ff7a2a';
    ctx.fillRect(60, W / 2 + 14, 14, 4);
    ctx.restore();
}

// ---------- detailed aircraft rendering (cached sprites, like the ships) ----------
const PLANE_ENGINES = { lancaster: 4, mosquito: 2 };
// Enemy bomber model
const ENEMY_PLANE = { id: 'enemy-bomber', name: 'Bommenwerper', length: 30, span: 44, color: '#5a5f4a', engines: 2, enemy: true };
const planeSprites = new Map();

// Engine positions (local, x = forward) and fuselage half-width
function planeLayout(p) {
    const L = p.length, S2 = p.span / 2, n = p.jet ? 0 : (PLANE_ENGINES[p.id] || p.engines || 1);
    const engines = [];
    if (n === 1) engines.push([L * 0.5, 0]);
    else if (n === 2) engines.push([L * 0.12, -S2 * 0.32], [L * 0.12, S2 * 0.32]);
    else if (n >= 4) engines.push([L * 0.1, -S2 * 0.28], [L * 0.1, S2 * 0.28], [L * 0.06, -S2 * 0.56], [L * 0.06, S2 * 0.56]);
    return { L, S2, engines, fw: L * (n > 1 ? 0.075 : 0.065) };
}

function planeSprite(p) {
    const key = `${p.id || p.name}|${p.color}`;
    let sp = planeSprites.get(key);
    if (!sp) planeSprites.set(key, sp = buildPlaneSprite(p));
    return sp;
}

// Body, wings, tail, nacelles, canopy, markings — and a matching black silhouette for the shadow
function buildPlaneSprite(p) {
    const lay = planeLayout(p), pad = 3;
    const w = lay.L + pad * 2, h = lay.S2 * 2 + pad * 2, S = Math.max(3, spriteScale * 1.6);
    const c = makeCanvas(w * S, h * S), sh = makeCanvas(w * S, h * S);
    for (const [cv, shadow] of [[c, false], [sh, true]]) {
        const g = cv.getContext('2d');
        g.setTransform(S, 0, 0, S, cv.width / 2, cv.height / 2);
        drawPlaneBody(g, p, lay, shadow);
    }
    return { canvas: c, shadow: sh, w, h, lay };
}

function drawPlaneBody(g, p, lay, shadow) {
    const { L, S2, engines, fw } = lay, base = p.color;
    const lit = (y0, y1, k = 1) => {
        if (shadow) return '#000';
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, shade(base, 1.35 * k));
        gr.addColorStop(0.5, shade(base, 1.0 * k));
        gr.addColorStop(1, shade(base, 0.62 * k));
        return gr;
    };
    const line = (x0, y0, x1, y1, a = 0.35, wdt = 0.25) => {
        g.strokeStyle = `rgba(0,0,0,${a})`;
        g.lineWidth = wdt;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };

    // Wings: straight with rounded tips, or swept for jets
    g.beginPath();
    if (p.jet) {
        g.moveTo(L * 0.1, -fw); g.lineTo(-L * 0.18, -S2); g.lineTo(-L * 0.3, -S2); g.lineTo(-L * 0.22, -fw);
        g.lineTo(-L * 0.22, fw); g.lineTo(-L * 0.3, S2); g.lineTo(-L * 0.18, S2); g.lineTo(L * 0.1, fw);
    } else {
        g.moveTo(L * 0.13, -fw); g.lineTo(L * 0.05, -S2 * 0.96); g.quadraticCurveTo(L * 0.01, -S2 * 1.02, -L * 0.04, -S2 * 0.97);
        g.lineTo(-L * 0.1, -fw); g.lineTo(-L * 0.1, fw); g.lineTo(-L * 0.04, S2 * 0.97);
        g.quadraticCurveTo(L * 0.01, S2 * 1.02, L * 0.05, S2 * 0.96); g.lineTo(L * 0.13, fw);
    }
    g.closePath();
    g.fillStyle = lit(-S2, S2);
    g.fill();
    if (!shadow) {
        g.strokeStyle = 'rgba(0,0,0,.45)';
        g.lineWidth = 0.3;
        g.stroke();
        // Flaps / ailerons and a spar line
        for (const s of [-1, 1]) {
            if (p.jet) { line(-L * 0.2, s * fw * 1.4, -L * 0.27, s * S2 * 0.9); line(-L * 0.06, s * fw * 1.2, -L * 0.2, s * S2 * 0.85, 0.2); }
            else {
                line(-L * 0.06, s * fw * 1.3, -L * 0.02, s * S2 * 0.92);
                line(-L * 0.08, s * S2 * 0.55, -L * 0.03, s * S2 * 0.55, 0.4);
                line(L * 0.08, s * fw * 1.3, L * 0.04, s * S2 * 0.9, 0.18);
            }
        }
    }

    // Tailplane
    g.beginPath();
    const ts = S2 * (p.jet ? 0.4 : 0.36);
    g.moveTo(-L * 0.34, -fw * 0.6); g.lineTo(-L * 0.41, -ts); g.lineTo(-L * 0.48, -ts); g.lineTo(-L * 0.46, -fw * 0.4);
    g.lineTo(-L * 0.46, fw * 0.4); g.lineTo(-L * 0.48, ts); g.lineTo(-L * 0.41, ts); g.lineTo(-L * 0.34, fw * 0.6);
    g.closePath();
    g.fillStyle = lit(-ts, ts, 0.95);
    g.fill();
    if (!shadow) { g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 0.25; g.stroke(); line(-L * 0.44, -ts * 0.9, -L * 0.44, ts * 0.9, 0.25); }

    // Engine nacelles on the wings
    for (const [ex, ey] of engines) {
        if (ey === 0) continue;
        g.fillStyle = lit(ey - fw, ey + fw, 0.9);
        g.beginPath();
        g.ellipse(ex + L * 0.03, ey, L * 0.13, fw * 0.75, 0, 0, 2 * Math.PI);
        g.fill();
        if (!shadow) {
            g.fillStyle = 'rgba(20,20,20,.55)';
            g.beginPath(); g.ellipse(ex + L * 0.15, ey, L * 0.02, fw * 0.55, 0, 0, 2 * Math.PI); g.fill();
            // Exhaust stain streaking back over the wing
            const st = g.createLinearGradient(ex, 0, ex - L * 0.2, 0);
            st.addColorStop(0, 'rgba(30,30,30,.35)');
            st.addColorStop(1, 'rgba(30,30,30,0)');
            g.fillStyle = st;
            g.fillRect(ex - L * 0.2, ey - fw * 0.3, L * 0.2, fw * 0.6);
        }
    }

    // Fuselage
    g.beginPath();
    g.moveTo(L * 0.5, 0);
    g.bezierCurveTo(L * 0.5, -fw * 0.95, L * 0.32, -fw * 1.1, L * 0.12, -fw);
    g.lineTo(-L * 0.34, -fw * 0.55);
    g.quadraticCurveTo(-L * 0.5, -fw * 0.32, -L * 0.5, 0);
    g.quadraticCurveTo(-L * 0.5, fw * 0.32, -L * 0.34, fw * 0.55);
    g.lineTo(L * 0.12, fw);
    g.bezierCurveTo(L * 0.32, fw * 1.1, L * 0.5, fw * 0.95, L * 0.5, 0);
    g.closePath();
    g.fillStyle = lit(-fw, fw, 1.05);
    g.fill();
    if (shadow) return;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 0.3;
    g.stroke();
    // Panel lines and the vertical fin seen from above
    for (const x of [0.3, 0.05, -0.15, -0.3]) line(L * x, -fw * 0.85, L * x, fw * 0.85, 0.22, 0.2);
    g.fillStyle = shade(base, 0.7);
    g.fillRect(-L * 0.5, -fw * 0.16, L * 0.15, fw * 0.32);

    // Cockpit canopy with glass gradient and frames
    const cx = p.jet ? L * 0.27 : L * 0.16, cr = L * (p.jet ? 0.1 : 0.08);
    const glass = g.createLinearGradient(cx, -fw * 0.6, cx, fw * 0.6);
    glass.addColorStop(0, '#cfeaff');
    glass.addColorStop(0.45, '#6a9cc0');
    glass.addColorStop(1, '#1e3850');
    g.fillStyle = glass;
    g.beginPath(); g.ellipse(cx, 0, cr, fw * 0.55, 0, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = 'rgba(30,30,30,.7)';
    g.lineWidth = 0.25;
    g.stroke();
    line(cx - cr * 0.3, -fw * 0.5, cx - cr * 0.3, fw * 0.5, 0.6, 0.2);
    line(cx + cr * 0.3, -fw * 0.45, cx + cr * 0.3, fw * 0.45, 0.6, 0.2);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(cx + cr * 0.2, -fw * 0.25, cr * 0.35, fw * 0.12, 0, 0, 2 * Math.PI); g.fill();
    // Bombers: glazed nose and tail gun turret
    if (engines.length > 1) {
        g.fillStyle = glass;
        g.beginPath(); g.ellipse(L * 0.45, 0, L * 0.05, fw * 0.6, 0, 0, 2 * Math.PI); g.fill();
        g.beginPath(); g.arc(-L * 0.49, 0, fw * 0.45, 0, 2 * Math.PI); g.fill();
    }
    // Jets: air intakes beside the cockpit and the exhaust nozzle
    if (p.jet) {
        g.fillStyle = '#151515';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(L * 0.17, s * fw * 0.95, L * 0.05, fw * 0.25, 0, 0, 2 * Math.PI); g.fill(); }
        g.beginPath(); g.arc(-L * 0.5, 0, fw * 0.4, 0, 2 * Math.PI); g.fill();
    }

    // Under-wing stores
    if (p.ord === 'rocket') {
        g.fillStyle = '#d8d8d0';
        for (const s of [-1, 1]) for (let k = 0; k < Math.min(4, Math.ceil((p.ordCount || 2) / 2)); k++) g.fillRect(-L * 0.04, s * (S2 * 0.38 + k * S2 * 0.1) - 0.4, L * 0.16, 0.8);
    } else if (p.ord === 'torpedo') {
        g.fillStyle = 'rgba(40,46,50,.9)';
        g.beginPath(); g.ellipse(L * 0.02, 0, L * 0.22, fw * 0.3, 0, 0, 2 * Math.PI); g.fill();
    } else if (p.ord === 'missile') {
        g.fillStyle = '#eeeeee';
        for (const s of [-1, 1]) for (const k of [0.45, 0.7]) g.fillRect(-L * 0.18, s * S2 * k - 0.5, L * 0.18, 1);
    }

    // National markings: roundels on the wings, fin flash
    const rr = Math.min(fw * 1.1, S2 * 0.12);
    for (const s of [-1, 1]) {
        const rx = p.jet ? -L * 0.17 : -L * 0.01, ry = s * S2 * 0.66;
        const rings = p.enemy ? ['#ffffff', '#c03a2a'] : ['#e8d070', '#2a4aa0', '#ffffff', '#c03a2a'];
        rings.forEach((col, i) => {
            g.fillStyle = col;
            g.beginPath(); g.arc(rx, ry, rr * (1 - i / rings.length), 0, 2 * Math.PI); g.fill();
        });
    }
    // Weathering speckles
    for (let k = 0; k < 40; k++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
        g.fillRect(rand(-L * 0.45, L * 0.45), rand(-fw * 0.8, fw * 0.8), 0.6, 0.6);
    }
}

// Draws an aircraft with its shadow (alt 0 = on the ground, 1 = flying); engine off = no burner, still propeller
function drawPlane(p, x, y, a, alt = 1, k = 1, alpha = 1, engine = true) {
    const sp = planeSprite(p), sc = (0.85 + 0.15 * alt) * k, { L, S2, engines } = sp.lay;
    ctx.save();
    ctx.translate(x + 45 * alt + 3, y + 55 * alt + 3);
    ctx.rotate(a);
    ctx.scale(sc, sc);
    ctx.globalAlpha = 0.28 * alpha;
    ctx.drawImage(sp.shadow, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    if (p.jet) {
        if (engine) drawJetExhaust(L, sp.lay.fw, engine === true ? 1 : engine);
    } else {
        // Running: blur disc plus faint spinning blades; stopped: three solid blades standing still
        for (const [ex, ey] of engines) {
            const px = ey === 0 ? L * 0.51 : ex + L * 0.17, r = ey === 0 ? L * 0.17 : S2 * 0.12;
            if (engine) {
                ctx.fillStyle = 'rgba(210,210,210,.16)';
                ctx.beginPath(); ctx.ellipse(px, ey, r * 0.18, r, 0, 0, 2 * Math.PI); ctx.fill();
            }
            ctx.strokeStyle = engine ? 'rgba(40,40,40,.5)' : '#2a2a2a';
            ctx.lineWidth = engine ? 0.6 : 1.1;
            const spin = engine ? time * 45 + ey : 0.4 + ey;
            ctx.beginPath();
            for (let b = 0; b < 3; b++) {
                const ba = spin + b * 2.094;
                ctx.moveTo(px, ey);
                ctx.lineTo(px, ey + Math.sin(ba) * r);
            }
            ctx.stroke();
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.arc(px, ey, Math.max(0.6, r * 0.12), 0, 2 * Math.PI); ctx.fill();
        }
    }
    ctx.restore();
}

// Screen marker for a world point: a label above it when visible, else an arrow at the screen edge with distance
function drawLocator(wx, wy, label) {
    const sx = vw / 2 + (wx - cam.x) * zoom, sy = vh / 2 + (wy - cam.y) * zoom;
    const d = Math.round(Math.hypot(wx - (flying || player || cam).x, wy - (flying || player || cam).y));
    const m = 46;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (sx > m && sx < vw - m && sy > m && sy < vh - m) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillText(label, sx + 1, sy - 34 + 1);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(label, sx, sy - 34);
        return;
    }
    // Clamp the direction to the screen border
    const a = Math.atan2(sy - vh / 2, sx - vw / 2);
    const kx = (vw / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), ky = (vh / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(a)));
    const r = Math.min(kx, ky), ex = vw / 2 + Math.cos(a) * r, ey = vh / 2 + Math.sin(a) * r;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, 2 * Math.PI); ctx.fill();
    ctx.rotate(a);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(12, -7); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(label.split(' ')[0], ex, ey - 4);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`, ex, ey + 10);
}

// ---------- aircraft engine sound ----------
// Piston: detuned sawtooth firing pulses + square blade beat through a lowpass, exhaust noise
// chopped at the firing rate. Jet: broadband roar, low rumble and a rising turbine whine.
let planeAudio = null;

function buildPlaneAudio(st) {
    const ac = audio.ctx, nodes = [];
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(audio.master);
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const noise = buf => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rand(0.9, 1.1); nodes.push(s); return s; };
    const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; nodes.push(o); return o; };
    const p = { key: st.id, out, nodes };
    // Wind rush over the airframe
    const wf = filt('bandpass', 1300, 0.4);
    p.windG = gain(0);
    noise(audio.noise).connect(wf);
    wf.connect(p.windG);
    p.windG.connect(out);
    if (st.jet) {
        p.roarF = filt('lowpass', 1200, 0.5);
        p.roarG = gain(0.8);
        noise(audio.noise).connect(p.roarF);
        p.roarF.connect(p.roarG);
        p.roarG.connect(out);
        const rum = filt('lowpass', 180, 0.6);
        noise(audio.brown).connect(rum);
        rum.connect(gain(1.2)).connect(out);
        p.whine = osc('sine', 2000);
        p.whine.connect(gain(0.03)).connect(out);
        p.whine2 = osc('sine', 3000);
        p.whine2.connect(gain(0.012)).connect(out);
    } else {
        const engines = Math.min(2, PLANE_ENGINES[st.id] || 1);
        p.toneF = filt('lowpass', 900, 0.8);
        p.toneF.connect(out);
        p.osc = [];
        p.blade = [];
        for (let i = 0; i < engines; i++) {
            const o = osc('sawtooth', 120);
            o.connect(gain(0.3)).connect(p.toneF);
            p.osc.push(o);
            const b = osc('square', 40);
            b.connect(gain(0.18)).connect(p.toneF);
            p.blade.push(b);
        }
        const bf = filt('bandpass', 420, 0.8), ng = gain(0.4);
        noise(audio.noise).connect(bf);
        bf.connect(ng);
        ng.connect(out);
        p.am = osc('square', 120);
        p.am.connect(gain(0.35)).connect(ng.gain);
    }
    nodes.forEach(n => n.start());
    return p;
}

function updatePlaneSound() {
    if (!audio) return;
    const t = audio.ctx.currentTime;
    const st = flying && state === 'playing' ? flying.st : null;
    // Different (or no) aircraft: fade out and stop the old engine
    if (planeAudio && (!st || planeAudio.key !== st.id)) {
        const old = planeAudio;
        old.out.gain.setTargetAtTime(0, t, 0.25);
        setTimeout(() => old.nodes.forEach(n => { try { n.stop(); } catch { } }), 1200);
        planeAudio = null;
    }
    if (!st) return;
    if (!planeAudio) planeAudio = buildPlaneAudio(st);
    const p = planeAudio, f = flying;
    // Engine power: taxiing is near idle, in the air it follows the throttle
    const pw = f.phase === 'landed' ? clamp(0.12 + Math.abs(f.speed) / AIRSTRIP.taxi * 0.3, 0, 1)
        : f.phase === 'landing' ? 0.2 : f.phase === 'takeoff' ? 1 : 0.3 + f.thr * 0.7;
    const sp = clamp(f.speed / st.speed, 0, 1);
    if (st.jet) {
        p.roarF.frequency.setTargetAtTime(500 + pw * 2800, t, 0.3);
        p.roarG.gain.setTargetAtTime(0.35 + pw * 0.9, t, 0.3);
        p.whine.frequency.setTargetAtTime(1300 + pw * 2700, t, 0.5);
        p.whine2.frequency.setTargetAtTime((1300 + pw * 2700) * 1.5, t, 0.5);
    } else {
        // Firing frequency of the cylinders and the propeller blade beat
        const fire = 60 + pw * 120;
        p.osc.forEach((o, i) => o.frequency.setTargetAtTime(fire * (1 + i * 0.013), t, 0.25));
        p.blade.forEach((o, i) => o.frequency.setTargetAtTime(fire * 0.33 * (1 + i * 0.017), t, 0.25));
        p.am.frequency.setTargetAtTime(fire, t, 0.25);
        p.toneF.frequency.setTargetAtTime(450 + pw * 1500, t, 0.3);
    }
    p.windG.gain.setTargetAtTime(sp * 0.5 * (f.alt ?? 1), t, 0.4);
    // Standing still with the throttle closed, or rolling backwards: engine off (silent)
    const off = f.phase === 'landed' && ((Math.abs(f.speed) < 1 && Math.abs(f.thr) < 0.05) || f.speed < 0 || f.thr < 0);
    p.out.gain.setTargetAtTime(muted || off ? 0 : 0.15, t, 0.3);
}

// Jet exhaust in plane-local space (nozzle at -L/2): heat glow, flickering outer flame, blue-white core
// and shock diamonds on afterburner. power 0..1 (idle .. full throttle)
function drawJetExhaust(L, fw, power) {
    const pw = clamp(power, 0, 1), nx = -L * 0.5, r = fw * 0.42;
    const flick = 0.88 + Math.random() * 0.24;
    const len = L * (0.12 + 0.6 * pw) * flick;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft heat glow around the nozzle
    const glowR = r * (2.2 + pw * 2.5);
    const gl = ctx.createRadialGradient(nx - len * 0.15, 0, 0, nx - len * 0.15, 0, glowR);
    gl.addColorStop(0, `rgba(255,170,90,${0.25 + 0.35 * pw})`);
    gl.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(nx - len * 0.15, 0, glowR, 0, 2 * Math.PI); ctx.fill();
    // Outer flame: orange to transparent, slightly ragged
    const of = ctx.createLinearGradient(nx, 0, nx - len, 0);
    of.addColorStop(0, `rgba(255,200,120,${0.55 + 0.4 * pw})`);
    of.addColorStop(0.35, `rgba(255,120,40,${0.35 + 0.35 * pw})`);
    of.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = of;
    const w = r * (1 + 0.5 * pw), wob = (Math.random() - 0.5) * r * 0.4;
    ctx.beginPath();
    ctx.moveTo(nx, -r);
    ctx.quadraticCurveTo(nx - len * 0.45, -w * 1.25 + wob, nx - len, wob * 0.5);
    ctx.quadraticCurveTo(nx - len * 0.45, w * 1.25 + wob, nx, r);
    ctx.closePath();
    ctx.fill();
    // Inner core: blue-white, shorter and narrower
    const cl = len * 0.6;
    const cf = ctx.createLinearGradient(nx, 0, nx - cl, 0);
    cf.addColorStop(0, 'rgba(235,245,255,.95)');
    cf.addColorStop(0.45, `rgba(150,195,255,${0.45 + 0.4 * pw})`);
    cf.addColorStop(1, 'rgba(90,130,255,0)');
    ctx.fillStyle = cf;
    ctx.beginPath();
    ctx.moveTo(nx, -r * 0.7);
    ctx.quadraticCurveTo(nx - cl * 0.5, -r * 0.75, nx - cl, 0);
    ctx.quadraticCurveTo(nx - cl * 0.5, r * 0.75, nx, r * 0.7);
    ctx.closePath();
    ctx.fill();
    // Shock diamonds at high power
    if (pw > 0.55) {
        const a = (pw - 0.55) / 0.45;
        for (let k = 0; k < 3; k++) {
            const dx = nx - len * (0.16 + 0.17 * k);
            ctx.fillStyle = `rgba(255,240,210,${(0.55 - k * 0.15) * a})`;
            ctx.beginPath(); ctx.ellipse(dx, 0, r * 0.38, r * (0.42 - k * 0.08), 0, 0, 2 * Math.PI); ctx.fill();
        }
    }
    ctx.restore();
    // Hot nozzle ring
    ctx.strokeStyle = `rgba(255,150,80,${0.35 + 0.4 * pw})`;
    ctx.lineWidth = Math.max(0.4, r * 0.25);
    ctx.beginPath(); ctx.ellipse(nx, 0, r * 0.25, r, 0, 0, 2 * Math.PI); ctx.stroke();
}

// Hangar preview: an aircraft over the sea
export function drawPlanePreview(canvasId, p) {
    const c = document.getElementById(canvasId);
    if (!c || !p) return;
    const main = ctx;
    try { drawPlanePreviewOn(c, p); }
    finally { ctx = main; }
}

function drawPlanePreviewOn(c, p) {
    ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#2a6a90');
    g.addColorStop(1, '#13425f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const k = Math.min((c.width - 20) / p.span, (c.height - 16) / p.length) * 0.95;
    ctx.translate(c.width / 2 - 8, c.height / 2 - 8);
    ctx.scale(k, k);
    // Nose up in the preview; slight shadow offset for depth
    drawPlane(p, 0, 0, -Math.PI / 2, 0.12);
}
