// ============================================================
// Dungeon Doom - Game Logic
// Uses: SharedRNG, SharedAudio, createMusic
// ============================================================

// --- Seeded RNG ---
var rng = null;
var todayStr = SharedRNG.getTodayStr();
document.getElementById('daily-seed').textContent = 'Daily Seed: ' + todayStr;

// --- Difficulty presets ---
var BOULDER_MAX_HP = parseInt(new URLSearchParams(window.location.search).get('hp')) || 10;
var DIFFICULTY = {
  easy: {
    label: 'Easy', startSpeed: 2.5, maxSpeed: 5, rampRate: 0.0003,
    spawnInterval: 2.2, spawnVariance: 0.8,
    chestChance: 0.18, heartChance: 0.1,
    colors: { bg1: '#1a0a2e', bg2: '#2d1b4e', bg3: '#1a0a2e',
              ground1: '#2d1520', ground2: '#3d1a28', ground3: '#4d2030',
              ceiling: '#0d0508', border: '#3d1520' }
  },
  normal: {
    label: 'Normal', startSpeed: 3.5, maxSpeed: 7, rampRate: 0.0005,
    spawnInterval: 1.8, spawnVariance: 0.6,
    chestChance: 0.14, heartChance: 0.07,
    colors: { bg1: '#1a0a1e', bg2: '#2d1520', bg3: '#1a0a1e',
              ground1: '#2d1520', ground2: '#3d1a28', ground3: '#4d2030',
              ceiling: '#0d0508', border: '#3d1520' }
  },
  hard: {
    label: 'Hard', startSpeed: 5, maxSpeed: 9, rampRate: 0.0008,
    spawnInterval: 1.4, spawnVariance: 0.4,
    chestChance: 0.20, heartChance: 0.12,
    misleadChance: 0.25, comboChance: 0.3,
    colors: { bg1: '#1e0505', bg2: '#3d0a0a', bg3: '#1e0505',
              ground1: '#3d0a0a', ground2: '#4d1515', ground3: '#5d2020',
              ceiling: '#0d0202', border: '#5d1010' }
  },
  achal: {
    label: 'Achal Anna', startSpeed: 9, maxSpeed: 9, rampRate: 0,
    spawnInterval: 1.2, spawnVariance: 0.3,
    chestChance: 0.25, heartChance: 0.15,
    misleadChance: 0.25, comboChance: 0.45,
    colors: { bg1: '#1a0a2e', bg2: '#3d1560', bg3: '#1a0a2e',
              ground1: '#2d1050', ground2: '#4d1a70', ground3: '#5d2080',
              ceiling: '#0d0518', border: '#5d2080' }
  }
};

// --- Obstacle types ---
var OBSTACLE_TYPES = [
  { id: 'fire_pit',   emoji: '\uD83D\uDD25', position: 'ground', dodge: 'jump',  label: 'Fire Pit', cssClass: 'fire-pit' },
  { id: 'snake',      emoji: '\uD83D\uDC0D', position: 'ground', dodge: 'jump',  label: 'Snake' },
  { id: 'wall_blade', emoji: '\uD83D\uDDE1\uFE0F', position: 'head',   dodge: 'duck',  label: 'Wall Blade' },
  { id: 'arrow_high', emoji: '\u25C4\u2501\u2501', position: 'head',   dodge: 'duck',  label: 'Arrow (high)', cssClass: 'arrow-projectile' },
  { id: 'arrow_low',  emoji: '\u25C4\u2501\u2501', position: 'ground', dodge: 'jump',  label: 'Arrow (low)', cssClass: 'arrow-projectile' },
];

// --- Game state ---
var currentDiff = null;
var lastDiffKey = 'normal';
var gameRunning = false;
var gameStartTime = 0;
var elapsedMs = 0;
var score = 0;
var obstaclesDodged = 0;
var fireballsThrown = 0;

// Player
var playerHearts = 3;
var playerMaxHearts = 3;
var playerY = 0;
var playerVelY = 0;
var playerJumping = false;
var playerDucking = false;
var duckTimer = 0;
var DUCK_DURATION = 0.6;
var playerSpinning = false;
var spinTimer = 0;
var wasSpinJump = false;
var spinCooldown = 0;
var SPIN_COOLDOWN = 2.0;
var invincibleTimer = 0;
var fireballs = 0;

// Boulder
var boulderHP = BOULDER_MAX_HP;

// Speed
var currentSpeed = 3;

// Entities
var obstacles = [];
var pickups = [];
var projectiles = [];

// Spawning
var spawnTimer = 0;
var pickupTimer = 0;
var nextSpawnTime = 0;
var nextPickupTime = 0;

// Torch
var torchOffsetX = 0;
var wallTorches = [];

// Input
var inputJump = false;
var inputDuck = false;
var inputDestroy = false;
var jumpPressed = false;
var duckPressed = false;
var destroyPressed = false;
var keysDown = {};

// Layout
var groundY = 0;
var ceilingY = 0;
var playerX = 0;
var boulderX = 0;
var dungeonW = 0;
var dungeonH = 0;
var playerSize = 0;
var entitySize = 0;
var boulderSize = 0;

