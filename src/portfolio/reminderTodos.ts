/** Home to-dos from your own reminders: notes due for a check (and the monthly investing day, see plan.ts). */
import { useMemo } from 'react';
import { dueNotes } from './noteDates';
import { notesPref } from './notes';
import type { TodoItem } from './summary';

export function useReminderTodos(): TodoItem[] {
  const notes = notesPref.use();
  return useMemo(() => {
    const due = dueNotes(notes);
    return due.slice(0, 2).map((s) => ({ key: `note-${s}`, text: `${s}: time to check your note`, tone: 'gold' as const, symbol: s }));
  }, [notes]);
}
