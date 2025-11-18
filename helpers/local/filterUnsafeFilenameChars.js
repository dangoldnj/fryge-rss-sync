const filterUnsafeFilenameChars = (input) => {
  try {
    if (!input) {
      return "";
    }
    const text = input
      .replace(/[=&<>:'"/\\|?*]/g, " ")
      .replace(/\s+/g, "-")
      .slice(0, 128);
    return text;
  } catch (error) {
    console.log(`Error filtering unsafe characters: ${input}, ${error}`);
  }
};

module.exports = {
  filterUnsafeFilenameChars,
};
