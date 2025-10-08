const crypto = require('crypto');

/**
 * Simple proof-of-work challenge system
 * No external services needed
 */

/**
 * Generate a simple math challenge
 * Returns {question, answer, challenge_id}
 */
function generateChallenge() {
  const operations = [
    { op: '+', fn: (a, b) => a + b, symbol: '+' },
    { op: '-', fn: (a, b) => a - b, symbol: '-' },
    { op: '*', fn: (a, b) => a * b, symbol: '×' }
  ];

  const operation = operations[Math.floor(Math.random() * operations.length)];

  // Generate numbers based on operation
  let num1, num2;
  switch(operation.op) {
    case '+':
      num1 = Math.floor(Math.random() * 50) + 10;
      num2 = Math.floor(Math.random() * 50) + 10;
      break;
    case '-':
      num1 = Math.floor(Math.random() * 50) + 50; // Ensure positive result
      num2 = Math.floor(Math.random() * 30) + 10;
      break;
    case '*':
      num1 = Math.floor(Math.random() * 12) + 2;
      num2 = Math.floor(Math.random() * 12) + 2;
      break;
  }

  const answer = operation.fn(num1, num2);
  const question = `${num1} ${operation.symbol} ${num2}`;

  // Generate challenge ID (hash of answer + timestamp + random)
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const challengeId = crypto
    .createHash('sha256')
    .update(`${answer}:${timestamp}:${random}`)
    .digest('hex')
    .slice(0, 16);

  return {
    question,
    answer: answer.toString(),
    challengeId,
    timestamp
  };
}

/**
 * Store challenge in Redis with 5 minute TTL
 */
async function storeChallenge(redis, challenge) {
  const key = `challenge:${challenge.challengeId}`;
  await redis.setEx(key, 300, JSON.stringify({
    answer: challenge.answer,
    timestamp: challenge.timestamp
  }));
}

/**
 * Verify challenge response
 */
async function verifyChallenge(redis, challengeId, userAnswer) {
  const key = `challenge:${challengeId}`;
  const data = await redis.get(key);

  if (!data) {
    return { valid: false, error: 'Challenge expired or invalid' };
  }

  const challenge = JSON.parse(data);

  // Check if answer is correct
  if (challenge.answer !== userAnswer.toString()) {
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
 * Check rate limit for challenge requests
 * Prevent challenge spam
 */
async function checkChallengeRateLimit(redis, ip) {
  const key = `challenge_requests:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }

  // Max 20 challenge requests per hour per IP
  return count <= 20;
}

module.exports = {
  generateChallenge,
  storeChallenge,
  verifyChallenge,
  checkChallengeRateLimit
};