var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// DOM
var titleScreen = document.getElementById('title-screen');
var introScaredEl = document.getElementById('intro-scared');
var introTextEl = document.getElementById('intro-text');
var gameScreen = document.getElementById('game-screen');
var gameOverScreen = document.getElementById('game-over');
var dungeon = document.getElementById('dungeon');
var playerEl = document.getElementById('player');
var boulderEl = document.getElementById('boulder');
var controlsEl = document.getElementById('controls');
var hudScore = document.getElementById('score-display');
var hudHearts = document.getElementById('hearts-display');
var hudFireballs = document.getElementById('fireball-display');
var boulderHPBar = document.getElementById('boulder-hp-bar');
var boulderHPText = document.getElementById('boulder-hp-text');
var muteBtn = document.getElementById('mute-btn');
var torchOverlay = document.getElementById('torch-overlay');
var playerSprite = playerEl.querySelector('.player-sprite');
var boulderSprite = boulderEl.querySelector('.boulder-sprite');
var centerHint = document.getElementById('center-hint');
var activeHintObs = null;
var gameViewport = document.getElementById('game-viewport');

// --- Mute ---
var muteState = SharedAudio.initMute(muteBtn, function(isMuted) {
  if (isMuted) music.stop();
  else if (gameRunning) music.start(false);
});
function toggleMute() { muteState.toggle(); }

// --- Music ---
var music = createMusic({
  bpm: 140,
  gain: 0.10,
  melody: [
    293, 0, 349, 0, 440, 349, 293, 0,
    262, 0, 293, 349, 293, 262, 220, 0,
    293, 0, 349, 440, 523, 0, 440, 349,
    293, 0, 262, 0, 220, 196, 220, 0,
  ],
  bass: [
    73, 73, 73, 87, 87, 87, 65, 65,
    73, 73, 87, 87, 98, 98, 73, 73,
  ],
  melodyType: 'sawtooth',
  bassType: 'square',
  hasSnare: false
});

// ============================================================
// SOUND EFFECTS
// ============================================================
function playJump() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.2);
}

function playDuck() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
}

function playSpin() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.35);
}

function playHit() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.15);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    var t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.5;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
  var g = ctx.createGain(); g.gain.value = 0.4;
  src.connect(lp); lp.connect(g); g.connect(ctx.destination);
  src.start();
  var osc = ctx.createOscillator();
  var g2 = ctx.createGain();
  osc.type = 'square'; osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
  g2.gain.setValueAtTime(0.2, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.connect(g2); g2.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.3);
}

function playFireball() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.2);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    var t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t * 0.5) * 0.3;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1;
  var g = ctx.createGain(); g.gain.value = 0.3;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start();
  var osc = ctx.createOscillator();
  var g2 = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
  g2.gain.setValueAtTime(0.15, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.connect(g2); g2.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.2);
}

function playBoulderHit() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.4, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.4);
  var bufSize = Math.floor(ctx.sampleRate * 0.1);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufSize) * 0.4;
  var src = ctx.createBufferSource(); src.buffer = buf;
  var g2 = ctx.createGain(); g2.gain.value = 0.3;
  src.connect(g2); g2.connect(ctx.destination); src.start();
}

function playChestOpen() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  [523, 659, 784].forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.15);
  });
}

function playHeartCollect() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  [659, 880, 1047].forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.2);
  });
}

function playBoulderDrop() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.6);
  g.gain.setValueAtTime(0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.7);
  var bufSize = Math.floor(ctx.sampleRate * 0.5);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    var t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - t * 1.5) * 0.3;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
  var g2 = ctx.createGain(); g2.gain.value = 0.4;
  src.connect(lp); lp.connect(g2); g2.connect(ctx.destination); src.start();
}

function playVictory() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  [523, 659, 784, 1047, 784, 1047, 1319].forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.15;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.25);
  });
}

function playGameOver() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  [392, 349, 311, 262].forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.25;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.4);
  });
}

// ============================================================
// LAYOUT
// ============================================================
function calcLayout() {
  var rect = gameViewport.getBoundingClientRect();
  dungeonW = rect.width;
  dungeonH = rect.height;
  groundY = dungeonH * 0.75;
  ceilingY = dungeonH * 0.15;
  playerX = dungeonW * 0.45;
  boulderX = dungeonW * 0.02;
  playerSize = parseFloat(getComputedStyle(playerEl).fontSize) || 48;
  boulderSize = parseFloat(getComputedStyle(boulderEl).fontSize) || 72;
  entitySize = playerSize * 0.8;
}

// ============================================================
// INPUT HANDLING
// ============================================================
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

document.addEventListener('keydown', function(e) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'ControlRight', 'KeyS', 'KeyD'].indexOf(e.code) !== -1) {
    e.preventDefault();
  }
  if (!gameRunning) return;
  keysDown[e.code] = true;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (!jumpPressed) { jumpPressed = true; inputJump = true; }
  }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'ArrowDown') {
    if (!duckPressed) { duckPressed = true; inputDuck = true; }
  }
  if (e.code === 'KeyS') {
    if (!jumpPressed) { jumpPressed = true; inputJump = true; }
    if (!duckPressed) { duckPressed = true; inputDuck = true; }
  }
  if (e.code === 'KeyD') {
    if (!destroyPressed) { destroyPressed = true; inputDestroy = true; }
  }
});

