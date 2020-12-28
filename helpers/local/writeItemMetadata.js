const fs = require('fs');

const writeItemMetadata = (filename, metadata) => {
  return new Promise(resolve => {
    try {
      const json = JSON.stringify(metadata);
      fs.writeFile(filename, json, 'utf8', () => {
        resolve();
      });
    } catch (error) {
      console.log(`Error writing metadata file: ${ filename }, ${ metadata }, ${ error }`);
      resolve();
    }
  });
};

module.exports = {
  writeItemMetadata,
};
