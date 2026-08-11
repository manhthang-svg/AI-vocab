const POS_OPTIONS = [
  ['noun', 'Noun'],
  ['verb', 'Verb'],
  ['adjective', 'Adjective'],
  ['adverb', 'Adverb'],
  ['phrase', 'Phrase'],
  ['phrasal-verb', 'Phrasal verb'],
  ['idiom', 'Idiom'],
  ['other', 'Other']
];

const WRITING_DEFAULT_TYPES = {
  task1: [
    ['task1-line', 'Line graph'], ['task1-bar', 'Bar chart'], ['task1-pie', 'Pie chart'],
    ['task1-table', 'Table'], ['task1-process', 'Process'], ['task1-map', 'Map'], ['task1-mixed', 'Mixed charts']
  ],
  task2: [
    ['task2-opinion', 'Opinion'], ['task2-discussion', 'Discussion'],
    ['task2-advantages', 'Advantages / Disadvantages'], ['task2-problem', 'Problem / Solution'],
    ['task2-two-part', 'Two-part question']
  ]
};

const api = window.milim || {
  async loadData() {
    const saved = localStorage.getItem('milim-browser-data');
    return saved ? JSON.parse(saved) : { version: 3, words: [], speakingErrors: [], settings: {} };
  },
  async saveData(data) { localStorage.setItem('milim-browser-data', JSON.stringify(data)); return { ok: true }; },
  async exportData() { return { canceled: true }; },
  async importData() { return { canceled: true }; },
  async pickWritingImage() { return ''; },
  async readWritingClipboardImage() { return ''; },
  async normalizeWritingImage(dataUrl) { return dataUrl; },
  async captureWritingScreen() { return ''; },
  async notify() { return false; },
  async geminiStatus() { return { configured: false, model: 'gemini-2.5-flash' }; },
  async saveGeminiKey() { return { ok: true, model: 'gemini-2.5-flash' }; },
  async checkGeminiAnswer(payload) {
    return { meaning_score: 8, sentence_score: 8, meaning_feedback: 'Đúng nghĩa chính.', sentence_feedback: 'Câu dùng từ phù hợp.', corrected_sentence: payload.sentence, overall_feedback: 'Làm tốt.', recommended_grade: 'good' };
  },
  async generateRecallChallenge() {
    return { vietnamese_sentence: 'Tin tức bất ngờ ấy khiến mọi người vô cùng phấn khích.', suggested_answer: 'The unexpected news thrilled everyone.' };
  },
  async aiStatus() {
    return {
      preference: 'auto',
      activeProvider: 'manual',
      resourceMode: 'balanced',
      idleMinutes: 5,
      local: { state: 'not-installed', percent: 0, model: { name: 'Qwen3 4B · Q4_K_M', size: 2497280256 } },
      gemini: { configured: false, model: 'gemini-2.5-flash' }
    };
  },
  async downloadLocalAI() { return this.aiStatus(); },
  async pauseLocalAIDownload() { return this.aiStatus(); },
  async deleteLocalAI() { return this.aiStatus(); },
  async stopLocalAI() { return this.aiStatus(); },
  async testLocalAI() { return { ok: true, elapsedMs: 1, sample: 'Hãy thử viết một câu tiếng Anh.' }; },
  async checkAIAnswer(payload) {
    return { meaning_score: null, sentence_score: null, meaning_feedback: 'Hãy tự đánh giá mức độ nhớ.', sentence_feedback: '', corrected_sentence: payload.sentence, overall_feedback: 'Chế độ tự đánh giá.', recommended_grade: null, provider: 'manual', manual: true };
  },
  async generateAIChallenge(payload) {
    return { vietnamese_sentence: `Hãy viết một câu tiếng Anh diễn đạt đúng ý: “${payload.savedDefinition}”`, suggested_answer: '', provider: 'manual', manual: true };
  },
  async enrichScriptTerms() { return { items: [], provider: 'manual', manual: true }; },
  onAIStatus() { return () => {}; },
  async updateStatus() { return { state: 'unavailable', currentVersion: '1.4.0', percent: 0, message: 'Cập nhật tự động chỉ hoạt động trên bản đã cài đặt.' }; },
  async checkForUpdates() { return this.updateStatus(); },
  async installUpdate() { return false; },
  onUpdateStatus() { return () => {}; },
  minimize() {}, maximize() {}, close() {}
};

const state = {
  data: null,
  view: 'home',
  selectedDate: null,
  selectedPos: [],
  editingId: null,
  editingSpeakingId: null,
  writingTask: 'task1',
  editingWritingId: null,
  editingWritingTypeId: null,
  writingEditorOpen: false,
  writingManageTypesOpen: false,
  writingErrors: [],
  writingImage: '',
  review: null,
  geminiConfigured: false,
  geminiModel: 'gemini-2.5-flash',
  aiStatus: null,
  updateStatus: null,
  scriptResults: [],
  scriptAnalysisStats: null,
  scriptSelectedTerms: new Set(),
  scriptAiLoading: false,
  abilityAssessment: null,
  selectedStreakDate: null,
  confirmAction: null,
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DAY = 24 * 60 * 60 * 1000;
const FSRS_RETENTION_DEFAULT = 0.9;
const FSRS_ALGORITHM = 'FSRS-6';
const GRADE_TO_RATING = { again: 1, hard: 2, good: 3, easy: 4 };
const prefetchingChallenges = new Set();

function normalizedRetention(value) {
  const retention = Number(value);
  return Number.isFinite(retention) ? Math.max(0.8, Math.min(0.95, retention)) : FSRS_RETENTION_DEFAULT;
}

function fsrsScheduler(retention = FSRS_RETENTION_DEFAULT) {
  if (!globalThis.FSRS?.fsrs) return null;
  return globalThis.FSRS.fsrs({
    request_retention: normalizedRetention(retention),
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m']
  });
}

function serializeFsrsCard(card) {
  if (!card) return null;
  return {
    due: new Date(card.due).toISOString(),
    stability: Number(card.stability) || 0,
    difficulty: Number(card.difficulty) || 0,
    elapsed_days: Number(card.elapsed_days) || 0,
    scheduled_days: Number(card.scheduled_days) || 0,
    learning_steps: Number(card.learning_steps) || 0,
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    state: Number(card.state) || 0,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null
  };
}

function newFsrsCard(now = new Date()) {
  const date = usableDate(now);
  if (globalThis.FSRS?.createEmptyCard) return serializeFsrsCard(globalThis.FSRS.createEmptyCard(date));
  return {
    due: date.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null
  };
}

function usableDate(value, fallback = new Date()) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
}

function validFsrsCard(card) {
  if (!card || Number.isNaN(new Date(card.due).getTime())) return false;
  if (card.last_review && Number.isNaN(new Date(card.last_review).getTime())) return false;
  return ['stability', 'difficulty', 'scheduled_days', 'reps', 'lapses', 'state']
    .every((field) => Number.isFinite(Number(card[field])));
}

function rebuildFsrsCard(srs, createdAt, retention) {
  const scheduler = fsrsScheduler(retention);
  if (!scheduler) return newFsrsCard(createdAt);
  const created = usableDate(createdAt);
  let card = globalThis.FSRS.createEmptyCard(created);
  const reviews = (Array.isArray(srs?.history) ? srs.history : [])
    .filter((item) => GRADE_TO_RATING[item.grade] && !Number.isNaN(new Date(item.at).getTime()))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  try {
    reviews.forEach((item) => {
      card = scheduler.next(card, new Date(item.at), GRADE_TO_RATING[item.grade]).card;
    });
    if (reviews.length) return serializeFsrsCard(card);
  } catch (error) {
    console.warn('Could not replay legacy review history through FSRS:', error);
  }
  if (srs?.lastReviewedAt) {
    const interval = Math.max(0, Number(srs.interval) || 0);
    return {
      due: usableDate(srs.dueAt, new Date(Date.now() + interval * DAY)).toISOString(),
      stability: Math.max(0.1, interval || 1),
      difficulty: Math.max(1, Math.min(10, 5 + (2.5 - (Number(srs.ease) || 2.5)) * 2)),
      elapsed_days: Math.max(0, Math.round((Date.now() - usableDate(srs.lastReviewedAt).getTime()) / DAY)),
      scheduled_days: interval,
      learning_steps: 0,
      reps: Math.max(1, Number(srs.repetitions) || 1),
      lapses: Math.max(0, Number(srs.lapses) || 0),
      state: 2,
      last_review: usableDate(srs.lastReviewedAt).toISOString()
    };
  }
  return newFsrsCard(created);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateLabel(key, long = false) {
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - DAY));
  if (key === today) return 'Hôm nay';
  if (key === yesterday) return 'Hôm qua';
  return new Intl.DateTimeFormat('vi-VN', long
    ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fromDateKey(key));
}

function wordDate(word) {
  return word.createdDate || localDate(word.createdAt);
}

function freshSrs(createdAt = new Date()) {
  const fsrs = newFsrsCard(createdAt);
  return { algorithm: FSRS_ALGORITHM, fsrs, repetitions: 0, interval: 0, ease: 2.5, lapses: 0, dueAt: fsrs.due, lastReviewedAt: null, history: [] };
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
  return [...new Set([target, ...phrases])];
}

function challengeLeaksTarget(sentence, targetWord) {
  return targetWordForms(targetWord).some((form) => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(String(sentence || ''));
  });
}

function normalizeWord(word, retention = FSRS_RETENTION_DEFAULT) {
  const legacyPos = Array.isArray(word.partsOfSpeech) ? word.partsOfSpeech : (word.partOfSpeech ? [word.partOfSpeech] : []);
  const definitions = Array.isArray(word.definitions) && word.definitions.length
    ? word.definitions.map((item) => ({ partOfSpeech: String(item.partOfSpeech || ''), definition: String(item.definition || '') }))
    : [{ partOfSpeech: legacyPos[0] || '', definition: String(word.definition || '') }];
  const partsOfSpeech = [...new Set([...legacyPos, ...definitions.map((item) => item.partOfSpeech)].filter(Boolean))];
  const createdAt = word.createdAt || new Date().toISOString();
  const previousSrs = word.srs || {};
  const srs = {
    ...freshSrs(createdAt),
    ...previousSrs,
    history: Array.isArray(previousSrs.history) ? previousSrs.history : []
  };
  if (!validFsrsCard(srs.fsrs)) srs.fsrs = rebuildFsrsCard(srs, createdAt, retention);
  srs.algorithm = FSRS_ALGORITHM;
  srs.dueAt = srs.fsrs.due || srs.dueAt;
  srs.interval = Number(srs.fsrs.scheduled_days) || 0;
  srs.lapses = Number(srs.fsrs.lapses) || Number(srs.lapses) || 0;
  srs.repetitions = Number(srs.fsrs.reps) || Number(srs.repetitions) || 0;
  srs.lastReviewedAt = srs.fsrs.last_review || srs.lastReviewedAt || null;
  return {
    ...word,
    id: word.id || uid(),
    term: String(word.term || ''),
    note: String(word.note || '').slice(0, 1500),
    definition: definitions.map((item) => item.definition).filter(Boolean).join('\n'),
    definitions,
    partsOfSpeech,
    partOfSpeech: partsOfSpeech[0] || '',
    createdAt,
    createdDate: word.createdDate || localDate(createdAt),
    recallCache: Array.isArray(word.recallCache) ? word.recallCache
      .filter((item) => item && item.vietnamese_sentence && !challengeLeaksTarget(item.vietnamese_sentence, word.term))
      .slice(-5)
      .map((item) => ({
        vietnamese_sentence: String(item.vietnamese_sentence).slice(0, 1200),
        suggested_answer: String(item.suggested_answer || '').slice(0, 1200),
        provider: String(item.provider || 'unknown'),
        createdAt: item.createdAt || new Date().toISOString(),
        uses: Math.max(0, Number(item.uses) || 0)
      })) : [],
    srs
  };
}

function defaultWritingTypes() {
  return Object.fromEntries(Object.entries(WRITING_DEFAULT_TYPES).map(([task, items]) => [
    task,
    items.map(([id, name]) => ({ id, name, createdAt: new Date().toISOString() }))
  ]));
}

function normalizeWriting(value) {
  const source = value && typeof value === 'object' ? value : null;
  const defaults = defaultWritingTypes();
  const types = {};
  ['task1', 'task2'].forEach((task) => {
    types[task] = source?.types && Array.isArray(source.types[task])
      ? source.types[task].map((item) => ({
        id: String(item?.id || uid()),
        name: String(item?.name || '').trim().slice(0, 100),
        createdAt: item?.createdAt || new Date().toISOString()
      })).filter((item) => item.name)
      : defaults[task];
  });
  const entries = Array.isArray(source?.entries) ? source.entries.map((entry) => ({
    id: String(entry?.id || uid()),
    task: entry?.task === 'task2' ? 'task2' : 'task1',
    typeId: String(entry?.typeId || ''),
    typeName: String(entry?.typeName || '').slice(0, 100),
    promptImage: /^data:image\//i.test(String(entry?.promptImage || '')) ? String(entry.promptImage).slice(0, 12000000) : '',
    content: String(entry?.content || '').slice(0, 30000),
    score: entry?.score === '' || entry?.score === null || entry?.score === undefined ? '' : String(entry.score).slice(0, 20),
    errors: Array.isArray(entry?.errors) ? entry.errors.map((item) => ({
      id: String(item?.id || uid()),
      mistake: String(item?.mistake || '').slice(0, 3000),
      correction: String(item?.correction || '').slice(0, 3000)
    })).filter((item) => item.mistake || item.correction) : [],
    createdAt: entry?.createdAt || new Date().toISOString(),
    createdDate: /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.createdDate || '')) ? entry.createdDate : localDate(entry?.createdAt || new Date()),
    updatedAt: entry?.updatedAt || null
  })) : [];
  return { types, entries };
}

function normalizeData(data) {
  const settings = {
    notifications: true,
    notificationTime: '19:30',
    fsrsRetention: FSRS_RETENTION_DEFAULT,
    theme: 'light',
    lastNotificationDate: null,
    aiProvider: 'auto',
    aiResourceMode: 'balanced',
    aiIdleMinutes: 5,
    aiUsage: { local: 0, gemini: 0, manual: 0 },
    scriptKnownTerms: [],
    scriptIgnoredTerms: [],
    scriptLevel: 'auto',
    scriptFilterMode: 'strict',
    scriptKnowledge: {},
    vocabularyProfile: null,
    dailyGoal: 5,
    ...(data?.settings || {})
  };
  settings.fsrsRetention = normalizedRetention(settings.fsrsRetention);
  settings.aiProvider = ['auto', 'local', 'gemini'].includes(settings.aiProvider) ? settings.aiProvider : 'auto';
  settings.aiResourceMode = ['saver', 'balanced', 'fast'].includes(settings.aiResourceMode) ? settings.aiResourceMode : 'balanced';
  settings.aiIdleMinutes = Math.max(1, Math.min(30, Number(settings.aiIdleMinutes) || 5));
  settings.aiUsage = { local: 0, gemini: 0, manual: 0, ...(settings.aiUsage || {}) };
  settings.scriptKnownTerms = Array.isArray(settings.scriptKnownTerms) ? [...new Set(settings.scriptKnownTerms.map(normalizedTerm).filter(Boolean))].slice(-2000) : [];
  settings.scriptIgnoredTerms = Array.isArray(settings.scriptIgnoredTerms) ? [...new Set(settings.scriptIgnoredTerms.map(normalizedTerm).filter(Boolean))].slice(-2000) : [];
  settings.scriptLevel = ['auto', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(settings.scriptLevel) ? settings.scriptLevel : 'auto';
  settings.scriptFilterMode = ['strict', 'balanced', 'explore'].includes(settings.scriptFilterMode) ? settings.scriptFilterMode : 'strict';
  settings.dailyGoal = [3, 5, 10].includes(Number(settings.dailyGoal)) ? Number(settings.dailyGoal) : 5;
  const abilityApi = globalThis.MilimAbility;
  settings.scriptKnowledge = Object.fromEntries(Object.entries(settings.scriptKnowledge && typeof settings.scriptKnowledge === 'object' ? settings.scriptKnowledge : {})
    .slice(-5000)
    .map(([term, value]) => [normalizedTerm(term), abilityApi?.normalizeKnowledgeEntry(value) || value])
    .filter(([term]) => term));
  settings.scriptKnownTerms.forEach((term) => {
    if (!settings.scriptKnowledge[term]) settings.scriptKnowledge[term] = abilityApi?.updateKnowledge(null, 0.99, 'known') || { probability: 0.99, evidence: 1 };
  });
  const profile = settings.vocabularyProfile;
  settings.vocabularyProfile = profile && typeof profile === 'object' && abilityApi?.LEVELS.includes(profile.level)
    ? { ability: Math.max(1, Math.min(6, Number(profile.ability) || abilityApi.LEVELS.indexOf(profile.level) + 1)), level: profile.level, confidence: Math.max(0, Math.min(1, Number(profile.confidence) || 0)), testedAt: profile.testedAt || null, answered: Math.max(0, Number(profile.answered) || 0) }
    : null;
  return {
    version: 5,
    words: Array.isArray(data?.words) ? data.words.map((word) => normalizeWord(word, settings.fsrsRetention)) : [],
    speakingErrors: Array.isArray(data?.speakingErrors) ? data.speakingErrors.map((item) => ({
      id: item.id || uid(),
      error: String(item.error || ''),
      correction: String(item.correction || ''),
      createdAt: item.createdAt || new Date().toISOString(),
      createdDate: item.createdDate || localDate(item.createdAt || new Date())
    })) : [],
    writing: normalizeWriting(data?.writing),
    reviewSession: data?.reviewSession && typeof data.reviewSession === 'object' ? data.reviewSession : null,
    settings
  };
}

function posName(value) {
  return POS_OPTIONS.find(([key]) => key === value)?.[1] || '';
}

function wordParts(word) {
  return Array.isArray(word.partsOfSpeech) && word.partsOfSpeech.length
    ? word.partsOfSpeech
    : (word.partOfSpeech ? [word.partOfSpeech] : []);
}

function wordDefinitions(word) {
  return Array.isArray(word.definitions) && word.definitions.length
    ? word.definitions
    : [{ partOfSpeech: word.partOfSpeech || '', definition: word.definition || '' }];
}

function definitionText(word, withLabels = false) {
  return wordDefinitions(word).map((item) => {
    const label = posName(item.partOfSpeech);
    return withLabels && label ? `${label}: ${item.definition}` : item.definition;
  }).filter(Boolean).join('\n');
}

function reviewNoteMarkup(word) {
  const note = String(word?.note || '').trim();
  return note ? `<aside class="review-note"><div>✦</div><section><span>NOTE CỦA BẠN</span><p>${escapeHtml(note)}</p></section></aside>` : '';
}

function mastery(word) {
  if ((word.srs?.fsrs?.stability || word.srs?.interval || 0) >= 21) return 'mastered';
  if (word.srs?.lastReviewedAt) return 'learning';
  return 'new';
}

function isDue(word) {
  return !word.srs?.dueAt || new Date(word.srs.dueAt).getTime() <= Date.now();
}

function dueWords() {
  return state.data.words.filter(isDue).sort((a, b) => new Date(a.srs.dueAt || 0) - new Date(b.srs.dueAt || 0));
}

function overdueWords() {
  const startOfToday = fromDateKey(localDate()).getTime();
  return state.data.words.filter((word) => isDue(word) && new Date(word.srs.dueAt || word.createdAt).getTime() < startOfToday)
    .sort((a, b) => new Date(a.srs.dueAt || 0) - new Date(b.srs.dueAt || 0));
}

function shuffleWords(words) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[random]] = [shuffled[random], shuffled[index]];
  }
  return shuffled;
}

