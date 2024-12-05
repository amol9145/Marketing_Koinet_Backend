const mongoose = require("mongoose");

const FormSubmissionSchema = new mongoose.Schema({
    user_name: { type: String },
    user_company: { type: String },
    user_email: { type: String },
    user_phone: { type: String },
    user_message: { type: String },
    user_link: { type: String },
    submitted_at: { type: Date, default: Date.now },
});

const FormSubmission = mongoose.model("DownloadSampleReportsMail", FormSubmissionSchema);

module.exports = FormSubmission;