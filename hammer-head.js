// ============================================================
// Hammer Head - Game Logic
// Uses: SharedRNG, SharedAudio, createMusic
// ============================================================

// --- Constants ---
var MAX_HP = 10;

// --- Seeded RNG ---
var rng = null;
var todayStr = SharedRNG.getTodayStr();
document.getElementById('daily-seed').textContent = 'Daily Seed: ' + todayStr;

// --- Difficulty presets ---
var DIFFICULTY = {
  easy:   { visibleMin: 1800, visibleRange: 700, gapMin: 1000, gapRange: 1200, missHeal: 0,
            missPenalty: 25, grass: ['#87CEEB', '#7EC850', '#5DA832'], label: 'Easy' },
  normal: { visibleMin: 1300, visibleRange: 500, gapMin: 800,  gapRange: 1000, missHeal: 2,
            missPenalty: 50, grass: ['#87CEEB', '#C8B850', '#8B7D28'], label: 'Normal' },
  hard:   { visibleMin: 850,  visibleRange: 300, gapMin: 400,  gapRange: 600,  missHeal: MAX_HP,
            missPenalty: 75, grass: ['#8B9EAB', '#A85A50', '#6B3028'], label: 'Hard', gnomesPerRound: 1 },
  achal:  { visibleMin: 1500, visibleRange: 500, gapMin: 600,  gapRange: 800,  missHeal: MAX_HP,
            missPenalty: 100, grass: ['#FF69B4', '#9B59B6', '#6C3483'], label: 'Achal Anna', gnomesPerRound: 2 },
};
var currentDifficulty = DIFFICULTY.normal;

// --- Responsive hole sizing ---
function getHoleParams() {
  var w = window.innerWidth;
  var h = window.innerHeight;
  var small = w < 500 || h < 700;
  return {
    count: small ? 6 : 9,
    width: small ? 120 : 160,
    height: small ? 100 : 130,
    minDist: small ? 130 : 170,
  };
}

// --- Game state ---
var score = 0;
var hits = 0;
var misses = 0;
var combo = 0;
var gnomeHP = MAX_HP;
var activeHoles = [];
var roundHitsCount = 0;
var gnomeVisible = false;
var gnomeAppearedAt = 0;
var gnomeTimeout = null;
var popInterval = null;
var relocateTimeout = null;
var gameRunning = false;
var gameStartTime = 0;
var elapsedTime = 0;
var timerInterval = null;

// --- Charge (wind-up hold) state ---
var chargeTarget = null;
var chargeStartTime = 0;
var chargeIsTouch = false;
var CHARGE_MS_TOUCH = 300;
var CHARGE_MS_MOUSE = 100;

// --- DOM refs ---
var hammer = document.getElementById('hammer');
var field = document.getElementById('field');
var gameScreen = document.getElementById('game-screen');
var titleScreen = document.getElementById('title-screen');
var gameOver = document.getElementById('game-over');
var scoreDisplay = document.getElementById('score-display');
var healthBar = document.getElementById('health-bar');
var healthText = document.getElementById('health-text');
var muteBtn = document.getElementById('mute-btn');
var timerDisplay = document.getElementById('timer-display');
var comboDisplay = document.getElementById('combo-display');

// --- Mute (using shared audio) ---
var muteState = SharedAudio.initMute(muteBtn, function(isMuted) {
  if (isMuted) { music.stop(); }
  else if (gameRunning) { music.start(false); }
});

function toggleMute() { muteState.toggle(); }

