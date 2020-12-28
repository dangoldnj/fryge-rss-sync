const filterUnsafeFilenameChars = input => {
  if (!input) {
    return '';
  }

  const text = input
    .replace(/[=&<>:'"/\\|?*]/g, ' ')
    .replace(/\s+/g, '-')
    .slice(0, 245);
  return text;
};

module.exports = {
  filterUnsafeFilenameChars,
};
