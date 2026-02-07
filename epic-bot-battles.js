// ============================================================
// Epic Bot Battles - Game Logic
// Uses: SharedRNG, SharedAudio, createMusic
// ============================================================

// --- Seeded RNG ---
var rng = null;
var todayStr = SharedRNG.getTodayStr();
document.getElementById('daily-seed').textContent = 'Daily Seed: ' + todayStr;

// --- Mute State ---
var muteBtn = document.getElementById('mute-btn');
var music = createMusic({
  bpm: 160,
  gain: 0.10,
  melody: [
    330, 0, 392, 0, 494, 392, 330, 0,
    294, 0, 330, 392, 330, 294, 247, 0,
    330, 0, 392, 494, 587, 0, 494, 392,
    330, 0, 294, 0, 247, 220, 247, 0,
  ],
  bass: [
    82, 82, 82, 98, 98, 98, 73, 73,
    82, 82, 98, 98, 110, 110, 82, 82,
  ],
  melodyType: 'sawtooth',
  bassType: 'square',
  noteInterval: 'eighth',
  hasSnare: true
});

var muteState = SharedAudio.initMute(muteBtn, function(muted) {
  if (muted) music.stop();
  else if (gameRunning) music.start(false);
});

function toggleMute() { muteState.toggle(); }

// ============================================================
// DIFFICULTY PRESETS
// ============================================================
var DIFFICULTY = {
  easy: {
    label: 'Easy',
    enemySpeed: 120, attackRate: 2.5, parryChance: 0,
    telegraph: 0.8, playerHP: 5, enemyHP: 5,
    healBetween: true, hasGuard: false,
    colors: { bg1: '#0a0a2e', bg2: '#1a1040', bg3: '#0a0a1e',
              ground1: '#1a1040', ground2: '#2a1a50', ground3: '#3a2060',
              ceiling: '#050515', border: '#2a1a50' }
  },
  normal: {
    label: 'Normal',
    enemySpeed: 160, attackRate: 1.8, parryChance: 0,
    telegraph: 0.5, playerHP: 5, enemyHP: 5,
    healBetween: true, hasGuard: false,
    colors: { bg1: '#1a0a1e', bg2: '#2d1520', bg3: '#1a0a1e',
              ground1: '#2d1520', ground2: '#3d1a28', ground3: '#4d2030',
              ceiling: '#0d0508', border: '#3d1520' }
  },
  hard: {
    label: 'Hard',
    enemySpeed: 200, attackRate: 1.2, parryChance: 0.3,
    telegraph: 0.3, playerHP: 5, enemyHP: 5,
    healBetween: false, hasGuard: false,
    colors: { bg1: '#1e0505', bg2: '#3d0a0a', bg3: '#1e0505',
              ground1: '#3d0a0a', ground2: '#4d1515', ground3: '#5d2020',
              ceiling: '#0d0202', border: '#5d1010' }
  },
  achal: {
    label: 'Nightmare',
    enemySpeed: 220, attackRate: 1.0, parryChance: 0,
    telegraph: 0.2, playerHP: 3, enemyHP: 7,
    healBetween: false, hasGuard: true, guardHits: 3, guardVulnerable: 3.0,
    colors: { bg1: '#1a0a2e', bg2: '#3d1560', bg3: '#1a0a2e',
              ground1: '#2d1050', ground2: '#4d1a70', ground3: '#5d2080',
              ceiling: '#0d0518', border: '#5d2080' }
  }
};

// ============================================================
// SWORD DATA
// ============================================================
var SWORDS = {
  wooden:    { emoji: '🗡️', name: 'Wooden',    dmg: 1.0, effect: 'none' },
  fire:      { emoji: '🔥', name: 'Fire',      dmg: 0.5, effect: 'burn' },
  lightning: { emoji: '⚡', name: 'Lightning', dmg: 0.5, effect: 'shock' },
  ice:       { emoji: '❄️', name: 'Ice',       dmg: 0.5, effect: 'freeze' }
};

var RESIST_TYPES = ['fire', 'lightning', 'ice'];
var ENEMY_HUES = [0, 90, 180, 270];

var ENEMY_SWORDS = {
  fire:      { emoji: '\uD83D\uDD25', bladeClass: 'sword-fire',      effect: 'burn',   dmg: 0.5 },
  lightning: { emoji: '\u26A1',       bladeClass: 'sword-lightning', effect: 'shock',  dmg: 0.5 },
  ice:       { emoji: '\u2744\uFE0F', bladeClass: 'sword-ice',       effect: 'freeze', dmg: 0.5 },
  none:      { emoji: '\uD83D\uDDE1\uFE0F', bladeClass: 'sword-enemy',     effect: 'none',   dmg: 1.0 }
};

var SWORD_RESIST = { wooden: 'none', fire: 'fire', lightning: 'lightning', ice: 'ice' };

var EFFECT_TO_ELEMENT = { burn: 'fire', shock: 'lightning', freeze: 'ice' };

function seededShuffle(arr) {
  var copy = arr.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

// ============================================================
// GAME STATE
// ============================================================
var currentDiff = null;
var diffKey = 'normal';
var gameRunning = false;
var gameStartTime = 0;
var elapsedMs = 0;

// Round state
var currentRound = 0;
var usedSwords = [];
var chosenSword = null;
var enemyResistances = [];

// Player
var playerHP = 5;
var playerMaxHP = 5;
var playerX = 0;
var playerY = 0;
var playerVelY = 0;
var playerJumping = false;
var playerAttacking = false;
var playerParrying = false;
var playerAttackTimer = 0;
var playerParryTimer = 0;
var playerAttackCooldown = 0;
var playerInvincible = 0;
var playerFacing = 1;

// Enemy
var enemyHP = 5;
var enemyMaxHP = 5;
var enemyX = 0;
var enemyY = 0;
var enemyVelY = 0;
var enemyJumping = false;
var enemyState = 'idle';
var enemyStateTimer = 0;
var enemyAttackCooldown = 0;
var enemyInvincible = 0;
var enemyTelegraphTimer = 0;
var enemyAttacking = false;
var enemyParrying = false;
var enemyResist = 'none';

// Player resistance (from chosen sword type)
var playerResist = 'none';

// Player status effects (from enemy swords)
var playerBurnTimer = 0;
var playerBurnTickTimer = 0;
var playerShockActive = false;
var playerFreezeBuildup = 0;
var playerFrozenTimer = 0;
var playerBurnICD = 0;
var playerShockICD = 0;
var playerFreezeICD = 0;

// Second enemy (Achal final round only)
var hasEnemy2 = false;
var enemy2X = 0, enemy2Y = 0, enemy2VelY = 0;
var enemy2State = 'idle', enemy2StateTimer = 0;
var enemy2AttackCooldown = 0, enemy2Invincible = 0;
var enemy2TelegraphTimer = 0, enemy2Attacking = false;
var enemy2Parrying = false, enemy2Resist = 'none';
var enemy2HitLanded = false;
var enemy2Jumping = false;

// Achal guard
var guardActive = false;
var guardHitsLeft = 0;
var guardVulnTimer = 0;

// Status effects on enemy
var burnTimer = 0;
var burnTickTimer = 0;
var shockActive = false;
var freezeBuildup = 0;
var frozenTimer = 0;

// Status effect internal cooldowns (ICD)
var burnICD = 0;
var shockICD = 0;
var freezeICD = 0;
var ICD_DURATION = 3.0;

// Layout
var arenaW = 0;
var arenaH = 0;
var groundY = 0;
var robotSize = 0;

// Input
var inputLeft = false;
var inputRight = false;
var inputJump = false;
var inputAttack = false;
var inputParry = false;
var keysDown = {};

var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Stats
var totalHitsLanded = 0;
var totalParries = 0;
var totalHPLost = 0;

// Parry riposte (post-parry damage boost)
var parryRiposteTimer = 0;
var PARRY_RIPOSTE_WINDOW = 0.6;
var PARRY_RIPOSTE_BONUS = 0.25;

// Combat flags
var playerHitLanded = false;
var enemyHitLanded = false;

// Round ending flag
var roundEnding = false;

// ============================================================
// DOM
// ============================================================
var titleScreen = document.getElementById('title-screen');
var swordScreen = document.getElementById('sword-screen');
var gameScreen = document.getElementById('game-screen');
var gameOverScreen = document.getElementById('game-over');
var gameViewport = document.getElementById('game-viewport');
var arena = document.getElementById('arena');
var playerRobot = document.getElementById('player-robot');
var enemyRobot = document.getElementById('enemy-robot');
var playerSprite = playerRobot.querySelector('.robot-sprite');
var enemySprite = enemyRobot.querySelector('.robot-sprite');
var playerSwordIcon = document.getElementById('player-sword-icon');
var enemySwordIcon = document.getElementById('enemy-sword-icon');
var controlsEl = document.getElementById('controls');
var roundOverlay = document.getElementById('round-overlay');
var roundOverlayText = document.getElementById('round-overlay-text');
var roundOverlaySub = document.getElementById('round-overlay-sub');
var hudRound = document.getElementById('round-display');
var hudSword = document.getElementById('sword-display');
var playerHpHearts = document.getElementById('player-hp-hearts');
var enemyHpHearts = document.getElementById('enemy-hp-hearts');
var enemyResistHud = document.getElementById('enemy-resist-hud');
var playerResistHud = document.getElementById('player-resist-hud');
var arenaLighting = document.getElementById('arena-lighting');

// Dynamic elements (created in code)
var statusFloatsContainer = null;
var telegraphEl = null;

// ============================================================
// SOUND EFFECTS (Web Audio API - all procedural)
// ============================================================
function playSwingSword() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.15);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    var t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.3;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.setValueAtTime(4000, ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
  bp.Q.value = 2;
  var g = ctx.createGain(); g.gain.value = 0.3;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start();
}

