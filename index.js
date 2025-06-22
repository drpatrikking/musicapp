const express = require("express");
const fs = require("fs");
const path = require("path");
const mm = require("music-metadata");
const app = express();
const PORT = 3000;

const musicDir = "C:\\Users\\Asus\\Music\\MusicApp";

app.use(express.static("public"));
app.use("/music", express.static(musicDir));

// Serve cover images from subfolders
app.use("/cover", (req, res) => {
  const relPath = decodeURIComponent(req.path.slice(1));
  const absPath = path.join(musicDir, relPath);
  if (fs.existsSync(absPath)) {
    res.sendFile(absPath);
  } else {
    res.status(404).send("Cover image not found");
  }
});


// Recursively get all music file paths from subfolders
function getAllMusicFiles(dir) {
  let files = [];
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(getAllMusicFiles(fullPath));
    } else if (/\.(mp3|flac|wav)$/i.test(file)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Route to return all music tracks with metadata and paths
app.get("/api/tracks", async (req, res) => {
  const filePaths = getAllMusicFiles(musicDir);

  const tracks = await Promise.all(filePaths.map(async fullPath => {
    const relativePath = path.relative(musicDir, fullPath);
    const metadata = await mm.parseFile(fullPath).catch(() => ({}));

    const title = metadata.common?.title || path.parse(fullPath).name;
    const artist = metadata.common?.artist || "Unknown Artist";
    const album = metadata.common?.album || "Unknown Album";

    let coverDataUrl = null;

    // Check first for .png/.jpg in the folder
    const folder = path.dirname(fullPath);
    const candidates = ["cover.jpg", "folder.jpg", "cover.png"];
    for (const file of candidates) {
      const imgPath = path.join(folder, file);
      if (fs.existsSync(imgPath)) {
        const relImagePath = path.relative(musicDir, imgPath).split(path.sep).join("/");
        coverDataUrl = `/cover/${encodeURIComponent(relImagePath)}`;
        console.log(`Using folder cover: ${coverDataUrl}`);
        break;
      }
    }

    // If none, check embedded artwork
    if (!coverDataUrl) {
      const picture = metadata.common?.picture?.[0];
      if (picture) {
        const base64 = picture.data.toString("base64");
        coverDataUrl = `data:${picture.format};base64,${base64}`;
        console.log(`Using embedded cover for: ${relativePath}`);
      }
    }

    return {
      name: title,
      artist,
      album,
      url: `/music/${encodeURIComponent(relativePath.split(path.sep).join("/"))}`,
      cover: coverDataUrl
    };
  }));

  res.json(tracks);
});

app.get("/api/albums", async (req, res) => {
  const filePaths = getAllMusicFiles(musicDir);

  const albums = {};

  await Promise.all(filePaths.map(async fullPath => {
    const relativePath = path.relative(musicDir, fullPath);
    const metadata = await mm.parseFile(fullPath).catch(() => ({}));

    const title = metadata.common?.title || path.parse(fullPath).name;
    const artist = metadata.common?.artist || "Unknown Artist";
    const album = metadata.common?.album || "Unknown Album";

    const key = `${artist}||${album}`;

    if (!albums[key]) {
      let cover = null;

      // 1. Try cover.jpg in folder
      const folder = path.dirname(fullPath);
      const candidates = ["cover.jpg", "folder.jpg", "cover.png"];
      for (const file of candidates) {
        const imgPath = path.join(folder, file);
        if (fs.existsSync(imgPath)) {
          const relImagePath = path.relative(musicDir, imgPath).split(path.sep).join("/");
          cover = `/cover/${encodeURIComponent(relImagePath)}`;
          break;
        }
      }

      // 2. If no cover file, try embedded
      if (!cover) {
        const picture = metadata.common?.picture?.[0];
        if (picture) {
          const base64 = picture.data.toString("base64");
          cover = `data:${picture.format};base64,${base64}`;
        }
      }

      albums[key] = {
        artist,
        album,
        cover,
        tracks: []
      };
    }

    albums[key].tracks.push({
  title,
  artist,
  album,
  duration: metadata.format?.duration || 0,
  path: `/music/${encodeURIComponent(relativePath.split(path.sep).join("/"))}`
});

  }));

  res.json(Object.values(albums));
});



app.listen(PORT, () => {
  console.log(`🎵 Music server running at http://localhost:${PORT}`);
});