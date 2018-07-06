const path = require('path');
const fs = require('fs');

const indexList = dir => fs.readdirSync(dir)
  .reduce((acc, file) => {
    const matches = /(.*)\.js$/.exec(file);
    if (!matches) {
      return acc;
    }
    const fileExports = require(path.join(dir, matches[1]));
    acc = Object.assign({},
      acc,
      fileExports
    );
    return acc;
  }, {});

module.exports = {
  indexList,
};
