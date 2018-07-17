const fs = require('fs');
const path = require('path');

const { downloadFile } = require('../download');
const {
  ensureDirExists,
  writeItemMetadata,
} = require('../local');

const fileTypesRegex = /([.](mp3|m4a|aac|mp4|m4p|m4r|3gp|ogg|oga|wma|raw|wav|flac|m4v))/;
const showOnlyDownloads = true;

const runNextItemFactory = opts => {
  const {
    items,
    policy: {
      downloadRoot,
      fetchAllItems,
      oldestDownload,
    } = {},
    runNextFeed,
    title,
  } = opts;

  if (!downloadRoot) {
    throw new Error('Configuration error - no download root found!');
  }
  const dirAddon = title.replace(/[<>:'"/\\|?*]/g, ' ').replace(/\s+/g, '-');
  const dirName = path.join(downloadRoot, dirAddon);
  ensureDirExists(dirName);

  const metadataDirname = path.join(dirName, 'metadata');
  ensureDirExists(metadataDirname);

  const maxItems = items.length;
  let currentItem = -1;
  let itemCount = 0;
  let downloadedCount = 0;

  const cleanupFunction = (opts) => {
    commentCompletion(opts);
    return runNextFeed();
  };

  let itemComments = [];
  const itemTerm = count => `item${ count !== 1 ? 's': ''}`;
  const commentCompletion = ({ forceComments = false }) => {
    if (forceComments) {
      console.log(`Total: ${ itemCount } ${ itemTerm(itemCount) } seen /` +
        ` ${ downloadedCount } ${ itemTerm(downloadedCount) } downloaded.`);
    }
    itemComments = [];
  };
  const showComments = () => {
    itemComments.forEach(item => console.log(item));
  };

  const runNextItem = () => {
    currentItem++;
    if (currentItem >= maxItems) {
      return cleanupFunction({ forceComments: true });
    }
    const item = items[currentItem];
    const {
      pubDate,
      guid,
      title,
      enclosure: {
        length,
        url = '',
      } = {},
    } = item;
    const itemPubDate = new Date(pubDate);
    const itemPubDateOK = fetchAllItems || itemPubDate > oldestDownload;
    if (!url || !itemPubDateOK) {
      return runNextItem();
    }
    itemCount++;
    itemComments.push(`Item ${ itemCount }: (${ pubDate } / ${ guid })`);
    itemComments.push(`${ title }\n${ url }`);
    const enclosureFilename = path.basename(url);
    const fileTypeMatches = fileTypesRegex.exec(enclosureFilename);
    if (!fileTypeMatches) {
      console.log('!', enclosureFilename, fileTypeMatches);
    }
    const fileTypeString = fileTypeMatches[1];
    const safeEnclosureFilename = enclosureFilename.replace(fileTypeString, '').replace(/[=&<>:'"/\\|?*]/g, ' ').replace(/\s+/g, '-') + fileTypeString;
    const destinationFilename = path.join(dirName, safeEnclosureFilename);
    const metadataFile = path.join(metadataDirname, `${ safeEnclosureFilename }.json`);
    let fileExistsCorrectly = false;
    const fileExistsAtAll = fs.existsSync(destinationFilename);
    const rssSizeProvided = length > 0;
    if (fileExistsAtAll && rssSizeProvided) {
      const stats = fs.statSync(destinationFilename) || { size: 0 };
      const fileSizeInBytes = stats.size;
      const differenceInBytes = Math.abs(length - fileSizeInBytes);
      const percentOff = differenceInBytes * 100 / length;
      itemComments.push(`* size comparison * expected: ${ length } / ` +
        `found: ${ fileSizeInBytes } / ` +
        `divergence: ${ differenceInBytes } / ` +
        `percent: ${ percentOff }`);
      // NOTE: turns out people can change the size of a file after the
      // enclosure has been created. How can we ever handle this? Let's
      // just assume it can be within 75% (?) of the expected size..
      fileExistsCorrectly = percentOff < 75;
    }
    if ((fileExistsAtAll && !rssSizeProvided) || fileExistsCorrectly) {
      itemComments.push(` > File exists, skipping download`);
      if (!showOnlyDownloads) {
        showComments();
      }
      commentCompletion();
      return runNextItem();
    }
    itemComments.push(` > Downloading file now ...`);
    downloadedCount++;
    showComments();
    downloadFile(url, destinationFilename)
      .then(() => writeItemMetadata(metadataFile, item))
      .then(runNextItem)
      .catch(err => {
        console.log(err);
        cleanupFunction();
      });
  };
  return runNextItem;
};

module.exports = {
  runNextItemFactory,
};
