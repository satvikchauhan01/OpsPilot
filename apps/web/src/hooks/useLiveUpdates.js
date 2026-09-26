import { useEffect, useEffectEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// One EventSource per tab. Server events mark the matching cached queries stale, so every
// screen refreshes on its own without polling. The browser reconnects automatically if
// the stream drops, and `status` reflects that for the "live" indicator.
export function useLiveUpdates(onEvent) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('connecting');
  const notify = useEffectEvent((type, data) => onEvent?.(type, data));

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('reconnecting');

    const refresh = (...keys) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    const handlers = {
      'incident.created': () => refresh(['incidents'], ['services']),
      'incident.updated': (incident) =>
        refresh(
          ['incidents'],
          ['services'],
          ['incident', incident.number],
          ['timeline', incident.number],
          ['incident-runbooks', incident.number],
          ['similar-incidents', incident.number],
        ),
      change: () => refresh(['changes'], ['timeline']),
      'investigation.updated': ({ incidentNumber, status }) => {
        refresh(['investigation', incidentNumber], ['timeline', incidentNumber]);
        // A finished investigation adds a root cause, which sharpens both searches.
        if (status === 'completed') {
          refresh(['incident-runbooks', incidentNumber], ['similar-incidents', incidentNumber]);
        }
      },
    };

    for (const [type, handle] of Object.entries(handlers)) {
      source.addEventListener(type, (event) => {
        const data = JSON.parse(event.data);
        handle(data);
        notify(type, data);
      });
    }
    return () => source.close();
  }, [queryClient]);

  return status;
}
