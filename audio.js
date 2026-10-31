/* ─────────────────────────────────────────────────────────
   Meadow audio
   A generative ambient pad that cycles five chords, slowly,
   over a looping field recording. Nothing here is a sample
   except the ambience; the chords are synthesised live.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const CHORDS = [
    // D major, lush voicings. Frequencies in Hz.
    { name: 'Dmaj9',  notes: [73.42, 110.00, 185.00, 277.18, 329.63] }, // D2 A2 F#3 C#4 E4
    { name: 'Bm11',   notes: [61.74, 92.50, 146.83, 220.00, 329.63] },  // B1 F#2 D3 A3 E4
    { name: 'Gmaj9',  notes: [49.00, 98.00, 146.83, 246.94, 329.63] },  // G1 G2 D3 B3 E4
    { name: 'Aadd9',  notes: [55.00, 82.41, 138.59, 220.00, 246.94] },  // A1 E2 C#3 A3 B3
    { name: 'F#m11',  notes: [46.25, 92.50, 138.59, 220.00, 246.94] },  // F#1 F#2 C#3 A3 B3
  ];
  const PENTA = [587.33, 659.25, 739.99, 880.00, 987.77, 1174.66]; // D E F# A B D, sparkle notes
  const CHORD_SECONDS = 11;

  let ctx, master, padBus, fxBus, reverb, ambience, ambienceGain;
  let running = false, muted = false, chordIndex = 0, timer = null, sparkleTimer = null;
  let voices = [];

  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = impulse(4.2, 2.6);
    fxBus = ctx.createGain(); fxBus.gain.value = 0.55;
    reverb.connect(fxBus); fxBus.connect(master);

    padBus = ctx.createGain(); padBus.gain.value = 0.22;
    const padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1400; padLP.Q.value = 0.4;
    padBus.connect(padLP); padLP.connect(master); padLP.connect(reverb);

    // Field recording, looped under the pads
    ambience = new Audio('/assets/ambience.mp3');
    ambience.loop = true; ambience.crossOrigin = 'anonymous'; ambience.preload = 'auto';
    const src = ctx.createMediaElementSource(ambience);
    ambienceGain = ctx.createGain(); ambienceGain.gain.value = 0.0;
    const ambLP = ctx.createBiquadFilter(); ambLP.type = 'lowpass'; ambLP.frequency.value = 6000;
    src.connect(ambLP); ambLP.connect(ambienceGain); ambienceGain.connect(master);
  }

  function voice(freq, t0, dur) {
    // Two detuned triangles + one soft sine an octave up. Slow attack, slow release.
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + 3.2);
    g.gain.setValueAtTime(1, t0 + dur - 3.5);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(padBus);

    const oscs = [
      ['triangle', freq, -6],
      ['triangle', freq, +6],
      ['sine', freq * 2, 0],
    ].map(([type, f, cents]) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = cents;
      const og = ctx.createGain(); og.gain.value = type === 'sine' ? 0.12 : 0.3;
      // A touch of slow vibrato so the pad breathes
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08 + Math.random() * 0.08;
      const lfoG = ctx.createGain(); lfoG.gain.value = 3.5;
      lfo.connect(lfoG); lfoG.connect(o.detune); lfo.start(t0);
      o.connect(og); og.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.1); lfo.stop(t0 + dur + 0.1);
      return o;
    });
    return { oscs, g };
  }

  function playChord(i) {
    const t0 = ctx.currentTime + 0.05;
    const dur = CHORD_SECONDS + 4; // overlap with the next chord for a seamless crossfade
    CHORDS[i].notes.forEach((f, n) => voices.push(voice(f, t0 + n * 0.25, dur - n * 0.25)));
    voices = voices.slice(-30);
  }

  function sparkle() {
    if (!running || muted) return;
    const t0 = ctx.currentTime + 0.02;
    const f = PENTA[Math.floor(Math.random() * PENTA.length)];
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
    o.connect(g); g.connect(reverb); g.connect(master);
    o.start(t0); o.stop(t0 + 4.6);
  }

  function schedule() {
    playChord(chordIndex);
    chordIndex = (chordIndex + 1) % CHORDS.length;
    timer = setTimeout(schedule, CHORD_SECONDS * 1000);
  }
  function scheduleSparkle() {
    sparkle();
    sparkleTimer = setTimeout(scheduleSparkle, 5000 + Math.random() * 9000);
  }

  function fadeMaster(to, seconds) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(to, t + seconds);
  }

  const api = {
    /** Must be called from a user gesture. */
    start() {
      if (running) return;
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      running = true;
      ambience.play().then(() => {
        const t = ctx.currentTime;
        ambienceGain.gain.setValueAtTime(0, t);
        ambienceGain.gain.linearRampToValueAtTime(0.5, t + 6);
      }).catch(() => {});
      fadeMaster(muted ? 0 : 1, 4);
      schedule();
      sparkleTimer = setTimeout(scheduleSparkle, 6000);
    },
    toggle() {
      muted = !muted;
      if (ctx) fadeMaster(muted ? 0 : 1, 0.8);
      return !muted;
    },
    isOn() { return running && !muted; },
    /** Soft bell when a flower is reached. */
    chime(step, total) {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime + 0.01;
      const base = [587.33, 659.25, 739.99, 880.00, 987.77][step % 5];
      [base, base * 2].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(i ? 0.035 : 0.09, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
        o.connect(g); g.connect(master); g.connect(reverb);
        o.start(t0); o.stop(t0 + 2.5);
      });
      if (step === total - 1) {
        // resolve: a quiet fifth above after a breath
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * 1.5;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t0 + 0.35);
        g.gain.linearRampToValueAtTime(0.06, t0 + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
        o.connect(g); g.connect(reverb); g.connect(master);
        o.start(t0 + 0.35); o.stop(t0 + 3.5);
      }
    },
    /** Lift the pads slightly for the finale, let the ambience thin out. */
    finale() {
      if (!ctx) return;
      const t = ctx.currentTime;
      padBus.gain.linearRampToValueAtTime(0.3, t + 6);
      ambienceGain.gain.linearRampToValueAtTime(0.3, t + 8);
      fxBus.gain.linearRampToValueAtTime(0.8, t + 6);
    },
    reset() {
      if (!ctx) return;
      const t = ctx.currentTime;
      padBus.gain.linearRampToValueAtTime(0.22, t + 3);
      ambienceGain.gain.linearRampToValueAtTime(0.5, t + 3);
      fxBus.gain.linearRampToValueAtTime(0.55, t + 3);
    },
  };

  // iOS suspends the context when the tab is hidden; resume politely.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); }
    else if (running && ctx.state === 'suspended') ctx.resume();
  });

  window.MeadowAudio = api;
})();
