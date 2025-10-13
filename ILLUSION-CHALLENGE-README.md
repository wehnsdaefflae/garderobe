# Optical Illusion Challenge Module

A standalone bot prevention system that exploits human visual perception biases to distinguish humans from machines.

## Overview

This module implements three types of optical illusions that humans perceive differently than computer vision systems:

1. **Müller-Lyer Illusion** - Lines with outward arrows appear longer than those with inward arrows (but are equal)
2. **Ebbinghaus Illusion** - Circles surrounded by small circles appear larger than those surrounded by large circles (but are equal)
3. **Simultaneous Contrast** - Grey squares on black backgrounds appear lighter than on white backgrounds (but are the same color)

## Files

```
src/illusion-challenge.js           # Core module with challenge generation and verification
tests/unit/illusion-challenge.test.js  # Comprehensive unit tests (38 tests)
test-illusions.html                 # Interactive visual testing page
```

## Testing the Illusions

### 1. Visual Testing (Browser)

Open `test-illusions.html` directly in a browser:

```bash
open test-illusions.html
# or
firefox test-illusions.html
```

This provides an interactive interface to:
- See all three illusion types
- Test your own perception
- Understand expected human vs machine answers
- Generate new random illusions

### 2. Unit Testing

Run the comprehensive test suite:

```bash
# Run illusion-challenge tests only
npm test -- tests/unit/illusion-challenge.test.js

# Run with coverage
npm run test:coverage -- tests/unit/illusion-challenge.test.js
```

Test coverage includes:
- ✓ SVG generation for all illusion types (15 tests)
- ✓ Challenge generation and randomness (7 tests)
- ✓ Redis storage and TTL (2 tests)
- ✓ Verification and one-time use (6 tests)
- ✓ Rate limiting (4 tests)
- ✓ Integration flows (4 tests)

## API Usage

```javascript
const {
  generateIllusionChallenge,
  storeIllusionChallenge,
  verifyIllusionChallenge,
  checkIllusionChallengeRateLimit
} = require('./src/illusion-challenge');

// 1. Generate a random illusion challenge
const challenge = generateIllusionChallenge();
console.log(challenge);
// {
//   type: 'muller-lyer',
//   question: 'Which line segment appears longest to you?',
//   svg: '<svg>...</svg>',
//   options: ['A', 'B', 'C', 'D'],
//   answer: 'A',
//   challengeId: 'abc123...',
//   timestamp: 1234567890
// }

// 2. Store challenge in Redis (5 minute TTL)
await storeIllusionChallenge(redis, challenge);

// 3. Verify user's answer
const result = await verifyIllusionChallenge(
  redis,
  challenge.challengeId,
  userAnswer  // 'A', 'B', 'C', or 'D'
);

if (result.valid) {
  console.log('Human verified!');
} else {
  console.log('Incorrect or expired:', result.error);
}

// 4. Check rate limits (20 challenges per hour per IP)
const allowed = await checkIllusionChallengeRateLimit(redis, ipAddress);
if (!allowed) {
  console.log('Rate limit exceeded');
}
```

## Integration with Garderobe

To integrate this into the main Garderobe platform:

### 1. Update Event Creation Form

Replace the math challenge in `src/views/new-event.ejs` with illusion challenge:

```html
<div class="illusion-challenge">
  <p><%- challenge.question %></p>
  <div class="illusion-container">
    <%- challenge.svg %>
  </div>
  <div class="options">
    <% challenge.options.forEach(option => { %>
      <button type="button" class="option-btn" data-answer="<%= option %>">
        <%= option %>
      </button>
    <% }); %>
  </div>
  <input type="hidden" name="challenge_id" value="<%= challenge.challengeId %>">
  <input type="hidden" name="challenge_answer" id="challenge_answer">
</div>
```

### 2. Update Routes

Modify `src/routes.js` to use illusion challenges:

```javascript
const {
  generateIllusionChallenge,
  storeIllusionChallenge,
  verifyIllusionChallenge
} = require('./illusion-challenge');

// GET /new - Event creation form
app.get('/new', async (req, res) => {
  const challenge = generateIllusionChallenge();
  await storeIllusionChallenge(getRedisClient(), challenge);

  res.render('new-event', { challenge });
});

// POST /api/events - Verify challenge before creating event
app.post('/api/events', async (req, res) => {
  const { challenge_id, challenge_answer } = req.body;

  const result = await verifyIllusionChallenge(
    getRedisClient(),
    challenge_id,
    challenge_answer
  );

  if (!result.valid) {
    return res.status(400).json({ error: 'Challenge verification failed' });
  }

  // Continue with event creation...
});
```

### 3. Add Client-Side JavaScript

Add click handlers for illusion challenge options:

```javascript
document.querySelectorAll('.option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Highlight selected option
    document.querySelectorAll('.option-btn').forEach(b =>
      b.classList.remove('selected')
    );
    btn.classList.add('selected');

    // Store answer in hidden field
    document.getElementById('challenge_answer').value =
      btn.dataset.answer;
  });
});
```

## Security Properties

### Entropy
- **4 options = 25% random guess rate** (better with 2 sequential challenges = 6.25%)
- Comparable to current math challenge security

### Human vs Machine
- **Humans**: Consistently choose perceptually-biased option (80-90% accuracy for intended answer)
- **Traditional CV**: Measures all options as equal, random 25% guess
- **AI Models**: May learn human biases, but still struggle with novel illusions

### Advantages Over Math Challenges
- No OCR needed (harder to automate)
- Exploits fundamental perception differences
- Engaging/interesting for users
- Self-hostable (no external services)

### Rate Limiting
- 20 challenge requests per hour per IP
- 5-minute challenge expiration
- One-time use (deleted after verification)

## Expected Human Answers

| Illusion Type | Question | Expected Answer | Why |
|--------------|----------|----------------|-----|
| Müller-Lyer | "Which line appears longest?" | Option A (outward arrows) | Depth perception cues |
| Ebbinghaus | "Which center appears largest?" | Option B (small surrounds) | Size contrast effect |
| Simultaneous Contrast | "Which square appears lightest?" | Option A (black background) | Brightness adaptation |

## Accessibility Considerations

For screen reader support, add text descriptions:

```html
<div role="img" aria-label="Four line segments with different arrow configurations">
  <%- challenge.svg %>
</div>
```

Consider providing a fallback math challenge option for users who may have visual processing differences.

## Future Enhancements

Potential improvements:
1. **Sequential challenges** - Require 2 correct answers (6.25% random guess)
2. **More illusion types** - Ponzo, Kanizsa triangle, motion aftereffects
3. **Adaptive difficulty** - Track which illusions work best
4. **Timing analysis** - Humans respond faster to perceptual illusions than machines computing pixel values
5. **Progressive enhancement** - Fall back to math challenge if SVG not supported

## License

Same as Garderobe Digital platform (see main LICENSE file).
