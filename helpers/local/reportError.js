const reportError = (error, handler) => {
    console.log('\n', error);
    if (typeof handler === 'function') {
        handler(error);
    }
    return error;
};

module.exports = {
    reportError,
};
