const feedRead = require ('davefeedread');
const timeOutSecs = 30;

const { getDefaultPolicy } = require('./getDefaultPolicy');
const { runNextItemFactory } = require('./runNextItemFactory');

const runNextFeedFactory = (feeds, opts) => {
  const {
    topDefaultPolicy = {},
  } = opts;
  const maxFeeds = feeds.length;
  let currentFeed = -1;

  const runNextFeed = () => {
    return new Promise((resolve, reject) => {
      currentFeed++;
      if (currentFeed >= maxFeeds) {
        resolve(true);
        return;
      }
      const {
        name,
        policy: feedItemPolicy = {},
        rss,
      } = feeds[currentFeed];

      const policy = Object.assign({},
        getDefaultPolicy(),
        topDefaultPolicy,
        feedItemPolicy
      );

      console.log(`\nLoading the feed '${ name }' at '${ rss }':`);
      feedRead.parseUrl(rss, timeOutSecs, (err, parsedFeed) => {
        if (err) {
          console.log(`!! Error while processing feed '${ name }': ${ err }`);
          const opts = {
            items: [],
            policy,
            runNextFeed,
            title: name,
          };
          const runNextItem = runNextItemFactory(opts);
          const nextFeed = runNextItem();
          resolve(nextFeed);
          return nextFeed;
        } else {
          const {
            head: {
              title,
            },
            items = [],
          } = parsedFeed;
          console.log(`>> Found: ${ title }`);
          const opts = {
            items,
            policy,
            runNextFeed,
            title,
          };
          const runNextItem = runNextItemFactory(opts);
          const nextItem = runNextItem();
          resolve(nextItem);
          return nextItem;
        }
      });
    });
  };
  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
