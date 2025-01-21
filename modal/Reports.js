const { default: mongoose } = require("mongoose");

const reportsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    singleUserPrice: { type: Number, required: true },
    multiUserPrice: { type: Number, required: true },
    enterprisePrice: { type: Number, required: true },
    summary: { type: String, default: "" },
    tableOfContents: { type: String, default: "" },
    methodology: { type: String, default: "" },
    downloadSampleReport: { type: String, default: "" },
    reportId: { type: String, required: true },
    filePath: { type: String, default: null },
    licenseType: {
        type: String,
        enum: ["single", "multi", "enterprise"],
        default: "enterprise", // Default to "enterprise" if not provided
    },
    allowedEmails: {
        type: [String],
        default: [], // Default to an empty array for multi-user licenses
    },
    currentUserEmail: {
        type: String,
        default: "", // Default to an empty string for single-user licenses
    },
    token: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
});

// Create a Mongoose Model
const Reports = mongoose.model("Reports", reportsSchema);
module.exports = Reports;