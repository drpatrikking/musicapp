const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

const musicDir = "C:\\Users\\Asus\\Documents\\GitHub\\musicapp\\music";

app.use(express.static("public"));
app.use("/music", express.static(musicDir));

// API to list music files
app.get("/api/tracks", (req, res) => {
  const files = fs.readdirSync(musicDir).filter(file =>
    file.endsWith(".mp3") || file.endsWith(".flac") || file.endsWith(".wav")
  );

  const tracks = files.map(filename => ({
    name: path.parse(filename).name,
    url: `/music/${encodeURIComponent(filename)}`
  }));

  res.json(tracks);
});

app.listen(PORT, () => {
  console.log(`🎵 Music server running at http://localhost:${PORT}`);
});