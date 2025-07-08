// server.js
const express = require('express');
const multer = require('multer');
const opml = require('opml');
const yaml = require('js-yaml');
const fs = require('fs/promises');
const path = require('path');
const { ElevenLabsClient } = require('elevenlabs');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });
const client = new ElevenLabsClient({ apiKey: process.env.ELEVEN_KEY });

app.use(express.static('public'));
app.use('/audio', express.static('uploads'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const treeRaw = await parseUploadedFile(req.file.path);
    const tree = normaliseTree(treeRaw);
    const ivr = await buildTree(tree);
    const id = crypto.randomUUID();
    await fs.writeFile(`uploads/${id}.json`, JSON.stringify(ivr));
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/tree/:id', async (req, res) => {
  const file = `uploads/${req.params.id}.json`;
  res.sendFile(path.resolve(file));
});

app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});

// ------------ Helpers ---------------

const crypto = require('crypto');

async function parseUploadedFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.opml') return opml.parse(content);
  if (ext === '.yaml' || ext === '.yml') return yaml.load(content);

  try {
    return opml.parse(content);
  } catch {
    return yaml.load(content);
  }
}

function normaliseTree(node) {
  if (Array.isArray(node)) {
    return { text: 'Start', children: node.map(normaliseTree) };
  }

  const children = node.children || node.options || [];
  return {
    text: node.text,
    children: children.map(normaliseTree)
  };
}



async function buildTree(node, parentPath = 'root', index = 0) {
  const safeText = node.text.replace(/\s+/g, ' ').trim();
  const filename = `${parentPath}_${index}.mp3`;
  const filepath = path.join(__dirname, 'uploads', filename);

  // 🔁 Call ElevenLabs API to generate audio
  const audio = await client.textToSpeech.convert(
    {
      text: safeText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: undefined,
    },
    {
      voiceId: process.env.VOICE_ID,
      output_format: 'mp3_44100_128',
    }
  );

  // 💾 Save audio to file
  fs.writeFileSync(filepath, Buffer.from(audio));

  // 🔁 Recursively process children (if any)
  if (node.children && node.children.length > 0) {
    for (let i = 0; i < node.children.length; i++) {
      await buildTree(node.children[i], `${parentPath}_${index}`, i);
    }
  }

  // 🔗 Save the audio path for frontend use
  node.audio = `/uploads/${filename}`;
}

