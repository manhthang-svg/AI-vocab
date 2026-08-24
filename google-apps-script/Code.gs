const MILIM_KEYS = {
  secret: 'MILIM_SECRET',
  email: 'MILIM_EMAIL',
  enabled: 'MILIM_ENABLED',
  time: 'MILIM_TIME',
  timezone: 'MILIM_TIMEZONE',
  studiedDate: 'MILIM_STUDIED_DATE',
  sentDate: 'MILIM_SENT_DATE'
};

/**
 * Chạy hàm này một lần trong Apps Script rồi sao chép mã kết nối ở Execution log.
 */
function setupMilimReminder() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(MILIM_KEYS.secret);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty(MILIM_KEYS.secret, secret);
  }
  properties.setProperties({
    [MILIM_KEYS.enabled]: properties.getProperty(MILIM_KEYS.enabled) || 'false',
    [MILIM_KEYS.time]: properties.getProperty(MILIM_KEYS.time) || '23:00',
    [MILIM_KEYS.timezone]: properties.getProperty(MILIM_KEYS.timezone) || 'Asia/Ho_Chi_Minh'
  });
  ensureMilimTrigger_();
  console.log('Mã kết nối Milim: ' + secret);
  return secret;
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(event && event.postData && event.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty(MILIM_KEYS.secret);
    if (!secret || body.token !== secret) return json_({ ok: false, error: 'Mã kết nối không đúng.' });

    if (body.action === 'configure') {
      const email = String(body.email || '').trim().toLowerCase();
      const time = String(body.reminderTime || '23:00');
      const timezone = String(body.timezone || 'Asia/Ho_Chi_Minh');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_({ ok: false, error: 'Email không hợp lệ.' });
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return json_({ ok: false, error: 'Giờ nhắc không hợp lệ.' });
      properties.setProperties({
        [MILIM_KEYS.email]: email,
        [MILIM_KEYS.enabled]: body.enabled ? 'true' : 'false',
        [MILIM_KEYS.time]: time,
        [MILIM_KEYS.timezone]: timezone
      });
      ensureMilimTrigger_();
      return json_({ ok: true });
    }

    if (body.action === 'activity') {
      const timezone = properties.getProperty(MILIM_KEYS.timezone) || 'Asia/Ho_Chi_Minh';
      const today = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : today;
      properties.setProperty(MILIM_KEYS.studiedDate, date);
      return json_({ ok: true, studiedDate: date });
    }

    if (body.action === 'test') {
      const email = properties.getProperty(MILIM_KEYS.email);
      if (!email) return json_({ ok: false, error: 'Hãy lưu email trong Milim trước.' });
      MailApp.sendEmail(email, 'Milim đã kết nối lời nhắc', 'Kết nối thành công. Nếu đến giờ nhắc mà bạn chưa học, Milim sẽ gửi một email ngắn như thế này.');
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Hành động không được hỗ trợ.' });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function checkMilimReminder() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(MILIM_KEYS.enabled) !== 'true') return;
    const email = properties.getProperty(MILIM_KEYS.email);
    if (!email) return;
    const timezone = properties.getProperty(MILIM_KEYS.timezone) || 'Asia/Ho_Chi_Minh';
    const reminderTime = properties.getProperty(MILIM_KEYS.time) || '23:00';
    const now = new Date();
    const today = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
    const currentTime = Utilities.formatDate(now, timezone, 'HH:mm');
    if (currentTime < reminderTime) return;
    if (properties.getProperty(MILIM_KEYS.studiedDate) === today) return;
    if (properties.getProperty(MILIM_KEYS.sentDate) === today) return;
    MailApp.sendEmail(email, 'Đừng để mất chuỗi Milim hôm nay', 'Bạn vẫn chưa học cùng Milim hôm nay. Hãy dành 5 phút ôn nhanh để giữ nhịp học nhé.');
    properties.setProperty(MILIM_KEYS.sentDate, today);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function ensureMilimTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === 'checkMilimReminder');
  if (!exists) ScriptApp.newTrigger('checkMilimReminder').timeBased().everyMinutes(5).create();
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
