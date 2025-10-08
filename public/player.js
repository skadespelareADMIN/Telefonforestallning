// public/player.js
export class ShowPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  async playUrl(url, fadeIn = 0.4, fadeOut = 0.4) {
    // ladda och spela en ljudfil (mp3 eller AI-röst)
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await this.ctx.decodeAudioData(buf);
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    const gain = this.ctx.createGain();
    src.connect(gain).connect(this.master);

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fadeIn);
    src.start(now);
    gain.gain.linearRampToValueAtTime(0, now + audio.duration - fadeOut);

    return new Promise(res => (src.onended = res));
  }

  resume() {
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
}
