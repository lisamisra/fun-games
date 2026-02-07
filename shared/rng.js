// Shared seeded RNG module
// Exports: window.SharedRNG = { mulberry32, dateSeed, getTodayStr }

(function() {
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function dateSeed(dateStr, difficulty, salt) {
    var h = 0;
    var s = dateStr + ':' + (salt ? salt + ':' : '') + difficulty;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return h;
  }

  function getTodayStr() {
    var d = new Date();
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  window.SharedRNG = { mulberry32: mulberry32, dateSeed: dateSeed, getTodayStr: getTodayStr };
})();
