const { app, BrowserWindow, ipcMain, dialog, Notification, safeStorage, nativeImage, clipboard, desktopCapturer, screen, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateReminderUrl, validateReminderEmail, validateReminderTime, normalizeReminderDate } = require('./src/reminder');

app.setName('milim');
app.disableHardwareAcceleration();

let mainWindow;
let writeQueue = Promise.resolve();
let updateCheckRunning = false;
let smokeReminderToken = '';
let updateStatus = { state: 'idle', currentVersion: app.getVersion(), version: '', percent: 0, message: 'Sẵn sàng kiểm tra cập nhật.' };
const smokeMode = process.env.MILIM_SMOKE_MODE === '1';

const DEFAULT_WRITING_TYPES = {
  task1: [
    { id: 'task1-line', name: 'Line graph' }, { id: 'task1-bar', name: 'Bar chart' },
    { id: 'task1-pie', name: 'Pie chart' }, { id: 'task1-table', name: 'Table' },
    { id: 'task1-process', name: 'Process' }, { id: 'task1-map', name: 'Map' },
    { id: 'task1-mixed', name: 'Mixed charts' }
  ],
  task2: [
    { id: 'task2-opinion', name: 'Opinion' }, { id: 'task2-discussion', name: 'Discussion' },
    { id: 'task2-advantages', name: 'Advantages / Disadvantages' },
    { id: 'task2-problem', name: 'Problem / Solution' }, { id: 'task2-two-part', name: 'Two-part question' }
  ]
};

const emptyData = () => ({
  version: 5,
  words: [],
  speakingErrors: [],
  writing: { types: DEFAULT_WRITING_TYPES, entries: [], notes: [] },
  reviewSession: null,
  settings: {
    notifications: true,
    notificationTime: '19:30',
    emailReminderEnabled: false,
    emailReminderUrl: '',
    emailReminderEmail: '',
    emailReminderTime: '23:00',
    emailReminderLastSyncedDate: null,
    fsrsRetention: 0.9,
    theme: 'light',
    lastNotificationDate: null
  }
});

function dataFile() {
  return path.join(app.getPath('userData'), 'milim-data.json');
}

function secretsFile() {
  return path.join(app.getPath('userData'), 'milim-secrets.json');
}

function publishUpdateStatus(patch = {}) {
  updateStatus = { ...updateStatus, ...patch, currentVersion: app.getVersion() };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', updateStatus);
  return updateStatus;
}

function setupAutoUpdater() {
  if (!app.isPackaged || smokeMode) {
    publishUpdateStatus({ state: 'unavailable', message: 'Cập nhật tự động chỉ hoạt động trên bản đã cài đặt.' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => publishUpdateStatus({ state: 'checking', percent: 0, message: 'Đang kiểm tra phiên bản mới...' }));
  autoUpdater.on('update-available', (info) => publishUpdateStatus({ state: 'downloading', version: info.version, percent: 0, message: `Đang tải milim ${info.version}...` }));
  autoUpdater.on('update-not-available', () => {
    updateCheckRunning = false;
    publishUpdateStatus({ state: 'current', version: app.getVersion(), percent: 100, message: 'Bạn đang dùng phiên bản mới nhất.' });
  });
  autoUpdater.on('download-progress', (progress) => publishUpdateStatus({ state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))), message: `Đang tải bản cập nhật · ${Math.round(progress.percent || 0)}%` }));
  autoUpdater.on('update-downloaded', (info) => {
    updateCheckRunning = false;
    publishUpdateStatus({ state: 'downloaded', version: info.version, percent: 100, message: `Milim ${info.version} đã sẵn sàng cài đặt.` });
  });
  autoUpdater.on('error', (error) => {
    updateCheckRunning = false;
    console.error('Auto update error:', error.message);
    publishUpdateStatus({ state: 'error', percent: 0, message: 'Chưa thể kiểm tra cập nhật. Hãy thử lại sau.' });
  });
  setTimeout(() => checkForAppUpdate(false), 8000);
  setInterval(() => checkForAppUpdate(false), 6 * 60 * 60 * 1000);
}

