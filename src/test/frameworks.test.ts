import { describe, expect, it } from 'vitest';
import { frameworkDraft, checklistFromFramework } from '@/lib/frameworks';
import { setLabel, setStatusAt } from '@/lib/zchecklist';

describe('reusable framework rules', () => {
  it.each([5, 30, 45, 100])('preserves exactly %i members', (count) => {
    const f = frameworkDraft('Class 8A', String(count), {});
    expect(f.member_count).toBe(count);
    expect(checklistFromFramework(f, 'Monday', '2026-11-08', 'attendance').statuses).toBe('u'.repeat(count));
  });
  it('rejects counts above the existing 100 maximum', () => {
    expect(() => frameworkDraft('Class', '101', {})).toThrow();
  });
  it('preserves numbered labels and starts every day unmarked', () => {
    const f = frameworkDraft('Class 8A', '30', { '1': 'Rahul', '30': 'Ananya' });
    const monday = checklistFromFramework(f, 'Monday', '2026-11-08', 'attendance');
    const tuesday = checklistFromFramework(f, 'Tuesday', '2026-11-09', 'attendance');
    monday.statuses = setStatusAt(monday.statuses, 1, 'd');
    monday.labels = setLabel(monday.labels, 1, 'Priya');
    expect(tuesday.statuses).toBe('u'.repeat(30));
    expect(tuesday.labels).toEqual({ '1': 'Rahul', '30': 'Ananya' });
    expect(f.labels).toEqual({ '1': 'Rahul', '30': 'Ananya' });
  });
  it('saves only members inside the selected count', () => {
    expect(frameworkDraft('Class', '5', { '5': 'Rahul', '30': 'Ananya' }).labels).toEqual({ '5': 'Rahul' });
  });
});