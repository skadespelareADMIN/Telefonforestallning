// routes.web.js
import { generateReply, ttsElevenLabs } from "./engine.js";

export default function webRoutes(app, { memory, ttsStore }) {
  app.post("/web-act", async (req, res) => {
    try {
      const sessionId = req.body.sessionId || "dev";
      const userText = (req.body.text || "").toString().slice(0, 1000) || "(inget)";
      const hist = memory.get(sessionId);
      const reply = await generateReply(hist, userText);
      memory.push(sessionId, userText, reply);
      const audioUrl = await ttsElevenLabs(reply, ttsStore);
      res.json({ reply, audioUrl });
    } catch (e) {
      console.error(e?.response?.data || e.message);
      res.status(500).json({ error: "web-act-fail" });
    }
  });
}
