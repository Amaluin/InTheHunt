// Synthesized SFX and a small chiptune loop (WebAudio, no sample files).
window.SFX = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let muted = false, mode = null, nextT = 0, step = 0, timer = 0;
  const VOLUME = 0.6;

  function unlock() {
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ac = new Ctx();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = 0.3;
      musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(freq, dur, type, vol, slide, when, bus = sfxBus) {
    if (!ac) return;
    const t = when || ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, cutoff, when, bus = sfxBus) {
    if (!ac) return;
    const t = when || ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  const later = s => ac.currentTime + s;

  const SOUNDS = {
    torpedo: () => { tone(520, 0.09, 'square', 0.05, 160); noise(0.08, 0.05, 1800); },
    hmg: () => tone(950, 0.03, 'square', 0.025, 500),
    wave: () => tone(260, 0.2, 'sine', 0.09, 900),
    spread: () => tone(720, 0.06, 'sawtooth', 0.035, 280),
    depth: () => { tone(160, 0.25, 'sine', 0.14, 70); noise(0.15, 0.06, 600); },
    hit: () => tone(1500, 0.03, 'square', 0.035, 900),
    clink: () => tone(2200, 0.05, 'triangle', 0.05),
    boom: () => { noise(0.4, 0.28, 900); tone(110, 0.3, 'sine', 0.2, 40); },
    bigBoom: () => { noise(0.9, 0.42, 650); tone(70, 0.8, 'sine', 0.32, 28); },
    pickup: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.08, 'square', 0.06, null, later(i * 0.06))),
    orb: () => tone(1250, 0.07, 'triangle', 0.07, 1900),
    playerHit: () => { tone(120, 0.4, 'sawtooth', 0.2, 45); noise(0.25, 0.2, 400); },
    alarm: () => [0, 0.28, 0.56].forEach(d => { tone(880, 0.12, 'square', 0.06, null, later(d)); tone(620, 0.12, 'square', 0.06, null, later(d + 0.14)); }),
    beep: () => tone(1050, 0.05, 'square', 0.05),
    checkpoint: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.09, 'triangle', 0.08, null, later(i * 0.07))),
    crack: () => { noise(0.3, 0.16, 3200); tone(300, 0.2, 'triangle', 0.05, 120); },
    shatter: () => noise(0.35, 0.18, 4200),
    telegraph: () => tone(1800, 0.06, 'square', 0.025, 2400),
  };

  function play(name) {
    if (!ac || muted) return;
    SOUNDS[name]?.();
  }

  const BPM = 164;
  const SIXTEENTH = 60 / BPM / 4;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const PATTERNS = {
    stage: {
      bass: [45, 0, 45, 57, 45, 0, 48, 0, 43, 0, 43, 55, 50, 0, 48, 0],
      lead: [0, 0, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0, 69, 0, 71, 0],
    },
    boss: {
      bass: [38, 38, 0, 38, 41, 0, 38, 0, 36, 36, 0, 36, 43, 0, 41, 40],
      lead: [0, 0, 74, 0, 0, 0, 73, 0, 0, 0, 70, 0, 0, 69, 0, 0],
    },
  };

  function tick() {
    if (!ac || !mode) return;
    if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.02;
    const pat = PATTERNS[mode];
    while (nextT < ac.currentTime + 0.12) {
      const i = step % 16;
      const bar = (step >> 4) % 4;
      const bass = pat.bass[i];
      if (bass) tone(midi(bass - (bar === 3 ? 2 : 0)), SIXTEENTH * 1.6, 'square', 0.09, null, nextT, musicBus);
      if (i % 4 === 0) tone(130, 0.12, 'sine', 0.25, 40, nextT, musicBus);
      if (i % 2 === 1) noise(0.03, 0.05, 8000, nextT, musicBus);
      if (i % 8 === 4) noise(0.1, 0.09, 2500, nextT, musicBus);
      const lead = pat.lead[i];
      if (lead && bar % 2 === 1) tone(midi(lead), SIXTEENTH * 2.5, 'triangle', 0.07, null, nextT, musicBus);
      if (mode === 'boss' && i === 0) tone(55, SIXTEENTH * 16, 'sawtooth', 0.03, null, nextT, musicBus);
      step++;
      nextT += SIXTEENTH;
    }
  }

  function music(next) {
    mode = next;
    if (!ac || !next) return;
    step = 0;
    nextT = ac.currentTime + 0.05;
    if (!timer) timer = setInterval(tick, 25);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : VOLUME;
    return muted;
  }

  return { unlock, play, music, toggleMute };
})();
