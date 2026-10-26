/** Home to-dos from your own reminders: notes due for a check (and the monthly investing day, see plan.ts). */
import { useMemo } from 'react';
import { dueNotes } from './noteDates';
import { notesPref } from './notes';
import type { TodoItem } from './summary';
import { planDue, planPref } from './monthlyPlan';

export function useReminderTodos(): TodoItem[] {
  const notes = notesPref.use();
  const plan = planPref.use();
  return useMemo(() => {
    const out: TodoItem[] = [];
    if (planDue(plan)) out.push({ key: 'plan', text: `Invest your Rs ${Math.round(plan.amount).toLocaleString('en-US')} for this month: see what to buy`, tone: 'up', route: 'Rebalance' });
    for (const s of dueNotes(notes).slice(0, 2)) out.push({ key: `note-${s}`, text: `${s}: time to check your note`, tone: 'gold', symbol: s });
    return out;
  }, [notes, plan]);
}
