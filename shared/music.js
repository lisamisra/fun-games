// Shared music factory
// Exports: window.createMusic = function(config) -> { start, stop, isPlaying }
//
// config: {
//   bpm: number,
//   gain: number (master volume, e.g. 0.10),
//   melody: number[] (16th/8th note frequencies, 0 = rest),
//   bass: number[] (bass frequencies),
//   melodyType: string ('square'|'sawtooth'|'triangle'|'sine'),
//   bassType: string,
//   noteInterval: 'sixteenth' | 'eighth' (default 'eighth'),
//   hasSnare: boolean (adds snare on beats 2 & 4)
// }

(function() {
  window.createMusic = function(config) {
    var musicPlaying = false;
    var musicInterval = null;
    var musicGain = null;

    function start(isMuted) {
      if (musicPlaying || isMuted) return;
      var ctx = SharedAudio.getAudioCtx();
      musicPlaying = true;

      musicGain = ctx.createGain();
      musicGain.gain.value = config.gain || 0.10;
      musicGain.connect(ctx.destination);

      var BPM = config.bpm || 140;
      var interval;
      if (config.noteInterval === 'sixteenth') {
        interval = 60 / BPM / 4;
      } else {
        interval = 60 / BPM / 2;
      }
      var nextTime = ctx.currentTime + 0.05;
      var step = 0;

      var melody = config.melody || [];
      var bass = config.bass || [];
      var melodyType = config.melodyType || 'sawtooth';
      var bassType = config.bassType || 'square';

      function playNote(freq, time, dur, type, dest) {
        if (!freq) return;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(config.noteGain || 0.4, time);
        g.gain.exponentialRampToValueAtTime(0.01, time + dur);
        osc.connect(g);
        g.connect(dest);
        osc.start(time);
        osc.stop(time + dur + 0.01);
      }

      function playKick(time) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(config.kickFreq || 120, time);
        osc.frequency.exponentialRampToValueAtTime(config.kickEnd || 25, time + 0.15);
        g.gain.setValueAtTime(config.kickGain || 0.6, time);
        g.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(time);
        osc.stop(time + 0.21);
      }

      function playSnare(time) {
        var bufSize = Math.floor(ctx.sampleRate * 0.08);
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;
        var g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(hp);
        hp.connect(g);
        g.connect(musicGain);
        src.start(time);
      }

      function playHat(time, loud) {
        var hatDur = config.hatDuration || 0.03;
        var bufSize = Math.floor(ctx.sampleRate * hatDur);
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 9000;
        var g = ctx.createGain();
        g.gain.value = loud ? (config.hatLoud || 0.4) : (config.hatSoft || 0.2);
        src.connect(hp);
        hp.connect(g);
        g.connect(musicGain);
        src.start(time);
      }

      function scheduler() {
        if (!musicPlaying) return;
        while (nextTime < ctx.currentTime + 0.25) {
          var mIdx = step % melody.length;
          var bIdx = Math.floor(step / 2) % bass.length;

          // Melody
          playNote(melody[mIdx], nextTime, interval * 1.5, melodyType, musicGain);

          // Bass (every other step)
          if (step % 2 === 0) {
            playNote(bass[bIdx], nextTime, interval * 3, bassType, musicGain);
          }

          // Kick on beats 1 and 3
          if (step % 8 === 0 || step % 8 === 4) {
            playKick(nextTime);
          }

          // Snare on beats 2 and 4 (if enabled)
          if (config.hasSnare && (step % 8 === 2 || step % 8 === 6)) {
            playSnare(nextTime);
          }

          // Hi-hat on every 8th
          if (step % 2 === 0) {
            playHat(nextTime, step % 4 === 2);
          }

          step++;
          nextTime += interval;
        }
      }

      scheduler();
      musicInterval = setInterval(scheduler, 100);
    }

    function stop() {
      musicPlaying = false;
      if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
      }
      if (musicGain) {
        var g = musicGain;
        musicGain = null;
        try {
          g.gain.exponentialRampToValueAtTime(0.001, SharedAudio.getAudioCtx().currentTime + 0.3);
          setTimeout(function() { try { g.disconnect(); } catch(e) {} }, 400);
        } catch(e) {}
      }
    }

    return {
      start: start,
      stop: stop,
      get isPlaying() { return musicPlaying; }
    };
  };
})();
