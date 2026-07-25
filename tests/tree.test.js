const test = require('node:test');
const assert = require('node:assert/strict');
const { stageFor, growthFor, nextGrowth, renderTree, longestStreak } = require('../src/tree');

test('learning tree moves through the expected streak milestones', () => {
  assert.equal(stageFor(0).key, 'seed');
  assert.equal(stageFor(1).key, 'sprout');
  assert.equal(stageFor(7).key, 'young-tree');
  assert.equal(stageFor(30).key, 'blooming');
  assert.equal(stageFor(100).key, 'heirloom');
});

test('tree size grows monotonically with the streak', () => {
  const samples = [0, 1, 3, 7, 14, 30, 60, 100].map(growthFor);
  samples.slice(1).forEach((value, index) => assert.ok(value > samples[index]));
});

test('flowers appear after seven days and increase on a long streak', () => {
  const seed = renderTree(0);
  const week = renderTree(7);
  const longStreak = renderTree(60);
  assert.equal((seed.match(/class="tree-flower"/g) || []).length, 0);
  assert.equal((week.match(/class="tree-flower"/g) || []).length, 1);
  assert.ok((longStreak.match(/class="tree-flower"/g) || []).length > 10);
  assert.match(longStreak, /data-stage="grand"/);
});

test('next milestone reports remaining days and stage progress', () => {
  const growth = nextGrowth(10);
  assert.equal(growth.target.min, 14);
  assert.equal(growth.remaining, 4);
  assert.equal(growth.progress, 43);
});

test('longest streak finds the best historical run', () => {
  const dates = new Set(['2026-07-01', '2026-07-02', '2026-07-04', '2026-07-05', '2026-07-06']);
  assert.equal(longestStreak(dates), 3);
});
