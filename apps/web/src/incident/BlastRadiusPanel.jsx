import { useNavigate } from 'react-router';
import { Panel } from '../components/Panel.jsx';
import { Empty, QueryState } from '../components/States.jsx';
import { ServiceChip } from '../components/Tags.jsx';
import { TopologyMap } from '../topology/TopologyMap.jsx';
import { useServiceLink } from '../services/serviceLink.js';
import { nodeHealth } from '../topology/health.js';
import styles from './BlastRadiusPanel.module.css';

export function BlastRadiusPanel({ topology, live }) {
  const navigate = useNavigate();
  const serviceLink = useServiceLink();

  return (
    <Panel
      title="Blast radius"
      meta={live ? 'calls between services, now' : 'calls between services at the last alert'}
      id="blast-radius"
    >
      <QueryState query={topology} loadingLabel="Reading the service graph">
        {(graph) => {
          if (graph.nodes.length === 0) {
            return <Empty title="No traffic in this window">The graph is built from traces around the incident.</Empty>;
          }
          return (
            <>
              <TopologyMap
                nodes={graph.nodes}
                edges={graph.edges}
                health={nodeHealth(graph.nodes)}
                suspected={graph.suspected}
                blastRadius={graph.blastRadius}
                animated={live}
                onOpen={(name) => navigate(serviceLink(name))}
              />
              <p className={styles.summary}>
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
                        .
                      </>
                    ) : (
                      ', and nothing calls it.'
                    )}
                  </>
                ) : (
                  'No suspected service yet.'
                )}
              </p>
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}
