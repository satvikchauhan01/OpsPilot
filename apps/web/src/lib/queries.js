import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

// Live data mostly arrives through server events (see useLiveUpdates). Metrics don't
// produce events, so those queries also poll.
const METRICS_POLL_MS = 15_000;

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: api.services, refetchInterval: METRICS_POLL_MS });
}

export function useTopology() {
  return useQuery({ queryKey: ['topology'], queryFn: api.topology, refetchInterval: 30_000 });
}

// Everything except Kubernetes warnings: on their own they're mostly noise, so they only
// appear folded into incident timelines.
const FEED_KINDS = ['deploy', 'config', 'restart', 'scale', 'rollout', 'pod_restart'];

export function useChanges(minutes = 60) {
  return useQuery({ queryKey: ['changes', minutes], queryFn: () => api.changes(minutes, FEED_KINDS) });
}

export function useIncidents(filters) {
  return useQuery({ queryKey: ['incidents', filters], queryFn: () => api.incidents(filters) });
}

export function useIncident(number) {
  return useQuery({ queryKey: ['incident', number], queryFn: () => api.incident(number) });
}

export function useTimeline(number) {
  return useQuery({ queryKey: ['timeline', number], queryFn: () => api.timeline(number) });
}

export function useIncidentTopology(number, live) {
  return useQuery({
    queryKey: ['incident-topology', number],
    queryFn: () => api.incidentTopology(number),
    refetchInterval: live ? 30_000 : false,
  });
}

export function useIncidentMetrics(number, live) {
  return useQuery({
    queryKey: ['incident-metrics', number],
    queryFn: () => api.incidentMetrics(number),
    refetchInterval: live ? METRICS_POLL_MS : false,
    placeholderData: (previous) => previous,
  });
}

// Both are recomputed by the server from the incident's alerts, changes and root cause, and
// refreshed by live events when those change.
export function useIncidentRunbooks(number) {
  return useQuery({ queryKey: ['incident-runbooks', number], queryFn: () => api.incidentRunbooks(number) });
}

export function useSimilarIncidents(number) {
  return useQuery({ queryKey: ['similar-incidents', number], queryFn: () => api.similarIncidents(number) });
}

// Runbooks only change when the server restarts with edited files.
const RUNBOOK_STALE_MS = 5 * 60_000;

export function useRunbooks() {
  return useQuery({ queryKey: ['runbooks'], queryFn: api.runbooks, staleTime: RUNBOOK_STALE_MS });
}

export function useRunbook(slug) {
  return useQuery({
    queryKey: ['runbook', slug],
    queryFn: () => api.runbook(slug),
    enabled: Boolean(slug),
    staleTime: RUNBOOK_STALE_MS,
  });
}

// Keeps showing the previous results while the next search is on its way.
export function useRunbookSearch(text) {
  const q = text.trim();
  return useQuery({
    queryKey: ['runbook-search', q],
    queryFn: () => api.searchRunbooks(q),
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: RUNBOOK_STALE_MS,
  });
}

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, staleTime: 60_000 });
}

// The latest investigation of an incident, or null if there hasn't been one.
export function useInvestigation(number) {
  return useQuery({
    queryKey: ['investigation', number],
    queryFn: async () => {
      try {
        return await api.investigation(number);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useStartInvestigation(number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.startInvestigation(number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investigation', number] });
      queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });
}

export function useIncidentStatus(number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status, note }) => api.setIncidentStatus(number, status, note),
    onSuccess: (incident) => {
      queryClient.setQueryData(['incident', number], (current) => (current ? { ...current, ...incident } : current));
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['timeline', number] });
    },
  });
}