document.addEventListener('keyup', function(e) {
  keysDown[e.code] = false;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    if (!keysDown['Space'] && !keysDown['ArrowUp'] && !keysDown['KeyS']) jumpPressed = false;
  }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'ArrowDown') {
    if (!keysDown['ControlLeft'] && !keysDown['ControlRight'] && !keysDown['ArrowDown'] && !keysDown['KeyS']) {
      duckPressed = false; inputDuck = false;
    }
  }
  if (e.code === 'KeyS') {
    if (!keysDown['Space'] && !keysDown['ArrowUp']) jumpPressed = false;
    if (!keysDown['ControlLeft'] && !keysDown['ControlRight'] && !keysDown['ArrowDown']) {
      duckPressed = false; inputDuck = false;
    }
  }
  if (e.code === 'KeyD') { destroyPressed = false; }
});

document.addEventListener('mousedown', function(e) {
  if (!gameRunning) return;
  if (e.target.closest('#hud') || e.target.closest('#controls') || e.target.closest('#game-over')) return;
  if (e.button === 0) { if (!jumpPressed) { jumpPressed = true; inputJump = true; } }
  else if (e.button === 2) { if (!duckPressed) { duckPressed = true; inputDuck = true; } }
});
document.addEventListener('mouseup', function(e) {
  if (e.button === 0) jumpPressed = false;
  if (e.button === 2) { duckPressed = false; inputDuck = false; }
});

// Controls (touch + click)
var btnJump = document.getElementById('btn-jump');
var btnDuck = document.getElementById('btn-duck');
var btnDestroy = document.getElementById('btn-destroy');

function setupBtn(btn, onDown, onUp) {
  btn.addEventListener('touchstart', function(e) { e.preventDefault(); onDown(); }, { passive: false });
  btn.addEventListener('touchend', function(e) { e.preventDefault(); onUp(); }, { passive: false });
  btn.addEventListener('touchcancel', function(e) { e.preventDefault(); onUp(); }, { passive: false });
  btn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); onDown(); });
  btn.addEventListener('mouseup', function(e) { e.preventDefault(); onUp(); });
  btn.addEventListener('mouseleave', function() { onUp(); });
}

setupBtn(btnJump,
  function() { if (!gameRunning) return; jumpPressed = true; inputJump = true; btnJump.classList.add('pressed'); },
  function() { jumpPressed = false; btnJump.classList.remove('pressed'); }
);
setupBtn(btnDuck,
  function() { if (!gameRunning) return; duckPressed = true; inputDuck = true; btnDuck.classList.add('pressed'); },
  function() { duckPressed = false; inputDuck = false; btnDuck.classList.remove('pressed'); }
);
setupBtn(btnDestroy,
  function() { if (!gameRunning) return; destroyPressed = true; inputDestroy = true; btnDestroy.classList.add('pressed'); },
  function() { destroyPressed = false; btnDestroy.classList.remove('pressed'); }
);

document.addEventListener('touchmove', function(e) {
  if (gameRunning) e.preventDefault();
}, { passive: false });

// ============================================================
// WALL TORCHES
// ============================================================
function createWallTorches() {
  document.querySelectorAll('.wall-torch').forEach(function(t) { t.remove(); });
  wallTorches = [];
  var spacing = 200;
  var count = Math.ceil(dungeonW / spacing) + 2;
  var yPos = (ceilingY + 10) | 0;
  for (var i = 0; i < count; i++) {
    var el = document.createElement('div');
    el.className = 'wall-torch';
    el.textContent = '\uD83D\uDD25';
    el.style.transform = 'translate3d(' + (i * spacing) + 'px,' + yPos + 'px,0)';
    dungeon.appendChild(el);
    wallTorches.push({ el: el, baseX: i * spacing, yPos: yPos });
  }
}

function updateWallTorches(dt) {
  torchOffsetX = (torchOffsetX + currentSpeed * dt * 30) % 200;
  for (var i = 0; i < wallTorches.length; i++) {
    var torch = wallTorches[i];
    torch.el.style.transform = 'translate3d(' + ((torch.baseX - torchOffsetX) | 0) + 'px,' + torch.yPos + 'px,0)';
  }
  var px = playerX;
  var py = groundY - playerY - playerSize * 0.5;
  torchOverlay.style.background = 'radial-gradient(ellipse 350px 300px at ' +
    (px | 0) + 'px ' + (py | 0) + 'px, transparent 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 100%)';
}

// ============================================================
// BATS
// ============================================================
var bats = [];
var batTimer = 0;
var BAT_INTERVAL = 1.8;

function spawnBat() {
  var el = document.createElement('div');
  el.className = 'bat';
  var inner = document.createElement('span');
  inner.className = 'bat-inner';
  inner.textContent = '\uD83E\uDD87';
  el.appendChild(inner);
  dungeon.appendChild(el);

  var minY = ceilingY + 10;
  var maxY = groundY * 0.6;
  var y = minY + Math.random() * (maxY - minY);
  var goingLeft = Math.random() > 0.3;
  var startX = goingLeft ? dungeonW + 30 : -30;
  var speed = (120 + Math.random() * 100) * (goingLeft ? -1 : 1);
  var waveAmp = 15 + Math.random() * 25;
  var waveSpeed = 2 + Math.random() * 3;

  bats.push({ el: el, x: startX, y: y, speed: speed, waveAmp: waveAmp, waveSpeed: waveSpeed, age: 0 });
}

