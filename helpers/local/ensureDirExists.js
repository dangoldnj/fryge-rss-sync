const { exec } = require('child_process');
const fs = require('fs');

const makeCommand = dirName => `mkdir -p '${ dirName }'`;
const makeOptions = () => {};
const makeCallback = (dirName, resolve) => (error, stdout, stderr) => {
  if (error) {
    throw new Error(`Error checking directory '${ dirName }': ${ error } / ${ stdout } / ${ stderr }`);
  }
  resolve();
};

const ensureDirExists = dirName => {
  return new Promise(resolve => {
    const safeDirName = dirName.replace(/[']/g, '\\\'');
    if (fs.existsSync(dirName)) {
      return resolve();
    }

    const command = makeCommand(safeDirName);
    const options = makeOptions();
    const callback = makeCallback(safeDirName, resolve);

    exec(command, options, callback);
  });
};

module.exports = {
  ensureDirExists,
};
