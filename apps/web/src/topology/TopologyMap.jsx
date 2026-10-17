import { useId, useMemo, useState } from 'react';
import { serviceColor } from '../lib/colors.js';
import { percent, rate } from '../lib/format.js';
import { useReducedMotion } from '../hooks/useMediaQuery.js';
import { layoutGraph } from './layout.js';
import styles from './TopologyMap.module.css';

const NODE = { width: 156, height: 58 };
const GAP = { columnGap: 220, rowGap: 88 };
const PAD = 24;
const FAILING_EDGE = 0.05;

/**
 * The service call graph, drawn from traces. Requests travel along the edges as small
 * packets: more traffic sends more of them, faster, and the share of failing calls turns
 * that share of packets red. `health` colours each service (ok, warning, critical);
 * `suspected` marks the likely origin and `blastRadius` everything its failure reaches.
 * Pointing at a service highlights who it talks to; clicking it calls `onOpen`.
 */
export function TopologyMap({ nodes, edges, health = {}, suspected, blastRadius = [], onOpen, animated = true }) {
  const id = useId();
  const still = useReducedMotion() || !animated;
  const [hovered, setHovered] = useState(null);
  const { positions, columns, rows } = useMemo(() => layoutGraph(nodes, edges, GAP), [nodes, edges]);

  const width = (columns - 1) * GAP.columnGap + NODE.width + PAD * 2;
  const height = (rows - 1) * GAP.rowGap + NODE.height + PAD * 2 + 14;
  const impacted = new Set(blastRadius);
  const neighbours = hovered ? neighboursOf(hovered, edges) : null;

  const roleOf = (node) => {
    if (node === suspected) return 'suspect';
    if (impacted.has(node)) return 'impacted';
    return undefined;
  };

  return (
    <div className={styles.scroller}>
      <svg
        className={styles.map}
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: Math.min(width, 560) }}
        role="group"
        aria-label="Service dependency map"
      >
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className={styles.arrow} />
          </marker>
        </defs>

        <g transform={`translate(${PAD},${PAD + 10})`}>
          {edges.map((edge, index) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const failing = edge.failing ?? edge.errorRatio > FAILING_EDGE;
            const dimmed = neighbours && !(neighbours.has(edge.source) && neighbours.has(edge.target));
            const pathId = `${id}-edge-${index}`;
            return (
              <g key={`${edge.source}>${edge.target}`} className={styles.link} data-dimmed={dimmed || undefined}>
                <path
                  id={pathId}
                  className={styles.edge}
                  data-failing={failing || undefined}
                  d={curve(from, to)}
                  strokeWidth={edgeWidth(edge.rps)}
                  markerEnd={`url(#${id}-arrow)`}
                >
                  <title>{`${edge.source === 'user' ? 'customers' : edge.source} → ${edge.target}: ${rate(edge.rps)}, ${percent(edge.errorRatio)} failing`}</title>
                </path>
                {!still && <Packets pathId={pathId} rps={edge.rps} errorRatio={edge.errorRatio ?? (failing ? 1 : 0)} />}
              </g>
            );
          })}

          {nodes.map((node) => {
            const position = positions.get(node.id);
            const external = node.kind === 'external';
            const role = roleOf(node.id);
            const state = health[node.id] ?? 'ok';
            const dimmed = neighbours && !neighbours.has(node.id);
            const label = external ? 'customers' : node.id;
            const summary = external
              ? `${rate(incomingFrom(node.id, edges))} incoming`
              : `${rate(node.rps)} · ${percent(node.errorRatio)} err`;
            const note = node.note ?? summary;
            const interactive = !external && onOpen;

            return (
              <g
                key={node.id}
                transform={`translate(${position.x},${position.y})`}
                className={styles.node}
                data-role={role}
                data-state={external ? undefined : state}
                data-external={external || undefined}
                data-dimmed={dimmed || undefined}
                data-interactive={interactive || undefined}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={external ? undefined : `${label}: ${summary}${role ? `, ${role}` : ''}. Open details`}
                onPointerEnter={() => !external && setHovered(node.id)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => !external && setHovered(node.id)}
                onBlur={() => setHovered(null)}
                onClick={interactive ? () => onOpen(node.id) : undefined}
                onKeyDown={(event) => {
                  if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  onOpen(node.id);
                }}
              >
                <rect className={styles.box} width={NODE.width} height={NODE.height} rx="4" />
                {!external && (
                  <>
                    <rect
                      className={styles.stripe}
                      width="3"
                      height={NODE.height}
                      rx="1.5"
                      style={{ fill: serviceColor(node.id) }}
                    />
                    <HealthMark state={state} x={NODE.width - 16} y={14} />
                  </>
                )}
                <text className={styles.name} x="14" y="24">
                  {label}
                </text>
                <text className={styles.stats} x="14" y="43" data-alert={node.note ? true : undefined}>
                  {note}
                </text>
                {role && (
                  <text className={styles.badge} x={NODE.width} y="-8">
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

// Request packets riding an edge. Busier edges carry more of them, faster; a failing share
// of the calls shows up as that share of red packets.
function Packets({ pathId, rps, errorRatio }) {
  if (!rps || rps <= 0) return null;
  const count = Math.max(1, Math.min(4, Math.round(Math.log2(1 + rps))));
  // In steps, so small changes in traffic don't restart the animation
  const seconds = Math.round(Math.max(1.1, 3.4 - Math.log10(1 + rps) * 1.4) * 5) / 5;
  const failing = errorRatio > FAILING_EDGE ? Math.max(1, Math.round(count * errorRatio)) : 0;

  return Array.from({ length: count }, (_, i) => (
    <circle key={i} r="2.6" className={styles.packet} data-failing={i < failing || undefined}>
      <animateMotion dur={`${seconds}s`} begin={`${(-seconds * i) / count}s`} repeatCount="indefinite">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </circle>
  ));
}

// Status shapes, as everywhere in the console: circle ok, triangle warning, square critical.
function HealthMark({ state, x, y }) {
  if (state === 'critical')
    return <rect className={styles.health} data-state={state} x={x - 4} y={y - 4} width="8" height="8" rx="1" />;
  if (state === 'warning') {
    return (
      <path className={styles.health} data-state={state} d={`M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4} Z`} />
    );
  }
  return <circle className={styles.health} data-state="ok" cx={x} cy={y} r="4" />;
}

function curve(from, to) {
  const startX = from.x + NODE.width;
  const startY = from.y + NODE.height / 2;
  const endX = to.x - 2;
  const endY = to.y + NODE.height / 2;
  const bend = (endX - startX) / 2;
  return `M${startX},${startY} C${startX + bend},${startY} ${endX - bend},${endY} ${endX},${endY}`;
}

function edgeWidth(rps) {
  return 1.25 + Math.min(2.5, Math.log10(1 + (rps ?? 0)) * 1.5);
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
