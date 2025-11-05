/**
 * Generate iCalendar (.ics) file for coat check ticket
 * Includes mnemonic phrase in description and QR code as attachment
 */

/**
 * Format date for iCalendar (YYYYMMDDTHHMMSSZ in UTC)
 */
function formatICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Escape text for iCalendar format (commas, semicolons, backslashes, newlines)
 */
function escapeICalText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long lines per RFC 5545 (max 75 octets per line)
 * Lines are folded by inserting CRLF followed by a single space
 */
function foldLine(line) {
  const maxLength = 75;
  if (line.length <= maxLength) {
    return line;
  }

  const folded = [];
  let remaining = line;

  // First line can be full 75 chars
  folded.push(remaining.substring(0, maxLength));
  remaining = remaining.substring(maxLength);

  // Continuation lines start with space, so max 74 chars of content
  while (remaining.length > 0) {
    folded.push(' ' + remaining.substring(0, maxLength - 1));
    remaining = remaining.substring(maxLength - 1);
  }

  return folded.join('\r\n');
}

/**
 * Generate iCalendar event with embedded QR code and mnemonic
 *
 * @param {Object} options - Calendar event options
 * @param {string} options.ticketId - Ticket ID
 * @param {string} options.slug - Event slug
 * @param {string} options.eventName - Event name
 * @param {string} options.mnemonic - Mnemonic phrase
 * @param {string} options.qrCodeBase64 - Base64-encoded PNG QR code (without data:image/png;base64, prefix)
 * @param {Date} options.expiresAt - Event expiration date
 * @param {string} options.ticketUrl - Full URL to ticket
 * @returns {string} iCalendar file content
 */
function generateCalendarEvent(options) {
  const {
    ticketId,
    slug,
    eventName,
    mnemonic,
    qrCodeBase64,
    expiresAt,
    ticketUrl
  } = options;

  const now = new Date();
  const reminderDate = new Date(expiresAt.getTime() - 2 * 60 * 60 * 1000); // 2 hours before expiry

  // Format dates for all-day event (YYYYMMDD format without time)
  const formatDateOnly = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  // For a single-day all-day event, DTSTART and DTEND should be the same day
  const today = formatDateOnly(now);

  // Create description with mnemonic and instructions
  const description = escapeICalText(
    `🎫 Garderobe Digital Coat Check Ticket #${ticketId}\n\n` +
    `MNEMONIC PHRASE (for verification):\n${mnemonic}\n\n` +
    `IMPORTANT:\n` +
    `• Show your QR code to staff when retrieving your coat (access via URL below)\n` +
    `• Or provide the mnemonic phrase: ${mnemonic}\n` +
    `• This ticket expires on ${expiresAt.toLocaleString()}\n` +
    `• Keep this calendar event until you retrieve your coat\n\n` +
    `Ticket URL: ${ticketUrl}\n\n` +
    `Event: ${eventName || 'Coat Check'}`
  );

  // Build iCalendar content
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Garderobe Digital//Coat Check Ticket//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:garderobe-ticket-${slug}-${ticketId}@garderobe.io`,
    `DTSTAMP:${formatICalDate(now)}`,
    `DTSTART;VALUE=DATE:${today}`,
    `DTEND;VALUE=DATE:${today}`,
    `SUMMARY:🎫 Coat Check Ticket #${ticketId}${eventName ? ' - ' + escapeICalText(eventName) : ''}`,
    `DESCRIPTION:${description}`,
    `URL:${ticketUrl}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:Your coat check ticket #${ticketId} expires in 2 hours!`,
    `TRIGGER;VALUE=DATE-TIME:${formatICalDate(reminderDate)}`,
    'END:VALARM',
  ];

  // Add QR code as base64 attachment
  // Split into chunks for line folding
  const attachLine = `ATTACH;ENCODING=BASE64;VALUE=BINARY;FMTTYPE=image/png;X-FILENAME=ticket-${ticketId}-qr.png:${qrCodeBase64}`;
  lines.push(foldLine(attachLine));

  lines.push(
    'END:VEVENT',
    'END:VCALENDAR'
  );

  // Join with CRLF as per RFC 5545
  return lines.join('\r\n');
}

module.exports = {
  generateCalendarEvent,
  formatICalDate,
  escapeICalText,
  foldLine
};
