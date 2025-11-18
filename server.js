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
        resolve();
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

  const runFeedScript = path.resolve(__dirname, "runFeed.js");
  for (let feedIdx = 0; feedIdx < feedRunFunctions.length; feedIdx++) {
    const feedName = feeds[feedIdx]?.name || `index ${feedIdx}`;
    try {
      await runChildProcess(runFeedScript, feedIdx);
    } catch (error) {
      console.log(`Feed '${feedName}' failed: ${formatError(error)}`);
    }
  }

  console.log(`\r\nCompleted ${new Date()}`);
  process.exit();
})();
