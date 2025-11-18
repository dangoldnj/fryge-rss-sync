const { getFeedDefaultPolicy, getFeeds } = require('./helpers/rss/getFeeds');
const { runFeedFactory } = require('./helpers/rss/runFeedFactory');
const { fork } = require('child_process');
const path = require('path');

console.log(`Started ${new Date()}`);

process.on('uncaughtException', err => console.log('Caught exception:', err));

const runChildProcess = (runFeedScript, feedIdx) =>
    new Promise((resolve, reject) => {
        const child = fork(runFeedScript, [feedIdx]);

        child.on('message', msg => {
            console.log(`Child ${feedIdx} message:`, msg);
        });

        child.on('exit', (code, signal) => {
            if (code) {
                console.log(`Child ${feedIdx} exited with code ${code}`);
                reject(new Error(`Child ${feedIdx} exited with code ${code}`));
            } else if (signal) {
                console.log(
                    `Child ${feedIdx} was killed with signal ${signal}`,
                );
                reject(
                    new Error(
                        `Child ${feedIdx} was killed with signal ${signal}`,
                    ),
                );
            } else {
                // console.log(`Child ${feedIdx} exited successfully`);
                resolve();
            }
        });

        child.on('error', err => {
            console.log(`Child ${feedIdx} encountered an error:`, err);
            reject(err);
        });
    });

(async () => {
    const feeds = getFeeds();
    const feedRunFunctions = runFeedFactory(feeds, {
        topDefaultPolicy: getFeedDefaultPolicy(),
    });

    const runFeedScript = path.resolve(__dirname, 'runFeed.js');
    for (let feedIdx = 0; feedIdx < feedRunFunctions.length; feedIdx++) {
        try {
            await runChildProcess(runFeedScript, feedIdx);
        } catch (error) {
            console.log(`Error processing feed index ${feedIdx}:`, error);
        }
    }

    console.log(`\r\nCompleted ${new Date()}`);
    process.exit();
})();
