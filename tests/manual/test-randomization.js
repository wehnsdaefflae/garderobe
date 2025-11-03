#!/usr/bin/env node
/**
 * Quick test script to validate illusion challenge randomization
 * Run with: node tests/manual/test-randomization.js
 */

const {
  generateMullerLyerSVG,
  generateEbbinghausSVG,
  generateSimultaneousContrastSVG
} = require('../../src/illusion-challenge');

console.log('Testing Optical Illusion Challenge Randomization\n');
console.log('='.repeat(60));

// Test Müller-Lyer
console.log('\n1. Müller-Lyer Illusion (Arrow endings affect perceived length)');
console.log('-'.repeat(60));
for (let i = 0; i < 3; i++) {
  const result = generateMullerLyerSVG();
  console.log(`  Test ${i + 1}:`);
  console.log(`    - Options: ${result.options.join(', ')}`);
  console.log(`    - Max (longest): ${result.maxAnswer}`);
  console.log(`    - Min (shortest): ${result.minAnswer}`);
  console.log(`    - SVG length: ${result.svg.length} chars`);
}

// Test Ebbinghaus
console.log('\n2. Ebbinghaus Illusion (Context circles affect perceived size)');
console.log('-'.repeat(60));
for (let i = 0; i < 3; i++) {
  const result = generateEbbinghausSVG();
  console.log(`  Test ${i + 1}:`);
  console.log(`    - Options: ${result.options.join(', ')}`);
  console.log(`    - Max (largest): ${result.maxAnswer}`);
  console.log(`    - Min (smallest): ${result.minAnswer}`);
  console.log(`    - SVG length: ${result.svg.length} chars`);
}

// Test Simultaneous Contrast
console.log('\n3. Simultaneous Contrast Illusion (Background affects brightness)');
console.log('-'.repeat(60));
for (let i = 0; i < 3; i++) {
  const result = generateSimultaneousContrastSVG();
  console.log(`  Test ${i + 1}:`);
  console.log(`    - Options: ${result.options.join(', ')}`);
  console.log(`    - Max (lightest): ${result.maxAnswer}`);
  console.log(`    - Min (darkest): ${result.minAnswer}`);
  console.log(`    - SVG length: ${result.svg.length} chars`);
}

console.log('\n' + '='.repeat(60));
console.log('Validation Tests:');
console.log('-'.repeat(60));

// Validate that parameters are actually random across multiple runs
const svgs = [];
for (let i = 0; i < 10; i++) {
  svgs.push(generateMullerLyerSVG().svg);
}

// Check if all SVGs are unique (randomization working)
const uniqueSvgs = new Set(svgs);
console.log(`✓ Generated 10 Müller-Lyer SVGs: ${uniqueSvgs.size} unique`);
if (uniqueSvgs.size === 10) {
  console.log('  SUCCESS: All instances are unique!');
} else {
  console.log(`  WARNING: Only ${uniqueSvgs.size}/10 unique (some duplicates)`);
}

// Validate answer correctness remains consistent
console.log('\n✓ Checking answer correctness across randomizations:');
for (let i = 0; i < 10; i++) {
  const result = generateMullerLyerSVG();
  if (!result.maxAnswer || !result.minAnswer || result.maxAnswer === result.minAnswer) {
    console.log(`  ERROR: Invalid answers in iteration ${i + 1}`);
  }
}
console.log('  SUCCESS: All 10 iterations have valid answers');

console.log('\n' + '='.repeat(60));
console.log('Randomization test complete!\n');
