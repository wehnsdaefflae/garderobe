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
 * Generate random number within range (inclusive)
 */
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Generate random integer within range (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

/**
 * Generate SVG for Müller-Lyer illusion (arrow endings affect perceived length)
 * Returns SVG with 4 lines of equal length but different arrow configurations
 */
function generateMullerLyerSVG() {
  // Randomize parameters for each challenge instance
  const lineLength = randomRange(100, 130);
  const arrowSize = randomRange(lineLength * 0.10, lineLength * 0.15); // 10-15% of line length
  const spacing = 85; // Fixed spacing for consistent layout
  const strokeWidth = randomRange(2, 4);

  // Calculate centered starting position for 4 lines
  const totalWidth = spacing * 3; // 3 gaps between 4 lines
  const baseX = (400 - totalWidth) / 2; // Center in viewBox
  const baseY = randomRange(50, 60);

  // Randomize arrow angle (affects illusion strength)
  const arrowAngleDeg = randomRange(30, 50);
  const arrowAngleRad = (arrowAngleDeg * Math.PI) / 180;
  const arrowDx = arrowSize * Math.cos(arrowAngleRad);
  const arrowDy = arrowSize * Math.sin(arrowAngleRad);

  // Shuffle configurations for randomization
  const configurations = shuffle([
    { arrows: 'outward', perceived: 'longer' },   // arrows pointing away from line
    { arrows: 'inward', perceived: 'shorter' },   // arrows pointing toward line
    { arrows: 'mixed-out', perceived: 'medium' }, // mixed outward
    { arrows: 'mixed-in', perceived: 'medium' }   // mixed inward
  ]);

  // Find answer indices for both ends of spectrum
  const maxIndex = configurations.findIndex(c => c.arrows === 'outward');  // appears longest
  const minIndex = configurations.findIndex(c => c.arrows === 'inward');   // appears shortest

  let svg = `<svg width="100%" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    // Add random offset to each line (±5px vertically for subtle variation)
    const yOffset = randomRange(-5, 5);
    const x = baseX + (idx * spacing);
    const y1 = baseY + yOffset;
    const y2 = y1 + lineLength;
    const answer = String.fromCharCode(65 + idx); // A, B, C, D

    // Create a group with answer data attribute
    svg += `<g class="clickable-option" data-answer="${answer}" style="cursor:pointer">`;

    // Draw main vertical line
    svg += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#000" stroke-width="${strokeWidth}"/>`;

    // Draw arrow endings based on configuration
    if (config.arrows === 'outward') {
      // Top: ^
      svg += `<line x1="${x}" y1="${y1}" x2="${x - arrowDx}" y2="${y1 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y1}" x2="${x + arrowDx}" y2="${y1 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      // Bottom: v
      svg += `<line x1="${x}" y1="${y2}" x2="${x - arrowDx}" y2="${y2 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y2}" x2="${x + arrowDx}" y2="${y2 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
    } else if (config.arrows === 'inward') {
      // Top: v
      svg += `<line x1="${x}" y1="${y1}" x2="${x - arrowDx}" y2="${y1 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y1}" x2="${x + arrowDx}" y2="${y1 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      // Bottom: ^
      svg += `<line x1="${x}" y1="${y2}" x2="${x - arrowDx}" y2="${y2 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y2}" x2="${x + arrowDx}" y2="${y2 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
    } else if (config.arrows === 'mixed-out') {
      // Top: ^
      svg += `<line x1="${x}" y1="${y1}" x2="${x - arrowDx}" y2="${y1 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y1}" x2="${x + arrowDx}" y2="${y1 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      // Bottom: ^
      svg += `<line x1="${x}" y1="${y2}" x2="${x - arrowDx}" y2="${y2 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y2}" x2="${x + arrowDx}" y2="${y2 - arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
    } else if (config.arrows === 'mixed-in') {
      // Top: v
      svg += `<line x1="${x}" y1="${y1}" x2="${x - arrowDx}" y2="${y1 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y1}" x2="${x + arrowDx}" y2="${y1 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      // Bottom: v
      svg += `<line x1="${x}" y1="${y2}" x2="${x - arrowDx}" y2="${y2 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
      svg += `<line x1="${x}" y1="${y2}" x2="${x + arrowDx}" y2="${y2 + arrowDy}" stroke="#000" stroke-width="${strokeWidth}"/>`;
    }

    // Add invisible clickable overlay
    svg += `<rect x="${x - 30}" y="${y1 - 20}" width="60" height="${lineLength + 40}" fill="transparent" />`;
    svg += `</g>`;
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    maxAnswer: String.fromCharCode(65 + maxIndex),
    minAnswer: String.fromCharCode(65 + minIndex)
  };
}

