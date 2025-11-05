const crypto = require('crypto');
const bip39 = require('bip39');

/**
 * Generate a deterministic mnemonic phrase from ticket data
 * Uses BIP39 standard with deterministic entropy derived from ticket data
 *
 * @param {string} slug - Event slug
 * @param {number} ticketId - Ticket ID
 * @param {string} token - Ticket token (provides entropy)
 * @returns {string} 6-word mnemonic phrase (e.g., "apple orange banana grape melon peach")
 */
function generateMnemonic(slug, ticketId, token) {
  // Create deterministic seed from ticket data
  const data = `${slug}:${ticketId}:${token}`;

  // Use HMAC-SHA256 for deterministic hashing (allows verification)
  const hmac = crypto.createHmac('sha256', 'garderobe-mnemonic-v1');
  hmac.update(data);
  const hash = hmac.digest();

  // Use first 16 bytes (128 bits) for entropy - generates 12-word mnemonic
  // We'll use only first 6 words for simplicity (still ~66 bits of entropy)
  const entropy = hash.slice(0, 16);
  const fullMnemonic = bip39.entropyToMnemonic(entropy);

  // Return first 6 words for memorability (still very secure with token validation)
  const words = fullMnemonic.split(' ').slice(0, 6);
  return words.join(' ');
}

/**
 * Verify a mnemonic phrase against ticket data
 *
 * @param {string} inputPhrase - User-provided mnemonic phrase
 * @param {string} slug - Event slug
 * @param {number} ticketId - Ticket ID
 * @param {string} token - Ticket token
 * @returns {boolean} True if phrase matches
 */
function verifyMnemonic(inputPhrase, slug, ticketId, token) {
  const expectedPhrase = generateMnemonic(slug, ticketId, token);

  // Normalize input (lowercase, trim, collapse multiple spaces)
  const normalizedInput = inputPhrase.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedExpected = expectedPhrase.toLowerCase().trim();

  return normalizedInput === normalizedExpected;
}

/**
 * Format mnemonic for display (adds word numbers for clarity)
 *
 * @param {string} mnemonic - The mnemonic phrase
 * @returns {Array} Array of {word, number} objects
 */
function formatMnemonicForDisplay(mnemonic) {
  const words = mnemonic.split(' ');
  return words.map((word, index) => ({
    number: index + 1,
    word: word
  }));
}

module.exports = {
  generateMnemonic,
  verifyMnemonic,
  formatMnemonicForDisplay
};
