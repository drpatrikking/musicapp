const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const mime = require('mime-types');

const app = express();
const port = 3000;

const musicDir = "C:\\Users\\Asus\\Music\\MusicApp";

app.use('/music', express.static(musicDir));
app.use(express.static('public'));

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

      const relativePath = path.relative(musicDir, filePath).replace(/\\/g, '/');
      const url = `/music/${relativePath}`;
      const albumKey = `${artist} - ${album}`;
      const albumDir = path.dirname(path.join(musicDir, relativePath));

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

      albumsMap[albumKey].tracks.push({
        title,
        track,
        filename,
        url,
        album,
        artist,
        cover
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

app.listen(port, () => {
  console.log(`🎵 Music server running at http://localhost:${port}`);
});