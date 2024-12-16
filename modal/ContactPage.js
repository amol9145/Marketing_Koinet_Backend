const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
    fullName: String,
    companyName: String,
    email: String,
    phone: String,
    country: String,
    street: String,
    city: String,
    zip: String,
    message: String,
    terms: Boolean,
});

module.exports = mongoose.model("ContactPage_Data", contactSchema);