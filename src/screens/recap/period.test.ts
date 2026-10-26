import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueRecap, daysInPeriod, monthPeriod, monthPeriodAround, previousPeriod, yearPeriod } from './period';

test('a month runs from its first day to the first of the next', () => {
  const october = monthPeriod(new Date(2026, 9, 15));
  assert.equal(october.key, '2026-10');
  assert.equal(october.label, 'October 2026');
  assert.equal(new Date(october.from).getDate(), 1);
  assert.equal(new Date(october.to).getMonth(), 10);
  assert.equal(daysInPeriod(october), 31);
});

test('the span before a month is the month before it, and before January is December', () => {
  assert.equal(previousPeriod(monthPeriod(new Date(2026, 9, 1))).key, '2026-09');
  assert.equal(previousPeriod(monthPeriod(new Date(2026, 0, 1))).key, '2025-12');
  assert.equal(previousPeriod(yearPeriod(new Date(2026, 5, 1))).key, '2025');
});

test('a month is offered on its last day and for three days after', () => {
  assert.equal(dueRecap(new Date(2026, 9, 31, 20))?.key, '2026-10');
  assert.equal(dueRecap(new Date(2026, 10, 1, 9))?.key, '2026-10');
  assert.equal(dueRecap(new Date(2026, 10, 3, 23))?.key, '2026-10');
  assert.equal(dueRecap(new Date(2026, 10, 4, 9)), null);
  assert.equal(dueRecap(new Date(2026, 9, 15)), null);
  // February, short and in a leap year.
  assert.equal(dueRecap(new Date(2027, 1, 28))?.key, '2027-02');
  assert.equal(dueRecap(new Date(2028, 1, 28)), null);
  assert.equal(dueRecap(new Date(2028, 1, 29))?.key, '2028-02');
});

test('the year takes over from the middle of December until the first week of January', () => {
  assert.equal(dueRecap(new Date(2026, 11, 16)), null);
  assert.equal(dueRecap(new Date(2026, 11, 17))?.key, '2026');
  // December's own last day gives the year, not the month.
  assert.equal(dueRecap(new Date(2026, 11, 31, 23))?.key, '2026');
  assert.equal(dueRecap(new Date(2027, 0, 7))?.key, '2026');
  assert.equal(dueRecap(new Date(2027, 0, 8)), null);
});

test('Settings offers the month just gone, or this one on its last day', () => {
  assert.equal(monthPeriodAround(new Date(2026, 9, 15)).key, '2026-09');
  assert.equal(monthPeriodAround(new Date(2026, 9, 31)).key, '2026-10');
  assert.equal(monthPeriodAround(new Date(2026, 0, 2)).key, '2025-12');
});
