import { AppsV1Api, CoreV1Api, KubeConfig } from '@kubernetes/client-node';

// Uses the local kubeconfig during development (pinned to KUBE_CONTEXT when set) and the
// pod's service account when OpsPilot runs inside the cluster.
function loadConfig(context) {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  if (context) kc.setCurrentContext(context);
  return kc;
}

// Everything OpsPilot reads (the change tracker, the investigation tools, planning a fix)
// goes through this client.
export function createKubeClient({ context }) {
  const kc = loadConfig(context);
  return {
    kc,
    apps: kc.makeApiClient(AppsV1Api),
    core: kc.makeApiClient(CoreV1Api),
  };
}

// Approved fixes run through this one instead: the same cluster, but signed in as the
// opspilot-executor service account, which may only read and patch Deployments in the shop
// namespace. Without its token there is no executor, and fixes can be proposed but not run.
export function createExecutorClient({ context, executorToken }) {
  if (!executorToken) return null;
  const kc = new KubeConfig();
  kc.loadFromClusterAndUser(loadConfig(context).getCurrentCluster(), {
    name: 'opspilot-executor',
    token: executorToken,
  });
  return { apps: kc.makeApiClient(AppsV1Api) };
}
