/**
 * Scheduler Service
 * Handles automatic sync with WAWI using cascading sync
 * - Incremental sync every hour (recent orders only)
 * - Full sync once daily at 2:00 AM
 * - Auto-creates discount groups when customer has 3+ orders
 */

const cascadeSyncService = require('./cascadingSyncService');

let incrementalInterval = null;
let dailyInterval = null;
let lastIncrementalRun = null;
let lastDailyRun = null;

// Default schedule settings
const INCREMENTAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INCREMENTAL_HOURS_BACK = 2; // Look back 2 hours for recent orders
const DAILY_HOUR = 2; // Run full sync at 2:00 AM
const DAILY_MINUTE = 0;

/**
 * Run incremental sync (recent orders only)
 * Does not throw - logs errors and continues
 */
async function runIncrementalSync() {
  console.log('[Scheduler] Running incremental sync at', new Date().toISOString());
  lastIncrementalRun = new Date();

  try {
    const result = await cascadeSyncService.runIncrementalSync({
      hoursBack: INCREMENTAL_HOURS_BACK,
    });

    if (result) {
      console.log('[Scheduler] Incremental sync completed:', {
        customers: result.progress.customers,
        orders: result.progress.orders,
        discountGroups: result.progress.discountGroups,
        errors: result.errors?.length || 0,
        skipped: result.skipped || 0,
      });
    }

    return result;
  } catch (err) {
    console.error('[Scheduler] Incremental sync failed:', err.message);
    // Don't throw - scheduler should continue running
    return { error: err.message, progress: { customers: 0, orders: 0, discountGroups: 0 } };
  }
}

/**
 * Run full daily sync (all customers and orders)
 * Does not throw - logs errors and continues
 */
async function runDailySync() {
  console.log('[Scheduler] Running full daily sync at', new Date().toISOString());
  lastDailyRun = new Date();

  try {
    const result = await cascadeSyncService.runFullCascadeSync({
      batchSize: 50,
    });

    console.log('[Scheduler] Full daily sync completed:', {
      customers: result.progress.customers,
      orders: result.progress.orders,
      products: result.progress.products,
      discountGroups: result.progress.discountGroups,
      errors: result.errors?.length || 0,
      skipped: result.skipped || 0,
    });

    return result;
  } catch (err) {
    console.error('[Scheduler] Full daily sync failed:', err.message);
    // Don't throw - scheduler should continue running
    return { error: err.message, progress: { customers: 0, orders: 0, products: 0, discountGroups: 0 } };
  }
}

/**
 * Check if it's time for daily sync
 */
function shouldRunDailySync(targetHour = DAILY_HOUR, targetMinute = DAILY_MINUTE) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour === targetHour && currentMinute === targetMinute) {
    // Prevent running multiple times in the same minute
    if (lastDailyRun) {
      const diffMs = now - lastDailyRun;
      const diffMinutes = diffMs / (1000 * 60);
      if (diffMinutes < 60) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Start the scheduler
 * @param {Object} options - Scheduler options
 * @param {number} options.incrementalIntervalMs - Interval for incremental sync in ms (default: 1 hour)
 * @param {number} options.incrementalHoursBack - Hours to look back for recent orders (default: 2)
 * @param {number} options.dailyHour - Hour for daily full sync (default: 2)
 * @param {number} options.dailyMinute - Minute for daily full sync (default: 0)
 * @param {boolean} options.runImmediately - Run incremental sync immediately on start (default: false)
 */
function startScheduler(options = {}) {
  const {
    incrementalIntervalMs = INCREMENTAL_INTERVAL_MS,
    dailyHour = DAILY_HOUR,
    dailyMinute = DAILY_MINUTE,
    runImmediately = false,
  } = options;

  if (incrementalInterval || dailyInterval) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log('[Scheduler] Starting automatic sync scheduler:');
  console.log(`  - Incremental sync: every ${incrementalIntervalMs / 60000} minutes`);
  console.log(`  - Full daily sync: at ${dailyHour}:${dailyMinute.toString().padStart(2, '0')}`);

  // Start incremental sync interval
  incrementalInterval = setInterval(() => {
    runIncrementalSync().catch(err => {
      console.error('[Scheduler] Incremental sync error:', err.message);
    });
  }, incrementalIntervalMs);

  // Start daily sync checker (checks every minute)
  dailyInterval = setInterval(() => {
    if (shouldRunDailySync(dailyHour, dailyMinute)) {
      runDailySync().catch(err => {
        console.error('[Scheduler] Daily sync error:', err.message);
      });
    }
  }, 60000);

  // Run immediately if requested
  if (runImmediately) {
    console.log('[Scheduler] Running initial sync...');
    runIncrementalSync().catch(err => {
      console.error('[Scheduler] Initial sync error:', err.message);
    });
  }

  console.log('[Scheduler] Scheduler started successfully');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (incrementalInterval) {
    clearInterval(incrementalInterval);
    incrementalInterval = null;
  }
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
  console.log('[Scheduler] Stopped');
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    isRunning: !!(incrementalInterval || dailyInterval),
    lastIncrementalRun,
    lastDailyRun,
    nextDailyRun: getNextDailyRunTime(),
    syncStatus: cascadeSyncService.getCascadeStatus(),
  };
}

/**
 * Calculate next daily run time
 */
function getNextDailyRunTime(hour = DAILY_HOUR, minute = DAILY_MINUTE) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Manually trigger incremental sync
 */
async function triggerIncrementalSync() {
  return runIncrementalSync();
}

/**
 * Manually trigger full sync
 */
async function triggerFullSync() {
  return runDailySync();
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerIncrementalSync,
  triggerFullSync,
};
