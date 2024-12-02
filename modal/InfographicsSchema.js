const { default: mongoose } = require("mongoose");

const infographicsSchema = new mongoose.Schema({
    title: String,
    category: String,
    singleUserPrice: Number,
    multiUserPrice: Number,
    enterprisePrice: Number,
    summary: String,
    tableOfContents: String,
    methodology: String,
    infographics: String,
    imageUrl: String,
    reportId: String,
    filePath: String,
    createdAt: { type: Date, default: Date.now },
});

// Create a Mongoose Model
const Infographics = mongoose.model("Infographics", infographicsSchema);
module.exports = Infographics;