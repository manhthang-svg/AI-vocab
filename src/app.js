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

const api = window.milim || {
  async loadData() {
    const saved = localStorage.getItem('milim-browser-data');
    return saved ? JSON.parse(saved) : { version: 1, words: [], settings: {} };
  },
  async saveData(data) { localStorage.setItem('milim-browser-data', JSON.stringify(data)); return { ok: true }; },
  async exportData() { return { canceled: true }; },
  async importData() { return { canceled: true }; },
  async notify() { return false; },
  async geminiStatus() { return { configured: false, model: 'gemini-2.5-flash' }; },
  async saveGeminiKey() { return { ok: true, model: 'gemini-2.5-flash' }; },
  async checkGeminiAnswer(payload) {
    return { meaning_score: 8, sentence_score: 8, meaning_feedback: 'Đúng nghĩa chính.', sentence_feedback: 'Câu dùng từ phù hợp.', corrected_sentence: payload.sentence, overall_feedback: 'Làm tốt.', recommended_grade: 'good' };
  },
  minimize() {}, maximize() {}, close() {}
};

const state = {
  data: null,
  view: 'home',
  selectedDate: null,
  selectedPos: '',
  editingId: null,
  review: null,
  geminiConfigured: false,
  geminiModel: 'gemini-2.5-flash',
  confirmAction: null,
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DAY = 24 * 60 * 60 * 1000;

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

function freshSrs() {
  return { repetitions: 0, interval: 0, ease: 2.5, lapses: 0, dueAt: new Date().toISOString(), lastReviewedAt: null, history: [] };
}

function normalizeWord(word) {
  return {
    ...word,
    id: word.id || uid(),
    term: String(word.term || ''),
    definition: String(word.definition || ''),
    partOfSpeech: word.partOfSpeech || '',
    createdAt: word.createdAt || new Date().toISOString(),
    createdDate: word.createdDate || localDate(word.createdAt || new Date()),
    srs: { ...freshSrs(), ...(word.srs || {}), history: Array.isArray(word.srs?.history) ? word.srs.history : [] }
  };
}

function normalizeData(data) {
  return {
    version: 1,
    words: Array.isArray(data?.words) ? data.words.map(normalizeWord) : [],
    settings: {
      notifications: true,
      notificationTime: '19:30',
      theme: 'light',
      lastNotificationDate: null,
      ...(data?.settings || {})
    }
  };
}

function posName(value) {
  return POS_OPTIONS.find(([key]) => key === value)?.[1] || '';
}

function mastery(word) {
  if ((word.srs?.interval || 0) >= 21 || (word.srs?.repetitions || 0) >= 5) return 'mastered';
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

function activityDates() {
  const dates = new Set();
  state.data.words.forEach((word) => {
    dates.add(wordDate(word));
    word.srs.history.forEach((item) => dates.add(localDate(item.at)));
  });
  return dates;
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
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
  if (view === 'add') setTimeout(() => $('#term-input').focus(), 100);
}

function renderGlobal() {
  const due = dueWords().length;
  $('#nav-due-count').textContent = due > 99 ? '99+' : due;
  $('#nav-due-count').classList.toggle('show', due > 0);
  $('#sidebar-streak').textContent = streak();
  document.body.classList.remove('dark');
}

function renderHome() {
  const today = localDate();
  const wordsToday = state.data.words.filter((word) => wordDate(word) === today);
  const reviewedToday = state.data.words.reduce((count, word) => count + word.srs.history.filter((item) => localDate(item.at) === today).length, 0);
  const due = dueWords().length;
  const currentStreak = streak();
  const formatted = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  $('#today-label').textContent = formatted.toUpperCase();
  $('#hero-due-count').textContent = due;
  $('#hero-message').textContent = due ? 'Một phiên ôn ngắn hôm nay sẽ giúp ký ức ở lại lâu hơn.' : (state.data.words.length ? 'Bạn đã hoàn thành phần ôn hôm nay. Thật dịu dàng và đều đặn!' : 'Thêm vài từ mới để bắt đầu hành trình cùng milim nhé.');
  $('#hero-review-btn').textContent = due ? 'Bắt đầu ôn' : 'Xem ôn tập';
  $('#goal-text').textContent = `${wordsToday.length} / 10 từ`;
  $('#goal-progress').style.width = `${Math.min(100, wordsToday.length * 10)}%`;
  $('#goal-caption').textContent = wordsToday.length >= 10 ? 'Mục tiêu hôm nay đã hoàn thành. Tuyệt lắm!' : `${Math.max(0, 10 - wordsToday.length)} từ nữa là chạm mục tiêu nhỏ hôm nay.`;
  $('#today-added').textContent = wordsToday.length;
  $('#today-reviewed').textContent = reviewedToday;
  $('#home-streak').textContent = currentStreak;

  const groups = groupByDate();
  const keys = Object.keys(groups).sort().reverse().slice(0, 3);
  $('#recent-decks').innerHTML = keys.length ? keys.map((key, index) => {
    const terms = groups[key].slice(0, 3).map((word) => word.term).join(' · ');
    const colors = ['#f8dfe8', '#e3edfb', '#f8eccf'];
    return `<article class="deck-card" data-deck-date="${key}" style="--deck-color:${colors[index]}"><div class="deck-top"><time>${escapeHtml(dateLabel(key))}</time><span class="deck-count">${groups[key].length}</span></div><h3>${escapeHtml(dateLabel(key, true))}</h3><p>${escapeHtml(terms)}</p></article>`;
  }).join('') : emptyState('Chưa có bộ từ nào', 'Từ đầu tiên của bạn sẽ xuất hiện ở đây.', 'Thêm từ đầu tiên', 'add');
  renderGlobal();
}

function renderPosOptions() {
  $('#pos-options').innerHTML = POS_OPTIONS.map(([value, label]) => `<button type="button" class="pos-chip pos-${value} ${state.selectedPos === value ? 'selected' : ''}" data-pos="${value}">${label}</button>`).join('');
}

function wordRow(word, options = {}) {
  const status = mastery(word);
  const pos = posName(word.partOfSpeech);
  return `<article class="word-row" data-word-id="${escapeHtml(word.id)}"><div class="word-term"><span class="status-dot ${status}" title="${status}"></span><strong>${escapeHtml(word.term)}</strong>${pos ? `<span class="pos-label pos-${escapeHtml(word.partOfSpeech)}">${escapeHtml(pos)}</span>` : ''}</div><div class="word-definition">${escapeHtml(word.definition).replace(/\n/g, '<br>')}</div><div class="word-actions"><button data-action="history" title="Lịch sử ôn">◷</button>${options.review ? `<button data-action="review-one" title="Ôn từ này">↻</button>` : ''}<button data-action="edit" title="Chỉnh sửa">✎</button><button data-action="delete" title="Xóa">×</button></div></article>`;
}

function renderRecentAdded() {
  const words = state.data.words.filter((word) => wordDate(word) === localDate()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#recent-added-caption').textContent = words.length ? `${words.length} từ trong bộ hôm nay` : 'Bộ từ hôm nay đang trống';
  $('#recent-added-list').innerHTML = words.length ? words.slice(0, 8).map((word) => wordRow(word)).join('') : emptyState('Chưa có từ nào hôm nay', 'Từ bạn vừa thêm sẽ hiện ngay tại đây.');
  renderGlobal();
}

function resetForm() {
  state.editingId = null;
  state.selectedPos = '';
  $('#term-input').value = '';
  $('#definition-input').value = '';
  $('#duplicate-hint').textContent = '';
  $('.add-submit').innerHTML = 'Thêm vào hôm nay <span>→</span>';
  renderPosOptions();
}

async function submitWord(event) {
  event.preventDefault();
  const term = $('#term-input').value.trim();
  const definition = $('#definition-input').value.trim();
  if (!term || !definition) {
    showToast('Hãy nhập cả thuật ngữ và định nghĩa nhé.', '!', true);
    (!term ? $('#term-input') : $('#definition-input')).focus();
    return;
  }

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
    if (word) Object.assign(word, { term, definition, partOfSpeech: state.selectedPos, updatedAt: new Date().toISOString() });
    await persist(false);
    showToast('Đã lưu thay đổi cho từ này.');
  } else {
    state.data.words.push(normalizeWord({ id: uid(), term, definition, partOfSpeech: state.selectedPos, createdAt: new Date().toISOString(), createdDate: localDate(), srs: freshSrs() }));
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
  state.selectedPos = word.partOfSpeech || '';
  $('#term-input').value = word.term;
  $('#definition-input').value = word.definition;
  $('.add-submit').innerHTML = 'Lưu thay đổi <span>→</span>';
  renderPosOptions();
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

function showWordHistory(id) {
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return;
  const history = [...word.srs.history].reverse();
  const counts = ['again', 'hard', 'good', 'easy'].reduce((result, grade) => {
    result[grade] = history.filter((item) => item.grade === grade).length;
    return result;
  }, {});
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  $('#history-word').textContent = word.term;
  $('#history-definition').textContent = word.definition;
  $('#history-summary').innerHTML = `<div><strong>${history.length}</strong><span>Lượt đã ôn</span></div><div><strong>${word.srs.lapses || 0}</strong><span>Lần quên</span></div><div><strong>${word.srs.interval || 0}</strong><span>Khoảng cách ngày</span></div>`;
  $('#history-pattern').innerHTML = history.length
    ? `<p>Bạn thường đánh giá từ này ở mức <strong>${gradeName(common[0])}</strong> (${common[1]} lần).</p><div class="history-bars">${Object.entries(counts).map(([grade, count]) => `<span class="history-grade ${grade}">${gradeName(grade)} <b>${count}</b></span>`).join('')}</div>`
    : '<p>Từ này chưa có lần ôn nào.</p>';
  $('#history-list').innerHTML = history.length ? history.slice(0, 20).map((item) => `<div class="history-entry"><div><strong>${gradeName(item.grade)}</strong><span>${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))}</span></div><div>${Number.isFinite(item.meaningScore) ? `<span>Nghĩa ${item.meaningScore}/10</span><span>Câu ${item.sentenceScore}/10</span>` : `<span>Lịch tiếp theo: ${item.interval || 0} ngày</span>`}</div></div>`).join('') : '';
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
    const matchesSearch = !search || word.term.toLocaleLowerCase('vi').includes(search) || word.definition.toLocaleLowerCase('vi').includes(search);
    return matchesSearch && (filter === 'all' || mastery(word) === filter);
  });
  $('#deck-detail').innerHTML = `<div class="detail-header"><div><h2>${escapeHtml(dateLabel(state.selectedDate, true))}</h2><p>${allWords.length} từ · ${allWords.filter((word) => mastery(word) === 'mastered').length} đã ghi nhớ</p></div><div><button class="soft-btn" data-review-date="${state.selectedDate}">Ôn bộ này</button></div></div><div class="word-list">${visible.length ? visible.map((word) => wordRow(word, { review: true })).join('') : emptyState('Không tìm thấy từ phù hợp', 'Thử đổi từ khóa hoặc bộ lọc nhé.')}</div>`;
  renderGlobal();
}

function renderReviewWelcome() {
  const due = dueWords();
  const overdue = overdueWords();
  const latestDate = Object.keys(groupByDate()).sort().reverse()[0];
  $('#review-title').textContent = 'Ôn tập hôm nay';
  $('#review-exit').classList.add('hidden');
  const overdueList = overdue.slice(0, 5).map((word) => `<span>${escapeHtml(word.term)}</span>`).join('');
  $('#review-stage').innerHTML = `<div class="review-dashboard"><div class="review-stage-card"><div class="review-welcome"><img src="../assets/milim-icon-rounded.png" alt="Mèo milim"><h2>${due.length ? `${due.length} từ đang chờ ôn` : 'Bạn đã hoàn thành hôm nay'}</h2><p>${due.length ? 'Mỗi câu trả lời sẽ được Gemini kiểm tra nghĩa, ngữ pháp và cách dùng từ.' : (state.data.words.length ? 'Bạn có thể bắt đầu một phiên nhanh hoặc ôn lại bộ gần nhất.' : 'Hãy thêm những từ đầu tiên để bắt đầu.')}</p>${!state.geminiConfigured ? '<div class="gemini-notice"><strong>Chưa kết nối Gemini</strong><span>Thêm API key trong Cài đặt để bắt đầu chấm bài.</span><button class="text-btn" data-go="settings">Thiết lập →</button></div>' : `<div class="gemini-ready">✦ Gemini ${escapeHtml(state.geminiModel)} đã sẵn sàng</div>`}<div class="review-summary"><span>${state.data.words.length} từ tất cả</span><span>${streak()} ngày liên tục</span></div><div class="review-welcome-actions">${due.length ? '<button class="primary-btn" id="start-due-review">Bắt đầu ôn</button>' : latestDate ? `<button class="soft-btn" data-review-date="${latestDate}">Ôn bộ gần nhất</button>` : '<button class="primary-btn" data-go="add">Thêm từ đầu tiên</button>'}${state.data.words.length ? '<button class="soft-btn" id="start-quick-review">Ôn nhanh 5 phút</button>' : ''}</div></div></div>${overdue.length ? `<section class="overdue-panel"><div><p class="eyebrow">TỪ QUÁ HẠN</p><h3>${overdue.length} từ cần ưu tiên</h3><p>Đã qua ngày ôn dự kiến. Hoàn thành nhóm này trước để lịch học cân bằng lại.</p><div class="overdue-terms">${overdueList}${overdue.length > 5 ? `<span>+${overdue.length - 5}</span>` : ''}</div></div><button class="soft-btn" id="start-overdue-review">Ôn từ quá hạn</button></section>` : ''}</div>`;
}

function startReview(words, title = 'Ôn tập hôm nay', options = {}) {
  if (!words.length) { showToast('Bộ này chưa có từ để ôn.', '!', true); return; }
  if (!state.geminiConfigured) { showToast('Hãy thiết lập Gemini API key trước khi ôn.', '!', true); navigate('settings'); return; }
  const shuffled = shuffleWords(words);
  const selected = options.quick ? shuffled.slice(0, 20) : shuffled;
  state.review = { queue: selected.map((word) => word.id), total: selected.length, answered: 0, correct: 0, requeued: new Set(), title, quick: Boolean(options.quick), endsAt: options.quick ? Date.now() + 5 * 60 * 1000 : null, checking: false, result: null, draft: { meaning: '', sentence: '' } };
  navigate('review');
  $('#review-title').textContent = title;
  $('#review-exit').classList.remove('hidden');
  renderReviewCard();
}

function startQuickReview() {
  const candidates = dueWords().length ? dueWords() : [...state.data.words].sort((a, b) => new Date(a.srs.lastReviewedAt || 0) - new Date(b.srs.lastReviewedAt || 0));
  startReview(candidates, 'Ôn nhanh 5 phút', { quick: true });
}

function intervalLabel(days, grade) {
  if (grade === 'again') return '10 phút';
  if (days < 1) return 'hôm nay';
  if (days === 1) return '1 ngày';
  if (days < 30) return `${Math.round(days)} ngày`;
  return `${Math.round(days / 30)} tháng`;
}

function projectedInterval(word, grade) {
  const srs = word.srs;
  if (grade === 'again') return 0;
  if (grade === 'hard') return Math.max(1, Math.round((srs.interval || 1) * 1.2));
  if (grade === 'good') return !srs.repetitions ? 1 : srs.repetitions === 1 ? 3 : Math.max(1, Math.round(srs.interval * srs.ease));
  return !srs.repetitions ? 3 : Math.max(2, Math.round((srs.interval || 1) * srs.ease * 1.3));
}

function renderReviewCard() {
  const review = state.review;
  if (!review || !review.queue.length) { renderReviewComplete(); return; }
  const word = state.data.words.find((item) => item.id === review.queue[0]);
  if (!word) { review.queue.shift(); renderReviewCard(); return; }
  const progress = Math.min(100, (review.answered / Math.max(1, review.total)) * 100);
  const result = review.result;
  const feedback = result ? `<section class="gemini-feedback"><div class="feedback-title"><div><span>✦ GEMINI NHẬN XÉT</span><h3>${escapeHtml(result.overall_feedback)}</h3></div><div class="score-pair"><b>${result.meaning_score}<small>/10</small><em>Nghĩa</em></b><b>${result.sentence_score}<small>/10</small><em>Đặt câu</em></b></div></div><div class="feedback-grid"><article><strong>Phần nghĩa</strong><p>${escapeHtml(result.meaning_feedback)}</p><small>Đáp án đã lưu: ${escapeHtml(word.definition)}</small></article><article><strong>Phần đặt câu</strong><p>${escapeHtml(result.sentence_feedback)}</p><small>Câu gợi ý: ${escapeHtml(result.corrected_sentence)}</small></article></div><div class="feedback-footer"><span>Đánh giá: <b>${gradeName(result.recommended_grade)}</b> · lần ôn tiếp theo ${intervalLabel(projectedInterval(word, result.recommended_grade), result.recommended_grade)}</span><button class="primary-btn" id="continue-review">Tiếp tục →</button></div><p class="ai-disclaimer">Nhận xét AI có thể chưa hoàn hảo; hãy dùng như một gợi ý học tập.</p></section>` : '';
  $('#review-stage').innerHTML = `<div class="review-session"><div class="review-progress"><div class="progress-track"><i style="width:${progress}%"></i></div><span>${Math.min(review.answered + 1, review.total)} / ${review.total}</span>${review.quick ? '<strong class="quick-timer" id="quick-timer">05:00</strong>' : ''}</div><div class="review-question-card"><div class="review-word">${word.partOfSpeech ? `<span class="pos-label pos-${escapeHtml(word.partOfSpeech)}">${escapeHtml(posName(word.partOfSpeech))}</span>` : ''}<h2>${escapeHtml(word.term)}</h2><p>Viết lại điều bạn nhớ, sau đó dùng từ này trong một câu tiếng Anh.</p></div><form class="answer-form" id="gemini-answer-form"><label><span>1 · NGHĨA CỦA TỪ</span><textarea id="review-meaning" rows="3" maxlength="1000" placeholder="Nhập nghĩa bằng cách hiểu của bạn..." ${result ? 'disabled' : ''}>${escapeHtml(review.draft.meaning)}</textarea></label><label><span>2 · ĐẶT MỘT CÂU VỚI TỪ NÀY</span><textarea id="review-sentence" rows="3" maxlength="1000" placeholder="Write an English sentence using this word..." ${result ? 'disabled' : ''}>${escapeHtml(review.draft.sentence)}</textarea></label>${!result ? `<div class="answer-submit"><span>Gemini sẽ kiểm tra nghĩa, ngữ pháp và cách dùng.</span><button class="primary-btn" type="submit" ${review.checking ? 'disabled' : ''}>${review.checking ? '<i class="spinner"></i> Đang chấm...' : 'Kiểm tra đáp án ✦'}</button></div>` : ''}</form></div>${feedback}</div>`;
  updateQuickTimer();
}

async function submitGeminiAnswer(event) {
  event.preventDefault();
  const review = state.review;
  if (!review || review.checking || review.result) return;
  const meaning = $('#review-meaning').value.trim();
  const sentence = $('#review-sentence').value.trim();
  review.draft = { meaning, sentence };
  if (!meaning || !sentence) {
    showToast('Hãy hoàn thành cả phần nghĩa và câu ví dụ.', '!', true);
    (!meaning ? $('#review-meaning') : $('#review-sentence')).focus();
    return;
  }
  const word = state.data.words.find((item) => item.id === review.queue[0]);
  if (!word) return;
  review.checking = true;
  renderReviewCard();
  try {
    const result = await api.checkGeminiAnswer({ word: word.term, partOfSpeech: posName(word.partOfSpeech), savedDefinition: word.definition, meaning, sentence });
    if (state.review !== review) return;
    review.result = result;
    review.checking = false;
    renderReviewCard();
  } catch (error) {
    if (state.review !== review) return;
    review.checking = false;
    renderReviewCard();
    const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
    showToast(message || 'Chưa thể kết nối Gemini.', '!', true);
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
    renderReviewComplete();
  }
}

function applySrs(word, grade, metadata = {}) {
  const now = new Date();
  const srs = word.srs;
  let interval = projectedInterval(word, grade);
  if (grade === 'again') {
    srs.repetitions = 0;
    srs.lapses = (srs.lapses || 0) + 1;
    srs.ease = Math.max(1.3, (srs.ease || 2.5) - .2);
    srs.dueAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  } else {
    srs.repetitions = (srs.repetitions || 0) + 1;
    if (grade === 'hard') srs.ease = Math.max(1.3, (srs.ease || 2.5) - .15);
    if (grade === 'easy') srs.ease = Math.min(3.2, (srs.ease || 2.5) + .15);
    srs.interval = interval;
    srs.dueAt = new Date(now.getTime() + interval * DAY).toISOString();
  }
  srs.interval = interval;
  srs.lastReviewedAt = now.toISOString();
  srs.history.push({ at: now.toISOString(), grade, interval, ...metadata });
}

async function gradeCurrent(grade, result = null) {
  const review = state.review;
  if (!review?.queue.length) return;
  const id = review.queue.shift();
  const word = state.data.words.find((item) => item.id === id);
  if (!word) return renderReviewCard();
  applySrs(word, grade, result ? { meaningScore: result.meaning_score, sentenceScore: result.sentence_score } : {});
  review.answered += 1;
  if (grade === 'good' || grade === 'easy') review.correct += 1;
  if (grade === 'again' && !review.requeued.has(id)) {
    review.requeued.add(id);
    review.queue.push(id);
    review.total += 1;
  }
  review.result = null;
  review.draft = { meaning: '', sentence: '' };
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

function endReview() {
  state.review = null;
  navigate('home');
}

function renderStats() {
  const total = state.data.words.length;
  const mastered = state.data.words.filter((word) => mastery(word) === 'mastered').length;
  const reviewCount = state.data.words.reduce((count, word) => count + word.srs.history.length, 0);
  const currentStreak = streak();
  $('#stat-cards').innerHTML = [
    ['♡', total, 'Tổng từ đã lưu'], ['✦', mastered, 'Từ đã ghi nhớ'], ['↻', reviewCount, 'Lượt ôn tập'], ['☼', currentStreak, 'Chuỗi ngày hiện tại']
  ].map(([icon, value, label]) => `<article class="stat-card"><i>${icon}</i><strong>${value}</strong><span>${label}</span></article>`).join('');

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

function renderSettings() {
  $('#notification-toggle').checked = Boolean(state.data.settings.notifications);
  $('#notification-time').value = state.data.settings.notificationTime || '19:30';
  refreshGeminiStatus();
  renderGlobal();
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

    const pos = event.target.closest('[data-pos]');
    if (pos) { state.selectedPos = state.selectedPos === pos.dataset.pos ? '' : pos.dataset.pos; renderPosOptions(); }

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

    if (event.target.closest('#start-due-review')) startReview(dueWords());
    if (event.target.closest('#start-overdue-review')) startReview(overdueWords(), 'Từ quá hạn');
    if (event.target.closest('#start-quick-review')) startQuickReview();
    if (event.target.closest('#continue-review') && state.review?.result) gradeCurrent(state.review.result.recommended_grade, state.review.result);
    if (event.target.closest('#finish-review')) endReview();
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'gemini-answer-form') submitGeminiAnswer(event);
  });

  $('#hero-review-btn').addEventListener('click', () => navigate('review'));
  $('#home-notification').addEventListener('click', () => navigate('settings'));
  $('#word-form').addEventListener('submit', submitWord);
  $('#term-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $('#definition-input').focus(); }
  });
  $('#term-input').addEventListener('input', () => {
    const value = normalizedTerm($('#term-input').value);
    const duplicate = value && state.data.words.find((word) => normalizedTerm(word.term) === value && word.id !== state.editingId);
    $('#duplicate-hint').textContent = duplicate ? `Đã có trong bộ ${dateLabel(wordDate(duplicate))} — milim sẽ không thêm trùng.` : '';
  });
  $('#definition-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#word-form').requestSubmit(); }
  });
  $('#search-input').addEventListener('input', renderLibrary);
  $('#mastery-filter').addEventListener('change', renderLibrary);
  $('#review-exit').addEventListener('click', () => askConfirm('Kết thúc phiên ôn?', 'Tiến độ những từ đã trả lời vẫn được lưu.', () => { closeConfirm(); endReview(); }, 'Kết thúc'));

  $('#notification-toggle').addEventListener('change', async (event) => { state.data.settings.notifications = event.target.checked; await persist(); showToast(event.target.checked ? 'Đã bật nhắc ôn tập.' : 'Đã tắt nhắc ôn tập.'); });
  $('#notification-time').addEventListener('change', async (event) => { state.data.settings.notificationTime = event.target.value; state.data.settings.lastNotificationDate = null; await persist(); showToast('Đã đổi giờ nhắc học.'); });
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
      await refreshGeminiStatus();
      showToast('Đã kết nối Gemini an toàn.');
    } catch (error) {
      const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
      showToast(message || 'Không thể kết nối Gemini.', '!', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Lưu & kiểm tra';
    }
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

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); resetForm(); navigate('add'); }
    if (event.key === 'Escape' && !$('#confirm-modal').classList.contains('hidden')) closeConfirm();
    if (event.key === 'Escape' && !$('#history-modal').classList.contains('hidden')) closeWordHistory();
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
  bindEvents();
  renderPosOptions();
  renderHome();
  renderReviewWelcome();
  renderSettings();
  setInterval(checkNotification, 60 * 1000);
  setInterval(updateQuickTimer, 1000);
  setTimeout(checkNotification, 1500);
}

init();