async function checkForAppUpdate(manual = true) {
  if (!app.isPackaged || smokeMode) return publishUpdateStatus({ state: 'unavailable', message: 'Cập nhật tự động chỉ hoạt động trên bản đã cài đặt.' });
  if (updateCheckRunning || updateStatus.state === 'downloading' || updateStatus.state === 'downloaded') return updateStatus;
  updateCheckRunning = true;
  publishUpdateStatus({ state: 'checking', percent: 0, message: manual ? 'Đang kiểm tra phiên bản mới...' : 'Đang kiểm tra cập nhật trong nền...' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckRunning = false;
    console.error('Could not check for updates:', error.message);
    publishUpdateStatus({ state: 'error', message: 'Chưa thể kết nối máy chủ cập nhật. Hãy thử lại sau.' });
  }
  return updateStatus;
}

async function readSecrets() {
  try {
    return JSON.parse(await fs.readFile(secretsFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeSecrets(patch) {
  await fs.mkdir(path.dirname(secretsFile()), { recursive: true });
  const current = await readSecrets();
  await fs.writeFile(secretsFile(), JSON.stringify({ ...current, ...patch }, null, 2), 'utf8');
}

async function readReminderToken() {
  if (smokeMode) return smokeReminderToken;
  const raw = await readSecrets();
  if (!raw.reminderToken || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(raw.reminderToken, 'base64'));
  } catch {
    return '';
  }
}

async function storeReminderToken(token) {
  if (smokeMode) { smokeReminderToken = token; return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Thiết bị này chưa hỗ trợ lưu mã kết nối an toàn.');
  await writeSecrets({ reminderToken: safeStorage.encryptString(token).toString('base64') });
}

async function postReminder(endpoint, payload) {
  if (smokeMode) return { ok: true, ...payload };
  const response = await fetch(validateReminderUrl(endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();
  let result;
  try { result = JSON.parse(body); } catch { throw new Error('Apps Script không trả về phản hồi hợp lệ. Hãy kiểm tra lại URL triển khai.'); }
  if (!response.ok || !result.ok) throw new Error(result.error || `Apps Script trả về lỗi ${response.status}.`);
  return result;
}

function normalizeData(value) {
  const fallback = emptyData();
  if (!value || typeof value !== 'object') return fallback;
  return {
    version: 5,
    words: Array.isArray(value.words) ? value.words : [],
    speakingErrors: Array.isArray(value.speakingErrors) ? value.speakingErrors : [],
    writing: value.writing && typeof value.writing === 'object'
      ? value.writing
      : { types: DEFAULT_WRITING_TYPES, entries: [], notes: [] },
    reviewSession: value.reviewSession && typeof value.reviewSession === 'object' ? value.reviewSession : null,
    settings: {
      ...fallback.settings,
      ...(value.settings || {})
    }
  };
}

async function readData() {
  if (smokeMode) return emptyData();
  try {
    const raw = await fs.readFile(dataFile(), 'utf8');
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read milim data:', error);
    return emptyData();
  }
}

async function writeData(value) {
  const normalized = normalizeData(value);
  if (smokeMode) return { ok: true };
  writeQueue = writeQueue.then(async () => {
    const target = dataFile();
    const temporary = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(normalized, null, 2), 'utf8');
    await fs.rename(temporary, target);
  });
  await writeQueue;
  return { ok: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#f8f7f8',
    show: false,
    frame: false,
    title: 'milim',
    icon: path.join(__dirname, 'assets', 'milim-icon-rounded.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  let rendererRecoveryCount = 0;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Milim renderer stopped:', details.reason, details.exitCode);
    if (details.reason === 'clean-exit' || rendererRecoveryCount >= 2 || mainWindow.isDestroyed()) return;
    rendererRecoveryCount += 1;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    }, 250);
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const flags = params.editFlags || {};
    const template = params.isEditable ? [
      { label: 'Hoàn tác', role: 'undo', enabled: Boolean(flags.canUndo) },
      { label: 'Làm lại', role: 'redo', enabled: Boolean(flags.canRedo) },
      { type: 'separator' },
      { label: 'Cắt', role: 'cut', enabled: Boolean(flags.canCut) },
      { label: 'Sao chép', role: 'copy', enabled: Boolean(flags.canCopy) },
      { label: 'Dán', role: 'paste', enabled: Boolean(flags.canPaste) },
      { label: 'Xóa', role: 'delete', enabled: Boolean(flags.canDelete) },
      { type: 'separator' },
      { label: 'Chọn tất cả', role: 'selectAll', enabled: Boolean(flags.canSelectAll) }
    ] : params.selectionText ? [
      { label: 'Sao chép', role: 'copy' },
      { label: 'Chọn tất cả', role: 'selectAll' }
    ] : [];
    if (template.length) Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  const capturePath = process.env.MILIM_CAPTURE_PATH;
  if (capturePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (smokeMode) {
        const keepReviewFeedback = process.env.MILIM_SMOKE_REVIEW_CAPTURE === '1';
        const keepFastReview = process.env.MILIM_SMOKE_FAST_CAPTURE === '1';
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('[data-view="add"]').click();
          const termInput = document.querySelector('#term-input');
          termInput.value = 'thrill';
          termInput.focus();
          termInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          const keyboardPartSelection = document.querySelectorAll('.definition-input').length === 2
            && document.activeElement?.id === 'definition-input'
            && document.querySelector('[data-pos="noun"]').getAttribute('aria-pressed') === 'true'
            && document.querySelector('[data-pos="verb"]').getAttribute('aria-pressed') === 'true';
          document.querySelector('[data-definition-pos="noun"]').value = 'cảm giác phấn khích';
          document.querySelector('[data-definition-pos="verb"]').value = 'làm ai đó phấn khích';
          document.querySelector('#note-input').value = 'Example: The roller coaster gave us a thrill.';
          document.querySelector('[data-definition-pos="verb"]').focus();
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 250));
          const formClearedAfterSave = document.querySelector('#term-input').value === ''
            && [...document.querySelectorAll('.definition-input')].every(input => input.value === '')
            && document.querySelector('#note-input').value === ''
            && document.activeElement?.id === 'term-input';
          document.querySelector('#term-input').value = '  THRILL  ';
          document.querySelector('#definition-input').value = 'bản trùng';
          document.querySelector('#word-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 80));
          const duplicateBlocked = document.querySelector('#duplicate-hint').innerText.toLocaleLowerCase('vi').includes('đã có trong bộ');
          document.querySelector('[data-view="library"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const result = {
            words: document.querySelectorAll('#deck-detail .word-row').length,
            termVisible: document.body.innerText.includes('thrill'),
            definitionVisible: document.body.innerText.includes('cảm giác phấn khích') && document.body.innerText.includes('làm ai đó phấn khích'),
            multiplePartsVisible: document.querySelectorAll('#deck-detail .word-row .pos-label').length === 2,
            libraryNoteVisible: document.querySelector('#deck-detail .library-word-note')?.innerText.includes('The roller coaster gave us a thrill.'),
            keyboardPartSelection,
            formClearedAfterSave,
            streakSummaryVisible: false,
            duplicateBlocked,
            historyVisible: false,
            heatmapCells: 0,
            reviewComplete: false,
            writingTypeCrud: false,
            writingMinimalLayout: false,
            writingJournalSaved: false,
            writingJournalDisclosure: false,
            writingEntryEdited: false,
            writingSubmenu: false,
            writingTypeVisible: false,
            writingNoteCrud: false,
            writingNotesIsolated: false,
            retentionControl: false,
            weeklyStreakVisible: false,
            emailReminderControls: false,
            meaningfulStreakReached: false,
            removedFeaturesHidden: !document.querySelector('[data-view="script"], [data-view="speaking"], #view-script, #view-speaking, .local-ai-card, .gemini-card, #ai-stats-strip, #streak-daily-goal')
          };
          result.weeklyStreakVisible = document.querySelectorAll('#home-streak-week .streak-day').length === 7
            && document.querySelectorAll('#sidebar-streak-week .streak-day').length === 7;
          result.streakSummaryVisible = document.querySelector('#sidebar-streak')?.innerText === '1'
            && Boolean(document.querySelector('#sidebar-streak-week .streak-day.today.learned'));

          document.querySelector('#deck-detail [data-action="history"]')?.click();
          await new Promise(resolve => setTimeout(resolve, 50));
          result.historyVisible = !document.querySelector('#history-modal').classList.contains('hidden');
          document.querySelector('#history-close')?.click();

          document.querySelector('[data-view="stats"]').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          result.heatmapCells = document.querySelectorAll('#calendar-heatmap .heat-cell').length;

          document.querySelector('[data-view="settings"]').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          result.retentionControl = document.querySelector('#retention-input')?.value === '90' && document.querySelector('#retention-value')?.innerText === '90%';

          document.querySelector('#email-reminder-toggle').click();
          document.querySelector('#email-reminder-url').value = 'https://script.google.com/macros/s/smoke-deployment/exec';
          document.querySelector('#email-reminder-email').value = 'learner@example.com';
          document.querySelector('#email-reminder-time').value = '23:00';
          document.querySelector('#email-reminder-token').value = 'smoke-reminder-token-1234567890';
          document.querySelector('#save-email-reminder').click();
          await new Promise(resolve => setTimeout(resolve, 120));
          document.querySelector('#test-email-reminder').click();
          await new Promise(resolve => setTimeout(resolve, 80));
          result.emailReminderControls = state.data.settings.emailReminderEnabled
            && state.data.settings.emailReminderTime === '23:00'
            && state.data.settings.emailReminderLastSyncedDate === localDate()
            && document.querySelector('#email-reminder-status')?.innerText.includes('Đã gửi email thử');

          document.querySelector('[data-view="writing"]').click();
          result.writingSubmenu = document.querySelectorAll('.nav-subitem[data-writing-section]').length === 3
            && document.querySelector('[data-writing-section="task1"]').classList.contains('active');
          result.writingMinimalLayout = document.querySelector('#writing-entry-form').classList.contains('hidden')
            && document.querySelector('#writing-types-card').classList.contains('hidden')
            && !document.querySelector('#writing-history-section').classList.contains('hidden');

          document.querySelector('[data-writing-section="task2"]').click();
          document.querySelector('#manage-writing-types').click();
          result.writingMinimalLayout = result.writingMinimalLayout
            && !document.querySelector('#writing-types-card').classList.contains('hidden')
            && document.querySelector('#writing-history-section').classList.contains('hidden');
          document.querySelector('#writing-type-input').value = 'Custom essay';
          document.querySelector('#save-writing-type').click();
          await new Promise(resolve => setTimeout(resolve, 80));
          let customType = [...document.querySelectorAll('[data-writing-type-id]')].find(node => node.innerText.includes('Custom essay'));
          customType?.querySelector('[data-writing-type-action="edit"]').click();
          document.querySelector('#writing-type-input').value = 'Cause and effect';
          document.querySelector('#save-writing-type').click();
          await new Promise(resolve => setTimeout(resolve, 80));
          customType = [...document.querySelectorAll('[data-writing-type-id]')].find(node => node.innerText.includes('Cause and effect'));
          const typeAddedAndEdited = Boolean(customType);
          customType?.querySelector('[data-writing-type-action="delete"]').click();
          document.querySelector('#confirm-accept').click();
          await new Promise(resolve => setTimeout(resolve, 80));
          result.writingTypeCrud = typeAddedAndEdited && ![...document.querySelectorAll('[data-writing-type-id]')].some(node => node.innerText.includes('Cause and effect'));

          document.querySelector('#new-writing-entry').click();
          result.writingMinimalLayout = result.writingMinimalLayout
            && !document.querySelector('#writing-entry-form').classList.contains('hidden')
            && document.querySelector('#writing-types-card').classList.contains('hidden')
            && document.querySelector('#writing-history-section').classList.contains('hidden');
          document.querySelector('#upload-writing-image').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          document.querySelector('#writing-score').value = '6.5';
          document.querySelector('#writing-content').value = 'Some people believe that public transport should be free for everyone.';
          document.querySelector('#add-writing-error').click();
          document.querySelector('[data-writing-error-field="mistake"]').value = 'transport are';
          document.querySelector('[data-writing-error-field="correction"]').value = 'transport is';
          document.querySelector('#writing-entry-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 150));
          result.writingJournalSaved = document.querySelectorAll('.writing-entry-card').length === 1
            && document.querySelector('.writing-entry-card img')
            && document.body.innerText.includes('6.5')
            && document.body.innerText.includes('LỖI ĐÃ GHI')
            && document.body.innerText.includes('SỐ TỪ');
          const writingIdentity = document.querySelector('.writing-entry-identity');
          result.writingTypeVisible = Boolean(writingIdentity?.querySelector('strong')?.innerText.trim())
            && (writingIdentity?.innerText || '').toLocaleLowerCase().includes('task 2');
          result.meaningfulStreakReached = document.querySelector('#sidebar-streak')?.innerText === '1'
            && Boolean(document.querySelector('#sidebar-streak-week .streak-day.today.learned'));

          const writingCard = document.querySelector('.writing-entry-card');
          const writingWasCollapsed = !writingCard.open;
          writingCard.querySelector('.writing-entry-summary').click();
          result.writingJournalDisclosure = writingWasCollapsed && writingCard.open;
          document.querySelector('[data-writing-entry-action="edit"]').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          const editLoaded = document.querySelector('#writing-content').value.includes('public transport')
            && Boolean(document.querySelector('#writing-image-preview').src);
          document.querySelector('#writing-score').value = '7';
          document.querySelector('#writing-entry-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 120));
          result.writingEntryEdited = editLoaded
            && document.querySelectorAll('.writing-entry-card').length === 1
            && document.body.innerText.includes('7');

          document.querySelector('[data-writing-section="notes"]').click();
          result.writingNotesIsolated = !document.querySelector('#writing-notes-view').classList.contains('hidden')
            && document.querySelector('#writing-history-section').classList.contains('hidden')
            && document.querySelector('#writing-entry-form').classList.contains('hidden');
          document.querySelector('#new-writing-note').click();
          document.querySelector('#writing-note-category').value = 'Cấu trúc câu';
          document.querySelector('#writing-note-title').value = 'Câu nhượng bộ';
          document.querySelector('#writing-note-content').value = 'Although + clause, main clause.';
          document.querySelector('#writing-note-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 100));
          const noteSaved = document.querySelector('.writing-note-card')?.innerText.includes('Câu nhượng bộ');
          document.querySelector('[data-writing-note-action="edit"]')?.click();
          document.querySelector('#writing-note-title').value = 'Cấu trúc nhượng bộ';
          document.querySelector('#writing-note-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 100));
          const noteEdited = document.querySelector('.writing-note-card')?.innerText.includes('Cấu trúc nhượng bộ');
          document.querySelector('[data-writing-note-action="delete"]')?.click();
          document.querySelector('#confirm-accept').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          result.writingNoteCrud = noteSaved && noteEdited && !document.querySelector('.writing-note-card');

          document.querySelector('[data-view="review"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          document.querySelector('#start-due-review')?.click();
          await new Promise(resolve => setTimeout(resolve, 100));
          document.querySelector('#fast-term-input').value = 'thrill';
          document.querySelector('#fast-answer-form').requestSubmit();
          await new Promise(resolve => setTimeout(resolve, 80));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
          await new Promise(resolve => setTimeout(resolve, 120));
          result.reviewComplete = document.body.innerText.includes('Hoàn thành phiên ôn');
          document.querySelector('#finish-review')?.click();

          return result;
        })()`);

        if (result.words !== 1 || !result.termVisible || !result.definitionVisible || !result.multiplePartsVisible || !result.libraryNoteVisible || !result.keyboardPartSelection || !result.formClearedAfterSave || !result.streakSummaryVisible || !result.duplicateBlocked || !result.weeklyStreakVisible || !result.meaningfulStreakReached || !result.historyVisible || result.heatmapCells !== 112 || !result.retentionControl || !result.emailReminderControls || !result.writingTypeCrud || !result.writingMinimalLayout || !result.writingJournalSaved || !result.writingJournalDisclosure || !result.writingEntryEdited || !result.writingSubmenu || !result.writingTypeVisible || !result.writingNoteCrud || !result.writingNotesIsolated || !result.reviewComplete || !result.removedFeaturesHidden) {
          console.error('MILIM_SMOKE_FAILED', result);
          app.exit(1);
          return;
        }
        console.log('MILIM_SMOKE_OK', result);
      }
      const captureView = process.env.MILIM_CAPTURE_VIEW;
      if (captureView) {
        await mainWindow.webContents.executeJavaScript(`navigate(${JSON.stringify(captureView)})`);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (process.env.MILIM_CAPTURE_EMAIL_EXPANDED === '1') {
        await mainWindow.webContents.executeJavaScript(`(() => { const toggle = document.querySelector('#email-reminder-toggle'); if (toggle) toggle.checked = true; updateEmailReminderDisclosure(true); })()`);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const captureSelector = process.env.MILIM_CAPTURE_SELECTOR;
      if (captureSelector) {
        await mainWindow.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(captureSelector)})?.scrollIntoView({ block: 'center' })`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const captureTreeDays = Math.max(0, Math.floor(Number(process.env.MILIM_CAPTURE_TREE_DAYS) || 0));
      if (captureTreeDays) {
        await mainWindow.webContents.executeJavaScript(`(() => {
          const days = ${captureTreeDays};
          document.querySelector('#home-streak').textContent = days;
          document.querySelector('#tree-best').textContent = 'Dài nhất · ' + days + ' ngày';
          const recent = [...document.querySelectorAll('#home-streak-week .streak-day')];
          recent.forEach((node, index) => {
            const learned = index >= 7 - Math.min(days, 7);
            node.classList.toggle('learned', learned);
            node.querySelector('i').textContent = learned ? (node.classList.contains('today') ? '🔥' : '✓') : '';
          });
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const image = await mainWindow.webContents.capturePage();
      await fs.writeFile(capturePath, image.toPNG());
      app.quit();
    });
  }
}

function compressedWritingImage(image) {
  if (!image || image.isEmpty()) throw new Error('Không tìm thấy ảnh hợp lệ.');
  const size = image.getSize();
  const maxWidth = 1800;
  const maxHeight = 1400;
  const ratio = Math.min(1, maxWidth / Math.max(1, size.width), maxHeight / Math.max(1, size.height));
  const normalized = ratio < 1
    ? image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)), quality: 'best' })
    : image;
  return `data:image/jpeg;base64,${normalized.toJPEG(86).toString('base64')}`;
}

const smokeWritingImage = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="360"%3E%3Crect width="100%25" height="100%25" fill="%23fff7fa"/%3E%3Ctext x="40" y="80" font-size="28"%3EIELTS Writing prompt%3C/text%3E%3C/svg%3E';

ipcMain.handle('writing:pick-image', async () => {
  if (smokeMode) return smokeWritingImage;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn ảnh đề Writing',
    properties: ['openFile'],
    filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return '';
  return compressedWritingImage(nativeImage.createFromPath(result.filePaths[0]));
});

ipcMain.handle('writing:clipboard-image', () => {
  if (smokeMode) return smokeWritingImage;
  return compressedWritingImage(clipboard.readImage());
});

ipcMain.handle('writing:normalize-image', (_event, dataUrl) => {
  return compressedWritingImage(nativeImage.createFromDataURL(String(dataUrl || '')));
});

ipcMain.handle('writing:capture-screen', async () => {
  if (smokeMode) return smokeWritingImage;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  mainWindow?.hide();
  await new Promise((resolve) => setTimeout(resolve, 280));
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
        height: Math.max(1, Math.round(display.size.height * display.scaleFactor))
      }
    });
    const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
    if (!source) throw new Error('Không tìm thấy màn hình để chụp.');
    return compressedWritingImage(source.thumbnail);
  } finally {
    mainWindow?.show();
    mainWindow?.focus();
  }
});

ipcMain.handle('data:load', readData);
ipcMain.handle('data:save', (_event, value) => writeData(value));

ipcMain.handle('data:export', async (_event, value) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Sao lưu dữ liệu milim',
    defaultPath: `milim-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Milim backup', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, JSON.stringify(normalizeData(value), null, 2), 'utf8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Khôi phục dữ liệu milim',
    properties: ['openFile'],
    filters: [{ name: 'Milim backup', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const raw = await fs.readFile(result.filePaths[0], 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.words)) throw new Error('Tệp sao lưu không hợp lệ.');
  const normalized = normalizeData(parsed);
  await writeData(normalized);
  return { canceled: false, data: normalized };
});

ipcMain.handle('app:notify', (_event, { title, body }) => {
  if (!Notification.isSupported()) return false;
  new Notification({
    title: title || 'milim',
    body: body || 'Đến giờ ôn từ rồi nè.',
    icon: path.join(__dirname, 'assets', 'milim-icon-rounded.png')
  }).show();
  return true;
});

ipcMain.handle('reminder:status', async () => ({ configured: Boolean(await readReminderToken()) }));

ipcMain.handle('reminder:configure', async (_event, payload = {}) => {
  const endpoint = validateReminderUrl(payload.endpoint);
  const email = validateReminderEmail(payload.email);
  const reminderTime = validateReminderTime(payload.reminderTime || '23:00');
  const suppliedToken = String(payload.token || '').trim();
  const token = suppliedToken || await readReminderToken();
  if (!token || token.length < 20 || token.length > 200) throw new Error('Hãy nhập mã kết nối do Apps Script tạo.');
  const result = await postReminder(endpoint, {
    action: 'configure',
    token,
    email,
    reminderTime,
    timezone: 'Asia/Ho_Chi_Minh',
    enabled: Boolean(payload.enabled)
  });
  if (suppliedToken) await storeReminderToken(suppliedToken);
  return { ...result, endpoint, email, reminderTime, configured: true };
});

ipcMain.handle('reminder:activity', async (_event, payload = {}) => {
  if (smokeMode) return { ok: true, studiedDate: normalizeReminderDate(payload.date) };
  const data = await readData();
  const settings = data.settings || {};
  if (!settings.emailReminderEnabled || !settings.emailReminderUrl) return { ok: false, skipped: true };
  const token = await readReminderToken();
  if (!token) return { ok: false, skipped: true };
  return postReminder(settings.emailReminderUrl, { action: 'activity', token, date: normalizeReminderDate(payload.date) });
});

ipcMain.handle('reminder:test', async () => {
  if (smokeMode) return { ok: true };
  const data = await readData();
  const token = await readReminderToken();
  if (!data.settings?.emailReminderUrl || !token) throw new Error('Hãy lưu kết nối Apps Script trước.');
  return postReminder(data.settings.emailReminderUrl, { action: 'test', token });
});

ipcMain.handle('reminder:copy-script', async () => {
  const source = await fs.readFile(path.join(__dirname, 'google-apps-script', 'Code.gs'), 'utf8');
  clipboard.writeText(source);
  return true;
});

ipcMain.handle('reminder:open-script', () => shell.openExternal('https://script.google.com/home/start'));

ipcMain.handle('update:status', () => updateStatus);
ipcMain.handle('update:check', () => checkForAppUpdate(true));
ipcMain.handle('update:install', () => {
  if (updateStatus.state !== 'downloaded') return false;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

app.whenReady().then(async () => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
