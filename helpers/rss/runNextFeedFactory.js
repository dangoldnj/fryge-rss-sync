const RssParser = require('rss-parser');

const { getDefaultPolicy } = require('./getDefaultPolicy');
const { runNextItemFactory } = require('./runNextItemFactory');

const runNextFeedFactory = feeds => {
  const maxFeeds = feeds.length;
  const parser = new RssParser();
  let currentFeed = -1;

  const runNextFeed = () => {
    currentFeed++;
    if (currentFeed >= maxFeeds) {
      return;
    }
    const {
      name,
      policy: foundPolicy = {},
      rss,
    } = feeds[currentFeed];

    const policy = Object.assign({},
      getDefaultPolicy(),
      foundPolicy
    );

    console.log(`\nLoading the feed '${ name }' at '${ rss }':`);
    parser.parseURL(rss)
      .then(parsedFeed => {
        const {
          items = [],
          title,
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
      })
      .catch(err => {
        console.log(`Error while processing feed '${ name }': ${ err }`);
        runNextFeed();
      });
  };
  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
