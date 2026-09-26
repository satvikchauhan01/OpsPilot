import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { chunkRunbook, parseRunbook } from '../src/knowledge/runbook-parser.js';
import { wordCount } from '../src/knowledge/text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const SAMPLE = `---
owner: Payments team
services: [payments]
alerts: [WorkerPoolSaturated]
causes: [resource_saturation]
actions:
  scale: Recognise it
---

# Payments worker pool saturated

Each pod holds two connections.

Charges queue when they are all busy.

## Recognise it

The queue grows.

\`\`\`sh
## a comment in a code block, not a heading
kubectl -n shop scale deployment/payments --replicas=4
\`\`\`

## Recognise it

A second section with the same heading.
`;

describe('runbook parser', () => {
  it('reads the metadata, title, summary and sections', () => {
    const runbook = parseRunbook(SAMPLE, 'saturation');
    assert.equal(runbook.title, 'Payments worker pool saturated');
    assert.equal(runbook.summary, 'Each pod holds two connections.');
    assert.equal(runbook.owner, 'Payments team');
    assert.deepEqual(runbook.services, ['payments']);
    assert.deepEqual(runbook.actions, [{ action: 'scale', heading: 'Recognise it', anchor: 'recognise-it' }]);
    assert.deepEqual(
      runbook.sections.map((section) => section.anchor),
      ['recognise-it', 'recognise-it-2'],
    );
    assert.match(runbook.sections[0].markdown, /## a comment in a code block/);
  });

  it('refuses actions outside the catalog, unknown sections and unknown cause types', () => {
    assert.throws(
      () => parseRunbook(SAMPLE.replace('scale: Recognise', 'delete_namespace: Recognise'), 'x'),
      /actions/,
    );
    assert.throws(() => parseRunbook(SAMPLE.replace('scale: Recognise it', 'scale: Pray'), 'x'), /not a section/);
    assert.throws(() => parseRunbook(SAMPLE.replace('[resource_saturation]', '[gremlins]'), 'x'), /causes/);
  });

  it('needs a title and at least one section', () => {
    assert.throws(() => parseRunbook('Just some text.', 'untitled'), /Title/);
    assert.throws(() => parseRunbook('# Title\n\nNo sections here.', 'empty'), /section/);
  });

  it('chunks the introduction and each section as plain text, without code', () => {
    const chunks = chunkRunbook(parseRunbook(SAMPLE, 'saturation'));
    assert.deepEqual(
      chunks.map((chunk) => chunk.anchor),
      ['overview', 'recognise-it', 'recognise-it-2'],
    );
    assert.equal(chunks[0].text, 'Each pod holds two connections.\n\nCharges queue when they are all busy.');
    assert.equal(chunks[1].text, 'The queue grows.');
    assert.equal(chunks[1].embeddingText, 'Payments worker pool saturated: Recognise it.\nThe queue grows.');
  });

  it('splits long sections at paragraph boundaries', () => {
    const paragraph = 'word '.repeat(100).trim();
    const source = `# Long\n\n## Steps\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}\n`;
    const chunks = chunkRunbook(parseRunbook(source, 'long'));
    assert.deepEqual(
      chunks.map((chunk) => [chunk.anchor, chunk.part]),
      [
        ['steps', 0],
        ['steps', 1],
        ['steps', 2],
      ],
    );
  });
});

describe('the runbooks in this repository', () => {
  const dir = path.join(ROOT, 'runbooks');
  const files = readdirSync(dir).filter((file) => file.endsWith('.md'));
  const rules = parseYaml(readFileSync(path.join(ROOT, 'deploy/k8s/base/observability/prometheus/alerts.yml'), 'utf8'));
  const alertNames = new Set(rules.groups.flatMap((group) => group.rules.map((rule) => rule.alert)));

  it('has at least six', () => {
    assert.ok(files.length >= 6, `found ${files.length}`);
  });

  for (const file of files) {
    it(`${file} is valid and fits the embedding model`, () => {
      const runbook = parseRunbook(readFileSync(path.join(dir, file), 'utf8'), path.basename(file, '.md'));
      assert.ok(runbook.summary.length > 0, 'needs an introduction');
      assert.ok(runbook.alerts.length > 0, 'should name the alerts it covers');
      for (const alert of runbook.alerts) assert.ok(alertNames.has(alert), `${alert} is not an alert rule`);
      for (const chunk of chunkRunbook(runbook)) {
        assert.ok(wordCount(chunk.embeddingText) <= 190, `${chunk.anchor} is too long to embed whole`);
      }
    });
  }
});
