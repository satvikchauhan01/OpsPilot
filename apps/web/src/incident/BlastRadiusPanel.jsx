import { useState } from 'react';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip } from '../components/Tags.jsx';
import { TopologyMap } from '../topology/TopologyMap.jsx';
import { latency, percent, rate } from '../lib/format.js';
import styles from './BlastRadiusPanel.module.css';

export function BlastRadiusPanel({ topology }) {
  const [selected, setSelected] = useState(null);

  return (
    <Panel title="Blast radius" meta="calls between services, from traces">
      <QueryState query={topology} loadingLabel="Reading the service graph">
        {(graph) => {
          if (graph.nodes.length === 0) {
            return <Empty title="No traffic in this window">The graph is built from traces around the incident.</Empty>;
          }
          const focus = graph.nodes.find((node) => node.id === selected);
          return (
            <>
              <TopologyMap
                nodes={graph.nodes}
                edges={graph.edges}
                suspected={graph.suspected}
                blastRadius={graph.blastRadius}
                alerting={graph.alerting}
                selected={selected}
                onSelect={setSelected}
              />
              <div className={styles.summary}>
                {focus ? (
                  <p>
                    <ServiceChip service={focus.id} emphasis /> {rate(focus.rps)} · {percent(focus.errorRatio)} errors ·
                    p95 {latency(focus.p95)}
                  </p>
                ) : (
                  <p>
                    {graph.suspected ? (
                      <>
                        Failure most likely starts at <ServiceChip service={graph.suspected} emphasis />
                        {graph.blastRadius.length > 0 ? (
                          <>
                            {' '}
                            and reaches{' '}
                            {graph.blastRadius.map((service, index) => (
                              <span key={service} className={styles.listItem}>
                                {index > 0 && (index === graph.blastRadius.length - 1 ? 'and ' : ', ')}
                                <ServiceChip service={service} />
                              </span>
                            ))}
                          </>
                        ) : (
                          ', and nothing calls it'
                        )}
                      </>
                    ) : (
                      'No suspected service yet.'
                    )}
                  </p>
                )}
              </div>
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}
