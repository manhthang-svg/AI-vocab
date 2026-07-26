function gradeFromVocabularyMeaning(meaningScore) {
  const score = Math.max(0, Math.min(10, Number(meaningScore) || 0));
  if (score >= 9) return 'easy';
  if (score >= 7) return 'good';
  if (score >= 4) return 'hard';
  return 'again';
}

module.exports = { gradeFromVocabularyMeaning };
