const { runFeedFactory } = require("./helpers/rss/runFeedFactory");
const { getFeedDefaultPolicy, getFeeds } = require("./helpers/rss/getFeeds");
const { formatError } = require("./helpers/local/formatError");

const feedIdx = process.argv[2];
const feeds = getFeeds();
const feedRunFunctions = runFeedFactory(feeds, {
  topDefaultPolicy: getFeedDefaultPolicy(),
});

(async () => {
  try {
    const result = await feedRunFunctions[feedIdx]();
    if (!result || !result.success) {
      const errorMessage =
        result?.error ||
        `Feed ${result?.feed ?? feedIdx} failed with an unknown error.`;
      if (process.send) {
        process.send({
          error: errorMessage,
          feed: result?.feed ?? feedIdx,
          status: "error",
        });
      } else {
        console.log(errorMessage);
      }
      process.exit(1);
      return;
    }

    const { deepCheck, feed, skipped, stats = {}, timing } = result;

    if (process.send) {
      process.send({ deepCheck, feed, skipped, stats, status: "completed", timing });
    } else {
      console.log(
        `Feed '${feed}' completed` +
          (skipped ? " (skipped)" : "") +
          ` - stats: ${JSON.stringify(stats)} - timing: ${JSON.stringify(timing)}`,
      );
    }
    process.exit(0);
  } catch (err) {
    if (process.send) {
      process.send({ error: formatError(err), status: "error" });
    } else {
      console.log(formatError(err));
    }
    process.exit(1);
  }
})();
