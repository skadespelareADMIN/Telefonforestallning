// server.js
import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath } from "url";

import { makeMemory, ttsElevenLabs } from "./engine.js";
import twilioRoutes from "./routes.twilio.js";
import webRoutes from "./routes.web.js";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Middlewares ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serva frontend från /public (index.html, player.js osv)
app.use(express.static(path.join(__dirname, "public")));

// --- Gemensam state ---
const ttsStore = new Map();  // ElevenLabs-ljud cacheas här
const memory = makeMemory(); // Enkel minneskarta per session

// --- Basrutter ---
app.get("/health", (_, res) => res.send("ok"));
app.get("/debug", (_, res) => {
  res.json({
    INTRO_MP3_URL: process.env.INTRO_MP3_URL || "(not set)",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || "(not set)",
    NODE_ENV: process.env.NODE_ENV || "(not set)",
  });
});

// --- TTS-serving: streama cacha(de) mp3 från minnet ---
app.get("/tts/:id", (req, res) => {
  const buf = ttsStore.get(req.params.id);
  if (!buf) return res.status(404).end();
  res.setHeader("Content-Type", "audio/mpeg");
  res.send(buf);
});

// --- Audio-proxy: hämta externa mp3/ljud via servern (CORS-säkert) ---
app.get("/audio", async (req, res) => {
  try {
    const u = req.query.u;
    if (!u) return res.status(400).send("Missing u");
    const r = await axios.get(u, {
      responseType: "arraybuffer",
      validateStatus: () => true,
    });
    console.info("AUDIO PROXY", "url=", u, "status=", r.status, "type=", r.headers["content-type"]);
    if (r.status >= 400) return res.status(502).send("Bad upstream " + r.status);
    const ct = r.headers["content-type"] || "audio/mpeg";
    res.setHeader("Content-Type", ct);
    res.send(Buffer.from(r.data));
  } catch (e) {
    console.error("Audio proxy fail:", e.message);
    res.status(502).send("Bad audio");
  }
});

// --- Scenes (manusfilen) ---
// Först försök scenes/call.json, annars fall back till call.json i roten.
// (Du kan även peka via env: SCENES_PATH=/full/path/till/fil.json)
let scenes;
(function loadScenes() {
  const candidates = [];
  if (process.env.SCENES_PATH) {
    candidates.push(process.env.SCENES_PATH);
  }
  candidates.push(path.join(__dirname, "scenes", "call.json"));
  candidates.push(path.join(__dirname, "call.json"));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        scenes = JSON.parse(raw);
        console.log("Loaded scenes from:", p);
        return;
      }
    } catch (e) {
      console.warn("Failed reading scenes from:", p, e.message);
    }
  }

  console.error("Kunde inte läsa någon call.json – kör tomma acts.");
  scenes = { persona: { systemPrompt: "Du är en dramatisk AI." }, acts: [] };
})();

app.get("/scenes", (_, res) => res.json(scenes));

// --- Diagnosrutter (hjälper att felsöka nycklar/nät) ---
app.get("/diag/openai", async (req, res) => {
  try {
    const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Säg 'hej' kort." }],
    });
    res.json({ ok: true, text: r.choices[0]?.message?.content || "(tomt)" });
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

app.get("/diag/tts-raw", async (req, res) => {
  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;
    const r = await axios.post(
      url,
      { text: "Test" },
      {
        responseType: "arraybuffer",
        validateStatus: () => true,
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
      }
    );
    res.json({
      status: r.status,
      type: r.headers["content-type"],
      bytes: r.data?.byteLength,
      bodySnippet:
        r.status !== 200 ? Buffer.from(r.data).toString("utf8").slice(0, 400) : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Koppla in Twilio och webbrutterna ---
// Twilio: /voice, /tw-act1 (just nu enkel 1-turs-loop)
// Web: /web-act (AI svar + TTS) och /web-tts (ren TTS för manus)
twilioRoutes(app, { memory, ttsStore });
webRoutes(app, { memory, ttsStore });

// --- Starta servern ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("listening", PORT));
