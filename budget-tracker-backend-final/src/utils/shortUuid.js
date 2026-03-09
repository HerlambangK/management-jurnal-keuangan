const crypto = require('crypto');

const SHORT_UUID_LENGTH = 6;
const SHORT_UUID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_UUID_REGEX = /^[A-Za-z0-9]{6}$/;

function buildShortUuid(length = SHORT_UUID_LENGTH) {
    const targetLength = Number.isInteger(length) && length > 0 ? length : SHORT_UUID_LENGTH;
    let value = '';

    while (value.length < targetLength) {
        const bytes = crypto.randomBytes(targetLength);
        for (const byte of bytes) {
            value += SHORT_UUID_ALPHABET[byte % SHORT_UUID_ALPHABET.length];
            if (value.length >= targetLength) break;
        }
    }

    return value;
}

module.exports = {
    SHORT_UUID_LENGTH,
    SHORT_UUID_REGEX,
    buildShortUuid,
};
