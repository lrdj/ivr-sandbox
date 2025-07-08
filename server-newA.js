const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ElevenLabsClient } = require('elevenlabs');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');

dotenv.config();
const app = express();
const port = 3000;

// Set up ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_KEY,
});

const VOICE_ID = process.env.VOICE_ID;

app.use(express.static('public'));
app.use(fileUpload());
app.use(express.json());

const TMP_DIR = 'uploads/tmp';
const AUDIO_DIR = 'public/audio';
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ivrTrees = new Map();    // id → parsed tree
const progressMap = new Map(); // id → { step, total, done }

// Server-Sent Events progress endpoint
app.get('/progress/:id', (req, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    const progress = progressMap.get(id);
    if (!progress) return;

    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    if (progress.done) {
      res.write(`event: done\ndata: {}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 300);
});

// Upload route
app.post('/upload', async (req, res) => {
  const file = req.files?.file;
  if (!file) return res.status(400).send('No file uploaded');

  const id = uuidv4();
  const tmpPath = `${TMP_DIR}/${file.md5}`;
  await file.mv(tmpPath);

  console.log(`📤 Received file ${tmpPath}`);

  // Parse uploaded file as YAML or JSON
  let tree;
  try {
    const ext = path.extname(file.name);
    const content = fs.readFileSync(tmpPath, 'utf8');
    tree = (ext === '.yaml' || ext === '.yml') ? yaml.load(content) : JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error parsing file: ${err}`);
    return res.status(400).send('Invalid file format');
  }

  // Walk tree and flatten it
  const flattened = [];
  const walk = (node) => {
    const itemId = uuidv4();
    const audioPath = `/audio/${id}/${itemId}.mp3`;
    node._id = itemId;
    node.audio = audioPath;
    flattened.push({ text: node.text, audio: audioPath, id: itemId });

    if (node.children) {
      node.children.forEach(walk);
    }
  };
  walk(tree);

  const buildDir = `${AUDIO_DIR}/${id}`;
  fs.mkdirSync(buildDir, { recursive: true });

  const total = flattened.length;
  progressMap.set(id, { step: 0, total });

  for (let i = 0; i < total; i++) {
    const { text, audio, id: itemId } = flattened[i];
    const filePath = `${buildDir}/${itemId}.mp3`;

    console.log(`🔎 Building audio for node ${i + 1}/${total}: "${text}"`);

    try {
      const stream = await elevenlabs.textToSpeech.convert({
        voiceId: VOICE_ID,
        modelId: 'eleven_multilingual_v2',
        optimizeStreamingLatency: 1,
        outputFormat: 'mp3_44100_128',
        text,
      });

      const writer = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        stream.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`✅ Saved: ${filePath}`);
    } catch (err) {
      console.error(`❌ Failed to build audio for "${text}"`);
      console.error(err);
    }

    progressMap.set(id, { step: i + 1, total });
  }

  ivrTrees.set(id, tree);
  progressMap.set(id, { step: total, total, done: true });

  res.json({ id });
});

// Tree fetch route
app.get('/tree/:id', (req, res) => {
  const tree = ivrTrees.get(req.params.id);
  if (!tree) return res.status(404).send('Not found');
  res.json(tree);
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
