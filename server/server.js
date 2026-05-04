  // ─── server/server.js ─── Full MERN Authentication + Movies Backend ──────────
  const express = require("express");
  const mongoose = require("mongoose");
  const bcrypt = require("bcryptjs");
  const jwt = require("jsonwebtoken");
  const cors = require("cors");
  require("dotenv").config();

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
  const movieSchema = new mongoose.Schema({
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
  }, { timestamps: true });

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

  const authorize = (...roles) => (req, res, next) => {
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

      res.status(201).json({ message: "Account created", accessToken, refreshToken, user: user.toSafeObject() });
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
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken).concat(newRefresh);
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

  // GET all movies with filtering, search, sort, pagination (public)
  app.get("/api/movies", async (req, res) => {
    try {
      const { genre, search, sort = "rating", order = "desc", page = 1, limit = 12 } = req.query;
      const filter = {};

      // genre is stored as an array in MongoDB, so use $in to match any movie
      // whose genre array contains the requested genre string (case-insensitive)
      if (genre && genre !== "All") {
        filter.genre = { $in: [new RegExp(`^${genre}$`, "i")] };
      }

      // search by title (case-insensitive partial match)
      if (search && search.trim()) {
        filter.title = { $regex: search.trim(), $options: "i" };
      }

      // whitelist sortable fields to prevent injection
      const allowedSort = ["rating", "score", "year", "title"];
      const sortField = allowedSort.includes(sort) ? sort : "rating";
      const sortObj = { [sortField]: order === "asc" ? 1 : -1 };

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
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

  // ─── Similarity Algorithm (mirrors client-side) ───────────────────────────────
  function similarity(a, b) {
    let s = 0;
    const aGenres = a.genre || [], bGenres = b.genre || [];
    s += aGenres.filter(g => bGenres.includes(g)).length * 4.0;
    if (a.director && a.director === b.director) s += 3.0;
    if (Math.abs((a.year || 0) - (b.year || 0)) <= 5) s += 1.5;
    if (Math.abs((a.rating || 0) - (b.rating || 0)) <= 0.5) s += 1.5;
    s += (a.cast || []).filter(c => (b.cast || []).includes(c)).length * 2.0;
    return s;
  }

  // Build adjacency graph (genre or director edge)
  function buildGraph(movies) {
    const graph = {};
    movies.forEach(m => { graph[String(m._id)] = []; });
    for (let i = 0; i < movies.length; i++) {
      for (let j = i + 1; j < movies.length; j++) {
        const a = movies[i], b = movies[j];
        const sharedGenre = (a.genre || []).some(g => (b.genre || []).includes(g));
        if (sharedGenre || a.director === b.director) {
          graph[String(a._id)].push(String(b._id));
          graph[String(b._id)].push(String(a._id));
        }
      }
    }
    return graph;
  }

  // BFS from seed ids
  function bfsRec(seedIds, allMovies, n = 8) {
    const graph = buildGraph(allMovies);
    const visited = new Set(seedIds.map(String));
    const queue = [...seedIds.map(String)];
    const result = [];
    while (queue.length && result.length < n) {
      const cur = queue.shift();
      for (const nxt of (graph[cur] || [])) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
          const m = allMovies.find(x => String(x._id) === nxt);
          if (m) { result.push(m); if (result.length === n) break; }
        }
      }
    }
    return result;
  }

  // 0/1 Knapsack
  function knapsack(movies, budget) {
    const n = movies.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(budget + 1));
    for (let i = 1; i <= n; i++) {
      const dur = movies[i - 1].duration || 0;
      const val = Math.round((movies[i - 1].rating || 0) * 10);
      for (let t = 0; t <= budget; t++) {
        dp[i][t] = dp[i - 1][t];
        if (dur <= t) { const w = val + dp[i - 1][t - dur]; if (w > dp[i][t]) dp[i][t] = w; }
      }
    }
    const selected = []; let rem = budget;
    for (let i = n; i >= 1; i--) {
      if (dp[i][rem] !== dp[i - 1][rem]) { selected.push(movies[i - 1]); rem -= movies[i - 1].duration; }
    }
    return selected.reverse();
  }

  // POST /api/movies/recommend — similarity + BFS seeded from a list of movie ids
  // Body: { movieIds: [...], n: 8 }
  app.post("/api/movies/recommend", async (req, res) => {
    try {
      const { movieIds = [], n = 8 } = req.body;
      if (!movieIds.length) return res.json({ score: [], bfs: [] });

      const allMovies = await Movie.find({});
      const seedSet   = new Set(movieIds.map(String));

      // Similarity-score recs
      const scoreMap = {};
      movieIds.forEach(sid => {
        const seed = allMovies.find(m => String(m._id) === String(sid));
        if (!seed) return;
        allMovies.forEach(m => {
          if (seedSet.has(String(m._id))) return;
          const s = similarity(seed, m);
          if (s > 0) scoreMap[String(m._id)] = (scoreMap[String(m._id)] || 0) + s;
        });
      });
      const scoreRecs = Object.entries(scoreMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id]) => allMovies.find(m => String(m._id) === id))
        .filter(Boolean);

      // BFS recs
      const bfsRecs = bfsRec(movieIds, allMovies, n);

      res.json({ score: scoreRecs, bfs: bfsRecs });
    } catch (err) {
      console.error("Recommend error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/movies/schedule — knapsack given a time budget
  // Body: { budget: 300, movieIds?: [...] }  — movieIds restricts the pool
  app.post("/api/movies/schedule", async (req, res) => {
    try {
      const { budget = 300, movieIds } = req.body;
      const budgetNum = Math.min(1440, Math.max(1, parseInt(budget)));

      let pool;
      if (movieIds && movieIds.length) {
        pool = await Movie.find({ _id: { $in: movieIds } });
      } else {
        pool = await Movie.find({});
      }

      const selected  = knapsack(pool, budgetNum);
      const usedTime  = selected.reduce((s, m) => s + (m.duration || 0), 0);
      const avgRating = selected.length
        ? (selected.reduce((s, m) => s + (m.rating || 0), 0) / selected.length).toFixed(2)
        : 0;

      res.json({ selected, usedTime, remaining: budgetNum - usedTime, avgRating, budget: budgetNum });
    } catch (err) {
      console.error("Schedule error:", err);
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
        user.watchlist = user.watchlist.filter(id => id.toString() !== movieId);
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