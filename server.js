const process = require('process');

process.on('uncaughtException', err => {
  console.log('Caught exception: ', err);
});

const {
  getFeedDefaultPolicy,
  getFeeds,
  runNextFeedFactory,
} = require('./helpers/rss');

console.log(`Started ${ new Date() }`);

const feeds = getFeeds();
const runNextFeed = runNextFeedFactory(feeds, {
  topDefaultPolicy: getFeedDefaultPolicy(),
});

runNextFeed()
  .then(() => {
    console.log(`\r\nCompleted ${ new Date() }`);
  });
