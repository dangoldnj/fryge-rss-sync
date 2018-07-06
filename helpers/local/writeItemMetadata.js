const fs = require('fs');

const writeItemMetadata = (filename, metadata) => {
  return new Promise(resolve => {
    const json = JSON.stringify(metadata);
    fs.writeFile(filename, json, 'utf8', () => {
      resolve();
    });
  });
};

module.exports = {
  writeItemMetadata,
};
