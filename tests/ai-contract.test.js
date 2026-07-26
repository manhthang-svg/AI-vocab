const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractJsonObject,
  normalizeChallenge,
  normalizeReviewResult,
  manualChallenge,
  manualReviewResult
} = require('../src/ai-contract');
const { MODEL, ENGINE } = require('../local-ai');

test('local model output is parsed even with a fenced JSON response', () => {
  const value = extractJsonObject('```json\n{"meaning_score":8}\n```');
  assert.equal(value.meaning_score, 8);
});

test('local grading obeys the meaning-only grade thresholds', () => {
  const poorEnglish = normalizeReviewResult({
    meaning_score: 9,
    sentence_score: 1,
    meaning_feedback: 'Đúng ý.',
    sentence_feedback: 'Cần sửa câu.',
    corrected_sentence: 'The news thrilled me.',
    overall_feedback: 'Bạn nhớ đúng từ.'
  });
  assert.equal(poorEnglish.recommended_grade, 'easy');
  assert.equal(poorEnglish.provider, 'local');
});

test('a generated Vietnamese prompt cannot reveal the target word', () => {
  assert.throws(() => normalizeChallenge({
    vietnamese_sentence: 'Từ thrill đang được học.',
    suggested_answer: 'The news thrilled me.'
  }, 'thrill'), /để lộ từ mục tiêu/);
  assert.doesNotThrow(() => normalizeChallenge({
    vietnamese_sentence: 'Cô ấy đang mang một chiếc túi rất đẹp.',
    suggested_answer: 'She is carrying a beautiful bag.'
  }, 'a'));
});

test('manual fallback keeps review available without an AI provider', () => {
  const challenge = manualChallenge({ savedDefinition: 'làm ai đó phấn khích' });
  const result = manualReviewResult({ sentence: 'The news thrilled me.' });
  assert.equal(challenge.provider, 'manual');
  assert.equal(result.manual, true);
  assert.equal(result.recommended_grade, null);
});

test('official local AI artifacts have pinned sizes and SHA-256 digests', () => {
  assert.equal(MODEL.size, 2497280256);
  assert.equal(ENGINE.size, 33479694);
  assert.match(MODEL.sha256, /^[a-f0-9]{64}$/);
  assert.match(ENGINE.sha256, /^[a-f0-9]{64}$/);
});
