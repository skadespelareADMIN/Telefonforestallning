// server.js
import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath } from "url";

import { makeMemory } from "./engine.js";
import twilioRoutes from "./routes.twilio.js";
import webRoutes from "./routes.web.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Statiska filer (webb-test UI i /public)
app.use(express.static(path.join(__dirname, "public")));

// --- States (delas mellan web & twilio) ---
const ttsStore = new Map();     // { id: Buffer(MP3) }
const memory   = makeMemory();  // per-session call/web-minne

// --- Hjälprutter ---
app.get("/health", (_, res) => res.send("ok"));
app.get("/debug", (_, res) => {
  res.json({
    INTRO_MP3_URL: process.env.INTRO_MP3_URL || "(not set)",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || "(not set)",
  });
});

// TTS-serving (ElevenLabs-resultat som cachas i minnet)
app.get("/tts/:id", (req, res) => {
  const buf = ttsStore.get(req.params.id);
  if (!buf) return res.status(404).end();
  res.setHeader("Content-Type", "audio/mpeg");
  res.send(buf);
});

// Audio-proxy: spelar ALLT ljud via din egen domän (stabilare CORS/codec)
app.get("/audio", async (req, res) => {
  try {
    const u = req.query.u;
    if (!u) return res.status(400).send("Missing u");
    const r = await axios.get(u, { responseType: "arraybuffer" });
    const ct = r.headers["content-type"] || "audio/mpeg";
    res.setHeader("Content-Type", ct);
    res.send(Buffer.from(r.data));
  } catch (e) {
    console.error("Audio proxy fail:", e?.message);
    res.status(502).send("Bad audio");
  }
});

// Scenes-endpoint: exponerar ditt manu (scenes/call.json) till webben
let scenes;
try {
  const raw = fs.readFileSync(path.join(__dirname, "scenes", "call.json"), "utf8");
  scenes = JSON.parse(raw);
} catch (e) {
  console.error("Kunde inte läsa scenes/call.json:", e.message);
  scenes = { persona: { systemPrompt: "Du är en dramatisk AI." }, acts: [] };
}
app.get("/scenes", (_, res) => res.json(scenes));

// --- Plugga in adaptrarna (delar state) ---
twilioRoutes(app, { memory, ttsStore });
webRoutes(app,   { memory, ttsStore });

// --- Start ---
const PORT = process.env.PORT || 3000;
import { ttsElevenLabs } from "./engine.js";
import OpenAI from "openai";

app.get("/diag/openai", async (req, res) => {
  try {
    const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Säg 'hej' kort." }],
    });
    res.json({ ok: true, text: r.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message, data: e.response?.data });
  }
});

app.get("/diag/tts", async (req, res) => {
  try {
    const url = await ttsElevenLabs(req.query.text || "Test av ElevenLabs", ttsStore);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.listen(PORT, () => console.log("listening", PORT));
