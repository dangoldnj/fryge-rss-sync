const fs = require('fs');
const path = require('path');

const { downloadFile } = require('../download/downloadFile');
const { ensureDirExists } = require('../local/ensureDirExists');
const {
    filterUnsafeFilenameChars,
} = require('../local/filterUnsafeFilenameChars');
const {
    keepFileExtensionAndFilter,
} = require('../local/keepFileExtensionAndFilter');
const { reportError } = require('../local/reportError');
const { readLocalData } = require('../local/readLocalData');
const { writeItemMetadata } = require('../local/writeItemMetadata');
const { writeLocalData } = require('../local/writeLocalData');

const DEFAULT_FILE_TYPE_ENDING = '.mp3';
const fileTypesRegex = /(\.(mp3|m4a|aac|mp4|m4p|m4r|3gp|ogg|oga|wma|raw|wav|flac|m4v))/;
const showOnlyDownloads = true;

const checkIfEnclosureExists = options => {
    const { destinationFilepath, length = 0 } = options;
    let fileExistsCorrectly = false;
    let itemComment;
    let foundSizeInBytes = 0;
    const fileExistsAtAll = fs.existsSync(destinationFilepath);
    const rssSizeProvided = length > 0;
    if (fileExistsAtAll && rssSizeProvided) {
        const stats = fs.statSync(destinationFilepath) || { size: 0 };
        const fileSizeInBytes = stats.size;
        const localIsLarger = length - fileSizeInBytes < 0;
        const differenceInBytes = Math.abs(length - fileSizeInBytes);
        const percentOff = (differenceInBytes * 100) / length;
        itemComment =
            `* size comparison * ${destinationFilepath}\r\n` +
            `expected: ${length} / ` +
            `found: ${fileSizeInBytes} / ` +
            `divergence: ${differenceInBytes} / ` +
            `percent: ${percentOff}\r\n`;
        // NOTE: turns out people can change the size of a file after the
        // enclosure has been created. How can we ever handle this? Let's
        // just assume it can be within 25% (?) of the expected size..
        fileExistsCorrectly = localIsLarger || percentOff < 25;
        foundSizeInBytes = fileSizeInBytes;
    }

    return {
        fileExistsAtAll,
        fileExistsCorrectly,
        foundSizeInBytes,
        rssSizeProvided,
        itemComment,
    };
};

