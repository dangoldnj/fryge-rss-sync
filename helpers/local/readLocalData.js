const fs = require("fs");

const readLocalData = (path) => {
  try {
    const data = fs.readFileSync(path, "utf8");
    return data;
  } catch (error) {
    console.log(`Error reading local data: ${path}, ${error}`);
    return null;
  }
};

module.exports = {
  readLocalData,
};
