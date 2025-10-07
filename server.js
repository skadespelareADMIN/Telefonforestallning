import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { VoiceResponse } = twilio.twiml;

// Hälso-koll
app.get("/health", (_, res) => res.send("ok"));

// Twilio webhook för inkommande samtal
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();

  // Spela introfil (ställ i Railway env: INTRO_MP3_URL)
  const intro = process.env.INTRO_MP3_URL
    || "https://filesamples.com/samples/audio/mp3/sample3.mp3"; // tillfällig demo

  twiml.play(intro);
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