const runItemFactory = async options => {
    const {
        items,
        policy: {
            downloadRoot,
            fetchAllItems,
            ignoreByGuid,
            oldestDownload,
        } = {},
        title,
    } = options;

    if (!downloadRoot) {
        throw new Error('Configuration error - no download root found!');
    }

    const dirAddon = filterUnsafeFilenameChars(title);
    const dirName = path.join(downloadRoot, dirAddon);
    await ensureDirExists(dirName);

    const metadataDirname = path.join(dirName, 'metadata');
    await ensureDirExists(metadataDirname);

    const maxItems = items.length;
    let itemCount = 0;
    let downloadedCount = 0;
    let errorCount = 0;

    let itemComments = [];
    const itemTerm = count => `item${count === 1 ? '' : 's'}`;
    const commentCompletion = ({ forceComments = false } = {}) => {
        if (forceComments) {
            console.log(
                `Total: ${itemCount} ${itemTerm(itemCount)} seen /` +
                    ` ${errorCount} ${itemTerm(errorCount)} with errors /` +
                    ` ${downloadedCount} ${itemTerm(
                        downloadedCount,
                    )} downloaded.`,
            );
        }

        itemComments = [];
    };

    const showComments = () => {
        itemComments.forEach(item => console.log(item));
        commentCompletion();
    };

    return items.map((currentItem, index) => () =>
        new Promise(async (resolve, reject) => {
            try {
                const lastItem = index == items.length - 1;
                const cleanup = () => {
                    commentCompletion({ forceComments: lastItem });
                };

                const { pubDate, guid, title, enclosures = [] } = currentItem;
                if (Number(enclosures.length) < 1) {
                    resolve(true);
                    return cleanup();
                }

                const { length, url = '' } = enclosures[0];

                const itemPubDate = new Date(pubDate);
                const itemPubDateOK =
                    fetchAllItems || itemPubDate > oldestDownload;
                const ignoredByGuid =
                    ignoreByGuid && ignoreByGuid.includes(guid);
                if (!url || !itemPubDateOK || ignoredByGuid) {
                    resolve(true);
                    return cleanup();
                }

                itemCount++;
                itemComments.push(
                    `\r\nItem ${itemCount}/${maxItems}: (${pubDate} / \`${guid}\`)`,
                );
                itemComments.push(`${title}\n${url}`);
                const enclosureFilename = path.basename(url);
                const fileTypeMatches = fileTypesRegex.exec(enclosureFilename);
                if (!fileTypeMatches) {
                    console.log(
                        'Warning - no file extension detected!',
                        enclosureFilename,
                        fileTypeMatches,
                    );
                }

                const fileTypeString = fileTypeMatches
                    ? fileTypeMatches[1]
                    : DEFAULT_FILE_TYPE_ENDING;

                // NOTE: here we'll take any file that already exists and add `guid-` as a
                // prefix. Turns out some RSS feeds don't give their unique-guid-items a
                // similarly unique filename. The only solution outside of comparing the
                // files is this, to get a free additional try to download it correctly.
                const guidIncludedSafeEnclosureFilename = keepFileExtensionAndFilter(
                    `${guid}-${enclosureFilename}`,
                    fileTypeString,
                );
                const guidIncludedDestinationFilename = path.join(
                    dirName,
                    guidIncludedSafeEnclosureFilename,
                );

                const {
                    fileExistsAtAll: guidAddedFileExists,
                    fileExistsCorrectly: guidAddedFileIsCorrect,
                    foundSizeInBytes,
                    rssSizeProvided: guidAddedSizeProvided,
                    itemComment: guidAddedItemComment,
                } = checkIfEnclosureExists({
                    destinationFilepath: guidIncludedDestinationFilename,
                    length,
                });
                if (guidAddedItemComment) {
                    itemComments.push(guidAddedItemComment);
                }

                if (
                    (guidAddedFileExists && !guidAddedSizeProvided) ||
                    guidAddedFileIsCorrect
                ) {
                    itemComments.push(' > File exists, skipping download');
                    if (!showOnlyDownloads) {
                        showComments();
                    }
                    resolve(true);
                    return cleanup();
                }

                const actualDestinationFilename = guidIncludedDestinationFilename;
                const actualMetadataFilename = path.join(
                    metadataDirname,
                    `${guidIncludedSafeEnclosureFilename}.json`,
                );

                // NOTE: if the file already exists, we check the control file for any old run data;
                // if the old run has identical old / new filesizes, we assume the download has been
                // successful and we'll ignore this from now on - otherwise, we'll download it again
                const controlFileFilename = path.join(
                    metadataDirname,
                    `${guidIncludedSafeEnclosureFilename}.txt`,
                );
                if (guidAddedFileExists) {
                    const savedSize = await readLocalData(controlFileFilename);

                    if (
                        foundSizeInBytes &&
                        Number(savedSize) === Number(foundSizeInBytes)
                    ) {
                        resolve(true);
                        return cleanup();
                    }
                }

                itemComments.push(
                    ` > Downloading '${actualDestinationFilename}'...`,
                );
                showComments();

                await writeItemMetadata(actualMetadataFilename, currentItem);
                await downloadFile(url, actualDestinationFilename);
                downloadedCount++;

                if (guidAddedFileExists) {
                    const {
                        foundSizeInBytes: newSizeInBytes,
                    } = checkIfEnclosureExists({
                        destinationFilepath: guidIncludedDestinationFilename,
                        length,
                    });
                    // NOTE: we save this filesize here for any future checks
                    await writeLocalData(
                        controlFileFilename,
                        newSizeInBytes.toString(),
                    );
                }

                resolve(true);
                cleanup();
            } catch (error) {
                errorCount++;
                const errorString = `Error running item: ${currentItem}, ${error}`;
                reportError(errorString, reject);
            }
        }),
    );
};

module.exports = {
    runItemFactory,
};
