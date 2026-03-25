const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load env vars
dotenv.config({});
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const connectDB = require("./config/db");
const { startScheduler } = require("./services/scheduler");

// Connect to database
connectDB();

const app = express();

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://grandios-bgx4.vercel.app",
  "http://87.106.111.51",
  "https://bonus.grandiosonline.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
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
  const instanceId = process.env.NODE_APP_INSTANCE;
  console.log(
    `Server running on port ${PORT} (instance ${instanceId || "standalone"})`,
  );

  // Only instance 0 (or standalone mode without PM2) runs the scheduler.
  // PM2 cluster mode spawns 4 workers; without this guard all 4 would
  // start duplicate schedulers hitting the WAWI API simultaneously.
  if (!instanceId || instanceId === "0") {
    startScheduler({
      incrementalIntervalMs: 60 * 60 * 1000, // 1 hour
      dailyHour: 2,
      dailyMinute: 0,
      runImmediately: false, // Set to true to run sync on server start
    });
  } else {
    console.log(
      `[Instance ${instanceId}] Skipping scheduler (handled by instance 0)`,
    );
  }
});
