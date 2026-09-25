const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { onShutdown } = require('./lifecycle');
const { isInternalPath } = require('./paths');

// Exporters, endpoint and protocol come from the standard OTEL_* variables in the
// Kubernetes manifests, so this file only decides what gets instrumented.
const sdk = new NodeSDK({
  serviceName: process.env.SERVICE,
  resource: resourceFromAttributes({ 'service.version': process.env.APP_VERSION }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => isInternalPath(req.url),
      },
      // A span for every middleware adds noise without telling us anything useful.
      '@opentelemetry/instrumentation-express': { ignoreLayersType: ['middleware'] },
      // Express 5 runs on the `router` package, which would otherwise be traced a second time.
      '@opentelemetry/instrumentation-router': { enabled: false },
    }),
  ],
});

sdk.start();
onShutdown(() => sdk.shutdown());