function normalizedTerm(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function simpleLemma(value) {
  return globalThis.MilimScriptAnalyzer?.lemma?.(value) || normalizedTerm(value);
}

function wordKnowledgeMap() {
  const map = new Map();
  state.data.words.forEach((word) => {
    const terms = new Set([normalizedTerm(word.term), simpleLemma(word.term)]);
    terms.forEach((term) => {
      if (!term) return;
      const history = word.srs?.history || [];
      const lastGrade = history.at(-1)?.grade;
      const reviewProbability = lastGrade ? globalThis.MilimAbility?.reviewObservation(lastGrade) : 0.2;
      const current = map.get(term) || { reps: 0, lapses: 0, stability: 0, probability: reviewProbability, source: word };
      current.reps += Number(word.srs?.reviews || word.srs?.history?.length || 0);
      current.lapses += Number(word.srs?.lapses || 0);
      current.stability = Math.max(current.stability, Number(word.srs?.fsrs?.stability || word.srs?.interval || 0));
      current.probability = Math.max(Number(current.probability) || 0, reviewProbability);
      current.source = word;
      map.set(term, current);
    });
  });
  return map;
}

function effectiveVocabularyProfile() {
  const abilityApi = globalThis.MilimAbility;
  const selectedLevel = state.data.settings.scriptLevel;
  if (selectedLevel !== 'auto' && abilityApi?.LEVELS.includes(selectedLevel)) {
    return { ...(state.data.settings.vocabularyProfile || {}), ability: abilityApi.LEVELS.indexOf(selectedLevel) + 1, level: selectedLevel, confidence: 1, manual: true };
  }
  return state.data.settings.vocabularyProfile || { ability: 3, level: 'B1', confidence: 0.25, testedAt: null, answered: 0 };
}

function updateScriptKnowledge(term, observation, source) {
  const key = normalizedTerm(term);
  if (!key || !globalThis.MilimAbility) return;
  const knowledge = state.data.settings.scriptKnowledge;
  knowledge[key] = globalThis.MilimAbility.updateKnowledge(knowledge[key], observation, source);
  const entries = Object.entries(knowledge);
  if (entries.length > 5000) {
    entries.sort(([, a], [, b]) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
    entries.slice(0, entries.length - 5000).forEach(([oldKey]) => delete knowledge[oldKey]);
  }
}

function analyzeScriptText(text) {
  const analyzer = globalThis.MilimScriptAnalyzer;
  if (!analyzer) return { items: [], stats: { tokens: 0, sentences: 0, profileLevel: 'A1' } };
  const profile = effectiveVocabularyProfile();
  return analyzer.analyze(text, {
    profileLevel: profile.level,
    ability: profile.ability,
    filterMode: state.data.settings.scriptFilterMode,
    termProbabilities: state.data.settings.scriptKnowledge,
    knownTerms: state.data.settings.scriptKnownTerms,
    ignoredTerms: state.data.settings.scriptIgnoredTerms,
    knowledge: wordKnowledgeMap(),
    librarySize: state.data.words.length
  });
}

function scriptScoreLabel(score) {
  if (score >= 0.72) return 'Rất nên học';
  if (score >= 0.48) return 'Nên xem';
  return 'Có thể bỏ qua';
}

function activityMetricsByDate() {
  const metrics = {};
  const day = (key) => (metrics[key] ||= { points: 0, added: 0, reviewed: 0, speaking: 0, writing: 0 });
  state.data.words.forEach((word) => {
    const created = day(wordDate(word));
    created.added += 1;
    created.points += 1;
    word.srs.history.forEach((item) => {
      const reviewed = day(localDate(item.at));
      reviewed.reviewed += 1;
      reviewed.points += 2;
    });
  });
  state.data.speakingErrors.forEach((item) => {
    const speaking = day(item.createdDate || localDate(item.createdAt));
    speaking.speaking += 1;
    speaking.points += 2;
  });
  state.data.writing.entries.forEach((item) => {
    const writing = day(item.createdDate || localDate(item.createdAt));
    writing.writing += 1;
    writing.points += 5;
  });
  return metrics;
}

function activityCountByDate() {
  return Object.fromEntries(Object.entries(activityMetricsByDate()).map(([key, value]) => [key, value.points]));
}

function activityDates() {
  const goal = state.data.settings.dailyGoal;
  return new Set(Object.entries(activityMetricsByDate()).filter(([, value]) => value.points >= goal).map(([key]) => key));
}

function streak() {
  const dates = activityDates();
  if (!dates.size) return 0;
  let cursor = new Date();
  if (!dates.has(localDate(cursor))) cursor = new Date(Date.now() - DAY);
  let count = 0;
  while (dates.has(localDate(cursor))) {
    count += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return count;
}

function longestStreak() {
  return globalThis.MilimTree?.longestStreak?.(activityDates()) || streak();
}

function streakWeekMarkup(compact = false) {
  const learnedDates = activityDates();
  const metrics = activityMetricsByDate();
  const goal = state.data.settings.dailyGoal;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });
  return days.map((date, index) => {
    const key = localDate(date);
    const learned = learnedDates.has(key);
    const points = metrics[key]?.points || 0;
    const partial = points > 0 && !learned;
    const isToday = index === days.length - 1;
    const fullDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(date);
    return `<div class="streak-day ${learned ? 'learned' : ''} ${partial ? 'partial' : ''} ${isToday ? 'today' : ''}" title="${escapeHtml(fullDate)} · ${points}/${goal} điểm"><i>${learned ? (isToday ? '🔥' : '✓') : partial ? points : ''}</i><span>${labels[date.getDay()]}</span></div>`;
  }).join('');
}

function weeklyGoalStats() {
  const achieved = activityDates();
  const today = fromDateKey(localDate());
  const offset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getTime() - offset * DAY);
  const completed = Array.from({ length: 7 }, (_, index) => localDate(new Date(monday.getTime() + index * DAY))).filter((key) => achieved.has(key)).length;
  return { completed, total: 7 };
}

function groupByDate(words = state.data.words) {
  return words.reduce((groups, word) => {
    const key = wordDate(word);
    (groups[key] ||= []).push(word);
    return groups;
  }, {});
}

async function persist(quiet = true) {
  try {
    await api.saveData(state.data);
  } catch (error) {
    console.error(error);
    if (!quiet) showToast('Không thể lưu dữ liệu. Hãy thử lại nhé.', '!', true);
  }
}

function showToast(message, icon = '✓', error = false) {
  const toast = $('#toast');
  $('#toast-message').textContent = message;
  $('#toast-icon').textContent = icon;
  $('#toast-icon').style.background = error ? '#d95f6d' : '#83b59d';
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function askConfirm(title, message, action, acceptLabel = 'Đồng ý') {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-accept').textContent = acceptLabel;
  state.confirmAction = action;
  $('#confirm-modal').classList.remove('hidden');
}

function closeConfirm() {
  state.confirmAction = null;
  $('#confirm-modal').classList.add('hidden');
}

function emptyState(title, message, buttonLabel = '', destination = '') {
  return `<div class="empty-state"><div><span class="empty-icon">♡</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${buttonLabel ? `<button class="soft-btn" data-go="${destination}">${escapeHtml(buttonLabel)}</button>` : ''}</div></div>`;
}

function navigate(view) {
  state.view = view;
  $$('.view').forEach((node) => node.classList.toggle('active', node.id === `view-${view}`));
  $$('.nav-item[data-view]').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  $('.content').scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'home') renderHome();
  if (view === 'add') renderRecentAdded();
  if (view === 'library') renderLibrary();
  if (view === 'review' && !state.review) renderReviewWelcome();
  if (view === 'script') renderScript();
  if (view === 'speaking') renderSpeaking();
  if (view === 'writing') renderWriting();
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
  if (view === 'add') setTimeout(() => $('#term-input').focus(), 100);
}

function renderGlobal() {
  const due = dueWords().length;
  const currentStreak = streak();
  $('#nav-due-count').textContent = due > 99 ? '99+' : due;
  $('#nav-due-count').classList.toggle('show', due > 0);
  $('#sidebar-streak').textContent = currentStreak;
  $('#sidebar-streak-week').innerHTML = streakWeekMarkup(true);
  const speakingToday = state.data.speakingErrors.filter((item) => (item.createdDate || localDate(item.createdAt)) === localDate()).length;
  $('#nav-speaking-count').textContent = speakingToday > 99 ? '99+' : speakingToday;
  $('#nav-speaking-count').classList.toggle('show', speakingToday > 0);
  document.body.classList.remove('dark');
}

function renderHome() {
  const today = localDate();
  const due = dueWords().length;
  const currentStreak = streak();
  const bestStreak = longestStreak();
  const treeGrowth = globalThis.MilimTree?.nextGrowth?.(currentStreak);
  const todayMetrics = activityMetricsByDate()[today] || { points: 0, added: 0, reviewed: 0, speaking: 0, writing: 0 };
  const goal = state.data.settings.dailyGoal;
  const week = weeklyGoalStats();
  const formatted = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  $('#today-label').textContent = formatted.toUpperCase();
  $('#hero-due-count').textContent = due;
  $('#hero-message').textContent = due ? 'Một phiên ôn ngắn hôm nay sẽ giúp ký ức ở lại lâu hơn.' : (state.data.words.length ? 'Bạn đã hoàn thành phần ôn hôm nay. Thật dịu dàng và đều đặn!' : 'Thêm vài từ mới để bắt đầu hành trình cùng milim nhé.');
  $('#hero-review-btn').textContent = due ? 'Bắt đầu ôn' : 'Xem ôn tập';
  $('#home-streak').textContent = currentStreak;
  $('#home-streak-week').innerHTML = streakWeekMarkup();
  $('#tree-best').textContent = treeGrowth?.current ? `${treeGrowth.current.label} · kỷ lục ${bestStreak} ngày` : `Dài nhất · ${bestStreak} ngày`;
  $('#home-streak-message').textContent = todayMetrics.points >= goal
    ? 'Đã đạt mục tiêu hôm nay.'
    : `Còn ${goal - todayMetrics.points} điểm để hoàn thành hôm nay.`;
  $('#home-today-activity').textContent = `${todayMetrics.points}/${goal} điểm`;
  $('#home-goal-progress').style.width = `${Math.min(100, todayMetrics.points / goal * 100)}%`;
  $('#home-weekly-summary').textContent = `${week.completed}/7 ngày đạt mục tiêu tuần này`;

  const groups = groupByDate();
  const keys = Object.keys(groups).sort().reverse().slice(0, 3);
  $('#recent-decks').innerHTML = keys.length ? keys.map((key, index) => {
    const terms = groups[key].slice(0, 3).map((word) => word.term).join(' · ');
    const colors = ['#f8dfe8', '#e3edfb', '#f8eccf'];
    return `<article class="deck-card" data-deck-date="${key}" style="--deck-color:${colors[index]}"><div class="deck-top"><time>${escapeHtml(dateLabel(key))}</time><span class="deck-count">${groups[key].length}</span></div><h3>${escapeHtml(dateLabel(key, true))}</h3><p>${escapeHtml(terms)}</p></article>`;
  }).join('') : emptyState('Chưa có bộ từ nào', 'Từ đầu tiên của bạn sẽ xuất hiện ở đây.', 'Thêm từ đầu tiên', 'add');
  renderGlobal();
}

