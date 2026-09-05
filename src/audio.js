export class GameAudio {
  constructor() {
    this.context = null;
    this.volume = 0.6;
    this.voices = [];
    this.currentVoice = null;
    this.active = false;
    this.lastVoice = -1;
    this.mode = "silent";
    this.bundled = {};
    this.nextEventAt = 0;
    this.samples = {};
    this.stepIndex = -1;
    this.lampLevel = 0;
    this.nextBreathAt = 0;
  }
  init() {
    if (this.context) {
      this.context.resume().catch(() => {});
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = this.volume ** 2 * 0.65;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    this.master.connect(limiter);
    limiter.connect(c.destination);
    this.ambience = c.createGain();
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.voice = c.createGain();
    this.voice.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this.noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const white = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;
    this.loadingPromise = this.loadBundled();
  }
  setVolume(value) {
    this.volume = value;
    if (this.context)
      this.master.gain.setTargetAtTime(
        value ** 2 * 0.65,
        this.context.currentTime,
        0.06,
      );
  }
  setActive(value) {
    this.active = value;
    if (!this.context) return;
    this.ambience.gain.setTargetAtTime(
      value ? this.lampLevel : 0,
      this.context.currentTime,
      0.4,
    );
    if (value) this.context.resume().catch(() => {});
    else this.stopVoice();
  }
  tone(
    freq,
    duration = 0.2,
    gain = 0.2,
    type = "sine",
    endFreq = freq,
    delay = 0,
  ) {
    if (!this.context || !this.active) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(10, endFreq),
      t + duration,
    );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  step(running) {
    let index = Math.floor(Math.random() * 6);
    if (index === this.stepIndex) index = (index + 1) % 6;
    this.stepIndex = index;
    this.playSample(
      "step-" + (index + 1),
      running ? 1.65 : 1.25,
      (index % 2 ? 1 : -1) * 0.12,
      0.96 + Math.random() * 0.08,
    );
  }
  playSample(key, volume = 1, pan = 0, rate = 1) {
    if (!this.active || !this.samples[key]) return false;
    const c = this.context,
      source = c.createBufferSource(),
      gain = c.createGain(),
      stereo = c.createStereoPanner();
    source.buffer = this.samples[key];
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    stereo.pan.value = pan;
    source.connect(gain);
    gain.connect(stereo);
    stereo.connect(this.sfx);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    source.start();
    return true;
  }
  startLoops() {
    if (this.samples.music && !this.musicSource) {
      this.musicSource = this.context.createBufferSource();
      this.musicSource.buffer = this.samples.music;
      this.musicSource.loop = true;
      this.musicSource.loopStart = 1.5;
      this.musicSource.connect(this.music);
      this.musicSource.start();
    }
    if (this.samples.lamp && !this.lampSource) {
      this.lampSource = this.context.createBufferSource();
      this.lampSource.buffer = this.samples.lamp;
      this.lampSource.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 950;
      this.lampSource.connect(filter);
      filter.connect(this.ambience);
      this.lampSource.start();
    }
  }
  pickup() {
    this.tone(460, 0.3, 0.15, "sine", 800);
    this.tone(920, 0.4, 0.07, "sine", 1200);
  }
  heartbeat(threat) {
    this.tone(53, 0.16, 0.08 + threat * 0.16, "sine", 32);
    this.tone(44, 0.13, 0.05 + threat * 0.09, "sine", 28, 0.17);
  }
  caught() {
    this.stopScare();
    this.setMode("scare");
    if (!this.samples.screamer) return;
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = this.samples.screamer;
    gain.gain.value = 0.9;
    source.connect(gain);
    gain.connect(this.master);
    this.scareSource = source;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.scareSource === source) this.scareSource = null;
    };
    source.start();
  }
  stopScare() {
    if (!this.scareSource) return;
    try {
      this.scareSource.stop();
    } catch {}
    this.scareSource = null;
  }
  door(open, volume = 1, pan = 0) {
    const key = open
      ? "door-open"
      : "door-close-" + (1 + Math.floor(Math.random() * 4));
    return this.playSample(key, volume * 0.9, pan, 0.97 + Math.random() * 0.06);
  }
  stopVoice() {
    if (this.currentVoice) {
      try {
        this.currentVoice.stop();
      } catch {}
      this.currentVoice = null;
    }
  }
  async loadVoices(files) {
    this.init();
    if (!this.context) throw new Error("Web Audio недоступен");
    const accepted = [],
      failed = [];
    for (const file of files) {
      if (file.size > 30 * 1024 * 1024) {
        failed.push(file.name + " (больше 30 МБ)");
        continue;
      }
      try {
        const buffer = await this.context.decodeAudioData(
          await file.arrayBuffer(),
        );
        accepted.push({ name: file.name, buffer });
      } catch {
        failed.push(file.name);
      }
    }
    this.voices.push(...accepted);
    return { accepted: accepted.length, failed };
  }
  clearVoices() {
    this.stopVoice();
    this.voices = [];
    this.lastVoice = -1;
  }
  playVoice() {
    if (
      !this.active ||
      !this.context ||
      !this.voices.length ||
      this.currentVoice
    )
      return false;
    let index = Math.floor(Math.random() * this.voices.length);
    if (index === this.lastVoice && this.voices.length > 1)
      index = (index + 1) % this.voices.length;
    this.lastVoice = index;
    const c = this.context,
      source = c.createBufferSource();
    source.buffer = this.voices[index].buffer;
    source.connect(this.voice);
    this.currentVoice = source;
    this.ambience.gain.setTargetAtTime(
      this.lampLevel * 0.25,
      c.currentTime,
      0.08,
    );
    source.onended = () => {
      source.disconnect();
      if (this.currentVoice === source) this.currentVoice = null;
      this.ambience.gain.setTargetAtTime(
        this.active ? this.lampLevel : 0,
        c.currentTime,
        0.45,
      );
    };
    source.start();
    return true;
  }
  async loadBundled() {
    const urls = {
      "behind-door": "behind-door.mp3",
      shot: "shot.mp3",
      "back-off": "back-off.mp3",
    };
    const samples = {
      screamer: "screamer.mp3",
      "door-open": "door-open.mp3",
      ...Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          "door-close-" + (i + 1),
          "door-close-" + (i + 1) + ".ogg",
        ]),
      ),
      music: "menu-horror.ogg",
      lamp: "lamp.mp3",
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          "step-" + (i + 1),
          "step-" + (i + 1) + ".ogg",
        ]),
      ),
    };
    await Promise.all(
      Object.entries(samples).map(async ([key, file]) => {
        try {
          const r = await fetch(
            import.meta.env.BASE_URL + "assets/audio/" + file,
          );
          if (!r.ok) throw Error(file);
          let buffer = await this.context.decodeAudioData(
            await r.arrayBuffer(),
          );
          if (key === "music") {
            // Trim the source's quiet lead-in and long fade; overlap the loop seam.
            const rate = buffer.sampleRate,
              start = Math.floor(1.5 * rate);
            const length = Math.floor(87.5 * rate),
              fade = Math.floor(1.5 * rate);
            const loop = this.context.createBuffer(
              buffer.numberOfChannels,
              length,
              rate,
            );
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              const output = loop.getChannelData(ch);
              output.set(
                buffer.getChannelData(ch).subarray(start, start + length),
              );
              for (let i = 0; i < fade; i++) {
                const mix = i / fade;
                output[length - fade + i] =
                  output[length - fade + i] * (1 - mix) + output[i] * mix;
              }
            }
            buffer = loop;
          }
          // Bring the six recordings to a common peak; preserve their natural attack.
          if (key.startsWith("step-")) {
            let peak = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++)
              for (const v of buffer.getChannelData(ch))
                peak = Math.max(peak, Math.abs(v));
            if (peak > 0)
              for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const data = buffer.getChannelData(ch);
                for (let i = 0; i < data.length; i++) data[i] *= 0.85 / peak;
              }
          }
          this.samples[key] = buffer;
          this.startLoops();
        } catch (e) {
          console.warn("Не загружен звук", file, e);
        }
      }),
    );
    await Promise.all(
      Object.entries(urls).map(async ([key, file]) => {
        try {
          const response = await fetch(
            import.meta.env.BASE_URL + "assets/audio/" + file,
          );
          if (!response.ok) throw Error(file);
          this.bundled[key] = await this.context.decodeAudioData(
            await response.arrayBuffer(),
          );
        } catch (e) {
          console.warn("Не загружена реплика", file, e);
        }
      }),
    );
  }
  setMode(mode) {
    if (["game", "menu", "story", "ending", "video"].includes(mode))
      this.stopScare();
    this.mode = mode;
    if (!this.context) return;
    this.setActive(mode === "game");
    const t = this.context.currentTime;
    this.music.gain.setTargetAtTime(
      mode === "menu" ? 0.9 : mode === "story" || mode === "ending" ? 0.26 : 0,
      t,
      0.45,
    );
    this.sfx.gain.setTargetAtTime(mode === "game" ? 0.8 : 0, t, 0.08);
  }
  playEvent(key, elapsed, chance = 0.4) {
    if (
      !this.active ||
      !this.bundled[key] ||
      this.currentVoice ||
      elapsed < this.nextEventAt ||
      Math.random() > chance
    )
      return false;
    const source = this.context.createBufferSource();
    source.buffer = this.bundled[key];
    source.connect(this.voice);
    this.currentVoice = source;
    this.nextEventAt = elapsed + 22;
    this.ambience.gain.setTargetAtTime(
      this.lampLevel * 0.25,
      this.context.currentTime,
      0.08,
    );
    source.onended = () => {
      source.disconnect();
      if (this.currentVoice === source) this.currentVoice = null;
      this.ambience.gain.setTargetAtTime(
        this.active ? this.lampLevel : 0,
        this.context.currentTime,
        0.4,
      );
    };
    source.start();
    return true;
  }
  noiseBurst(duration, gain, frequency, pan = 0, type = "lowpass") {
    if (!this.context || !this.active) return;
    const c = this.context,
      s = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = c.createGain(),
      p = c.createStereoPanner(),
      t = c.currentTime;
    s.buffer = this.noiseBuffer;
    s.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 1.2;
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.15, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    s.connect(filter);
    filter.connect(g);
    g.connect(p);
    p.connect(this.sfx);
    s.start();
    s.stop(t + duration);
    s.onended = () => {
      s.disconnect();
      filter.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }
  update(
    elapsed,
    {
      distance = 100,
      pan = 0,
      hidden = false,
      monsterActive = false,
      lampDistance = 100,
    } = {},
  ) {
    if (!this.context) return;
    const c = this.context,
      t = c.currentTime;
    this.lampLevel = hidden
      ? 0
      : Math.max(0, 1 - lampDistance / 3.1) ** 2 * 0.045;
    this.ambience.gain.setTargetAtTime(
      this.active ? this.lampLevel * (this.currentVoice ? 0.25 : 1) : 0,
      t,
      0.25,
    );
    if (
      this.active &&
      monsterActive &&
      distance < 14 &&
      elapsed >= this.nextBreathAt
    ) {
      this.noiseBurst(1.65, (1 - distance / 14) * 0.22, 330, pan, "bandpass");
      this.nextBreathAt = elapsed + 2.2;
    }
  }
}
