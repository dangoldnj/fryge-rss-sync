const { inspect } = require("util");

const formatError = (error) => {
  if (error instanceof Error) {
    return error.message || inspect(error);
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return inspect(error, { depth: 2, breakLength: 120 });
  } catch (inspectionError) {
    return String(error ?? inspectionError);
  }
};

module.exports = {
  formatError,
};
