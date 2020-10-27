const { existsSync } = require('fs');
// eslint-disable-next-line unicorn/import-style
const { resolve } = require('path');

const feedsPath = '../../feeds.json';
const feedsFilepath = resolve(__dirname, feedsPath);
const feedsPresent = existsSync(feedsFilepath);

if (!feedsPresent) {
  console.log('Create your personal `feeds.json`, please!');
}

const emptyFeedObject = () => ({
  defaultPolicy: {},
  feeds: [],
});

const FEEDS = feedsPresent
  ? require(feedsPath)
  : emptyFeedObject();

const {
  defaultPolicy = {},
  feeds = [],
} = FEEDS;

const getFeedDefaultPolicy = () => {
  return defaultPolicy;
};

const getFeeds = () => {
  return feeds;
};

module.exports = {
  emptyFeedObject,
  getFeedDefaultPolicy,
  getFeeds,
};
