/** Takes up to `n` items, one from each group in turn, so a big group can't crowd out the others. Pure. */
export function roundRobin<T>(groups: T[][], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < n; i++) {
    const row = groups.filter((g) => i < g.length).map((g) => g[i]);
    if (row.length === 0) break;
    out.push(...row);
  }
  return out.slice(0, n);
}
