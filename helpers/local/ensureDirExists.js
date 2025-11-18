const { exists } = require('fs');
const { mkdir } = require('node-fs');

const ensureDirExists = dirName => {
    return new Promise((resolve, reject) => {
        const safeDirName = dirName.replace(/'/g, "\\'");

        exists(dirName, existsFlag => {
            if (existsFlag) {
                resolve();
                return;
            }

            mkdir(safeDirName, 755, true, error => {
                if (error) {
                    reject(
                        new Error(
                            `Error creating directory: ${dirName}, ${error}`,
                        ),
                    );
                    return;
                }

                resolve();
            });
        });
    });
};

module.exports = {
    ensureDirExists,
};
