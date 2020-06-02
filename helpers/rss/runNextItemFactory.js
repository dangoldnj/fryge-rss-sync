const fs = require('fs');
const path = require('path');

const { downloadFile } = require('../download');
const {
  ensureDirExists,
  writeItemMetadata,
} = require('../local');

const DEFAULT_FILE_TYPE_ENDING = '.mp3';
const fileTypesRegex = /([.](mp3|m4a|aac|mp4|m4p|m4r|3gp|ogg|oga|wma|raw|wav|flac|m4v))/;
const showOnlyDownloads = true;

const filterUnsafeFilenameChars = input => {
  if (!input) {
    return '';
  }
  const text = input
    .replace(/[=&<>:'"/\\|?*]/g, ' ')
    .replace(/\s+/g, '-')
    .substr(0, 245);
  return text;
};

const keepFileExtensionAndFilter = (input, fileType) => {
  const stripExtension = input.replace(fileType, '');
  const text = filterUnsafeFilenameChars(stripExtension) + fileType;
  return text;
}

const checkIfEnclosureExists = (opts) => {
  const {
    destinationFilepath,
    length = 0,
  } = opts;
  let fileExistsCorrectly = false;
  let itemComment;
  const fileExistsAtAll = fs.existsSync(destinationFilepath);
  const rssSizeProvided = length > 0;
  if (fileExistsAtAll && rssSizeProvided) {
    const stats = fs.statSync(destinationFilepath) || { size: 0 };
    const fileSizeInBytes = stats.size;
    const localIsLarger = (length - fileSizeInBytes) < 0;
    const differenceInBytes = Math.abs(length - fileSizeInBytes);
    const percentOff = differenceInBytes * 100 / length;
    itemComment = `* size comparison * ${ destinationFilepath }\r\n` +
      `expected: ${ length } / ` +
      `found: ${ fileSizeInBytes } / ` +
      `divergence: ${ differenceInBytes } / ` +
      `percent: ${ percentOff }\r\n`;
    // NOTE: turns out people can change the size of a file after the
    // enclosure has been created. How can we ever handle this? Let's
    // just assume it can be within 25% (?) of the expected size..
    fileExistsCorrectly = localIsLarger || percentOff < 25;
  }
  return {
    fileExistsAtAll,
    fileExistsCorrectly,
    rssSizeProvided,
    itemComment,
  };
};

const runNextItemFactory = opts => {
  const {
    items,
    policy: {
      downloadRoot,
      fetchAllItems,
      ignoreByGuid,
      oldestDownload,
    } = {},
    runNextFeed,
    title,
  } = opts;

  if (!downloadRoot) {
    throw new Error('Configuration error - no download root found!');
  }
  const dirAddon = filterUnsafeFilenameChars(title);
  const dirName = path.join(downloadRoot, dirAddon);
  ensureDirExists(dirName);

  const metadataDirname = path.join(dirName, 'metadata');
  ensureDirExists(metadataDirname);

  const maxItems = items.length;
  let currentItem = -1;
  let itemCount = 0;
  let downloadedCount = 0;
  let errorCount = 0;

  const feedCleanupFunction = (opts = {}) => {
    commentCompletion(opts);
    return runNextFeed();
  };

  let itemComments = [];
  const itemTerm = count => `item${ count !== 1 ? 's': ''}`;
  const commentCompletion = ({ forceComments = false } = {}) => {
    if (forceComments) {
      console.log(`Total: ${ itemCount } ${ itemTerm(itemCount) } seen /` +
        ` ${ errorCount } ${ itemTerm(errorCount) } with errors /` +
        ` ${ downloadedCount } ${ itemTerm(downloadedCount) } downloaded.`);
    }
    itemComments = [];
  };
  const showComments = () => {
    itemComments.forEach(item => console.log(item));
    commentCompletion();
  };

  const runNextItem = () => {
    return new Promise((resolve, reject) => {
      commentCompletion();
      currentItem++;
      if (currentItem >= maxItems) {
        const nextFeed = feedCleanupFunction({ forceComments: true });
        resolve(nextFeed);
        return nextFeed;
      }
      const itemCleanupFunction = () => {
        const nextItem = runNextItem();
        resolve(nextItem);
        return nextItem;
      };
      const item = items[currentItem];
      const {
        pubDate,
        guid,
        title,
        enclosures = [],
      } = item;
      if (!enclosures.length) {
        return itemCleanupFunction();
      }
      const {
        length,
        url = '',
      } = enclosures[0];

      const itemPubDate = new Date(pubDate);
      const itemPubDateOK = fetchAllItems || itemPubDate > oldestDownload;
      const ignoredByGuid = ignoreByGuid && ignoreByGuid.includes(guid);
      if (!url || !itemPubDateOK || ignoredByGuid) {
        return itemCleanupFunction();
      }
      itemCount++;
      itemComments.push(`\r\nItem ${ itemCount }: (${ pubDate } / \`${ guid }\`)`);
      itemComments.push(`${ title }\n${ url }`);
      const enclosureFilename = path.basename(url);
      const fileTypeMatches = fileTypesRegex.exec(enclosureFilename);
      if (!fileTypeMatches) {
        console.log('Warning - no file extension detected!', enclosureFilename, fileTypeMatches);
      }
      const fileTypeString = fileTypeMatches
        ? fileTypeMatches[1]
        : DEFAULT_FILE_TYPE_ENDING;
      const safeEnclosureFilename = keepFileExtensionAndFilter(enclosureFilename, fileTypeString);
      const destinationFilename = path.join(dirName, safeEnclosureFilename);
      const metadataFilename = path.join(metadataDirname, `${ safeEnclosureFilename }.json`);

      const {
        fileExistsAtAll: basicFileExists,
        fileExistsCorrectly: basicFileIsCorrect,
        rssSizeProvided: basicSizeProvided,
        itemComment: basicItemComment,
      } = checkIfEnclosureExists({
        destinationFilepath: destinationFilename,
        length,
      });
      if (basicItemComment) {
        itemComments.push(basicItemComment);
      }
      if ((basicFileExists && !basicSizeProvided) || basicFileIsCorrect) {
        itemComments.push(` > File exists, skipping download`);
        if (!showOnlyDownloads) {
          showComments();
        }
        return itemCleanupFunction();
      }

      let actualDestinationFilename = destinationFilename;
      let actualMetadataFilename = metadataFilename;
      // NOTE: here we'll take any file that already exists and add `guid-` as a
      // prefix. Turns out some RSS feeds don't give their unique-guid-items a
      // similarly unique filename. The only solution outside of comparing the
      // files is this, to get a free additional try to download it correctly.
      if (basicFileExists && !basicFileIsCorrect) {
        const guidIncludedSafeEnclosureFilename = keepFileExtensionAndFilter(`${ guid }-${ enclosureFilename }`, fileTypeString);
        const guidIncludedDestinationFilename = path.join(dirName, guidIncludedSafeEnclosureFilename);

        const {
          fileExistsAtAll: guidAddedFileExists,
          fileExistsCorrectly: guidAddedFileIsCorrect,
          rssSizeProvided: guidAddedSizeProvided,
          itemComment: guidAddedItemComment,
        } = checkIfEnclosureExists({
          destinationFilepath: guidIncludedDestinationFilename,
          length,
        });
        if (guidAddedItemComment) {
          itemComments.push(guidAddedItemComment);
        }
        if ((guidAddedFileExists && !guidAddedSizeProvided) || guidAddedFileIsCorrect) {
          itemComments.push(` > File exists, skipping download`);
          if (!showOnlyDownloads) {
            showComments();
          }
          return itemCleanupFunction();
        }
        actualDestinationFilename = guidIncludedDestinationFilename;
        actualMetadataFilename = path.join(metadataDirname, `${ guidIncludedSafeEnclosureFilename }.json`);
      }

      itemComments.push(` > Downloading \'${ actualDestinationFilename }\'...`);
      downloadedCount++;
      showComments();
      downloadFile(url, actualDestinationFilename)
        .then(() => writeItemMetadata(actualMetadataFilename, item))
        .then(itemCleanupFunction)
        .catch(err => {
          console.log(err);
          downloadedCount--;
          errorCount++;
          return itemCleanupFunction();
        });
    });
  };
  return runNextItem;
};

module.exports = {
  runNextItemFactory,
};
