// engine.js
import OpenAI from "openai";
import axios from "axios";
import { randomUUID } from "crypto";

// ---------- OpenAI-klient ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- Litet minne per session ----------
function makeMemory() {
  const map = new Map();
  return {
    get(sessionId) {
      return map.get(sessionId) || [];
    },
    push(sessionId, user, ai) {
      const hist = map.get(sessionId) || [];
      hist.push({ user, ai });
      map.set(sessionId, hist.slice(-10)); // spara senaste 10 turer
      return map.get(sessionId);
    },
    reset(sessionId) {
      map.delete(sessionId);
    },
  };
}

// ---------- Generera AI-svar ----------
async function generateReply(history = [], userText = "", personaPrompt = "") {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Saknar OPENAI_API_KEY");
  }

  const messages = [];

  // persona/styrning → system
  messages.push({
    role: "system",
    content:
      personaPrompt ||
      [
        "Du är en karaktär i en interaktiv teater på svenska.",
        "Svara kort (1–2 meningar), som talad dialog.",
        "Ingen poesi, inga listor, vardagligt tonfall.",
      ].join(" "),
  });

  for (const turn of history.slice(-10)) {
    if (turn?.user) messages.push({ role: "user", content: String(turn.user) });
    if (turn?.ai) messages.push({ role: "assistant", content: String(turn.ai) });
  }
  messages.push({ role: "user", content: String(userText || "(tystnad)") });

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 120,
  });

  return r?.choices?.[0]?.message?.content?.trim() || "Okej.";
}

// ---------- OpenAI TTS (fallback &/eller huvud-tts) ----------
async function ttsOpenAI(text, ttsStore) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Saknar OPENAI_API_KEY för OpenAI TTS");
  }
  const voice = process.env.OPENAI_TTS_VOICE || "alloy";

  // Nya SDK:en returnerar ett fetch-liknande Response-objekt
  const speech = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts", // fungerar bra för svenskt tal
    voice,
    input: String(text).slice(0, 4000),
    // format kan oftast utelämnas, default är mp3 i SDK-versioner som stöder detta
  });

  const buf = Buffer.from(await speech.arrayBuffer());
  const id = randomUUID();
  ttsStore.set(id, buf);

  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/tts/${id}` : `/tts/${id}`;
}

// ---------- ElevenLabs TTS (med automatisk fallback) ----------
async function ttsElevenLabs(text, ttsStore) {
  if (!text || !text.trim()) throw new Error("Ingen text för TTS");

  const prefer = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
  if (prefer === "openai") {
    // Tillåt att helt byta till OpenAI via env
    return ttsOpenAI(text, ttsStore);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  // Om nycklar saknas → gå direkt på OpenAI
  if (!apiKey || !voiceId) {
    console.warn("[TTS] ElevenLabs nyckel/voice saknas → använder OpenAI TTS");
    return ttsOpenAI(text, ttsStore);
  }

  try {
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` +
      `?optimize_streaming_latency=0&output_format=mp3_44100_128`;

    const payload = {
      text: String(text).slice(0, 4000),
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.7,
        style: 0.2,
        use_speaker_boost: true,
      },
    };

    const resp = await axios.post(url, payload, {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
      timeout: 30000,
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      const snippet =
        resp.data && resp.data.byteLength
          ? Buffer.from(resp.data).toString("utf8").slice(0, 300)
          : `HTTP ${resp.status}`;
      console.warn("[TTS] ElevenLabs fel:", resp.status, snippet);

      // Typfall: 401 “Free Tier usage disabled” → direkt fallback
      if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
        return ttsOpenAI(text, ttsStore);
      }
      throw new Error(`ElevenLabs fel: ${resp.status} ${snippet}`);
    }

    const id = randomUUID();
    ttsStore.set(id, Buffer.from(resp.data));

    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    return base ? `${base}/tts/${id}` : `/tts/${id}`;
  } catch (e) {
    // Nätverksfel eller annat → försök OpenAI
    console.warn("[TTS] ElevenLabs kastade fel, använder OpenAI:", e?.message);
    return ttsOpenAI(text, ttsStore);
  }
}

// ---------- Exporter ----------
export { makeMemory, generateReply, ttsElevenLabs };
export default { makeMemory, generateReply, ttsElevenLabs };