function playHitEnemy() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.2);
  // Metallic clang
  var osc2 = ctx.createOscillator();
  var g2 = ctx.createGain();
  osc2.type = 'square';
  osc2.frequency.value = 800;
  g2.gain.setValueAtTime(0.15, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  osc2.connect(g2); g2.connect(ctx.destination);
  osc2.start(); osc2.stop(ctx.currentTime + 0.1);
}

function playHitPlayer() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.3);
  // Crunch noise
  var bufSize = Math.floor(ctx.sampleRate * 0.1);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.3;
  var src = ctx.createBufferSource(); src.buffer = buf;
  var g2 = ctx.createGain(); g2.gain.value = 0.3;
  src.connect(g2); g2.connect(ctx.destination); src.start();
}

function playParryAttempt() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.12);
}

function playParrySuccess() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var freqs = [1200, 1600, 2000];
  freqs.forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.03;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.15);
  });
}

function playJump() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.2);
}

function playBurn() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.15);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.2;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 2;
  var g = ctx.createGain(); g.gain.value = 0.2;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start();
}

function playShock() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(100, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.05);
  osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.1);
  osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.18);
}

function playFreeze() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var notes = [2000, 1800, 1600, 1400, 1200];
  notes.forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.04;
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.1);
  });
}

function playEnemyAttack() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.12);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.25;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2000, ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.12);
  var g = ctx.createGain(); g.gain.value = 0.25;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start();
}

function playEnemyParry() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 600;
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
}

function playRoundWin() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var melody = [523, 659, 784, 1047];
  melody.forEach(function(f, i) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = f;
    var t = ctx.currentTime + i * 0.12;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.25);
  });
}

function playGameOverSound() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var melody = [392, 349, 311, 262];
  melody.forEach(function(f, i) {
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

function playVictorySound() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var melody = [523, 659, 784, 1047, 784, 1047, 1319];
  melody.forEach(function(f, i) {
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

function playGuardBreak() {
  if (muteState.muted) return;
  var ctx = SharedAudio.getAudioCtx();
  var bufSize = Math.floor(ctx.sampleRate * 0.2);
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.4;
  }
  var src = ctx.createBufferSource(); src.buffer = buf;
  var g = ctx.createGain(); g.gain.value = 0.35;
  src.connect(g); g.connect(ctx.destination); src.start();
  var osc = ctx.createOscillator();
  var g2 = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.25);
  g2.gain.setValueAtTime(0.2, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
  osc.connect(g2); g2.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.25);
}

// ============================================================
// LAYOUT CALCULATION
// ============================================================
function calcLayout() {
  var rect = gameViewport.getBoundingClientRect();
  arenaW = rect.width;
  arenaH = rect.height;
  groundY = arenaH * 0.75;
  robotSize = parseFloat(getComputedStyle(playerRobot).fontSize) || 48;
}

// ============================================================
// INPUT HANDLING
// ============================================================
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

document.addEventListener('keydown', function(e) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyJ', 'KeyK'].includes(e.code)) {
    e.preventDefault();
  }
  if (!gameRunning) return;
  keysDown[e.code] = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') inputLeft = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') inputRight = true;
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') inputJump = true;
  if (e.code === 'KeyJ') inputAttack = true;
  if (e.code === 'KeyK') inputParry = true;
});

document.addEventListener('keyup', function(e) {
  keysDown[e.code] = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
    if (!keysDown['KeyA'] && !keysDown['ArrowLeft']) inputLeft = false;
  }
  if (e.code === 'KeyD' || e.code === 'ArrowRight') {
    if (!keysDown['KeyD'] && !keysDown['ArrowRight']) inputRight = false;
  }
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
    if (!keysDown['Space'] && !keysDown['KeyW'] && !keysDown['ArrowUp']) inputJump = false;
  }
});

// Mouse: left-click = attack, right-click = parry
document.addEventListener('mousedown', function(e) {
  if (!gameRunning) return;
  if (e.target.closest('#hud') || e.target.closest('#controls') || e.target.closest('#game-over')) return;
  if (e.button === 0) inputAttack = true;
  else if (e.button === 2) inputParry = true;
});

// Touch controls
function setupTouchBtn(id, onDown, onUp) {
  var btn = document.getElementById(id);
  if (!btn) return;
  var down = function(e) { e.preventDefault(); onDown(); btn.classList.add('pressed'); };
  var up = function(e) { e.preventDefault(); onUp(); btn.classList.remove('pressed'); };
  btn.addEventListener('touchstart', down, { passive: false });
  btn.addEventListener('touchend', up, { passive: false });
  btn.addEventListener('touchcancel', up, { passive: false });
  btn.addEventListener('mousedown', down);
  btn.addEventListener('mouseup', up);
  btn.addEventListener('mouseleave', up);
}

setupTouchBtn('btn-left', function() { inputLeft = true; }, function() { inputLeft = false; });
setupTouchBtn('btn-right', function() { inputRight = true; }, function() { inputRight = false; });
setupTouchBtn('btn-jump', function() { inputJump = true; }, function() {});
setupTouchBtn('btn-attack', function() { inputAttack = true; }, function() {});
setupTouchBtn('btn-parry', function() { inputParry = true; }, function() {});

// ============================================================
// HELPERS
// ============================================================
function renderHearts(hp, max) {
  var s = '';
  for (var i = 0; i < Math.floor(max); i++) {
    if (i < Math.floor(hp)) s += '❤️';
    else if (i < Math.ceil(hp) && hp % 1 >= 0.25) s += '💔';
    else s += '🖤';
  }
  return s;
}

function spawnDmgFloat(x, y, text, color) {
  var el = document.createElement('div');
  el.className = 'dmg-float';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = color;
  arena.appendChild(el);
  setTimeout(function() { try { el.remove(); } catch(e) {} }, 800);
}

function screenShake() {
  gameViewport.classList.remove('shake');
  void gameViewport.offsetWidth;
  gameViewport.classList.add('shake');
  setTimeout(function() { gameViewport.classList.remove('shake'); }, 300);
}