// --- Music (using shared music factory) ---
var music = createMusic({
  bpm: 150,
  gain: 0.12,
  noteInterval: 'sixteenth',
  melody: [
    523, 0, 659, 0, 784, 0, 659, 523,
    587, 0, 784, 0, 880, 784, 659, 0,
    523, 0, 659, 784, 880, 0, 1047, 880,
    784, 0, 659, 0, 523, 440, 523, 0,
  ],
  bass: [
    131, 131, 131, 196, 147, 147, 147, 196,
    165, 165, 165, 220, 196, 196, 131, 131,
  ],
  melodyType: 'square',
  bassType: 'sawtooth',
  noteGain: 0.5,
  kickFreq: 150,
  kickEnd: 30,
  kickGain: 0.7,
  hatDuration: 0.04,
  hatLoud: 0.5,
  hatSoft: 0.25,
  hasSnare: false
});

// --- Generate random non-overlapping hole positions ---
function generateHolePositions(params) {
  var padding = params.width < 140 ? 40 : 80;
  var topPadding = params.width < 140 ? 70 : 100;
  var maxW = window.innerWidth - params.width - padding;
  var maxH = window.innerHeight - params.height - padding;
  var positions = [];
  var attempts = 0;

  while (positions.length < params.count && attempts < 2000) {
    attempts++;
    var rand = rng || Math.random;
    var x = padding + rand() * (maxW - padding);
    var y = topPadding + rand() * (maxH - topPadding);

    var tooClose = false;
    for (var p = 0; p < positions.length; p++) {
      var dx = positions[p].x - x;
      var dy = positions[p].y - y;
      if (Math.sqrt(dx * dx + dy * dy) < params.minDist) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) positions.push({ x: x, y: y });
  }
  return positions;
}

// --- Build holes ---
var holes = [];
function buildField() {
  field.innerHTML = '';
  holes = [];
  var params = getHoleParams();
  var positions = generateHolePositions(params);

  for (var i = 0; i < positions.length; i++) {
    var hole = document.createElement('div');
    hole.className = 'hole';
    hole.style.left = positions[i].x + 'px';
    hole.style.top = positions[i].y + 'px';
    hole.style.width = params.width + 'px';
    hole.style.height = params.height + 'px';
    hole.innerHTML =
      '<div class="speech-bubble"></div>' +
      '<div class="hole-clip">' +
        '<div class="gnome-container" data-index="' + i + '">' +
          '<div class="gnome">\uD83E\uDDD9\u200D\u2642\uFE0F</div>' +
        '</div>' +
      '</div>' +
      '<div class="hole-dark"></div>' +
      '<div class="hole-mound"></div>';
    field.appendChild(hole);
    holes.push(hole);
  }
}

// --- Input handling (mouse + touch) ---
var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
var tapHammerTimeout = null;

if (hasTouch && !window.matchMedia('(pointer: fine)').matches) {
  hammer.classList.add('hidden');
}

document.addEventListener('mousemove', function(e) {
  if (!hammer.classList.contains('hidden')) {
    hammer.style.left = e.clientX + 'px';
    hammer.style.top = e.clientY + 'px';
  }
  if (chargeTarget) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.closest('.gnome-container') || el.closest('.gnome-container') !== chargeTarget) {
      cancelCharge();
    }
  }
});

document.addEventListener('mousedown', function(e) {
  if (!hammer.classList.contains('hidden')) {
    hammer.classList.add('smash');
  }
  if (gameRunning) handlePress(e.clientX, e.clientY, e.target, false);
});

document.addEventListener('mouseup', function(e) {
  hammer.classList.remove('smash');
  if (gameRunning) handleRelease(e.clientX, e.clientY);
});

document.addEventListener('touchstart', function(e) {
  var touch = e.touches[0];
  var target = document.elementFromPoint(touch.clientX, touch.clientY);
  if (gameRunning && target && !target.closest('#hud')) {
    e.preventDefault();
  }
  showTapFlash(touch.clientX, touch.clientY);
  if (gameRunning) handlePress(touch.clientX, touch.clientY, target, true);
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (!gameRunning) return;
  var touch = e.changedTouches[0];
  handleRelease(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  if (gameRunning) e.preventDefault();
  if (chargeTarget) {
    var touch = e.touches[0];
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el || !el.closest('.gnome-container') || el.closest('.gnome-container') !== chargeTarget) {
      cancelCharge();
    }
  }
}, { passive: false });

