import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeStatus, computeThreshold, formatScore, validateGrade, PASS_SCORE } from '../lib/grading.ts';

test('PASS_SCORE should be 60', () => {
  assert.equal(PASS_SCORE, 60);
});

test('gradeStatus returns correct status', () => {
  assert.equal(gradeStatus(null), '尚未登錄');
  assert.equal(gradeStatus(60), '及格');
  assert.equal(gradeStatus(85.5), '及格');
  assert.equal(gradeStatus(59.9), '未達及格');
  assert.equal(gradeStatus(0), '未達及格');
});

test('formatScore formats numbers properly', () => {
  assert.equal(formatScore(null), '—');
  assert.equal(formatScore(60), '60');
  assert.equal(formatScore(75.5), '75.5');
  assert.equal(formatScore(75.556), '75.56');
  assert.equal(formatScore(0), '0');
});

test('computeThreshold calculates average of rating=3 scores', () => {
  const grades = [
    { score: 80, rating: 3 },
    { score: 70, rating: 3 },
    { score: 90, rating: 4 },
    { score: 50, rating: 2 },
    { score: null, rating: 3 },
  ];
  const result = computeThreshold(grades);
  assert.equal(result.count, 2);
  assert.equal(result.value, 75);

  const empty = computeThreshold([
    { score: 90, rating: 4 },
    { score: 50, rating: 2 },
  ]);
  assert.equal(empty.count, 0);
  assert.equal(empty.value, null);
});

test('validateGrade validates pairs and boundary values', () => {
  // Both null
  assert.deepEqual(validateGrade(null, null), { score: null, rating: null });

  // Valid numbers
  assert.deepEqual(validateGrade(85, 4), { score: 85, rating: 4 });
  assert.deepEqual(validateGrade(0, 1), { score: 0, rating: 1 });
  assert.deepEqual(validateGrade(100, 5), { score: 100, rating: 5 });

  // Unpaired / invalid values should throw
  assert.throws(() => validateGrade(80, null), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(null, 3), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(-1, 3), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(101, 3), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(80, 0), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(80, 6), /每題分數須介於 0–100/);
  assert.throws(() => validateGrade(80, 3.5), /每題分數須介於 0–100/);
});
