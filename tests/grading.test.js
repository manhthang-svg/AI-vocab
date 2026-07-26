const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeFromVocabularyMeaning } = require('../src/grading');

test('vocabulary grade follows only the meaning score thresholds', () => {
  assert.equal(gradeFromVocabularyMeaning(10), 'easy');
  assert.equal(gradeFromVocabularyMeaning(9), 'easy');
  assert.equal(gradeFromVocabularyMeaning(8), 'good');
  assert.equal(gradeFromVocabularyMeaning(7), 'good');
  assert.equal(gradeFromVocabularyMeaning(6), 'hard');
  assert.equal(gradeFromVocabularyMeaning(4), 'hard');
  assert.equal(gradeFromVocabularyMeaning(3), 'again');
  assert.equal(gradeFromVocabularyMeaning(0), 'again');
});

test('English score cannot change the vocabulary grade', () => {
  const meaningScore = 8;
  const withPoorEnglish = gradeFromVocabularyMeaning(meaningScore, 0);
  const withPerfectEnglish = gradeFromVocabularyMeaning(meaningScore, 10);
  assert.equal(withPoorEnglish, 'good');
  assert.equal(withPerfectEnglish, 'good');
});