function renderScript() {
  const text = $('#script-input')?.value || '';
  const wordCount = (text.match(/[a-zA-Z][a-zA-Z'-]*/g) || []).length;
  $('#script-input-meta').textContent = `${wordCount} từ`;
  const knownCount = state.data.settings.scriptKnownTerms.length;
  const ignoredCount = state.data.settings.scriptIgnoredTerms.length;
  const profile = effectiveVocabularyProfile();
  const profileLevel = state.scriptAnalysisStats?.profileLevel || profile.level;
  $('#script-level').value = state.data.settings.scriptLevel;
  $('#script-filter-mode').value = state.data.settings.scriptFilterMode;
  $('#script-profile-level').textContent = `${profileLevel} · tin cậy ${Math.round(profile.confidence * 100)}%`;
  $('#script-profile-meta').textContent = profile.manual
    ? `Đang dùng mức bạn chọn · ${Object.keys(state.data.settings.scriptKnowledge).length} từ có bằng chứng · ${ignoredCount} từ bỏ qua`
    : profile.testedAt
      ? `${profile.answered || 0} câu kiểm tra · ${Object.keys(state.data.settings.scriptKnowledge).length} từ có bằng chứng · ${ignoredCount} từ bỏ qua`
      : `${state.data.words.length} từ trong Milim chưa phản ánh toàn bộ vốn từ. Hãy làm bài kiểm tra ngắn.`;
  $('#script-assessment-start').textContent = profile.testedAt ? 'Kiểm tra lại vốn từ' : 'Kiểm tra vốn từ 3 phút';
  $('#script-reset-profile').classList.toggle('hidden', knownCount + ignoredCount === 0);
  const results = state.scriptResults || [];
  const stats = state.scriptAnalysisStats;
  $('#script-results-caption').textContent = results.length
    ? `${results.length} gợi ý từ ${stats?.tokens || wordCount} từ · ưu tiên theo hồ sơ ${profileLevel}.`
    : 'Dán một đoạn script rồi bấm phân tích.';
  $('#script-results').innerHTML = results.length ? results.map((item) => `
    <article class="script-result-card ${state.scriptSelectedTerms.has(normalizedTerm(item.term)) ? 'selected' : ''}" data-script-term="${escapeHtml(item.term)}">
      <label class="script-pick" title="Chọn ${escapeHtml(item.term)}"><input type="checkbox" aria-label="Chọn ${escapeHtml(item.term)}" ${state.scriptSelectedTerms.has(normalizedTerm(item.term)) ? 'checked' : ''}/><span>✓</span></label>
      <div class="script-result-main">
        <div class="script-result-head"><strong>${escapeHtml(item.term)}</strong><b>${escapeHtml(item.cefr || '—')}</b><i class="pos-label pos-${escapeHtml(item.partOfSpeech || 'other')}">${escapeHtml(posName(item.partOfSpeech || 'other'))}</i><em>${Math.round((1 - Number(item.knownProbability || 0)) * 100)}% có thể chưa biết</em></div>
        ${item.forms?.length && !item.forms.includes(item.term) ? `<p class="script-word-form">Trong script: ${escapeHtml(item.forms.join(', '))}</p>` : ''}
        <p class="script-context">“${escapeHtml(item.context || 'Không tìm thấy câu gốc rõ ràng.')}”</p>
        <div class="script-reasons">${item.reasons.slice(0, 4).map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
        <label class="script-definition"><span>NGHĨA THEO NGỮ CẢNH</span><input data-script-definition maxlength="800" value="${escapeHtml(item.definition || '')}" placeholder="Nhập nghĩa hoặc dùng AI tạo nghĩa..." /></label>
        ${item.example ? `<p class="script-example"><span>EXAMPLE</span>${escapeHtml(item.example)}</p>` : ''}
      </div>
      <div class="script-result-actions">
        <small>${item.count} lần · ${scriptScoreLabel(item.score)}</small>
        <button type="button" data-script-action="known">Đã biết</button>
        <button type="button" data-script-action="ignore">Bỏ qua</button>
        <button type="button" data-script-action="add">Thêm</button>
      </div>
    </article>
  `).join('') : emptyState('Chưa có gợi ý nào', 'Milim sẽ bóc từ/cụm đáng học từ script bạn dán vào.');
  updateScriptToolbar();
  renderGlobal();
}

function runScriptAnalysis() {
  const input = $('#script-input');
  const analysis = analyzeScriptText(input.value);
  state.scriptResults = analysis.items;
  state.scriptAnalysisStats = analysis.stats;
  state.scriptSelectedTerms = new Set(state.scriptResults.slice(0, 8).map((item) => normalizedTerm(item.term)));
  $('#script-ai-status').classList.add('hidden');
  $('#script-ai-status').textContent = '';
  renderScript();
  if (!state.scriptResults.length) showToast('Chưa tìm thấy từ/cụm đáng học trong đoạn này.', '!', true);
}

function updateScriptToolbar() {
  const available = new Set((state.scriptResults || []).map((item) => normalizedTerm(item.term)));
  state.scriptSelectedTerms = new Set([...state.scriptSelectedTerms].filter((term) => available.has(term)));
  const count = state.scriptSelectedTerms.size;
  const hasResults = available.size > 0;
  const enrich = $('#script-enrich-selected');
  const add = $('#script-add-selected');
  const known = $('#script-known-selected');
  enrich.classList.toggle('hidden', !hasResults);
  add.classList.toggle('hidden', !hasResults);
  known.classList.toggle('hidden', !hasResults);
  enrich.disabled = state.scriptAiLoading || count === 0;
  add.disabled = state.scriptAiLoading || count === 0;
  known.disabled = state.scriptAiLoading || count === 0;
  enrich.textContent = state.scriptAiLoading ? 'AI đang tạo nghĩa…' : `Tạo nghĩa bằng AI${count ? ` · ${count}` : ''} ✦`;
  add.textContent = `Thêm mục đã chọn${count ? ` · ${count}` : ''}`;
  known.textContent = `Đã biết mục đã chọn${count ? ` · ${count}` : ''}`;
}

async function markSelectedScriptTermsKnown() {
  const terms = selectedScriptTerms();
  if (!terms.length) return;
  terms.forEach((term) => {
    updateScriptKnowledge(term, 0.99, 'known');
    if (!state.data.settings.scriptKnownTerms.includes(term)) state.data.settings.scriptKnownTerms.push(term);
  });
  state.data.settings.scriptKnownTerms = state.data.settings.scriptKnownTerms.slice(-2000);
  state.scriptResults = state.scriptResults.filter((item) => !state.scriptSelectedTerms.has(normalizedTerm(item.term)));
  state.scriptSelectedTerms.clear();
  await persist();
  renderScript();
  showToast(`Milim đã học thêm ${terms.length} từ bạn biết.`);
}

function startAbilityAssessment() {
  const api = globalThis.MilimAbility;
  if (!api) return;
  state.abilityAssessment = {
    ability: state.data.settings.vocabularyProfile?.ability || 3,
    answers: [],
    usedIds: [],
    observations: []
  };
  $('#ability-result').classList.add('hidden');
  $('#ability-question').classList.remove('hidden');
  $('#ability-modal').classList.remove('hidden');
  renderAbilityQuestion();
}

function closeAbilityAssessment() {
  $('#ability-modal').classList.add('hidden');
  state.abilityAssessment = null;
}

function renderAbilityQuestion() {
  const api = globalThis.MilimAbility;
  const session = state.abilityAssessment;
  if (!api || !session) return;
  if (session.answers.length >= api.QUESTION_COUNT) { finishAbilityAssessment(); return; }
  const item = api.nextItem(session.usedIds, session.ability);
  if (!item) { finishAbilityAssessment(); return; }
  session.current = item;
  const currentNumber = session.answers.length + 1;
  $('#ability-progress-text').textContent = `Câu ${currentNumber}/${api.QUESTION_COUNT}`;
  $('#ability-progress-bar').style.width = `${session.answers.length / api.QUESTION_COUNT * 100}%`;
  const choices = api.choicesFor(item).map((choice) => `<button type="button" data-ability-answer="${choice.correct ? 'correct' : 'wrong'}">${escapeHtml(choice.value)}</button>`).join('');
  $('#ability-question').innerHTML = `<p>Từ này gần nghĩa nhất với đáp án nào?</p><strong>${escapeHtml(item.term)}</strong><small>Đừng đoán nếu bạn chưa từng biết từ này — điều đó giúp Milim hiểu bạn chính xác hơn.</small><div class="ability-choices">${choices}<button type="button" class="unknown" data-ability-answer="unknown">Tôi chưa biết từ này</button></div>`;
}

function answerAbilityQuestion(answer) {
  const api = globalThis.MilimAbility;
  const session = state.abilityAssessment;
  const item = session?.current;
  if (!api || !session || !item) return;
  const correct = answer === 'correct';
  session.ability = api.updateAbility(session.ability, item, correct);
  session.answers.push({ id: item.id, term: item.term, difficulty: item.difficulty, correct, answer });
  session.usedIds.push(item.id);
  session.observations.push({ term: item.term, probability: correct ? 0.93 : answer === 'unknown' ? 0.04 : 0.12 });
  session.current = null;
  renderAbilityQuestion();
}

async function finishAbilityAssessment() {
  const api = globalThis.MilimAbility;
  const session = state.abilityAssessment;
  if (!api || !session) return;
  const result = api.assessmentResult(session);
  state.data.settings.vocabularyProfile = { ...result, testedAt: new Date().toISOString() };
  state.data.settings.scriptLevel = 'auto';
  session.observations.forEach((item) => updateScriptKnowledge(item.term, item.probability, 'assessment'));
  await persist();
  $('#ability-progress-bar').style.width = '100%';
  $('#ability-progress-text').textContent = `Hoàn thành ${result.answered} câu`;
  $('#ability-question').classList.add('hidden');
  $('#ability-result').classList.remove('hidden');
  $('#ability-result').innerHTML = `<span>HỒ SƠ MỚI</span><strong>${result.level}</strong><h3>Độ tin cậy ${Math.round(result.confidence * 100)}%</h3><p>${result.correct}/${result.answered} câu đúng. Từ giờ Milim sẽ dùng mức năng lực này cùng phản hồi “Đã biết”, lịch FSRS và những lần bạn quên để lọc script.</p><button type="button" class="primary-btn" id="ability-complete-close">Dùng hồ sơ này</button>`;
  if ($('#script-input').value.trim()) runScriptAnalysis();
  else renderScript();
}

async function enrichSelectedScriptTerms() {
  if (state.scriptAiLoading) return;
  const selected = selectedScriptTerms();
  if (!selected.length) { showToast('Hãy tích ít nhất một từ trước.', '!', true); return; }
  const selectedItems = selected.map((term) => state.scriptResults.find((item) => normalizedTerm(item.term) === term)).filter(Boolean);
  const missingDefinitions = selectedItems.filter((item) => !String(item.definition || '').trim());
  const items = (missingDefinitions.length ? missingDefinitions : selectedItems).slice(0, 16);
  state.scriptAiLoading = true;
  const status = $('#script-ai-status');
  status.classList.remove('hidden', 'error');
  status.textContent = items.length < selected.length ? `Đang tạo nghĩa cho 16/${selected.length} mục đầu tiên…` : `Đang tạo nghĩa cho ${items.length} mục…`;
  updateScriptToolbar();
  try {
    const result = await api.enrichScriptTerms({
      profileLevel: state.scriptAnalysisStats?.profileLevel || state.data.settings.scriptLevel,
      items: items.map(({ term, context, partOfSpeech }) => ({ term, context, partOfSpeech }))
    });
    if (!result?.items?.length) throw new Error('AI cục bộ hoặc Gemini chưa sẵn sàng. Bạn vẫn có thể tự nhập nghĩa.');
    const enriched = new Map(result.items.map((item) => [normalizedTerm(item.term), item]));
    state.scriptResults = state.scriptResults.map((item) => {
      const addition = enriched.get(normalizedTerm(item.term));
      return addition ? { ...item, ...addition, term: item.term } : item;
    });
    status.textContent = `Đã tạo nghĩa cho ${enriched.size} mục bằng ${aiProviderName(result.provider)}. Hãy đọc lại trước khi thêm.`;
    renderScript();
  } catch (error) {
    status.classList.add('error');
    status.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
    showToast('Chưa tạo được nghĩa bằng AI. Bạn có thể nhập nghĩa thủ công.', '!', true);
  } finally {
    state.scriptAiLoading = false;
    updateScriptToolbar();
  }
}

async function markScriptTerm(term, mode) {
  const key = normalizedTerm(term);
  if (!key) return;
  const field = mode === 'known' ? 'scriptKnownTerms' : 'scriptIgnoredTerms';
  state.data.settings[field] = [...new Set([...(state.data.settings[field] || []), key])].slice(-2000);
  if (mode === 'known') updateScriptKnowledge(key, 0.99, 'known');
  state.scriptResults = state.scriptResults.filter((item) => normalizedTerm(item.term) !== key);
  state.scriptSelectedTerms.delete(key);
  await persist();
  renderScript();
  showToast(mode === 'known' ? 'Milim sẽ ít gợi ý từ này hơn.' : 'Đã bỏ qua từ này.');
}

async function addScriptTerms(terms) {
  const uniqueTerms = [...new Set(terms.map(normalizedTerm).filter(Boolean))];
  if (!uniqueTerms.length) return;
  const missing = uniqueTerms.map((term) => state.scriptResults.find((item) => normalizedTerm(item.term) === term)).filter((item) => item && !String(item.definition || '').trim());
  if (missing.length) {
    const firstCard = $(`[data-script-term="${CSS.escape(missing[0].term)}"]`);
    firstCard?.querySelector('[data-script-definition]')?.focus();
    showToast(`Còn ${missing.length} mục chưa có nghĩa. Hãy nhập hoặc dùng AI tạo nghĩa.`, '!', true);
    return;
  }
  const existing = new Set(state.data.words.map((word) => normalizedTerm(word.term)));
  const now = new Date().toISOString();
  const additions = uniqueTerms.filter((term) => !existing.has(term)).map((term) => {
    const result = state.scriptResults.find((item) => normalizedTerm(item.term) === term);
    const context = result?.context || '';
    const partOfSpeech = result?.partOfSpeech || (term.includes(' ') ? 'phrase' : 'other');
    const definition = String(result?.definition || '').trim();
    const noteParts = [context ? `Context từ script:\n${context}` : '', result?.example ? `Example:\n${result.example}` : ''].filter(Boolean);
    return normalizeWord({
      id: uid(),
      term,
      definition,
      definitions: [{ partOfSpeech, definition }],
      partsOfSpeech: [partOfSpeech],
      note: noteParts.join('\n\n') || 'Thêm từ tính năng phân tích script.',
      createdAt: now,
      createdDate: localDate(),
      srs: freshSrs(now)
    }, state.data.settings.fsrsRetention);
  });
  if (!additions.length) { showToast('Những mục này đã có trong bộ từ của bạn.', '!', true); return; }
  state.data.words.push(...additions);
  additions.forEach((word) => updateScriptKnowledge(word.term, 0.12, 'added'));
  state.scriptResults = state.scriptResults.filter((item) => !uniqueTerms.includes(normalizedTerm(item.term)));
  uniqueTerms.forEach((term) => state.scriptSelectedTerms.delete(term));
  await persist();
  renderScript();
  renderRecentAdded();
  showToast(`Đã thêm ${additions.length} mục vào hôm nay.`);
}

function selectedScriptTerms() {
  return [...state.scriptSelectedTerms];
}

function renderPosOptions() {
  $('#pos-options').innerHTML = POS_OPTIONS.map(([value, label], index) => `<button type="button" class="pos-chip pos-${value} ${state.selectedPos.includes(value) ? 'selected' : ''}" data-pos="${value}" aria-pressed="${state.selectedPos.includes(value)}" aria-keyshortcuts="${index + 1}"><kbd>${index + 1}</kbd><span>${label}</span></button>`).join('');
}

function toggleSelectedPos(value) {
  if (!POS_OPTIONS.some(([option]) => option === value)) return;
  state.selectedPos = state.selectedPos.includes(value)
    ? state.selectedPos.filter((item) => item !== value)
    : [...state.selectedPos, value];
  renderPosOptions();
  renderDefinitionFields();
}

function focusPosPicker(index = 0) {
  const buttons = $$('#pos-options [data-pos]');
  if (!buttons.length) return;
  $('.pos-picker').classList.add('keyboard-active');
  buttons[Math.max(0, Math.min(index, buttons.length - 1))].focus();
}

function focusFirstDefinition() {
  $('.pos-picker').classList.remove('keyboard-active');
  $('#definition-input')?.focus();
}

function renderDefinitionFields(initialValues = null) {
  const existing = new Map($$('.definition-input').map((input) => [input.dataset.definitionPos || '', input.value]));
  if (initialValues) initialValues.forEach((item) => existing.set(item.partOfSpeech || '', item.definition || ''));
  const targets = state.selectedPos.length ? state.selectedPos : [''];
  const fallback = existing.get('') || (existing.size === 1 ? [...existing.values()][0] : '');
  $('#definition-fields').innerHTML = targets.map((part, index) => {
    const label = part ? `ĐỊNH NGHĨA · ${posName(part).toUpperCase()}` : 'ĐỊNH NGHĨA';
    const value = existing.get(part) || (targets.length === 1 ? fallback : '');
    return `<label class="field definition-field"><span>${escapeHtml(label)} <em>TÙY Ý</em></span><textarea class="definition-input" id="${index === 0 ? 'definition-input' : `definition-input-${index}`}" data-definition-pos="${escapeHtml(part)}" rows="3" maxlength="1000" placeholder="Nhập nghĩa riêng cho ${part ? posName(part).toLowerCase() : 'từ này'}...">${escapeHtml(value)}</textarea></label>`;
  }).join('');
}

function wordRow(word, options = {}) {
  const status = mastery(word);
  const labels = wordParts(word).map((part) => `<span class="pos-label pos-${escapeHtml(part)}">${escapeHtml(posName(part))}</span>`).join('');
  const definitions = wordDefinitions(word).map((item) => `<div>${item.partOfSpeech ? `<b class="definition-pos pos-text-${escapeHtml(item.partOfSpeech)}">${escapeHtml(posName(item.partOfSpeech))}</b>` : ''}<span>${escapeHtml(item.definition)}</span></div>`).join('');
  const note = options.showNote && String(word.note || '').trim()
    ? `<aside class="library-word-note"><span>NOTE</span><p>${escapeHtml(word.note.trim())}</p></aside>`
    : '';
  return `<article class="word-row" data-word-id="${escapeHtml(word.id)}"><div class="word-term"><span class="status-dot ${status}" title="${status}"></span><strong>${escapeHtml(word.term)}</strong>${labels}</div><div class="word-copy"><div class="word-definition">${definitions}</div>${note}</div><div class="word-actions"><button data-action="history" title="Lịch sử ôn">◷</button>${options.review ? `<button data-action="review-one" title="Ôn từ này">↻</button>` : ''}<button data-action="edit" title="Chỉnh sửa">✎</button><button data-action="delete" title="Xóa">×</button></div></article>`;
}

function renderRecentAdded() {
  const words = state.data.words.filter((word) => wordDate(word) === localDate()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#recent-added-caption').textContent = words.length ? `${words.length} từ trong bộ hôm nay` : 'Bộ từ hôm nay đang trống';
  $('#recent-added-list').innerHTML = words.length ? words.slice(0, 8).map((word) => wordRow(word)).join('') : emptyState('Chưa có từ nào hôm nay', 'Từ bạn vừa thêm sẽ hiện ngay tại đây.');
  renderGlobal();
}

function resetForm() {
  state.editingId = null;
  state.selectedPos = [];
  $('#word-form').reset();
  $('#term-input').value = '';
  $('#note-input').value = '';
  $$('.definition-input').forEach((input) => { input.value = ''; });
  $('#duplicate-hint').textContent = '';
  $('.pos-picker').classList.remove('keyboard-active');
  $('.add-submit').innerHTML = 'Thêm vào hôm nay <span>→</span>';
  renderPosOptions();
  renderDefinitionFields();
}

async function submitWord(event) {
  event.preventDefault();
  const term = $('#term-input').value.trim();
  const note = $('#note-input').value.trim();
  const definitions = $$('.definition-input').map((input) => ({ partOfSpeech: input.dataset.definitionPos || '', definition: input.value.trim() }));
  const emptyDefinition = definitions.findIndex((item) => !item.definition);
  if (!term || emptyDefinition >= 0) {
    showToast(state.selectedPos.length > 1 ? 'Hãy nhập định nghĩa riêng cho từng từ loại nhé.' : 'Hãy nhập cả thuật ngữ và định nghĩa nhé.', '!', true);
    (!term ? $('#term-input') : $$('.definition-input')[emptyDefinition]).focus();
    return;
  }
  const definition = definitions.map((item) => item.definition).join('\n');
  const partsOfSpeech = [...state.selectedPos];

  const duplicate = state.data.words.find((word) => normalizedTerm(word.term) === normalizedTerm(term) && word.id !== state.editingId);
  if (duplicate) {
    state.selectedDate = wordDate(duplicate);
    $('#duplicate-hint').textContent = `Từ này đã có trong bộ ${dateLabel(wordDate(duplicate))}.`;
    showToast(`“${term}” đã có trong thư viện.`, '!', true);
    $('#term-input').focus();
    return;
  }

  if (state.editingId) {
    const word = state.data.words.find((item) => item.id === state.editingId);
    if (word) Object.assign(word, { term, note, definition, definitions, partsOfSpeech, partOfSpeech: partsOfSpeech[0] || '', updatedAt: new Date().toISOString() });
    await persist(false);
    showToast('Đã lưu thay đổi cho từ này.');
  } else {
    const createdAt = new Date().toISOString();
    state.data.words.push(normalizeWord({ id: uid(), term, note, definition, definitions, partsOfSpeech, partOfSpeech: partsOfSpeech[0] || '', createdAt, createdDate: localDate(), srs: freshSrs(createdAt) }, state.data.settings.fsrsRetention));
    await persist(false);
    showToast(`Đã thêm “${term}” vào bộ hôm nay.`);
  }
  resetForm();
  renderRecentAdded();
  renderHome();
  $('#term-input').focus();
}

function editWord(id) {
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return;
  state.editingId = id;
  state.selectedPos = [...wordParts(word)];
  $('#term-input').value = word.term;
  $('#note-input').value = word.note || '';
  $('.add-submit').innerHTML = 'Lưu thay đổi <span>→</span>';
  renderPosOptions();
  renderDefinitionFields(wordDefinitions(word));
  navigate('add');
}

function deleteWord(id) {
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return;
  askConfirm('Xóa từ này?', `“${word.term}” và toàn bộ lịch sử ôn của từ sẽ bị xóa.`, async () => {
    state.data.words = state.data.words.filter((item) => item.id !== id);
    if (state.editingId === id) resetForm();
    await persist(false);
    closeConfirm();
    renderCurrentView();
    showToast('Đã xóa từ khỏi milim.');
  }, 'Xóa từ');
}

function gradeName(grade) {
  return { again: 'Quên', hard: 'Khó', good: 'Nhớ', easy: 'Rất dễ' }[grade] || grade;
}

function currentRetrievability(word) {
  const scheduler = fsrsScheduler(state.data?.settings?.fsrsRetention);
  if (!scheduler || !word.srs?.fsrs || !word.srs.lastReviewedAt) return null;
  try {
    return Math.max(0, Math.min(1, Number(scheduler.get_retrievability(word.srs.fsrs, new Date(), false)) || 0));
  } catch {
    return null;
  }
}

function showWordHistory(id) {
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return;
  const history = [...word.srs.history].reverse();
  const counts = ['again', 'hard', 'good', 'easy'].reduce((result, grade) => {
    result[grade] = history.filter((item) => item.grade === grade).length;
    return result;
  }, {});
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const stability = Number(word.srs.fsrs?.stability) || 0;
  const retrievability = currentRetrievability(word);
  $('#history-word').textContent = word.term;
  $('#history-definition').textContent = definitionText(word, true);
  $('#history-summary').innerHTML = `<div><strong>${history.length}</strong><span>Lượt đã ôn</span></div><div><strong>${word.srs.lapses || 0}</strong><span>Lần quên</span></div><div><strong>${stability < 10 ? stability.toFixed(1) : Math.round(stability)} ngày</strong><span>Độ ổn định ký ức</span></div><div><strong>${retrievability === null ? '—' : `${Math.round(retrievability * 100)}%`}</strong><span>Khả năng nhớ lúc này</span></div>`;
  $('#history-pattern').innerHTML = history.length
    ? `<p>Bạn thường đánh giá từ này ở mức <strong>${gradeName(common[0])}</strong> (${common[1]} lần). FSRS đang ước tính độ khó ${Number(word.srs.fsrs?.difficulty || 0).toFixed(1)}/10.</p><div class="history-bars">${Object.entries(counts).map(([grade, count]) => `<span class="history-grade ${grade}">${gradeName(grade)} <b>${count}</b></span>`).join('')}</div>`
    : '<p>Từ này chưa có lần ôn nào.</p>';
  $('#history-list').innerHTML = history.length ? history.slice(0, 20).map((item) => `<div class="history-entry"><div><strong>${gradeName(item.grade)}</strong><span>${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))}</span></div><div>${Number.isFinite(item.meaningScore) ? `<span>Đúng ý ${item.meaningScore}/10</span><span>Tiếng Anh ${item.sentenceScore}/10</span>` : ''}<span>${item.reviewMode === 'fast' ? 'Ôn nhanh' : item.aiProvider ? escapeHtml(aiProviderName(item.aiProvider)) : 'Ôn tập'}</span><span>Hẹn lại: ${intervalLabel(item.interval || 0, item.grade, item.dueAt, item.at)}</span>${Number.isFinite(item.stability) ? `<span>Ổn định ${item.stability.toFixed(1)} ngày</span>` : ''}</div></div>`).join('') : '';
  $('#history-modal').classList.remove('hidden');
}

function closeWordHistory() {
  $('#history-modal').classList.add('hidden');
}

function renderLibrary() {
  const groups = groupByDate();
  const dates = Object.keys(groups).sort().reverse();
  if (!state.selectedDate || !groups[state.selectedDate]) state.selectedDate = dates[0] || null;
  $('#date-list').innerHTML = dates.length ? dates.map((key) => `<button class="date-item ${key === state.selectedDate ? 'active' : ''}" data-date="${key}"><div><strong>${escapeHtml(dateLabel(key))}</strong><span>${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(fromDateKey(key))}</span></div><b>${groups[key].length}</b></button>`).join('') : `<div style="padding:20px;text-align:center;color:var(--muted);font-size:10px">Chưa có ngày học nào</div>`;

  if (!state.selectedDate) {
    $('#deck-detail').innerHTML = emptyState('Thư viện đang trống', 'Thêm một từ để tạo bộ từ đầu tiên.', 'Thêm từ', 'add');
    return;
  }
  const search = $('#search-input').value.trim().toLocaleLowerCase('vi');
  const filter = $('#mastery-filter').value;
  const allWords = groups[state.selectedDate] || [];
  const visible = allWords.filter((word) => {
    const matchesSearch = !search || word.term.toLocaleLowerCase('vi').includes(search) || word.definition.toLocaleLowerCase('vi').includes(search) || String(word.note || '').toLocaleLowerCase('vi').includes(search);
    return matchesSearch && (filter === 'all' || mastery(word) === filter);
  });
  $('#deck-detail').innerHTML = `<div class="detail-header"><div><h2>${escapeHtml(dateLabel(state.selectedDate, true))}</h2><p>${allWords.length} từ · ${allWords.filter((word) => mastery(word) === 'mastered').length} đã ghi nhớ</p></div><div><button class="soft-btn" data-review-date="${state.selectedDate}">Ôn bộ này</button></div></div><div class="word-list">${visible.length ? visible.map((word) => wordRow(word, { review: true, showNote: true })).join('') : emptyState('Không tìm thấy từ phù hợp', 'Thử đổi từ khóa hoặc bộ lọc nhé.')}</div>`;
  renderGlobal();
}

function renderSpeaking() {
  const items = [...state.data.speakingErrors].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const groups = items.reduce((result, item) => {
    const key = item.createdDate || localDate(item.createdAt);
    (result[key] ||= []).push(item);
    return result;
  }, {});
  const todayCount = groups[localDate()]?.length || 0;
  $('#speaking-caption').textContent = items.length
    ? `${items.length} lỗi đã ghi · ${todayCount} lỗi hôm nay`
    : 'Chưa có lỗi nào được ghi lại';
  $('#speaking-journal').innerHTML = items.length
    ? Object.keys(groups).sort().reverse().map((key) => `
      <section class="speaking-day">
        <div class="speaking-day-head"><div><strong>${escapeHtml(dateLabel(key, true))}</strong><span>${groups[key].length} ghi chép</span></div><time>${escapeHtml(key)}</time></div>
        <div class="speaking-error-list">${groups[key].map((item) => `
          <article class="speaking-error-card" data-speaking-id="${escapeHtml(item.id)}">
            <div class="speaking-error-side wrong"><span>ĐÃ NÓI / GHI SAI</span><p>${escapeHtml(item.error).replace(/\n/g, '<br>')}</p></div>
            <div class="speaking-error-divider">→</div>
            <div class="speaking-error-side fixed"><span>CÁCH SỬA</span><p>${escapeHtml(item.correction).replace(/\n/g, '<br>')}</p></div>
            <button class="speaking-delete" data-speaking-action="delete" title="Xóa ghi chép">×</button>
          </article>`).join('')}</div>
      </section>`).join('')
    : emptyState('Sổ speaking đang trống', 'Sau mỗi lần nói, ghi lại một lỗi nhỏ và cách sửa ở đây.');
  renderGlobal();
}

async function submitSpeakingError(event) {
  event.preventDefault();
  const errorInput = $('#speaking-error-input');
  const correctionInput = $('#speaking-correction-input');
  const error = errorInput.value.trim();
  const correction = correctionInput.value.trim();
  if (!error || !correction) {
    showToast('Hãy nhập cả lỗi sai và cách sửa.', '!', true);
    (!error ? errorInput : correctionInput).focus();
    return;
  }
  state.data.speakingErrors.push({
    id: uid(),
    error,
    correction,
    createdAt: new Date().toISOString(),
    createdDate: localDate()
  });
  await persist(false);
  errorInput.value = '';
  correctionInput.value = '';
  renderSpeaking();
  showToast('Đã lưu lỗi speaking vào nhật ký hôm nay.');
  errorInput.focus();
}

function deleteSpeakingError(id) {
  const item = state.data.speakingErrors.find((entry) => entry.id === id);
  if (!item) return;
  askConfirm('Xóa ghi chép này?', 'Lỗi speaking và phần sửa tương ứng sẽ bị xóa khỏi nhật ký.', async () => {
    state.data.speakingErrors = state.data.speakingErrors.filter((entry) => entry.id !== id);
    await persist(false);
    closeConfirm();
    renderSpeaking();
    showToast('Đã xóa ghi chép speaking.');
  }, 'Xóa ghi chép');
}

function writingTaskLabel(task = state.writingTask) {
  return task === 'task2' ? 'Task 2' : 'Task 1';
}

function writingTypes(task = state.writingTask) {
  return state.data.writing.types[task] || [];
}

function renderWritingTypes() {
  const types = writingTypes();
  $('#writing-types-title').textContent = `Các dạng ${writingTaskLabel()}`;
  $('#writing-type-list').innerHTML = types.length ? types.map((type) => `
    <div class="writing-type-chip" data-writing-type-id="${escapeHtml(type.id)}">
      <span>${escapeHtml(type.name)}</span>
      <button type="button" data-writing-type-action="edit" title="Đổi tên">✎</button>
      <button type="button" data-writing-type-action="delete" title="Xóa">×</button>
    </div>`).join('') : '<span class="writing-empty-types">Chưa có dạng bài. Hãy thêm dạng đầu tiên bên dưới.</span>';
}

function renderWritingTypeSelect(preferred = '') {
  const select = $('#writing-type-select');
  const current = preferred || select.value;
  const types = writingTypes();
  select.innerHTML = types.length
    ? types.map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`).join('')
    : '<option value="">Chưa có dạng bài</option>';
  select.disabled = !types.length;
  if (types.some((type) => type.id === current)) select.value = current;
}

function renderWritingErrors() {
  const container = $('#writing-errors');
  if (!state.writingErrors.length) {
    container.innerHTML = '<div class="writing-errors-empty">Chưa có lỗi nào. Bạn có thể thêm sau khi tự chấm bài.</div>';
    return;
  }
  container.innerHTML = state.writingErrors.map((item, index) => `
    <div class="writing-error-row" data-writing-error-id="${escapeHtml(item.id)}">
      <textarea data-writing-error-field="mistake" maxlength="3000" placeholder="Lỗi sai ${index + 1}...">${escapeHtml(item.mistake)}</textarea>
      <span class="writing-error-arrow">→</span>
      <textarea data-writing-error-field="correction" maxlength="3000" placeholder="Cách sửa / điều cần nhớ...">${escapeHtml(item.correction)}</textarea>
      <button type="button" class="writing-error-remove" data-writing-error-remove title="Xóa lỗi">×</button>
    </div>`).join('');
}

function syncWritingErrorsFromDom() {
  $$('#writing-errors [data-writing-error-id]').forEach((row) => {
    const item = state.writingErrors.find((entry) => entry.id === row.dataset.writingErrorId);
    if (!item) return;
    item.mistake = row.querySelector('[data-writing-error-field="mistake"]').value;
    item.correction = row.querySelector('[data-writing-error-field="correction"]').value;
  });
}

function renderWritingImage() {
  const preview = $('#writing-image-preview');
  const empty = $('#writing-image-empty');
  const hasImage = Boolean(state.writingImage);
  preview.classList.toggle('hidden', !hasImage);
  empty.classList.toggle('hidden', hasImage);
  $('#remove-writing-image').classList.toggle('hidden', !hasImage);
  if (hasImage) preview.src = state.writingImage;
  else preview.removeAttribute('src');
}

function writingWordCount(value = $('#writing-content').value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function renderWritingJournal() {
  const entries = state.data.writing.entries
    .filter((entry) => entry.task === state.writingTask)
    .sort((a, b) => new Date(b.createdDate || b.createdAt) - new Date(a.createdDate || a.createdAt));
  $('#writing-history-caption').textContent = entries.length
    ? `${entries.length} bài ${writingTaskLabel()} đã lưu`
    : `Chưa có bài ${writingTaskLabel()} nào`;
  const groups = entries.reduce((result, entry) => {
    (result[entry.createdDate] ||= []).push(entry);
    return result;
  }, {});
  $('#writing-journal').innerHTML = entries.length ? Object.keys(groups).sort().reverse().map((date) => `
    <section class="writing-day">
      ${groups[date].map((entry) => {
        const errors = entry.errors || [];
        const typeName = entry.typeName || 'Dạng bài đã xóa';
        return `<details class="writing-entry-card" data-writing-entry-id="${escapeHtml(entry.id)}">
          <summary class="writing-entry-summary" aria-label="Mở chi tiết bài Writing">
            <div class="writing-entry-thumb">${entry.promptImage ? `<img loading="lazy" src="${escapeHtml(entry.promptImage)}" alt="Ảnh đề ${escapeHtml(typeName)}"/>` : '<span>Chưa có ảnh đề</span>'}</div>
            <div class="writing-entry-overview">
              <strong class="writing-entry-date"><span>NGÀY LÀM BÀI</span>${escapeHtml(dateLabel(entry.createdDate, true))}</strong>
              <div class="writing-entry-stats">
                ${entry.score !== '' ? `<span class="writing-entry-band"><small>BAND</small><b>${escapeHtml(entry.score)}</b></span>` : '<span><small>BAND</small><b>—</b></span>'}
                <span><small>SỐ TỪ</small><b>${writingWordCount(entry.content)}</b></span>
                <span><small>LỖI ĐÃ GHI</small><b>${errors.length}</b></span>
              </div>
            </div>
          </summary>
          <div class="writing-entry-detail">
            <div class="writing-entry-detail-head"><div><span>${escapeHtml(writingTaskLabel(entry.task).toUpperCase())}</span><h3>${escapeHtml(typeName)}</h3></div><div class="writing-entry-actions"><button type="button" data-writing-entry-action="edit">Chỉnh sửa</button><button type="button" data-writing-entry-action="delete">Xóa</button></div></div>
            <section class="writing-entry-content"><h4>Bài làm</h4><p>${escapeHtml(entry.content)}</p></section>
            ${errors.length ? `<section class="writing-entry-errors"><h4>Những lỗi đã ghi</h4>${errors.map((item) => `<div class="writing-entry-error"><p>${escapeHtml(item.mistake)}</p><b>→</b><p>${escapeHtml(item.correction)}</p></div>`).join('')}</section>` : '<p class="writing-entry-no-errors">Bài này chưa ghi lỗi sai nào.</p>'}
          </div>
        </details>`;
      }).join('')}
    </section>`).join('') : emptyState('Nhật ký Writing đang trống', `Bài ${writingTaskLabel()} đầu tiên của bạn sẽ xuất hiện ở đây.`);
}

function renderWriting() {
  $$('[data-writing-task]').forEach((button) => button.classList.toggle('active', button.dataset.writingTask === state.writingTask));
  $('#writing-types-card').classList.toggle('hidden', !state.writingManageTypesOpen);
  $('#writing-entry-form').classList.toggle('hidden', !state.writingEditorOpen);
  $('#writing-history-section').classList.toggle('hidden', state.writingManageTypesOpen || state.writingEditorOpen);
  $('#manage-writing-types').classList.toggle('hidden', state.writingEditorOpen);
  $('#manage-writing-types').textContent = state.writingManageTypesOpen ? 'Đóng quản lý' : 'Quản lý dạng bài';
  $('#new-writing-entry').classList.toggle('hidden', state.writingEditorOpen);
  renderWritingTypes();
  renderWritingTypeSelect();
  renderWritingErrors();
  renderWritingImage();
  renderWritingJournal();
  $('#writing-form-eyebrow').textContent = `${writingTaskLabel().toUpperCase()} · ${state.editingWritingId ? 'CHỈNH SỬA' : 'BÀI MỚI'}`;
  $('#writing-form-title').textContent = state.editingWritingId ? 'Chỉnh sửa bài Writing' : 'Ghi một bài Writing';
  $('#save-writing-entry').textContent = state.editingWritingId ? 'Lưu thay đổi' : 'Lưu vào nhật ký';
  $('#cancel-writing-edit').classList.toggle('hidden', !state.writingEditorOpen);
  $('#cancel-writing-edit').textContent = state.editingWritingId ? 'Hủy chỉnh sửa' : 'Đóng';
  if (!$('#writing-date').value) $('#writing-date').value = localDate();
  $('#writing-word-count').textContent = `${writingWordCount()} từ`;
  renderGlobal();
}

function resetWritingForm(render = true) {
  state.editingWritingId = null;
  state.writingEditorOpen = false;
  state.writingManageTypesOpen = false;
  state.writingErrors = [];
  state.writingImage = '';
  $('#writing-entry-form').reset();
  $('#writing-date').value = localDate();
  if (render) renderWriting();
}

async function saveWritingType() {
  const input = $('#writing-type-input');
  const name = input.value.trim();
  if (!name) { showToast('Hãy nhập tên dạng bài.', '!', true); input.focus(); return; }
  const types = writingTypes();
  const duplicate = types.some((type) => type.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi') && type.id !== state.editingWritingTypeId);
  if (duplicate) { showToast('Dạng bài này đã tồn tại.', '!', true); return; }
  if (state.editingWritingTypeId) {
    const type = types.find((item) => item.id === state.editingWritingTypeId);
    if (type) {
      type.name = name;
      state.data.writing.entries.filter((entry) => entry.typeId === type.id).forEach((entry) => { entry.typeName = name; });
    }
  } else {
    types.push({ id: uid(), name, createdAt: new Date().toISOString() });
  }
  state.editingWritingTypeId = null;
  input.value = '';
  $('#save-writing-type').textContent = 'Thêm dạng bài';
  $('#cancel-writing-type').classList.add('hidden');
  await persist(false);
  renderWriting();
  showToast('Đã lưu dạng bài Writing.');
}

function editWritingType(id) {
  const type = writingTypes().find((item) => item.id === id);
  if (!type) return;
  state.editingWritingTypeId = id;
  $('#writing-type-input').value = type.name;
  $('#save-writing-type').textContent = 'Lưu tên mới';
  $('#cancel-writing-type').classList.remove('hidden');
  $('#writing-type-input').focus();
}

function deleteWritingType(id) {
  const type = writingTypes().find((item) => item.id === id);
  if (!type) return;
  askConfirm('Xóa dạng bài này?', `Các bài cũ thuộc “${type.name}” vẫn được giữ trong lịch sử.`, async () => {
    state.data.writing.types[state.writingTask] = writingTypes().filter((item) => item.id !== id);
    state.data.writing.entries.filter((entry) => entry.typeId === id).forEach((entry) => { entry.typeId = ''; });
    await persist(false);
    closeConfirm();
    renderWriting();
    showToast('Đã xóa dạng bài.');
  }, 'Xóa dạng bài');
}

async function setWritingImage(loader, button) {
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Đang xử lý…'; }
  try {
    const image = await loader();
    if (image) {
      state.writingImage = image;
      renderWritingImage();
      showToast('Đã thêm ảnh đề bài.');
    }
  } catch (error) {
    const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
    showToast(message || 'Không thể đọc ảnh.', '!', true);
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function submitWritingEntry(event) {
  event.preventDefault();
  syncWritingErrorsFromDom();
  const content = $('#writing-content').value.trim();
  const typeId = $('#writing-type-select').value;
  const type = writingTypes().find((item) => item.id === typeId);
  if (!type) { showToast('Hãy thêm hoặc chọn một dạng bài.', '!', true); $('#writing-type-input').focus(); return; }
  if (!content) { showToast('Hãy nhập nội dung bài làm.', '!', true); $('#writing-content').focus(); return; }
  const score = $('#writing-score').value;
  if (score !== '' && (Number(score) < 0 || Number(score) > 9)) { showToast('Điểm IELTS cần nằm trong khoảng 0–9.', '!', true); return; }
  const now = new Date().toISOString();
  const payload = {
    task: state.writingTask,
    typeId,
    typeName: type.name,
    promptImage: state.writingImage,
    content,
    score,
    errors: state.writingErrors.map((item) => ({ id: item.id, mistake: item.mistake.trim(), correction: item.correction.trim() })).filter((item) => item.mistake || item.correction),
    createdDate: $('#writing-date').value || localDate(),
    updatedAt: now
  };
  if (state.editingWritingId) {
    const entry = state.data.writing.entries.find((item) => item.id === state.editingWritingId);
    if (entry) Object.assign(entry, payload);
  } else {
    state.data.writing.entries.push({ id: uid(), createdAt: now, ...payload });
  }
  await persist(false);
  showToast(state.editingWritingId ? 'Đã lưu thay đổi bài Writing.' : 'Đã lưu bài vào nhật ký Writing.');
  resetWritingForm();
}

function editWritingEntry(id) {
  const entry = state.data.writing.entries.find((item) => item.id === id);
  if (!entry) return;
  state.writingTask = entry.task;
  state.editingWritingId = id;
  state.writingEditorOpen = true;
  state.writingManageTypesOpen = false;
  state.writingErrors = entry.errors.length ? entry.errors.map((item) => ({ ...item })) : [];
  state.writingImage = entry.promptImage || '';
  renderWriting();
  renderWritingTypeSelect(entry.typeId);
  $('#writing-date').value = entry.createdDate;
  $('#writing-score').value = entry.score;
  $('#writing-content').value = entry.content;
  $('#writing-word-count').textContent = `${writingWordCount(entry.content)} từ`;
  $('.content').scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteWritingEntry(id) {
  const entry = state.data.writing.entries.find((item) => item.id === id);
  if (!entry) return;
  askConfirm('Xóa bài Writing này?', 'Ảnh đề, nội dung và các lỗi đã ghi của bài này sẽ bị xóa khỏi nhật ký.', async () => {
    state.data.writing.entries = state.data.writing.entries.filter((item) => item.id !== id);
    await persist(false);
    closeConfirm();
    renderWriting();
    showToast('Đã xóa bài Writing.');
  }, 'Xóa bài');
}

function aiProviderName(provider) {
  if (provider === 'local') return 'AI cục bộ';
  if (provider === 'gemini') return 'Gemini';
  return 'Tự đánh giá';
}

function serializeReviewSession(review) {
  if (!review) return null;
  return {
    queue: [...review.queue],
    total: review.total,
    answered: review.answered,
    correct: review.correct,
    requeued: [...review.requeued],
    title: review.title,
    quick: review.quick,
    mode: review.mode,
    revealed: review.revealed,
    fastAnswerState: review.fastAnswerState || '',
    deepWords: [...review.deepWords],
    endsAt: review.endsAt,
    checking: false,
    result: review.result,
    draft: review.draft,
    challenge: review.challenge,
    challengeLoading: false,
    challengeError: ''
  };
}

async function persistReviewSession() {
  state.data.reviewSession = serializeReviewSession(state.review);
  await persist();
}

function restoreReviewSession() {
  const saved = state.data.reviewSession;
  if (!saved || !Array.isArray(saved.queue)) return false;
  const knownIds = new Set(state.data.words.map((word) => word.id));
  const queue = saved.queue.filter((id) => knownIds.has(id));
  if (!queue.length) {
    state.data.reviewSession = null;
    return false;
  }
  state.review = {
    queue,
    total: Math.max(queue.length, Number(saved.total) || queue.length),
    answered: Math.max(0, Number(saved.answered) || 0),
    correct: Math.max(0, Number(saved.correct) || 0),
    requeued: new Set(Array.isArray(saved.requeued) ? saved.requeued : []),
    title: String(saved.title || 'Phiên ôn đang dở'),
    quick: Boolean(saved.quick),
    mode: ['fast', 'deep'].includes(saved.mode) ? saved.mode : 'deep',
    revealed: Boolean(saved.revealed),
    deepWords: new Set(Array.isArray(saved.deepWords) ? saved.deepWords.filter((id) => knownIds.has(id)) : []),
    endsAt: saved.quick && Number(saved.endsAt) > Date.now() ? Number(saved.endsAt) : null,
    checking: false,
    result: saved.result || null,
    draft: { sentence: '', term: '', ...(saved.draft || {}) },
    fastAnswerState: ['wrong', 'correct', 'revealed'].includes(saved.fastAnswerState) ? saved.fastAnswerState : '',
    challenge: saved.challenge && !challengeLeaksTarget(saved.challenge.vietnamese_sentence, state.data.words.find((word) => word.id === queue[0])?.term)
      ? saved.challenge
      : null,
    challengeLoading: false,
    challengeError: ''
  };
  return true;
}

function cachedChallenge(word) {
  word.recallCache = (word.recallCache || []).filter((item) => item.vietnamese_sentence && !challengeLeaksTarget(item.vietnamese_sentence, word.term));
  const available = word.recallCache;
  if (!available.length) return null;
  const selected = [...available].sort((a, b) => (a.uses || 0) - (b.uses || 0))[0];
  selected.uses = (selected.uses || 0) + 1;
  return { ...selected, provider: selected.provider || 'cache', fromCache: true, manual: false };
}

function cacheChallenge(word, challenge) {
  if (!challenge || challenge.manual || !challenge.vietnamese_sentence || challengeLeaksTarget(challenge.vietnamese_sentence, word.term)) return;
  word.recallCache ||= [];
  const duplicate = word.recallCache.some((item) => item.vietnamese_sentence === challenge.vietnamese_sentence);
  if (!duplicate) {
    word.recallCache.push({
      vietnamese_sentence: challenge.vietnamese_sentence,
      suggested_answer: challenge.suggested_answer,
      provider: challenge.provider,
      createdAt: new Date().toISOString(),
      uses: 1
    });
    word.recallCache = word.recallCache.slice(-5);
  }
}

function prefetchChallenge(word) {
  if (!word || (word.recallCache || []).length >= 3 || prefetchingChallenges.has(word.id)) return;
  prefetchingChallenges.add(word.id);
  api.generateAIChallenge({
    word: word.term,
    partOfSpeech: wordParts(word).map(posName).join(', '),
    savedDefinition: definitionText(word, true)
  }).then(async (challenge) => {
    cacheChallenge(word, challenge);
    await persist();
  }).catch(() => {
    /* Prefetch is optional; the active review always keeps its own fallback. */
  }).finally(() => prefetchingChallenges.delete(word.id));
}

function reviewAIStatusMarkup() {
  const status = state.aiStatus;
  const provider = status?.activeProvider || 'manual';
  if (provider === 'local') return `<div class="gemini-ready local-ready">● AI cục bộ sẵn sàng · ${escapeHtml(status.local?.model?.name || 'Qwen3 4B')}</div>`;
  if (provider === 'gemini') return `<div class="gemini-ready">✦ Gemini ${escapeHtml(status.gemini?.model || state.geminiModel)} đã sẵn sàng</div>`;
  return '<div class="gemini-notice"><strong>Đang dùng chế độ tự đánh giá</strong><span>Bạn vẫn có thể ôn ngay; tải AI cục bộ để được chấm offline.</span><button class="text-btn" data-go="settings">Thiết lập →</button></div>';
}

function renderReviewWelcome() {
  const due = dueWords();
  const overdue = overdueWords();
  const latestDate = Object.keys(groupByDate()).sort().reverse()[0];
  const resumable = Boolean(state.data.reviewSession?.queue?.length);
  $('#review-title').textContent = 'Ôn tập hôm nay';
  $('#review-exit').classList.add('hidden');
  const overdueList = overdue.slice(0, 5).map((word) => `<span>${escapeHtml(word.term)}</span>`).join('');
  $('#review-stage').innerHTML = `<div class="review-dashboard">${resumable ? `<section class="resume-review-card"><div><span>PHIÊN ĐANG DỞ</span><strong>${escapeHtml(state.data.reviewSession.title || 'Ôn tập')}</strong><p>Còn ${state.data.reviewSession.queue.length} từ · tiến độ đã được lưu tự động.</p></div><button class="primary-btn" id="resume-review">Tiếp tục phiên →</button></section>` : ''}<div class="review-stage-card"><div class="review-welcome"><img src="../assets/milim-icon-rounded.png" alt="Mèo milim"><span class="review-mode-pill">NHỚ NHANH · ÔN SÂU KHI CẦN</span><h2>${due.length ? `${due.length} từ đang chờ ôn` : 'Bạn đã hoàn thành hôm nay'}</h2><p>${due.length ? 'Xem nghĩa rồi tự nhập thuật ngữ tiếng Anh. Từ bị Quên hoặc Khó sẽ được Milim đưa sang luyện sâu bằng AI.' : (state.data.words.length ? 'Bạn có thể bắt đầu một phiên 5 phút hoặc luyện sâu bộ gần nhất.' : 'Hãy thêm những từ đầu tiên để bắt đầu.')}</p><div class="review-summary"><span>${state.data.words.length} từ trong thư viện</span><span>${streak()} ngày liên tục</span></div><div class="review-welcome-actions">${due.length ? '<button class="primary-btn" id="start-due-review">Ôn nhanh từ đến hạn</button><button class="soft-btn" id="start-deep-review">Ôn sâu bằng AI</button>' : latestDate ? `<button class="soft-btn" data-review-date="${latestDate}">Ôn sâu bộ gần nhất</button>` : '<button class="primary-btn" data-go="add">Thêm từ đầu tiên</button>'}${state.data.words.length ? '<button class="soft-btn" id="start-quick-review">Phiên nhanh 5 phút</button>' : ''}</div><p class="review-shortcut-note">Phím tắt khi ôn nhanh: Enter để kiểm tra · 1 Quên · 2 Khó · 3 Nhớ · 4 Rất dễ</p></div></div>${overdue.length ? `<section class="overdue-panel"><div><p class="eyebrow">TỪ QUÁ HẠN</p><h3>${overdue.length} từ cần ưu tiên</h3><p>Ôn nhanh trước; từ còn yếu sẽ tự chuyển sang luyện sâu.</p><div class="overdue-terms">${overdueList}${overdue.length > 5 ? `<span>+${overdue.length - 5}</span>` : ''}</div></div><button class="soft-btn" id="start-overdue-review">Ôn nhanh từ quá hạn</button></section>` : ''}</div>`;
}

async function startReview(words, title = 'Ôn tập hôm nay', options = {}) {
  if (!words.length) { showToast('Bộ này chưa có từ để ôn.', '!', true); return; }
  const shuffled = shuffleWords(words);
  const selected = options.quick ? shuffled.slice(0, 40) : shuffled;
  const mode = options.mode === 'fast' ? 'fast' : 'deep';
  state.review = {
    queue: selected.map((word) => word.id),
    total: selected.length,
    answered: 0,
    correct: 0,
    requeued: new Set(),
    title,
    quick: Boolean(options.quick),
    mode,
    revealed: false,
    fastAnswerState: '',
    deepWords: new Set(),
    endsAt: options.quick ? Date.now() + 5 * 60 * 1000 : null,
    checking: false,
    result: null,
    draft: { sentence: '', term: '' },
    challenge: null,
    challengeLoading: false,
    challengeError: ''
  };
  await persistReviewSession();
  navigate('review');
  $('#review-title').textContent = title;
  $('#review-exit').classList.remove('hidden');
  renderReviewCard();
}

function startQuickReview() {
  const candidates = dueWords().length ? dueWords() : [...state.data.words].sort((a, b) => new Date(a.srs.lastReviewedAt || 0) - new Date(b.srs.lastReviewedAt || 0));
  startReview(candidates, 'Ôn nhanh 5 phút', { quick: true, mode: 'fast' });
}

function intervalLabel(days, grade, dueAt = null, from = new Date()) {
  if (dueAt) {
    const minutes = Math.max(1, Math.round((new Date(dueAt).getTime() - new Date(from).getTime()) / 60000));
    if (minutes < 60) return `${minutes} phút`;
    if (minutes < 24 * 60) return `${Math.max(1, Math.round(minutes / 60))} giờ`;
  }
  if (grade === 'again' && days < 1) return '10 phút';
  if (days < 1) return 'hôm nay';
  if (days === 1) return '1 ngày';
  if (days < 30) return `${Math.round(days)} ngày`;
  if (days < 365) return `${Math.round(days / 30)} tháng`;
  return `${Math.round(days / 365)} năm`;
}

function legacyProjectedSchedule(word, grade, now = new Date()) {
  const srs = word.srs;
  let interval = 0;
  if (grade === 'hard') interval = Math.max(1, Math.round((srs.interval || 1) * 1.2));
  if (grade === 'good') interval = !srs.repetitions ? 1 : srs.repetitions === 1 ? 3 : Math.max(1, Math.round(srs.interval * srs.ease));
  if (grade === 'easy') interval = !srs.repetitions ? 3 : Math.max(2, Math.round((srs.interval || 1) * srs.ease * 1.3));
  const delay = grade === 'again' ? 10 * 60 * 1000 : interval * DAY;
  return { interval, dueAt: new Date(now.getTime() + delay).toISOString(), card: null, retrievability: null };
}

function projectedSchedule(word, grade, now = new Date()) {
  const scheduler = fsrsScheduler(state.data?.settings?.fsrsRetention);
  const rating = GRADE_TO_RATING[grade];
  if (!scheduler || !rating || !word.srs?.fsrs) return legacyProjectedSchedule(word, grade, now);
  try {
    const retrievability = Number(scheduler.get_retrievability(word.srs.fsrs, now, false)) || 0;
    const result = scheduler.next(word.srs.fsrs, now, rating);
    return {
      interval: Number(result.card.scheduled_days) || 0,
      dueAt: new Date(result.card.due).toISOString(),
      card: serializeFsrsCard(result.card),
      retrievability
    };
  } catch (error) {
    console.warn('FSRS preview failed, using the compatibility scheduler:', error);
    return legacyProjectedSchedule(word, grade, now);
  }
}

function renderFastReviewCard(review, word, progressHeader) {
  const definitions = definitionText(word, true);
  const gradeChoices = ['again', 'hard', 'good', 'easy'].map((grade, index) => {
    const schedule = projectedSchedule(word, grade);
    return `<button class="manual-grade ${grade}" data-fast-grade="${grade}"><kbd>${index + 1}</kbd><span class="fast-grade-copy"><strong>${gradeName(grade)}</strong><small>Hẹn lại ${intervalLabel(schedule.interval, grade, schedule.dueAt)}</small></span></button>`;
  }).join('');
  const answer = review.revealed ? `
    <div class="fast-answer">
      <div class="fast-answer-heading">
        <div><span>ĐÁP ÁN</span><div><strong>${escapeHtml(word.term)}</strong>${wordParts(word).map((part) => `<i class="pos-label pos-${escapeHtml(part)}">${escapeHtml(posName(part))}</i>`).join('')}</div></div>
        <p>${review.fastAnswerState === 'correct' ? 'Bạn đã nhập đúng thuật ngữ.' : 'Bạn đã chọn xem đáp án.'}</p>
      </div>
      ${reviewNoteMarkup(word)}
      <div class="fast-grade-grid">${gradeChoices}</div>
      <div class="fast-answer-footer"><span>Phím 1–4 để chuyển ngay sang từ tiếp theo</span>${!review.quick ? '<button class="deep-practice-link" id="practice-deep">Chưa chắc? Luyện sâu với AI →</button>' : ''}</div>
    </div>` : `
    <form class="fast-term-form ${review.fastAnswerState === 'wrong' ? 'has-error' : ''}" id="fast-answer-form">
      <label for="fast-term-input">THUẬT NGỮ TIẾNG ANH</label>
      <div class="fast-term-control"><input id="fast-term-input" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(review.draft.term || '')}" placeholder="Nhập thuật ngữ bạn nhớ..." aria-invalid="${review.fastAnswerState === 'wrong'}"><button type="submit">Kiểm tra <kbd>Enter</kbd></button></div>
      ${review.fastAnswerState === 'wrong' ? '<p class="fast-term-error">Chưa đúng. Hãy thử lại một lần nữa nhé.</p>' : '<p class="fast-term-hint">Không phân biệt chữ hoa, chữ thường và khoảng trắng thừa.</p>'}
      <button type="button" class="fast-show-answer" id="reveal-fast-answer">Không nhớ · xem đáp án</button>
    </form>`;
  $('#review-stage').innerHTML = `<div class="review-session fast-review-session">${progressHeader}<div class="review-question-card fast-recall-card"><div class="recall-meta"><span>NHỚ TỪ TIẾNG ANH</span><div><b>${review.quick ? 'Phiên 5 phút' : 'Ôn nhanh'} · không gọi AI</b>${!review.quick && !review.revealed ? '<button class="regenerate-challenge" id="practice-deep">Ôn sâu từ này</button>' : ''}</div></div><div class="fast-cue-panel"><div class="fast-cue-mark">✦</div><div><p class="fast-prompt-label">NGHĨA ĐÃ LƯU</p><blockquote>${escapeHtml(definitions)}</blockquote></div></div>${answer}</div></div>`;
  updateQuickTimer();
  if (!review.revealed) setTimeout(() => {
    const input = $('#fast-term-input');
    input?.focus();
    if (review.fastAnswerState === 'wrong') input?.setSelectionRange(0, input.value.length);
  }, 0);
}

async function submitFastAnswer(event) {
  event.preventDefault();
  const review = state.review;
  if (!review?.queue.length || review.revealed) return;
  const word = state.data.words.find((item) => item.id === review.queue[0]);
  if (!word) return;
  const term = $('#fast-term-input').value;
  review.draft = { ...review.draft, term };
  if (!term.trim()) {
    showToast('Hãy nhập thuật ngữ tiếng Anh.', '!', true);
    $('#fast-term-input').focus();
    return;
  }
  if (normalizedTerm(term) === normalizedTerm(word.term)) {
    review.fastAnswerState = 'correct';
    review.revealed = true;
  } else {
    review.fastAnswerState = 'wrong';
  }
  await persistReviewSession();
  renderReviewCard();
}

async function revealFastAnswer() {
  const review = state.review;
  if (!review?.queue.length || review.revealed) return;
  review.fastAnswerState = 'revealed';
  review.revealed = true;
  await persistReviewSession();
  renderReviewCard();
}

function renderReviewCard() {
  const review = state.review;
  if (!review || !review.queue.length) { renderReviewComplete(); return; }
  const word = state.data.words.find((item) => item.id === review.queue[0]);
  if (!word) { review.queue.shift(); persistReviewSession(); renderReviewCard(); return; }
  const progress = Math.min(100, (review.answered / Math.max(1, review.total)) * 100);
  const deepMode = review.mode === 'deep' || review.deepWords.has(word.id);
  const progressHeader = `<div class="review-progress"><div class="progress-track"><i style="width:${progress}%"></i></div><span>Từ ${Math.min(review.answered + 1, review.total)} / ${review.total}</span>${review.quick ? '<strong class="quick-timer" id="quick-timer">05:00</strong>' : ''}</div>`;
  if (!deepMode) {
    renderFastReviewCard(review, word, progressHeader);
    return;
  }
  if (!review.challenge && !review.challengeLoading && !review.challengeError) loadReviewChallenge(review, word);
  const result = review.result;
  const challenge = review.challenge;
  const nextReviewSchedule = result?.recommended_grade ? projectedSchedule(word, result.recommended_grade) : null;
  if (!challenge) {
    const loadingContent = review.challengeError
      ? `<div class="challenge-state error"><span>!</span><h2>Chưa tạo được câu hỏi</h2><p>${escapeHtml(review.challengeError)}</p><button class="soft-btn" id="retry-challenge">Thử lại</button></div>`
      : '<div class="challenge-state"><i class="spinner"></i><h2>Đang chuẩn bị một câu cho bạn…</h2><p>Lần đầu nạp model cục bộ có thể mất một chút thời gian.</p></div>';
    $('#review-stage').innerHTML = `<div class="review-session">${progressHeader}<div class="review-question-card">${loadingContent}</div></div>`;
    updateQuickTimer();
    return;
  }
  const savedDefinitions = definitionText(word, true);
  const provider = result?.provider || challenge.provider || 'manual';
  const providerLabel = aiProviderName(provider);
  const gradeChoices = result?.manual ? ['again', 'hard', 'good', 'easy'].map((grade) => {
    const schedule = projectedSchedule(word, grade);
    return `<button class="manual-grade ${grade}" data-manual-grade="${grade}"><strong>${gradeName(grade)}</strong><span>${intervalLabel(schedule.interval, grade, schedule.dueAt)}</span></button>`;
  }).join('') : '';
  const feedback = result ? `
    <section class="gemini-feedback recall-feedback">
      <div class="feedback-reveal"><span>TỪ VỪA ĐƯỢC GIẤU</span><strong>${escapeHtml(word.term)}</strong>${wordParts(word).map((part) => `<i class="pos-label pos-${escapeHtml(part)}">${escapeHtml(posName(part))}</i>`).join('')}</div>
      <div class="feedback-title"><div><span>✦ ${escapeHtml(providerLabel.toUpperCase())} NHẬN XÉT</span><h3>${escapeHtml(result.overall_feedback)}</h3></div><div class="score-pair"><b>${Number.isFinite(result.meaning_score) ? `${result.meaning_score}<small>/10</small>` : '—'}<em>Đúng ý</em></b><b>${Number.isFinite(result.sentence_score) ? `${result.sentence_score}<small>/10</small>` : '—'}<em>Tiếng Anh</em></b></div></div>
      <div class="feedback-grid"><article><strong>Ý nghĩa & từ mục tiêu</strong><p>${escapeHtml(result.meaning_feedback)}</p><small>${escapeHtml(savedDefinitions)}</small></article><article><strong>Ngữ pháp & độ tự nhiên</strong><p>${escapeHtml(result.sentence_feedback)}</p><small>${result.corrected_sentence || challenge.suggested_answer ? `Câu đề xuất: ${escapeHtml(result.corrected_sentence || challenge.suggested_answer)}` : 'Hãy đối chiếu lại câu bạn vừa viết.'}</small></article></div>
      ${reviewNoteMarkup(word)}
      ${result.manual ? `<div class="manual-grade-panel"><span>TỰ ĐÁNH GIÁ MỨC ĐỘ NHỚ</span><div>${gradeChoices}</div></div>` : `<div class="feedback-footer"><span>Đánh giá từ vựng: <b>${gradeName(result.recommended_grade)}</b> · FSRS hẹn lại sau ${intervalLabel(nextReviewSchedule.interval, result.recommended_grade, nextReviewSchedule.dueAt)}</span><button class="primary-btn" id="continue-review">Câu tiếp theo →</button></div>`}
      <p class="ai-disclaimer">Lịch ôn chỉ dựa trên điểm Đúng ý. Điểm Tiếng Anh được lưu để góp ý và hoàn toàn không ảnh hưởng Again / Hard / Good / Easy.</p>
    </section>` : '';
  const sourceNote = challenge.fromCache ? 'Câu hỏi đã chuẩn bị sẵn' : challenge.manual ? 'Chế độ tự đánh giá' : `Tạo bởi ${aiProviderName(challenge.provider)}`;
  $('#review-stage').innerHTML = `<div class="review-session">${progressHeader}<div class="review-question-card recall-card"><div class="recall-meta"><span>DỊCH SANG TIẾNG ANH</span><div><b>${escapeHtml(sourceNote)} · không có gợi ý từ</b>${!result && !review.checking ? '<button class="regenerate-challenge" id="regenerate-challenge">Tạo câu khác</button>' : ''}</div></div><blockquote>${escapeHtml(challenge.vietnamese_sentence)}</blockquote><p class="recall-instruction">Hãy tự nhận ra từ đang được ôn và dùng nó trong bản dịch của bạn.</p><form class="answer-form recall-answer-form" id="ai-answer-form"><label><span>CÂU TRẢ LỜI CỦA BẠN</span><textarea id="review-sentence" rows="4" maxlength="1000" placeholder="Write the full sentence in English..." ${result ? 'disabled' : ''}>${escapeHtml(review.draft.sentence)}</textarea></label>${!result ? `<div class="answer-submit"><span>${challenge.manual ? 'Milim sẽ hiện từ mục tiêu để bạn tự đánh giá.' : 'AI sẽ kiểm tra đúng ý, từ mục tiêu và độ tự nhiên.'}</span><button class="primary-btn" type="submit" ${review.checking ? 'disabled' : ''}>${review.checking ? '<i class="spinner"></i> Đang chấm...' : 'Chấm câu trả lời ✦'}</button></div>` : ''}</form></div>${feedback}</div>`;
  updateQuickTimer();
}

async function loadReviewChallenge(review, word) {
  if (review.challengeLoading) return;
  const cached = cachedChallenge(word);
  if (cached) {
    review.challenge = cached;
    await persistReviewSession();
    prefetchChallenge(word);
    renderReviewCard();
    return;
  }
  review.challengeLoading = true;
  review.challengeError = '';
  renderReviewCard();
  try {
    const challenge = await api.generateAIChallenge({
      word: word.term,
      partOfSpeech: wordParts(word).map(posName).join(', '),
      savedDefinition: definitionText(word, true)
    });
    if (state.review !== review || review.queue[0] !== word.id) return;
    review.challenge = challenge;
    review.challengeLoading = false;
    cacheChallenge(word, challenge);
    await persistReviewSession();
    prefetchChallenge(word);
    renderReviewCard();
  } catch (error) {
    if (state.review !== review) return;
    review.challengeLoading = false;
    review.challengeError = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '') || 'Hãy thử lại sau.';
    renderReviewCard();
  }
}

async function submitAIAnswer(event) {
  event.preventDefault();
  const review = state.review;
  if (!review || review.checking || review.result) return;
  const sentence = $('#review-sentence').value.trim();
  review.draft = { sentence };
  if (!sentence) {
    showToast('Hãy viết lại câu bằng tiếng Anh.', '!', true);
    $('#review-sentence').focus();
    return;
  }
  const word = state.data.words.find((item) => item.id === review.queue[0]);
  if (!word) return;
  review.checking = true;
  renderReviewCard();
  try {
    const result = await api.checkAIAnswer({
      mode: 'recall',
      word: word.term,
      partOfSpeech: wordParts(word).map(posName).join(', '),
      savedDefinition: definitionText(word, true),
      vietnamesePrompt: review.challenge.vietnamese_sentence,
      suggestedAnswer: review.challenge.suggested_answer,
      sentence
    });
    if (state.review !== review) return;
    review.result = result;
    review.checking = false;
    await persistReviewSession();
    renderReviewCard();
  } catch (error) {
    if (state.review !== review) return;
    review.checking = false;
    renderReviewCard();
    const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
    showToast(message || 'Chưa thể chấm bằng AI. Bạn có thể chuyển sang tự đánh giá.', '!', true);
  }
}

function updateQuickTimer() {
  const review = state.review;
  if (!review?.quick || !review.endsAt) return;
  const remaining = Math.max(0, review.endsAt - Date.now());
  const timer = $('#quick-timer');
  if (timer) {
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (remaining <= 0 && review.queue.length) {
    review.queue = [];
    persistReviewSession();
    renderReviewComplete();
  }
}

function applySrs(word, grade, metadata = {}) {
  const now = new Date();
  const srs = word.srs;
  const next = projectedSchedule(word, grade, now);
  if (next.card) {
    srs.fsrs = next.card;
    srs.algorithm = FSRS_ALGORITHM;
    srs.repetitions = next.card.reps;
    srs.lapses = next.card.lapses;
  } else {
    srs.fsrs = null;
    srs.algorithm = 'compatibility';
    srs.repetitions = grade === 'again' ? 0 : (srs.repetitions || 0) + 1;
    if (grade === 'again') srs.lapses = (srs.lapses || 0) + 1;
  }
  srs.interval = next.interval;
  srs.dueAt = next.dueAt;
  srs.lastReviewedAt = now.toISOString();
  srs.history.push({
    at: now.toISOString(),
    grade,
    interval: next.interval,
    dueAt: next.dueAt,
    scheduledMinutes: Math.max(1, Math.round((new Date(next.dueAt) - now) / 60000)),
    stability: next.card?.stability ?? null,
    difficulty: next.card?.difficulty ?? null,
    retrievability: next.retrievability,
    algorithm: next.card ? FSRS_ALGORITHM : 'compatibility',
    ...metadata
  });
}

async function gradeCurrent(grade, result = null) {
  const review = state.review;
  if (!review?.queue.length) return;
  const id = review.queue.shift();
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return renderReviewCard();
  const wasDeep = review.mode === 'deep' || review.deepWords.has(id);
  applySrs(word, grade, result ? {
    meaningScore: Number.isFinite(result.meaning_score) ? result.meaning_score : null,
    sentenceScore: Number.isFinite(result.sentence_score) ? result.sentence_score : null,
    aiProvider: result.provider || 'manual',
    reviewMode: 'deep'
  } : { reviewMode: wasDeep ? 'deep' : 'fast' });
  updateScriptKnowledge(word.term, globalThis.MilimAbility?.reviewObservation(grade) ?? 0.5, 'review');
  if (result) {
    const provider = ['local', 'gemini', 'manual'].includes(result.provider) ? result.provider : 'manual';
    state.data.settings.aiUsage[provider] = (Number(state.data.settings.aiUsage[provider]) || 0) + 1;
  }
  review.answered += 1;
  if (grade === 'good' || grade === 'easy') review.correct += 1;
  const shouldEscalate = !review.quick && !wasDeep && (grade === 'again' || grade === 'hard');
  if ((grade === 'again' || shouldEscalate) && !review.requeued.has(id)) {
    review.requeued.add(id);
    review.queue.push(id);
    review.total += 1;
    if (shouldEscalate) review.deepWords.add(id);
  }
  if (grade === 'good' || grade === 'easy') review.deepWords.delete(id);
  review.result = null;
  review.revealed = false;
  review.fastAnswerState = '';
  review.draft = { sentence: '', term: '' };
  review.challenge = null;
  review.challengeLoading = false;
  review.challengeError = '';
  state.data.reviewSession = serializeReviewSession(review);
  await persist();
  renderGlobal();
  renderReviewCard();
}

function renderReviewComplete() {
  const review = state.review;
  const accuracy = review?.answered ? Math.round((review.correct / review.answered) * 100) : 0;
  $('#review-stage').innerHTML = `<div class="review-stage-card"><div class="review-complete"><img src="../assets/milim-icon-rounded.png" alt="Mèo milim"><h2>Hoàn thành phiên ôn</h2><p>Bạn vừa cho ký ức thêm một cơ hội ở lại. Milim đã sắp lịch gặp lại từng từ.</p><div class="review-summary"><span>${review?.answered || 0} lượt ôn</span><span>${accuracy}% nhớ tốt</span></div><button class="primary-btn" id="finish-review">Về trang hôm nay</button></div></div>`;
  $('#review-exit').classList.add('hidden');
}

async function endReview() {
  state.review = null;
  state.data.reviewSession = null;
  await persist();
  api.stopLocalAI?.().catch(() => {});
  navigate('home');
}

function renderStats() {
  const total = state.data.words.length;
  const mastered = state.data.words.filter((word) => mastery(word) === 'mastered').length;
  const reviewCount = state.data.words.reduce((count, word) => count + word.srs.history.length, 0);
  const currentStreak = streak();
  const bestStreak = longestStreak();
  const regularStats = [
    ['♡', total, 'Tổng từ đã lưu'], ['✦', mastered, 'Từ đã ghi nhớ'], ['↻', reviewCount, 'Lượt ôn tập']
  ].map(([icon, value, label]) => `<article class="stat-card"><i>${icon}</i><strong>${value}</strong><span>${label}</span></article>`).join('');
  $('#stat-cards').innerHTML = `${regularStats}<article class="stat-card streak-stat-card"><i>🔥</i><strong>${currentStreak}</strong><span>Chuỗi hiện tại · dài nhất ${bestStreak} ngày</span></article>`;
  const usage = state.data.settings.aiUsage;
  const aiTotal = (usage.local || 0) + (usage.gemini || 0) + (usage.manual || 0);
  $('#ai-stats-strip').innerHTML = `<div><span>AI & TỰ ĐÁNH GIÁ</span><strong>${aiTotal} lượt chấm</strong></div><p><b>${usage.local || 0}</b> cục bộ</p><p><b>${usage.gemini || 0}</b> Gemini</p><p><b>${usage.manual || 0}</b> tự đánh giá</p>`;

  const days = Array.from({ length: 7 }, (_, index) => new Date(Date.now() - (6 - index) * DAY));
  const counts = days.map((date) => {
    const key = localDate(date);
    return {
      key,
      added: state.data.words.filter((word) => wordDate(word) === key).length,
      reviewed: state.data.words.reduce((count, word) => count + word.srs.history.filter((item) => localDate(item.at) === key).length, 0)
    };
  });
  const max = Math.max(1, ...counts.flatMap((item) => [item.added, item.reviewed]));
  $('#weekly-chart').innerHTML = counts.map((item) => `<div class="chart-day"><div class="bar-pair" title="${item.added} thêm · ${item.reviewed} ôn"><i style="height:${Math.max(3, item.added / max * 145)}px"></i><i style="height:${Math.max(3, item.reviewed / max * 145)}px"></i></div><span>${new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(fromDateKey(item.key))}</span></div>`).join('');

  const levels = ['new', 'learning', 'mastered'];
  const names = ['Từ mới', 'Đang học', 'Đã ghi nhớ'];
  $('#mastery-breakdown').innerHTML = levels.map((level, index) => {
    const count = state.data.words.filter((word) => mastery(word) === level).length;
    const percent = total ? Math.round(count / total * 100) : 0;
    return `<div class="mastery-item"><div><span>${names[index]}</span><b>${count} · ${percent}%</b></div><div class="progress-track"><i style="width:${percent}%"></i></div></div>`;
  }).join('');

  const today = fromDateKey(localDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  const heatmapStart = new Date(today.getTime() - (15 * 7 + mondayOffset) * DAY);
  const heatmapDays = Array.from({ length: 16 * 7 }, (_, index) => new Date(heatmapStart.getTime() + index * DAY));
  const heatmapActivity = heatmapDays.map((date) => {
    const key = localDate(date);
    const added = state.data.words.filter((word) => wordDate(word) === key).length;
    const reviewed = state.data.words.reduce((sum, word) => sum + word.srs.history.filter((item) => localDate(item.at) === key).length, 0);
    return { date, key, count: added + reviewed, future: date.getTime() > today.getTime() };
  });
  const heatmapMax = Math.max(1, ...heatmapActivity.map((item) => item.count));
  $('#calendar-heatmap').innerHTML = heatmapActivity.map((item) => {
    const level = item.future || item.count === 0 ? 0 : Math.max(1, Math.ceil(item.count / heatmapMax * 4));
    const label = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(item.date);
    return `<i class="heat-cell level-${level} ${item.future ? 'future' : ''}" title="${label} · ${item.count} hoạt động"></i>`;
  }).join('');

  const difficult = [...state.data.words].filter((word) => word.srs.lapses > 0).sort((a, b) => b.srs.lapses - a.srs.lapses).slice(0, 5);
  $('#difficult-list').innerHTML = difficult.length ? difficult.map((word) => wordRow(word, { review: true })).join('') : emptyState('Chưa có từ khó', 'Khi một từ hay bị quên, milim sẽ nhẹ nhàng đặt nó ở đây.');
  renderGlobal();
}

function renderStreakCalendar() {
  const counts = activityCountByDate();
  const metrics = activityMetricsByDate();
  const goal = state.data.settings.dailyGoal;
  const today = fromDateKey(localDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - (11 * 7 + mondayOffset) * DAY);
  const days = Array.from({ length: 12 * 7 }, (_, index) => new Date(start.getTime() + index * DAY));
  const max = Math.max(goal, ...Object.values(counts));
  const week = weeklyGoalStats();
  const totalPoints = Object.values(metrics).reduce((sum, item) => sum + item.points, 0);
  $('#streak-daily-goal').value = String(goal);
  const growth = globalThis.MilimTree?.nextGrowth?.(streak());
  const growthMessage = growth?.target ? `Còn ${growth.remaining} ngày đạt mục tiêu để cây lên “${growth.target.label}”.` : 'Cây học tập đã đạt giai đoạn cao nhất.';
  $('#streak-calendar-caption').textContent = `Một ngày được nối chuỗi khi đạt ít nhất ${goal} điểm. ${growthMessage}`;
  $('#streak-modal-summary').innerHTML = `<div><strong>${streak()}</strong><span>ngày hiện tại</span></div><div><strong>${longestStreak()}</strong><span>dài nhất</span></div><div><strong>${week.completed}/7</strong><span>tuần này</span></div><div><strong>${totalPoints}</strong><span>tổng điểm học</span></div>`;
  $('#streak-calendar').innerHTML = `
    <div class="streak-calendar-weekdays">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="streak-calendar-grid">
      ${days.map((date) => {
        const key = localDate(date);
        const count = counts[key] || 0;
        const level = count ? Math.max(1, Math.ceil(count / max * 4)) : 0;
        const label = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
        return `<button type="button" class="streak-calendar-day level-${level} ${count >= goal ? 'achieved' : count ? 'partial' : ''} ${key === localDate() ? 'today' : ''} ${key === state.selectedStreakDate ? 'selected' : ''}" data-streak-date="${key}" title="${label} · ${count}/${goal} điểm"><span>${date.getDate()}</span>${count ? `<b>${count}</b>` : ''}</button>`;
      }).join('')}
    </div>`;
  renderStreakDayDetail(state.selectedStreakDate || localDate());
}

function renderStreakDayDetail(key) {
  state.selectedStreakDate = key;
  const metric = activityMetricsByDate()[key] || { points: 0, added: 0, reviewed: 0, speaking: 0, writing: 0 };
  const goal = state.data.settings.dailyGoal;
  const label = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fromDateKey(key));
  const activities = [
    metric.reviewed ? `${metric.reviewed} lượt ôn × 2` : '',
    metric.added ? `${metric.added} từ mới × 1` : '',
    metric.speaking ? `${metric.speaking} lỗi speaking × 2` : '',
    metric.writing ? `${metric.writing} bài Writing × 5` : ''
  ].filter(Boolean);
  $('#streak-day-detail').innerHTML = `<div><span>${escapeHtml(label)}</span><strong>${metric.points}/${goal} điểm · ${metric.points >= goal ? 'Đã nối chuỗi' : metric.points ? 'Chưa đạt mục tiêu' : 'Chưa học'}</strong></div><p>${activities.length ? escapeHtml(activities.join(' · ')) : 'Ngày này chưa có hoạt động học được ghi lại.'}</p>`;
  $$('.streak-calendar-day').forEach((node) => node.classList.toggle('selected', node.dataset.streakDate === key));
}

function openStreakCalendar() {
  state.selectedStreakDate = localDate();
  renderStreakCalendar();
  $('#streak-modal').classList.remove('hidden');
}

function closeStreakCalendar() {
  $('#streak-modal').classList.add('hidden');
}

function renderSettings() {
  $('#notification-toggle').checked = Boolean(state.data.settings.notifications);
  $('#notification-time').value = state.data.settings.notificationTime || '19:30';
  const retention = Math.round(normalizedRetention(state.data.settings.fsrsRetention) * 100);
  $('#retention-input').value = String(retention);
  $('#retention-value').textContent = `${retention}%`;
  $('#ai-provider').value = state.data.settings.aiProvider;
  $('#ai-resource-mode').value = state.data.settings.aiResourceMode;
  $('#ai-idle-minutes').value = String(state.data.settings.aiIdleMinutes);
  const usage = state.data.settings.aiUsage;
  $('#ai-usage').innerHTML = `<span><b>${usage.local || 0}</b> lượt chấm cục bộ</span><span><b>${usage.gemini || 0}</b> lượt Gemini</span><span><b>${usage.manual || 0}</b> lượt tự đánh giá</span>`;
  refreshAIStatus();
  refreshUpdateStatus();
  renderGlobal();
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function renderLocalAIStatus(local) {
  if (!local) return;
  const statusNode = $('#local-ai-status');
  const modelName = $('#local-ai-model-name');
  const sizeNode = $('#local-ai-size');
  const progress = $('#local-ai-progress');
  const progressBar = $('#local-ai-progress-bar');
  const action = $('#local-ai-action');
  const test = $('#local-ai-test');
  const stop = $('#local-ai-stop');
  const remove = $('#local-ai-delete');
  if (!statusNode || !action) return;
  const busy = ['downloading', 'verifying', 'extracting'].includes(local.state);
  const installed = ['ready', 'loading', 'running', 'generating'].includes(local.state);
  modelName.textContent = local.model?.name || 'Qwen3 4B · Q4_K_M';
  sizeNode.textContent = formatBytes(local.model?.size || 2497280256);
  statusNode.textContent = local.message || 'Đang đọc trạng thái AI cục bộ…';
  statusNode.classList.toggle('update-error', local.state === 'error');
  progress.classList.toggle('hidden', !(busy || local.state === 'paused'));
  progressBar.style.width = `${Math.max(0, Math.min(100, Number(local.percent) || 0))}%`;
  action.classList.toggle('hidden', installed || ['verifying', 'extracting'].includes(local.state));
  action.disabled = false;
  action.textContent = local.state === 'downloading' ? 'Tạm dừng tải'
    : local.state === 'paused' ? 'Tiếp tục tải'
      : local.state === 'error' ? 'Thử tải lại'
        : 'Tải AI cục bộ · 2.33 GB';
  test.classList.toggle('hidden', !installed);
  test.disabled = ['loading', 'generating'].includes(local.state);
  stop.classList.toggle('hidden', !['loading', 'running', 'generating'].includes(local.state));
  remove.classList.toggle('hidden', !installed && local.state !== 'paused' && local.state !== 'error');
}

async function refreshAIStatus() {
  try {
    state.aiStatus = await api.aiStatus();
    state.geminiConfigured = Boolean(state.aiStatus.gemini?.configured);
    state.geminiModel = state.aiStatus.gemini?.model || 'gemini-2.5-flash';
    renderLocalAIStatus(state.aiStatus.local);
    const statusNode = $('#gemini-status');
    if (statusNode) {
      statusNode.textContent = state.geminiConfigured ? `Đã kết nối · ${state.geminiModel}` : 'Chưa có API key · không ảnh hưởng AI cục bộ.';
      statusNode.classList.toggle('connected', state.geminiConfigured);
    }
  } catch {
    renderLocalAIStatus({ state: 'error', message: 'Không thể đọc trạng thái AI cục bộ.', model: { name: 'Qwen3 4B · Q4_K_M', size: 2497280256 } });
  }
}

function renderUpdateStatus(status) {
  if (!status) return;
  const previousState = state.updateStatus?.state;
  state.updateStatus = status;
  const statusNode = $('#update-status');
  const button = $('#check-update-btn');
  const progress = $('#update-progress');
  const progressBar = $('#update-progress-bar');
  if (!statusNode || !button || !progress || !progressBar) return;
  statusNode.textContent = status.message || `Phiên bản hiện tại · ${status.currentVersion || ''}`;
  statusNode.classList.toggle('update-error', status.state === 'error');
  progress.classList.toggle('hidden', !['downloading', 'downloaded'].includes(status.state));
  progressBar.style.width = `${Math.max(0, Math.min(100, Number(status.percent) || 0))}%`;
  button.disabled = ['checking', 'downloading'].includes(status.state);
  button.textContent = status.state === 'downloaded' ? `Khởi động lại & cài ${status.version}`
    : status.state === 'checking' ? 'Đang kiểm tra...'
      : status.state === 'downloading' ? `Đang tải ${status.percent || 0}%`
        : 'Kiểm tra cập nhật';
  if (status.state === 'downloaded' && previousState && previousState !== 'downloaded') showToast(`Milim ${status.version} đã tải xong. Sẵn sàng cập nhật.`);
}

async function refreshUpdateStatus() {
  try { renderUpdateStatus(await api.updateStatus()); }
  catch { renderUpdateStatus({ state: 'error', message: 'Không thể đọc trạng thái cập nhật.' }); }
}

async function refreshGeminiStatus() {
  const statusNode = $('#gemini-status');
  try {
    const status = await api.geminiStatus();
    state.geminiConfigured = Boolean(status.configured);
    state.geminiModel = status.model || 'gemini-2.5-flash';
    statusNode.textContent = status.configured ? `Đã kết nối · ${state.geminiModel}` : 'Chưa có API key. Bạn có thể tạo key trong Google AI Studio.';
    statusNode.classList.toggle('connected', status.configured);
  } catch {
    statusNode.textContent = 'Không thể đọc trạng thái Gemini.';
  }
}

function renderCurrentView() {
  if (state.view === 'home') renderHome();
  if (state.view === 'add') renderRecentAdded();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'review') renderReviewWelcome();
  if (state.view === 'script') renderScript();
  if (state.view === 'speaking') renderSpeaking();
  if (state.view === 'stats') renderStats();
  if (state.view === 'settings') renderSettings();
  renderGlobal();
}

async function checkNotification() {
  const settings = state.data?.settings;
  if (!settings?.notifications || settings.lastNotificationDate === localDate() || !dueWords().length) return;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (current < settings.notificationTime) return;
  const sent = await api.notify({ title: 'milim nhớ bạn ♡', body: `${dueWords().length} từ đang đợi một lần gặp lại ngắn thôi.` });
  if (sent) {
    settings.lastNotificationDate = localDate();
    await persist();
  }
}

function bindEvents() {
  $('#minimize-btn').addEventListener('click', api.minimize);
  $('#maximize-btn').addEventListener('click', api.maximize);
  $('#close-btn').addEventListener('click', api.close);

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-view]');
    const go = event.target.closest('[data-go]');
    if (nav) navigate(nav.dataset.view);
    if (go) navigate(go.dataset.go);

    if (event.target.closest('.weekly-streak-card, .sidebar-bottom .streak-card')) openStreakCalendar();
    const streakDay = event.target.closest('[data-streak-date]');
    if (streakDay) renderStreakDayDetail(streakDay.dataset.streakDate);

    const pos = event.target.closest('[data-pos]');
    if (pos) {
      toggleSelectedPos(pos.dataset.pos);
    }

    const deck = event.target.closest('[data-deck-date]');
    if (deck) { state.selectedDate = deck.dataset.deckDate; navigate('library'); }

    const date = event.target.closest('[data-date]');
    if (date) { state.selectedDate = date.dataset.date; renderLibrary(); }

    const reviewDate = event.target.closest('[data-review-date]');
    if (reviewDate) {
      const words = groupByDate()[reviewDate.dataset.reviewDate] || [];
      startReview(words, `Bộ từ · ${dateLabel(reviewDate.dataset.reviewDate)}`);
    }

    const wordRowNode = event.target.closest('[data-word-id]');
    const action = event.target.closest('[data-action]');
    if (wordRowNode && action) {
      const id = wordRowNode.dataset.wordId;
      if (action.dataset.action === 'edit') editWord(id);
      if (action.dataset.action === 'delete') deleteWord(id);
      if (action.dataset.action === 'history') showWordHistory(id);
      if (action.dataset.action === 'review-one') {
        const word = state.data.words.find((item) => item.id === id);
        if (word) startReview([word], `Ôn riêng · ${word.term}`);
      }
    }

    const speakingRow = event.target.closest('[data-speaking-id]');
    const speakingAction = event.target.closest('[data-speaking-action]');
    if (speakingRow && speakingAction?.dataset.speakingAction === 'delete') deleteSpeakingError(speakingRow.dataset.speakingId);

    const writingTask = event.target.closest('[data-writing-task]');
    if (writingTask && writingTask.dataset.writingTask !== state.writingTask) {
      state.writingTask = writingTask.dataset.writingTask;
      state.editingWritingTypeId = null;
      resetWritingForm();
    }
    const writingTypeChip = event.target.closest('[data-writing-type-id]');
    const writingTypeAction = event.target.closest('[data-writing-type-action]');
    if (writingTypeChip && writingTypeAction) {
      if (writingTypeAction.dataset.writingTypeAction === 'edit') editWritingType(writingTypeChip.dataset.writingTypeId);
      if (writingTypeAction.dataset.writingTypeAction === 'delete') deleteWritingType(writingTypeChip.dataset.writingTypeId);
    }
    const writingEntry = event.target.closest('[data-writing-entry-id]');
    const writingEntryAction = event.target.closest('[data-writing-entry-action]');
    if (writingEntry && writingEntryAction) {
      if (writingEntryAction.dataset.writingEntryAction === 'edit') editWritingEntry(writingEntry.dataset.writingEntryId);
      if (writingEntryAction.dataset.writingEntryAction === 'delete') deleteWritingEntry(writingEntry.dataset.writingEntryId);
    }
    if (event.target.closest('#new-writing-entry')) {
      resetWritingForm(false);
      state.writingEditorOpen = true;
      renderWriting();
      $('#writing-content').focus();
    }
    if (event.target.closest('#manage-writing-types')) {
      state.writingManageTypesOpen = !state.writingManageTypesOpen;
      state.editingWritingTypeId = null;
      $('#writing-type-input').value = '';
      renderWriting();
    }
    if (event.target.closest('#save-writing-type')) saveWritingType();
    if (event.target.closest('#cancel-writing-type')) {
      state.editingWritingTypeId = null;
      $('#writing-type-input').value = '';
      $('#save-writing-type').textContent = 'Thêm dạng bài';
      $('#cancel-writing-type').classList.add('hidden');
    }
    if (event.target.closest('#cancel-writing-edit')) resetWritingForm();
    if (event.target.closest('#add-writing-error')) {
      syncWritingErrorsFromDom();
      state.writingErrors.push({ id: uid(), mistake: '', correction: '' });
      renderWritingErrors();
      $$('#writing-errors [data-writing-error-field="mistake"]').at(-1)?.focus();
    }
    const writingErrorRemove = event.target.closest('[data-writing-error-remove]');
    if (writingErrorRemove) {
      syncWritingErrorsFromDom();
      const row = writingErrorRemove.closest('[data-writing-error-id]');
      state.writingErrors = state.writingErrors.filter((item) => item.id !== row.dataset.writingErrorId);
      renderWritingErrors();
    }
    if (event.target.closest('#upload-writing-image')) setWritingImage(() => api.pickWritingImage(), event.target.closest('button'));
    if (event.target.closest('#paste-writing-image')) setWritingImage(() => api.readWritingClipboardImage(), event.target.closest('button'));
    if (event.target.closest('#capture-writing-screen')) setWritingImage(() => api.captureWritingScreen(), event.target.closest('button'));
    if (event.target.closest('#remove-writing-image')) { state.writingImage = ''; renderWritingImage(); }

    if (event.target.closest('#start-due-review')) startReview(dueWords(), 'Ôn nhanh từ đến hạn', { mode: 'fast' });
    if (event.target.closest('#start-deep-review')) startReview(dueWords(), 'Ôn sâu bằng AI', { mode: 'deep' });
    if (event.target.closest('#start-overdue-review')) startReview(overdueWords(), 'Ôn nhanh từ quá hạn', { mode: 'fast' });
    if (event.target.closest('#start-quick-review')) startQuickReview();
    if (event.target.closest('#resume-review') && restoreReviewSession()) {
      navigate('review');
      $('#review-title').textContent = state.review.title;
      $('#review-exit').classList.remove('hidden');
      renderReviewCard();
    }
    if (event.target.closest('#continue-review') && state.review?.result) gradeCurrent(state.review.result.recommended_grade, state.review.result);
    if (event.target.closest('#reveal-fast-answer') && state.review) revealFastAnswer();
    const fastGrade = event.target.closest('[data-fast-grade]');
    if (fastGrade && state.review?.revealed) gradeCurrent(fastGrade.dataset.fastGrade);
    if (event.target.closest('#practice-deep') && state.review?.queue.length) {
      state.review.deepWords.add(state.review.queue[0]);
      state.review.revealed = false;
      state.review.fastAnswerState = '';
      state.review.draft = { sentence: '', term: '' };
      persistReviewSession();
      renderReviewCard();
    }
    const manualGrade = event.target.closest('[data-manual-grade]');
    if (manualGrade && state.review?.result?.manual) gradeCurrent(manualGrade.dataset.manualGrade, state.review.result);
    if (event.target.closest('#retry-challenge') && state.review) {
      state.review.challengeError = '';
      renderReviewCard();
    }
    if (event.target.closest('#regenerate-challenge') && state.review?.challenge) {
      const word = state.data.words.find((item) => item.id === state.review.queue[0]);
      if (word) {
        word.recallCache = (word.recallCache || []).filter((item) => item.vietnamese_sentence !== state.review.challenge.vietnamese_sentence);
      }
      state.review.challenge = null;
      state.review.challengeError = '';
      state.review.draft = { sentence: '', term: '' };
      persistReviewSession();
      renderReviewCard();
    }
    if (event.target.closest('#finish-review')) endReview();

    const scriptCard = event.target.closest('[data-script-term]');
    const scriptAction = event.target.closest('[data-script-action]');
    if (scriptCard && scriptAction) {
      const term = scriptCard.dataset.scriptTerm;
      if (scriptAction.dataset.scriptAction === 'known') markScriptTerm(term, 'known');
      if (scriptAction.dataset.scriptAction === 'ignore') markScriptTerm(term, 'ignore');
      if (scriptAction.dataset.scriptAction === 'add') addScriptTerms([term]);
    }
    if (event.target.closest('#script-enrich-selected')) enrichSelectedScriptTerms();
    if (event.target.closest('#script-add-selected')) addScriptTerms(selectedScriptTerms());
    if (event.target.closest('#script-known-selected')) markSelectedScriptTermsKnown();
    if (event.target.closest('#script-assessment-start')) startAbilityAssessment();
    const abilityAnswer = event.target.closest('[data-ability-answer]');
    if (abilityAnswer) answerAbilityQuestion(abilityAnswer.dataset.abilityAnswer);
    if (event.target.closest('#ability-close, #ability-complete-close')) closeAbilityAssessment();
    if (event.target.closest('#script-reset-profile')) askConfirm(
      'Đặt lại bộ lọc script?',
      'Danh sách từ đã đánh dấu “Đã biết” và “Bỏ qua” sẽ được xóa. Từ vựng trong thư viện không bị ảnh hưởng.',
      async () => {
        state.data.settings.scriptKnownTerms = [];
        state.data.settings.scriptIgnoredTerms = [];
        await persist();
        closeConfirm();
        if ($('#script-input').value.trim()) runScriptAnalysis();
        else renderScript();
        showToast('Đã đặt lại bộ lọc phân tích script.');
      },
      'Đặt lại'
    );
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'ai-answer-form') submitAIAnswer(event);
    if (event.target.id === 'fast-answer-form') submitFastAnswer(event);
    if (event.target.id === 'script-form') { event.preventDefault(); runScriptAnalysis(); }
  });

  $('#hero-review-btn').addEventListener('click', () => navigate('review'));
  $('#home-notification').addEventListener('click', () => navigate('settings'));
  $('#word-form').addEventListener('submit', submitWord);
  $('#speaking-form').addEventListener('submit', submitSpeakingError);
  $('#writing-entry-form').addEventListener('submit', submitWritingEntry);
  $('#script-input').addEventListener('input', renderScript);
  $('#script-results').addEventListener('change', (event) => {
    if (!event.target.matches('.script-pick input[type="checkbox"]')) return;
    const term = normalizedTerm(event.target.closest('[data-script-term]')?.dataset.scriptTerm);
    if (!term) return;
    if (event.target.checked) state.scriptSelectedTerms.add(term);
    else state.scriptSelectedTerms.delete(term);
    event.target.closest('.script-result-card')?.classList.toggle('selected', event.target.checked);
    updateScriptToolbar();
  });
  $('#script-results').addEventListener('click', (event) => {
    const card = event.target.closest('.script-result-card');
    if (!card || event.target.closest('button, input, label, select, textarea, a')) return;
    const checkbox = card.querySelector('.script-pick input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('#script-results').addEventListener('input', (event) => {
    if (!event.target.matches('[data-script-definition]')) return;
    const term = normalizedTerm(event.target.closest('[data-script-term]')?.dataset.scriptTerm);
    const item = state.scriptResults.find((candidate) => normalizedTerm(candidate.term) === term);
    if (item) item.definition = event.target.value;
  });
  $('#script-level').addEventListener('change', async (event) => {
    state.data.settings.scriptLevel = event.target.value;
    await persist();
    if ($('#script-input').value.trim()) runScriptAnalysis();
    else renderScript();
    showToast(`Đã dùng hồ sơ ${event.target.options[event.target.selectedIndex].text}.`);
  });
  $('#script-filter-mode').addEventListener('change', async (event) => {
    state.data.settings.scriptFilterMode = event.target.value;
    await persist();
    if ($('#script-input').value.trim()) runScriptAnalysis();
    else renderScript();
    showToast(`Đã chọn chế độ ${event.target.options[event.target.selectedIndex].text}.`);
  });
  $('#script-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { showToast('Clipboard chưa có text để dán.', '!', true); return; }
      $('#script-input').value = text;
      runScriptAnalysis();
    } catch {
      showToast('Chưa đọc được clipboard. Bạn có thể dán bằng Ctrl+V.', '!', true);
    }
  });
  $('#script-upload').addEventListener('click', () => $('#script-file-input').click());
  $('#script-file-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Tệp phụ đề lớn hơn 2 MB. Hãy chọn đoạn ngắn hơn.', '!', true); event.target.value = ''; return; }
    try {
      $('#script-input').value = await file.text();
      runScriptAnalysis();
      showToast(`Đã đọc ${file.name}.`);
    } catch {
      showToast('Không đọc được tệp phụ đề này.', '!', true);
    } finally {
      event.target.value = '';
    }
  });
  $('#writing-content').addEventListener('input', (event) => { $('#writing-word-count').textContent = `${writingWordCount(event.target.value)} từ`; });
  $('#writing-type-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveWritingType(); } });
  $('#writing-errors').addEventListener('input', syncWritingErrorsFromDom);
  $('#writing-image-drop').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#upload-writing-image').click(); }
  });
  $('#writing-image-drop').addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
  $('#writing-image-drop').addEventListener('dragleave', (event) => event.currentTarget.classList.remove('dragging'));
  $('#writing-image-drop').addEventListener('drop', (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove('dragging');
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'));
    if (!file) { showToast('Hãy thả một tệp ảnh hợp lệ.', '!', true); return; }
    const reader = new FileReader();
    reader.onload = () => setWritingImage(() => api.normalizeWritingImage(reader.result));
    reader.readAsDataURL(file);
  });
  document.addEventListener('paste', (event) => {
    if (state.view !== 'writing') return;
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    const reader = new FileReader();
    reader.onload = () => setWritingImage(() => api.normalizeWritingImage(reader.result));
    reader.readAsDataURL(file);
  });
  $('#term-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.currentTarget.value.trim()) {
        showToast('Hãy nhập thuật ngữ trước nhé.', '!', true);
        return;
      }
      focusPosPicker();
    }
  });
  $('#term-input').addEventListener('input', () => {
    const value = normalizedTerm($('#term-input').value);
    const duplicate = value && state.data.words.find((word) => normalizedTerm(word.term) === value && word.id !== state.editingId);
    $('#duplicate-hint').textContent = duplicate ? `Đã có trong bộ ${dateLabel(wordDate(duplicate))} — milim sẽ không thêm trùng.` : '';
  });
  $('#definition-fields').addEventListener('keydown', (event) => {
    if (event.target.matches('.definition-input') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#word-form').requestSubmit(); }
  });
  $('#note-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#word-form').requestSubmit(); }
  });
  $('#definition-fields').addEventListener('focusin', () => $('.pos-picker').classList.remove('keyboard-active'));
  $('#pos-options').addEventListener('keydown', (event) => {
    const buttons = $$('#pos-options [data-pos]');
    const currentIndex = Math.max(0, buttons.findIndex((button) => button === document.activeElement));
    const shortcutIndex = /^[1-8]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (shortcutIndex >= 0 && POS_OPTIONS[shortcutIndex]) {
      event.preventDefault();
      toggleSelectedPos(POS_OPTIONS[shortcutIndex][0]);
      focusPosPicker(shortcutIndex);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      focusFirstDefinition();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      const value = buttons[currentIndex]?.dataset.pos;
      if (value) {
        toggleSelectedPos(value);
        focusPosPicker(currentIndex);
      }
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusPosPicker((currentIndex + 1) % buttons.length);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusPosPicker((currentIndex - 1 + buttons.length) % buttons.length);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      state.selectedPos = [];
      renderPosOptions();
      renderDefinitionFields();
      $('#term-input').focus();
    }
  });
  $('#speaking-form').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#speaking-form').requestSubmit(); }
  });
  $('#search-input').addEventListener('input', renderLibrary);
  $('#mastery-filter').addEventListener('change', renderLibrary);
  $('#review-exit').addEventListener('click', () => askConfirm('Kết thúc phiên ôn?', 'Tiến độ những từ đã trả lời vẫn được lưu.', () => { closeConfirm(); endReview(); }, 'Kết thúc'));

  $('#notification-toggle').addEventListener('change', async (event) => { state.data.settings.notifications = event.target.checked; await persist(); showToast(event.target.checked ? 'Đã bật nhắc ôn tập.' : 'Đã tắt nhắc ôn tập.'); });
  $('#streak-daily-goal').addEventListener('change', async (event) => {
    state.data.settings.dailyGoal = Number(event.target.value);
    await persist();
    renderStreakCalendar();
    renderHome();
    showToast(`Mục tiêu mới: ${event.target.value} điểm mỗi ngày.`);
  });
  $('#notification-time').addEventListener('change', async (event) => { state.data.settings.notificationTime = event.target.value; state.data.settings.lastNotificationDate = null; await persist(); showToast('Đã đổi giờ nhắc học.'); });
  $('#retention-input').addEventListener('input', (event) => { $('#retention-value').textContent = `${event.target.value}%`; });
  $('#retention-input').addEventListener('change', async (event) => {
    state.data.settings.fsrsRetention = normalizedRetention(Number(event.target.value) / 100);
    await persist();
    showToast(`FSRS sẽ hướng tới mức nhớ ${event.target.value}% từ lần ôn tiếp theo.`);
  });
  $('#ai-provider').addEventListener('change', async (event) => {
    state.data.settings.aiProvider = event.target.value;
    await persist();
    await refreshAIStatus();
    showToast(`Đã chọn ${event.target.options[event.target.selectedIndex].text}.`);
  });
  $('#ai-resource-mode').addEventListener('change', async (event) => {
    state.data.settings.aiResourceMode = event.target.value;
    await persist();
    showToast('Chế độ tài nguyên sẽ áp dụng từ lần nạp model tiếp theo.');
  });
  $('#ai-idle-minutes').addEventListener('change', async (event) => {
    state.data.settings.aiIdleMinutes = Number(event.target.value);
    await persist();
    showToast(`AI sẽ tự giải phóng RAM sau ${event.target.value} phút không dùng.`);
  });
  $('#local-ai-action').addEventListener('click', async () => {
    const local = state.aiStatus?.local || {};
    if (local.state === 'downloading') {
      await api.pauseLocalAIDownload();
      await refreshAIStatus();
      return;
    }
    renderLocalAIStatus({ ...local, state: 'downloading', message: 'Đang chuẩn bị tải AI cục bộ…' });
    api.downloadLocalAI()
      .then(async (status) => {
        await refreshAIStatus();
        if (['ready', 'running'].includes(status?.local?.state)) showToast('AI cục bộ đã sẵn sàng để học offline.');
      })
      .catch(async (error) => {
        await refreshAIStatus();
        const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
        showToast(message || 'Không thể tải AI cục bộ.', '!', true);
      });
  });
  $('#local-ai-test').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Đang nạp model…';
    try {
      const result = await api.testLocalAI();
      showToast(`AI cục bộ phản hồi sau ${(result.elapsedMs / 1000).toFixed(1)} giây.`);
      await refreshAIStatus();
    } catch (error) {
      const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
      showToast(message || 'AI cục bộ chưa thể phản hồi.', '!', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Kiểm tra thử';
    }
  });
  $('#local-ai-stop').addEventListener('click', async () => {
    await api.stopLocalAI();
    await refreshAIStatus();
    showToast('Đã giải phóng model khỏi RAM và VRAM.');
  });
  $('#local-ai-delete').addEventListener('click', () => askConfirm(
    'Xóa AI cục bộ?',
    'Model khoảng 2.33 GB và runtime sẽ bị xóa. Dữ liệu học, lịch FSRS và API key không bị ảnh hưởng.',
    async () => {
      closeConfirm();
      try {
        await api.deleteLocalAI();
        await refreshAIStatus();
        showToast('Đã xóa AI cục bộ khỏi máy.');
      } catch {
        showToast('Không thể xóa model lúc này.', '!', true);
      }
    },
    'Xóa model'
  ));
  $('#save-gemini-key').addEventListener('click', async () => {
    const input = $('#gemini-key-input');
    const button = $('#save-gemini-key');
    const key = input.value.trim();
    if (!key) { showToast('Hãy nhập Gemini API key.', '!', true); input.focus(); return; }
    button.disabled = true;
    button.textContent = 'Đang kiểm tra...';
    try {
      const result = await api.saveGeminiKey(key);
      input.value = '';
      state.geminiConfigured = true;
      state.geminiModel = result.model;
      await refreshAIStatus();
      showToast('Đã kết nối Gemini an toàn.');
    } catch (error) {
      const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
      showToast(message || 'Không thể kết nối Gemini.', '!', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Lưu & kiểm tra';
    }
  });
  $('#check-update-btn').addEventListener('click', async () => {
    const status = state.updateStatus;
    if (status?.state === 'downloaded') {
      askConfirm('Cài đặt bản cập nhật?', `Milim ${status.version} sẽ được cài sau khi ứng dụng khởi động lại. Dữ liệu học của bạn vẫn được giữ nguyên.`, async () => {
        closeConfirm();
        await api.installUpdate();
      }, 'Khởi động lại');
      return;
    }
    try { renderUpdateStatus(await api.checkForUpdates()); }
    catch { renderUpdateStatus({ state: 'error', message: 'Chưa thể kiểm tra cập nhật. Hãy thử lại sau.' }); }
  });
  $('#export-btn').addEventListener('click', async () => {
    try { const result = await api.exportData(state.data); if (!result.canceled) showToast('Đã tạo tệp sao lưu an toàn.'); }
    catch { showToast('Không thể tạo tệp sao lưu.', '!', true); }
  });
  $('#import-btn').addEventListener('click', () => askConfirm('Khôi phục dữ liệu?', 'Dữ liệu hiện tại sẽ được thay bằng nội dung trong tệp sao lưu bạn chọn.', async () => {
    closeConfirm();
    try {
      const result = await api.importData();
      if (!result.canceled) { state.data = normalizeData(result.data); state.selectedDate = null; state.review = null; renderCurrentView(); showToast('Đã khôi phục dữ liệu milim.'); }
    } catch { showToast('Tệp sao lưu không hợp lệ.', '!', true); }
  }, 'Chọn tệp'));

  $('#confirm-cancel').addEventListener('click', closeConfirm);
  $('#confirm-accept').addEventListener('click', () => state.confirmAction?.());
  $('#confirm-modal').addEventListener('click', (event) => { if (event.target.id === 'confirm-modal') closeConfirm(); });
  $('#history-close').addEventListener('click', closeWordHistory);
  $('#history-modal').addEventListener('click', (event) => { if (event.target.id === 'history-modal') closeWordHistory(); });
  $('#streak-calendar-close').addEventListener('click', closeStreakCalendar);
  $('#streak-modal').addEventListener('click', (event) => { if (event.target.id === 'streak-modal') closeStreakCalendar(); });
  $('#ability-modal').addEventListener('click', (event) => { if (event.target.id === 'ability-modal') closeAbilityAssessment(); });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); resetForm(); navigate('add'); }
    if (event.key === 'Escape' && !$('#confirm-modal').classList.contains('hidden')) closeConfirm();
    if (event.key === 'Escape' && !$('#history-modal').classList.contains('hidden')) closeWordHistory();
    if (event.key === 'Escape' && !$('#streak-modal').classList.contains('hidden')) closeStreakCalendar();
    if (event.key === 'Escape' && !$('#ability-modal').classList.contains('hidden')) closeAbilityAssessment();
    if (state.view === 'review' && state.review && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const activeTag = document.activeElement?.tagName;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
        const word = state.data.words.find((item) => item.id === state.review.queue[0]);
        const fastMode = word && state.review.mode !== 'deep' && !state.review.deepWords.has(word.id);
        if (fastMode && state.review.revealed && ['1', '2', '3', '4'].includes(event.key)) {
          event.preventDefault();
          gradeCurrent({ 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }[event.key]);
        }
      }
    }
  });
}

async function init() {
  try {
    state.data = normalizeData(await api.loadData());
  } catch (error) {
    console.error(error);
    state.data = normalizeData();
    showToast('Không đọc được dữ liệu cũ. Milim đã mở một trang mới.', '!', true);
  }
  await persist();
  bindEvents();
  api.onUpdateStatus?.(renderUpdateStatus);
  api.onAIStatus?.((local) => {
    state.aiStatus = { ...(state.aiStatus || {}), local };
    const preference = state.data?.settings?.aiProvider || 'auto';
    if (['ready', 'loading', 'running', 'generating'].includes(local.state) && preference !== 'gemini') {
      state.aiStatus.activeProvider = 'local';
    }
    renderLocalAIStatus(local);
  });
  renderPosOptions();
  renderDefinitionFields();
  renderHome();
  renderReviewWelcome();
  renderSettings();
  setInterval(checkNotification, 60 * 1000);
  setInterval(updateQuickTimer, 1000);
  setTimeout(checkNotification, 1500);
}

init();