function applyArenaColors(colors) {
  arena.style.background = 'linear-gradient(180deg, ' + colors.bg1 + ' 0%, ' + colors.bg2 + ' 50%, ' + colors.bg3 + ' 100%)';
  var ceiling = document.getElementById('arena-ceiling');
  ceiling.style.background = 'linear-gradient(180deg, ' + colors.ceiling + ' 0%, ' + colors.bg1 + ' 100%)';
  ceiling.style.borderBottom = '3px solid ' + colors.border;
  var ground = document.getElementById('arena-ground');
  ground.style.background = 'linear-gradient(0deg, ' + colors.ground1 + ' 0%, ' + colors.ground2 + ' 50%, ' + colors.ground3 + ' 100%)';
  ground.style.borderTop = '3px solid ' + colors.border;
}

// ============================================================
// GAME FLOW
// ============================================================
function beginGame(diff) {
  diffKey = diff;
  currentDiff = DIFFICULTY[diff];
  rng = SharedRNG.mulberry32(SharedRNG.dateSeed(todayStr, diff, 'botbattle'));

  // Determine enemy resistances for all 4 rounds (no repeats)
  if (diffKey === 'achal') {
    // Achal: rounds 1-3 get shuffled elemental types, round 4 gets a pair
    var achalTypes = seededShuffle(['fire', 'lightning', 'ice']);
    enemyResistances = achalTypes.slice();
    var finalPair = seededShuffle(['fire', 'lightning', 'ice']);
    enemyResistances.push(finalPair[0]);
    enemy2Resist = finalPair[1];
  } else {
    enemyResistances = seededShuffle(['fire', 'lightning', 'ice', 'none']);
  }

  // Allow ?round= query param to skip ahead (for testing)
  var urlRound = new URLSearchParams(window.location.search).get('round');
  currentRound = urlRound ? Math.max(0, Math.min(3, parseInt(urlRound, 10) - 1)) : 0;
  usedSwords = [];
  playerHP = currentDiff.playerHP;
  playerMaxHP = currentDiff.playerHP;
  totalHitsLanded = 0;
  totalParries = 0;
  totalHPLost = 0;
  gameStartTime = performance.now();

  titleScreen.classList.add('hidden');
  showSwordSelection();
}

function showSwordSelection() {
  swordScreen.classList.add('active');
  document.getElementById('sword-round-info').textContent = (currentRound === 3) ? 'Final Round' : 'Round ' + (currentRound + 1) + ' of 4';
  document.getElementById('sword-hp-info').textContent = 'Your HP: ' + renderHearts(playerHP, playerMaxHP);

  var cards = document.querySelectorAll('.sword-card');
  cards.forEach(function(card) {
    var sword = card.dataset.sword;
    if (usedSwords.includes(sword)) {
      card.classList.add('used');
    } else {
      card.classList.remove('used');
    }
  });
}

function selectSword(swordKey) {
  if (usedSwords.includes(swordKey)) return;
  chosenSword = swordKey;
  usedSwords.push(swordKey);
  swordScreen.classList.remove('active');
  startRound();
}

