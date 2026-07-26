const { gradeFromVocabularyMeaning } = require('./grading');

function clampScore(value) {
  return Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
}

function extractJsonObject(text) {
  const source = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI không trả về dữ liệu JSON hợp lệ.');
  return JSON.parse(source.slice(start, end + 1));
}

function normalizeReviewResult(value, provider = 'local') {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : (value || {});
  const meaningScore = clampScore(parsed.meaning_score);
  const sentenceScore = clampScore(parsed.sentence_score);
  return {
    meaning_score: meaningScore,
    sentence_score: sentenceScore,
    meaning_feedback: String(parsed.meaning_feedback || 'Milim chưa nhận được nhận xét chi tiết về ý nghĩa.').slice(0, 1200),
    sentence_feedback: String(parsed.sentence_feedback || 'Milim chưa nhận được nhận xét chi tiết về câu tiếng Anh.').slice(0, 1200),
    corrected_sentence: String(parsed.corrected_sentence || '').slice(0, 1200),
    overall_feedback: String(parsed.overall_feedback || 'Hãy đối chiếu câu đề xuất và tiếp tục luyện tập.').slice(0, 1200),
    recommended_grade: gradeFromVocabularyMeaning(meaningScore),
    provider
  };
}

function normalizeChallenge(value, targetWord, provider = 'local') {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : (value || {});
  const vietnameseSentence = String(parsed.vietnamese_sentence || '').trim().slice(0, 1200);
  const suggestedAnswer = String(parsed.suggested_answer || '').trim().slice(0, 1200);
  if (!vietnameseSentence || !suggestedAnswer) throw new Error('AI chưa tạo được câu hỏi hợp lệ.');
  const target = String(targetWord || '').trim();
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetPattern = escapedTarget ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapedTarget}([^\\p{L}\\p{N}]|$)`, 'iu') : null;
  if (targetPattern?.test(vietnameseSentence)) {
    throw new Error('AI đã vô tình để lộ từ mục tiêu. Milim sẽ tạo câu khác.');
  }
  return {
    vietnamese_sentence: vietnameseSentence,
    suggested_answer: suggestedAnswer,
    provider,
    manual: false
  };
}

function manualChallenge(payload = {}) {
  const definition = String(payload.savedDefinition || '').trim() || 'nghĩa bạn đã lưu';
  return {
    vietnamese_sentence: `Hãy viết một câu tiếng Anh diễn đạt đúng ý sau: “${definition.slice(0, 700)}”`,
    suggested_answer: '',
    provider: 'manual',
    manual: true
  };
}

function manualReviewResult(payload = {}) {
  return {
    meaning_score: null,
    sentence_score: null,
    meaning_feedback: 'AI đang không khả dụng. Hãy đối chiếu từ mục tiêu, nghĩa đã lưu và tự đánh giá mức độ nhớ.',
    sentence_feedback: 'Bạn có thể tự kiểm tra ngữ pháp hoặc quay lại chấm bằng AI khi model sẵn sàng.',
    corrected_sentence: String(payload.suggestedAnswer || payload.sentence || '').slice(0, 1200),
    overall_feedback: 'Tự đánh giá giúp phiên ôn không bị gián đoạn.',
    recommended_grade: null,
    provider: 'manual',
    manual: true
  };
}

module.exports = {
  clampScore,
  extractJsonObject,
  normalizeChallenge,
  normalizeReviewResult,
  manualChallenge,
  manualReviewResult
};
