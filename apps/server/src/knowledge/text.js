// Helpers that turn OpsPilot's identifiers and Markdown into plain words. The embedding
// model reads "HighErrorRate" as a string of word pieces with no meaning, while "high error
// rate" is a phrase it knows.

export function alertWords(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

export function causeWords(causeType) {
  return causeType.replaceAll('_', ' ');
}

export function sentence(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// Markdown as plain paragraphs separated by blank lines. Code blocks are dropped: a PromQL
// query or a kubectl command says little to the model and uses up its short input.
export function plainText(markdown) {
  const kept = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence) kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