function updateBats(dt) {
  batTimer += dt;
  if (batTimer >= BAT_INTERVAL) {
    batTimer -= BAT_INTERVAL;
    if (bats.length < 6) spawnBat();
  }
  for (var i = bats.length - 1; i >= 0; i--) {
    var b = bats[i];
    b.age += dt;
    b.x += b.speed * dt;
    var waveY = Math.sin(b.age * b.waveSpeed) * b.waveAmp;
    b.el.style.transform = 'translate3d(' + (b.x | 0) + 'px,' + ((b.y + waveY) | 0) + 'px,0)';
    if ((b.speed < 0 && b.x < -40) || (b.speed > 0 && b.x > dungeonW + 40)) {
      b.el.remove();
      bats.splice(i, 1);
    }
  }
}

function clearBats() {
  for (var i = 0; i < bats.length; i++) bats[i].el.remove();
  bats = [];
  batTimer = 0;
}

// ============================================================
// SPAWN LOGIC
// ============================================================
function spawnObstacle() {
  var typeIdx = Math.floor(rng() * OBSTACLE_TYPES.length);
  var type = OBSTACLE_TYPES[typeIdx];
  var el = document.createElement('div');
  el.className = 'obstacle' + (type.cssClass ? ' ' + type.cssClass : '');
  var inner = document.createElement('span');
  inner.className = 'obs-inner';
  inner.textContent = type.emoji;
  el.appendChild(inner);
  dungeon.appendChild(el);

  var hintText = null;
  var misleadChance = currentDiff.misleadChance || 0;
  if (misleadChance > 0) {
    var isMislead = rng() < misleadChance;
    var correctHint = type.dodge === 'jump' ? 'JUMP!' : 'DUCK!';
    var wrongHint = type.dodge === 'jump' ? 'DUCK!' : 'JUMP!';
    hintText = isMislead ? wrongHint : correctHint;
  }

  var y;
  if (type.position === 'ground') {
    y = groundY - entitySize;
  } else {
    y = groundY - playerSize * 1.6;
  }

  obstacles.push({
    el: el, type: type, x: dungeonW + 20, y: y,
    width: entitySize, height: entitySize,
    scored: false,
    hintText: hintText, hintShown: false
  });

  var comboChance = currentDiff.comboChance || 0;
  if (comboChance > 0 && rng() < comboChance) {
    spawnComboPickup(type);
  }
}

function pickupY(tier) {
  if (tier === 'high') return groundY - entitySize - playerSize * 2.73;
  if (tier === 'mid')  return groundY - entitySize - playerSize * 1.79;
  return groundY - entitySize;
}

function pickRandomTier() {
  var r = rng();
  if (r < 0.35) return 'ground';
  if (r < 0.70) return 'mid';
  return 'high';
}

function spawnPickup() {
  var r = rng();
  var type, emoji;
  if (r < currentDiff.heartChance) {
    type = 'heart'; emoji = '\u2764\uFE0F';
  } else if (r < currentDiff.heartChance + currentDiff.chestChance) {
    type = 'chest'; emoji = '\uD83D\uDCE6';
  } else {
    return;
  }
  var tier = pickRandomTier();
  createPickupAt(type, emoji, dungeonW + 20, pickupY(tier), tier);
}

function spawnComboPickup(obstacleType) {
  var isChest = rng() < 0.5;
  var type = isChest ? 'chest' : 'heart';
  var emoji = isChest ? '\uD83D\uDCE6' : '\u2764\uFE0F';
  createPickupAt(type, emoji, dungeonW + 60, pickupY('high'), 'high');
}

function createPickupAt(type, emoji, x, y, tier) {
  var el = document.createElement('div');
  el.className = 'pickup';
  var inner = document.createElement('span');
  inner.className = 'pickup-inner';
  inner.textContent = emoji;
  el.appendChild(inner);
  dungeon.appendChild(el);

  var collH = entitySize * 0.5;
  var collYOffset = (entitySize - collH) / 2;
  pickups.push({
    el: el, type: type, x: x, y: y, tier: tier,
    width: entitySize, height: collH,
    collYOffset: collYOffset
  });
}

function throwFireball() {
  if (fireballs <= 0) return;
  fireballs--;
  fireballsThrown++;
  playFireball();

  var el = document.createElement('div');
  el.className = 'fireball-projectile';
  el.textContent = '\u2604\uFE0F';
  dungeon.appendChild(el);

  projectiles.push({
    el: el, x: playerX - 20,
    y: groundY - playerSize * 0.7,
    speed: -400
  });
  updateHUD();
}

