const fs = require('fs');
const path = require('path');

const { downloadFile } = require('../download');
const {
  ensureDirExists,
  writeItemMetadata,
} = require('../local');

const DEFAULT_FILE_TYPE_ENDING = '.mp3';
const fileTypesRegex = /(\.(mp3|m4a|aac|mp4|m4p|m4r|3gp|ogg|oga|wma|raw|wav|flac|m4v))/;
const showOnlyDownloads = true;

const filterUnsafeFilenameChars = input => {
  if (!input) {
    return '';
  }

  const text = input
    .replace(/[=&<>:'"/\\|?*]/g, ' ')
    .replace(/\s+/g, '-')
    .slice(0, 245);
  return text;
};

const keepFileExtensionAndFilter = (input, fileType) => {
  const stripExtension = input.replace(fileType, '');
  const text = filterUnsafeFilenameChars(stripExtension) + fileType;
  return text;
};

const getControlFileSavedSize = path => {
  try {
    const data = fs.readFileSync(path, 'utf8');
    return data;
  } catch {
    return null;
  }
};

const setControlFileSavedSize = (path, data) => {
  try {
    fs.writeFileSync(path, data, 'utf8');
  } catch (error) {
    console.log(`Error writing to control file: ${ path }, ${ data }, ${ error }`);
  }
};

const checkIfEnclosureExists = options => {
  const {
    destinationFilepath,
    length = 0,
  } = options;
  let fileExistsCorrectly = false;
  let itemComment;
  let foundSizeInBytes = 0;
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

const runNextItemFactory = options => {
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
  } = options;

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

  const feedCleanupFunction = (cleanupOptions = {}) => {
    commentCompletion(cleanupOptions);
    return runNextFeed();
  };

  let itemComments = [];
  const itemTerm = count => `item${ count === 1 ? '' : 's' }`;
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
    return new Promise(resolve => {
      commentCompletion();
      currentItem++;
      if (currentItem >= maxItems) {
        const nextFeed = feedCleanupFunction({ forceComments: true });
        resolve(nextFeed);
        return;
      }

      const itemCleanupFunction = () => {
        const nextItem = runNextItem();
        resolve(nextItem);
      };

      const item = items[currentItem];
      const {
        pubDate,
        guid,
        title,
        enclosures = [],
      } = item;
      if (Number(enclosures.length) < 1) {
        itemCleanupFunction();
        return;
      }

      const {
        length,
        url = '',
      } = enclosures[0];

      const itemPubDate = new Date(pubDate);
      const itemPubDateOK = fetchAllItems || itemPubDate > oldestDownload;
      const ignoredByGuid = ignoreByGuid && ignoreByGuid.includes(guid);
      if (!url || !itemPubDateOK || ignoredByGuid) {
        itemCleanupFunction();
        return;
      }

      itemCount++;
      itemComments.push(`\r\nItem ${ itemCount }/${ maxItems }: (${ pubDate } / \`${ guid }\`)`);
      itemComments.push(`${ title }\n${ url }`);
      const enclosureFilename = path.basename(url);
      const fileTypeMatches = fileTypesRegex.exec(enclosureFilename);
      if (!fileTypeMatches) {
        console.log('Warning - no file extension detected!', enclosureFilename, fileTypeMatches);
      }

      const fileTypeString = fileTypeMatches
        ? fileTypeMatches[1]
        : DEFAULT_FILE_TYPE_ENDING;

      // NOTE: here we'll take any file that already exists and add `guid-` as a
      // prefix. Turns out some RSS feeds don't give their unique-guid-items a
      // similarly unique filename. The only solution outside of comparing the
      // files is this, to get a free additional try to download it correctly.
      const guidIncludedSafeEnclosureFilename = keepFileExtensionAndFilter(`${ guid }-${ enclosureFilename }`, fileTypeString);
      const guidIncludedDestinationFilename = path.join(dirName, guidIncludedSafeEnclosureFilename);

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

      if ((guidAddedFileExists && !guidAddedSizeProvided) || guidAddedFileIsCorrect) {
        itemComments.push(' > File exists, skipping download');
        if (!showOnlyDownloads) {
          showComments();
        }

        itemCleanupFunction();
        return;
      }

      const actualDestinationFilename = guidIncludedDestinationFilename;
      const actualMetadataFilename = path.join(metadataDirname, `${ guidIncludedSafeEnclosureFilename }.json`);

      // NOTE: if the file already exists, we check the control file for any old run data;
      // if the old run has identical old / new filesizes, we assume the download has been
      // successful and we'll ignore this from now on - otherwise, we'll download it again
      const controlFileFilename = path.join(metadataDirname, `${ guidIncludedSafeEnclosureFilename }.txt`);
      if (guidAddedFileExists) {
        const savedSize = getControlFileSavedSize(controlFileFilename);

        if (foundSizeInBytes && (Number(savedSize) === Number(foundSizeInBytes))) {
          itemCleanupFunction();
          return;
        }
      }

      itemComments.push(` > Downloading '${ actualDestinationFilename }'...`);
      downloadedCount++;
      showComments();
      downloadFile(url, actualDestinationFilename)
        .then(() => writeItemMetadata(actualMetadataFilename, item))
        .then(() => {
          if (guidAddedFileExists) {
            const {
              foundSizeInBytes: newSizeInBytes,
            } = checkIfEnclosureExists({
              destinationFilepath: guidIncludedDestinationFilename,
              length,
            });
            // NOTE: we save this filesize here for any future checks
            setControlFileSavedSize(controlFileFilename, newSizeInBytes);
          }
        })
        .then(itemCleanupFunction)
        .catch(error => {
          console.log(error);
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
