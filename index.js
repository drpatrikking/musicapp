const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const mime = require('mime-types');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

const musicDir = "C:\\Users\\Asus\\Music\\MusicApp";

const User = require('./models/User');

app.use('/music', express.static(musicDir));
app.use(express.static('public'));
app.use(express.json());
app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

mongoose.connect('mongodb://localhost:27017/musicapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error(err));

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401);

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.sendStatus(403);
  }
}

async function getAlbums(dir) {
  const albumsMap = {};

  async function traverse(currentPath) {
    let results = [];
    const list = await fs.promises.readdir(currentPath, { withFileTypes: true });
    for (const file of list) {
      const fullPath = path.join(currentPath, file.name);
      if (file.isDirectory()) {
        results = results.concat(await traverse(fullPath));
      } else if (['.mp3', '.wav', '.flac'].some(ext => file.name.toLowerCase().endsWith(ext))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const files = await traverse(musicDir);

  for (const filePath of files) {
    try {
      const metadata = await mm.parseFile(filePath);
      const common = metadata.common || {};
      const title = common.title || path.basename(filePath);
      const artist = common.artist || 'Unknown Artist';
      const album = common.album || 'Unknown Album';
      const duration = metadata.format?.duration || 0;
      const track = parseInt(common.track?.no) || 0;
      const filename = path.basename(filePath).toLowerCase();

      const durationSeconds = metadata.format.duration || 0;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.floor(durationSeconds % 60).toString().padStart(2, '0');
      const trackDuration = `${minutes}:${seconds}`;

      const relativePath = path.relative(musicDir, filePath).replace(/\\/g, '/');
      const url = `/music/${relativePath}`;
      const albumKey = `${artist} - ${album}`;
      const albumDir = path.dirname(path.join(musicDir, relativePath));
      const folder = path.basename(path.dirname(filePath));

      // Get cover
      let cover = null;
      const coverPath = path.join(albumDir, 'cover.jpg');
      if (fs.existsSync(coverPath)) {
        const buffer = await fs.promises.readFile(coverPath);
        const mimeType = mime.lookup(coverPath) || 'image/jpeg';
        cover = `data:${mimeType};base64,${buffer.toString('base64')}`;
      } else if (common.picture?.length) {
        const img = common.picture[0];
        const base64 = img.data.toString('base64');
        const mimeType = img.format || 'image/jpeg';
        cover = `data:${mimeType};base64,${base64}`;
      }

      if (!albumsMap[albumKey]) {
        albumsMap[albumKey] = {
          album,
          artist,
          cover,
          tracks: []
        };
      }

      function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      albumsMap[albumKey].tracks.push({
        title,
        track,
        filename,
        url,
        album,
        artist,
        cover,
        duration: formatDuration(duration),
        folder
      });

    } catch (err) {
      console.warn(`⚠️ Metadata error in ${filePath}: ${err.message}`);
    }
  }

  // Sort tracks
  for (const key in albumsMap) {
    albumsMap[key].tracks.sort((a, b) => {
      if (a.track !== b.track) return a.track - b.track;
      return a.filename.localeCompare(b.filename);
    });
  }

  return Object.values(albumsMap);
}

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ error: 'Username already taken' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword });
  await user.save();

  res.json({ message: 'User registered successfully' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.post('/track-play', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401);

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { songName, albumName, artistName } = req.body;
    if (!songName || !albumName || !artistName) {
      return res.status(400).json({ error: 'Missing song, album, or artist info' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.sendStatus(404);

    user.listeningHistory.push({ songName, albumName, artistName });
    await user.save();

    res.json({ message: 'Track added to listening history' });
  } catch (e) {
    console.error('Error recording track play:', e.message);
    res.sendStatus(403);
  }
});

app.post('/upload-profile-picture', authenticateToken, async (req, res) => {
  const { base64 } = req.body;

  if (!base64 || !base64.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.sendStatus(404);

    user.profilePicture = base64;
    await user.save();

    res.json({ profilePicture: user.profilePicture });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post('/playlists', authenticateToken, async (req, res) => {
  const { name } = req.body;
  const user = await User.findById(req.user.userId);
  if (!user) return res.sendStatus(404);

  user.playlists.push({ name, tracks: [] });
  await user.save();
  res.json(user.playlists);
});

app.post('/playlists/:index/add', authenticateToken, async (req, res) => {
  const { index } = req.params;
  const track = req.body;
  const user = await User.findById(req.user.userId);
  if (!user || !user.playlists[index]) return res.sendStatus(404);

  user.playlists[index].tracks.push(track);
  await user.save();
  res.json(user.playlists[index]);
});

app.get('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401);

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.error('User not found for decoded userId:', decoded.userId);
      return res.sendStatus(404);
    }

    console.log('Sending profile:', {
      userId: user._id,
      username: user.username,
      createdAt: user.createdAt,
      listeningHistoryCount: user.listeningHistory?.length,
      profilePicture: user.profilePicture
    });

    res.json({
      userId: user._id,
      username: user.username,
      createdAt: user.createdAt || null,
      listeningHistory: user.listeningHistory,
      profilePicture: user.profilePicture
    });
  } catch (e) {
    console.error('Token verification failed or DB error:', e.message);
    res.sendStatus(403);
  }
});

app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/register.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/api/albums', async (req, res) => {
  try {
    const albums = await getAlbums(musicDir);
    console.log(`📀 Found ${albums.length} album(s)`);
    res.json(albums);
  } catch (err) {
    console.error('❌ Failed to load albums:', err);
    res.status(500).json({ error: 'Could not load albums' });
  }
});

app.get('/leaderboard', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401);

  try {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    const users = await User.find({}, 'username listeningHistory').lean();
    const leaderboard = users.map(user => ({
      username: user.username,
      totalPlays: user.listeningHistory?.length || 0
    }))
    .sort((a, b) => b.totalPlays - a.totalPlays);

    res.json(leaderboard);
  } catch (e) {
    console.error('Leaderboard route error:', e.message);
    res.sendStatus(403);
  }
});

app.get('/playlists', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.sendStatus(404);
  res.json(user.playlists);
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));