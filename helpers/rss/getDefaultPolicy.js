const os = require('os');
const path = require('path');

const defaultPolicy = {
  downloadRoot: path.join(os.homedir(), 'podcasts'),
  fetchAllItems: false,
  oldestDownload: new Date(2016, 10, 1),
};

const getDefaultPolicy = () => {
  return defaultPolicy;
};

module.exports = {
  getDefaultPolicy,
};
