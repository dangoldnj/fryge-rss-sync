const crypto = require('crypto');

const normalizeHead = head => {
    if (!head) return {};

    const {
        title = '',
        description = '',
        link = '',
        language = '',
        updated = head.updated || head.pubDate || head.date || '',
    } = head;

    return {
        title,
        description,
        link,
        language,
        updated,
    };
};

const normalizeItem = item => {
    const { guid = '', link = '', title = '', pubDate = '', enclosures = [] } =
        item || {};

    const enclosure =
        Array.isArray(enclosures) && enclosures.length > 0 ? enclosures[0] : {};

    const { length = 0, url = '' } = enclosure;

    return {
        id: guid || link || url || title,
        pubDate,
        length: Number(length) || 0,
        url,
    };
};

const sortItems = items =>
    items.sort((a, b) => {
        if (a.id !== b.id) {
            return a.id.localeCompare(b.id);
        }

        return (a.pubDate || '').localeCompare(b.pubDate || '');
    });

const getFeedSignature = (head = {}, items = []) => {
    const normalizedHead = normalizeHead(head);
    const normalizedItems = sortItems(items.map(normalizeItem));

    const payload = JSON.stringify({
        head: normalizedHead,
        items: normalizedItems,
    });

    return crypto.createHash('sha1').update(payload).digest('hex');
};

module.exports = {
    getFeedSignature,
};
