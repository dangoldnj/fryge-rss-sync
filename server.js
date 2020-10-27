console.log(`Started ${ new Date() }`);

const {
  getFeedDefaultPolicy,
  getFeeds,
  runNextFeedFactory,
} = require('./helpers/rss');

(async () => {
  process.on('uncaughtException', err =>
    console.log('Caught exception:', err));

  const feeds = getFeeds();

  const runNextFeed = runNextFeedFactory(feeds, {
    topDefaultPolicy: getFeedDefaultPolicy(),
  });

  await runNextFeed();

  console.log(`\r\nCompleted ${ new Date() }`);
})();