function startRound() {
  var sword = SWORDS[chosenSword];
  enemyHP = currentDiff.enemyHP;
  enemyMaxHP = currentDiff.enemyHP;
  enemyResist = enemyResistances[currentRound];
  playerResist = SWORD_RESIST[chosenSword] || 'none';

  // Reset player combat state (positions set after calcLayout below)
  var isAchalFinal = (diffKey === 'achal' && currentRound === 3);
  playerX = 0;
  playerY = 0;
  playerVelY = 0;
  playerJumping = false;
  playerAttacking = false;
  playerParrying = false;
  playerAttackTimer = 0;
  playerParryTimer = 0;
  playerAttackCooldown = 0;
  playerInvincible = 0;
  playerFacing = 1;

  // Reset enemy
  enemyX = 0;
  enemyY = 0;
  enemyVelY = 0;
  enemyJumping = false;
  enemyState = 'idle';
  enemyStateTimer = 1.0;
  enemyAttackCooldown = 0;
  enemyInvincible = 0;
  enemyTelegraphTimer = 0;
  enemyAttacking = false;
  enemyParrying = false;

  // Reset status effects
  burnTimer = 0;
  burnTickTimer = 0;
  shockActive = false;
  freezeBuildup = 0;
  frozenTimer = 0;

  // Reset ICDs
  burnICD = 0;
  shockICD = 0;
  freezeICD = 0;

  // Reset player status effects
  playerBurnTimer = 0;
  playerBurnTickTimer = 0;
  playerShockActive = false;
  playerFreezeBuildup = 0;
  playerFrozenTimer = 0;
  playerBurnICD = 0;
  playerShockICD = 0;
  playerFreezeICD = 0;

  // Achal guard
  guardActive = currentDiff.hasGuard;
  guardHitsLeft = currentDiff.guardHits || 0;
  guardVulnTimer = 0;

  // Reset combat flags
  playerHitLanded = false;
  enemyHitLanded = false;
  parryRiposteTimer = 0;

  // Clear input
  inputLeft = false;
  inputRight = false;
  inputJump = false;
  inputAttack = false;
  inputParry = false;

  // Show game screen first so layout calculation works
  gameScreen.classList.add('active');

  // Setup visuals
  calcLayout();

  // Set spawn positions (must be after calcLayout so arenaW is known)
  playerX = isAchalFinal ? arenaW * 0.5 : arenaW / 3;
  enemyX = isAchalFinal ? arenaW * 0.2 : arenaW * 2 / 3;

  applyArenaColors(currentDiff.colors);
  hudRound.textContent = (currentRound === 3) ? 'Final Round' : 'Round ' + (currentRound + 1) + '/4';
  hudSword.textContent = sword.emoji + ' ' + sword.name;
  playerSwordIcon.textContent = sword.emoji;
  playerSwordIcon.className = 'sword-display sword-' + chosenSword;
  var eSword = ENEMY_SWORDS[enemyResist] || ENEMY_SWORDS.none;
  enemySwordIcon.textContent = eSword.emoji;
  enemySwordIcon.className = 'sword-display ' + eSword.bladeClass;
  enemySprite.style.filter = 'hue-rotate(' + ENEMY_HUES[currentRound] + 'deg)';

  // Create dynamic elements
  setupDynamicElements();

  // Initialize enemy2 if present (Achal final round)
  if (hasEnemy2) {
    enemy2X = arenaW * 0.8; // right side (player is at 0.5, enemy1 at 0.2)
    enemy2Y = 0; enemy2VelY = 0;
    enemy2State = 'idle'; enemy2StateTimer = 1.8;
    enemy2AttackCooldown = 0; enemy2Invincible = 0;
    enemy2TelegraphTimer = 0; enemy2Attacking = false;
    enemy2Parrying = false; enemy2HitLanded = false;
    enemy2Jumping = false;
    var e2Sword = ENEMY_SWORDS[enemy2Resist] || ENEMY_SWORDS.none;
    var e2SwordIcon = document.getElementById('enemy-sword-icon-2');
    if (e2SwordIcon) {
      e2SwordIcon.textContent = e2Sword.emoji;
      e2SwordIcon.className = 'sword-display ' + e2Sword.bladeClass;
    }
    var e2El = document.getElementById('enemy-robot-2');
    if (e2El) {
      var e2Sprite = e2El.querySelector('.robot-sprite');
      e2Sprite.style.filter = 'hue-rotate(' + ENEMY_HUES[(currentRound + 2) % 4] + 'deg)';
    }
  }

  // Show controls for touch devices
  controlsEl.classList.add('active');
  roundOverlay.classList.remove('active');

  // Start game loop
  gameRunning = true;
  music.start(muteState.muted);
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function setupDynamicElements() {
  // Remove old
  if (statusFloatsContainer) { try { statusFloatsContainer.remove(); } catch(e) {} }
  if (telegraphEl) { try { telegraphEl.remove(); } catch(e) {} }

  // Status floats container
  statusFloatsContainer = document.createElement('div');
  statusFloatsContainer.id = 'status-floats';
  statusFloatsContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:15;';
  arena.appendChild(statusFloatsContainer);

  // Telegraph indicator
  telegraphEl = document.createElement('div');
  telegraphEl.className = 'telegraph-indicator';
  telegraphEl.style.display = 'none';
  telegraphEl.textContent = '\u26A0\uFE0F';
  arena.appendChild(telegraphEl);

  // Second enemy for Achal final round
  var oldE2 = document.getElementById('enemy-robot-2');
  if (oldE2) oldE2.remove();
  if (diffKey === 'achal' && currentRound === 3) {
    var e2 = document.createElement('div');
    e2.className = 'robot';
    e2.id = 'enemy-robot-2';
    e2.innerHTML = '<span class="robot-sprite">\uD83E\uDD16</span><span class="sword-display" id="enemy-sword-icon-2">\uD83D\uDDE1\uFE0F</span>';
    arena.appendChild(e2);
    hasEnemy2 = true;
  } else {
    hasEnemy2 = false;
  }
}

// ============================================================
// GAME LOOP
// ============================================================
var lastFrameTime = 0;

function gameLoop(timestamp) {
  if (!gameRunning) return;

  var dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;
  elapsedMs = timestamp - gameStartTime;

  updatePlayer(dt);
  updateEnemy(dt);
  if (hasEnemy2 && enemyHP > 0) updateEnemy2(dt);
  updateStatusEffects(dt);
  updatePlayerStatusEffects(dt);
  checkCombat(dt);
  checkRoundEnd();
  render();

  requestAnimationFrame(gameLoop);
}

// ============================================================
// PLAYER UPDATE
// ============================================================
var PLAYER_SPEED = 200;
var JUMP_VEL = 500;
var GRAVITY = 1800;
var ATTACK_DURATION = 0.25;
var PARRY_WINDOW = 0.2;
var PARRY_ACTIVE = 0.12; // only first 0.12s of window actually deflects
var ATTACK_COOLDOWN = 0.55;
var ATTACK_RANGE = 140;

function updatePlayer(dt) {
  // Invincibility
  if (playerInvincible > 0) playerInvincible -= dt;

  // Frozen: can't move/attack/parry
  if (playerFrozenTimer > 0) return;

  // Movement
  var dx = 0;
  if (inputLeft) dx = -PLAYER_SPEED;
  if (inputRight) dx = PLAYER_SPEED;

  // Player facing: dual-bot = last move direction, single-bot = face enemy
  if (hasEnemy2 && enemyHP > 0) {
    if (inputLeft) playerFacing = -1;
    else if (inputRight) playerFacing = 1;
    // else keep current facing
  } else {
    playerFacing = playerX < enemyX ? 1 : -1;
  }

  playerX += dx * dt;
  // Bounds
  var margin = robotSize * 0.5;
  playerX = Math.max(margin, Math.min(arenaW - margin * 2, playerX));

  // Jump
  if (inputJump && !playerJumping) {
    playerJumping = true;
    playerVelY = JUMP_VEL;
    playJump();
    inputJump = false;
  }

  // Apply gravity
  if (playerJumping) {
    playerY += playerVelY * dt;
    playerVelY -= GRAVITY * dt;
    if (playerY <= 0) {
      playerY = 0;
      playerVelY = 0;
      playerJumping = false;
    }
  }

  // Reset jump input if not held
  if (!keysDown['Space'] && !keysDown['KeyW'] && !keysDown['ArrowUp']) {
    inputJump = false;
  }

  // Attack cooldown + parry riposte timer
  if (playerAttackCooldown > 0) playerAttackCooldown -= dt;
  if (parryRiposteTimer > 0) parryRiposteTimer -= dt;

  // Attack
  if (playerAttacking) {
    playerAttackTimer -= dt;
    if (playerAttackTimer <= 0) {
      playerAttacking = false;
    }
  }
  if (inputAttack && !playerAttacking && playerAttackCooldown <= 0 && !playerParrying) {
    playerAttacking = true;
    playerAttackTimer = ATTACK_DURATION;
    playerAttackCooldown = ATTACK_COOLDOWN;
    playSwingSword();
    inputAttack = false;
  } else {
    inputAttack = false;
  }

  // Parry
  if (playerParrying) {
    playerParryTimer -= dt;
    if (playerParryTimer <= 0) {
      playerParrying = false;
    }
  }
  if (inputParry && !playerParrying && !playerAttacking) {
    playerParrying = true;
    playerParryTimer = PARRY_WINDOW;
    playParryAttempt();
    inputParry = false;
  } else {
    inputParry = false;
  }
}

// ============================================================
// ENEMY AI
// ============================================================
function updateEnemy(dt) {
  if (enemyHP <= 0) return;
  if (frozenTimer > 0) {
    frozenTimer -= dt;
    if (frozenTimer <= 0) {
      frozenTimer = 0;
      freezeICD = ICD_DURATION;
    }
    enemyState = 'frozen';
    enemyInvincible = Math.max(enemyInvincible - dt, 0);
    return;
  }

  enemyInvincible = Math.max(enemyInvincible - dt, 0);

  // Guard vulnerability timer (Achal)
  if (guardVulnTimer > 0) {
    guardVulnTimer -= dt;
    if (guardVulnTimer <= 0 && currentDiff.hasGuard) {
      guardActive = true;
      guardHitsLeft = currentDiff.guardHits;
    }
  }

  var dist = Math.abs(enemyX - playerX);
  var prefDist = 130;

  enemyAttackCooldown -= dt;
  enemyStateTimer -= dt;

  switch (enemyState) {
    case 'idle':
      if (enemyStateTimer <= 0) {
        enemyState = 'approach';
      }
      break;

    case 'approach': {
      var dir = playerX < enemyX ? -1 : 1;
      var speed = currentDiff.enemySpeed;

      // Only move closer if outside preferred distance
      if (dist > prefDist) {
        enemyX += dir * speed * dt;
        // Clamp so we don't overshoot past prefDist
        if (Math.abs(enemyX - playerX) < prefDist) {
          enemyX = playerX + (playerX < enemyX ? prefDist : -prefDist);
        }
      }

      // Hard mode dodge-step
      if (diffKey === 'hard' && dist < 60 && rng() < 0.01) {
        enemyX += (playerX < enemyX ? 1 : -1) * 80;
      }

      if (dist < prefDist + 30 && enemyAttackCooldown <= 0) {
        enemyState = 'telegraph';
        enemyTelegraphTimer = currentDiff.telegraph;
      }
      break;
    }

    case 'telegraph':
      enemyTelegraphTimer -= dt;
      if (enemyTelegraphTimer <= 0) {
        enemyState = 'attack';
        enemyAttacking = true;
        enemyStateTimer = 0.3;
        playEnemyAttack();
      }
      break;

    case 'attack':
      if (enemyStateTimer <= 0) {
        enemyAttacking = false;
        enemyAttackCooldown = currentDiff.attackRate;
        enemyState = 'retreat';
        enemyStateTimer = 0.4;
      }
      break;

    case 'retreat': {
      var retreatDir = playerX < enemyX ? 1 : -1;
      enemyX += retreatDir * currentDiff.enemySpeed * 0.6 * dt;
      if (enemyStateTimer <= 0) {
        enemyState = 'approach';
      }
      break;
    }

    case 'hurt':
      if (enemyStateTimer <= 0) {
        enemyState = 'approach';
      }
      break;

    case 'parry':
      if (enemyStateTimer <= 0) {
        enemyParrying = false;
        enemyState = 'retreat';
        enemyStateTimer = 0.3;
      }
      break;
  }

  // Keep enemy in bounds
  var margin = robotSize * 0.5;
  enemyX = Math.max(margin, Math.min(arenaW - margin * 2, enemyX));
}

// ============================================================
// ENEMY 2 AI (Achal final round)
// ============================================================
function updateEnemy2(dt) {
  enemy2Invincible = Math.max(enemy2Invincible - dt, 0);

  var dist2 = Math.abs(enemy2X - playerX);
  var prefDist2 = 130;

  enemy2AttackCooldown -= dt;
  enemy2StateTimer -= dt;

  switch (enemy2State) {
    case 'idle':
      if (enemy2StateTimer <= 0) {
        enemy2State = 'approach';
      }
      break;

    case 'approach': {
      var dir2 = playerX < enemy2X ? -1 : 1;
      var speed2 = currentDiff.enemySpeed * 0.9;

      if (dist2 > prefDist2) {
        enemy2X += dir2 * speed2 * dt;
        if (Math.abs(enemy2X - playerX) < prefDist2) {
          enemy2X = playerX + (playerX < enemy2X ? prefDist2 : -prefDist2);
        }
      }

      if (dist2 < prefDist2 + 30 && enemy2AttackCooldown <= 0) {
        enemy2State = 'telegraph';
        enemy2TelegraphTimer = currentDiff.telegraph * 1.2;
      }
      break;
    }

    case 'telegraph':
      enemy2TelegraphTimer -= dt;
      if (enemy2TelegraphTimer <= 0) {
        enemy2State = 'attack';
        enemy2Attacking = true;
        enemy2StateTimer = 0.3;
        playEnemyAttack();
      }
      break;

    case 'attack':
      if (enemy2StateTimer <= 0) {
        enemy2Attacking = false;
        enemy2AttackCooldown = currentDiff.attackRate * 1.3;
        enemy2State = 'retreat';
        enemy2StateTimer = 0.5;
      }
      break;

    case 'retreat': {
      var retreatDir2 = playerX < enemy2X ? 1 : -1;
      enemy2X += retreatDir2 * currentDiff.enemySpeed * 0.5 * dt;
      if (enemy2StateTimer <= 0) {
        enemy2State = 'approach';
      }
      break;
    }

    case 'hurt':
      if (enemy2StateTimer <= 0) {
        enemy2State = 'approach';
      }
      break;
  }

  // Keep enemy2 in bounds
  var margin2 = robotSize * 0.5;
  enemy2X = Math.max(margin2, Math.min(arenaW - margin2 * 2, enemy2X));
}

// ============================================================
// COMBAT
// ============================================================
function checkCombat(dt) {
  if (enemyHP <= 0) return;

  var dist = Math.abs(playerX - enemyX);

  // Reset hit flags when attack ends
  if (!playerAttacking) playerHitLanded = false;
  if (!enemyAttacking) enemyHitLanded = false;

  // Check if hard-mode enemy tries to parry when player approaches for attack
  if (playerAttacking && !playerHitLanded && dist < ATTACK_RANGE + 20) {
    if (currentDiff.parryChance > 0 && !enemyParrying && enemyState === 'approach') {
      if (rng() < currentDiff.parryChance) {
        enemyParrying = true;
        enemyState = 'parry';
        enemyStateTimer = 0.4;
        playEnemyParry();
      }
    }
  }

  // Player attack hits enemy (land the hit past the midpoint of the swing)
  if (playerAttacking && !playerHitLanded && playerAttackTimer < ATTACK_DURATION * 0.35) {
    if (dist < ATTACK_RANGE) {
      playerHitLanded = true;

      // Check if enemy is parrying (hard mode)
      if (enemyParrying) {
        playEnemyParry();
        spawnDmgFloat(enemyX, groundY - robotSize - 30, 'PARRIED!', '#8888FF');
        return;
      }

      // Achal guard check
      if (guardActive && guardHitsLeft > 0) {
        guardHitsLeft--;
        playEnemyParry();
        spawnDmgFloat(enemyX, groundY - robotSize - 30, '🛡️ ' + guardHitsLeft, '#8888FF');
        if (guardHitsLeft <= 0) {
          guardActive = false;
          guardVulnTimer = currentDiff.guardVulnerable || 3.0;
          playGuardBreak();
          spawnDmgFloat(enemyX, groundY - robotSize - 50, 'GUARD BROKEN!', '#FF4444');
          screenShake();
        }
        return;
      }

      if (enemyInvincible > 0) return;

      // Calculate damage
      var sword = SWORDS[chosenSword];
      var dmg = sword.dmg;

      // Parry riposte bonus (+25% base damage on hit right after parry)
      var riposteBoosted = false;
      if (parryRiposteTimer > 0) {
        dmg *= (1 + PARRY_RIPOSTE_BONUS);
        parryRiposteTimer = 0;
        riposteBoosted = true;
      }

      // Shock bonus (4x so elemental 0.5+2.0 = 2.5, rewarding the setup hit)
      var shockBoosted = false;
      if (shockActive) {
        dmg *= 4;
        shockActive = false;
        shockICD = ICD_DURATION;
        shockBoosted = true;
      }

      enemyHP = Math.max(0, enemyHP - dmg);
      enemyInvincible = 0.5;
      totalHitsLanded++;

      var dmgText = '-' + dmg;
      var dmgColor = '#FF6347';
      if (riposteBoosted && shockBoosted) {
        dmgText = '\u26A1\uD83D\uDDE1\uFE0F-' + dmg;
        dmgColor = '#FFD700';
      } else if (shockBoosted) {
        dmgText = '\u26A1-' + dmg;
        dmgColor = '#FFD700';
      } else if (riposteBoosted) {
        dmgText = '\uD83D\uDDE1\uFE0F-' + dmg;
        dmgColor = '#44FF44';
      }
      spawnDmgFloat(enemyX, groundY - robotSize - 20, dmgText, dmgColor);
      playHitEnemy();
      screenShake();

      // Apply status effect (if enemy not resistant)
      var effectElement = EFFECT_TO_ELEMENT[sword.effect];
      if (sword.effect !== 'none' && enemyResist !== effectElement) {
        applyStatusEffect(sword.effect);
      } else if (sword.effect !== 'none' && enemyResist === effectElement) {
        spawnDmgFloat(enemyX + 30, groundY - robotSize - 40, 'RESISTED!', '#888');
      }

      enemyState = 'hurt';
      enemyStateTimer = 0.3;
      enemyAttacking = false;
    }
  }

  // Enemy attack hits player
  if (enemyAttacking && !enemyHitLanded && enemyState === 'attack' && enemyStateTimer < 0.1) {
    if (dist < ATTACK_RANGE && playerInvincible <= 0) {
      enemyHitLanded = true;

      // Player parry check (must be in active portion of parry window)
      if (playerParrying && playerParryTimer > PARRY_WINDOW - PARRY_ACTIVE) {
        playParrySuccess();
        totalParries++;
        parryRiposteTimer = PARRY_RIPOSTE_WINDOW;
        spawnDmgFloat(playerX, groundY - robotSize - 30, 'PARRIED!', '#44FF44');
        enemyAttacking = false;
        enemyState = 'hurt';
        enemyStateTimer = 0.5;
        return;
      }

      // Player takes damage (uses enemy sword dmg, shock amplifies)
      var eSwordData = ENEMY_SWORDS[enemyResist] || ENEMY_SWORDS.none;
      var pDmg = eSwordData.dmg;
      var pShockBoosted = false;
      if (playerShockActive) {
        pDmg *= 4;
        playerShockActive = false;
        playerShockICD = ICD_DURATION;
        pShockBoosted = true;
      }
      totalHPLost += pDmg;
      playerHP = Math.max(0, playerHP - pDmg);
      playerInvincible = 0.5;
      playHitPlayer();
      screenShake();
      var pDmgText = '-' + pDmg;
      var pDmgColor = '#FF4444';
      if (pShockBoosted) {
        pDmgText = '\u26A1-' + pDmg;
        pDmgColor = '#FFD700';
      }
      spawnDmgFloat(playerX, groundY - robotSize - 20, pDmgText, pDmgColor);

      // Apply enemy sword effect to player
      if (eSwordData.effect !== 'none') {
        applyPlayerStatusEffect(eSwordData.effect);
      }
    }
  }

  // --- Enemy2 combat (Achal final round) ---
  if (hasEnemy2 && enemyHP > 0) {
    var dist2 = Math.abs(playerX - enemy2X);

    // Reset enemy2 hit flag
    if (!enemy2Attacking) enemy2HitLanded = false;

    // Player attack hits enemy2 (shared HP)
    if (playerAttacking && !playerHitLanded && playerAttackTimer < ATTACK_DURATION * 0.35) {
      if (dist2 < ATTACK_RANGE) {
        playerHitLanded = true;

        if (enemy2Invincible > 0) return;

        var sword2 = SWORDS[chosenSword];
        var dmg2 = sword2.dmg;

        var riposteBoosted2 = false;
        if (parryRiposteTimer > 0) {
          dmg2 *= (1 + PARRY_RIPOSTE_BONUS);
          parryRiposteTimer = 0;
          riposteBoosted2 = true;
        }

        var shockBoosted2 = false;
        if (shockActive) {
          dmg2 *= 4;
          shockActive = false;
          shockICD = ICD_DURATION;
          shockBoosted2 = true;
        }

        enemyHP = Math.max(0, enemyHP - dmg2);
        enemy2Invincible = 0.5;
        totalHitsLanded++;

        var dmgText2 = '-' + dmg2;
        var dmgColor2 = '#FF6347';
        if (riposteBoosted2 && shockBoosted2) {
          dmgText2 = '\u26A1\uD83D\uDDE1\uFE0F-' + dmg2;
          dmgColor2 = '#FFD700';
        } else if (shockBoosted2) {
          dmgText2 = '\u26A1-' + dmg2;
          dmgColor2 = '#FFD700';
        } else if (riposteBoosted2) {
          dmgText2 = '\uD83D\uDDE1\uFE0F-' + dmg2;
          dmgColor2 = '#44FF44';
        }
        spawnDmgFloat(enemy2X, groundY - robotSize - 20, dmgText2, dmgColor2);
        playHitEnemy();
        screenShake();

        // Status effect uses enemy2's resist
        var effectElement2 = EFFECT_TO_ELEMENT[sword2.effect];
        if (sword2.effect !== 'none' && enemy2Resist !== effectElement2) {
          applyStatusEffect(sword2.effect);
        } else if (sword2.effect !== 'none' && enemy2Resist === effectElement2) {
          spawnDmgFloat(enemy2X + 30, groundY - robotSize - 40, 'RESISTED!', '#888');
        }

        enemy2State = 'hurt';
        enemy2StateTimer = 0.3;
        enemy2Attacking = false;
      }
    }

    // Enemy2 attack hits player
    if (enemy2Attacking && !enemy2HitLanded && enemy2State === 'attack' && enemy2StateTimer < 0.1) {
      if (dist2 < ATTACK_RANGE && playerInvincible <= 0) {
        enemy2HitLanded = true;

        if (playerParrying && playerParryTimer > PARRY_WINDOW - PARRY_ACTIVE) {
          playParrySuccess();
          totalParries++;
          parryRiposteTimer = PARRY_RIPOSTE_WINDOW;
          spawnDmgFloat(playerX, groundY - robotSize - 30, 'PARRIED!', '#44FF44');
          enemy2Attacking = false;
          enemy2State = 'hurt';
          enemy2StateTimer = 0.5;
          return;
        }

        var e2SwordData = ENEMY_SWORDS[enemy2Resist] || ENEMY_SWORDS.none;
        var pDmg2 = e2SwordData.dmg;
        var pShockBoosted2 = false;
        if (playerShockActive) {
          pDmg2 *= 4;
          playerShockActive = false;
          playerShockICD = ICD_DURATION;
          pShockBoosted2 = true;
        }
        totalHPLost += pDmg2;
        playerHP = Math.max(0, playerHP - pDmg2);
        playerInvincible = 0.5;
        playHitPlayer();
        screenShake();
        var pDmgText2 = '-' + pDmg2;
        var pDmgColor2 = '#FF4444';
        if (pShockBoosted2) {
          pDmgText2 = '\u26A1-' + pDmg2;
          pDmgColor2 = '#FFD700';
        }
        spawnDmgFloat(playerX, groundY - robotSize - 20, pDmgText2, pDmgColor2);

        if (e2SwordData.effect !== 'none') {
          applyPlayerStatusEffect(e2SwordData.effect);
        }
      }
    }
  }
}

function applyStatusEffect(effect) {
  switch (effect) {
    case 'burn':
      if (burnTimer > 0) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'BURNING!', '#FF6600');
        return;
      }
      if (burnICD > 0) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'IMMUNE!', '#FF6600');
        return;
      }
      burnTimer = 4.0;
      burnTickTimer = 2.0;
      playBurn();
      break;
    case 'shock':
      if (shockActive) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'SHOCKED!', '#FFD700');
        return;
      }
      if (shockICD > 0) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'IMMUNE!', '#FFD700');
        return;
      }
      shockActive = true;
      playShock();
      break;
    case 'freeze':
      if (frozenTimer > 0) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'FROZEN!', '#64C8FF');
        return;
      }
      if (freezeICD > 0) {
        spawnDmgFloat(enemyX + 15, groundY - robotSize - 50, 'IMMUNE!', '#64C8FF');
        return;
      }
      freezeBuildup = Math.min(100, freezeBuildup + 50);
      if (freezeBuildup >= 100) {
        frozenTimer = 2.0;
        freezeBuildup = 0;
        playFreeze();
        spawnDmgFloat(enemyX, groundY - robotSize - 50, 'FROZEN!', '#00CCFF');
      } else {
        playFreeze();
      }
      break;
  }
}

