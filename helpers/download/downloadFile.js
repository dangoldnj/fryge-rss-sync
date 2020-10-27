require('isomorphic-fetch');
const fs = require('fs');

const downloadFile = async (url, localFilename) => {
  const opts = {
    cache: "no-store",
    keepalive: false,
    redirect: "follow",
    referrer: "",
  };
  const res = await fetch(url, opts);
  return new Promise((resolve, reject) => {
    const {
      body,
      ok,
      status,
    } = res;

    if (!ok) {
      const err = `Status ${ status } encountered.`;
      reject(`Error! Cannot download enclosure '${ url }': ${ err }`);
    }

    const file = fs.createWriteStream(localFilename);
    body.pipe(file);
    body.on('error', (err) => {
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
