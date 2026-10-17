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

export function useChanges(minutes = 60, service) {
  return useQuery({
    queryKey: ['changes', minutes, service],
    queryFn: () => api.changes(minutes, FEED_KINDS, service),
  });
}

export function useServiceMetrics(name, minutes) {
  return useQuery({
    queryKey: ['service-metrics', name, minutes],
    queryFn: () => api.serviceMetrics(name, minutes),
    enabled: Boolean(name),
    refetchInterval: METRICS_POLL_MS,
    placeholderData: (previous) => previous,
  });
}

export function useInsights(days) {
  return useQuery({
    queryKey: ['insights', days],
    queryFn: () => api.insights(days),
    placeholderData: (previous) => previous,
  });
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

export function useRunbooks(enabled = true) {
  return useQuery({ queryKey: ['runbooks'], queryFn: api.runbooks, staleTime: RUNBOOK_STALE_MS, enabled });
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
export function useInvestigation(number, enabled = true) {
  return useQuery({
    queryKey: ['investigation', number],
    enabled,
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

export function useRemediationStatus() {
  return useQuery({ queryKey: ['remediation'], queryFn: api.remediation, staleTime: 5 * 60_000 });
}

export function useActions(number, enabled = true) {
  return useQuery({ queryKey: ['actions', number], queryFn: () => api.actions(number), enabled });
}

// Proposing, approving and rejecting all change the incident's actions; the server's live
// events refresh everything else (timeline, status, audit log).
function useActionMutation(number, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions', number] }),
  });
}

export function useProposeAction(number) {
  return useActionMutation(number, (proposal) => api.proposeAction(number, proposal));
}

export function useApproveAction(number) {
  return useActionMutation(number, (id) => api.approveAction(id));
}

export function useRejectAction(number) {
  return useActionMutation(number, ({ id, reason }) => api.rejectAction(id, reason));
}

export function useAudit(filters) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => api.audit(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAuditChain() {
  return useQuery({ queryKey: ['audit-chain'], queryFn: api.auditChain });
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

// The postmortem of a resolved incident, or null when none has been written yet.
export function usePostmortem(number, enabled = true) {
  return useQuery({
    queryKey: ['postmortem', number],
    enabled,
    queryFn: async () => {
      try {
        return await api.postmortem(number);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
  });
}

// Drafting runs in the background; the server's live events say when it's written.
export function useDraftPostmortem(number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.draftPostmortem(number),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postmortem', number] }),
  });
}

export function useSavePostmortem(number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (markdown) => api.savePostmortem(number, markdown),
    onSuccess: (postmortem) => queryClient.setQueryData(['postmortem', number], postmortem),
  });
}

export function useFinalizePostmortem(number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.finalizePostmortem(number),
    onSuccess: (postmortem) => queryClient.setQueryData(['postmortem', number], postmortem),
  });
}

export function useDemo() {
  return useQuery({ queryKey: ['demo'], queryFn: api.demo });
}

// Both answer with the demo's new status.
export function useStartScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.startScenario,
    onSuccess: (status) => queryClient.setQueryData(['demo'], status),
  });
}

export function useResetDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.resetDemo,
    onSuccess: (status) => queryClient.setQueryData(['demo'], status),
  });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: api.users });
}

// After a team change the list refreshes, and so does the audit log, which records it.
function useTeamMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useCreateUser() {
  return useTeamMutation(api.createUser);
}

export function useSetRole() {
  return useTeamMutation(({ id, role }) => api.setRole(id, role));
}

export function useRemoveUser() {
  return useTeamMutation(api.removeUser);
}
