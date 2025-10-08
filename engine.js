// engine.js
import OpenAI from "openai";
import axios from "axios";
import { randomUUID } from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function makeMemory() {
  const map = new Map();
  return {
    get(sessionId) {
      return map.get(sessionId) || [];
    },
    push(sessionId, user, ai) {
      const hist = map.get(sessionId) || [];
      hist.push({ user, ai });
      map.set(sessionId, hist.slice(-10)); // spara senaste 10 turer
    },
    clear(sessionId) {
      map.delete(sessionId);
    },
  };
}

export async function generateReply(history, userText, personaPrompt = "") {
  const prompt = `${personaPrompt}

Tidigare:
${history.map(h => `[Publik] ${h.user}\n[Du] ${h.ai}`).join("\n")}
Publik nu: ${userText}`;

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Du är en teaterkaraktär som svarar poetiskt och spontant på svenska." },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
  });

  return (r.choices?.[0]?.message?.content || "").trim();
}

export async function ttsElevenLabs(text, ttsStore) {
  const voice = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""); // ta bort ev. trailing slash

  if (!voice) throw new Error("Saknar ELEVENLABS_VOICE_ID");
  if (!apiKey) throw new Error("Saknar ELEVENLABS_API_KEY");
  if (!base)  throw new Error("Saknar PUBLIC_BASE_URL");

  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    }
  );

  const id = randomUUID();
  ttsStore.set(id, Buffer.from(resp.data));
  return `${base}/tts/${id}`;
}