// ============================================================
// COLLISION
// ============================================================
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function getPlayerHitbox() {
  var px = playerX;
  var w = playerSize * 0.5;
  var h = playerSize * 0.8;
  var py = groundY - playerY - playerSize;
  if (playerDucking && !playerJumping) {
    h *= 0.5;
    py = groundY - playerY - h;
  }
  return { x: px - w * 0.3, y: py, w: w, h: h };
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  hudScore.textContent = 'Score: ' + score;
  var hearts = '';
  for (var i = 0; i < playerMaxHearts; i++) {
    hearts += i < playerHearts ? '\u2764\uFE0F' : '\uD83D\uDDA4';
  }
  hudHearts.textContent = hearts;
  hudFireballs.textContent = '\uD83D\uDD25 ' + fireballs;
  var effectiveMax = Math.max(boulderHP, BOULDER_MAX_HP);
  var hpPct = (boulderHP / effectiveMax * 100);
  boulderHPBar.style.width = hpPct + '%';
  boulderHPText.textContent = boulderHP + '/' + effectiveMax;
  if (hpPct <= 30) boulderHPBar.style.background = 'linear-gradient(90deg, #00AA00, #44FF44)';
  else if (hpPct <= 60) boulderHPBar.style.background = 'linear-gradient(90deg, #AAAA00, #FFFF44)';
  else boulderHPBar.style.background = 'linear-gradient(90deg, #8B0000, #FF4444)';
}

// ============================================================
// SCREEN SHAKE
// ============================================================
var shakeTimeout = null;
function shakeScreen() {
  if (shakeTimeout) { clearTimeout(shakeTimeout); }
  gameViewport.classList.remove('shake');
  requestAnimationFrame(function() {
    gameViewport.classList.add('shake');
    shakeTimeout = setTimeout(function() {
      gameViewport.classList.remove('shake');
      shakeTimeout = null;
    }, 300);
  });
}

// ============================================================
// APPLY DUNGEON COLORS
// ============================================================
function applyColors(colors) {
  dungeon.style.background = 'linear-gradient(180deg, ' + colors.bg1 + ' 0%, ' + colors.bg2 + ' 50%, ' + colors.bg3 + ' 100%)';
  var ground = document.getElementById('ground');
  ground.style.background = 'linear-gradient(0deg, ' + colors.ground1 + ' 0%, ' + colors.ground2 + ' 50%, ' + colors.ground3 + ' 100%)';
  ground.style.borderTop = '3px solid ' + colors.border;
  var ceiling = document.getElementById('ceiling');
  ceiling.style.background = 'linear-gradient(180deg, ' + colors.ceiling + ' 0%, ' + colors.bg1 + ' 100%)';
  ceiling.style.borderBottom = '3px solid ' + colors.border;
}

// ============================================================
// FLOATING TEXT
// ============================================================
function showFloatingText(x, y, text, color) {
  var el = document.createElement('div');
  el.className = 'floating-text';
  el.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font-size:1.5rem;font-weight:bold;' +
    'color:' + color + ';z-index:50;pointer-events:none;text-shadow:1px 1px 2px rgba(0,0,0,0.5);';
  dungeon.appendChild(el);
  el.textContent = text;
  el.animate([
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(-50px)', opacity: 0 }
  ], { duration: 800, easing: 'ease-out' });
  setTimeout(function() { el.remove(); }, 800);
}

// ============================================================
// GAME LOOP
// ============================================================
var lastFrameTime = 0;
var animFrameId = null;

