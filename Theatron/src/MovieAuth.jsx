import { useState, useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE = "http://localhost:5000/api";

// ─── API ──────────────────────────────────────────────────────────────────────
const api = {
  post: async (path, body, token) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  },
  get: async (path, token) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  },
};

// ─── Token Store ──────────────────────────────────────────────────────────────
const store = {
  set: (k, v) => localStorage.setItem(k, v),
  get: (k) => localStorage.getItem(k),
  clear: () => { localStorage.removeItem("th_token"); localStorage.removeItem("th_user"); },
};

// ─── Floating Particle Canvas ─────────────────────────────────────────────────
function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    let raf;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      r: Math.random() * 1.4 + 0.2, speed: Math.random() * 0.35 + 0.08,
      o: Math.random() * 0.45 + 0.08,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,80,${p.o})`; ctx.fill();
        p.y -= p.speed;
        if (p.y < -5) { p.y = c.height + 5; p.x = Math.random() * c.width; }
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} />;
}

// ─── Star Rating ──────────────────────────────────────────────────────────────
function Stars({ rating }) {
  const full = Math.floor(rating / 2);
  const half = rating / 2 - full >= 0.5;
  return (
    <span style={{ color: "#d4a842", fontSize: "12px", letterSpacing: "1px" }}>
      {"★".repeat(full)}{half ? "½" : ""}{"☆".repeat(5 - full - (half ? 1 : 0))}
    </span>
  );
}

// ─── Movie Card ───────────────────────────────────────────────────────────────
function MovieCard({ movie, onWatchlist, inWatchlist, token, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [wlLoading, setWlLoading] = useState(false);

  const handleWatchlist = async (e) => {
    e.stopPropagation();
    if (!token) return;
    setWlLoading(true);
    try {
      await onWatchlist(movie._id);
    } finally {
      setWlLoading(false);
    }
  };

  const scoreColor = movie.score >= 90 ? "#4ade80" : movie.score >= 70 ? "#facc15" : "#f87171";

  return (
    <div
      onClick={() => onSelect && onSelect(movie)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", borderRadius: "12px", overflow: "hidden", cursor: "pointer",
        background: "#1a1408", border: `1px solid ${hovered ? "rgba(212,168,66,0.5)" : "rgba(160,135,90,0.12)"}`,
        transform: hovered ? "translateY(-6px) scale(1.02)" : "translateY(0) scale(1)",
        transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: hovered ? "0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,168,66,0.2)" : "0 4px 12px rgba(0,0,0,0.3)",
        aspectRatio: "2/3",
      }}
    >
      {/* Poster */}
      {!imgErr ? (
        <img
          src={movie.poster}
          alt={movie.title}
          onError={() => setImgErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s", transform: hovered ? "scale(1.05)" : "scale(1)" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1408,#2a1f08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
          <span style={{ fontSize: "48px" }}>🎬</span>
          <span style={{ color: "#6b5a3e", fontSize: "12px", textAlign: "center", padding: "0 16px", fontFamily: "'DM Mono',monospace" }}>{movie.title}</span>
        </div>
      )}

      {/* Gradient overlay always visible at bottom */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 40%, transparent 70%)", transition: "opacity 0.3s", opacity: hovered ? 1 : 0.7 }} />

      {/* Score badge */}
      <div style={{ position: "absolute", top: "10px", left: "10px", background: `${scoreColor}22`, border: `1px solid ${scoreColor}66`, borderRadius: "6px", padding: "3px 8px", fontSize: "11px", color: scoreColor, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>
        {movie.score}%
      </div>

      {/* Watchlist button */}
      <button
        onClick={handleWatchlist}
        style={{
          position: "absolute", top: "10px", right: "10px",
          background: inWatchlist ? "rgba(212,168,66,0.9)" : "rgba(0,0,0,0.6)",
          border: "1px solid rgba(212,168,66,0.5)", borderRadius: "6px",
          padding: "4px 8px", cursor: "pointer", fontSize: "14px",
          color: inWatchlist ? "#0c0a08" : "#d4a842",
          opacity: hovered || inWatchlist ? 1 : 0,
          transition: "all 0.2s",
        }}
        title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      >
        {wlLoading ? "…" : inWatchlist ? "✓" : "+"}
      </button>

      {/* Info overlay */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 14px 14px" }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "15px", fontWeight: 600, color: "#f0e6d3", margin: "0 0 4px", lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
          {movie.title}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Stars rating={movie.rating} />
          <span style={{ color: "#a0875a", fontSize: "11px", fontFamily: "'DM Mono',monospace" }}>{movie.rating.toFixed(1)}</span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {movie.genre.slice(0, 2).map(g => (
            <span key={g} style={{ background: "rgba(212,168,66,0.12)", border: "1px solid rgba(212,168,66,0.2)", borderRadius: "4px", padding: "2px 7px", fontSize: "10px", color: "#a0875a", fontFamily: "'DM Mono',monospace" }}>{g}</span>
          ))}
          <span style={{ fontSize: "10px", color: "#6b5a3e", fontFamily: "'DM Mono',monospace", alignSelf: "center" }}>{movie.year}</span>
        </div>
        {hovered && (
          <p style={{ fontSize: "11px", color: "rgba(240,230,211,0.7)", margin: "8px 0 0", lineHeight: 1.5, fontFamily: "'DM Mono',monospace", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {movie.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Global Dashboard Styles ──────────────────────────────────────────────────
const dashboardCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=DM+Mono:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0a08; }
  @keyframes fadeUp  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse   { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.5); opacity:.4; } }
  @keyframes shimmer { from { background-position:-200% center; } to { background-position:200% center; } }

  /* ── Page-level scrollbar (vertical) ── */
  ::-webkit-scrollbar       { width: 6px; }
  ::-webkit-scrollbar-track { background: #0c0a08; border-left: 1px solid rgba(160,135,90,0.06); }
  ::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#8a6820,#d4a842,#8a6820);
                               border-radius: 3px; border: 1px solid rgba(212,168,66,0.15); }
  ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#d4a842,#f5d07a,#d4a842); }

  /* ── Genre row custom scrollbar (horizontal, applied via class) ── */
  .genre-scroll::-webkit-scrollbar       { height: 3px; }
  .genre-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.02);
                                           border-radius: 10px; margin: 0 40px; }
  .genre-scroll::-webkit-scrollbar-thumb { background: linear-gradient(90deg,#6b4d14,#d4a842,#6b4d14);
                                           border-radius: 10px; }
  .genre-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(90deg,#d4a842,#f5d07a,#d4a842); }
  /* Firefox */
  .genre-scroll { scrollbar-width: thin; scrollbar-color: #d4a842 rgba(255,255,255,0.04); }

  select option { background: #1a1408; color: #f0e6d3; }
`;

