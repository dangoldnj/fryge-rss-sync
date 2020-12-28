const feedRead = require('davefeedread');
const path = require('path');

const { getDefaultPolicy } = require('./getDefaultPolicy');
const {
  ensureDirExists,
  filterUnsafeFilenameChars,
  writeItemMetadata,
} = require('../local');
const { runNextItemFactory } = require('./runNextItemFactory');

const TIME_OUT_SECS = 30;

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
      const { downloadRoot } = policy;

      console.log(`\nLoading the feed '${ name }' at '${ rss }':`);
      feedRead.parseUrl(rss, TIME_OUT_SECS, (err, parsedFeed) => {
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

        const metadataDirname = path.join(downloadRoot, 'metadata');
        ensureDirExists(metadataDirname);

        const {
          head: {
            title,
          },
          items = [],
        } = parsedFeed;
        console.log(`>> Found: ${ title }`);
        const safeTitle = filterUnsafeFilenameChars(title);
        const actualMetadataFilename = path.join(metadataDirname, `${ safeTitle }.json`);

        writeItemMetadata(actualMetadataFilename, parsedFeed.head)
          .then(() => {
            const nextOptions = {
              items,
              policy,
              runNextFeed,
              title,
            };
            const runNextItem = runNextItemFactory(nextOptions);
            const nextItem = runNextItem();
            resolve(nextItem);
          })
      });
    });
  };

  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
