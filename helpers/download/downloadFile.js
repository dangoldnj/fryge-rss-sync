// eslint-disable-next-line import/no-unassigned-import
require('isomorphic-fetch');
const fs = require('fs');

const downloadFile = async (url, localFilename) => {
  const options = {
    cache: 'no-store',
    keepalive: false,
    redirect: 'follow',
    referrer: '',
  };
  // eslint-disable-next-line no-undef
  const result = await fetch(url, options);
  return new Promise((resolve, reject) => {
    const {
      body,
      ok,
      status,
    } = result;

    if (!ok) {
      const err = `Status ${ status } encountered.`;
      reject(`Error! Cannot download enclosure '${ url }': ${ err }`);
    }

    const file = fs.createWriteStream(localFilename);
    body.pipe(file);
    body.on('error', err => {
      reject(`Error! Cannot download enclosure '${ url }': ${ err }`);
    });
    file.on('finish', () => {
      resolve();
    });
  });
};

module.exports = {
  downloadFile,
};
