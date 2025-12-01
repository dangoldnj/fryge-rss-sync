const feedRead = require("davefeedread");
const path = require("path");
const { promises: fsPromises } = require("fs");

const { ensureDirExists } = require("../local/ensureDirExists");
const {
  filterUnsafeFilenameChars,
} = require("../local/filterUnsafeFilenameChars");
const { getDefaultPolicy } = require("./getDefaultPolicy");
const { getFeedSignature } = require("./getFeedSignature");
const { formatError } = require("../local/formatError");
const { readLocalData } = require("../local/readLocalData");
const { runItemFactory } = require("./runItemFactory");
const { writeItemMetadata } = require("../local/writeItemMetadata");

const TIME_OUT_SECS = 30;
const DIR_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DIR_CHECK_OFFSET_RANGE_MS = 6 * 60 * 60 * 1000; // up to +6h per feed
const JITTER_PERCENT = 0.2; // +/-20% jitter on each decision
const DURATION_SLACK_MULTIPLIER = 1; // add last run duration once to spacing

const hashStringToInt = (str = "") => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
};

const getDeepCheckInterval = (manifest, feedKey) => {
  if (manifest && Number.isFinite(manifest.deepCheckIntervalMs)) {
    return manifest.deepCheckIntervalMs;
  }

  const hashOffset = hashStringToInt(feedKey) % DIR_CHECK_OFFSET_RANGE_MS;
  return DIR_CHECK_INTERVAL_MS + hashOffset;
};

const buildDirectorySnapshot = async (dirPath) => {
  const snapshot = {};

  const safeWalk = async (currentDir) => {
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, {
        withFileTypes: true,
      });
    } catch (error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await safeWalk(fullPath);
        continue;
      }

      try {
        const stats = await fsPromises.stat(fullPath);
        const relativePath = path.relative(dirPath, fullPath);
        snapshot[relativePath] = stats.size;
      } catch (error) {
        // Ignore files we cannot stat and continue
      }
    }
  };

  try {
    await fsPromises.access(dirPath);
  } catch (error) {
    return snapshot;
  }

  await safeWalk(dirPath);
  return snapshot;
};

const snapshotsMatch = (a = {}, b = {}) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (b[key] !== a[key]) {
      return false;
    }
  }

  return true;
};

const shouldPerformDeepCheck = (manifest, feedKey) => {
  if (!manifest || !manifest.lastDeepCheck) {
    return true;
  }

  const lastCheckTime = new Date(manifest.lastDeepCheck).getTime();
  if (Number.isNaN(lastCheckTime)) {
    return true;
  }

  const baseInterval = getDeepCheckInterval(manifest, feedKey);
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * JITTER_PERCENT;
  const durationSlack =
    (manifest.lastRunDurationMs || 0) * DURATION_SLACK_MULTIPLIER;

  const effectiveInterval = baseInterval * jitterMultiplier + durationSlack;

  return Date.now() - lastCheckTime > effectiveInterval;
};