function applyPlayerStatusEffect(effect) {
  var element = EFFECT_TO_ELEMENT[effect];
  if (playerResist === element) {
    spawnDmgFloat(playerX + 15, groundY - robotSize - 50, 'RESISTED!', '#44FF44');
    return;
  }
  switch (effect) {
    case 'burn':
      if (playerBurnTimer > 0 || playerBurnICD > 0) return;
      playerBurnTimer = 4.0;
      playerBurnTickTimer = 2.0;
      playBurn();
      spawnDmgFloat(playerX + 15, groundY - robotSize - 50, 'BURNING!', '#FF6600');
      break;
    case 'shock':
      if (playerShockActive || playerShockICD > 0) return;
      playerShockActive = true;
      playShock();
      spawnDmgFloat(playerX + 15, groundY - robotSize - 50, 'SHOCKED!', '#FFD700');
      break;
    case 'freeze':
      if (playerFrozenTimer > 0 || playerFreezeICD > 0) return;
      playerFreezeBuildup = Math.min(100, playerFreezeBuildup + 50);
      if (playerFreezeBuildup >= 100) {
        playerFrozenTimer = 2.0;
        playerFreezeBuildup = 0;
        playFreeze();
        spawnDmgFloat(playerX, groundY - robotSize - 50, 'FROZEN!', '#00CCFF');
      } else {
        playFreeze();
        spawnDmgFloat(playerX + 15, groundY - robotSize - 50, 'CHILLED!', '#64C8FF');
      }
      break;
  }
}

