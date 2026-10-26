/**
 * The monthly investing plan: "Rs 20,000 on the 5th". On that day (the next
 * trading day if it's a weekend or holiday) a reminder opens Rebalance with
 * the amount filled in, so the money goes where your targets say.
 */
import { makePref } from '../prefs';
import { cancelReminder, morningOf, remind } from '../notify';
import { NO_PLAN, nextPlanDays, planDue, thisMonth, type MonthlyPlan } from './planDates';

export { planDue, type MonthlyPlan };
export const planPref = makePref<MonthlyPlan>('real.monthlyPlan', NO_PLAN);

const IDS = ['plan-0', 'plan-1', 'plan-2'];

/** Reminders for the next three plan days (replacing any set before). */
export async function schedulePlan(plan?: MonthlyPlan) {
  const p = plan ?? (await planPref.get());
  for (const id of IDS) await cancelReminder(id);
  if (!p.on || !(p.amount > 0)) return;
  const amount = `Rs ${Math.round(p.amount).toLocaleString('en-US')}`;
  const days = nextPlanDays(p.day).filter((d) => !(p.doneMonth && d.startsWith(p.doneMonth)));
  for (let i = 0; i < days.length; i++) await remind(IDS[i], morningOf(days[i]), `Time to invest ${amount}`, 'Your monthly plan: tap to see exactly what to buy.', `sahm://rebalance?cash=${Math.round(p.amount)}`);
}

export async function setPlan(p: MonthlyPlan) {
  await planPref.set(p);
  await schedulePlan(p);
}

export async function markPlanDone(now = Date.now()) {
  const p = await planPref.get();
  await setPlan({ ...p, doneMonth: thisMonth(now) });
}
