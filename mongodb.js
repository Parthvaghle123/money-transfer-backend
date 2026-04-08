const mongoose = require('mongoose');
const mongoURI =  process.env.MONGO_URI

const Mongo = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB successfully");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    // Don't exit process in serverless environment - just log the error
  }
};

module.exports = Mongo;