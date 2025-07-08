// listVoices.js (CommonJS)
const { ElevenLabsClient } = require('elevenlabs');
require('dotenv').config();

const client = new ElevenLabsClient({ apiKey: process.env.ELEVEN_KEY });

async function listVoices() {
  const voices = await client.voices.getAll();
  voices.voices.forEach(v => {
    console.log(`${v.name} — ${v.voice_id}`);
  });
}

listVoices().catch(console.error);
