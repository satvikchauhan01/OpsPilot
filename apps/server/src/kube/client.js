import { AppsV1Api, CoreV1Api, KubeConfig } from '@kubernetes/client-node';

// Uses the local kubeconfig during development (pinned to KUBE_CONTEXT when set) and the
// pod's service account when OpsPilot runs inside the cluster.
export function createKubeClient({ context }) {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  if (context) kc.setCurrentContext(context);

  return {
    kc,
    apps: kc.makeApiClient(AppsV1Api),
    core: kc.makeApiClient(CoreV1Api),
  };
}
