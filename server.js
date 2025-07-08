// server.js (CommonJS version)
const express = require('express');
const multer = require('multer');
const YAML = require('js-yaml');
const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const { ElevenLabsClient } = require('elevenlabs');

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/tmp/' });
const port = 3000;

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = process.env.ELEVENLABS_VOICE_ID || 'Rachel';

app.use(express.static('public'));

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

async function buildTreeFromYAML(filePath) {
  const file = await fs.readFile(filePath, 'utf-8');
  const parsed = YAML.load(file);
  return parsed;
}

async function generateAudio(text, id, index) {
  try {
    const audioBuffer = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128'
    });

    const filename = `node-${index}.mp3`;
    const filepath = path.join('uploads', id, filename);
    await fs.writeFile(filepath, audioBuffer);
    return `/uploads/${id}/${filename}`;
  } catch (err) {
    console.error(`❌ Failed to generate audio for: "${text}"`, err?.body || err.message);
    return null;
  }
}

let nodeCounter = 0;
async function enrichNodeWithAudio(node, id) {
  const audioPath = await generateAudio(node.text, id, nodeCounter++);
  node.audio = audioPath || '';
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      await enrichNodeWithAudio(child, id);
    }
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  console.log(`📤 Received file ${file.path}`);

  const id = generateId();
  const dir = path.join('uploads', id);
  await fs.mkdir(dir, { recursive: true });

  try {
    const tree = await buildTreeFromYAML(file.path);
    console.log(`📁 Parsed IVR tree with root prompt: "${tree.text?.slice(0, 50)}..."`);
    nodeCounter = 0;
    await enrichNodeWithAudio(tree, id);
    await fs.writeFile(path.join(dir, 'ivr.json'), JSON.stringify(tree, null, 2));
    res.json({ id });
  } catch (err) {
    console.error('❌ Failed to parse and build IVR:', err);
    res.status(500).json({ error: 'Failed to build IVR tree' });
  }
});

app.get('/tree/:id', async (req, res) => {
  const file = path.join('uploads', req.params.id, 'ivr.json');
  try {
    const tree = await fs.readFile(file, 'utf-8');
    res.json(JSON.parse(tree));
  } catch (err) {
    console.error('❌ Failed to load tree:', err);
    res.status(404).json({ error: 'Tree not found' });
  }
});

app.use('/uploads', express.static('uploads'));

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
