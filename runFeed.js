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
        process.send({ status: "error", error: errorMessage });
      } else {
        console.log(errorMessage);
      }
      process.exit(1);
      return;
    }

    if (process.send) {
      process.send({ status: "completed" });
    }
    process.exit(0);
  } catch (err) {
    if (process.send) {
      process.send({ status: "error", error: formatError(err) });
    } else {
      console.log(formatError(err));
    }
    process.exit(1);
  }
})();
