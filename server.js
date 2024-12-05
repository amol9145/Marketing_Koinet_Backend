const express = require("express");
const cors = require("cors");
const dbConnect = require("./lib/dbconnect"); // Import the dbConnect function
const bodyParser = require("body-parser");
const ContactForm = require("./modal/ContactModal.js");
const nodemailer = require("nodemailer");
const upload = require("./upload/multerconfig");
const PressRelease = require("./modal/pressReleaseSchema.js");
const Infographics = require("./modal/InfographicsSchema.js");
const Reports = require("./modal/Reports.js");
require("dotenv").config();
const striptags = require("striptags");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const PaymentRazor = require("./modal/Payments.js");

// Initialize the app
const app = express();

// Middleware to enable CORS for all domains
app.use(
    cors({
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    })
);

// Middleware to parse JSON
app.use(express.json());
app.use(bodyParser.json());

// Connect to MongoDB
dbConnect(); // Call the function to establish the connection to MongoDB
// ****************************************************************************************************

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET,
});

app.post("/create-order", (req, res) => {
    const { amount } = req.body;

    try {
        const options = {
            amount: Number(amount),
            currency: "INR",
            receipt: crypto.randomBytes(10).toString("hex"),
        };

        razorpay.orders.create(options, (error, order) => {
            if (error) {
                console.log(error);
                return res.status(500).json({ message: "Something Went Wrong!" });
            }
            res.status(200).json({ data: order });
            console.log(order);
        });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error!" });
        console.log(error);
    }
});
app.post("/verify-payment", async(req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

    // console.log("req.body", req.body);

    try {
        // Create Sign
        const sign = razorpay_order_id + "|" + razorpay_payment_id;

        // Create ExpectedSign
        const expectedSign = crypto
            .createHmac("sha256", process.env.KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        // console.log(razorpay_signature === expectedSign);

        // Create isAuthentic
        const isAuthentic = expectedSign === razorpay_signature;

        // Condition
        if (isAuthentic) {
            const payment = new PaymentRazor({
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
            });

            // Save Payment
            await payment.save();

            // Send Message
            res.json({
                message: "Payement Successfully",
            });
        }
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error!" });
        console.log(error);
    }
});

app.post("/send-email", async(req, res) => {
    const {
        user_name,
        user_company,
        user_email,
        user_phone,
        user_message,
        user_link,
    } = req.body;

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            },
            debug: true, // Enable debug output
            logger: true, // Log information
        });

        const emailHtml = `
            <h3>This is the sample form link</h3>

           <a href="${user_link}" target="_blank">Download PDF</a>

        `;

        const options = {
            from: "amol@koinetmedia.com",
            to: user_email,
            subject: "New Contact Form Submission",
            html: emailHtml,
        };

        await transporter.sendMail(options);

        res.status(200).json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to send email." });
    }
});
// contact form
app.post("/marketing/contact_form", async(req, res) => {
    try {
        const {
            name,
            email,
            companyName,
            phoneNumber,
            country,
            streetAddress,
            city,
            postalCode,
            notes,
        } = req.body;

        // Validate required fields
        if (!name ||
            !email ||
            !companyName ||
            !phoneNumber ||
            !country ||
            !streetAddress ||
            !city ||
            !postalCode
        ) {
            return res.status(400).json({ error: "All fields are required." });
        }

        // Save the form data to the database
        const form = new ContactForm({
            name,
            email,
            companyName,
            phoneNumber,
            country,
            streetAddress,
            city,
            postalCode,
            notes,
        });
        await form.save();

        // Configure Nodemailer
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER, // Use environment variable
                pass: process.env.EMAIL_PASS,
            },
            tls: { rejectUnauthorized: false },
        });

        // Define the email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: "amol@koinetmedia.com",
            subject: "Form Submission Confirmation",
            text: `Hi ${name},\n\nThank you for submitting the form.\n\nDetails:\nName: ${name}\nCompany: ${companyName}\nPhone: ${phoneNumber}\nCountry: ${country}\nStreet Address: ${streetAddress}\nCity: ${city}\nPostal Code: ${postalCode}\nNotes: ${notes}\n\nWe will get back to you shortly.\n\nBest regards,\nKoinet Media Ites Pvt Ltd`,
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        // Respond to the client
        res.status(201).json({
            message: "Form submitted successfully and email sent!",
            form,
        });
    } catch (error) {
        console.error("Error saving form or sending email:", error.message);
        res.status(500).json({
            error: "An error occurred while saving the form or sending the email.",
        });
    }
});