// ============================================================
// STATUS EFFECTS UPDATE
// ============================================================
function updateStatusEffects(dt) {
  // Tick down ICDs
  if (burnICD > 0) burnICD = Math.max(0, burnICD - dt);
  if (shockICD > 0) shockICD = Math.max(0, shockICD - dt);
  if (freezeICD > 0) freezeICD = Math.max(0, freezeICD - dt);

  // Burn DOT
  if (burnTimer > 0) {
    burnTimer -= dt;
    burnTickTimer -= dt;
    if (burnTickTimer <= 0 && enemyHP > 0) {
      burnTickTimer = 2.0;
      var burnDmg = 0.5;
      enemyHP = Math.max(0, enemyHP - burnDmg);
      spawnDmgFloat(enemyX + 15, groundY - robotSize - 30, '🔥-' + burnDmg, '#FF6600');
      playBurn();
    }
    if (burnTimer <= 0) {
      burnTimer = 0;
      burnTickTimer = 0;
      burnICD = ICD_DURATION;
    }
  }

}

function updatePlayerStatusEffects(dt) {
  // Tick down player ICDs
  if (playerBurnICD > 0) playerBurnICD = Math.max(0, playerBurnICD - dt);
  if (playerShockICD > 0) playerShockICD = Math.max(0, playerShockICD - dt);
  if (playerFreezeICD > 0) playerFreezeICD = Math.max(0, playerFreezeICD - dt);

  // Player frozen timer
  if (playerFrozenTimer > 0) {
    playerFrozenTimer -= dt;
    if (playerFrozenTimer <= 0) {
      playerFrozenTimer = 0;
      playerFreezeICD = ICD_DURATION;
    }
  }

  // Player burn DOT
  if (playerBurnTimer > 0) {
    playerBurnTimer -= dt;
    playerBurnTickTimer -= dt;
    if (playerBurnTickTimer <= 0 && playerHP > 0) {
      playerBurnTickTimer = 2.0;
      var pBurnDmg = 0.5;
      totalHPLost += pBurnDmg;
      playerHP = Math.max(0, playerHP - pBurnDmg);
      spawnDmgFloat(playerX + 15, groundY - robotSize - 30, '\uD83D\uDD25-' + pBurnDmg, '#FF6600');
      playBurn();
    }
    if (playerBurnTimer <= 0) {
      playerBurnTimer = 0;
      playerBurnTickTimer = 0;
      playerBurnICD = ICD_DURATION;
    }
  }
}

