// public/player.js
export class ShowPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  /**
   * Säkerställ att AudioContext är igång efter användarklick
   */
  async resume() {
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch {}
    }
  }

  /**
   * Spela ett ljud från URL (mp3 etc), med mjuka in/ut-fades
   * - fadeIn/fadeOut i sekunder
   */
  async playUrl(url, fadeIn = 0.4, fadeOut = 0.4) {
    // Hämta ljud
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Audio HTTP ${res.status}`);
    const arr = await res.arrayBuffer();

    // Dekoda
    let audio;
    try {
      audio = await this.ctx.decodeAudioData(arr);
    } catch (e) {
      // I väldigt sällsynta fall kan decodeAudioData strula.
      // Då använder vi HTMLAudioElement som fallback.
      await this._fallbackHtmlAudio(url);
      return;
    }

    // Skapa källa + gain
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    const gain = this.ctx.createGain();
    src.connect(gain).connect(this.master);

    // Fades
    const now = this.ctx.currentTime;
    const fIn = Math.max(0.01, +fadeIn || 0);
    const fOut = Math.max(0.01, +fadeOut || 0);
    const dur = audio.duration;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fIn);

    // Bara rampa ut om klippet är längre än fadeOut
    if (dur > fOut + 0.05) {
      gain.gain.setValueAtTime(1, now + dur - fOut);
      gain.gain.linearRampToValueAtTime(0, now + dur);
    }

    // Kör!
    src.start(now);
    await new Promise((resolve) => (src.onended = resolve));
  }

  /**
   * Enkel fallback via <audio> om WebAudio-dekodning fallerar
   */
  _fallbackHtmlAudio(url) {
    return new Promise((resolve, reject) => {
      const el = new Audio();
      el.src = url;
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("HTMLAudio error"));
      el.play().catch(reject);
    });
  }
}
