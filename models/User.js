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
    profilePicture: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);