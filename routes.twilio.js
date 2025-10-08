// routes.twilio.js
import twilio from "twilio";
import { generateReply, ttsElevenLabs } from "./engine.js";

export default function twilioRoutes(app, { memory, ttsStore }) {
  const { VoiceResponse } = twilio.twiml;

  app.post("/voice", (req, res) => {
    const twiml = new VoiceResponse();
    const intro = process.env.INTRO_MP3_URL;
    if (intro) twiml.play(intro);
    const g = twiml.gather({
      input: "speech",
      action: "/tw-act1",
      method: "POST",
      speechTimeout: "auto"
    });
    g.say({ language: "sv-SE", voice: "Polly.Mattias" }, "När musiken tystnar, tala fritt.");
    res.type("text/xml").send(twiml.toString());
  });

  app.post("/tw-act1", async (req, res) => {
    const callId = req.body.CallSid;
    const userText = req.body.SpeechResult || "(inget)";
    const hist = memory.get(callId);
    const reply = await generateReply(hist, userText);
    memory.push(callId, userText, reply);
    const url = await ttsElevenLabs(reply, ttsStore);

    const twiml = new VoiceResponse();
    twiml.play(url);
    twiml.hangup();
    res.type("text/xml").send(twiml.toString());
  });
}