//get contact form data
app.get("/marketing/contact_form_data", async(req, res) => {
    try {
        // Fetch all form submissions from the database
        const forms = await ContactForm.find();

        // If no forms are found
        if (!forms || forms.length === 0) {
            return res
                .status(404)
                .json({ error: "No contact form submissions found." });
        }

        // Respond with the retrieved form data
        res.status(200).json({
            message: "Form submissions retrieved successfully.",
            forms,
        });
    } catch (error) {
        console.error("Error retrieving form submissions:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving the form submissions.",
        });
    }
});
// ************************************************************************************************************
//upload press release
app.post("/upload_press_release", upload.single("file"), async(req, res) => {
    try {
        const { title, category, description, reportId } = req.body;

        // Ensure the file path is valid
        const filePath = req.file ? `/uploads/${req.file.filename}` : null;

        // Create a new press release document
        const newPressRelease = new PressRelease({
            title,
            category,
            description, // Store the string content
            reportId,
            filePath,
        });

        // Save press release to the database
        const savedPressRelease = await newPressRelease.save();
        res.status(201).json({
            message: "Press release created successfully",
            data: savedPressRelease,
        });
    } catch (err) {
        res.status(500).json({
            error: "Failed to create press release",
            details: err.message,
        });
    }
});

//get press release
app.get("/get_data_press_releases", async(req, res) => {
    try {
        const pressReleases = await PressRelease.find();

        // Strip HTML tags from the description field
        const sanitizedData = pressReleases.map((release) => ({
            ...release.toObject(),
            description: striptags(release.description),
        }));

        res.status(200).json({
            message: "Press releases fetched successfully",
            data: sanitizedData,
        });
    } catch (err) {
        res.status(500).json({
            error: "Failed to fetch press releases",
            details: err.message,
        });
    }
});

//get press release by id
app.get("/get_data_press_releases/:id", async(req, res) => {
    try {
        const { id } = req.params;

        // Find the press release by its ID
        const pressRelease = await PressRelease.findById(id);

        if (!pressRelease) {
            return res.status(404).json({
                error: "Press release not found",
            });
        }

        // Send the press release data without modifying the description field
        res.status(200).json({
            message: "Press release fetched successfully",
            data: pressRelease.toObject(), // Converts Mongoose document to plain object
        });
    } catch (err) {
        res.status(500).json({
            error: "Failed to fetch press release",
            details: err.message,
        });
    }
});