// ============================================================
// ROUND END CHECK
// ============================================================
function checkRoundEnd() {
  if (roundEnding) return;

  if (enemyHP <= 0) {
    roundEnding = true;
    gameRunning = false;
    playRoundWin();
    roundOverlay.classList.add('active');
    roundOverlayText.textContent = (currentRound === 3) ? 'Final Round Complete!' : 'Round ' + (currentRound + 1) + ' Complete!';
    roundOverlaySub.textContent = renderHearts(playerHP, playerMaxHP) + ' HP remaining';
    setTimeout(function() {
      roundEnding = false;
      handleRoundWin();
    }, 2000);
    return;
  }

  if (playerHP <= 0) {
    roundEnding = true;
    gameRunning = false;
    music.stop();
    playGameOverSound();
    setTimeout(function() {
      roundEnding = false;
      handleGameOver(false);
    }, 1500);
    return;
  }
}

function handleRoundWin() {
  roundOverlay.classList.remove('active');
  currentRound++;

  if (currentRound >= 4) {
    // Game complete - victory!
    music.stop();
    handleGameOver(true);
    return;
  }

  // Heal between rounds if applicable
  if (currentDiff.healBetween) {
    playerHP = playerMaxHP;
  }

  gameRunning = false;
  music.stop();
  gameScreen.classList.remove('active');
  controlsEl.classList.remove('active');
  showSwordSelection();
}

function handleGameOver(victory) {
  gameRunning = false;
  music.stop();
  gameScreen.classList.remove('active');
  controlsEl.classList.remove('active');
  roundOverlay.classList.remove('active');
  gameOverScreen.classList.add('active');
  var oldE2 = document.getElementById('enemy-robot-2');
  if (oldE2) oldE2.remove();
  hasEnemy2 = false;

  var goTitle = document.getElementById('go-title');
  var goResult = document.getElementById('go-result');
  var goDifficulty = document.getElementById('go-difficulty');
  var goRounds = document.getElementById('go-rounds');
  var goTime = document.getElementById('go-time');
  var goSwords = document.getElementById('go-swords');
  var goHPLost = document.getElementById('go-hp-lost');
  var goSeed = document.getElementById('go-seed');

  if (victory) {
    goTitle.textContent = 'Victory!';
    goTitle.className = 'victory';
    goResult.textContent = 'All 4 robots defeated!';
    playVictorySound();
  } else {
    goTitle.textContent = 'Defeated!';
    goTitle.className = 'defeat';
    goResult.textContent = (currentRound === 3) ? 'Fell in Final Round' : 'Fell in Round ' + (currentRound + 1);
  }

  goDifficulty.textContent = 'Difficulty: ' + currentDiff.label;
  goRounds.textContent = 'Rounds Won: ' + (victory ? 4 : currentRound) + '/4';

  var totalSec = Math.floor(elapsedMs / 1000);
  var mins = Math.floor(totalSec / 60);
  var secs = totalSec % 60;
  goTime.textContent = 'Time: ' + mins + ':' + String(secs).padStart(2, '0');
  goSwords.textContent = 'Hits: ' + totalHitsLanded + ' | Parries: ' + totalParries;
  goHPLost.textContent = 'HP Lost: ' + totalHPLost;
  goSeed.textContent = 'Daily Seed: ' + todayStr;
}

function quitGame() {
  gameRunning = false;
  roundEnding = false;
  music.stop();
  gameScreen.classList.remove('active');
  controlsEl.classList.remove('active');
  roundOverlay.classList.remove('active');
  gameOverScreen.classList.remove('active');
  swordScreen.classList.remove('active');
  titleScreen.classList.remove('hidden');
  var oldE2 = document.getElementById('enemy-robot-2');
  if (oldE2) oldE2.remove();
  hasEnemy2 = false;
}

function restartGame() {
  roundEnding = false;
  gameOverScreen.classList.remove('active');
  titleScreen.classList.remove('hidden');
}

