const process = require('process');

process.on('uncaughtException', err => {
  console.log('Caught exception: ', err);
});

const {
  getFeeds,
  runNextFeedFactory,
} = require('./helpers/rss');

const feeds = getFeeds();
const runNextFeed = runNextFeedFactory(feeds);

runNextFeed();