function showTapFlash(x, y) {
  var h = document.createElement('div');
  h.className = 'tap-hammer';
  h.textContent = '\uD83D\uDD28';
  h.style.left = x + 'px';
  h.style.top = y + 'px';
  document.body.appendChild(h);
  setTimeout(function() { h.remove(); }, 300);
}

// --- Sound effects ---
function playPfffft() {
  var ctx = SharedAudio.getAudioCtx();
  var duration = 0.3;
  var bufSize = ctx.sampleRate * duration;
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) {
    var t = i / bufSize;
    var envelope = (1 - t) * Math.pow(1 - t, 2);
    data[i] = (Math.random() * 2 - 1) * envelope * 0.4;
  }
  var src = ctx.createBufferSource();
  src.buffer = buf;
  var filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 300;
  filter.Q.value = 2;
  var gain = ctx.createGain();
  gain.gain.value = 0.6;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function playOuch() {
  var ctx = SharedAudio.getAudioCtx();
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
}

function playLol() {
  var ctx = SharedAudio.getAudioCtx();
  var notes = [400, 600, 800];
  notes.forEach(function(freq, i) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    var start = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.12);
  });
}

function playOhNo() {
  var ctx = SharedAudio.getAudioCtx();
  var notes = [500, 300];
  notes.forEach(function(freq, i) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    var start = ctx.currentTime + i * 0.25;
    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.35);
  });
}