// ============================================================
// RENDER
// ============================================================
function render() {
  var playerRenderY = groundY - robotSize - playerY;
  var enemyRenderY = groundY - robotSize - enemyY;

  // Player position
  playerRobot.style.transform = 'translate3d(' + playerX + 'px, ' + playerRenderY + 'px, 0)';
  playerSprite.style.transform = playerFacing < 0 ? 'scaleX(-1)' : 'scaleX(1)';

  // Position player sword on the side facing the enemy
  if (playerFacing > 0) {
    playerSwordIcon.style.right = '-0.8em';
    playerSwordIcon.style.left = '';
  } else {
    playerSwordIcon.style.left = '-0.8em';
    playerSwordIcon.style.right = '';
  }

  // Player attack animation
  var swingDir = playerFacing > 0 ? 1 : -1;
  if (playerAttacking) {
    var progress = 1 - playerAttackTimer / ATTACK_DURATION;
    var angle = swingDir * progress * 90;
    playerSwordIcon.style.transform = 'rotate(' + angle + 'deg)';
  } else {
    playerSwordIcon.style.transform = 'rotate(0deg)';
  }

  // Player parry visual
  if (playerParrying) {
    playerSwordIcon.textContent = '🛡️';
    playerSwordIcon.className = 'sword-display';
  } else {
    playerSwordIcon.textContent = SWORDS[chosenSword].emoji;
    playerSwordIcon.className = 'sword-display sword-' + chosenSword;
  }

  // Player invincible
  if (playerInvincible > 0) {
    playerRobot.classList.add('invincible');
  } else {
    playerRobot.classList.remove('invincible');
  }

  // Player frozen visual
  if (playerFrozenTimer > 0) {
    playerSprite.style.filter = 'brightness(1.5) saturate(0.3) sepia(0.5) hue-rotate(180deg)';
  } else {
    playerSprite.style.filter = '';
  }

  // Enemy position
  var eFacing = playerX < enemyX ? -1 : 1;
  enemyRobot.style.transform = 'translate3d(' + enemyX + 'px, ' + enemyRenderY + 'px, 0)';
  enemySprite.style.transform = eFacing < 0 ? 'scaleX(-1)' : 'scaleX(1)';

  // Enemy sword position and animation
  if (eFacing < 0) {
    enemySwordIcon.style.left = '-0.8em';
    enemySwordIcon.style.right = '';
  } else {
    enemySwordIcon.style.right = '-0.8em';
    enemySwordIcon.style.left = '';
  }
  if (enemyAttacking || enemyState === 'attack') {
    var eProgress = 1 - enemyStateTimer / 0.3;
    var eSwingDir = eFacing < 0 ? -1 : 1;
    var eAngle = eSwingDir * eProgress * 90;
    enemySwordIcon.style.transform = 'rotate(' + eAngle + 'deg)';
  } else if (enemyState === 'telegraph') {
    enemySwordIcon.style.transform = 'rotate(0deg)';
  } else {
    enemySwordIcon.style.transform = 'rotate(0deg)';
  }

  // Frozen visual
  if (frozenTimer > 0) {
    enemySprite.style.filter = 'hue-rotate(' + ENEMY_HUES[currentRound] + 'deg) brightness(1.5) saturate(0.3) sepia(0.5) hue-rotate(180deg)';
  } else {
    enemySprite.style.filter = 'hue-rotate(' + ENEMY_HUES[currentRound] + 'deg)';
  }

  // Enemy invincible
  if (enemyInvincible > 0) {
    enemyRobot.classList.add('invincible');
  } else {
    enemyRobot.classList.remove('invincible');
  }

  // Telegraph indicator
  if (enemyState === 'telegraph') {
    telegraphEl.style.display = 'block';
    telegraphEl.style.left = (enemyX + (eFacing < 0 ? -30 : robotSize + 5)) + 'px';
    telegraphEl.style.top = (enemyRenderY - 10) + 'px';
  } else {
    telegraphEl.style.display = 'none';
  }

  // --- Enemy2 rendering (Achal final round) ---
  if (hasEnemy2) {
    var e2El = document.getElementById('enemy-robot-2');
    if (e2El) {
      var e2RenderY = groundY - robotSize - enemy2Y;
      var e2Facing = playerX < enemy2X ? -1 : 1;
      e2El.style.transform = 'translate3d(' + enemy2X + 'px, ' + e2RenderY + 'px, 0)';
      var e2Sprite = e2El.querySelector('.robot-sprite');
      e2Sprite.style.transform = e2Facing < 0 ? 'scaleX(-1)' : 'scaleX(1)';

      var e2SwordIcon = document.getElementById('enemy-sword-icon-2');
      if (e2SwordIcon) {
        if (e2Facing < 0) {
          e2SwordIcon.style.left = '-0.8em';
          e2SwordIcon.style.right = '';
        } else {
          e2SwordIcon.style.right = '-0.8em';
          e2SwordIcon.style.left = '';
        }
        if (enemy2Attacking || enemy2State === 'attack') {
          var e2Progress = 1 - enemy2StateTimer / 0.3;
          var e2SwingDir = e2Facing < 0 ? -1 : 1;
          var e2Angle = e2SwingDir * e2Progress * 90;
          e2SwordIcon.style.transform = 'rotate(' + e2Angle + 'deg)';
        } else if (enemy2State === 'telegraph') {
          e2SwordIcon.style.transform = 'rotate(0deg)';
        } else {
          e2SwordIcon.style.transform = 'rotate(0deg)';
        }
      }

      e2Sprite.style.filter = 'hue-rotate(' + ENEMY_HUES[(currentRound + 2) % 4] + 'deg)';

      if (enemy2Invincible > 0) {
        e2El.classList.add('invincible');
      } else {
        e2El.classList.remove('invincible');
      }
    }
  }

  // HUD health bars
  playerHpHearts.textContent = renderHearts(playerHP, playerMaxHP);
  enemyHpHearts.textContent = renderHearts(enemyHP, enemyMaxHP);
  var resistEmoji = { fire: '🛡️🔥', lightning: '🛡️⚡', ice: '🛡️❄️' };
  enemyResistHud.textContent = resistEmoji[enemyResist] || '';
  playerResistHud.textContent = resistEmoji[playerResist] || '';

  // Status effect icons (compact, single line above enemy)
  if (statusFloatsContainer) {
    statusFloatsContainer.innerHTML = '';
    var icons = [];

    if (burnTimer > 0) icons.push({ text: '🔥', color: '#FF6600' });
    if (shockActive) icons.push({ text: '⚡', color: '#FFD700' });
    if (freezeBuildup > 0) icons.push({ text: '❄️' + freezeBuildup + '%', color: '#64C8FF' });
    if (frozenTimer > 0) icons.push({ text: '🧊', color: '#00CCFF' });
    if (guardActive && guardHitsLeft > 0) icons.push({ text: '🛡️' + guardHitsLeft, color: '#8888FF' });
    if (guardVulnTimer > 0) icons.push({ text: '💥', color: '#FF4444' });

    if (icons.length > 0) {
      var row = document.createElement('div');
      row.className = 'status-float';
      row.style.left = enemyX + 'px';
      row.style.top = (enemyRenderY - 40) + 'px';
      row.style.display = 'flex';
      row.style.gap = '3px';
      icons.forEach(function(icon) {
        var span = document.createElement('span');
        span.textContent = icon.text;
        span.style.color = icon.color;
        row.appendChild(span);
      });
      statusFloatsContainer.appendChild(row);
    }

    // Player status icons
    var pIcons = [];
    if (playerBurnTimer > 0) pIcons.push({ text: '\uD83D\uDD25', color: '#FF6600' });
    if (playerShockActive) pIcons.push({ text: '\u26A1', color: '#FFD700' });
    if (playerFreezeBuildup > 0) pIcons.push({ text: '\u2744\uFE0F' + playerFreezeBuildup + '%', color: '#64C8FF' });
    if (playerFrozenTimer > 0) pIcons.push({ text: '\uD83E\uDDCA', color: '#00CCFF' });

    if (pIcons.length > 0) {
      var pRow = document.createElement('div');
      pRow.className = 'status-float';
      pRow.style.left = playerX + 'px';
      pRow.style.top = (playerRenderY - 40) + 'px';
      pRow.style.display = 'flex';
      pRow.style.gap = '3px';
      pIcons.forEach(function(icon) {
        var span = document.createElement('span');
        span.textContent = icon.text;
        span.style.color = icon.color;
        pRow.appendChild(span);
      });
      statusFloatsContainer.appendChild(pRow);
    }
  }

  // Arena lighting - dynamic radial gradient between fighters
  var midX = (playerX + enemyX) / 2;
  var midY = (playerRenderY + enemyRenderY) / 2;
  arenaLighting.style.background = 'radial-gradient(ellipse 400px 300px at ' + midX + 'px ' + midY + 'px, rgba(255,150,50,0.08) 0%, transparent 100%)';
}

// ============================================================
// WALL TORCHES (decorative)
// ============================================================
function spawnWallTorches() {
  document.querySelectorAll('.wall-torch').forEach(function(t) { t.remove(); });
  calcLayout();
  var spacing = 180;
  var count = Math.ceil(arenaW / spacing);
  for (var i = 0; i < count; i++) {
    var torch = document.createElement('div');
    torch.className = 'wall-torch';
    torch.textContent = '🔥';
    torch.style.transform = 'translate3d(' + (i * spacing + 40) + 'px, ' + (arenaH * 0.15 + 10) + 'px, 0)';
    arena.appendChild(torch);
  }
}

// ============================================================
// INIT
// ============================================================
function init() {
  calcLayout();
  spawnWallTorches();
  window.addEventListener('resize', function() {
    calcLayout();
    spawnWallTorches();
  });
}

init();
