// ─── algorithms.js ─── KMP String Matching + Dynamic Programming ─────────────

// ─── KMP (Knuth-Morris-Pratt) String Matching ────────────────────────────────
// Used for: fast movie title/description search without regex overhead

/**
 * Build the KMP failure function (partial match table).
 * Time: O(m) where m = pattern length
 */
function buildFailureTable(pattern) {
  const m = pattern.length;
  const fail = new Array(m).fill(0);
  let j = 0;

  for (let i = 1; i < m; i++) {
    while (j > 0 && pattern[i] !== pattern[j]) j = fail[j - 1];
    if (pattern[i] === pattern[j]) j++;
    fail[i] = j;
  }

  return fail;
}

/**
 * KMP search — returns all start indices where pattern occurs in text.
 * Time: O(n + m), Space: O(m)
 * Both inputs are lowercased before matching for case-insensitive search.
 */
function kmpSearch(text, pattern) {
  if (!pattern || !text) return [];

  const t = text.toLowerCase();
  const p = pattern.toLowerCase();
  const n = t.length;
  const m = p.length;

  if (m === 0) return [];
  if (m > n) return [];

  const fail = buildFailureTable(p);
  const matches = [];
  let j = 0; // index into pattern

  for (let i = 0; i < n; i++) {
    while (j > 0 && t[i] !== p[j]) j = fail[j - 1];
    if (t[i] === p[j]) j++;
    if (j === m) {
      matches.push(i - m + 1);
      j = fail[j - 1];
    }
  }

  return matches;
}

/**
 * Returns true if pattern appears in text (using KMP).
 */
function kmpContains(text, pattern) {
  return kmpSearch(text, pattern).length > 0;
}

/**
 * Score how well a movie matches a search query using KMP.
 * Checks title (high weight), director (medium), cast, description (low).
 * Returns a numeric relevance score.
 */
function movieRelevanceScore(movie, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;

  for (const term of terms) {
    // Title match — highest priority
    const titleMatches = kmpSearch(movie.title || "", term);
    score += titleMatches.length * 10;

    // Exact title word bonus
    const titleWords = (movie.title || "").toLowerCase().split(/\s+/);
    if (titleWords.includes(term)) score += 5;

    // Director match
    if (kmpContains(movie.director || "", term)) score += 4;

    // Cast match
    const castStr = (movie.cast || []).join(" ");
    if (kmpContains(castStr, term)) score += 3;

    // Genre match
    const genreStr = (movie.genre || []).join(" ");
    if (kmpContains(genreStr, term)) score += 2;

    // Description match
    if (kmpContains(movie.description || "", term)) score += 1;
  }

  return score;
}


// ─── Dynamic Programming ──────────────────────────────────────────────────────

/**
 * Levenshtein Edit Distance (DP).
 * Measures how many single-character edits are needed to change s1 into s2.
 * Used for: fuzzy/typo-tolerant search (e.g. "Inceptoin" → "Inception").
 * Time: O(n·m), Space: O(n·m)
 */
function editDistance(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const n = a.length;
  const m = b.length;

  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[n][m];
}

/**
 * Longest Common Subsequence (DP).
 * Used for: computing genre/preference similarity between two genre arrays.
 * Time: O(n·m), Space: O(n·m)
 */
function lcsLength(arr1, arr2) {
  const n = arr1.length;
  const m = arr2.length;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (arr1[i - 1].toLowerCase() === arr2[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[n][m];
}

/**
 * 0/1 Knapsack DP — used for watchlist-based recommendation.
 * Given a "budget" of genres a user likes, picks the best set of unwatched
 * movies that maximises total score within a result-count limit.
 *
 * @param {Array}  movies       - candidate movies (each has .score, .genre)
 * @param {Array}  userGenres   - genres the user prefers
 * @param {number} maxResults   - max movies to select (= capacity)
 * @returns {Array} selected movies
 */
function knapsackRecommend(movies, userGenres, maxResults) {
  const n = movies.length;
  const W = maxResults; // capacity = how many movies we want

  // weight of each movie = 1 (one slot), value = genre match score
  const values = movies.map((m) => {
    const shared = lcsLength(m.genre || [], userGenres);
    // combine genre overlap + critic score
    return shared * 20 + (m.score || 0) * 0.5 + (m.rating || 0) * 5;
  });

  // dp[i][w] = best total value using first i movies, at most w slots
  const dp = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= W; w++) {
      dp[i][w] = dp[i - 1][w]; // don't take movie i
      if (w >= 1) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - 1] + values[i - 1]);
      }
    }
  }

  // Backtrack to find which movies were selected
  const selected = [];
  let w = W;
  for (let i = n; i >= 1 && w > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push({ ...movies[i - 1].toObject?.() ?? movies[i - 1], _dpScore: values[i - 1] });
      w--;
    }
  }

  return selected.sort((a, b) => b._dpScore - a._dpScore);
}

module.exports = {
  buildFailureTable,
  kmpSearch,
  kmpContains,
  movieRelevanceScore,
  editDistance,
  lcsLength,
  knapsackRecommend,
};
