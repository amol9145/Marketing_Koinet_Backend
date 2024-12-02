const mongoose = require("mongoose");

const pressReleaseSchema = new mongoose.Schema({
    title: { type: String, required: false },
    category: { type: String, required: false },
    description: { type: String }, // Accepts any type, including objects
    filePath: { type: String },
    reportId: { type: String },
    createdAt: { type: Date, default: Date.now },
});
const PressRelease = mongoose.model("PressRelease", pressReleaseSchema);

module.exports = PressRelease;