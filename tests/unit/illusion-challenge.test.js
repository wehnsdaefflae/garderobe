/**
 * Optical Illusion Challenge Tests
 * Tests for illusion-based bot prevention system
 */

const {
  generateIllusionChallenge,
  storeIllusionChallenge,
  verifyIllusionChallenge,
  checkIllusionChallengeRateLimit,
  generateMullerLyerSVG,
  generateEbbinghausSVG,
  generateSimultaneousContrastSVG
} = require('../../src/illusion-challenge');
const { initRedis, getRedisClient, closeRedis } = require('../../src/redis');

let redis;

beforeAll(async () => {
  await initRedis();
  redis = getRedisClient();
});

afterAll(async () => {
  await closeRedis();
});

afterEach(async () => {
  // Clean up test keys
  const keys = await redis.keys('illusion_challenge:*');
  const rateLimitKeys = await redis.keys('illusion_challenge_requests:*');
  if (keys.length > 0) await redis.del(...keys);
  if (rateLimitKeys.length > 0) await redis.del(...rateLimitKeys);
});

describe('SVG Generation', () => {
  describe('generateMullerLyerSVG', () => {
    test('should generate valid SVG markup', () => {
      const result = generateMullerLyerSVG();

      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
      expect(result.svg).toContain('<line');
    });

    test('should return 4 options (A, B, C, D)', () => {
      const result = generateMullerLyerSVG();

      expect(result.options).toHaveLength(4);
      expect(result.options).toEqual(['A', 'B', 'C', 'D']);
    });

    test('should set max and min answers (randomized position)', () => {
      // Generate multiple times to verify randomization
      for (let i = 0; i < 10; i++) {
        const result = generateMullerLyerSVG();
        // Max answer (longest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.maxAnswer);
        expect(result.maxAnswer).toBeTruthy();
        // Min answer (shortest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.minAnswer);
        expect(result.minAnswer).toBeTruthy();
        // Max and min should be different
        expect(result.maxAnswer).not.toBe(result.minAnswer);
      }
    });

    test('should draw 4 lines with labels', () => {
      const result = generateMullerLyerSVG();

      // Should have labels A, B, C, D
      expect(result.svg).toContain('>A</text>');
      expect(result.svg).toContain('>B</text>');
      expect(result.svg).toContain('>C</text>');
      expect(result.svg).toContain('>D</text>');
    });

    test('should include arrow markers', () => {
      const result = generateMullerLyerSVG();

      // Should have multiple line elements (main lines + arrow endpoints)
      const lineMatches = result.svg.match(/<line/g);
      expect(lineMatches.length).toBeGreaterThan(4); // 4 main lines + arrow ends
    });
  });

  describe('generateEbbinghausSVG', () => {
    test('should generate valid SVG markup', () => {
      const result = generateEbbinghausSVG();

      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
      expect(result.svg).toContain('<circle');
    });

    test('should return 4 options', () => {
      const result = generateEbbinghausSVG();

      expect(result.options).toHaveLength(4);
      expect(result.options).toEqual(['A', 'B', 'C', 'D']);
    });

    test('should set max and min answers (randomized position)', () => {
      // Generate multiple times to verify randomization
      for (let i = 0; i < 10; i++) {
        const result = generateEbbinghausSVG();
        // Max answer (largest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.maxAnswer);
        expect(result.maxAnswer).toBeTruthy();
        // Min answer (smallest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.minAnswer);
        expect(result.minAnswer).toBeTruthy();
        // Max and min should be different
        expect(result.maxAnswer).not.toBe(result.minAnswer);
      }
    });

    test('should draw circles with labels', () => {
      const result = generateEbbinghausSVG();

      expect(result.svg).toContain('>A</text>');
      expect(result.svg).toContain('>B</text>');
      expect(result.svg).toContain('>C</text>');
      expect(result.svg).toContain('>D</text>');
    });

    test('should include center and surrounding circles', () => {
      const result = generateEbbinghausSVG();

      // Should have multiple circles (4 centers + surrounding circles)
      const circleMatches = result.svg.match(/<circle/g);
      expect(circleMatches.length).toBeGreaterThan(4);
    });
  });

  describe('generateSimultaneousContrastSVG', () => {
    test('should generate valid SVG markup', () => {
      const result = generateSimultaneousContrastSVG();

      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
      expect(result.svg).toContain('<rect');
    });

    test('should return 4 options', () => {
      const result = generateSimultaneousContrastSVG();

      expect(result.options).toHaveLength(4);
      expect(result.options).toEqual(['A', 'B', 'C', 'D']);
    });

    test('should set max and min answers (randomized position)', () => {
      // Generate multiple times to verify randomization
      for (let i = 0; i < 10; i++) {
        const result = generateSimultaneousContrastSVG();
        // Max answer (lightest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.maxAnswer);
        expect(result.maxAnswer).toBeTruthy();
        // Min answer (darkest) should be one of the options
        expect(['A', 'B', 'C', 'D']).toContain(result.minAnswer);
        expect(result.minAnswer).toBeTruthy();
        // Max and min should be different
        expect(result.maxAnswer).not.toBe(result.minAnswer);
      }
    });

    test('should draw rectangles with different backgrounds', () => {
      const result = generateSimultaneousContrastSVG();

      // Should have different background colors
      expect(result.svg).toContain('#000000'); // Black
      expect(result.svg).toContain('#FFFFFF'); // White
      expect(result.svg).toContain('#808080'); // Grey
    });

    test('should include same grey center squares', () => {
      const result = generateSimultaneousContrastSVG();

      // All center squares should be same grey
      const greyMatches = result.svg.match(/#888888/g);
      expect(greyMatches.length).toBe(4); // 4 center squares
    });
  });
});

describe('Challenge Generation', () => {
  test('should generate a complete challenge', () => {
    const challenge = generateIllusionChallenge();

    expect(challenge).toHaveProperty('type');
    expect(challenge).toHaveProperty('question');
    expect(challenge).toHaveProperty('svg');
    expect(challenge).toHaveProperty('options');
    expect(challenge).toHaveProperty('answer');
    expect(challenge).toHaveProperty('challengeId');
    expect(challenge).toHaveProperty('timestamp');
  });

  test('should generate one of three illusion types', () => {
    const validTypes = ['muller-lyer', 'ebbinghaus', 'simultaneous-contrast'];

    // Generate multiple challenges to test randomness
    for (let i = 0; i < 10; i++) {
      const challenge = generateIllusionChallenge();
      expect(validTypes).toContain(challenge.type);
    }
  });

  test('should generate unique challenge IDs', () => {
    const challenge1 = generateIllusionChallenge();
    const challenge2 = generateIllusionChallenge();

    expect(challenge1.challengeId).not.toBe(challenge2.challengeId);
  });

  test('should generate valid SVG', () => {
    const challenge = generateIllusionChallenge();

    expect(challenge.svg).toContain('<svg');
    expect(challenge.svg).toContain('</svg>');
  });

  test('should include appropriate question for illusion type', () => {
    const challenge = generateIllusionChallenge();

    if (challenge.type === 'muller-lyer') {
      expect(challenge.question).toContain('line segment');
      // Should ask for either longest OR shortest
      const hasMaxOrMin = challenge.question.includes('longest') || challenge.question.includes('shortest');
      expect(hasMaxOrMin).toBe(true);
    } else if (challenge.type === 'ebbinghaus') {
      expect(challenge.question).toContain('circle');
      // Should ask for either largest OR smallest
      const hasMaxOrMin = challenge.question.includes('largest') || challenge.question.includes('smallest');
      expect(hasMaxOrMin).toBe(true);
    } else if (challenge.type === 'simultaneous-contrast') {
      expect(challenge.question).toContain('square');
      // Should ask for either lightest OR darkest
      const hasMaxOrMin = challenge.question.includes('lightest') || challenge.question.includes('darkest');
      expect(hasMaxOrMin).toBe(true);
    }
  });

  test('should have 4 options', () => {
    const challenge = generateIllusionChallenge();
    expect(challenge.options).toHaveLength(4);
  });

  test('should have valid answer from options', () => {
    const challenge = generateIllusionChallenge();
    expect(challenge.options).toContain(challenge.answer);
  });

  test('should vary questions between max and min ends of spectrum', () => {
    const questions = new Set();

    // Generate 50 challenges to capture variety
    for (let i = 0; i < 50; i++) {
      const challenge = generateIllusionChallenge();
      questions.add(challenge.question);
    }

    // Should have seen multiple question variants
    // With 3 illusion types × 2 question variants = 6 possible questions
    expect(questions.size).toBeGreaterThan(2);

    // Check that we get both max and min variants
    const questionList = Array.from(questions);
    const hasMaxVariant = questionList.some(q => q.includes('longest') || q.includes('largest') || q.includes('lightest'));
    const hasMinVariant = questionList.some(q => q.includes('shortest') || q.includes('smallest') || q.includes('darkest'));

    expect(hasMaxVariant).toBe(true);
    expect(hasMinVariant).toBe(true);
  });
});

describe('Challenge Storage', () => {
  test('should store challenge in Redis', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    const key = `illusion_challenge:${challenge.challengeId}`;
    const stored = await redis.get(key);

    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored);
    expect(parsed.answer).toBe(challenge.answer);
    expect(parsed.type).toBe(challenge.type);
    expect(parsed.timestamp).toBe(challenge.timestamp);
  });

  test('should set 5 minute TTL on stored challenge', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    const key = `illusion_challenge:${challenge.challengeId}`;
    const ttl = await redis.ttl(key);

    // TTL should be close to 300 seconds (5 minutes)
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });
});

