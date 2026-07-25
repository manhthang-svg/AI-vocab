const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyCard, fsrs, Rating, State } = require('ts-fsrs');

const START = new Date('2026-01-01T00:00:00.000Z');

function scheduler(retention = 0.9) {
  return fsrs({
    request_retention: retention,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m']
  });
}

test('FSRS creates four increasingly distant outcomes for a new word', () => {
  const preview = scheduler().repeat(createEmptyCard(START), START);
  const due = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
    .map((rating) => preview[rating].card.due.getTime());

  assert.ok(due[0] < due[1]);
  assert.ok(due[1] < due[2]);
  assert.ok(due[2] < due[3]);
  assert.equal(preview[Rating.Good].card.state, State.Learning);
  assert.equal(preview[Rating.Easy].card.state, State.Review);
});

test('a higher retention target schedules the same learned word sooner', () => {
  const base = scheduler();
  let card = createEmptyCard(START);
  card = base.next(card, START, Rating.Good).card;
  card = base.next(card, card.due, Rating.Good).card;
  const reviewAt = card.due;

  const relaxed = scheduler(0.85).next(card, reviewAt, Rating.Good).card;
  const strict = scheduler(0.95).next(card, reviewAt, Rating.Good).card;

  assert.ok(strict.scheduled_days < relaxed.scheduled_days);
});

test('forgetting a review word records a lapse and enters relearning', () => {
  const engine = scheduler();
  let card = createEmptyCard(START);
  card = engine.next(card, START, Rating.Easy).card;
  const forgotten = engine.next(card, card.due, Rating.Again).card;

  assert.equal(forgotten.lapses, 1);
  assert.equal(forgotten.state, State.Relearning);
  assert.ok(forgotten.difficulty >= card.difficulty);
});

test('persisted ISO dates can be restored and scheduled again', () => {
  const engine = scheduler();
  const learned = engine.next(createEmptyCard(START), START, Rating.Easy).card;
  const persisted = {
    ...learned,
    due: learned.due.toISOString(),
    last_review: learned.last_review.toISOString()
  };

  const next = engine.next(persisted, persisted.due, Rating.Good).card;
  assert.equal(next.reps, 2);
  assert.ok(next.stability > learned.stability);
});
