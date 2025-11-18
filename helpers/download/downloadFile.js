const { createWriteStream } = require('node:fs');
const { pipeline, Readable } = require('node:stream');
const { promisify } = require('node:util');

const downloadFile = async (url, filePath) => {
    const streamPipeline = promisify(pipeline);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Error downloading file: ${url}, ${filePath}, status ${response.status} ${response.statusText}`,
        );
    }

    const nodeReadable =
        typeof response.body.getReader === 'function'
            ? Readable.fromWeb(response.body)
            : response.body;

    await streamPipeline(nodeReadable, createWriteStream(filePath));
};

module.exports = {
    downloadFile,
};