const runFeedFactory = (feeds, options) => {
  const { topDefaultPolicy = {} } = options;

  const runSingleFeed = (currentFeed) => {
    const startedAt = Date.now();
    const baseTiming = { startedAt: new Date(startedAt).toISOString() };
    const buildTiming = () => ({
      ...baseTiming,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });

    const { name, policy: feedItemPolicy = {}, rss } = currentFeed;
    const feedKey = `${name || "unknown"}:${rss || ""}`;
    const policy = Object.assign(
      {},
      getDefaultPolicy(),
      topDefaultPolicy,
      feedItemPolicy,
    );
    const { downloadRoot } = policy;

    return new Promise((resolve, reject) => {
      try {
        console.log(`\nLoading the feed '${name}' at '${rss}':`);
        feedRead.parseUrl(rss, TIME_OUT_SECS, async (err, parsedFeed) => {
          if (err) {
            reject(
              new Error(
                `Error while processing feed '${name}': ${formatError(err)}`,
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
            const feedDirname = path.join(downloadRoot, safeTitle);
            await ensureDirExists(feedDirname);
            const basePath = path.join(metadataDirname, `${safeTitle}`);
            const actualMetadataFilename = `${basePath}.json`;
            const manifestFilename = `${basePath}.manifest.txt`;

            const savedData = await readLocalData(actualMetadataFilename);
            const shouldSaveMetadata =
              savedData !== JSON.stringify(parsedFeed.head);
            if (shouldSaveMetadata) {
              await writeItemMetadata(actualMetadataFilename, parsedFeed.head);
            }

            let existingManifest = null;
            const savedManifest = await readLocalData(manifestFilename);
            if (savedManifest) {
              try {
                existingManifest = JSON.parse(savedManifest);
              } catch {
                existingManifest = null;
              }
            }

            console.log(`Calculating local signature...`);
            const feedSignature = getFeedSignature(parsedFeed.head, items);
            const deepCheckIntervalMs = getDeepCheckInterval(
              existingManifest,
              feedKey,
            );

            const signatureMatches =
              existingManifest && existingManifest.signature === feedSignature;

            if (signatureMatches) {
              const deepCheckRequired = shouldPerformDeepCheck(
                existingManifest,
                feedKey,
              );
              if (!deepCheckRequired) {
                console.log(`No changes detected for '${name}', skipping.`);
                const timing = buildTiming();
                resolve({
                  feed: name,
                  skipped: true,
                  stats: {
                    itemsDownloaded: 0,
                    itemsErrored: 0,
                    itemsSeen: 0,
                  },
                  success: true,
                  timing,
                });
                return;
              }
              console.log(`Deep scanning...`);

              const latestSnapshot = await buildDirectorySnapshot(feedDirname);
              const storedSnapshot = existingManifest.directorySnapshot || {};
              const snapshotsAreEqual = snapshotsMatch(
                storedSnapshot,
                latestSnapshot,
              );

              if (snapshotsAreEqual) {
                console.log(`No changes detected for '${name}' (deep check).`);
                const timing = buildTiming();
                const manifestPayload = {
                  ...existingManifest,
                  deepCheckIntervalMs,
                  lastDeepCheck: new Date().toISOString(),
                  lastRunDurationMs: timing.durationMs,
                  directorySnapshot: latestSnapshot,
                };
                await writeItemMetadata(manifestFilename, manifestPayload);
                resolve({
                  deepCheck: true,
                  feed: name,
                  skipped: true,
                  stats: {
                    itemsDownloaded: 0,
                    itemsErrored: 0,
                    itemsSeen: 0,
                  },
                  success: true,
                  timing,
                });
                return;
              }

              console.log(
                `Directory contents changed for '${name}', refreshing feed items...`,
              );
            } else {
              console.log('New items detected, downloading new feed items...');
            }

            const itemRunFunctions = await runItemFactory({
              items,
              policy,
              title,
            });

            for (
              let itemIdx = 0;
              itemIdx < itemRunFunctions.length;
              itemIdx++
            ) {
              const runNext = await itemRunFunctions[itemIdx]();
              if (!runNext) break;
            }

            const stats = itemRunFunctions.getStats
              ? itemRunFunctions.getStats()
              : {
                  itemsDownloaded: 0,
                  itemsErrored: 0,
                  itemsSeen: 0,
                };

            const directorySnapshot = await buildDirectorySnapshot(feedDirname);

            const timing = buildTiming();
            await writeItemMetadata(manifestFilename, {
              directorySnapshot,
              itemCount: items.length,
              lastDeepCheck: new Date().toISOString(),
              lastPubDate: items[0]?.pubDate || null,
              deepCheckIntervalMs,
              lastRunDurationMs: timing.durationMs,
              signature: feedSignature,
              updatedAt: new Date().toISOString(),
            });
            resolve({
              feed: name,
              stats,
              success: true,
              timing,
            });
          } catch (error) {
            reject(
              new Error(`Error running feed '${name}': ${formatError(error)}`),
            );
          }
        });
      } catch (error) {
        reject(
          new Error(
            `Error preparing feed '${name || "unknown"}': ${formatError(
              error,
            )}`,
          ),
        );
      }
    });
  };

  return feeds.map((currentFeed) => async () => {
    try {
      const result = await runSingleFeed(currentFeed);
      return result;
    } catch (error) {
      const name = currentFeed?.name || "unknown";
      const errorMessage = formatError(error);
      return { success: false, feed: name, error: errorMessage };
    }
  });
};

module.exports = {
  runFeedFactory,
};
