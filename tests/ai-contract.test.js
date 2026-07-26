const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {
  extractJsonObject,
  normalizeChallenge,
  normalizeReviewResult,
  manualChallenge,
  manualReviewResult
} = require('../src/ai-contract');
const { LocalAIManager, MODEL, ENGINE } = require('../local-ai');

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

test('downloader changes source after repeated connection failures', async () => {
  const broken = http.createServer((_request, response) => response.destroy());
  const fallback = http.createServer((request, response) => {
    const payload = Buffer.from('GGUF');
    const range = request.headers.range;
    if (range) {
      const start = Number(range.match(/bytes=(\d+)-/)?.[1] || 0);
      response.writeHead(206, {
        'Content-Length': payload.length - start,
        'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`
      });
      response.end(payload.subarray(start));
      return;
    }
    response.writeHead(200, { 'Content-Length': payload.length });
    response.end(payload);
  });
  await Promise.all([
    new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve)),
    new Promise((resolve) => fallback.listen(0, '127.0.0.1', resolve))
  ]);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'milim-download-test-'));
  try {
    const manager = new LocalAIManager({ root: temporary, retryDelayMs: 1 });
    const destination = path.join(temporary, 'model.gguf');
    await manager.downloadFile({
      filename: 'model.gguf',
      size: 4,
      urls: [
        `http://127.0.0.1:${broken.address().port}/model.gguf`,
        `http://127.0.0.1:${fallback.address().port}/model.gguf`
      ]
    }, destination, new AbortController().signal, () => {});
    assert.equal(await fs.readFile(destination, 'utf8'), 'GGUF');
  } finally {
    broken.close();
    fallback.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
