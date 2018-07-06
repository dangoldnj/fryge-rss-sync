const {
  feeds = [],
} = require('../../feeds.json');

const getFeeds = () => {
  return feeds;
};

module.exports = {
  getFeeds,
};
