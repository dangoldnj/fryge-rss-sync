const { filterUnsafeFilenameChars } = require("./filterUnsafeFilenameChars");

const keepFileExtensionAndFilter = (input, fileType) => {
  try {
    const stripExtension = input.replace(fileType, "");
    const text = filterUnsafeFilenameChars(stripExtension) + fileType;
    return text;
  } catch (error) {
    console.log(`Error filtering: ${input}, ${fileType}, ${error}`);
  }
};

module.exports = {
  keepFileExtensionAndFilter,
};
