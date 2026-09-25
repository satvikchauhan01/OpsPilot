// Left-to-right layered layout for a small call graph. Each node's column is the length of
// the longest path leading to it, so every call points rightwards. Within a column, nodes
// sit near the average position of their callers, which keeps edges from crossing.
export function layoutGraph(nodes, edges, { columnGap, rowGap }) {
  const ids = new Set(nodes.map((node) => node.id));
  const callers = new Map([...ids].map((id) => [id, []]));
  for (const { source, target } of edges) {
    if (ids.has(source) && ids.has(target) && source !== target) callers.get(target).push(source);
  }

  const column = new Map();
  const visiting = new Set();
  const columnOf = (id) => {
    if (column.has(id)) return column.get(id);
    if (visiting.has(id)) return 0; // a cycle: stop climbing rather than loop forever
    visiting.add(id);
    const parents = callers.get(id);
    const value = parents.length > 0 ? Math.max(...parents.map((parent) => columnOf(parent) + 1)) : 0;
    visiting.delete(id);
    column.set(id, value);
    return value;
  };
  ids.forEach(columnOf);

  const columns = [];
  for (const [id, index] of column) (columns[index] ??= []).push(id);

  const row = new Map();
  for (const members of columns) {
    const average = (id) => {
      const rows = callers
        .get(id)
        .filter((parent) => row.has(parent))
        .map((parent) => row.get(parent));
      return rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
    };
    members.sort((a, b) => average(a) - average(b) || a.localeCompare(b));
    members.forEach((id, index) => row.set(id, index - (members.length - 1) / 2));
  }

  const tallest = Math.max(1, ...columns.map((members) => members.length));
  const positions = new Map(
    [...ids].map((id) => [id, { x: column.get(id) * columnGap, y: (row.get(id) + (tallest - 1) / 2) * rowGap }]),
  );
  return { positions, columns: columns.length, rows: tallest };
}
