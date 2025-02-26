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
const UserSchema = require("./modal/UserSchema.js");
const jwt = require("jsonwebtoken");

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
            amount: Number(amount), // Convert amount to paise
            currency: "INR",
            receipt: crypto.randomBytes(10).toString("hex"),
        };

        // Create Razorpay order
        const order = await razorpay.orders.create(options);
        console.log("Created Order:", order); // Log for debugging

        // Generate JWT token with order details
        const token = jwt.sign({
                orderId: order.id,
                amount: amount,
                currency: order.currency,
            },
            process.env.JWT_SECRETE, // Ensure JWT_SECRET is set correctly
            { expiresIn: "1h" } // Token expires in 1 hour
        );

        // Send order and token to the frontend
        res.status(200).json({
            data: order,
            token: token, // Include token in response
        });
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

app.post("/register_new_user", async(req, res) => {
    const { firstName, lastName, email, phone, password, role } = req.body;

    try {
        // Check if user already exists
        const existingUser = await UserSchema.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new UserSchema({
            firstName,
            lastName,
            email,
            phone,
            password: hashedPassword,
            role,
        });

        await newUser.save();

        // Generate token
        const token = jwt.sign({ id: newUser._id, role: newUser.role },
            process.env.JWT_SECRETE, { expiresIn: "1h" }
        );

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role,
            },
            token,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Login route
app.post("/login", async(req, res) => {
    const { email, password } = req.body;

    try {
        // Check if user exists
        const user = await UserSchema.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Compare provided password with the stored hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Generate token
        const token = jwt.sign({ id: user._id, role: user.role },
            process.env.JWT_SECRETE, { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
            },
            token,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
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
        report_title,
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
            report_title,
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
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Email Template</title>
                    </head>
                <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; display: flex; justify-content: flex-start; align-items: flex-start;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; margin: 0; padding: 20px;">
                        <tr>
                            <td align="left">
                <img src="https://koinet-marketing-front-arxz.vercel.app/assets/logo2-BTMFoVIS.jpg" 
                    alt="logo" 
                    style="display: block; width: 40%; height: auto; margin-bottom: 20px;" />
                                <p style="font-size: 18px; font-weight: bold;">Dear ${user_name},</p>

                                <p style="font-size: 16px; margin-bottom: 20px;">
                                    Thank you for requesting the sample report on the <span style="font-weight: bold; color: #007bff;">${report_title}</span>.
                                    We appreciate your interest and are excited about the opportunity to assist you.
                                    Our team is currently processing your request, and you will receive the sample report shortly at the email address provided.
                                    In the meantime, if you have any specific requirements or queries, please feel free to let us know. We would be delighted to address your needs and explore potential collaboration opportunities.
                                </p>
                                  <p style="text-align: center; margin: 30px 0;">
                                    <a href="${user_link}" target="_blank" 
                                    style="background-color: #007bff; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-size: 16px; font-weight: bold;">
                                        📥 Download Your Report
                                    </a>
                                 </p>

                                <p style="font-size: 16px; margin-bottom: 20px;">
                                    Thank you for considering Koinet Market Research.
                                </p>

                                <p style="font-size: 16px; font-weight: bold;">Best regards,</p>
                                <p style="font-size: 16px; margin-bottom: 20px;">Koinet Market Research</p>

                                <p style="font-size: 16px;">
                                    <strong>Email:</strong> info@koinetmedia.com<br>
                                    <strong>Phone:</strong> +91 90215 68448<br>
                                    <strong>Address:</strong>Kharadi,pune,Maharashtra,India,411014<br>
                                    <strong>Website:</strong> <a href="https://koinet-marketing-front-arxz.vercel.app/" target="_blank">https://koinet-marketing-front-arxz.vercel.app/</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
`;

        const options = {
            from: "amol@koinetmedia.com",
            to: user_email,
            subject: "Inquiry for Download Sample Report - Koinet Market Research",
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
            licenseType, // "single", "multi", or "enterprise"
            allowedEmails, // Array of emails for multi-user license
            currentUserEmail, // Current user's email for single-user license
        } = req.body;

        // Validate license type and allowedEmails
        if (licenseType === "multi" && (!allowedEmails || !allowedEmails.length)) {
            return res
                .status(400)
                .json({ message: "For multi-user license, provide allowedEmails." });
        }

        if (licenseType === "single" && !currentUserEmail) {
            return res.status(400).json({
                message: "For single-user license, provide currentUserEmail.",
            });
        }

        // Generate a unique token for the report
        const token = jwt.sign({
                reportId: reportId || uuidv4(),
                licenseType,
            },
            process.env.JWT_SECRETE, { expiresIn: "30d" } // Token expires in 30 days
        );

        const newReport = new Reports({
            title,
            category,
            singleUserPrice: Number(singleUserPrice),
            multiUserPrice: Number(multiUserPrice),
            enterprisePrice: Number(enterprisePrice),
            summary: summary || "", // Default to empty string
            tableOfContents: tableOfContents || "", // Default to empty string
            methodology: methodology || "", // Default to empty string
            downloadSampleReport: downloadSampleReport || "", // Default to empty string
            reportId,
            filePath: req.file ? req.file.path : null,
            token,
            licenseType: licenseType || "enterprise", // Default to "enterprise"
            allowedEmails: licenseType === "multi" ? allowedEmails : [], // Default to empty array
            currentUserEmail: licenseType === "single" ? currentUserEmail : "", // Default to empty string
        });

        await newReport.save();

        res.status(201).json({
            message: "Report created successfully!",
            data: {
                ...newReport._doc,
                licenseType,
                accessDetails: licenseType === "single" ? { currentUserEmail } : licenseType === "multi" ? { allowedEmails } : "Enterprise license allows access to all users.",
                token,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

// Get All Reports Route (GET /get_reports)
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
            })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const totalCount = await Reports.countDocuments();

        // Optionally, sanitize description if it contains HTML
        const sanitizedData = reports.map((report) => ({
            ...report.toObject(),
            description: striptags(report.description), // Remove HTML tags from description
        }));

        res.status(200).json({
            message: "Reports fetched successfully",
            data: sanitizedData,
            total: totalCount,
            page: Number(page),
            limit: Number(limit),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

app.get("/reports/:id", async(req, res) => {
    try {
        const { id } = req.params;
        // Find the report by ID
        const report = await Reports.findById(id);
        if (!report) {
            return res.status(404).json({ message: "Report not found." });
        }

        // Return the report details as JSON response
        res.status(200).json({
            message: "Report details fetched successfully.",
            data: report,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});

// Update Report Route (PATCH /reports/:id)
app.put("/reports_update/:id", upload.single("file"), async(req, res) => {
    const { id } = req.params;

    // Validate the id
    if (!id) {
        return res.status(400).json({ message: "Invalid or missing report ID." });
    }

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
            licenseType, // "single", "multi", or "enterprise"
            allowedEmails, // Array of emails for multi-user license
            currentUserEmail, // Current user's email for single-user license
        } = req.body;

        // Fetch the existing report to update
        const report = await Reports.findById(id);
        if (!report) {
            return res.status(404).json({ message: "Report not found." });
        }

        // Validate license type and allowedEmails
        if (licenseType === "multi" && (!allowedEmails || !allowedEmails.length)) {
            return res.status(400).json({ message: "For multi-user license, provide allowedEmails." });
        }

        if (licenseType === "single" && !currentUserEmail) {
            return res.status(400).json({
                message: "For single-user license, provide currentUserEmail.",
            });
        }

        // Update fields if provided
        if (title) report.title = title;
        if (category) report.category = category;
        if (singleUserPrice) report.singleUserPrice = singleUserPrice;
        if (multiUserPrice) report.multiUserPrice = multiUserPrice;
        if (enterprisePrice) report.enterprisePrice = enterprisePrice;
        if (summary) report.summary = summary;
        if (tableOfContents) report.tableOfContents = tableOfContents;
        if (methodology) report.methodology = methodology;
        if (downloadSampleReport) report.downloadSampleReport = downloadSampleReport;

        // If it's a multi-user or enterprise license, update allowedEmails
        if (licenseType === "multi" && allowedEmails) {
            report.allowedEmails = allowedEmails;
        }

        // If it's a single-user license, update currentUserEmail
        if (licenseType === "single" && currentUserEmail) {
            report.currentUserEmail = currentUserEmail;
        }

        // If there's a file, update the file path
        if (req.file) {
            report.filePath = req.file.path;
        }

        // Save the updated report
        await report.save();

        res.status(200).json({
            message: "Report updated successfully!",
            data: report,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error", error });
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});