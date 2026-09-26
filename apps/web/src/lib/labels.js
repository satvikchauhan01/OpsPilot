// Words for the codes the API uses, shared by every screen that shows them.

export const CAUSE_LABEL = {
  bad_deploy: 'Bad deploy',
  config_change: 'Config change',
  memory_leak: 'Memory leak',
  resource_saturation: 'Saturation',
  traffic_surge: 'Traffic surge',
  slow_dependency: 'Slow dependency',
  crash_loop: 'Crash loop',
  unknown: 'Unknown',
};

// Suggested actions from investigations, and the actions runbooks recommend
export const ACTION_LABEL = {
  rollback: 'Roll back',
  restart: 'Restart',
  scale: 'Scale',
  scale_up: 'Scale up',
  investigate: 'Keep investigating',
  none: 'No action',
};
