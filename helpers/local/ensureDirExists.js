const { exec } = require('child_process');
const { existsSync } = require('fs');
const { mkdirSync } = require('node-fs');

const ensureDirExists = dirName => {
  return new Promise(resolve => {
    const safeDirName = dirName.replace(/[']/g, '\\\'');
    if (existsSync(dirName)) {
      return resolve();
    }
    return mkdirSync(safeDirName, 755, true);
  });
};

module.exports = {
  ensureDirExists,
};
