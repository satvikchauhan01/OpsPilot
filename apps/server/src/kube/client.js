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

// The same cluster, signed in as one of OpsPilot's own service accounts.
function asServiceAccount(context, name, token) {
  const kc = new KubeConfig();
  kc.loadFromClusterAndUser(loadConfig(context).getCurrentCluster(), { name, token });
  return kc;
}

// Approved fixes run through this one instead, as the opspilot-executor service account,
// which may only read and patch Deployments in the shop namespace. Without its token there is
// no executor, and fixes can be proposed but not run.
export function createExecutorClient({ context, executorToken }) {
  if (!executorToken) return null;
  return { apps: asServiceAccount(context, 'opspilot-executor', executorToken).makeApiClient(AppsV1Api) };
}

// The demo control breaks the shop and puts it back as the opspilot-demo service account.
export function createDemoClient({ context }, token) {
  if (!token) return null;
  const kc = asServiceAccount(context, 'opspilot-demo', token);
  return { kc, apps: kc.makeApiClient(AppsV1Api), core: kc.makeApiClient(CoreV1Api) };
}
