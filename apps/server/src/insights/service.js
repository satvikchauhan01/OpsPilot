import { Action } from '../models/action.js';
import { Incident } from '../models/incident.js';
import { Investigation } from '../models/investigation.js';
import { LlmUsage } from '../models/llm-usage.js';
import { Postmortem } from '../models/postmortem.js';
import { summarize, utcDay } from './stats.js';

const DAY_MS = 24 * 3600_000;

// Loads everything about the incidents that started in the last `days` and summarises it.
// The collections are small (a demo runs a few incidents a day), so one pass in memory is
// simpler than an aggregation per number.
export async function incidentInsights(days) {
  const until = new Date();
  const since = new Date(until - days * DAY_MS);

  const incidents = await Incident.find(
    { startedAt: { $gte: since } },
    'number title severity status suspectedService startedAt resolvedAt',
  )
    .sort({ startedAt: 1 })
    .lean();
  const ids = incidents.map((incident) => incident._id);

  const [investigations, actions, postmortems, usage] = await Promise.all([
    Investigation.find(
      { incident: { $in: ids } },
      'incident status startedAt finishedAt usage result.hypotheses.causeType result.hypotheses.confidence',
    ).lean(),
    Action.find({ incident: { $in: ids } }, 'incident status type source.kind finishedAt').lean(),
    Postmortem.find({ incident: { $in: ids } }, 'incident status').lean(),
    LlmUsage.find({ day: { $gte: utcDay(since) } })
      .sort({ day: 1 })
      .lean(),
  ]);

  return summarize({ incidents, investigations, actions, postmortems, usage, since, until });
}
