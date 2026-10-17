// The guided tour for first-time visitors: what OpsPilot is, how to break the shop, and
// where to watch the incident it opens. Each step names the page it needs and the element it
// points at (a data-tour attribute on that page).
export const TOUR_STEPS = [
  {
    path: '/demo',
    target: 'demo-intro',
    title: 'Welcome to OpsPilot',
    body: 'Behind this console runs a real online shop on Kubernetes, with live traffic and real alerts. OpsPilot watches it, works out what broke, and fixes it once a person approves. This tour takes about a minute.',
  },
  {
    path: '/demo',
    target: 'scenarios',
    title: 'Break the shop',
    body: 'Each scenario breaks the shop in a different way: a bad release, a memory leak, a slow dependency, a traffic spike. Start one after the tour. The first alerts fire within about two minutes.',
  },
  {
    path: '/demo',
    target: 'flow',
    title: 'Follow the incident',
    body: 'This strip lights up as the incident moves along: detected, investigated by the AI, fixed after your approval, verified against the metrics, and written up.',
  },
  {
    path: '/',
    target: 'service-map',
    title: 'The live service map',
    body: 'Requests move along the arrows at their real rate, and failing calls turn red. Click any service to open its charts, recent changes and incidents.',
  },
  {
    path: '/incidents',
    target: 'incident-list',
    title: 'Every incident, and how far it got',
    body: 'The dots show each incident’s progress: investigated, fix proposed, fix verified, postmortem written. Open one to read the AI’s reasoning with the evidence behind every claim, or replay it from the first alert.',
  },
  {
    path: '/insights',
    target: 'insights-kpis',
    title: 'How it is going overall',
    body: 'Time to root cause, to a verified fix and to resolution, how often the fixes worked, and where incidents come from.',
  },
  {
    target: 'palette',
    title: 'Jump anywhere',
    body: 'Press Ctrl K to find any incident, service or runbook, or to start a scenario. That’s the tour. Go break something.',
  },
];
