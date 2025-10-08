// engine.js
import OpenAI from "openai";
import axios from "axios";
import { randomUUID } from "crypto";

// ---------- OpenAI ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Litet minne per session (för kort historik)
export function makeMemory() {
  const map = new Map();
  return {
    get(sessionId) {
      return map.get(sessionId) || [];
    },
    push(sessionId, user, ai) {
      const hist = map.get(sessionId) || [];
      hist.push({ user, ai });
      // begränsa historiken så den inte växer okontrollerat
      const trimmed = hist.slice(-10); // senaste 10 turer
      map.set(sessionId, trimmed);
      return trimmed;
    },
    reset(sessionId) {
      map.delete(sessionId);
    },
  };
}

/**
 * generateReply
 * - Tar en enkel historik [{user, ai}, ...] + användarens nya text
 * - Låter en persona vara systemprompt (om skickad)
 * - Svarar kort och tal-vänligt, inga dikter
 */
export async function generateReply(history = [], userText = "", personaPrompt = "") {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Saknar OPENAI_API_KEY");
  }

  // Bygg upp messages som riktig konversation
  const messages = [];

  // Persona som systemprompt (ger stil/styrning)
  messages.push({
    role: "system",
    content:
      personaPrompt ||
      [
        "Du är en karaktär i en interaktiv teater på svenska.",
        "Svara kort och konkret (1–2 meningar).",
        "Formulera dig som talad dialog, inte poesi.",
        "Inga listor, inga långa utläggningar, inga rim.",
      ].join(" "),
  });

  // Lägg in tidigare turer som user/assistant-par
  for (const turn of history.slice(-10)) {
    if (turn?.user) messages.push({ role: "user", content: String(turn.user) });
    if (turn?.ai) messages.push({ role: "assistant", content: String(turn.ai) });
  }

  // Nuvarande publikreplik
  messages.push({ role: "user", content: String(userText || "(tystnad)") });

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 120,
  });

  const reply = r?.choices?.[0]?.message?.content?.trim() || "Okej.";
  return reply;
}

// ----
