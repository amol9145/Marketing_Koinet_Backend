const mongoose = require("mongoose");

const dbConnect = async() => {
    try {
        await mongoose.connect(
            "mongodb+srv://Koinet_Media:koinetmedia.com@cluster0.fkuch.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        );
        console.log("Connected to MongoDB!");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
    }
};

module.exports = dbConnect;