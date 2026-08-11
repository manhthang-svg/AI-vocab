(function exposeAbility(root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.MilimAbility = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const QUESTION_COUNT = 18;
  const RAW_ITEMS = [
    ['A1','chair','cái ghế'], ['A1','hungry','đói'], ['A1','borrow','mượn'], ['A1','quiet','yên tĩnh'], ['A1','arrive','đến nơi'], ['A1','weather','thời tiết'],
    ['A2','improve','cải thiện'], ['A2','invite','mời'], ['A2','promise','hứa'], ['A2','avoid','tránh'], ['A2','probably','có lẽ'], ['A2','environment','môi trường'],
    ['B1','consequence','hậu quả'], ['B1','encourage','khuyến khích'], ['B1','evidence','bằng chứng'], ['B1','maintain','duy trì'], ['B1','opportunity','cơ hội'], ['B1','suitable','phù hợp'],
    ['B2','acquire','tiếp thu hoặc đạt được'], ['B2','considerable','đáng kể'], ['B2','controversial','gây tranh cãi'], ['B2','distinguish','phân biệt'], ['B2','reliable','đáng tin cậy'], ['B2','withdraw','rút lui hoặc rút lại'],
    ['C1','ambiguous','mơ hồ, có nhiều cách hiểu'], ['C1','compelling','có sức thuyết phục mạnh'], ['C1','discrepancy','sự không nhất quán'], ['C1','feasible','khả thi'], ['C1','scrutinize','xem xét cực kỳ kỹ lưỡng'], ['C1','undermine','làm suy yếu ngầm'],
    ['C2','capricious','thất thường, thay đổi khó đoán'], ['C2','deleterious','có hại'], ['C2','equivocal','mập mờ, không dứt khoát'], ['C2','intransigent','không chịu thỏa hiệp'], ['C2','perfunctory','qua loa vì nghĩa vụ'], ['C2','recalcitrant','ngoan cố chống lại sự kiểm soát']
  ];
  const ITEMS = RAW_ITEMS.map(([level, term, definition], index) => ({ id: `${level}-${term}`, level, term, definition, difficulty: LEVELS.indexOf(level) + 1 + ((index % 6) - 2.5) * 0.06 }));

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function abilityToLevel(value) {
    return LEVELS[Math.max(0, Math.min(5, Math.round(clamp(value, 1, 6)) - 1))];
  }

  function expectedCorrect(ability, difficulty) {
    return 1 / (1 + Math.exp(-1.35 * (clamp(ability, 1, 6) - difficulty)));
  }

  function nextItem(usedIds = [], ability = 3) {
    const used = new Set(usedIds);
    return ITEMS.filter((item) => !used.has(item.id))
      .sort((a, b) => Math.abs(a.difficulty - ability) - Math.abs(b.difficulty - ability) || a.id.localeCompare(b.id))[0] || null;
  }

  function choicesFor(item) {
    if (!item) return [];
    const sameBand = ITEMS.filter((candidate) => candidate.id !== item.id && Math.abs(candidate.difficulty - item.difficulty) <= 1.15);
    const seed = [...item.term].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const distractors = [...sameBand].sort((a, b) => ((a.id.length * seed) % 97) - ((b.id.length * seed) % 97) || a.id.localeCompare(b.id)).slice(0, 3);
    const values = [item, ...distractors].map((candidate) => ({ value: candidate.definition, correct: candidate.id === item.id }));
    return values.sort((a, b) => ((a.value.length + seed) % 11) - ((b.value.length + seed) % 11) || a.value.localeCompare(b.value));
  }

  function updateAbility(ability, item, correct) {
    const expected = expectedCorrect(ability, item.difficulty);
    return clamp(ability + 0.82 * ((correct ? 1 : 0) - expected), 1, 6);
  }

  function assessmentResult(session) {
    const answers = Array.isArray(session?.answers) ? session.answers : [];
    const ability = clamp(session?.ability || 3, 1, 6);
    const correct = answers.filter((answer) => answer.correct).length;
    const information = answers.reduce((sum, answer) => {
      const expected = expectedCorrect(ability, Number(answer.difficulty) || 3);
      return sum + expected * (1 - expected);
    }, 0);
    const confidence = clamp(0.34 + answers.length * 0.022 + information * 0.035, 0.34, 0.9);
    return { ability, level: abilityToLevel(ability), confidence, correct, answered: answers.length };
  }

  function normalizeKnowledgeEntry(value) {
    if (typeof value === 'number') return { probability: clamp(value), evidence: 1, updatedAt: null };
    return {
      probability: clamp(value?.probability ?? value?.p ?? 0.5),
      evidence: Math.max(0, Math.floor(Number(value?.evidence) || 0)),
      updatedAt: value?.updatedAt || null,
      source: String(value?.source || '')
    };
  }

  function updateKnowledge(current, observation, source = 'feedback', now = new Date().toISOString()) {
    const previous = normalizeKnowledgeEntry(current);
    const observed = clamp(observation);
    const weight = source === 'assessment' ? 1.5 : source === 'review' ? 2 : source === 'known' ? 4 : 1;
    const priorWeight = Math.min(8, Math.max(1, previous.evidence));
    return {
      probability: clamp((previous.probability * priorWeight + observed * weight) / (priorWeight + weight)),
      evidence: Math.min(99, previous.evidence + 1),
      updatedAt: now,
      source
    };
  }

  function reviewObservation(grade) {
    return { again: 0.08, hard: 0.38, good: 0.82, easy: 0.96 }[grade] ?? 0.5;
  }

  function profileLevel(profile, fallbackLevel = 'A1') {
    return profile?.level && LEVELS.includes(profile.level) ? profile.level : fallbackLevel;
  }

  return { LEVELS, QUESTION_COUNT, ITEMS, abilityToLevel, expectedCorrect, nextItem, choicesFor, updateAbility, assessmentResult, normalizeKnowledgeEntry, updateKnowledge, reviewObservation, profileLevel };
});
