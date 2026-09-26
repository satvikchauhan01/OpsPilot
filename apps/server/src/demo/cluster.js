import https from 'node:https';
import { PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';

const POD_PORT = 8080;
const CALL_TIMEOUT_MS = 10_000;

/**
 * What the demo control does to the cluster, through the opspilot-demo service account.
 * Pods are reached through the Kubernetes API's proxy rather than their own addresses, so
 * the same calls work from a laptop and from inside the cluster.
 */
export function createDemoCluster(client) {
  const { kc, apps, core } = client;

  async function runningPods(namespace, app) {
    const pods = await core.listNamespacedPod({
      namespace,
      labelSelector: `app.kubernetes.io/name=${app}`,
      fieldSelector: 'status.phase=Running',
    });
    return pods.items.map((pod) => pod.metadata.name);
  }

  // Sends a request to a pod's own HTTP port and returns the JSON it answers with.
  async function callPod(namespace, pod, method, path, body) {
    const url = new URL(
      `${kc.getCurrentCluster().server}/api/v1/namespaces/${namespace}/pods/${pod}:${POD_PORT}/proxy${path}`,
    );
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const options = {
      method,
      headers: {
        accept: 'application/json',
        ...(payload && { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
      },
    };
    await kc.applyToHTTPSOptions(options);

    return new Promise((resolve, reject) => {
      const request = https.request(url, options, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`${pod} answered ${response.statusCode}: ${text.slice(0, 200)}`));
          } else {
            resolve(text ? JSON.parse(text) : null);
          }
        });
      });
      request.on('error', reject);
      request.setTimeout(CALL_TIMEOUT_MS, () => request.destroy(new Error(`${pod} did not answer in time`)));
      request.end(payload);
    });
  }

  function readDeployment(name) {
    return apps.readNamespacedDeployment({ name, namespace: 'shop' });
  }

  function patchDeployment(name, body) {
    return apps.patchNamespacedDeployment(
      { name, namespace: 'shop', body },
      setHeaderOptions('Content-Type', PatchStrategy.StrategicMergePatch),
    );
  }

  function scale(name, replicas) {
    return apps.patchNamespacedDeploymentScale(
      { name, namespace: 'shop', body: { spec: { replicas } } },
      setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
    );
  }

  function restart(name) {
    return patchDeployment(name, {
      spec: {
        template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } },
      },
    });
  }

  return { runningPods, callPod, readDeployment, patchDeployment, scale, restart };
}

// "shop.local/checkout:1.4.1" with tag 1.4.2 is "shop.local/checkout:1.4.2". A registry port
// ("host:5000/checkout") is not a tag.
export function withTag(image, tag) {
  const slash = image.lastIndexOf('/');
  const colon = image.lastIndexOf(':');
  const name = colon > slash ? image.slice(0, colon) : image;
  return `${name}:${tag}`;
}
