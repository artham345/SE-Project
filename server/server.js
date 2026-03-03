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
