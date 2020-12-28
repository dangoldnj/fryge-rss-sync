const fs = require('fs');

const readLocalData = path => {
  try {
    const data = fs.readFileSync(path, 'utf8');
    return data;
  } catch {
    return null;
  }
};

module.exports = {
  readLocalData,
};
