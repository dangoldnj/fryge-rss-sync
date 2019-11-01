const process = require('process');

process.on('uncaughtException', err => {
  console.log('Caught exception: ', err);
});

const {
  getFeedDefaultPolicy,
  getFeeds,
  runNextFeedFactory,
} = require('./helpers/rss');

console.log(`Starting ${ new Date() }`);

const feeds = getFeeds();
const runNextFeed = runNextFeedFactory(feeds, {
  topDefaultPolicy: getFeedDefaultPolicy(),
});

runNextFeed();

console.log(`Completed ${ new Date() }`);
