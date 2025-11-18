const fs = require("fs");

const writeLocalData = async (path, data) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, "utf8", (error) => {
      if (error) {
        reject(
          new Error(
            `Error writing to control file: ${path}, ${data}, ${error}`,
          ),
        );
        return;
      }

      resolve();
    });
  });
};

module.exports = {
  writeLocalData,
};
