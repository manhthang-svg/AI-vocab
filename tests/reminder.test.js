const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReminderUrl, validateReminderEmail, validateReminderTime, normalizeReminderDate } = require('../src/reminder');

test('accepts only deployed Google Apps Script web app URLs', () => {
  assert.equal(validateReminderUrl('https://script.google.com/macros/s/example-deployment/exec'), 'https://script.google.com/macros/s/example-deployment/exec');
  assert.throws(() => validateReminderUrl('http://script.google.com/macros/s/example/exec'));
  assert.throws(() => validateReminderUrl('https://example.com/macros/s/example/exec'));
});

test('validates email reminder inputs', () => {
  assert.equal(validateReminderEmail(' Learner@Example.com '), 'learner@example.com');
  assert.equal(validateReminderTime('23:00'), '23:00');
  assert.equal(normalizeReminderDate('2026-08-22'), '2026-08-22');
  assert.throws(() => validateReminderEmail('not-an-email'));
  assert.throws(() => validateReminderTime('24:00'));
  assert.throws(() => normalizeReminderDate('22/08/2026'));
});
