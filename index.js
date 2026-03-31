const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const Mongo = require("./mongodb");


const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(cors());
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  session({
    secret: "secret_key_123",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

app.use("/api/user", require("./routes/user"));
app.use("/api/company", require("./routes/company"));
app.use("/api/role-assignment", require("./routes/role-assignment"));
app.use("/api/bank-account", require("./routes/bank-account"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/transaction", require("./routes/transaction"));
app.use("/api/denomination", require("./routes/denomination"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/withdraw", require("./routes/withdraw"));
app.use("/api/permissions", require("./routes/permissions"));


// Test Route
app.get("/", (req, res) => {
  res.send("API is running successfully ");
});

// Connect Mongo
Mongo();



// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