function gameLoop(timestamp) {
  if (!gameRunning) return;
  animFrameId = requestAnimationFrame(gameLoop);

  var dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;
  elapsedMs = timestamp - gameStartTime;

  // 1. Update speed
  if (currentSpeed < currentDiff.maxSpeed) {
    currentSpeed += currentDiff.rampRate * dt * 1000;
    if (currentSpeed > currentDiff.maxSpeed) currentSpeed = currentDiff.maxSpeed;
  }

  // 2. Handle jump input
  if (inputJump && inputDuck && !playerJumping && spinCooldown <= 0) {
    playerJumping = true;
    playerSpinning = true;
    wasSpinJump = true;
    spinTimer = 0.5;
    playerVelY = 650;
    playerDucking = false;
    playSpin();
    inputJump = false;
    inputDuck = false;
  } else if (inputJump && !playerJumping) {
    playerJumping = true;
    playerVelY = 550;
    playJump();
    inputJump = false;
  } else {
    inputJump = false;
  }

  // Duck state
  if (duckPressed && !playerJumping && duckTimer < DUCK_DURATION) {
    if (!playerDucking) { playDuck(); duckTimer = 0; }
    playerDucking = true;
    duckTimer += dt;
    if (duckTimer >= DUCK_DURATION) {
      playerDucking = false;
    }
  } else {
    playerDucking = false;
    if (!duckPressed) duckTimer = 0;
  }

  // Throw fireball
  if (inputDestroy) {
    inputDestroy = false;
    throwFireball();
  }

  // 3. Player physics
  if (playerJumping) {
    playerVelY -= 1800 * dt;
    playerY += playerVelY * dt;
    if (playerY <= 0) {
      playerY = 0;
      playerVelY = 0;
      if (wasSpinJump) { spinCooldown = SPIN_COOLDOWN; wasSpinJump = false; }
      playerJumping = false;
    }
  }

  if (playerSpinning) {
    spinTimer -= dt;
    if (spinTimer <= 0) playerSpinning = false;
  }
  if (spinCooldown > 0) spinCooldown -= dt;
  if (invincibleTimer > 0) invincibleTimer -= dt;

  // 4. Position player
  var playerDrawY = groundY - playerY - playerSize;
  var isDucking = playerDucking && !playerJumping;
  var duckScale = isDucking ? 'scaleY(0.55)' : '';
  playerEl.style.transform = 'translate3d(' + playerX + 'px,' + playerDrawY + 'px,0) ' + duckScale;
  if (isDucking) playerEl.style.transformOrigin = 'center bottom';

  var isInvincible = invincibleTimer > 0;
  if (playerEl._lastSpin !== playerSpinning) {
    playerEl.classList.toggle('spinning', playerSpinning);
    playerEl._lastSpin = playerSpinning;
  }
  if (playerEl._lastInv !== isInvincible) {
    playerEl.classList.toggle('invincible', isInvincible);
    playerEl._lastInv = isInvincible;
  }

  if (isDucking) {
    if (playerEl._lastState !== 'duck') {
      playerSprite.textContent = '\uD83E\uDDCE';
      playerEl._lastState = 'duck';
    }
    playerSprite.style.transform = 'scaleX(-1)';
  } else if (playerSpinning) {
    if (playerEl._lastState !== 'spin') {
      playerSprite.textContent = '\uD83C\uDFC3';
      playerEl._lastState = 'spin';
    }
    playerSprite.style.transform = '';
  } else {
    if (playerEl._lastState !== 'run') {
      playerSprite.textContent = '\uD83C\uDFC3';
      playerEl._lastState = 'run';
    }
    var bobY = (Math.floor(elapsedMs / 150) & 1) ? -3 : 0;
    playerSprite.style.transform = 'scaleX(-1) translateY(' + bobY + 'px)';
  }

  // 5. Position boulder
  boulderEl.style.transform = 'translate3d(' + boulderX + 'px,' + (groundY - boulderSize) + 'px,0)';
  var rollDur = Math.max(0.15, 0.8 / (currentSpeed / 3));
  var rollDurRounded = (rollDur * 10 | 0) / 10;
  if (boulderEl._lastRoll !== rollDurRounded) {
    boulderSprite.style.animationDuration = rollDurRounded + 's';
    boulderEl._lastRoll = rollDurRounded;
  }

  // 6. Move obstacles
  var moveAmount = currentSpeed * dt * 80;
  var hudDirty = false;
  for (var i = obstacles.length - 1; i >= 0; i--) {
    var obs = obstacles[i];
    obs.x -= moveAmount;
    obs.el.style.transform = 'translate3d(' + (obs.x | 0) + 'px,' + (obs.y | 0) + 'px,0)';

    if (!obs.scored && obs.x + obs.width < playerX - playerSize * 0.15) {
      obs.scored = true;
      score++;
      obstaclesDodged++;
      hudDirty = true;
    }

    if (!obs.healed && obs.type.id === 'fire_pit' && currentDiff.misleadChance &&
        obs.x < boulderX + boulderSize && obs.x + obs.width > boulderX) {
      obs.healed = true;
      var canHeal = lastDiffKey === 'achal' || boulderHP < BOULDER_MAX_HP;
      if (canHeal) {
        boulderHP++;
        hudDirty = true;
        showFloatingText(boulderX + boulderSize * 0.5, groundY - boulderSize - 10, '+1', '#FF4444');
      }
    }

    if (obs.x < -100) {
      if (activeHintObs === obs) { activeHintObs = null; centerHint.classList.remove('visible'); }
      obs.el.remove();
      obstacles.splice(i, 1);
    }
  }

  // Center hint
  var hintDist = playerSize * 3 + currentSpeed * 25;
  var showingHint = false;
  for (var j = 0; j < obstacles.length; j++) {
    var obs2 = obstacles[j];
    if (obs2.scored || !obs2.hintText) continue;
    var dist = obs2.x - playerX;
    if (dist > 0 && dist < hintDist && !obs2.hintShown) {
      obs2.hintShown = true;
      activeHintObs = obs2;
      centerHint.textContent = obs2.hintText;
      centerHint.classList.add('visible');
      showingHint = true;
      break;
    }
    if (activeHintObs === obs2 && dist > -entitySize) {
      showingHint = true;
    }
  }
  if (!showingHint && activeHintObs) {
    activeHintObs = null;
    centerHint.classList.remove('visible');
  }

  // 7. Move pickups
  for (var k = pickups.length - 1; k >= 0; k--) {
    var p = pickups[k];
    p.x -= moveAmount;
    p.el.style.transform = 'translate3d(' + (p.x | 0) + 'px,' + (p.y | 0) + 'px,0)';
    if (p.x < -100) {
      p.el.remove();
      pickups.splice(k, 1);
    }
  }

  // 8. Move projectiles
  for (var m = projectiles.length - 1; m >= 0; m--) {
    var proj = projectiles[m];
    proj.x += proj.speed * dt;
    proj.el.style.transform = 'translate3d(' + (proj.x | 0) + 'px,' + (proj.y | 0) + 'px,0)';

    var bx = boulderX;
    var by = groundY - boulderSize;
    if (rectsOverlap(proj.x, proj.y, 32, 32, bx, by, boulderSize, boulderSize)) {
      proj.el.remove();
      projectiles.splice(m, 1);
      boulderHP--;
      playBoulderHit();
      shakeScreen();
      hudDirty = true;
      if (boulderHP <= 0) {
        winGame();
        return;
      }
      continue;
    }
    if (proj.x < -50) {
      proj.el.remove();
      projectiles.splice(m, 1);
    }
  }

  // 9. Collision: obstacles vs player
  if (invincibleTimer <= 0) {
    var ph = getPlayerHitbox();
    for (var n = 0; n < obstacles.length; n++) {
      var obs3 = obstacles[n];
      if (obs3.scored) continue;
      var hOverlap = ph.x < obs3.x + obs3.width && ph.x + ph.w > obs3.x;
      if (!hOverlap) continue;

      var hit = false;
      if (obs3.type.dodge === 'jump') {
        var vOverlap = rectsOverlap(ph.x, ph.y, ph.w, ph.h, obs3.x, obs3.y, obs3.width, obs3.height);
        if (vOverlap) {
          var dodged = playerJumping && playerY > playerSize * 0.35;
          if (!dodged) hit = true;
        }
      } else if (obs3.type.dodge === 'duck') {
        var dodgedDuck = playerDucking && !playerJumping;
        if (!dodgedDuck) hit = true;
      }

      if (hit) {
        playerHearts--;
        invincibleTimer = 1.5;
        playHit();
        shakeScreen();
        hudDirty = true;
        if (playerHearts <= 0) {
          loseGame();
          return;
        }
      }
    }
  }

  // 10. Collision: pickups vs player
  var ph2 = getPlayerHitbox();
  for (var q = pickups.length - 1; q >= 0; q--) {
    var pu = pickups[q];
    var puY = pu.y + (pu.collYOffset || 0);
    if (rectsOverlap(ph2.x, ph2.y, ph2.w, ph2.h, pu.x, puY, pu.width, pu.height)) {
      if (pu.type === 'chest') {
        fireballs++;
        playChestOpen();
        showFloatingText(pu.x, pu.y, '+\uD83D\uDD25', '#FF8800');
        pu.el.remove();
        pickups.splice(q, 1);
        hudDirty = true;
      } else if (pu.type === 'heart') {
        if (playerHearts < playerMaxHearts) {
          playerHearts++;
          playHeartCollect();
          showFloatingText(pu.x, pu.y, '+\u2764\uFE0F', '#FF4444');
          hudDirty = true;
        } else {
          score += 5;
          playHeartCollect();
          showFloatingText(pu.x, pu.y, '+5', '#FFD700');
          hudDirty = true;
        }
        pu.el.remove();
        pickups.splice(q, 1);
      }
    }
  }

  // 11. Spawning
  spawnTimer += dt;
  if (spawnTimer >= nextSpawnTime) {
    spawnTimer = 0;
    nextSpawnTime = currentDiff.spawnInterval + (rng() - 0.5) * 2 * currentDiff.spawnVariance;
    if (nextSpawnTime < 0.5) nextSpawnTime = 0.5;
    spawnObstacle();
  }

  pickupTimer += dt;
  if (pickupTimer >= nextPickupTime) {
    pickupTimer = 0;
    nextPickupTime = currentDiff.spawnInterval * 1.5 + 1 + (rng() - 0.5);
    if (nextPickupTime < 1) nextPickupTime = 1;
    spawnPickup();
  }

  // 12. HUD
  if (hudDirty) updateHUD();

  // 13. Wall torches
  updateWallTorches(dt);

  // 14. Bats
  updateBats(dt);
}

