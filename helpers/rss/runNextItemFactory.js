const fs = require('fs');
const path = require('path');

const { downloadFile } = require('../download');
const {
  ensureDirExists,
  writeItemMetadata,
} = require('../local');

const fileTypesRegex = /([.](mp3|m4a|aac|mp4|m4p|m4r|3gp|ogg|oga|wma|raw|wav|flac|m4v))/;

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

  const cleanupFunction = () => {
    return runNextFeed();
  };

  const runNextItem = () => {
    currentItem++;
    if (currentItem >= maxItems) {
      return cleanupFunction();
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
    console.log(`Item ${ itemCount }: (${ pubDate } / ${ guid })`);
    console.log(`${ title }\n${ url }`);
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
    if (fs.existsSync(destinationFilename)) {
      const stats = fs.statSync(destinationFilename) || { size: 0 };
      const fileSizeInBytes = stats.size;
      const differenceInBytes = Math.abs(length - fileSizeInBytes);
      const percentOff = differenceInBytes * 100 / length;
      console.log(`* size comparison * expected: ${ length } / ` +
        `found: ${ fileSizeInBytes } / ` +
        `divergence: ${ differenceInBytes } / ` +
        `percent: ${ percentOff }`);
      // NOTE: turns out people can change the size of a file after the
      // enclosure has been created. How can we ever handle this? Let's
      // just assume it can be within 33% (?) of the expected size..
      fileExistsCorrectly = percentOff < 33;
    }
    if (fileExistsCorrectly) {
      console.log(` > File exists, skipping download`);
      return runNextItem();
    }
    console.log(` > Downloading file now ...`);
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
