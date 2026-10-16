/** Runs `fn` over the items with at most `n` running at once; stops starting new ones when `go()` turns false. */
export async function eachLimit<T>(items: T[], n: number, fn: (item: T) => Promise<void>, go: () => boolean = () => true): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && go()) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
