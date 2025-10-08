// routes.web.js
import express from "express";
import { generateReply, ttsElevenLabs } from "./engine.js";

export default function webRoutes(app, { memory, ttsStore }) {
  // Egen JSON-parser för just dessa rutter (ifall servern saknar global express.json())
  const json = express.json({ limit: "1mb" });

  // 🗣️ AI-svar + TTS (för när publiken pratar)
  app.post("/web-act", json, async (req, res) => {
    try {
      const sessionId = (req.body.sessionId || "dev").toString();
      const userText =
        ((req.body.text ?? "") + "").slice(0, 1000) || "(inget)";
      const persona = ((req.body.prompt ?? "") + "").toString();

      const hist = memory.get(sessionId);
      const reply = await generateReply(hist, userText, persona);
      memory.push(sessionId, userText, reply);

      const audioUrl = await ttsElevenLabs(reply, ttsStore);
      res.json({ reply, audioUrl });
    } catch (e) {
      console.error("[/web-act] error:", e?.response?.data || e);
      res.status(500).json({ error: "web-act-fail" });
    }
  });

  // 🔊 Ren TTS för manusrepliker (ingen AI-generering)
  app.post("/web-tts", json, async (req, res) => {
    try {
      const text = ((req.body.text ?? "") + "").slice(0, 4000);
      if (!text) return res.status(400).json({ error: "no-text" });

      const audioUrl = await ttsElevenLabs(text, ttsStore);
      res.json({ audioUrl });
    } catch (e) {
      console.error("[/web-tts] error:", e?.response?.data || e);
      res.status(500).json({ error: "web-tts-fail" });
    }
  });
}
