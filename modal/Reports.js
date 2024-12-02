const { default: mongoose } = require("mongoose");

const reportsSchema = new mongoose.Schema({
    title: String,
    category: String,
    singleUserPrice: Number,
    multiUserPrice: Number,
    enterprisePrice: Number,
    summary: String,
    tableOfContents: String,
    methodology: String,
    downloadSampleReport: String,
    reportId: String,
    filePath: String,
    createdAt: { type: Date, default: Date.now },
});

// Create a Mongoose Model
const Reports = mongoose.model("Reports", reportsSchema);
module.exports = Reports;