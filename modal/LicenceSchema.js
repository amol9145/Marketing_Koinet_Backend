// models/LicenseAccess.js
const mongoose = require("mongoose");

const LicenseAccessSchema = new mongoose.Schema({
    orderId: { type: String, required: false },
    licenseType: { type: String, required: false },
    accessGranted: { type: Boolean, default: false },
});

const LicenseAccess = mongoose.model("LicenseAccess", LicenseAccessSchema);
module.exports = LicenseAccess;