describe('Challenge Verification', () => {
  test('should verify correct answer', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );

    expect(result.valid).toBe(true);
  });

  test('should reject incorrect answer', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    // Use wrong answer (not the correct one)
    const wrongAnswer = challenge.answer === 'A' ? 'B' : 'A';

    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      wrongAnswer
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Incorrect answer');
  });

  test('should be case-insensitive', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    // Test lowercase answer
    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer.toLowerCase()
    );

    expect(result.valid).toBe(true);
  });

  test('should reject non-existent challenge', async () => {
    const result = await verifyIllusionChallenge(
      redis,
      'nonexistent_id_123',
      'A'
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired or invalid');
  });

  test('should delete challenge after successful verification (one-time use)', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    // First verification should succeed
    const result1 = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );
    expect(result1.valid).toBe(true);

    // Second verification should fail (challenge deleted)
    const result2 = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );
    expect(result2.valid).toBe(false);
  });

  test('should not delete challenge after failed verification', async () => {
    const challenge = generateIllusionChallenge();
    await storeIllusionChallenge(redis, challenge);

    const wrongAnswer = challenge.answer === 'A' ? 'B' : 'A';

    // First attempt with wrong answer
    await verifyIllusionChallenge(redis, challenge.challengeId, wrongAnswer);

    // Challenge should still exist
    const key = `illusion_challenge:${challenge.challengeId}`;
    const exists = await redis.exists(key);
    expect(exists).toBe(1);

    // Second attempt with correct answer should work
    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );
    expect(result.valid).toBe(true);
  });

  test('should reject expired challenge', async () => {
    const challenge = generateIllusionChallenge();
    // Manually set old timestamp (6 minutes ago)
    challenge.timestamp = Date.now() - (6 * 60 * 1000);

    await storeIllusionChallenge(redis, challenge);

    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });
});

