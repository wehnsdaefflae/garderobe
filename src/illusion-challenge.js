const crypto = require('crypto');

/**
 * Optical illusion-based bot prevention challenge
 * Exploits human visual perception biases that machines don't have
 */

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate SVG for Müller-Lyer illusion (arrow endings affect perceived length)
 * Returns SVG with 4 lines of equal length but different arrow configurations
 */
function generateMullerLyerSVG() {
  const lineLength = 120;
  const baseY = 40;
  const spacing = 80;

  // Shuffle configurations for randomization
  const configurations = shuffle([
    { arrows: 'outward', perceived: 'longer' },   // >----<
    { arrows: 'inward', perceived: 'shorter' },   // <---->
    { arrows: 'mixed-out', perceived: 'medium' }, // >---->
    { arrows: 'mixed-in', perceived: 'medium' }   // <----<
  ]);

  // Find correct answer index (outward arrows appear longest)
  const correctIndex = configurations.findIndex(c => c.arrows === 'outward');

  let svg = `<svg width="600" height="320" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    const y = baseY + (idx * spacing);
    const x1 = 100;
    const x2 = x1 + lineLength;
    const label = String.fromCharCode(65 + idx); // A, B, C, D

    // Draw label
    svg += `<text x="60" y="${y + 5}" class="label">${label}</text>`;

    // Draw main line
    svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#000" stroke-width="3"/>`;

    // Draw arrow endings based on configuration
    const arrowSize = 15;

    if (config.arrows === 'outward') {
      // Left: >
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 - arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 - arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
      // Right: <
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 + arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 + arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
    } else if (config.arrows === 'inward') {
      // Left: <
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 + arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 + arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
      // Right: >
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 - arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 - arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
    } else if (config.arrows === 'mixed-out') {
      // Left: >
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 - arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 - arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
      // Right: >
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 - arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 - arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
    } else if (config.arrows === 'mixed-in') {
      // Left: <
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 + arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x1}" y1="${y}" x2="${x1 + arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
      // Right: <
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 + arrowSize}" y2="${y - arrowSize}" stroke="#000" stroke-width="3"/>`;
      svg += `<line x1="${x2}" y1="${y}" x2="${x2 + arrowSize}" y2="${y + arrowSize}" stroke="#000" stroke-width="3"/>`;
    }
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    correctAnswer: String.fromCharCode(65 + correctIndex)
  };
}

/**
 * Generate SVG for Ebbinghaus/Titchener illusion (context circles affect perceived size)
 * Central circle surrounded by different sized circles appears different
 */
function generateEbbinghausSVG() {
  // Shuffle configurations for randomization
  const configurations = shuffle([
    { context: 'large', perceived: 'smaller' },  // Small center with large surrounds
    { context: 'small', perceived: 'larger' },   // Small center with small surrounds
    { context: 'medium', perceived: 'medium' },  // Medium surrounds
    { context: 'mixed', perceived: 'medium' }    // Mixed size surrounds
  ]);

  // Find correct answer index (small surrounds make center appear largest)
  const correctIndex = configurations.findIndex(c => c.context === 'small');

  const centerRadius = 25;
  const spacing = 150;

  let svg = `<svg width="600" height="320" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    const cx = 100 + (idx % 2) * 300;
    const cy = 80 + Math.floor(idx / 2) * 160;
    const label = String.fromCharCode(65 + idx);

    // Draw label
    svg += `<text x="${cx - 30}" y="${cy - 60}" class="label">${label}</text>`;

    // Draw center circle (always same size)
    svg += `<circle cx="${cx}" cy="${cy}" r="${centerRadius}" fill="none" stroke="#000" stroke-width="2"/>`;

    // Draw surrounding circles based on configuration
    const numSurrounding = 6;
    const surroundDistance = 70;

    for (let i = 0; i < numSurrounding; i++) {
      const angle = (i / numSurrounding) * Math.PI * 2;
      const sx = cx + Math.cos(angle) * surroundDistance;
      const sy = cy + Math.sin(angle) * surroundDistance;

      let surroundRadius;
      if (config.context === 'large') {
        surroundRadius = 35;
      } else if (config.context === 'small') {
        surroundRadius = 12;
      } else if (config.context === 'medium') {
        surroundRadius = 22;
      } else { // mixed
        surroundRadius = i % 2 === 0 ? 30 : 15;
      }

      svg += `<circle cx="${sx}" cy="${sy}" r="${surroundRadius}" fill="none" stroke="#666" stroke-width="2"/>`;
    }
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    correctAnswer: String.fromCharCode(65 + correctIndex)
  };
}

/**
 * Generate SVG for simultaneous contrast illusion (background affects perceived brightness)
 * Same grey square appears different on black vs white background
 */
function generateSimultaneousContrastSVG() {
  // Shuffle configurations for randomization
  const configurations = shuffle([
    { background: '#000000', perceived: 'lighter' }, // Black background makes square look lighter
    { background: '#FFFFFF', perceived: 'darker' },  // White background makes square look darker
    { background: '#808080', perceived: 'neutral' }, // Grey background, neutral perception
    { background: '#404040', perceived: 'medium' }   // Dark grey background
  ]);

  // Find correct answer index (black background makes grey appear lightest)
  const correctIndex = configurations.findIndex(c => c.background === '#000000');

  const squareSize = 60;
  const greyValue = '#888888'; // Same grey for all center squares

  let svg = `<svg width="600" height="320" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    const x = 50 + (idx % 2) * 300;
    const y = 40 + Math.floor(idx / 2) * 160;
    const label = String.fromCharCode(65 + idx);

    // Draw label
    svg += `<text x="${x - 20}" y="${y - 10}" class="label">${label}</text>`;

    // Draw background square
    svg += `<rect x="${x}" y="${y}" width="${squareSize * 2}" height="${squareSize * 2}" fill="${config.background}" stroke="#999" stroke-width="1"/>`;

    // Draw center square (always same grey)
    const centerX = x + squareSize / 2;
    const centerY = y + squareSize / 2;
    svg += `<rect x="${centerX}" y="${centerY}" width="${squareSize}" height="${squareSize}" fill="${greyValue}" stroke="none"/>`;
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    correctAnswer: String.fromCharCode(65 + correctIndex)
  };
}

