const { existsSync } = require('fs');
const { resolve } = require('path');

const feedsPath = '../../feeds.json';
const feedsFilepath = resolve(__dirname, feedsPath);
const feedsPresent = existsSync(feedsFilepath);

if (!feedsPresent) {
  console.log('Create your personal `feeds.json`, please!');
}

const FEEDS = feedsPresent
  ? require(feedsPath)
  : { feeds: [] };

const {
  feeds = [],
} = FEEDS;

const getFeeds = () => {
  return feeds;
};

module.exports = {
  getFeeds,
};
