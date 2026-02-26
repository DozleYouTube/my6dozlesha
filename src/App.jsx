import { useState, useRef, useCallback } from "react";

const CELL_COUNT = 6;
const COLS = 3;
const ROWS = 2;

// ── シェア画像生成 ──────────────────────────────────────────────
// img要素からBlob URL経由でCanvasに描く（CORS回避）
function imgElementToImageData(imgEl) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = imgEl.naturalWidth || imgEl.width;
    c.height = imgEl.naturalHeight || imgEl.height;
    const ctx = c.getContext("2d");
    try { ctx.drawImage(imgEl, 0, 0); resolve(c); }
    catch { resolve(null); }
  });
}

async function generateShareCanvas(cells, authorName, imgEls) {
  const CELL_W = 220, CELL_H = 140, GAP = 8, PAD = 20;
  const HEADER_H = 90, FOOTER_H = 44;
  const W = COLS * CELL_W + (COLS - 1) * GAP + PAD * 2;
  const H = HEADER_H + ROWS * CELL_H + (ROWS - 1) * GAP + PAD * 2 + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);

  // BG
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#08080f"); bgGrad.addColorStop(1, "#0c0d20");
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(99,102,241,0.07)"; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Header
  ctx.textAlign = "center";
  ctx.font = "bold 10px Arial"; ctx.fillStyle = "#6366f1";
  ctx.fillText("MY  DOZLE-SHA", W/2, PAD + 16);
  ctx.font = "bold 18px Arial"; ctx.fillStyle = "#fff";
  ctx.fillText(authorName ? `${authorName} を構成する6つのドズル社動画` : "私を構成する6つのドズル社動画", W/2, PAD + 44);
  ctx.strokeStyle = "rgba(99,102,241,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, PAD+56); ctx.lineTo(W-PAD, PAD+56); ctx.stroke();

  // Cells
  for (let i = 0; i < CELL_COUNT; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = PAD + col * (CELL_W + GAP);
    const y = HEADER_H + PAD + row * (CELL_H + GAP);

    // Cell bg
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 7); ctx.fill();
    ctx.strokeStyle = "rgba(99,102,241,0.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 7); ctx.stroke();

    // Number
    ctx.fillStyle = "rgba(99,102,241,0.55)"; ctx.font = "bold 9px Arial";
    ctx.textAlign = "left"; ctx.fillText(`${i+1}`, x+6, y+14);

    if (cells[i] && imgEls[i]) {
      try {
        const src = imgEls[i];
        ctx.save();
        ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 7); ctx.clip();
        const s = Math.max(CELL_W / src.naturalWidth, CELL_H / src.naturalHeight);
        const sw = src.naturalWidth * s, sh = src.naturalHeight * s;
        ctx.drawImage(src, x + (CELL_W - sw)/2, y + (CELL_H - sh)/2, sw, sh);
        // Gradient overlay
        const g = ctx.createLinearGradient(x, y + CELL_H*0.4, x, y + CELL_H);
        g.addColorStop(0, "transparent"); g.addColorStop(1, "rgba(0,0,0,0.82)");
        ctx.fillStyle = g; ctx.fillRect(x, y, CELL_W, CELL_H);
        ctx.restore();
        // Title
        ctx.save();
        ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 7); ctx.clip();
        ctx.fillStyle = "#fff"; ctx.font = "bold 9px Arial"; ctx.textAlign = "center";
        const t = cells[i].title.length > 30 ? cells[i].title.slice(0,28)+"…" : cells[i].title;
        ctx.fillText(t, x + CELL_W/2, y + CELL_H - 9);
        ctx.restore();
      } catch(e) {
        // fallback color
        ctx.fillStyle = "rgba(99,102,241,0.12)";
        ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 7); ctx.fill();
      }
    }
  }

  // Footer
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(99,102,241,0.4)";
  ctx.font = "9px Arial";
  ctx.fillText("#My3dozlesha  #ドズル社  youtube.com/@dozle", W/2, H - 14);

  return canvas;
}

