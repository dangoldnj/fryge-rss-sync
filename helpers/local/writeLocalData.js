const fs = require('fs');

const writeLocalData = (path, data) => {
  try {
    fs.writeFileSync(path, data, 'utf8');
  } catch (error) {
    console.log(`Error writing to control file: ${ path }, ${ data }, ${ error }`);
  }
};

module.exports = {
  writeLocalData,
};