/**
 * Generate SVG for Ebbinghaus/Titchener illusion (context circles affect perceived size)
 * Central circle surrounded by different sized circles appears different
 */
function generateEbbinghausSVG() {
  // Randomize parameters for each challenge instance
  const centerRadius = randomRange(18, 22); // Further reduced to prevent overlap
  const surroundDistance = randomRange(centerRadius * 3.5, centerRadius * 4.2); // Much larger distance
  const numSurrounding = 6; // Fixed at 6 for consistent spacing
  const strokeWidth = randomRange(1.5, 2.5);
  const rotationOffset = randomRange(0, Math.PI / 3); // 0-60° rotation

  // Shuffle configurations for randomization
  const configurations = shuffle([
    { context: 'large', perceived: 'smaller' },  // Small center with large surrounds
    { context: 'small', perceived: 'larger' },   // Small center with small surrounds
    { context: 'medium', perceived: 'medium' },  // Medium surrounds
    { context: 'mixed', perceived: 'medium' }    // Mixed size surrounds
  ]);

  // Find answer indices for both ends of spectrum
  const maxIndex = configurations.findIndex(c => c.context === 'small');  // appears largest
  const minIndex = configurations.findIndex(c => c.context === 'large');  // appears smallest

  let svg = `<svg width="100%" viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    // Add random position jitter (±10px, reduced to prevent clipping)
    const jitterX = randomRange(-10, 10);
    const jitterY = randomRange(-10, 10);
    const cx = 150 + (idx % 2) * 300 + jitterX;
    const cy = 125 + Math.floor(idx / 2) * 250 + jitterY;
    const answer = String.fromCharCode(65 + idx);

    // Create a group with answer data attribute
    svg += `<g class="clickable-option" data-answer="${answer}" style="cursor:pointer">`;

    // Draw center circle (always same size)
    svg += `<circle cx="${cx}" cy="${cy}" r="${centerRadius}" fill="none" stroke="#000" stroke-width="${strokeWidth}"/>`;

    // Draw surrounding circles based on configuration
    for (let i = 0; i < numSurrounding; i++) {
      const angle = (i / numSurrounding) * Math.PI * 2 + rotationOffset;
      const sx = cx + Math.cos(angle) * surroundDistance;
      const sy = cy + Math.sin(angle) * surroundDistance;

      let surroundRadius;
      if (config.context === 'large') {
        // Large surrounds: 1.2-1.4x center size (further reduced to prevent overlap)
        surroundRadius = randomRange(centerRadius * 1.2, centerRadius * 1.4);
      } else if (config.context === 'small') {
        // Small surrounds: 0.35-0.5x center size
        surroundRadius = randomRange(centerRadius * 0.35, centerRadius * 0.5);
      } else if (config.context === 'medium') {
        // Medium surrounds: 0.7-0.9x center size
        surroundRadius = randomRange(centerRadius * 0.7, centerRadius * 0.9);
      } else { // mixed
        // Alternating large and small
        surroundRadius = i % 2 === 0
          ? randomRange(centerRadius * 1.1, centerRadius * 1.3)
          : randomRange(centerRadius * 0.4, centerRadius * 0.6);
      }

      svg += `<circle cx="${sx}" cy="${sy}" r="${surroundRadius}" fill="none" stroke="#666" stroke-width="${strokeWidth}"/>`;
    }

    // Add invisible clickable overlay on the center circle
    svg += `<circle cx="${cx}" cy="${cy}" r="${surroundDistance + 50}" fill="transparent" />`;
    svg += `</g>`;
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    maxAnswer: String.fromCharCode(65 + maxIndex),
    minAnswer: String.fromCharCode(65 + minIndex)
  };
}

/**
 * Generate SVG for simultaneous contrast illusion (background affects perceived brightness)
 * Same grey square appears different on black vs white background
 */
function generateSimultaneousContrastSVG() {
  // Randomize parameters for each challenge instance
  const centerSquareSize = randomRange(50, 70);
  const backgroundSize = centerSquareSize * 2;
  const strokeWidth = randomRange(1, 3);
  const rotation = randomRange(0, 5); // 0-5° subtle rotation

  // Randomize center grey value (same for all in this challenge)
  const greyChannel = randomInt(122, 150); // #7A7A7A to #969696
  const greyValue = `#${greyChannel.toString(16).padStart(2, '0').repeat(3)}`;

  // Helper to generate random hex color in range
  const randomHex = (min, max) => {
    const value = randomInt(min, max);
    return value.toString(16).padStart(2, '0');
  };

  // Shuffle configurations with randomized background colors
  const configurations = shuffle([
    {
      // Black background: pure black to very dark grey
      background: `#${randomHex(0, 26).repeat(3)}`, // #000000 to #1A1A1A
      perceived: 'lighter',
      type: 'black'
    },
    {
      // White background: off-white to pure white
      background: `#${randomHex(230, 255).repeat(3)}`, // #E6E6E6 to #FFFFFF
      perceived: 'darker',
      type: 'white'
    },
    {
      // Dark grey background
      background: `#${randomHex(48, 80).repeat(3)}`, // #303030 to #505050
      perceived: 'medium',
      type: 'dark-grey'
    },
    {
      // Medium grey background (avoiding center grey range)
      background: `#${randomHex(112, 144).repeat(3)}`, // #707070 to #909090
      perceived: 'neutral',
      type: 'medium-grey'
    }
  ]);

  // Find answer indices for both ends of spectrum
  const maxIndex = configurations.findIndex(c => c.type === 'black');  // appears lightest
  const minIndex = configurations.findIndex(c => c.type === 'white');  // appears darkest

  // Randomize border color
  const borderChannel = randomInt(34, 85); // #222 to #555
  const borderColor = `#${borderChannel.toString(16).padStart(2, '0').repeat(3)}`;

  let svg = `<svg width="100%" viewBox="0 0 500 380" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  svg += `<defs><style>.label{font-family:Arial,sans-serif;font-size:20px;font-weight:bold;fill:#333;}</style></defs>`;

  configurations.forEach((config, idx) => {
    // Add random position jitter (±5px, reduced to prevent clipping)
    const jitterX = randomRange(-5, 5);
    const jitterY = randomRange(-5, 5);
    const x = 60 + (idx % 2) * 240 + jitterX;
    const y = 50 + Math.floor(idx / 2) * 180 + jitterY;
    const answer = String.fromCharCode(65 + idx);

    // Calculate center position for rotation
    const centerX = x + backgroundSize / 2;
    const centerY = y + backgroundSize / 2;

    // Create a group with answer data attribute and rotation
    svg += `<g class="clickable-option" data-answer="${answer}" style="cursor:pointer" transform="rotate(${rotation} ${centerX} ${centerY})">`;

    // Draw background square
    svg += `<rect x="${x}" y="${y}" width="${backgroundSize}" height="${backgroundSize}" fill="${config.background}" stroke="${borderColor}" stroke-width="${strokeWidth}"/>`;

    // Draw center square (always same grey for this challenge)
    const innerX = x + (backgroundSize - centerSquareSize) / 2;
    const innerY = y + (backgroundSize - centerSquareSize) / 2;
    svg += `<rect x="${innerX}" y="${innerY}" width="${centerSquareSize}" height="${centerSquareSize}" fill="${greyValue}" stroke="#888" stroke-width="1" stroke-opacity="0.3"/>`;

    // Add invisible clickable overlay
    svg += `<rect x="${x}" y="${y}" width="${backgroundSize}" height="${backgroundSize}" fill="transparent" />`;
    svg += `</g>`;
  });

  svg += `</svg>`;

  return {
    svg,
    options: configurations.map((_, idx) => String.fromCharCode(65 + idx)),
    maxAnswer: String.fromCharCode(65 + maxIndex),
    minAnswer: String.fromCharCode(65 + minIndex)
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
      questions: [
        { text: 'Which line segment appears longest to you?', end: 'max' },
        { text: 'Which line segment appears shortest to you?', end: 'min' }
      ],
      humanBias: 'Humans perceive outward arrows as longer, inward as shorter'
    },
    {
      type: 'ebbinghaus',
      generator: generateEbbinghausSVG,
      questions: [
        { text: 'Which center circle appears largest to you?', end: 'max' },
        { text: 'Which center circle appears smallest to you?', end: 'min' }
      ],
      humanBias: 'Humans perceive circles with small surrounds as larger, large surrounds as smaller'
    },
    {
      type: 'simultaneous-contrast',
      generator: generateSimultaneousContrastSVG,
      questions: [
        { text: 'Which center square appears lightest to you?', end: 'max' },
        { text: 'Which center square appears darkest to you?', end: 'min' }
      ],
      humanBias: 'Humans perceive grey as lighter on black, darker on white'
    }
  ];

  // Pick random illusion type
  const illusion = illusionTypes[Math.floor(Math.random() * illusionTypes.length)];

  // Pick random question variant (max or min end of spectrum)
  const questionVariant = illusion.questions[Math.floor(Math.random() * illusion.questions.length)];

  // Generate SVG (with randomized positions)
  const { svg, options, maxAnswer, minAnswer } = illusion.generator();

  // Select correct answer based on question variant
  const correctAnswer = questionVariant.end === 'max' ? maxAnswer : minAnswer;

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
    question: questionVariant.text,
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
