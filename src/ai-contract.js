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

function targetWordForms(targetWord) {
  const target = String(targetWord || '').trim().toLocaleLowerCase('en');
  if (!target) return [];
  const words = target.split(/\s+/);
  const base = words[0];
  const suffixes = words.slice(1);
  const forms = new Set([base, `${base}s`, `${base}es`, `${base}ed`, `${base}ing`]);
  if (base.endsWith('e') && base.length > 2) {
    forms.add(`${base}s`);
    forms.add(`${base}d`);
    forms.add(`${base.slice(0, -1)}ing`);
  }
  if (/[^aeiou]y$/i.test(base)) {
    forms.add(`${base.slice(0, -1)}ies`);
    forms.add(`${base.slice(0, -1)}ied`);
  }
  if (/(s|x|z|ch|sh|o)$/i.test(base)) forms.add(`${base}es`);
  if (/[^aeiou][aeiou][^aeiouwxy]$/i.test(base)) {
    forms.add(`${base}${base.slice(-1)}ed`);
    forms.add(`${base}${base.slice(-1)}ing`);
  }

  const irregularForms = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
    begin: ['begins', 'began', 'begun', 'beginning'],
    come: ['comes', 'came', 'coming'],
    do: ['does', 'did', 'done', 'doing'],
    get: ['gets', 'got', 'gotten', 'getting'],
    go: ['goes', 'went', 'gone', 'going'],
    have: ['has', 'had', 'having'],
    make: ['makes', 'made', 'making'],
    run: ['runs', 'ran', 'running'],
    say: ['says', 'said', 'saying'],
    see: ['sees', 'saw', 'seen', 'seeing'],
    speak: ['speaks', 'spoke', 'spoken', 'speaking'],
    take: ['takes', 'took', 'taken', 'taking'],
    write: ['writes', 'wrote', 'written', 'writing'],
  };
  (irregularForms[base] || []).forEach((form) => forms.add(form));
  const phrases = [...forms].map((form) => suffixes.length ? [form, ...suffixes].join(' ') : form);
  return [...new Set([target, ...phrases])].sort((a, b) => b.length - a.length);
}

function challengeLeaksTarget(sentence, targetWord) {
  const source = String(sentence || '');
  return targetWordForms(targetWord).some((form) => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(source);
  });
}

function feedbackContainsUnexpectedScript(value) {
  const feedback = [
    value?.meaning_feedback,
    value?.sentence_feedback,
    value?.overall_feedback
  ].join(' ');
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u.test(feedback);
}

function containsUnexpectedScript(value) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u.test(String(value || ''));
}

function normalizeGlossary(value, requestedTerms = [], provider = 'local') {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : (value || {});
  const allowed = new Set(requestedTerms.map((term) => String(term || '').trim().toLocaleLowerCase('en')).filter(Boolean));
  const validParts = new Set(['noun', 'verb', 'adjective', 'adverb', 'phrase', 'phrasal-verb', 'idiom', 'other']);
  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => {
    const term = String(item?.term || '').trim().toLocaleLowerCase('en').slice(0, 120);
    const definition = String(item?.definition || '').trim().slice(0, 800);
    const example = String(item?.example || '').trim().slice(0, 800);
    const part = String(item?.part_of_speech || item?.partOfSpeech || 'other').trim().toLocaleLowerCase('en');
    if (!term || !allowed.has(term) || !definition || containsUnexpectedScript(definition)) return null;
    return { term, definition, example, partOfSpeech: validParts.has(part) ? part : 'other' };
  }).filter(Boolean);
  if (!items.length) throw new Error('AI chưa tạo được nghĩa hợp lệ cho các từ đã chọn.');
  return { items, provider, manual: false };
}

function normalizeReviewResult(value, provider = 'local') {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : (value || {});
  if (feedbackContainsUnexpectedScript(parsed)) {
    throw new Error('AI đã trộn ngôn ngữ khác vào nhận xét. Milim sẽ chấm lại.');
  }
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
  if (challengeLeaksTarget(vietnameseSentence, targetWord)) {
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
  challengeLeaksTarget,
  extractJsonObject,
  feedbackContainsUnexpectedScript,
  normalizeGlossary,
  normalizeChallenge,
  normalizeReviewResult,
  manualChallenge,
  manualReviewResult,
  targetWordForms
};