// ============================================================
// INTRO SEQUENCE
// ============================================================
function playIntro(callback) {
  gameScreen.classList.add('active');
  gameOverScreen.classList.remove('active');
  var hud = document.getElementById('hud');
  hud.style.display = 'none';
  controlsEl.classList.remove('active');

  calcLayout();
  applyColors(currentDiff.colors);
  createWallTorches();

  var px = playerX | 0;
  var py = (groundY - playerSize * 0.5) | 0;
  torchOverlay.style.background = 'radial-gradient(ellipse 350px 300px at ' +
    px + 'px ' + py + 'px, transparent 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 100%)';

  playerSprite.textContent = '\uD83E\uDDCD';
  playerSprite.style.transform = 'scaleX(-1)';
  playerEl.style.transform = 'translate3d(' + playerX + 'px,' + (groundY - playerSize) + 'px,0)';
  playerEl.classList.remove('spinning', 'invincible');
  playerEl._lastState = null;

  boulderEl.style.transform = 'translate3d(' + boulderX + 'px,' + (-boulderSize * 2) + 'px,0)';
  boulderSprite.style.animationPlayState = 'paused';

  introScaredEl.classList.remove('visible');
  introTextEl.classList.remove('visible');

  setTimeout(function() {
    boulderEl.style.transition = 'transform 0.5s cubic-bezier(0.6, 0, 1, 1)';
    boulderEl.style.transform = 'translate3d(' + boulderX + 'px,' + (groundY - boulderSize) + 'px,0)';
    playBoulderDrop();
  }, 600);

  setTimeout(function() {
    boulderEl.style.transition = '';
    shakeScreen();
  }, 1100);

  setTimeout(function() {
    playerSprite.style.transform = 'scaleX(1)';
    introScaredEl.style.left = (playerX + 10) + 'px';
    introScaredEl.style.top = (groundY - playerSize - 45) + 'px';
    introScaredEl.classList.add('visible');
  }, 1200);

  setTimeout(function() {
    boulderSprite.style.animationPlayState = 'running';
    introTextEl.classList.add('visible');
  }, 1600);

  setTimeout(function() {
    introScaredEl.classList.remove('visible');
    playerSprite.textContent = '\uD83C\uDFC3';
    playerSprite.style.transform = 'scaleX(-1)';
  }, 2100);

  setTimeout(function() {
    introTextEl.classList.remove('visible');
    hud.style.display = '';
    callback();
  }, 2800);
}

