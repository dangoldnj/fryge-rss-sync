const { filterUnsafeFilenameChars } = require('./filterUnsafeFilenameChars');

const keepFileExtensionAndFilter = (input, fileType) => {
  const stripExtension = input.replace(fileType, '');
  const text = filterUnsafeFilenameChars(stripExtension) + fileType;
  return text;
};

module.exports = {
  keepFileExtensionAndFilter,
};