describe('Rate Limiting', () => {
  test('should allow requests under limit', async () => {
    const ip = '192.168.1.100';

    for (let i = 0; i < 20; i++) {
      const allowed = await checkIllusionChallengeRateLimit(redis, ip);
      expect(allowed).toBe(true);
    }
  });

  test('should block requests over limit', async () => {
    const ip = '192.168.1.101';

    // Make 20 requests (at limit)
    for (let i = 0; i < 20; i++) {
      await checkIllusionChallengeRateLimit(redis, ip);
    }

    // 21st request should be blocked
    const allowed = await checkIllusionChallengeRateLimit(redis, ip);
    expect(allowed).toBe(false);
  });

  test('should set 1 hour TTL on rate limit key', async () => {
    const ip = '192.168.1.102';

    await checkIllusionChallengeRateLimit(redis, ip);

    const key = `illusion_challenge_requests:${ip}`;
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(3590); // Close to 1 hour
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  test('should isolate rate limits by IP', async () => {
    const ip1 = '192.168.1.103';
    const ip2 = '192.168.1.104';

    // Exhaust limit for ip1
    for (let i = 0; i < 20; i++) {
      await checkIllusionChallengeRateLimit(redis, ip1);
    }

    // ip2 should still be allowed
    const allowed = await checkIllusionChallengeRateLimit(redis, ip2);
    expect(allowed).toBe(true);
  });
});

describe('Integration Tests', () => {
  test('complete challenge flow', async () => {
    const ip = '192.168.1.200';

    // 1. Check rate limit
    const rateAllowed = await checkIllusionChallengeRateLimit(redis, ip);
    expect(rateAllowed).toBe(true);

    // 2. Generate challenge
    const challenge = generateIllusionChallenge();
    expect(challenge.challengeId).toBeTruthy();

    // 3. Store challenge
    await storeIllusionChallenge(redis, challenge);

    // 4. Verify correct answer
    const result = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );
    expect(result.valid).toBe(true);

    // 5. Verify challenge is gone (one-time use)
    const result2 = await verifyIllusionChallenge(
      redis,
      challenge.challengeId,
      challenge.answer
    );
    expect(result2.valid).toBe(false);
  });

  test('should handle concurrent challenge generation', () => {
    const challenges = [];

    // Generate 100 challenges
    for (let i = 0; i < 100; i++) {
      challenges.push(generateIllusionChallenge());
    }

    // All should have unique IDs
    const ids = challenges.map(c => c.challengeId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);

    // All should be valid
    challenges.forEach(challenge => {
      expect(challenge.svg).toContain('<svg');
      expect(challenge.options).toHaveLength(4);
      expect(challenge.answer).toBeTruthy();
    });
  });

  test('should generate distribution of illusion types', () => {
    const types = {
      'muller-lyer': 0,
      'ebbinghaus': 0,
      'simultaneous-contrast': 0
    };

    // Generate 100 challenges
    for (let i = 0; i < 100; i++) {
      const challenge = generateIllusionChallenge();
      types[challenge.type]++;
    }

    // Each type should appear at least once in 100 attempts
    expect(types['muller-lyer']).toBeGreaterThan(0);
    expect(types['ebbinghaus']).toBeGreaterThan(0);
    expect(types['simultaneous-contrast']).toBeGreaterThan(0);
  });
});
