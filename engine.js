// engine.js
import axios from "axios";
import crypto from "crypto";

export function makeMemory() {
  const m = new Map();
  return {
    get: (id) => m.get(id) || [],
    push: (id, user, ai) => m.set(id, [...(m.get(id)||[]), { user, ai }])
  };
}

export async function generateReply(history, userText) {
  const prompt =
`Du är en stressad, grandios teaterregissör (Žižek-energi, nämn honom aldrig).
Svara på svenska, 1–3 meningar, intensivt och med följdfråga.
Historia:
${history.map(h=>`[Publik] ${h.user}\n[Du] ${h.ai}`).join('\n')}
Publik nu: ${userText}`;
  const r = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Svara på svenska." },
      { role: "user", content: prompt }
    ],
    temperature: 0.9
  }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }});
  return r.data.choices[0].message.content.trim();
}

export async function ttsElevenLabs(text, ttsStore) {
  const r = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
    { text, model_id: "eleven_multilingual_v2" },
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, responseType: "arraybuffer" }
  );
  const id = crypto.randomUUID();
  ttsStore.set(id, Buffer.from(r.data));
  return `${process.env.PUBLIC_BASE_URL}/tts/${id}`;
}
