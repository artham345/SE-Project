// ─── server/server.js ─── Theatron API with KMP + Dynamic Programming ────────
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const {
  movieRelevanceScore,
  kmpContains,
  editDistance,
  knapsackRecommend,
  lcsLength,
} = require("./algorithms");

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/theatron")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ─── User Schema ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    favoriteGenres: [String],
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
    refreshTokens: [String],
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  return obj;
};

const User = mongoose.model("User", userSchema);

// ─── Movie Schema ─────────────────────────────────────────────────────────────
const movieSchema = new mongoose.Schema(
  {
    title: String,
    year: Number,
    genre: [String],
    rating: Number,
    score: Number,
    director: String,
    cast: [String],
    description: String,
    poster: String,
    duration: Number,
    language: String,
    featured: Boolean,
  },
  { timestamps: true }
);

const Movie = mongoose.model("Movie", movieSchema);

// ─── JWT Helpers ──────────────────────────────────────────────────────────────
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "theatron_access_secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "theatron_refresh_secret";
const signAccess = (p) => jwt.sign(p, ACCESS_SECRET, { expiresIn: "15m" });
const signRefresh = (p) => jwt.sign(p, REFRESH_SECRET, { expiresIn: "7d" });

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(auth.slice(7), ACCESS_SECRET);
    req.user = await User.findById(decoded.id).select("-password -refreshTokens");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ message: "Token expired", code: "TOKEN_EXPIRED" });
    res.status(401).json({ message: "Invalid token" });
  }
};

const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ message: `Requires role: ${roles.join(" | ")}` });
    next();
  };

const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (!validateEmail(email))
      return res.status(400).json({ message: "Invalid email format" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (await User.findOne({ email }))
      return res.status(409).json({ message: "Email already registered" });

    const user = new User({ name, email, password });
    const accessToken = signAccess({ id: user._id, role: user.role });
    const refreshToken = signRefresh({ id: user._id });
    user.refreshTokens = [refreshToken];
    await user.save();

    res.status(201).json({
      message: "Account created",
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });

    const accessToken = signAccess({ id: user._id, role: user.role });
    const refreshToken = signRefresh({ id: user._id });
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await user.save();

    res.json({ message: "Login successful", accessToken, refreshToken, user: user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });
  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens.includes(refreshToken))
      return res.status(403).json({ message: "Invalid refresh token" });
    const newAccess = signAccess({ id: user._id, role: user.role });
    const newRefresh = signRefresh({ id: user._id });
    user.refreshTokens = user.refreshTokens
      .filter((t) => t !== refreshToken)
      .concat(newRefresh);
    await user.save();
    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: refreshToken } });
  res.json({ message: "Logged out" });
});

app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: req.user }));

// ─── Movie Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/movies
 * Filtering, search, sort, pagination.
 *
 * Search flow (when ?search= is provided):
 *   1. Fetch all movies matching the genre filter from MongoDB.
 *   2. Run KMP to find which movies contain ANY search term in title,
 *      director, cast, genre, or description — O(n·k) total.
 *   3. Score and rank by relevance (movieRelevanceScore).
 *   4. Fuzzy fallback: if KMP finds nothing, use Levenshtein edit distance
 *      against movie titles and suggest the closest match.
 *   5. Paginate the KMP-ranked results in-memory.
 */
