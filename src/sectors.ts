/** Short sector names for tight spaces (tiles, legends). */
export function shortSector(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('commercial bank')) return 'Banks';
  if (n.includes('oil & gas exploration')) return 'Oil & Gas E&P';
  if (n.includes('oil & gas marketing')) return 'Oil Marketing';
  if (n.includes('power generation')) return 'Power';
  if (n.includes('technology')) return 'Technology';
  if (n.includes('inv. banks') || n.includes('investment')) return 'Investment';
  if (n.includes('food')) return 'Food';
  if (n.includes('pharma')) return 'Pharma';
  if (n.includes('automobile')) return 'Autos';
  if (n.includes('chemical')) return 'Chemicals';
  if (n.includes('textile')) return 'Textiles';
  if (n.includes('insurance')) return 'Insurance';
  if (n.includes('engineering')) return 'Engineering';
  if (n.includes('refinery')) return 'Refinery';
  if (n.includes('cement')) return 'Cement';
  if (n.includes('fertilizer')) return 'Fertilizer';
  return name.length > 16 ? name.slice(0, 15) + '…' : name;
}
