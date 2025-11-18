const feedRead = require("davefeedread");
const path = require("path");

const { ensureDirExists } = require("../local/ensureDirExists");
const {
  filterUnsafeFilenameChars,
} = require("../local/filterUnsafeFilenameChars");
const { getDefaultPolicy } = require("./getDefaultPolicy");
const { readLocalData } = require("../local/readLocalData");
const { runNextItemFactory } = require("./runNextItemFactory");
const { writeItemMetadata } = require("../local/writeItemMetadata");

const TIME_OUT_SECS = 30;

const runNextFeedFactory = (feeds, options) => {
  const { topDefaultPolicy = {} } = options;
  const maxFeeds = feeds.length;
  let currentFeed = -1;

  const runNextFeed = () => {
    return new Promise((resolve, reject) => {
      try {
        currentFeed++;
        if (currentFeed >= maxFeeds) {
          resolve(false);
          return;
        }

        const { name, policy: feedItemPolicy = {}, rss } = feeds[currentFeed];

        const policy = Object.assign(
          {},
          getDefaultPolicy(),
          topDefaultPolicy,
          feedItemPolicy,
        );
        const { downloadRoot } = policy;

        console.log(`\nLoading the feed '${name}' at '${rss}':`);
        feedRead.parseUrl(rss, TIME_OUT_SECS, async (err, parsedFeed) => {
          if (err) {
            reject(
              new Error(
                `Error while processing feed '${name}': ${err.toString()}`,
              ),
            );
            return;
          }

          try {
            const metadataDirname = path.join(downloadRoot, "metadata");
            await ensureDirExists(metadataDirname);

            const {
              head: { title },
              items = [],
            } = parsedFeed;
            console.log(`>> Found: ${title}`);

            const safeTitle = filterUnsafeFilenameChars(title);
            const actualMetadataFilename = path.join(
              metadataDirname,
              `${safeTitle}.json`,
            );

            const savedData = await readLocalData(actualMetadataFilename);
            const shouldSaveMetadata =
              savedData !== JSON.stringify(parsedFeed.head);
            if (shouldSaveMetadata) {
              await writeItemMetadata(actualMetadataFilename, parsedFeed.head);
            }

            const runNextItem = await runNextItemFactory({
              items,
              policy,
              title,
            });

            let runLoop = true;
            while (runLoop) {
              runLoop = await runNextItem();
            }

            resolve(true);
          } catch (error) {
            reject(
              new Error(`Error running next feed: ${currentFeed}, ${error}`),
            );
          }
        });
      } catch (error) {
        reject(new Error(`Error running next feed: ${currentFeed}, ${error}`));
      }
    });
  };

  return runNextFeed;
};

module.exports = {
  runNextFeedFactory,
};
