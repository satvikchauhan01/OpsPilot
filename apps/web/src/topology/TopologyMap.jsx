import { useId, useMemo } from 'react';
import { serviceColor } from '../lib/colors.js';
import { percent, rate } from '../lib/format.js';
import { layoutGraph } from './layout.js';
import styles from './TopologyMap.module.css';

const NODE = { width: 150, height: 56 };
const GAP = { columnGap: 210, rowGap: 84 };
const PAD = 22;
const FAILING_EDGE = 0.05;

/**
 * The service call graph. `suspected` is outlined as the likely origin, and `blastRadius`
 * as everything its failure reaches. Nodes are buttons, so clicking one or pressing
 * Enter focuses it.
 */
export function TopologyMap({ nodes, edges, suspected, blastRadius = [], alerting = [], selected, onSelect }) {
  const markerId = useId();
  const { positions, columns, rows } = useMemo(() => layoutGraph(nodes, edges, GAP), [nodes, edges]);

  const width = (columns - 1) * GAP.columnGap + NODE.width + PAD * 2;
  const height = (rows - 1) * GAP.rowGap + NODE.height + PAD * 2 + 14;
  const impacted = new Set(blastRadius);
  const neighbours = selected ? neighboursOf(selected, edges) : null;

  const roleOf = (id) => {
    if (id === suspected) return 'suspect';
    if (impacted.has(id)) return 'impacted';
    if (alerting.includes(id)) return 'alerting';
    return undefined;
  };

  return (
    <div className={styles.scroller}>
      <svg
        className={styles.map}
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: Math.min(width, 520) }}
        role="group"
        aria-label="Service dependency map"
      >
        <defs>
          <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className={styles.arrow} />
          </marker>
        </defs>

        <g transform={`translate(${PAD},${PAD + 10})`}>
          {edges.map((edge) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const failing = edge.errorRatio > FAILING_EDGE || (edge.target === suspected && impacted.has(edge.source));
            const dimmed = neighbours && !(neighbours.has(edge.source) && neighbours.has(edge.target));
            const startX = from.x + NODE.width;
            const startY = from.y + NODE.height / 2;
            const endX = to.x - 2;
            const endY = to.y + NODE.height / 2;
            const bend = (endX - startX) / 2;
            return (
              <path
                key={`${edge.source}>${edge.target}`}
                className={styles.edge}
                data-failing={failing || undefined}
                data-dimmed={dimmed || undefined}
                d={`M${startX},${startY} C${startX + bend},${startY} ${endX - bend},${endY} ${endX},${endY}`}
                markerEnd={`url(#${markerId})`}
              >
                <title>{`${edge.source} → ${edge.target}: ${rate(edge.rps)}, ${percent(edge.errorRatio)} failing`}</title>
              </path>
            );
          })}

          {nodes.map((node) => {
            const position = positions.get(node.id);
            const external = node.kind === 'external';
            const role = roleOf(node.id);
            const dimmed = neighbours && !neighbours.has(node.id);
            const label = external ? 'customers' : node.id;
            const summary = external
              ? `${rate(incomingFrom(node.id, edges))} incoming`
              : `${rate(node.rps)} · ${percent(node.errorRatio)} errors`;

            return (
              <g
                key={node.id}
                transform={`translate(${position.x},${position.y})`}
                className={styles.node}
                data-role={role}
                data-external={external || undefined}
                data-dimmed={dimmed || undefined}
                data-selected={selected === node.id || undefined}
                role={external ? undefined : 'button'}
                tabIndex={external ? undefined : 0}
                aria-label={external ? undefined : `${label}, ${summary}${role ? `, ${role}` : ''}`}
                aria-pressed={external ? undefined : selected === node.id}
                onClick={external ? undefined : () => onSelect?.(selected === node.id ? null : node.id)}
                onKeyDown={(event) => {
                  if (external || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  onSelect?.(selected === node.id ? null : node.id);
                }}
              >
                <rect className={styles.box} width={NODE.width} height={NODE.height} rx="4" />
                {!external && (
                  <rect
                    className={styles.stripe}
                    width="3"
                    height={NODE.height}
                    rx="1.5"
                    style={{ fill: serviceColor(node.id) }}
                  />
                )}
                <text className={styles.name} x="14" y="23">
                  {label}
                </text>
                <text className={styles.stats} x="14" y="41">
                  {summary}
                </text>
                {(role === 'suspect' || role === 'impacted') && (
                  <text className={styles.badge} x={NODE.width} y="-7">
                    {role === 'suspect' ? 'likely origin' : 'impacted'}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// Traffic an external caller sends into the system, summed over its outgoing edges.
function incomingFrom(id, edges) {
  return edges.filter((edge) => edge.source === id).reduce((sum, edge) => sum + edge.rps, 0);
}

function neighboursOf(id, edges) {
  const set = new Set([id]);
  for (const { source, target } of edges) {
    if (source === id) set.add(target);
    if (target === id) set.add(source);
  }
  return set;
}
