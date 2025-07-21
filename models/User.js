const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    listeningHistory: [{
      songName: String,
      albumName: String,
      artistName: String,
      playedAt: { type: Date, default: Date.now }
    }],
    profilePicture: { type: String, default: '' },
    playlists: [
      {
        name: String,
        tracks: [
          {
            title: String,
            artist: String,
            album: String,
            cover: String,
            url: String,
            duration: Number
          }
        ]
      }
    ]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);