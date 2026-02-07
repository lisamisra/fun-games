// Shared audio module
// Exports: window.SharedAudio = { getAudioCtx, unlockAudio, isMuted, setMuted, initMute }

(function() {
  var audioCtx = null;
  var MUTE_KEY = 'fun-games-muted';

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function unlockAudio() {
    var ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    var buf = ctx.createBuffer(1, 1, 22050);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  // Auto-unlock on first user gesture
  document.addEventListener('touchstart', unlockAudio, { once: true });
  document.addEventListener('click', unlockAudio, { once: true });

  function isMuted() {
    return localStorage.getItem(MUTE_KEY) === 'true';
  }

  function setMuted(val) {
    localStorage.setItem(MUTE_KEY, val);
  }

  // initMute(muteBtn, onMuteChange) — sets up mute button + returns { muted, toggle }
  function initMute(muteBtn, onMuteChange) {
    var muted = isMuted();

    function updateBtn() {
      muteBtn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    }

    function toggle() {
      muted = !muted;
      setMuted(muted);
      updateBtn();
      if (onMuteChange) onMuteChange(muted);
    }

    updateBtn();

    return {
      get muted() { return muted; },
      toggle: toggle
    };
  }

  window.SharedAudio = {
    getAudioCtx: getAudioCtx,
    unlockAudio: unlockAudio,
    isMuted: isMuted,
    setMuted: setMuted,
    initMute: initMute
  };
})();