app.get("/api/movies", async (req, res) => {
  try {
    const {
      genre,
      search,
      sort = "rating",
      order = "desc",
      page = 1,
      limit = 12,
      fuzzy = "false",
    } = req.query;

    const filter = {};
    if (genre && genre !== "All") {
      filter.genre = { $in: [new RegExp(`^${genre}$`, "i")] };
    }

    const allowedSort = ["rating", "score", "year", "title"];
    const sortField = allowedSort.includes(sort) ? sort : "rating";
    const sortObj = { [sortField]: order === "asc" ? 1 : -1 };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    // ── KMP Search path ─────────────────────────────────────────────────────
    if (search && search.trim()) {
      // Fetch all candidates matching genre filter (no text filter in DB)
      const allMovies = await Movie.find(filter).sort(sortObj);

      // KMP: keep only movies that match the search in any field
      const query = search.trim();
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

      let matched = allMovies.filter((movie) =>
        terms.some(
          (term) =>
            kmpContains(movie.title || "", term) ||
            kmpContains(movie.director || "", term) ||
            kmpContains((movie.cast || []).join(" "), term) ||
            kmpContains((movie.genre || []).join(" "), term) ||
            kmpContains(movie.description || "", term)
        )
      );

      // ── Fuzzy fallback (Levenshtein DP) ──────────────────────────────────
      let fuzzyMatch = null;
      if (matched.length === 0) {
        // Find the movie whose title has the smallest edit distance
        let bestDist = Infinity;
        let bestMovie = null;
        for (const movie of allMovies) {
          const dist = editDistance(movie.title, query);
          if (dist < bestDist) {
            bestDist = dist;
            bestMovie = movie;
          }
        }
        // Only suggest if reasonably close (distance ≤ 40% of query length)
        const threshold = Math.ceil(query.length * 0.4);
        if (bestMovie && bestDist <= threshold) {
          fuzzyMatch = { title: bestMovie.title, distance: bestDist };
          matched = [bestMovie];
        }
      }

      // Rank by KMP relevance score (highest first)
      matched.sort((a, b) => movieRelevanceScore(b, query) - movieRelevanceScore(a, query));

      const total = matched.length;
      const skip = (pageNum - 1) * limitNum;
      const movies = matched.slice(skip, skip + limitNum);

      return res.json({
        movies,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        genre: genre || "All",
        searchAlgorithm: "KMP",
        ...(fuzzyMatch && { fuzzyMatch }),
      });
    }

    // ── Standard DB path (no search query) ──────────────────────────────────
    const skip = (pageNum - 1) * limitNum;
    const [movies, total] = await Promise.all([
      Movie.find(filter).sort(sortObj).skip(skip).limit(limitNum),
      Movie.countDocuments(filter),
    ]);

    res.json({
      movies,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      genre: genre || "All",
    });
  } catch (err) {
    console.error("Movies fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET featured movies
app.get("/api/movies/featured", async (req, res) => {
  try {
    const movies = await Movie.find({ featured: true }).limit(5);
    res.json({ movies });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/movies/recommend
 * Personalised recommendations using Dynamic Programming (Knapsack + LCS).
 *
 * Algorithm:
 *   1. Fetch the authenticated user's watchlist to derive their genre preferences.
 *   2. LCS compares each candidate movie's genre array against user preferences
 *      to compute a similarity score.
 *   3. Knapsack DP selects the top-N unwatched movies that maximise total
 *      genre-similarity + critic score within the result-count budget.
 *
 * Requires authentication.
 */
app.get("/api/movies/recommend", authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const maxResults = Math.min(20, Math.max(1, parseInt(limit)));

    const user = await User.findById(req.user._id).populate("watchlist");

    // Build user genre preference from watchlist + favoriteGenres
    const watchlistGenres = user.watchlist.flatMap((m) => m.genre || []);
    const userGenres = [...new Set([...watchlistGenres, ...(user.favoriteGenres || [])])];

    if (userGenres.length === 0) {
      // Cold start: just return top-rated movies
      const movies = await Movie.find().sort({ rating: -1 }).limit(maxResults);
      return res.json({ movies, algorithm: "top-rated (cold start)", userGenres: [] });
    }

    // Exclude movies already in watchlist
    const watchedIds = new Set(user.watchlist.map((m) => m._id.toString()));
    const candidates = await Movie.find({ _id: { $nin: [...watchedIds] } });

    // Knapsack DP — pick best movies
    const recommended = knapsackRecommend(candidates, userGenres, maxResults);

    res.json({
      movies: recommended,
      algorithm: "Knapsack DP + LCS genre similarity",
      userGenres,
      candidatesConsidered: candidates.length,
    });
  } catch (err) {
    console.error("Recommend error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/movies/similar/:id
 * Finds movies similar to the given one using LCS on genre arrays.
 * Sorts all other movies by descending LCS genre overlap + rating.
 */
app.get("/api/movies/similar/:id", async (req, res) => {
  try {
    const base = await Movie.findById(req.params.id);
    if (!base) return res.status(404).json({ message: "Movie not found" });

    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || 6)));
    const others = await Movie.find({ _id: { $ne: base._id } });

    const scored = others.map((m) => {
      const overlap = lcsLength(base.genre || [], m.genre || []);
      return {
        movie: m,
        similarity: overlap * 10 + (m.rating || 0),
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const movies = scored.slice(0, limit).map((s) => s.movie);

    res.json({ movies, baseGenres: base.genre, algorithm: "LCS genre similarity" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET single movie
app.get("/api/movies/:id", async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    res.json({ movie });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST add movie (admin only)
app.post("/api/movies", authenticate, authorize("admin"), async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ movie });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST toggle watchlist (authenticated)
app.post("/api/movies/:id/watchlist", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const movieId = req.params.id;
    const inList = user.watchlist.map(String).includes(movieId);
    if (inList) {
      user.watchlist = user.watchlist.filter((id) => id.toString() !== movieId);
    } else {
      user.watchlist.push(movieId);
    }
    await user.save();
    res.json({ watchlist: user.watchlist, added: !inList });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET user watchlist (authenticated)
app.get("/api/user/watchlist", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("watchlist");
    res.json({ movies: user.watchlist });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🎬 Theatron API running on :${PORT}`));
