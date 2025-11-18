const feedRead = require('davefeedread');
const path = require('path');

const { ensureDirExists } = require('../local/ensureDirExists');
const {
    filterUnsafeFilenameChars,
} = require('../local/filterUnsafeFilenameChars');
const { getDefaultPolicy } = require('./getDefaultPolicy');
const { getFeedSignature } = require('./getFeedSignature');
const { reportError } = require('../local/reportError');
const { readLocalData } = require('../local/readLocalData');
const { runItemFactory } = require('./runItemFactory');
const { writeItemMetadata } = require('../local/writeItemMetadata');

const TIME_OUT_SECS = 30;

const runFeedFactory = (feeds, options) => {
    const { topDefaultPolicy = {} } = options;

    const runSingleFeed = currentFeed => {
        const { name, policy: feedItemPolicy = {}, rss } = currentFeed;
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
                feedRead.parseUrl(
                    rss,
                    TIME_OUT_SECS,
                    async (err, parsedFeed) => {
                        if (err) {
                            reject(
                                new Error(
                                    `Error while processing feed '${name}': ${err}`,
                                ),
                            );
                            return;
                        }

                        try {
                            const metadataDirname = path.join(
                                downloadRoot,
                                'metadata',
                            );
                            await ensureDirExists(metadataDirname);

                            const {
                                head: { title },
                                items = [],
                            } = parsedFeed;
                            console.log(`>> Found: ${title}`);

                            const safeTitle = filterUnsafeFilenameChars(title);
                            const basePath = path.join(
                                metadataDirname,
                                `${safeTitle}`,
                            );
                            const actualMetadataFilename = `${basePath}.json`;
                            const manifestFilename = `${basePath}.manifest.txt`;

                            const savedData = await readLocalData(
                                actualMetadataFilename,
                            );
                            const shouldSaveMetadata =
                                savedData !== JSON.stringify(parsedFeed.head);
                            if (shouldSaveMetadata) {
                                await writeItemMetadata(
                                    actualMetadataFilename,
                                    parsedFeed.head,
                                );
                            }

                            let existingManifest = null;
                            const savedManifest = await readLocalData(
                                manifestFilename,
                            );
                            if (savedManifest) {
                                try {
                                    existingManifest = JSON.parse(
                                        savedManifest,
                                    );
                                } catch {
                                    existingManifest = null;
                                }
                            }

                            const feedSignature = getFeedSignature(
                                parsedFeed.head,
                                items,
                            );
                            if (
                                existingManifest &&
                                existingManifest.signature === feedSignature
                            ) {
                                console.log(
                                    `No changes detected for '${name}', skipping.`,
                                );
                                resolve({
                                    success: true,
                                    feed: name,
                                    skipped: true,
                                });
                                return;
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
                                const runNext = await itemRunFunctions[
                                    itemIdx
                                ]();
                                if (!runNext) break;
                            }

                            await writeItemMetadata(manifestFilename, {
                                signature: feedSignature,
                                itemCount: items.length,
                                lastPubDate: items[0]?.pubDate || null,
                                updatedAt: new Date().toISOString(),
                            });

                            resolve({ success: true, feed: name });
                        } catch (error) {
                            reject(
                                new Error(
                                    `Error running feed '${name}': ${error}`,
                                ),
                            );
                        }
                    },
                );
            } catch (error) {
                reject(
                    new Error(
                        `Error preparing feed '${name || 'unknown'}': ${error}`,
                    ),
                );
            }
        });
    };

    return feeds.map(currentFeed => async () => {
        try {
            const result = await runSingleFeed(currentFeed);
            return result;
        } catch (error) {
            const name = currentFeed?.name || 'unknown';
            const errorMessage =
                typeof error === 'string' ? error : error?.message || error;
            reportError(
                `Error encountered while running feed '${name}': ${errorMessage}`,
            );
            return { success: false, feed: name, error: errorMessage };
        }
    });
};

module.exports = {
    runFeedFactory,
};
