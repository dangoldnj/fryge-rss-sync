const feedRead = require('davefeedread');
const path = require('path');
const { promises: fsPromises } = require('fs');

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
const DIR_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const buildDirectorySnapshot = async dirPath => {
    const snapshot = {};

    const safeWalk = async currentDir => {
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

const shouldPerformDeepCheck = manifest => {
    if (!manifest || !manifest.lastDeepCheck) {
        return true;
    }

    const lastCheckTime = new Date(manifest.lastDeepCheck).getTime();
    if (Number.isNaN(lastCheckTime)) {
        return true;
    }

    return Date.now() - lastCheckTime > DIR_CHECK_INTERVAL_MS;
};

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
                            const feedDirname = path.join(
                                downloadRoot,
                                safeTitle,
                            );
                            await ensureDirExists(feedDirname);
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

                            const signatureMatches =
                                existingManifest &&
                                existingManifest.signature === feedSignature;

                            if (signatureMatches) {
                                const deepCheckRequired = shouldPerformDeepCheck(
                                    existingManifest,
                                );
                                if (!deepCheckRequired) {
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

                                const latestSnapshot = await buildDirectorySnapshot(
                                    feedDirname,
                                );
                                const storedSnapshot =
                                    existingManifest.directorySnapshot || {};
                                const snapshotsAreEqual = snapshotsMatch(
                                    storedSnapshot,
                                    latestSnapshot,
                                );

                                if (snapshotsAreEqual) {
                                    console.log(
                                        `No changes detected for '${name}' (deep check).`,
                                    );
                                    const manifestPayload = {
                                        ...existingManifest,
                                        lastDeepCheck: new Date().toISOString(),
                                        directorySnapshot: latestSnapshot,
                                    };
                                    await writeItemMetadata(
                                        manifestFilename,
                                        manifestPayload,
                                    );
                                    resolve({
                                        success: true,
                                        feed: name,
                                        skipped: true,
                                        deepCheck: true,
                                    });
                                    return;
                                }

                                console.log(
                                    `Directory contents changed for '${name}', refreshing feed items...`,
                                );
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

                            const directorySnapshot = await buildDirectorySnapshot(
                                feedDirname,
                            );

                            await writeItemMetadata(manifestFilename, {
                                signature: feedSignature,
                                itemCount: items.length,
                                lastPubDate: items[0]?.pubDate || null,
                                updatedAt: new Date().toISOString(),
                                lastDeepCheck: new Date().toISOString(),
                                directorySnapshot,
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
