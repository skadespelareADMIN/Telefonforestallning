// public/player.js
export class ShowPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  async playUrl(url, fadeIn = 0.5, fadeOut = 0.5) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await this.ctx.decodeAudioData(buf);
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(1, now + fadeIn);

    src.start(now);
    src.stop(now + audio.duration - fadeOut);
    this.gain.gain.linearRampToValueAtTime(0, now + audio.duration);

    return new Promise(r => src.onended = r);
  }

  resume() { if (this.ctx.state === "suspended") this.ctx.resume(); }
}
