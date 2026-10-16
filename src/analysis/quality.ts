/**
 * Checks for numbers that may be misleading: values far outside the normal
 * range, very old balance sheets, and holding companies whose standalone
 * results don't reflect the group. A flagged number is shown with a "check"
 * note and can't on its own make Sahm say Review.
 */
import type { CompanyInfo } from '../psx/types';
import type { BalanceSheet, Ratios } from './ratios';

export interface DataChecks {
  /** plain warnings to show */
  notes: string[];
  /** standalone results of a holding or investment company */
  holdingCompany: boolean;
  /** last year's profit moved so much it may be a one-off or a restatement */
  profitSwing: boolean;
  /** the debt figure is unusual enough to verify in the report */
  debtOdd: boolean;
}

const pc = (v: number) => `${(v * 100).toFixed(0)}%`;
const HOLDING = /inv\. banks|inv\. cos|investment|holding/i;

export function dataChecks(x: { symbol: string; name?: string | null; sector?: string | null; company: CompanyInfo | null; balance: BalanceSheet | null; ratios: Ratios | null; now?: number }): DataChecks {
  const notes: string[] = [];
  const holdingCompany = HOLDING.test(x.sector ?? '') || /holdings?\b/i.test(x.name ?? x.company?.name ?? '');
  if (holdingCompany)
    notes.push("A holding or investment company: PSX shows its standalone results, which mostly reflect dividends from its subsidiaries. Check the group's consolidated results before judging the business.");

  const profit = x.company?.financialsAnnual?.rows.find((r) => /profit after/i.test(r.label))?.values ?? [];
  const [p0, p1] = [profit[0], profit[1]];
  let profitSwing = false;
  if (p0 != null && p1 != null && p1 > 0 && p0 > 0) {
    const ch = p0 / p1 - 1;
    if (ch <= -0.8 || ch >= 3) {
      profitSwing = true;
      notes.push(`Profit changed ${ch > 0 ? '+' : ''}${pc(ch)} in a year. That is often a one-off item, a restatement or a change in the group's structure; read the results before relying on it.`);
    }
  }

  const bs = x.balance;
  // Banks take deposits and borrow as their business; the extractor doesn't always mark them.
  const bank = !!bs?.isBank || /commercial bank/i.test(x.sector ?? '');
  let debtOdd = false;
  if (bs) {
    const page = bs.source.pages?.length ? ` (page ${bs.source.pages.join(', ')} of the report)` : '';
    if (!bank && x.ratios?.debtToEquity != null && x.ratios.debtToEquity > 2) {
      debtOdd = true;
      notes.push(`Borrowings read as ${pc(x.ratios.debtToEquity)} of equity${page}. Some businesses do borrow this much, often seasonally, but it is unusual enough to check.`);
    }
    if (!bank && bs.assets > 0 && bs.equity / bs.assets < 0.05) notes.push(`Equity is only ${pc(bs.equity / bs.assets)} of assets${page}; check the report.`);
    if (x.ratios?.roe != null && x.ratios.roe > 0.6) notes.push(`Return on equity works out at ${pc(x.ratios.roe)}, which is rare; equity may be from a different date than the profit.`);
    const end = bs.periodEnd ? Date.parse(bs.periodEnd + 'T12:00:00Z') : NaN;
    if (Number.isFinite(end) && (x.now ?? Date.now()) - end > 15 * 30 * 864e5) notes.push(`The balance sheet is from ${bs.periodEnd}, more than a year old.`);
  }
  return { notes, holdingCompany, profitSwing, debtOdd };
}
