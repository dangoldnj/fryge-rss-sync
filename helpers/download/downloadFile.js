const fs = require('fs');
const request = require('request');

const downloadFile = (url, localFilename) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localFilename);
    file.on('finish', () => {
      file.close(resolve);
    });
    const opts = {
      followAllRedirects: true,
      url,
    };
    const req = request(opts);
    req.pipe(file);
    req.on('response', res => {
      const { statusCode } = res;
      if (statusCode !== 200) {
        fs.unlink(localFilename);
        const err = `Status ${ statusCode } encountered.`;
        reject(`Error! Cannot download enclosure '${ url }': ${ err }`);
      }
    });
  });
};

module.exports = {
  downloadFile,
};
