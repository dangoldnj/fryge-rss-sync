const feedRead = require('davefeedread');
const timeOutSecs = 30;

const { getDefaultPolicy } = require('./getDefaultPolicy');
const { runNextItemFactory } = require('./runNextItemFactory');

const runNextFeedFactory = (feeds, options) => {
  const {
    topDefaultPolicy = {},
  } = options;
  const maxFeeds = feeds.length;
  let currentFeed = -1;

  const runNextFeed = () => {
    return new Promise(resolve => {
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
        feedItemPolicy,
      );

      console.log(`\nLoading the feed '${ name }' at '${ rss }':`);
      feedRead.parseUrl(rss, timeOutSecs, (err, parsedFeed) => {
        if (err) {
          console.log(`!! Error while processing feed '${ name }': ${ err }`);
          const nextOptions = {
            items: [],
            policy,
            runNextFeed,
            title: name,
          };
          const runNextItem = runNextItemFactory(nextOptions);
          const nextFeed = runNextItem();
          resolve(nextFeed);
          return nextFeed;
        }

        const {
          head: {
            title,
          },
          items = [],
        } = parsedFeed;
        console.log(`>> Found: ${ title }`);
        const nextOptions = {
          items,
          policy,
          runNextFeed,
          title,
        };
        const runNextItem = runNextItemFactory(nextOptions);
        const nextItem = runNextItem();
        resolve(nextItem);
        return nextItem;
      });
    });
  };

  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
