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
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const PaymentRazor = require("./modal/Payments.js");
const FormSubmission = require("./modal/DownloadSampleReportsMail.js");
const contactSchema = require("./modal/ContactPage.js");

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

app.post("/create-order", async(req, res) => {
    const { amount } = req.body;

    if (!amount) return res.status(400).json({ message: "Amount is required" });

    try {
        const options = {
            amount: Number(amount), // Amount in paise
            currency: "INR",
            receipt: crypto.randomBytes(10).toString("hex"),
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json({ data: order });
    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ message: "Failed to create Razorpay order" });
    }
});

// Route to Verify Payment and Save Details
app.post("/verify-payment", async(req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount,
        currency,
    } = req.body;

    if (!razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature ||
        !amount ||
        !currency
    ) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.KEY_SECRET)
            .update(sign)
            .digest("hex");

        if (expectedSign !== razorpay_signature) {
            return res.status(400).json({ message: "Invalid payment signature" });
        }

        // Save payment details to the database
        const payment = new PaymentRazor({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
            currency,
        });

        await payment.save();
        res
            .status(200)
            .json({ message: "Payment successfully verified and saved" });
    } catch (error) {
        console.error("Error verifying payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

//Login Form
const users = [{
    email: "test@example.com",
    password: "$2a$10$E4Y/dK4TmVJdYcys5S3DZOih8h3XsFB4KqPwhFsiUm8.Mpz/rLR9a", // hashed password: "password123"
}, ];

app.use(bodyParser.json()); // Parse JSON bodies

// Login route
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    // Find user by email
    const user = users.find((u) => u.email === email);
    if (!user) {
        return res.status(400).json({ message: "Invalid credentials" });
    }

    // Compare password with hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
            return res.status(500).json({ message: "Error comparing passwords" });
        }

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Create JWT token
        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRETE, {
            expiresIn: "1h", // Token expires in 1 hour
        });

        return res.json({
            message: "Login successful",
            token,
        });
    });
});

// get all order
app.get("/get-orders", async(req, res) => {
    const { from, to, count } = req.query; // Optional query params for filtering

    const options = {
        from: from ? Number(from) : undefined, // Timestamp for the start of the range
        to: to ? Number(to) : undefined, // Timestamp for the end of the range
        count: count ? Number(count) : 10, // Number of orders to fetch (default: 10)
    };

    try {
        const orders = await razorpay.orders.all(options);
        res.status(200).json({ data: orders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
});

// get all order with id
app.get("/get-order-details/:orderId", async(req, res) => {
    const { orderId } = req.params; // Get order ID from the URL parameters

    try {
        // Fetch the order details from Razorpay
        const orderDetails = await razorpay.orders.fetch(orderId);
        res.status(200).json({ data: orderDetails }); // Send order details as response
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).json({ message: "Failed to fetch order details" });
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
        // Save the data to the database
        const newSubmission = new FormSubmission({
            user_name,
            user_company,
            user_email,
            user_phone,
            user_message,
            user_link,
        });

        await newSubmission.save();

        // Send the email
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER, // Your email address
                pass: process.env.EMAIL_PASS, // Your email password
            },
            tls: {
                rejectUnauthorized: false,
            },
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

        res
            .status(200)
            .json({ message: "Email sent and data saved successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to send email or save data." });
    }
});

//contact page form
app.post("/marketing/contact_page_data", async(req, res) => {
    try {
        const contactData = new contactSchema(req.body);
        await contactData.save();
        res.status(200).send({ message: "Form submitted successfully!" });
    } catch (error) {
        res.status(500).send({ error: "Error saving form data" });
    }
});

// contact page form
app.get("/marketing/contact_page_data", async(req, res) => {
    try {
        // Fetch all contact submissions from the database
        const contactData = await contactSchema.find();
        res.status(200).send(contactData);
    } catch (error) {
        res.status(500).send({ error: "Error fetching contact form data" });
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

// Update press release
app.put(
    "/update_press_release/:id",
    upload.single("file"),
    async(req, res) => {
        try {
            const { id } = req.params;
            const { title, category, description, reportId } = req.body;

            // Find the press release by its ID
            const pressRelease = await PressRelease.findById(id);

            if (!pressRelease) {
                return res.status(404).json({
                    error: "Press release not found",
                });
            }

            // Update the press release data
            pressRelease.title = title || pressRelease.title;
            pressRelease.category = category || pressRelease.category;
            pressRelease.description = description || pressRelease.description;
            pressRelease.reportId = reportId || pressRelease.reportId;

            // If a new file is uploaded, update the file path
            if (req.file) {
                pressRelease.filePath = `/uploads/${req.file.filename}`;
            }

            // Save the updated press release document
            const updatedPressRelease = await pressRelease.save();

            res.status(200).json({
                message: "Press release updated successfully",
                data: updatedPressRelease,
            });
        } catch (err) {
            res.status(500).json({
                error: "Failed to update press release",
                details: err.message,
            });
        }
    }
);

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