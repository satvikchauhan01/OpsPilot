const BOUNDARY = /[\s\-_/.›:·]/;

/**
 * How well `query` matches `text`. Higher is better, null means no match. The query as a
 * whole, ideally at the start of a word, beats the same letters spread out, so "check"
 * finds "checkout" before "high error … check". Spread out still counts, so "inc41" finds
 * "INC-041". `indices` are the matched positions in `text`, for highlighting.
 */
export function fuzzyMatch(query, text) {
  const needle = query.toLowerCase().trim();
  const haystack = text.toLowerCase();
  if (!needle) return { score: 0, indices: [] };

  const whole = wholeMatch(needle, haystack);
  if (whole) return whole;
  return spreadMatch(needle.replace(/\s+/g, ''), haystack);
}

function wholeMatch(needle, haystack) {
  let at = haystack.indexOf(needle);
  let best = at;
  while (at !== -1) {
    if (at === 0 || BOUNDARY.test(haystack[at - 1])) {
      best = at;
      break;
    }
    at = haystack.indexOf(needle, at + 1);
  }
  if (best === -1) return null;
  const startsWord = best === 0 || BOUNDARY.test(haystack[best - 1]);
  return {
    score: 100 + (startsWord ? 20 : 0) - best * 0.1 - haystack.length * 0.01,
    indices: Array.from({ length: needle.length }, (_, i) => best + i),
  };
}

function spreadMatch(needle, haystack) {
  const indices = [];
  let score = 0;
  let from = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, from);
    if (found === -1) return null;
    const follows = indices.length > 0 && found === indices.at(-1) + 1;
    const startsWord = found === 0 || BOUNDARY.test(haystack[found - 1]);
    score += 1 + (follows ? 4 : 0) + (startsWord ? 3 : 0);
    indices.push(found);
    from = found + 1;
  }
  // Earlier and tighter matches in shorter texts read as better answers
  score -= indices[0] * 0.1 + (indices.at(-1) - indices[0]) * 0.05 + haystack.length * 0.01;
  return { score, indices };
}
