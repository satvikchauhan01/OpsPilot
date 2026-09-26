// The four ways the demo shop breaks (REQUIREMENTS.md, DS-5), as visitors see them on the
// demo page. How each one is carried out lives in demo/service.js.
export const SCENARIOS = [
  {
    key: 'bad-deploy',
    id: 'S1',
    title: 'A bad release',
    breaks: 'Checkout 1.4.2 goes out and crashes on orders with an expired coupon code.',
    expected: 'OpsPilot ties the errors to the new release and proposes rolling checkout back.',
  },
  {
    key: 'memory-leak',
    id: 'S2',
    title: 'A memory leak',
    breaks: 'Inventory starts leaking memory, until it is close to its limit.',
    expected: 'OpsPilot tells the leak from load and proposes restarting inventory.',
  },
  {
    key: 'payments-latency',
    id: 'S3',
    title: 'A slow dependency',
    breaks: 'Payments hangs on its card processor, so checkout times out and the gateway fails.',
    expected: 'OpsPilot follows the errors down to payments and proposes restarting it.',
  },
  {
    key: 'traffic-spike',
    id: 'S4',
    title: 'A traffic spike',
    breaks: 'A flash sale sends five times the usual traffic and saturates the payments worker pool.',
    expected: 'OpsPilot sees the saturation and proposes scaling payments out.',
  },
];

export const SHOP_SERVICES = ['gateway', 'checkout', 'payments', 'inventory'];
