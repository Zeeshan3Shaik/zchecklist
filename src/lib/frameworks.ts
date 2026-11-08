import { blankStatuses, type Category, type Labels, validateChecklistName, validateCount } from './zchecklist';

export function frameworkDraft(name: string, count: string, labels: Labels) {
  const n = validateChecklistName(name), c = validateCount(count);
  if (!n.ok) throw new Error(n.error);
  if (!c.ok) throw new Error(c.error);
  return { name: n.value, member_count: c.value, labels: Object.fromEntries(Object.entries(labels).filter(([key]) => Number(key) >= 1 && Number(key) <= c.value)) };
}

export function checklistFromFramework(framework: { member_count: number; labels: Labels }, name: string, date: string, category: Category) {
  return { name, checklist_date: date, category, member_count: framework.member_count, labels: { ...framework.labels }, statuses: blankStatuses(framework.member_count) };
}