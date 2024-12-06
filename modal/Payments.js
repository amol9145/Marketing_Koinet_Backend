const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    razorpay_order_id: { type: String, required: true },
    razorpay_payment_id: { type: String, required: true },
    razorpay_signature: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
}, { timestamps: true });

const PaymentRazor = mongoose.model("PaymentRazor", paymentSchema);

module.exports = PaymentRazor;