// ─── Genre Scroller ───────────────────────────────────────────────────────────
function GenreScroller({ genres, active, onChange }) {
  const rowRef = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(true);

  const checkArrows = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    checkArrows();
    el.addEventListener("scroll", checkArrows);
    window.addEventListener("resize", checkArrows);
    return () => { el.removeEventListener("scroll", checkArrows); window.removeEventListener("resize", checkArrows); };
  }, []);

  const scroll = (dir) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  const arrowBase = (enabled) => ({
    flexShrink: 0,
    width: "34px", height: "34px",
    borderRadius: "50%",
    border: `1px solid ${enabled ? "rgba(212,168,66,0.35)" : "rgba(160,135,90,0.1)"}`,
    background: enabled ? "rgba(212,168,66,0.08)" : "rgba(255,255,255,0.02)",
    color: enabled ? "#d4a842" : "#3a3020",
    cursor: enabled ? "pointer" : "default",
    fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s",
    boxShadow: enabled ? "0 0 8px rgba(212,168,66,0.08)" : "none",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
      {/* Left arrow */}
      <button onClick={() => scroll(-1)} style={arrowBase(canLeft)}
        onMouseEnter={e => { if (canLeft) e.currentTarget.style.background = "rgba(212,168,66,0.18)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = canLeft ? "rgba(212,168,66,0.08)" : "rgba(255,255,255,0.02)"; }}>
        ‹
      </button>

      {/* Scrollable pills row */}
      <div
        ref={rowRef}
        className="genre-scroll"
        style={{ display: "flex", gap: "8px", overflowX: "auto", flex: 1,
                 scrollbarWidth: "thin", paddingBottom: "6px",
                 maskImage: `linear-gradient(to right, transparent 0%, black ${canLeft ? "40px" : "0px"}, black calc(100% - ${canRight ? "40px" : "0px"}), transparent 100%)`,
                 WebkitMaskImage: `linear-gradient(to right, transparent 0%, black ${canLeft ? "40px" : "0px"}, black calc(100% - ${canRight ? "40px" : "0px"}), transparent 100%)`,
        }}
      >
        {genres.map(g => (
          <button
            key={g}
            onClick={() => onChange(g)}
            style={{
              flexShrink: 0,
              background: active === g
                ? "linear-gradient(135deg, rgba(212,168,66,0.25), rgba(212,168,66,0.1))"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${active === g ? "rgba(212,168,66,0.55)" : "rgba(160,135,90,0.14)"}`,
              borderRadius: "20px",
              color: active === g ? "#d4a842" : "#6b5a3e",
              padding: "7px 18px", fontSize: "11px", cursor: "pointer",
              letterSpacing: "0.07em", fontFamily: "'DM Mono',monospace",
              fontWeight: active === g ? "600" : "400",
              boxShadow: active === g
                ? "0 0 14px rgba(212,168,66,0.18), inset 0 1px 0 rgba(255,255,255,0.06)"
                : "inset 0 1px 0 rgba(255,255,255,0.03)",
              textShadow: active === g ? "0 0 8px rgba(212,168,66,0.4)" : "none",
              transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
              transform: active === g ? "scale(1.04)" : "scale(1)",
            }}
            onMouseEnter={e => {
              if (active !== g) {
                e.currentTarget.style.background = "rgba(212,168,66,0.08)";
                e.currentTarget.style.color = "#a0875a";
                e.currentTarget.style.borderColor = "rgba(212,168,66,0.25)";
              }
            }}
            onMouseLeave={e => {
              if (active !== g) {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                e.currentTarget.style.color = "#6b5a3e";
                e.currentTarget.style.borderColor = "rgba(160,135,90,0.14)";
              }
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Right arrow */}
      <button onClick={() => scroll(1)} style={arrowBase(canRight)}
        onMouseEnter={e => { if (canRight) e.currentTarget.style.background = "rgba(212,168,66,0.18)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = canRight ? "rgba(212,168,66,0.08)" : "rgba(255,255,255,0.02)"; }}>
        ›
      </button>
    </div>
  );
}

// ─── Movie Detail Page ────────────────────────────────────────────────────────
function MovieDetail({ movieId, token, onBack, onWatchlist, inWatchlist }) {
  const [movie, setMovie]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [wlLoading, setWlLoading] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(true);
    api.get(`/movies/${movieId}`, token)
      .then(data => { setMovie(data.movie || data); setLoading(false); })
      .catch(() => { setError("Failed to load movie."); setLoading(false); });
  }, [movieId, token]);

  const handleWatchlist = async () => {
    if (!token) return;
    setWlLoading(true);
    try { await onWatchlist(movieId); }
    finally { setWlLoading(false); }
  };

  const scoreColor = movie ? (movie.score >= 90 ? "#4ade80" : movie.score >= 70 ? "#facc15" : "#f87171") : "#facc15";
  const hrs = movie ? Math.floor(movie.duration / 60) : 0;
  const mins = movie ? movie.duration % 60 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0c0a08", color: "#f0e6d3", fontFamily: "'DM Mono',monospace" }}>
      <style>{dashboardCSS}</style>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 32px", borderBottom: "1px solid rgba(160,135,90,0.15)", background: "rgba(12,10,8,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(160,135,90,0.2)", borderRadius: "8px", padding: "8px 16px", color: "#a0875a", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono',monospace", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,168,66,0.1)"; e.currentTarget.style.color = "#d4a842"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#a0875a"; }}
        >
          ← Back
        </button>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "20px", letterSpacing: "0.2em", color: "#d4a842" }}>THEATRON</span>
      </header>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", gap: "12px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#d4a842", animation: "pulse 1s ease-in-out infinite" }} />
          <span style={{ color: "#6b5a3e" }}>Loading…</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "80px", color: "#e05050" }}>{error}</div>
      ) : movie ? (
        <>
          {/* ── Hero Section ── */}
          <div style={{ position: "relative", height: "520px", overflow: "hidden" }}>
            {/* Blurred backdrop */}
            {!imgErr && (
              <img
                src={movie.poster}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(28px) brightness(0.3) saturate(1.4)", transform: "scale(1.1)" }}
              />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(12,10,8,0.3) 0%, rgba(12,10,8,0.6) 60%, #0c0a08 100%)" }} />

            {/* Content */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "48px", alignItems: "flex-end", padding: "48px 56px", height: "100%" }}>
              {/* Poster */}
              <div style={{ flexShrink: 0, width: "200px", borderRadius: "14px", overflow: "hidden", boxShadow: "0 30px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,168,66,0.2)", animation: "fadeUp 0.5s ease both" }}>
                {!imgErr ? (
                  <img src={movie.poster} alt={movie.title} onError={() => setImgErr(true)} style={{ width: "100%", display: "block" }} />
                ) : (
                  <div style={{ width: "200px", height: "300px", background: "#1a1408", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>🎬</div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, animation: "fadeUp 0.5s 0.1s ease both", opacity: 0, animationFillMode: "forwards" }}>
                {/* Genres */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                  {movie.genre.map(g => (
                    <span key={g} style={{ background: "rgba(212,168,66,0.12)", border: "1px solid rgba(212,168,66,0.25)", borderRadius: "20px", padding: "4px 12px", fontSize: "11px", color: "#a0875a", letterSpacing: "0.06em" }}>{g}</span>
                  ))}
                </div>

                {/* Title */}
                <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,4vw,52px)", fontWeight: 300, color: "#f0e6d3", lineHeight: 1.1, marginBottom: "12px", letterSpacing: "0.02em" }}>
                  {movie.title}
                </h1>

                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
                  <span style={{ color: "#6b5a3e", fontSize: "13px" }}>{movie.year}</span>
                  <span style={{ color: "#3a3020" }}>·</span>
                  <span style={{ color: "#6b5a3e", fontSize: "13px" }}>{hrs}h {mins}m</span>
                  <span style={{ color: "#3a3020" }}>·</span>
                  <span style={{ color: "#6b5a3e", fontSize: "13px" }}>{movie.language}</span>
                  <span style={{ color: "#3a3020" }}>·</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Stars rating={movie.rating} />
                    <span style={{ color: "#d4a842", fontSize: "14px", fontWeight: 600 }}>{movie.rating.toFixed(1)}</span>
                    <span style={{ color: "#4a3e2e", fontSize: "11px" }}>IMDb</span>
                  </div>
                  <div style={{ background: `${scoreColor}20`, border: `1px solid ${scoreColor}55`, borderRadius: "6px", padding: "3px 10px", fontSize: "12px", color: scoreColor, fontWeight: 700 }}>
                    {movie.score}% RT
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: "14px", color: "rgba(240,230,211,0.65)", lineHeight: 1.8, maxWidth: "600px", marginBottom: "28px" }}>
                  {movie.description}
                </p>

                {/* Actions */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {token && (
                    <button
                      onClick={handleWatchlist}
                      style={{ display: "flex", alignItems: "center", gap: "8px", background: inWatchlist ? "rgba(212,168,66,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${inWatchlist ? "rgba(212,168,66,0.6)" : "rgba(160,135,90,0.25)"}`, borderRadius: "8px", padding: "12px 22px", color: inWatchlist ? "#d4a842" : "#a0875a", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono',monospace", letterSpacing: "0.08em", transition: "all 0.2s" }}
                    >
                      {wlLoading ? "…" : inWatchlist ? "✓  In Watchlist" : "+  Add to Watchlist"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Details Section ── */}
          <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 56px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px" }}>

              {/* Left — Director & Cast */}
              <div>
                <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "13px", letterSpacing: "0.18em", color: "#6b5a3e", textTransform: "uppercase", marginBottom: "24px", borderBottom: "1px solid rgba(160,135,90,0.1)", paddingBottom: "12px" }}>
                  Crew & Cast
                </h2>

                {/* Director */}
                <div style={{ marginBottom: "28px" }}>
                  <p style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#4a3e2e", textTransform: "uppercase", marginBottom: "8px" }}>Director</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(212,168,66,0.2),rgba(160,135,90,0.1))", border: "1px solid rgba(212,168,66,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>🎬</div>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "18px", color: "#f0e6d3" }}>{movie.director}</span>
                  </div>
                </div>

                {/* Cast */}
                <div>
                  <p style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#4a3e2e", textTransform: "uppercase", marginBottom: "12px" }}>Cast</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {movie.cast.map((actor, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: `rgba(212,168,66,${0.06 + i * 0.02})`, border: "1px solid rgba(160,135,90,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>
                          {actor.charAt(0)}
                        </div>
                        <span style={{ fontSize: "13px", color: "rgba(240,230,211,0.75)" }}>{actor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — Stats & Details */}
              <div>
                <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "13px", letterSpacing: "0.18em", color: "#6b5a3e", textTransform: "uppercase", marginBottom: "24px", borderBottom: "1px solid rgba(160,135,90,0.1)", paddingBottom: "12px" }}>
                  Film Details
                </h2>

                {/* Stats grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "32px" }}>
                  {[
                    { label: "Year", value: movie.year },
                    { label: "Duration", value: `${hrs}h ${mins}m` },
                    { label: "Language", value: movie.language },
                    { label: "Genre", value: movie.genre[0] },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(160,135,90,0.1)", borderRadius: "10px", padding: "16px" }}>
                      <p style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#4a3e2e", textTransform: "uppercase", marginBottom: "6px" }}>{label}</p>
                      <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "20px", color: "#d4a842" }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Ratings */}
                <h3 style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#4a3e2e", textTransform: "uppercase", marginBottom: "16px" }}>Ratings</h3>

                {/* IMDb bar */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#6b5a3e" }}>IMDb Rating</span>
                    <span style={{ fontSize: "12px", color: "#d4a842", fontWeight: 600 }}>{movie.rating.toFixed(1)} / 10</span>
                  </div>
                  <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(movie.rating / 10) * 100}%`, background: "linear-gradient(90deg,#8a6820,#d4a842)", borderRadius: "2px", transition: "width 0.8s ease" }} />
                  </div>
                </div>

                {/* RT bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#6b5a3e" }}>Rotten Tomatoes</span>
                    <span style={{ fontSize: "12px", color: scoreColor, fontWeight: 600 }}>{movie.score}%</span>
                  </div>
                  <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${movie.score}%`, background: `linear-gradient(90deg,${scoreColor}88,${scoreColor})`, borderRadius: "2px", transition: "width 0.8s ease" }} />
                  </div>
                </div>

                {/* Star display */}
                <div style={{ marginTop: "28px", padding: "20px", background: "rgba(212,168,66,0.04)", border: "1px solid rgba(212,168,66,0.12)", borderRadius: "12px", display: "flex", alignItems: "center", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "32px", fontFamily: "'Cormorant Garamond',serif", color: "#d4a842", fontWeight: 300, lineHeight: 1 }}>{movie.rating.toFixed(1)}</div>
                    <Stars rating={movie.rating} />
                  </div>
                  <div style={{ width: "1px", height: "40px", background: "rgba(160,135,90,0.15)" }} />
                  <div>
                    <div style={{ fontSize: "11px", color: "#4a3e2e", marginBottom: "4px" }}>Audience Score</div>
                    <div style={{ fontSize: "22px", color: scoreColor, fontWeight: 700 }}>{movie.score}<span style={{ fontSize: "13px", color: "#4a3e2e" }}>%</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, token, onLogout }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("rating");
  const [watchlist, setWatchlist] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedMovieId, setSelectedMovieId] = useState(null); // ← detail navigation
  const searchTimer = useRef(null);

  const genres = ["All", "Action", "Drama", "Sci-Fi", "Horror", "Comedy", "Thriller", "Crime", "Animation", "Romance", "History", "War", "Fantasy", "Mystery", "Adventure", "Music", "Family"];

  // Debounce: when user stops typing for 450ms, commit search & reset page
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 450);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  // Fetch whenever committed filters change
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      try {
        const params = new URLSearchParams({
          ...(genre !== "All" && { genre }),
          ...(search.trim() && { search: search.trim() }),
          sort,
          order: "desc",
          page,
          limit: 32,
        });
        const data = await api.get(`/movies?${params}`);
        setMovies(data.movies || []);
        setTotalPages(data.pages || 1);
        setTotal(data.total || 0);
      } catch (e) {
        console.error("Fetch error:", e);
        setMovies([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMovies();
  }, [genre, search, sort, page]);

  // Fetch watchlist on mount
  useEffect(() => {
    if (!token) return;
    api.get("/user/watchlist", token)
      .then(data => setWatchlist(data.movies.map(m => m._id)))
      .catch(() => {});
  }, [token]);

  // When genre or sort changes, always reset to page 1
  const handleGenreChange = (g) => { setGenre(g); setPage(1); };
  const handleSortChange = (s) => { setSort(s); setPage(1); };

  const handleWatchlist = async (movieId) => {
    const data = await api.post(`/movies/${movieId}/watchlist`, {}, token);
    setWatchlist(prev => data.added ? [...prev, movieId] : prev.filter(id => id !== movieId));
  };

  const displayMovies = activeTab === "watchlist"
    ? movies.filter(m => watchlist.includes(m._id))
    : movies;

  // ── Show movie detail page ──
  if (selectedMovieId) {
    return (
      <MovieDetail
        movieId={selectedMovieId}
        token={token}
        onBack={() => { setSelectedMovieId(null); window.scrollTo({ top: 0 }); }}
        onWatchlist={handleWatchlist}
        inWatchlist={watchlist.includes(selectedMovieId)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0c0a08", color: "#f0e6d3", fontFamily: "'DM Mono',monospace" }}>
      <style>{dashboardCSS}</style>
      {/* ── Header ── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid rgba(160,135,90,0.15)", background: "rgba(12,10,8,0.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🎬</span>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "22px", letterSpacing: "0.2em", color: "#d4a842" }}>THEATRON</span>
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          {["all", "watchlist"].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ background: "none", border: "none", cursor: "pointer", color: activeTab === t ? "#d4a842" : "#6b5a3e", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: activeTab === t ? "1px solid #d4a842" : "1px solid transparent", paddingBottom: "2px", transition: "all 0.2s" }}>
              {t === "watchlist" ? `Watchlist (${watchlist.length})` : "All Films"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg,#d4a842,#8a6820)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: "#0c0a08" }}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontSize: "12px", color: "#a0875a" }}>{user.name}</span>
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(160,135,90,0.25)", borderRadius: "5px", color: "#6b5a3e", padding: "6px 12px", cursor: "pointer", fontSize: "11px", letterSpacing: "0.08em" }}>LOGOUT</button>
        </div>
      </header>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px" }}>
        {/* ── Hero Text ── */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(28px,4vw,48px)", fontWeight: 300, letterSpacing: "0.05em", margin: "0 0 6px" }}>
            Welcome back, <span style={{ color: "#d4a842" }}>{user.name.split(" ")[0]}</span>.
          </h1>
          <p style={{ color: "#6b5a3e", fontSize: "12px", margin: 0 }}>{total} films in the collection</p>
        </div>

        {/* ── Controls ── */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", opacity: 0.4 }}>🔍</span>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search films…"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(160,135,90,0.2)", borderRadius: "7px", padding: "10px 36px 10px 36px", color: "#f0e6d3", fontSize: "13px", fontFamily: "'DM Mono',monospace", outline: "none", boxSizing: "border-box" }}
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(""); setSearch(""); }} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6b5a3e", cursor: "pointer", fontSize: "14px", padding: 0 }}>✕</button>
            )}
          </div>
          {/* Sort */}
          <select
            value={sort}
            onChange={e => handleSortChange(e.target.value)}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(160,135,90,0.2)", borderRadius: "7px", padding: "10px 14px", color: "#a0875a", fontSize: "12px", fontFamily: "'DM Mono',monospace", cursor: "pointer", outline: "none" }}
          >
            <option value="rating">Sort: Rating</option>
            <option value="score">Sort: Score</option>
            <option value="year">Sort: Year</option>
            <option value="title">Sort: Title A–Z</option>
          </select>
        </div>

        {/* ── Genre Pills with themed scroll ── */}
        <GenreScroller genres={genres} active={genre} onChange={handleGenreChange} />

        {/* ── Active filter indicator ── */}
        {(genre !== "All" || search) && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#6b5a3e" }}>Filtering by:</span>
            {genre !== "All" && (
              <span style={{ background: "rgba(212,168,66,0.15)", border: "1px solid rgba(212,168,66,0.3)", borderRadius: "4px", padding: "3px 10px", fontSize: "11px", color: "#d4a842", display: "flex", alignItems: "center", gap: "6px" }}>
                {genre}
                <button onClick={() => handleGenreChange("All")} style={{ background: "none", border: "none", color: "#d4a842", cursor: "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>✕</button>
              </span>
            )}
            {search && (
              <span style={{ background: "rgba(160,135,90,0.1)", border: "1px solid rgba(160,135,90,0.2)", borderRadius: "4px", padding: "3px 10px", fontSize: "11px", color: "#a0875a", display: "flex", alignItems: "center", gap: "6px" }}>
                "{search}"
                <button onClick={() => { setSearchInput(""); setSearch(""); }} style={{ background: "none", border: "none", color: "#a0875a", cursor: "pointer", padding: 0, fontSize: "12px", lineHeight: 1 }}>✕</button>
              </span>
            )}
            <span style={{ fontSize: "11px", color: "#4a3e2e" }}>{total} result{total !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* ── Movie Grid ── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px", gap: "12px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#d4a842", animation: "pulse 1s ease-in-out infinite" }} />
            <span style={{ color: "#6b5a3e", fontSize: "13px" }}>Loading films…</span>
          </div>
        ) : displayMovies.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6b5a3e" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎞</div>
            <p style={{ fontSize: "14px" }}>{activeTab === "watchlist" ? "Your watchlist is empty." : "No films found."}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "16px" }}>
            {displayMovies.map((m, i) => (
              <div key={m._id} style={{ animation: `fadeUp 0.4s ease both`, animationDelay: `${i * 0.04}s` }}>
                <MovieCard movie={m} token={token} onWatchlist={handleWatchlist} inWatchlist={watchlist.includes(m._id)} onSelect={m => setSelectedMovieId(m._id)} />
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && activeTab === "all" && (
          <div style={{ marginTop: "48px" }}>
            {/* Page info */}
            <p style={{ textAlign: "center", fontSize: "11px", color: "#4a3e2e", marginBottom: "14px", fontFamily: "'DM Mono',monospace" }}>
              Page {page} of {totalPages} &nbsp;·&nbsp; showing {Math.min(30, total - (page - 1) * 30)} of {total} films
            </p>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {/* First + Prev */}
              <button onClick={() => setPage(1)} disabled={page === 1}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(160,135,90,0.18)", borderRadius:"6px", color: page===1 ? "#3a3020" : "#6b5a3e", padding:"8px 12px", cursor: page===1 ? "not-allowed":"pointer", fontSize:"12px", fontFamily:"'DM Mono',monospace", opacity: page===1 ? 0.35:1, transition:"all 0.15s" }}>
                «
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(160,135,90,0.18)", borderRadius:"6px", color: page===1 ? "#3a3020" : "#a0875a", padding:"8px 14px", cursor: page===1 ? "not-allowed":"pointer", fontSize:"12px", fontFamily:"'DM Mono',monospace", opacity: page===1 ? 0.35:1, transition:"all 0.15s" }}>
                ← Prev
              </button>

              {/* Windowed page numbers */}
              {(() => {
                const delta = 2;
                const range = [];
                const rangeWithDots = [];
                let l;
                for (let i = 1; i <= totalPages; i++) {
                  if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                    range.push(i);
                  }
                }
                for (const i of range) {
                  if (l) {
                    if (i - l === 2) rangeWithDots.push(l + 1);
                    else if (i - l > 2) rangeWithDots.push("...");
                  }
                  rangeWithDots.push(i);
                  l = i;
                }
                return rangeWithDots.map((p, idx) =>
                  p === "..." ? (
                    <span key={`dots-${idx}`} style={{ color:"#4a3e2e", fontSize:"12px", padding:"0 4px" }}>…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      style={{ background: page===p ? "rgba(212,168,66,0.18)" : "rgba(255,255,255,0.03)", border:`1px solid ${page===p ? "rgba(212,168,66,0.45)" : "rgba(160,135,90,0.18)"}`, borderRadius:"6px", color: page===p ? "#d4a842" : "#6b5a3e", padding:"8px 13px", cursor:"pointer", fontSize:"12px", fontFamily:"'DM Mono',monospace", fontWeight: page===p ? "600":"normal", boxShadow: page===p ? "0 0 10px rgba(212,168,66,0.12)":"none", transition:"all 0.15s" }}>
                      {p}
                    </button>
                  )
                );
              })()}

              {/* Next + Last */}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(160,135,90,0.18)", borderRadius:"6px", color: page===totalPages ? "#3a3020" : "#a0875a", padding:"8px 14px", cursor: page===totalPages ? "not-allowed":"pointer", fontSize:"12px", fontFamily:"'DM Mono',monospace", opacity: page===totalPages ? 0.35:1, transition:"all 0.15s" }}>
                Next →
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(160,135,90,0.18)", borderRadius:"6px", color: page===totalPages ? "#3a3020" : "#6b5a3e", padding:"8px 12px", cursor: page===totalPages ? "not-allowed":"pointer", fontSize:"12px", fontFamily:"'DM Mono',monospace", opacity: page===totalPages ? 0.35:1, transition:"all 0.15s" }}>
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
function Input({ label, type = "text", value, onChange, icon, error, ...rest }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: "18px" }}>
      <label style={{ display: "block", fontSize: "10px", letterSpacing: "0.14em", color: "#a0875a", textTransform: "uppercase", marginBottom: "6px", fontFamily: "'Cormorant Garamond',serif", fontWeight: 600 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", opacity: 0.45 }}>{icon}</span>
        <input
          type={isPass && show ? "text" : type}
          value={value}
          onChange={onChange}
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${error ? "#e05050" : "rgba(160,135,90,0.25)"}`, borderRadius: "7px", padding: "12px 40px 12px 40px", color: "#f0e6d3", fontSize: "13px", fontFamily: "'DM Mono',monospace", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s, box-shadow 0.2s" }}
          onFocus={e => { e.target.style.borderColor = "#d4a842"; e.target.style.boxShadow = "0 0 0 3px rgba(212,168,66,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = error ? "#e05050" : "rgba(160,135,90,0.25)"; e.target.style.boxShadow = "none"; }}
          {...rest}
        />
        {isPass && <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#a0875a", fontSize: "15px", padding: 0 }}>{show ? "🙈" : "👁"}</button>}
      </div>
      {error && <p style={{ margin: "5px 0 0", fontSize: "11px", color: "#e05050", fontFamily: "'DM Mono',monospace" }}>{error}</p>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MovieAuth() {
  const [mode, setMode] = useState("login");
  const [user, setUser] = useState(() => { try { return JSON.parse(store.get("th_user")); } catch { return null; } });
  const [token, setToken] = useState(() => store.get("th_token"));
  const [fields, setFields] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState("");

  const set = key => e => { setFields(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: "" })); setApiError(""); };

  const validate = () => {
    const e = {};
    if (mode === "register" && !fields.name.trim()) e.name = "Name is required";
    if (!fields.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Valid email required";
    if (fields.password.length < 6) e.password = "Min 6 characters";
    if (mode === "register" && fields.password !== fields.confirm) e.confirm = "Passwords don't match";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true); setApiError("");
    try {
      const result = mode === "login"
        ? await api.post("/auth/login", { email: fields.email, password: fields.password })
        : await api.post("/auth/register", { name: fields.name, email: fields.email, password: fields.password });
      store.set("th_token", result.accessToken);
      store.set("th_user", JSON.stringify(result.user));
      setSuccess(mode === "login" ? "Welcome back!" : "Account created!");
      setTimeout(() => { setToken(result.accessToken); setUser(result.user); }, 500);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    store.clear(); setUser(null); setToken(null); setSuccess(""); setApiError("");
    setFields({ name: "", email: "", password: "", confirm: "" });
  };

  if (user && token) return <Dashboard user={user} token={token} onLogout={handleLogout} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0c0a08}
        input::placeholder{color:rgba(160,135,90,0.3)}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 100px #141008 inset!important;-webkit-text-fill-color:#f0e6d3!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes flicker{0%,100%{opacity:1}92%{opacity:.97}94%{opacity:.65}96%{opacity:.9}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.5}}
        .card-anim{animation:fadeUp 0.55s ease both}
        .logo{animation:flicker 5s infinite}
        .btn-gold{background:linear-gradient(90deg,#d4a842 0%,#f5d07a 50%,#d4a842 100%);background-size:200% auto;transition:background-position 0.4s,transform 0.15s}
        .btn-gold:hover{background-position:right center;transform:translateY(-1px)}
        .btn-gold:active{transform:translateY(0)}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:rgba(255,255,255,0.03)}
        ::-webkit-scrollbar-thumb{background:rgba(212,168,66,0.3);border-radius:3px}
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", background: "#0c0a08", position: "relative", overflow: "hidden" }}>
        <Particles />

        {/* Left panel */}
        <div style={{ flex: "1 1 55%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "60px 56px", background: "linear-gradient(145deg,#1a1408 0%,#0c0a08 100%)", borderRight: "1px solid rgba(160,135,90,0.1)", position: "relative", overflow: "hidden" }}>
          {/* Decorative rings */}
          {[400, 320, 240].map((s, i) => (
            <div key={i} style={{ position: "absolute", top: `${-s / 3}px`, right: `${-s / 3}px`, width: `${s}px`, height: `${s}px`, borderRadius: "50%", border: `1px solid rgba(212,168,66,${0.04 + i * 0.02})`, pointerEvents: "none" }} />
          ))}
          {/* Film strip */}
          <div style={{ position: "absolute", left: "24px", top: "8%", display: "flex", flexDirection: "column", gap: "8px", opacity: 0.1 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} style={{ width: "26px", height: "18px", border: "1px solid #d4a842", borderRadius: "2px" }} />
            ))}
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: "58px", marginBottom: "20px" }}>🎬</div>
            <h1 className="logo" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(42px,5.5vw,72px)", fontWeight: 300, letterSpacing: "0.18em", color: "#d4a842", lineHeight: 1, marginBottom: "18px" }}>THEATRON</h1>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "17px", fontStyle: "italic", color: "rgba(240,230,211,0.45)", lineHeight: 1.7, maxWidth: "380px", marginBottom: "48px" }}>
              "Cinema is a mirror by which we often see ourselves."
              <br /><span style={{ fontSize: "12px", fontStyle: "normal", color: "#4a3e2e", letterSpacing: "0.1em" }}>— Martin Scorsese</span>
            </p>
            <div style={{ display: "flex", gap: "36px" }}>
              {[["100+", "Films"], ["20", "Genres"]].map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "28px", color: "#d4a842", fontWeight: 600 }}>{v}</div>
                  <div style={{ fontSize: "10px", color: "#6b5a3e", letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel – form */}
        <div style={{ flex: "0 0 min(460px,45%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 36px", position: "relative", zIndex: 1 }}>
          <div className="card-anim" style={{ width: "100%", maxWidth: "400px" }}>
            {/* Mode toggle */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "3px", marginBottom: "32px", border: "1px solid rgba(160,135,90,0.12)" }}>
              {["login", "register"].map(m => (
                <button key={m} onClick={() => { setMode(m); setErrors({}); setApiError(""); setSuccess(""); }} style={{ flex: 1, padding: "9px", background: mode === m ? "rgba(212,168,66,0.12)" : "transparent", border: mode === m ? "1px solid rgba(212,168,66,0.28)" : "1px solid transparent", borderRadius: "6px", color: mode === m ? "#d4a842" : "#6b5a3e", fontFamily: "'DM Mono',monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}>
                  {m === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "28px", fontWeight: 400, color: "#f0e6d3", marginBottom: "5px" }}>
              {mode === "login" ? "Welcome back." : "Join the club."}
            </h2>
            <p style={{ color: "#6b5a3e", fontSize: "12px", marginBottom: "28px" }}>
              {mode === "login" ? "Sign in to your cinematic universe." : "Create your account to get started."}
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {mode === "register" && <Input label="Full Name" icon="👤" value={fields.name} onChange={set("name")} error={errors.name} placeholder="Your name" autoComplete="name" />}
              <Input label="Email Address" type="email" icon="✉️" value={fields.email} onChange={set("email")} error={errors.email} placeholder="you@example.com" autoComplete="email" />
              <Input label="Password" type="password" icon="🔐" value={fields.password} onChange={set("password")} error={errors.password} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
              {mode === "register" && <Input label="Confirm Password" type="password" icon="🔑" value={fields.confirm} onChange={set("confirm")} error={errors.confirm} placeholder="••••••••" autoComplete="new-password" />}

              {apiError && (
                <div style={{ background: "rgba(224,80,80,0.08)", border: "1px solid rgba(224,80,80,0.25)", borderRadius: "6px", padding: "11px 13px", marginBottom: "16px", fontSize: "12px", color: "#e05050", fontFamily: "'DM Mono',monospace" }}>
                  ⚠️ {apiError}
                </div>
              )}
              {success && (
                <div style={{ background: "rgba(80,200,120,0.08)", border: "1px solid rgba(80,200,120,0.25)", borderRadius: "6px", padding: "11px 13px", marginBottom: "16px", fontSize: "12px", color: "#50c878", fontFamily: "'DM Mono',monospace" }}>
                  ✓ {success}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-gold" style={{ width: "100%", padding: "14px", borderRadius: "7px", border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Mono',monospace", fontSize: "12px", letterSpacing: "0.15em", fontWeight: 500, color: "#0c0a08", textTransform: "uppercase", opacity: loading ? 0.7 : 1, marginBottom: "18px" }}>
                {loading ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "→ Sign In" : "→ Create Account")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
