const test = require('node:test');
const assert = require('node:assert/strict');
const analyzer = require('../src/script-analyzer');

test('keeps uncertain words intact and only lemmatizes trusted forms', () => {
  assert.equal(analyzer.lemma('scrutinized'), 'scrutinize');
  assert.equal(analyzer.lemma('proposals'), 'proposal');
  assert.equal(analyzer.lemma('studies'), 'study');
  assert.equal(analyzer.lemma('unanimous'), 'unanimous');
  assert.notEqual(analyzer.lemma('unanimous'), 'unanimou');
});

test('cleans subtitle metadata and extracts contextual vocabulary', () => {
  const result = analyzer.analyze(`
    12
    00:00:01,000 --> 00:00:03,000
    <i>The committee scrutinized the proposals.</i>
    13
    00:00:03,100 --> 00:00:06,000
    They reached a unanimous consensus.
  `, { profileLevel: 'B1' });
  const terms = result.items.map((item) => item.term);
  assert.ok(terms.includes('scrutinize'));
  assert.ok(terms.includes('unanimous'));
  assert.ok(terms.includes('consensus'));
  assert.ok(!terms.includes('scrutiniz'));
  assert.ok(!terms.includes('unanimou'));
  assert.equal(result.stats.sentences, 2);
});

test('uses learning history and ignored terms when ranking suggestions', () => {
  const result = analyzer.analyze('A significant proposal can have a significant impact.', {
    profileLevel: 'B1',
    ignoredTerms: ['proposal'],
    knowledge: new Map([['impact', { lapses: 3, stability: 2 }]])
  });
  assert.ok(!result.items.some((item) => item.term === 'proposal'));
  assert.equal(result.items[0].term, 'impact');
  assert.ok(result.items[0].reasons.some((reason) => reason.includes('từng quên')));
});

test('detects useful multi-word phrases', () => {
  const result = analyzer.analyze('We need to take into account the long-term impact. As a result, the plan may change.', { profileLevel: 'A2' });
  const terms = result.items.map((item) => item.term);
  assert.ok(terms.includes('take into account'));
  assert.ok(terms.includes('as a result'));
});