//upload infographics
app.post("/infographics", upload.single("file"), async(req, res) => {
    try {
        const {
            title,
            category,
            singleUserPrice,
            multiUserPrice,
            enterprisePrice,
            summary,
            tableOfContents,
            methodology,
            infographics,
            reportId,
            imageUrl,
        } = req.body;

        const newReport = new Infographics({
            title,
            category,
            singleUserPrice: Number(singleUserPrice),
            multiUserPrice: Number(multiUserPrice),
            enterprisePrice: Number(enterprisePrice),
            summary,
            tableOfContents,
            methodology,
            infographics,
            reportId,
            imageUrl,
            filePath: req.file ? req.file.path : null,
        });

        await newReport.save();
        res
            .status(201)
            .json({ message: "Report created successfully!", data: newReport });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

// get Infographics
// Backend API to fetch infographics
app.get("/get_infographics", async(req, res) => {
    const {
        page = 1,
            limit = 10,
            sortBy = "createdAt",
            order = "desc",
    } = req.query;

    try {
        // Fetch the infographics, applying sorting and pagination
        const infographics = await Infographics.find()
            .sort({
                [sortBy]: order === "desc" ? -1 : 1,
            }) // Sorting
            .skip((page - 1) * limit) // Pagination logic
            .limit(Number(limit));

        const totalCount = await Infographics.countDocuments();

        // Optionally, sanitize description if it contains HTML
        const sanitizedData = infographics.map((infographic) => ({
            ...infographic.toObject(),
            description: striptags(infographic.description), // Remove HTML tags from the description
        }));

        // Send the correct response back to the client
        res.status(200).json({
            message: "Infographics fetched successfully",
            data: sanitizedData, // Make sure this is an array
            total: totalCount,
            page: Number(page),
            limit: Number(limit),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Internal Server Error",
            error,
        });
    }
});

//get infographics by id
// Backend API to fetch infographics by ID
app.get("/get_infographic/:id", async(req, res) => {
    const { id } = req.params;

    try {
        const infographic = await Infographics.findById(id);

        if (!infographic) {
            return res.status(404).json({
                message: "Infographic not found",
            });
        }

        const sanitizedData = {
            ...infographic.toObject(),
            description: striptags(infographic.description),
        };

        res.status(200).json({
            message: "Infographic fetched successfully",
            data: sanitizedData,
        });
    } catch (error) {
        console.error("Error fetching infographic:", error);
        res.status(500).json({
            message: "Internal Server Error",
            error,
        });
    }
});

//upload reports
app.post("/reports", upload.single("file"), async(req, res) => {
    try {
        const {
            title,
            category,
            singleUserPrice,
            multiUserPrice,
            enterprisePrice,
            summary,
            tableOfContents,
            methodology,
            downloadSampleReport,
            reportId,
        } = req.body;

        const newReport = new Reports({
            title,
            category,
            singleUserPrice: Number(singleUserPrice),
            multiUserPrice: Number(multiUserPrice),
            enterprisePrice: Number(enterprisePrice),
            summary,
            tableOfContents,
            methodology,
            downloadSampleReport,
            reportId,
            filePath: req.file ? req.file.path : null,
        });

        await newReport.save();
        res
            .status(201)
            .json({ message: "Report created successfully!", data: newReport });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

// get all reports
app.get("/get_reports", async(req, res) => {
    const {
        page = 1,
            limit = 10,
            sortBy = "createdAt",
            order = "desc",
    } = req.query;

    try {
        // Fetch the reports, applying sorting and pagination
        const reports = await Reports.find()
            .sort({
                [sortBy]: order === "desc" ? -1 : 1,
            }) // Sorting
            .skip((page - 1) * limit) // Pagination logic
            .limit(Number(limit));

        const totalCount = await Reports.countDocuments();

        // Optionally, sanitize description if it contains HTML
        const sanitizedData = reports.map((report) => ({
            ...report.toObject(),
            description: striptags(report.description), // Remove HTML tags from the description
        }));

        // Send the correct response back to the client
        res.status(200).json({
            message: "Reports fetched successfully",
            data: sanitizedData, // Array of reports
            total: totalCount, // Total number of reports
            page: Number(page), // Current page
            limit: Number(limit), // Limit per page
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Internal Server Error",
            error,
        });
    }
});

//get report details by id
app.get("/get_report/:id", async(req, res) => {
    const { id } = req.params;

    try {
        // Find the report by ID
        const report = await Reports.findById(id);
        // If the report does not exist, return a 404 response
        if (!report) {
            return res.status(404).json({
                message: "Report not found",
            });
        }

        // Sanitize the report data (optional)
        const sanitizedData = {
            ...report.toObject(),
            summary: report.summary, // Sanitize HTML if needed
        };

        // Send the sanitized report data in the response
        res.status(200).json({
            message: "Report fetched successfully",
            data: sanitizedData,
        });
    } catch (error) {
        console.error("Error fetching report:", error);
        res.status(500).json({
            message: "Internal Server Error",
            error,
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});