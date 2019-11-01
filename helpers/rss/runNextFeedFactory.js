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
    currentFeed++;
    if (currentFeed >= maxFeeds) {
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
        console.log(`Error while processing feed '${ name }': ${ err }`);
        runNextFeed();
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
        runNextItem();
      }
    });
  };
  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
