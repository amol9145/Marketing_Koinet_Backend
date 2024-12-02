const mongoose = require("mongoose");

const ContactForm = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    companyName: { type: String },
    phoneNumber: { type: String },
    country: { type: String },
    streetAddress: { type: String },
    city: { type: String },
    postalCode: { type: String },
    notes: { type: String },
});

module.exports = mongoose.model("Contact", ContactForm);