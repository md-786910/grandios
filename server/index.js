const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const { startScheduler } = require("./services/scheduler");

// Load env vars
dotenv.config({});

// Connect to database
connectDB();

const app = express();

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://grandios-bgx4.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/discounts", require("./routes/discounts"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/queue", require("./routes/queue"));
app.use("/api/test", require("./routes/test"));
app.use("/api/wawi", require("./routes/wawi"));
app.use("/api/sync", require("./routes/sync"));
app.use("/api/purchase-history", require("./routes/purchaseHistory"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use(require("./middleware/errorHandler"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start automatic sync scheduler
  // - Incremental sync: every hour (syncs recent orders, creates customers if new)
  // - Full daily sync: at 2:00 AM
  // - Auto-creates discount groups when customer has 3+ orders
  startScheduler({
    incrementalIntervalMs: 60 * 60 * 1000, // 1 hour
    dailyHour: 2,
    dailyMinute: 0,
    runImmediately: false, // Set to true to run sync on server start
  });
});
