const fs = require("fs");

const writeItemMetadata = async (filename, metadata) => {
  return new Promise((resolve, reject) => {
    try {
      const json = JSON.stringify(metadata);
      fs.writeFile(filename, json, "utf8", (error) => {
        if (error) {
          reject(
            new Error(`Error writing metadata file: ${filename}, ${error}`),
          );
          return;
        }

        resolve();
      });
    } catch (error) {
      reject(new Error(`Error writing metadata file: ${filename}, ${error}`));
    }
  });
};

module.exports = {
  writeItemMetadata,
};