// ── メインコンポーネント ────────────────────────────────────────
export default function App() {
  const [author, setAuthor] = useState("");
  const [cells, setCells] = useState(Array(CELL_COUNT).fill(null));
  const [activeCell, setActiveCell] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");
  const [thumbErrors, setThumbErrors] = useState({});
  const searchRef = useRef(null);
  // Store img element refs for canvas drawing
  const imgRefs = useRef({});

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  const openModal = (i) => {
    setActiveCell(i); setSearchQuery(""); setSearchResults([]);
    setTimeout(() => searchRef.current?.focus(), 100);
  };
  const closeModal = () => { setActiveCell(null); setSearchQuery(""); setSearchResults([]); };

  const doSearch = async (q) => {
    if (!q.trim()) return;
    setSearching(true); setSearchResults([]);

    const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (!API_KEY) { showToast("YouTube APIキーが設定されていません"); setSearching(false); return; }

    try {
      const DOZLE_CHANNEL_ID = "UCj4PjeVMnNTHIR5EeoNKPAw";
      const params = new URLSearchParams({
        part: "snippet",
        q: q,
        channelId: DOZLE_CHANNEL_ID,
        type: "video",
        maxResults: 6,
        order: "relevance",
        key: API_KEY,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
      const data = await res.json();

      if (data.error) {
        console.error(data.error);
        showToast("検索に失敗しました");
      } else if (!data.items?.length) {
        showToast("動画が見つかりませんでした");
      } else {
        const results = data.items.map(item => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
        }));
        setSearchResults(results);
      }
    } catch (e) { console.error(e); showToast("検索に失敗しました"); }
    setSearching(false);
  };

  const selectVideo = (v) => {
    setCells(prev => { const n=[...prev]; n[activeCell]=v; return n; });
    setThumbErrors(prev => { const n={...prev}; delete n[activeCell]; return n; });
    closeModal();
  };
  const removeCell = (e, i) => {
    e.stopPropagation();
    setCells(prev => { const n=[...prev]; n[i]=null; return n; });
    delete imgRefs.current[i];
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      // Collect img elements from refs
      const imgEls = {};
      for (let i = 0; i < CELL_COUNT; i++) {
        if (imgRefs.current[i] && cells[i]) imgEls[i] = imgRefs.current[i];
      }
      const canvas = await generateShareCanvas(cells, author, imgEls);
      const link = document.createElement("a");
      link.download = "my-dozlesha.png"; link.href = canvas.toDataURL("image/png"); link.click();
      showToast("画像を保存しました！🎉");
    } catch (e) { console.error(e); showToast("画像の生成に失敗しました"); }
    setGenerating(false);
  };

  const handleCopyText = () => {
    const lines = cells.map((c,i) => c ? `${i+1}️⃣ ${c.title}` : `${i+1}️⃣ （未選択）`).join("\n");
    navigator.clipboard?.writeText(`私を構成する6つのドズル社動画🎮\n${lines}\n\n#My3dozlesha #ドズル社\nhttps://youtube.com/@dozle`);
    showToast("コピーしました！");
  };

  const handleTwitterShare = async () => {
    setGenerating(true);
    try {
      const imgEls = {};
      for (let i = 0; i < CELL_COUNT; i++) {
        if (imgRefs.current[i] && cells[i]) imgEls[i] = imgRefs.current[i];
      }
      const canvas = await generateShareCanvas(cells, author, imgEls);
      const tweetText = `私を構成する6つのドズル社動画🎮\n#My3dozlesha #ドズル社\nhttps://youtube.com/@dozle`;

      // モバイル：Web Share APIで画像ごとシェア
      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async (blob) => {
          const file = new File([blob], "my-dozlesha.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ text: tweetText, files: [file] });
              setGenerating(false);
              return;
            } catch (e) { /* fallback below */ }
          }
          // Web Share API非対応 → fallback
          fallbackTwitter(canvas, tweetText);
          setGenerating(false);
        }, "image/png");
      } else {
        // PC：画像DL + Twitterを開く
        fallbackTwitter(canvas, tweetText);
        setGenerating(false);
      }
    } catch (e) { console.error(e); showToast("シェアに失敗しました"); setGenerating(false); }
  };

  const fallbackTwitter = (canvas, tweetText) => {
    // 画像をDL
    const link = document.createElement("a");
    link.download = "my-dozlesha.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    // 少し待ってからTwitterを開く
    setTimeout(() => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(url, "_blank");
      showToast("画像をDLしました！Twitterに添付してね📎");
    }, 800);
  };

  const filledCount = cells.filter(Boolean).length;
  const thumbUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.11) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(56,189,248,0.07) 0%, transparent 50%)", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", color: "#fff", padding: "28px 16px 80px" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", background: "#6366f1", color: "#fff", padding: "9px 22px", borderRadius: 99, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 4px 18px rgba(99,102,241,0.45)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast}
        </div>
      )}

      {/* ── Search Modal ── */}
      {activeCell !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={closeModal}>
          <div style={{ background: "#0e0e20", border: "1px solid #1e1e3c", borderRadius: 20, padding: "22px 20px", width: "100%", maxWidth: 460, maxHeight: "82vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.75)" }} onClick={e => e.stopPropagation()}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>スロット {activeCell + 1} を選ぶ</span>
              <button onClick={closeModal} style={{ background: "none", border: "none", color: "#444", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Search bar */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={searchRef}
                type="text"
                placeholder="例：終われません、大富豪おじいちゃん、エンドラ討伐…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch(searchQuery)}
                style={{ flex: 1, background: "#090912", border: "1px solid #1e1e38", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 12, outline: "none" }}
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#1e1e38"}
              />
              <button
                onClick={() => doSearch(searchQuery)}
                disabled={searching || !searchQuery.trim()}
                style={{ background: searching || !searchQuery.trim() ? "#12121e" : "linear-gradient(135deg,#6366f1,#a78bfa)", border: "none", borderRadius: 10, padding: "9px 14px", color: searching || !searchQuery.trim() ? "#333" : "#fff", fontWeight: 800, fontSize: 12, cursor: searching || !searchQuery.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
              >
                {searching ? "検索中…" : "🔍 検索"}
              </button>
            </div>

            {/* Results */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {searching && (
                <div style={{ textAlign: "center", color: "#444", padding: "32px 0", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                  ドズル社の動画を検索中…
                </div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ textAlign: "center", color: "#2a2a40", padding: "32px 0", fontSize: 12 }}>
                  {searchQuery ? "Enterまたは検索ボタンを押してください" : "キーワードを入力して検索しましょう"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {searchResults.map((v, i) => (
                  <button key={i} onClick={() => selectVideo(v)}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: "#080812", border: "1px solid #1a1a30", borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#111125"; e.currentTarget.style.borderColor = "#6366f145"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#080812"; e.currentTarget.style.borderColor = "#1a1a30"; }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <img
                        src={v.thumbnail || thumbUrl(v.videoId)}
                        alt={v.title}
                        style={{ width: 90, height: 56, objectFit: "cover", borderRadius: 6, display: "block", background: "#111" }}
                        onError={e => { e.target.src = `https://img.youtube.com/vi/${v.videoId}/0.jpg`; }}
                      />
                      <div style={{ position: "absolute", bottom: 3, right: 3, background: "rgba(0,0,0,0.7)", borderRadius: 3, padding: "1px 4px", fontSize: 8, color: "#fff", fontWeight: 700 }}>▶</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.45, fontWeight: 600 }}>{v.title}</div>
                      <div style={{ fontSize: 9, color: "#444", marginTop: 3 }}>youtube.com/watch?v={v.videoId}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: "#6366f1", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>DOZLE CORP. × YOU</div>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 900, background: "linear-gradient(135deg,#818cf8,#a78bfa,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -0.5 }}>My Dozle-sha</h1>
        <div style={{ fontSize: 11, color: "#333", marginTop: 4 }}>私を構成する6つのドズル社動画</div>
      </div>

      {/* ── Name input ── */}
      <div style={{ maxWidth: 540, margin: "0 auto 20px" }}>
        <label style={{ fontSize: 10, color: "#444", fontWeight: 700, letterSpacing: 1, display: "block", marginBottom: 5 }}>制作者名（任意）</label>
        <input type="text" maxLength={40} placeholder="あなたの名前" value={author} onChange={e => setAuthor(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "#0c0c1a", border: "1px solid #1a1a30", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }}
          onFocus={e => e.target.style.borderColor = "#6366f1"} onBlur={e => e.target.style.borderColor = "#1a1a30"}
        />
        <div style={{ textAlign: "right", fontSize: 9, color: "#2a2a3a", marginTop: 3 }}>{author.length}/40</div>
      </div>

      {/* ── 3×2 Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 540, margin: "0 auto 20px" }}>
        {cells.map((cell, i) => (
          <div key={i} onClick={() => openModal(i)}
            style={{ aspectRatio: "16/10", background: cell ? "transparent" : "#0c0c1a", border: `1px solid ${cell ? "rgba(99,102,241,0.3)" : "#1a1a30"}`, borderRadius: 12, position: "relative", cursor: "pointer", overflow: "hidden", transition: "border-color 0.18s, box-shadow 0.18s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f150"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.14)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = cell ? "rgba(99,102,241,0.3)" : "#1a1a30"; e.currentTarget.style.boxShadow = "none"; }}
          >
            {/* Number badge */}
            <div style={{ position: "absolute", top: 5, left: 7, zIndex: 3, fontSize: 9, fontWeight: 800, color: cell ? "rgba(255,255,255,0.7)" : "#2a2a40", textShadow: cell ? "0 1px 3px rgba(0,0,0,0.8)" : "none" }}>{i + 1}</div>

            {cell ? (
              <>
                {/* Thumbnail — useRef to grab for canvas */}
                <img
                  ref={el => { if (el) imgRefs.current[i] = el; }}
                  src={thumbUrl(cell.videoId)}
                  alt={cell.title}
                  crossOrigin="anonymous"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onLoad={e => { imgRefs.current[i] = e.target; setThumbErrors(p => { const n={...p}; delete n[i]; return n; }); }}
                  onError={e => {
                    // fallback to hqdefault
                    if (!e.target.src.includes("hqdefault")) {
                      e.target.src = `https://i.ytimg.com/vi/${cell.videoId}/hqdefault.jpg`;
                    } else {
                      setThumbErrors(p => ({ ...p, [i]: true }));
                    }
                  }}
                />
                {/* Overlay */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 35%, rgba(0,0,0,0.82))", pointerEvents: "none" }} />
                {/* Title */}
                <div style={{ position: "absolute", bottom: 5, left: 5, right: 5, zIndex: 2, fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", pointerEvents: "none" }}>
                  {cell.title}
                </div>
                {/* Remove btn */}
                <button onClick={e => removeCell(e, i)} style={{ position: "absolute", top: 3, right: 3, zIndex: 4, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 20, height: 20, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
                {/* Error indicator */}
                {thumbErrors[i] && (
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 2, fontSize: 22 }}>🎮</div>
                )}
              </>
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#252540" }}>
                <span style={{ fontSize: 22 }}>＋</span>
                <span style={{ fontSize: 10, fontWeight: 600 }}>選択</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Progress ── */}
      <div style={{ maxWidth: 540, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginBottom: 5 }}>
          <span>{filledCount} / 6 選択済み</span>
          <span>{Math.round(filledCount / 6 * 100)}%</span>
        </div>
        <div style={{ height: 3, background: "#111", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${filledCount / 6 * 100}%`, background: filledCount === 6 ? "linear-gradient(90deg,#6366f1,#38bdf8)" : "linear-gradient(90deg,#6366f1,#a78bfa)", borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* ── Buttons ── */}
      <div style={{ maxWidth: 540, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Twitterシェアボタン（メイン） */}
        <button onClick={handleTwitterShare} disabled={filledCount === 0 || generating}
          style={{ width: "100%", padding: "15px", background: filledCount === 0 ? "#0c0c1a" : "linear-gradient(135deg,#1d9bf0,#0d7abf)", border: filledCount === 0 ? "1px solid #1a1a30" : "none", borderRadius: 12, color: filledCount === 0 ? "#252535" : "#fff", fontSize: 15, fontWeight: 800, cursor: filledCount === 0 || generating ? "not-allowed" : "pointer", boxShadow: filledCount > 0 ? "0 4px 22px rgba(29,155,240,0.35)" : "none", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {generating ? "⏳ 生成中..." : (
            <>{filledCount === 0 ? "🐦 Xでシェア" : "🐦 Xでシェアする"} {filledCount > 0 && <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>({filledCount}/6)</span>}</>
          )}
        </button>
        {/* サブボタン行 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleCopyText} disabled={filledCount === 0}
            style={{ flex: 1, padding: "11px", background: "#0c0c1a", border: "1px solid #1a1a30", borderRadius: 12, color: filledCount === 0 ? "#252535" : "#666", fontSize: 12, fontWeight: 700, cursor: filledCount === 0 ? "not-allowed" : "pointer" }}>
            📋 テキストコピー
          </button>
          <button onClick={handleDownload} disabled={filledCount === 0 || generating}
            style={{ flex: 1, padding: "11px", background: "#0c0c1a", border: filledCount === 0 ? "1px solid #1a1a30" : "1px solid #6366f140", borderRadius: 12, color: filledCount === 0 ? "#252535" : "#a78bfa", fontSize: 12, fontWeight: 700, cursor: filledCount === 0 || generating ? "not-allowed" : "pointer" }}>
            ⬇️ 画像だけDL
          </button>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: #22223a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1a1a30; border-radius: 2px; }
      `}</style>
    </div>
  );
}
