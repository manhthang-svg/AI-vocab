const test = require('node:test');
const assert = require('node:assert/strict');
const ability = require('../src/ability');
const analyzer = require('../src/script-analyzer');

test('adaptive assessment raises or lowers ability from item difficulty', () => {
  const item = ability.ITEMS.find((candidate) => candidate.level === 'B1');
  const raised = ability.updateAbility(3, item, true);
  const lowered = ability.updateAbility(3, item, false);
  assert.ok(raised > 3);
  assert.ok(lowered < 3);
  assert.equal(ability.abilityToLevel(4.1), 'B2');
});

test('assessment produces a bounded confidence profile', () => {
  const answers = ability.ITEMS.slice(0, 18).map((item, index) => ({ difficulty: item.difficulty, correct: index % 3 !== 0 }));
  const result = ability.assessmentResult({ ability: 3.7, answers });
  assert.equal(result.answered, 18);
  assert.ok(result.confidence >= 0.5 && result.confidence <= 0.9);
  assert.ok(ability.LEVELS.includes(result.level));
});

test('term knowledge combines explicit feedback with later review evidence', () => {
  const known = ability.updateKnowledge(null, 0.99, 'known', '2026-01-01T00:00:00.000Z');
  const forgotten = ability.updateKnowledge(known, ability.reviewObservation('again'), 'review', '2026-01-02T00:00:00.000Z');
  assert.ok(known.probability > 0.8);
  assert.ok(forgotten.probability < known.probability);
  assert.equal(forgotten.source, 'review');
});

test('strict script filtering suppresses likely-known words for a B2 learner', () => {
  const source = 'The environment may have significant consequences, so researchers scrutinize every proposal.';
  const strict = analyzer.analyze(source, { profileLevel: 'B2', ability: 4, filterMode: 'strict' });
  assert.ok(strict.items.some((item) => item.term === 'scrutinize'));
  assert.ok(!strict.items.some((item) => item.term === 'environment'));

  const corrected = analyzer.analyze(source, {
    profileLevel: 'B2', ability: 4, filterMode: 'strict',
    termProbabilities: { consequence: { probability: 0.05, evidence: 2 } }
  });
  assert.ok(corrected.items.some((item) => item.term === 'consequence'));
});
