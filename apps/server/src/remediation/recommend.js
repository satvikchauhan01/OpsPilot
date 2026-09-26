import { MAX_REPLICAS } from './catalog.js';

// The investigator's suggested actions, in the catalog's terms.
const FROM_SUGGESTION = { rollback: 'rollback', restart: 'restart', scale_up: 'scale' };

/**
 * Turns the top root-cause hypothesis into an action from the catalog: the investigator's own
 * suggestion when it names one, otherwise the first fix the runbooks for that cause recommend.
 * Returns null when neither gives one, e.g. for a cause nobody knows how to fix automatically.
 *
 * `currentReplicas` sizes a scale-up the model didn't size itself: twice as many, capped.
 */
export function recommend(hypothesis, { runbookActions = [], currentReplicas }) {
  const type = FROM_SUGGESTION[hypothesis.suggestedAction] ?? runbookActions[0];
  if (!type) return null;

  const params = { service: hypothesis.service };
  if (type === 'scale') {
    const suggested = hypothesis.suggestedAction === 'scale_up' ? hypothesis.replicas : undefined;
    const replicas = suggested > currentReplicas ? suggested : Math.min(MAX_REPLICAS, currentReplicas * 2);
    if (!(replicas > currentReplicas)) return null;
    params.replicas = Math.min(MAX_REPLICAS, replicas);
  }
  return { type, params };
}