/**
 * Generate an illusion challenge
 * Returns {type, question, svg, options, answer, challengeId}
 */
function generateIllusionChallenge() {
  const illusionTypes = [
    {
      type: 'muller-lyer',
      generator: generateMullerLyerSVG,
      question: 'Which line segment appears longest to you?',
      humanBias: 'Humans perceive outward arrows as longer'
    },
    {
      type: 'ebbinghaus',
      generator: generateEbbinghausSVG,
      question: 'Which center circle appears largest to you?',
      humanBias: 'Humans perceive circles with small surrounds as larger'
    },
    {
      type: 'simultaneous-contrast',
      generator: generateSimultaneousContrastSVG,
      question: 'Which center square appears lightest to you?',
      humanBias: 'Humans perceive grey as lighter on black backgrounds'
    }
  ];

  // Pick random illusion type
  const illusion = illusionTypes[Math.floor(Math.random() * illusionTypes.length)];

  // Generate SVG (with randomized positions)
  const { svg, options, correctAnswer } = illusion.generator();

  // Generate challenge ID
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const challengeId = crypto
    .createHash('sha256')
    .update(`${correctAnswer}:${timestamp}:${random}`)
    .digest('hex')
    .slice(0, 16);

  return {
    type: illusion.type,
    question: illusion.question,
    svg,
    options,
    answer: correctAnswer,
    challengeId,
    timestamp
  };
}

/**
 * Store illusion challenge in Redis with 5 minute TTL
 */
async function storeIllusionChallenge(redis, challenge) {
  const key = `illusion_challenge:${challenge.challengeId}`;
  await redis.setEx(key, 300, JSON.stringify({
    answer: challenge.answer,
    type: challenge.type,
    timestamp: challenge.timestamp
  }));
}

/**
 * Verify illusion challenge response
 */
async function verifyIllusionChallenge(redis, challengeId, userAnswer) {
  const key = `illusion_challenge:${challengeId}`;
  const data = await redis.get(key);

  if (!data) {
    return { valid: false, error: 'Challenge expired or invalid' };
  }

  const challenge = JSON.parse(data);

  // Check if answer is correct (case-insensitive)
  if (challenge.answer.toUpperCase() !== userAnswer.toString().toUpperCase()) {
    return { valid: false, error: 'Incorrect answer' };
  }

  // Check if challenge is not too old (5 minutes max)
  const age = Date.now() - challenge.timestamp;
  if (age > 300000) {
    await redis.del(key);
    return { valid: false, error: 'Challenge expired' };
  }

  // Delete challenge after successful verification (one-time use)
  await redis.del(key);

  return { valid: true };
}

/**
 * Check rate limit for illusion challenge requests
 */
async function checkIllusionChallengeRateLimit(redis, ip) {
  const key = `illusion_challenge_requests:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }

  // Max 20 challenge requests per hour per IP
  return count <= 20;
}

module.exports = {
  generateIllusionChallenge,
  storeIllusionChallenge,
  verifyIllusionChallenge,
  checkIllusionChallengeRateLimit,
  // Export generators for testing
  generateMullerLyerSVG,
  generateEbbinghausSVG,
  generateSimultaneousContrastSVG
};