// ============================================================
// START / STOP / WIN / LOSE
// ============================================================
function beginGame(diffKey) {
  lastDiffKey = diffKey;
  currentDiff = DIFFICULTY[diffKey];
  rng = SharedRNG.mulberry32(SharedRNG.dateSeed(todayStr, diffKey));
  titleScreen.classList.add('hidden');
  playIntro(function() {
    startGameplay();
  });
}

function startGameplay() {
  score = 0;
  obstaclesDodged = 0;
  fireballsThrown = 0;
  playerHearts = playerMaxHearts;
  playerY = 0;
  playerVelY = 0;
  playerJumping = false;
  playerDucking = false;
  duckTimer = 0;
  playerSpinning = false;
  spinTimer = 0;
  wasSpinJump = false;
  spinCooldown = 0;
  invincibleTimer = 0;
  fireballs = 0;
  boulderHP = BOULDER_MAX_HP;
  currentSpeed = currentDiff.startSpeed;
  obstacles = [];
  pickups = [];
  projectiles = [];
  spawnTimer = 0;
  pickupTimer = 0;
  nextSpawnTime = currentDiff.spawnInterval;
  nextPickupTime = currentDiff.spawnInterval * 1.5 + 1;
  torchOffsetX = 0;

  dungeon.querySelectorAll('.obstacle, .pickup, .fireball-projectile').forEach(function(e) { e.remove(); });

  gameScreen.classList.add('active');
  gameOverScreen.classList.remove('active');

  calcLayout();
  applyColors(currentDiff.colors);
  createWallTorches();
  updateHUD();

  controlsEl.classList.add('active');

  boulderSprite.style.animationPlayState = 'running';
  music.start(muteState.muted);
  gameStartTime = performance.now();
  lastFrameTime = performance.now();

  jumpPressed = false; inputJump = false;
  duckPressed = false; inputDuck = false;
  destroyPressed = false; inputDestroy = false;
  for (var k in keysDown) keysDown[k] = false;
  gameRunning = true;

  animFrameId = requestAnimationFrame(gameLoop);
}

function stopGame() {
  gameRunning = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  music.stop();
  dungeon.querySelectorAll('.obstacle, .pickup, .fireball-projectile, .floating-text').forEach(function(e) { e.remove(); });
  obstacles = [];
  pickups = [];
  projectiles = [];
  clearBats();
  activeHintObs = null;
  centerHint.classList.remove('visible');
  boulderSprite.style.animationPlayState = 'paused';
}

function winGame() {
  stopGame();
  setTimeout(function() {
    playVictory();
    showGameOver(true);
  }, 300);
}

function loseGame() {
  stopGame();
  setTimeout(function() {
    playGameOver();
    showGameOver(false);
  }, 300);
}

function showGameOver(victory) {
  var title = document.getElementById('go-title');
  if (victory) {
    title.textContent = 'Boulder Destroyed!';
    title.className = 'victory';
  } else {
    title.textContent = 'You Perished!';
    title.className = 'defeat';
  }
  var timeSec = (elapsedMs / 1000).toFixed(1);
  document.getElementById('go-score').textContent = 'Score: ' + score;
  document.getElementById('go-difficulty').textContent = currentDiff.label + ' Mode';
  document.getElementById('go-time').textContent = 'Time: ' + timeSec + 's';
  document.getElementById('go-obstacles').textContent = 'Obstacles dodged: ' + obstaclesDodged;
  document.getElementById('go-fireballs').textContent = 'Fireballs thrown: ' + fireballsThrown;
  document.getElementById('go-seed').textContent = 'Daily Seed: ' + todayStr;
  gameOverScreen.classList.add('active');
}

function restartGame() {
  gameOverScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  rng = SharedRNG.mulberry32(SharedRNG.dateSeed(todayStr, lastDiffKey));
  startGameplay();
}

function quitGame() {
  stopGame();
  gameScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  controlsEl.classList.remove('active');
  titleScreen.classList.remove('hidden');
}

// Handle resize
window.addEventListener('resize', function() {
  if (gameRunning) {
    calcLayout();
    createWallTorches();
  }
});

// Pause timing when tab hidden
document.addEventListener('visibilitychange', function() {
  if (document.hidden && gameRunning) {
    lastFrameTime = performance.now();
  }
});
