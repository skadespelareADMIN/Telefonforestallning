import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { makeMemory } from "./engine.js";
import twilioRoutes from "./routes.twilio.js";
import webRoutes from "./routes.web.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ttsStore = new Map();
const memory = makeMemory();

app.get("/health", (_, res) => res.send("ok"));
app.get("/debug", (_, res) => res.json({ INTRO_MP3_URL: process.env.INTRO_MP3_URL || "(not set)" }));
app.get("/tts/:id", (req, res) => {
  const buf = ttsStore.get(req.params.id);
  if (!buf) return res.status(404).end();
  res.setHeader("Content-Type", "audio/mpeg");
  res.send(buf);
});

// Plugga in adaptrarna
twilioRoutes(app, { memory, ttsStore });
webRoutes(app,   { memory, ttsStore });

const PORT = process.env.PORT || 3000;
import fs from "fs";
import path from "path";

const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, "scenes", "call.json"), "utf8"));
app.get("/scenes", (_, res) => res.json(scenes));

app.listen(PORT, () => console.log("listening", PORT));