function playSparkle() {
  var ctx = SharedAudio.getAudioCtx();
  var notes = [1047, 1319, 1568, 2093];
  notes.forEach(function(freq, i) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    var start = ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

function speak(text) {
  if (muteState.muted) return;
  switch (text) {
    case 'pfffft': playPfffft(); break;
    case 'ouuuuch': playOuch(); break;
    case 'lol': playLol(); break;
    case 'oh no!': playOhNo(); break;
    case 'sparkle': playSparkle(); break;
  }
}

// --- Show speech bubble ---
function showBubble(holeIndex, text, duration) {
  if (duration === undefined) duration = 800;
  var bubble = holes[holeIndex].querySelector('.speech-bubble');
  bubble.textContent = text;
  bubble.classList.add('show');
  setTimeout(function() { bubble.classList.remove('show'); }, duration);
}

// --- Golden gnome state ---
var goldenActive = false;

// --- Spawn gnome(s) at random hole(s) ---
function spawnGnome() {
  if (!gameRunning) return;

  var count = currentDifficulty.gnomesPerRound || 1;
  activeHoles = [];
  roundHitsCount = 0;
  gnomeVisible = true;
  gnomeAppearedAt = Date.now();

  var forceGolden = new URLSearchParams(window.location.search).get('golden') === 'true';
  var isHardPlus = currentDifficulty === DIFFICULTY.hard || currentDifficulty === DIFFICULTY.achal;
  goldenActive = forceGolden || (isHardPlus && rng() < 0.12);

  var spawnCount = goldenActive ? 1 : count;
  var available = [];
  for (var i = 0; i < holes.length; i++) available.push(i);
  for (var j = 0; j < spawnCount && available.length > 0; j++) {
    var pick = Math.floor(rng() * available.length);
    var holeIdx = available.splice(pick, 1)[0];
    activeHoles.push(holeIdx);

    var container = holes[holeIdx].querySelector('.gnome-container');
    container.classList.remove('hit', 'golden');
    if (goldenActive) container.classList.add('golden');
    container.classList.add('visible');
    showBubble(holeIdx, goldenActive ? '\u2728' : 'pfffft!');
  }
  speak(goldenActive ? 'sparkle' : 'pfffft');

  var hpRatio = gnomeHP / MAX_HP;
  var hpScale = (currentDifficulty.gnomesPerRound || 1) > 1 ? (0.4 + 0.6 * hpRatio) : 1;
  var visibleTime = (currentDifficulty.visibleMin + rng() * currentDifficulty.visibleRange) * hpScale;
  gnomeTimeout = setTimeout(function() {
    if (gnomeVisible && gameRunning) gnomeEscaped();
  }, visibleTime);

  var nextDelay = currentDifficulty.gapMin + rng() * currentDifficulty.gapRange;
  popInterval = setTimeout(spawnGnome, visibleTime + nextDelay);

  if ((currentDifficulty.gnomesPerRound || 1) > 1 && gnomeHP < 4) {
    var relocateDelay = visibleTime * 0.5;
    relocateTimeout = setTimeout(function() {
      if (!gnomeVisible || !gameRunning) return;
      var stillVisible = activeHoles.filter(function(idx) {
        return holes[idx].querySelector('.gnome-container').classList.contains('visible');
      });
      if (stillVisible.length === 0) return;

      var victim = stillVisible[Math.floor(rng() * stillVisible.length)];
      var victimContainer = holes[victim].querySelector('.gnome-container');
      if (chargeTarget === victimContainer) cancelCharge();
      victimContainer.classList.remove('visible');

      var freeHoles = [];
      for (var i = 0; i < holes.length; i++) {
        if (activeHoles.indexOf(i) === -1) freeHoles.push(i);
      }
      if (freeHoles.length === 0) return;

      var newIdx = freeHoles[Math.floor(rng() * freeHoles.length)];
      activeHoles[activeHoles.indexOf(victim)] = newIdx;

      var newContainer = holes[newIdx].querySelector('.gnome-container');
      newContainer.classList.remove('hit');
      newContainer.classList.add('visible');
      showBubble(newIdx, '\uD83D\uDE08', 600);
      speak('lol');

      clearTimeout(gnomeTimeout);
      var halfTime = visibleTime / 2;
      gnomeTimeout = setTimeout(function() {
        if (gnomeVisible && gameRunning) gnomeEscaped();
      }, halfTime);

      clearTimeout(popInterval);
      popInterval = setTimeout(spawnGnome, halfTime + nextDelay);
    }, relocateDelay);
  }
}

// --- Gnome(s) escape ---
function gnomeEscaped() {
  if (goldenActive) {
    hideAllGnomes();
    return;
  }
  for (var i = 0; i < activeHoles.length; i++) {
    var container = holes[activeHoles[i]].querySelector('.gnome-container');
    if (container.classList.contains('visible')) {
      showBubble(activeHoles[i], 'lol \uD83D\uDE02', 900);
    }
  }
  hideAllGnomes();
  misses++;
  combo = 0;
  updateCombo();
  applyMissPenalty();
  healGnomeOnMiss();
  setTimeout(function() { speak('lol'); }, 150);
}

// --- Hide all active gnomes ---
function hideAllGnomes() {
  for (var i = 0; i < activeHoles.length; i++) {
    var container = holes[activeHoles[i]].querySelector('.gnome-container');
    if (chargeTarget === container) cancelCharge();
    container.classList.remove('visible', 'golden');
  }
  gnomeVisible = false;
  goldenActive = false;
}

// --- Heal gnome on miss ---
function healGnomeOnMiss() {
  var heal = currentDifficulty.missHeal;
  if (heal <= 0) return;
  var before = gnomeHP;
  gnomeHP = Math.min(MAX_HP, gnomeHP + heal);
  if (gnomeHP !== before) updateHUD();
}

// --- Cancel active charge ---
function cancelCharge() {
  if (!chargeTarget) return;
  chargeTarget.classList.remove('charging');
  chargeTarget = null;
  chargeStartTime = 0;
}

// --- Handle press (mousedown / touchstart) ---
function handlePress(x, y, target, isTouch) {
  if (!target) return;
  if (target.closest('#hud')) return;

  var clickedGnome = target.closest('.gnome-container.visible');

  if (clickedGnome) {
    var idx = parseInt(clickedGnome.dataset.index);
    if (activeHoles.indexOf(idx) === -1) return;

    cancelCharge();
    chargeTarget = clickedGnome;
    chargeStartTime = Date.now();
    chargeIsTouch = isTouch;

    var durationMs = isTouch ? CHARGE_MS_TOUCH : CHARGE_MS_MOUSE;
    clickedGnome.style.setProperty('--charge-duration', durationMs + 'ms');
    clickedGnome.classList.add('charging');
  } else if (gnomeVisible) {
    cancelCharge();
    clearTimeout(gnomeTimeout);
    clearTimeout(relocateTimeout);
    misses++;
    combo = 0;
    updateCombo();
    healGnomeOnMiss();

    for (var i = 0; i < activeHoles.length; i++) {
      var container = holes[activeHoles[i]].querySelector('.gnome-container');
      if (container.classList.contains('visible')) {
        showBubble(activeHoles[i], 'lol \uD83D\uDE02', 900);
      }
    }
    hideAllGnomes();
    applyMissPenalty(x, y);
    showMissBubble(x, y);
    shakeScreen();
    setTimeout(function() { speak('lol'); }, 100);
  }
}

// --- Handle release (mouseup / touchend) ---
function handleRelease(x, y) {
  if (!chargeTarget) return;

  var target = chargeTarget;
  var elapsed = Date.now() - chargeStartTime;
  var required = chargeIsTouch ? CHARGE_MS_TOUCH : CHARGE_MS_MOUSE;

  target.classList.remove('charging');
  chargeTarget = null;
  chargeStartTime = 0;

  if (!target.classList.contains('visible')) return;

  var idx = parseInt(target.dataset.index);
  if (activeHoles.indexOf(idx) === -1) return;

  if (elapsed >= required) {
    processHit(target, idx, x, y);
  } else {
    misses++;
    combo = 0;
    updateCombo();
    healGnomeOnMiss();
    showMissBubble(x, y);
    applyMissPenalty(x, y);
    showBubble(idx, 'too fast! \uD83D\uDE0F', 900);
    shakeScreen();
    setTimeout(function() { speak('lol'); }, 100);
  }
}

// --- Process a successful hit on a gnome ---
function processHit(clickedGnome, idx, x, y) {
  clickedGnome.classList.remove('charging');

  if (goldenActive) {
    clickedGnome.classList.add('hit');
    showBubble(idx, 'lol \uD83D\uDE02 SHUFFLE!', 1200);
    speak('lol');
    shakeScreen();

    combo = 0;
    updateCombo();

    clearTimeout(gnomeTimeout);
    clearTimeout(relocateTimeout);
    clearTimeout(popInterval);
    gnomeVisible = false;
    goldenActive = false;
    updateHUD();

    setTimeout(function() {
      if (!gameRunning) return;
      buildField();
      shakeScreen();
      var nextDelay = currentDifficulty.gapMin + rng() * currentDifficulty.gapRange;
      popInterval = setTimeout(spawnGnome, nextDelay);
    }, 500);
    return;
  }

  var reactionMs = Date.now() - gnomeAppearedAt;
  var maxWindow = currentDifficulty.visibleMin + currentDifficulty.visibleRange;
  var speedFactor = Math.max(0, 1 - reactionMs / maxWindow);
  var basePoints = Math.ceil(10 + 90 * speedFactor);

  combo++;
  var comboMultiplier = Math.min(combo, 5);
  var hitPoints = basePoints * comboMultiplier;

  score += hitPoints;
  hits++;
  roundHitsCount++;

  clickedGnome.classList.add('hit');
  showBubble(idx, 'ouuuuch! \uD83D\uDE35', 900);
  speak('ouuuuch');
  spawnStars(x, y);
  showScorePopup(x, y, hitPoints, comboMultiplier);

  setTimeout(function() {
    clickedGnome.classList.remove('visible', 'hit');
  }, 300);

  var gnomesNeeded = currentDifficulty.gnomesPerRound || 1;

  if (roundHitsCount >= gnomesNeeded) {
    clearTimeout(gnomeTimeout);
    clearTimeout(relocateTimeout);
    gnomeHP--;
    gnomeVisible = false;
    updateHUD();
    updateCombo();

    if (gnomeHP <= 0) {
      endGame();
    }
  } else {
    updateHUD();
    updateCombo();
  }
}

// --- HUD update ---
function updateHUD() {
  scoreDisplay.textContent = 'Score: ' + score;
  var pct = (gnomeHP / MAX_HP) * 100;
  healthBar.style.width = pct + '%';
  healthText.textContent = gnomeHP + '/' + MAX_HP;

  if (pct <= 30) {
    healthBar.style.background = 'linear-gradient(90deg, #FF0000, #FF4444)';
  } else if (pct <= 60) {
    healthBar.style.background = 'linear-gradient(90deg, #FF8800, #FFAA44)';
  } else {
    healthBar.style.background = 'linear-gradient(90deg, #FF4444, #FF6666)';
  }
}

// --- Score popup at hit location ---
function showScorePopup(x, y, points, comboMult) {
  var popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = '+' + points + (comboMult > 1 ? ' x' + comboMult : '');
  popup.style.left = (x + 20) + 'px';
  popup.style.top = (y - 20) + 'px';
  document.body.appendChild(popup);
  setTimeout(function() { popup.remove(); }, 800);
}

// --- Apply miss penalty ---
function applyMissPenalty(x, y) {
  var penalty = currentDifficulty.missPenalty || 0;
  if (penalty <= 0) return;
  score = Math.max(0, score - penalty);
  var popup = document.createElement('div');
  popup.className = 'score-popup penalty';
  popup.textContent = '-' + penalty;
  popup.style.left = (x || window.innerWidth / 2) + 'px';
  popup.style.top = (y || window.innerHeight / 2) + 'px';
  document.body.appendChild(popup);
  setTimeout(function() { popup.remove(); }, 800);
  updateHUD();
}

// --- Combo display ---
function updateCombo() {
  if (combo > 1) {
    comboDisplay.textContent = 'x' + Math.min(combo, 5) + ' combo' + (combo >= 5 ? ' MAX' : '');
    comboDisplay.classList.add('active');
  } else {
    comboDisplay.classList.remove('active');
  }
}

// --- Timer ---
function formatTime(ms) {
  var totalSec = Math.floor(ms / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  var tenths = Math.floor((ms % 1000) / 100);
  return min + ':' + sec.toString().padStart(2, '0') + '.' + tenths;
}

function startTimer() {
  gameStartTime = Date.now();
  timerInterval = setInterval(function() {
    elapsedTime = Date.now() - gameStartTime;
    timerDisplay.textContent = formatTime(elapsedTime);
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  elapsedTime = Date.now() - gameStartTime;
}

// --- Spawn stars at hit location ---
function spawnStars(x, y) {
  var emojis = ['\u2B50', '\uD83D\uDCA5', '\u2728', '\uD83C\uDF1F'];
  for (var i = 0; i < 6; i++) {
    var star = document.createElement('div');
    star.className = 'star';
    star.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    star.style.left = x + 'px';
    star.style.top = y + 'px';
    var angle = (Math.PI * 2 * i) / 6;
    var dist = 40 + Math.random() * 50;
    var dx = Math.cos(angle) * dist;
    var dy = Math.sin(angle) * dist;
    star.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.3)', opacity: 0 }
    ], { duration: 500, easing: 'ease-out' });
    document.body.appendChild(star);
    (function(s) { setTimeout(function() { s.remove(); }, 600); })(star);
  }
}

// --- Miss bubble at click location ---
function showMissBubble(x, y) {
  var bubble = document.createElement('div');
  bubble.className = 'miss-bubble';
  bubble.textContent = 'Miss!';
  bubble.style.left = x + 'px';
  bubble.style.top = y + 'px';
  document.body.appendChild(bubble);
  setTimeout(function() { bubble.remove(); }, 1000);
}

// --- Screen shake ---
function shakeScreen() {
  gameScreen.classList.remove('shake');
  void gameScreen.offsetWidth;
  gameScreen.classList.add('shake');
  setTimeout(function() { gameScreen.classList.remove('shake'); }, 300);
}

// --- Stop all timers ---
function stopTimers() {
  clearTimeout(gnomeTimeout);
  clearTimeout(popInterval);
  clearTimeout(relocateTimeout);
  gnomeTimeout = null;
  popInterval = null;
  relocateTimeout = null;
  stopTimer();
}

// --- Start game ---
var lastDifficulty = 'normal';
function startGame(difficulty) {
  if (difficulty) lastDifficulty = difficulty;
  currentDifficulty = DIFFICULTY[lastDifficulty];

  score = 0;
  hits = 0;
  misses = 0;
  combo = 0;
  gnomeHP = MAX_HP;
  activeHoles = [];
  roundHitsCount = 0;
  gnomeVisible = false;
  cancelCharge();
  rng = SharedRNG.mulberry32(SharedRNG.dateSeed(todayStr, lastDifficulty));
  gameRunning = true;

  var g = currentDifficulty.grass;
  gameScreen.style.background = 'linear-gradient(180deg, ' + g[0] + ' 0%, ' + g[1] + ' 40%, ' + g[2] + ' 100%)';

  buildField();
  updateHUD();
  updateCombo();
  timerDisplay.textContent = '0:00.0';
  titleScreen.classList.add('hidden');
  gameScreen.classList.add('active');
  gameOver.classList.remove('active');

  startTimer();
  music.start(muteState.muted);
  setTimeout(spawnGnome, 1000);
}

// --- Quit game (back to title) ---
function quitGame() {
  gameRunning = false;
  cancelCharge();
  stopTimers();
  music.stop();
  gnomeVisible = false;

  document.querySelectorAll('.gnome-container').forEach(function(c) {
    c.classList.remove('visible', 'hit', 'charging', 'golden');
  });

  gameScreen.classList.remove('active');
  titleScreen.classList.remove('hidden');
}

// --- End game ---
function endGame() {
  gameRunning = false;
  cancelCharge();
  stopTimers();
  music.stop();
  gnomeVisible = false;

  document.querySelectorAll('.gnome-container').forEach(function(c) {
    c.classList.remove('visible', 'hit', 'charging', 'golden');
  });

  setTimeout(function() {
    var accuracy = hits > 0 ? Math.round(hits / (hits + misses) * 100) : 0;
    var elapsedSec = elapsedTime / 1000;
    var timeBonus = Math.max(0, Math.floor(2000 - elapsedSec * 20));
    var finalScore = score + timeBonus;
    document.getElementById('final-difficulty').textContent = currentDifficulty.label + ' Mode';
    document.getElementById('final-time').textContent = 'Time: ' + formatTime(elapsedTime);
    document.getElementById('final-score').textContent = 'Final Score: ' + finalScore;
    document.getElementById('final-bonus').textContent =
      'Hit points: ' + score + '  +  Time bonus: ' + timeBonus;
    document.getElementById('final-detail').textContent =
      hits + ' hits, ' + misses + ' misses  |  Accuracy: ' + accuracy + '%';
    document.getElementById('final-seed').textContent = 'Daily Seed: ' + todayStr;
    gameOver.classList.add('active');
    speak('oh no!');
  }, 500);
}

// --- Restart ---
function restartGame() {
  gameOver.classList.remove('active');
  startGame();
}
