const { getFeedDefaultPolicy, getFeeds } = require("./helpers/rss/getFeeds");
const { runFeedFactory } = require("./helpers/rss/runFeedFactory");
const { formatError } = require("./helpers/local/formatError");
const { fork } = require("child_process");
const path = require("path");

console.log(`Started ${new Date()}`);

process.on("uncaughtException", (err) => console.log("Caught exception:", err));

const runChildProcess = (runFeedScript, feedIdx) =>
  new Promise((resolve, reject) => {
    const child = fork(runFeedScript, [feedIdx]);
    let lastMessage = null;

    child.on("message", (msg) => {
      lastMessage = msg;
    });

    child.on("exit", (code, signal) => {
      if (!code && !signal) {
        resolve(lastMessage);
        return;
      }

      if (lastMessage && lastMessage.status === "error") {
        reject(new Error(lastMessage.error));
        return;
      }

      if (signal) {
        reject(new Error(`Child ${feedIdx} was killed with signal ${signal}`));
        return;
      }

      reject(new Error(`Child ${feedIdx} exited with code ${code}`));
    });

    child.on("error", (err) => {
      reject(err);
    });
  });

(async () => {
  const feeds = getFeeds();
  const feedRunFunctions = runFeedFactory(feeds, {
    topDefaultPolicy: getFeedDefaultPolicy(),
  });

  const formatDuration = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const feedSummaries = [];
  const overallStartedAt = Date.now();
  const runFeedScript = path.resolve(__dirname, "runFeed.js");
  for (let feedIdx = 0; feedIdx < feedRunFunctions.length; feedIdx++) {
    const feedName = feeds[feedIdx]?.name || `index ${feedIdx}`;
    try {
      const message = await runChildProcess(runFeedScript, feedIdx);
      const summary = message || {};
      feedSummaries.push({
        deepCheck: summary.deepCheck,
        feed: summary.feed || feedName,
        skipped: summary.skipped,
        stats: summary.stats,
        status: summary.status || "completed",
        timing: summary.timing,
      });
    } catch (error) {
      console.log(`Feed '${feedName}' failed: ${formatError(error)}`);
      feedSummaries.push({
        error: formatError(error),
        feed: feedName,
        status: "failed",
      });
    }
  }

  console.log("\n.. Feed Summary ..");

  const totals = feedSummaries.reduce(
    (acc, summary) => {
      if (summary.status !== "completed" || !summary.stats) return acc;
      acc.itemsSeen += Number(summary.stats.itemsSeen) || 0;
      acc.itemsDownloaded += Number(summary.stats.itemsDownloaded) || 0;
      acc.itemsErrored += Number(summary.stats.itemsErrored) || 0;
      return acc;
    },
    { itemsSeen: 0, itemsDownloaded: 0, itemsErrored: 0 },
  );

  const counts = feedSummaries.reduce(
    (acc, summary) => {
      if (summary.status === "completed") acc.completed += 1;
      if (summary.skipped) acc.skipped += 1;
      if (summary.status === "failed") acc.failed += 1;
      return acc;
    },
    { completed: 0, skipped: 0, failed: 0 },
  );

  const overallDuration = Date.now() - overallStartedAt;
  console.log(
    `Feeds: ${counts.completed} completed, ${counts.skipped} skipped, ${counts.failed} failed in ${formatDuration(overallDuration)}`,
  );
  console.log(
    `Items: ${totals.itemsSeen} seen, ${totals.itemsDownloaded} downloaded, ${totals.itemsErrored} errors in ${formatDuration(overallDuration)}`,
  );
  console.log(`\r\nCompleted ${new Date()}`);
  process.exit();
})();
