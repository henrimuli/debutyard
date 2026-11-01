/**
 * The homepage sidebar's order below the advertise prompt: sponsors spread evenly
 * among the regular blocks, starting with a sponsor. `offset` rotates who goes first,
 * so no sponsor always gets the top spot. Pure; any extras fill the earliest gaps.
 */
export function mixSidebar<T>(sponsors: T[], blocks: T[], offset = 0): T[] {
  const start = sponsors.length ? offset % sponsors.length : 0;
  const queue = [...sponsors.slice(start), ...sponsors.slice(0, start)];
  const gaps = blocks.length + 1;
  const out: T[] = [];
  for (let gap = 0; gap < gaps; gap++) {
    const take = Math.floor(sponsors.length / gaps) + (gap < sponsors.length % gaps ? 1 : 0);
    out.push(...queue.splice(0, take));
    if (gap < blocks.length) out.push(blocks[gap]!);
  }
  return out;
}

/** The sidebar's categories: the busiest ten with something in them. The rest are on /categories. */
export function topCategories<T extends { count: number }>(categories: T[], max = 10): T[] {
  return categories
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}
