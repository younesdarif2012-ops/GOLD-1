import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── ALGORITHMIC ENGINE ────────────────────────────────────────────────────
const generateGoldPrice = (base = 2380, length = 200, volatility = 8) => {
  const prices = [];
  let price = base;
  let trend = 0.02;
  for (let i = 0; i < length; i++) {
    trend += (Math.random() - 0.495) * 0.01;
    trend = Math.max(-0.15, Math.min(0.15, trend));
    price += trend * price * 0.001 + (Math.random() - 0.5) * volatility;
    prices.push(Math.max(1800, price));
  }
  return prices;
};

const calcSMA = (data, period) => {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
};

const calcEMA = (data, period) => {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
};

const calcRSI = (data, period = 14) => {
  const rsi = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) { rsi.push(null); continue; }
    const changes = data.slice(i - period, i).map((v, j, a) => j === 0 ? 0 : v - a[j - 1]);
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    if (losses === 0) { rsi.push(100); continue; }
    rsi.push(100 - 100 / (1 + gains / losses));
  }
  return rsi;
};

const calcMACD = (data) => {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signal[i]);
  return { macdLine, signal, histogram };
};

const calcBollingerBands = (data, period = 20, stdDev = 2) => {
  const sma = calcSMA(data, period);
  return data.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const slice = data.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
    return { upper: mean + stdDev * std, middle: mean, lower: mean - stdDev * std };
  });
};

const generateSignal = (prices, rsi, macd, bb) => {
  const last = prices.length - 1;
  const p = prices[last];
  const r = rsi[last];
  const m = macd.histogram[last];
  const mPrev = macd.histogram[last - 1];
  const b = bb[last];
  let score = 0;
  let reasons = [];

  if (r < 30) { score += 2; reasons.push("RSI survendu (<30)"); }
  else if (r > 70) { score -= 2; reasons.push("RSI suracheté (>70)"); }
  if (m > 0 && mPrev <= 0) { score += 2; reasons.push("Croisement MACD haussier"); }
  if (m < 0 && mPrev >= 0) { score -= 2; reasons.push("Croisement MACD baissier"); }
  if (b.lower && p < b.lower) { score += 1.5; reasons.push("Prix sous BB inférieure"); }
  if (b.upper && p > b.upper) { score -= 1.5; reasons.push("Prix au-dessus BB supérieure"); }
  const sma50 = calcSMA(prices, 50);
  const sma200 = calcSMA(prices, 200);
  if (sma50[last] && sma200[last]) {
    if (sma50[last] > sma200[last]) { score += 1; reasons.push("Golden Cross actif"); }
    else { score -= 1; reasons.push("Death Cross actif"); }
  }
  if (score >= 3) return { signal: "ACHAT FORT", color: "#00e676", score, reasons, icon: "▲▲" };
  if (score >= 1.5) return { signal: "ACHAT", color: "#69f0ae", score, reasons, icon: "▲" };
  if (score <= -3) return { signal: "VENTE FORTE", color: "#ff1744", score, reasons, icon: "▼▼" };
  if (score <= -1.5) return { signal: "VENTE", color: "#ff5252", score, reasons, icon: "▼" };
  return { signal: "NEUTRE", color: "#ffd700", score, reasons, icon: "◆" };
};

const backtestStrategy = (prices) => {
  const rsi = calcRSI(prices);
  const bb = calcBollingerBands(prices);
  let capital = 10000;
  let position = null;
  const trades = [];
  const equity = [capital];

  for (let i = 20; i < prices.length - 1; i++) {
    const r = rsi[i];
    const b = bb[i];
    const p = prices[i];
    if (!position && r < 32 && b.lower && p < b.lower) {
      position = { entry: p, entryIdx: i };
    } else if (position && (r > 65 || (b.upper && p > b.upper))) {
      const pnl = (p - position.entry) / position.entry;
      capital *= (1 + pnl);
      trades.push({ entry: position.entry, exit: p, pnl: pnl * 100, win: pnl > 0 });
      position = null;
    }
    equity.push(capital);
  }
  const wins = trades.filter(t => t.win).length;
  return {
    finalCapital: capital,
    return: ((capital - 10000) / 10000 * 100).toFixed(2),
    trades: trades.length,
    winRate: trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0,
    equity: equity.map((v, i) => ({ i, value: v })),
    recentTrades: trades.slice(-8)
  };
};

// ─── CORRELATED MARKETS ────────────────────────────────────────────────────
const generateCorrelated = () => {
  const base = { DXY: 104.2, SPX: 5234, OIL: 78.5, BTC: 67800, US10Y: 4.32, SILVER: 28.4 };
  const changes = { DXY: -0.23, SPX: 0.87, OIL: 1.2, BTC: 2.1, US10Y: -0.03, SILVER: 1.8 };
  const correlations = { DXY: -0.78, SPX: 0.42, OIL: 0.61, BTC: 0.38, US10Y: -0.55, SILVER: 0.91 };
  const icons = { DXY: "💵", SPX: "📈", OIL: "🛢️", BTC: "₿", US10Y: "🏦", SILVER: "🥈" };
  return Object.entries(base).map(([k, v]) => ({
    name: k, price: v, change: changes[k], correlation: correlations[k], icon: icons[k],
    impact: Math.abs(correlations[k]) > 0.6 ? "FORT" : Math.abs(correlations[k]) > 0.4 ? "MODÉRÉ" : "FAIBLE",
    direction: correlations[k] > 0 ? "POSITIF" : "NÉGATIF"
  }));
};

const economicEvents = [
  { time: "14:30", event: "NFP USA", impact: "HIGH", expected: "200K", prev: "187K", goldImpact: "↑ Baissier Or" },
  { time: "16:00", event: "Fed Speech Powell", impact: "HIGH", expected: "Hawkish", prev: "-", goldImpact: "↑ Volatile" },
  { time: "10:00", event: "CPI Zone Euro", impact: "MED", expected: "2.3%", prev: "2.4%", goldImpact: "↓ Neutre" },
  { time: "08:00", event: "PMI Manufacturier", impact: "MED", expected: "48.5", prev: "47.9", goldImpact: "↓ Faible" },
  { time: "20:00", event: "Réserves Chine", impact: "HIGH", expected: "+12T", prev: "+8T", goldImpact: "↑ Haussier Or" },
];

// ─── AI SIGNAL ENGINE ──────────────────────────────────────────────────────
const getAIAnalysis = async (priceData, signal, correlatedData) => {
  const prompt = `Tu es un expert trader sur l'or (XAU/USD). Analyse cette situation:
Prix actuel: $${priceData[priceData.length - 1].toFixed(2)}
Signal algorithmique: ${signal.signal} (score: ${signal.score.toFixed(1)})
Raisons: ${signal.reasons.join(', ')}
Marchés corrélés: DXY${correlatedData[0].change > 0 ? '+' : ''}${correlatedData[0].change}%, SPX${correlatedData[1].change > 0 ? '+' : ''}${correlatedData[1].change}%
Donne en 3 phrases max: 1) Ton analyse de la situation actuelle 2) La meilleure position à prendre 3) Les niveaux clés (entrée/SL/TP).
Sois direct, précis, professionnel. Commence directement l'analyse.`;

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || "Analyse indisponible.";
  } catch {
    return "Connexion à l'IA temporairement indisponible.";
  }
};

// ─── COMPONENTS ────────────────────────────────────────────────────────────
const GlowCard = ({ children, className = "", glow = "gold" }) => {
  const glowColor = glow === "gold" ? "#ffd700" : glow === "green" ? "#00e676" : glow === "red" ? "#ff1744" : "#60a5fa";
  return (
    <div className={`glow-card ${className}`} style={{ "--glow": glowColor }}>
      {children}
    </div>
  );
};

const PriceDisplay = ({ price, change, changePercent }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: "3.5rem", fontFamily: "'Playfair Display', serif", fontWeight: 700, color: "#ffd700", letterSpacing: "-1px", textShadow: "0 0 40px rgba(255,215,0,0.4)" }}>
      ${price?.toFixed(2)}
    </div>
    <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "4px" }}>
      <span style={{ color: change >= 0 ? "#00e676" : "#ff5252", fontSize: "1.1rem", fontWeight: 600 }}>
        {change >= 0 ? "▲" : "▼"} ${Math.abs(change || 0).toFixed(2)}
      </span>
      <span style={{ color: change >= 0 ? "#00e676" : "#ff5252", fontSize: "1.1rem" }}>
        ({changePercent >= 0 ? "+" : ""}{changePercent?.toFixed(2)}%)
      </span>
    </div>
    <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "2px", letterSpacing: "2px" }}>XAU/USD • SPOT</div>
  </div>
);

const SignalBadge = ({ signal }) => (
  <div style={{
    background: `linear-gradient(135deg, ${signal.color}22, ${signal.color}11)`,
    border: `2px solid ${signal.color}`,
    borderRadius: "12px", padding: "16px 24px", textAlign: "center",
    boxShadow: `0 0 30px ${signal.color}33`
  }}>
    <div style={{ fontSize: "2rem", marginBottom: "4px" }}>{signal.icon}</div>
    <div style={{ color: signal.color, fontSize: "1.3rem", fontWeight: 800, letterSpacing: "2px" }}>{signal.signal}</div>
    <div style={{ color: "#aaa", fontSize: "0.8rem", marginTop: "4px" }}>Score: {signal.score?.toFixed(1)}/6</div>
  </div>
);

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0a0a0f", border: "1px solid #ffd70044", borderRadius: "8px", padding: "10px 14px" }}>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: "0.85rem" }}>
          {p.name}: <strong>${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function GoldTradingDashboard() {
  const [prices, setPrices] = useState(() => generateGoldPrice(2380, 200));
  const [chartData, setChartData] = useState([]);
  const [signal, setSignal] = useState(null);
  const [backtest, setBacktest] = useState(null);
  const [correlated, setCorrelated] = useState(generateCorrelated());
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chart");
  const [indicators, setIndicators] = useState({ sma20: true, sma50: true, bb: true });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [priceFlash, setPriceFlash] = useState(null);
  const [timeframe, setTimeframe] = useState("1H");
  const intervalRef = useRef(null);

  const computeAll = useCallback((priceArr) => {
    const rsi = calcRSI(priceArr);
    const macd = calcMACD(priceArr);
    const bb = calcBollingerBands(priceArr);
    const sma20 = calcSMA(priceArr, 20);
    const sma50 = calcSMA(priceArr, 50);
    const sig = generateSignal(priceArr, rsi, macd, bb);
    setSignal(sig);

    const labels = priceArr.map((_, i) => {
      const d = new Date(); d.setMinutes(d.getMinutes() - (priceArr.length - i));
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    });

    const cd = priceArr.map((p, i) => ({
      time: labels[i], price: p,
      sma20: sma20[i], sma50: sma50[i],
      bbUpper: bb[i].upper, bbLower: bb[i].lower, bbMiddle: bb[i].middle,
      rsi: rsi[i], macd: macd.macdLine[i], signal_line: macd.signal[i],
      histogram: macd.histogram[i], volume: Math.floor(Math.random() * 5000 + 2000)
    }));
    setChartData(cd);
    setBacktest(backtestStrategy(priceArr));
  }, []);

  useEffect(() => { computeAll(prices); }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setPrices(prev => {
        const newPrices = [...prev.slice(1)];
        const lastP = prev[prev.length - 1];
        const change = (Math.random() - 0.498) * 4;
        const newP = Math.max(1900, lastP + change);
        newPrices.push(newP);
        setPriceFlash(change >= 0 ? "up" : "down");
        setTimeout(() => setPriceFlash(null), 400);
        computeAll(newPrices);
        setLastUpdate(new Date());
        setCorrelated(generateCorrelated());
        return newPrices;
      });
    }, 2000);
    return () => clearInterval(intervalRef.current);
  }, [computeAll]);

  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const priceChange = currentPrice - prevPrice;
  const priceChangePct = (priceChange / prevPrice) * 100;

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis("");
    const analysis = await getAIAnalysis(prices, signal, correlated);
    setAiAnalysis(analysis);
    setAiLoading(false);
  };

  const tabs = [
    { id: "chart", label: "📊 Graphique" },
    { id: "signals", label: "⚡ Signaux" },
    { id: "backtest", label: "🔬 Backtest" },
    { id: "markets", label: "🌐 Marchés" },
    { id: "calendar", label: "📅 Agenda" },
    { id: "ai", label: "🤖 IA Analyse" }
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#040408", color: "#e8e0d0", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0a0f; } ::-webkit-scrollbar-thumb { background: #ffd70044; border-radius: 2px; }
        .glow-card { background: linear-gradient(135deg, #0d0d18 0%, #080810 100%); border: 1px solid #ffd70022; border-radius: 16px; padding: 20px; position: relative; overflow: hidden; transition: border-color 0.3s; }
        .glow-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--glow, #ffd700)44, transparent); }
        .glow-card:hover { border-color: #ffd70044; }
        .tab-btn { background: none; border: 1px solid #1a1a2e; color: #888; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 500; transition: all 0.2s; white-space: nowrap; }
        .tab-btn:hover { border-color: #ffd70044; color: #ffd700; }
        .tab-btn.active { background: linear-gradient(135deg, #ffd70022, #ffd70011); border-color: #ffd70066; color: #ffd700; }
        .tf-btn { background: none; border: 1px solid #1a1a2e; color: #666; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-family: 'DM Mono', monospace; transition: all 0.2s; }
        .tf-btn:hover, .tf-btn.active { background: #ffd70011; border-color: #ffd70055; color: #ffd700; }
        .ind-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 6px; border: 1px solid #1a1a2e; font-size: 0.75rem; transition: all 0.2s; background: none; color: #888; font-family: 'DM Sans', sans-serif; }
        .ind-toggle.on { color: #ffd700; border-color: #ffd70055; background: #ffd70011; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .flash-up { animation: flashUp 0.4s ease; }
        .flash-down { animation: flashDown 0.4s ease; }
        @keyframes flashUp { 0% { background: #00e67600; } 50% { background: #00e67622; } 100% { background: #00e67600; } }
        @keyframes flashDown { 0% { background: #ff174400; } 50% { background: #ff174422; } 100% { background: #ff174400; } }
        .ai-btn { background: linear-gradient(135deg, #ffd70033, #ffa50022); border: 1px solid #ffd70066; color: #ffd700; padding: 12px 28px; border-radius: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.95rem; transition: all 0.3s; letter-spacing: 0.5px; }
        .ai-btn:hover { background: linear-gradient(135deg, #ffd70055, #ffa50033); box-shadow: 0 0 30px #ffd70033; transform: translateY(-1px); }
        .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #ffffff08; }
        .metric-row:last-child { border-bottom: none; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(180deg, #080812 0%, #040408 100%)", borderBottom: "1px solid #ffd70022", padding: "0 24px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "1.8rem" }}>⚜️</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#ffd700", letterSpacing: "1px" }}>AURUM TRADER</div>
              <div style={{ fontSize: "0.65rem", color: "#666", letterSpacing: "3px", textTransform: "uppercase" }}>Gold Intelligence Platform</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {["15M","1H","4H","1J","1S"].map(tf => (
              <button key={tf} className={`tf-btn ${timeframe === tf ? "active" : ""}`} onClick={() => setTimeframe(tf)}>{tf}</button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#555", fontSize: "0.65rem", letterSpacing: "2px" }}>MISE À JOUR</div>
              <div style={{ color: "#888", fontSize: "0.8rem", fontFamily: "'DM Mono', monospace" }}>{lastUpdate.toLocaleTimeString("fr-FR")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e676" }}></div>
              <span style={{ color: "#00e676", fontSize: "0.75rem" }}>LIVE</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 24px" }}>
        {/* TOP ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
          {/* PRICE CARD */}
          <GlowCard className={priceFlash === "up" ? "flash-up" : priceFlash === "down" ? "flash-down" : ""} style={{ gridColumn: "span 1" }}>
            <PriceDisplay price={currentPrice} change={priceChange} changePercent={priceChangePct} />
            <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.75rem" }}>
              {[["Ouv.", `$${(currentPrice - priceChange * 8).toFixed(2)}`], ["Haut", `$${Math.max(...prices.slice(-50)).toFixed(2)}`],
                ["Bas", `$${Math.min(...prices.slice(-50)).toFixed(2)}`], ["Vol.", "487K oz"]].map(([l, v]) => (
                <div key={l} style={{ background: "#ffffff06", borderRadius: "6px", padding: "6px 10px" }}>
                  <div style={{ color: "#555" }}>{l}</div>
                  <div style={{ color: "#ccc", fontFamily: "'DM Mono', monospace" }}>{v}</div>
                </div>
              ))}
            </div>
          </GlowCard>

          {/* SIGNAL CARD */}
          {signal && (
            <GlowCard glow={signal.color}>
              <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>SIGNAL ALGO</div>
              <SignalBadge signal={signal} />
              <div style={{ marginTop: "14px" }}>
                {signal.reasons.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ fontSize: "0.72rem", color: "#888", padding: "3px 0", borderBottom: "1px solid #ffffff08", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: signal.color }}>›</span> {r}
                  </div>
                ))}
              </div>
            </GlowCard>
          )}

          {/* RSI GAUGE */}
          <GlowCard>
            <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>INDICATEURS CLÉS</div>
            {chartData.length > 0 && (() => {
              const last = chartData[chartData.length - 1];
              const rsiVal = last?.rsi;
              const rsiColor = rsiVal > 70 ? "#ff5252" : rsiVal < 30 ? "#00e676" : "#ffd700";
              const macdVal = last?.histogram;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                      <span style={{ color: "#888" }}>RSI (14)</span>
                      <span style={{ color: rsiColor, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{rsiVal?.toFixed(1)}</span>
                    </div>
                    <div style={{ background: "#ffffff0a", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(rsiVal || 0, 100)}%`, height: "100%", background: `linear-gradient(90deg, #00e676, ${rsiColor})`, transition: "width 0.5s" }}></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "#444", marginTop: "2px" }}><span>0</span><span>30</span><span>70</span><span>100</span></div>
                  </div>
                  {[
                    { label: "MACD Histo", value: macdVal?.toFixed(3), color: macdVal > 0 ? "#00e676" : "#ff5252" },
                    { label: "BB Width", value: last?.bbUpper && last?.bbLower ? `${(last.bbUpper - last.bbLower).toFixed(1)}`, color: "#60a5fa" },
                    { label: "SMA 20", value: `$${last?.sma20?.toFixed(1)}`, color: "#ffd700" },
                    { label: "SMA 50", value: `$${last?.sma50?.toFixed(1)}`, color: "#fb923c" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "4px 0", borderBottom: "1px solid #ffffff06" }}>
                      <span style={{ color: "#666" }}>{label}</span>
                      <span style={{ color, fontFamily: "'DM Mono', monospace" }}>{value || "—"}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </GlowCard>

          {/* QUICK BACKTEST */}
          <GlowCard glow="#60a5fa">
            <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>PERFORMANCE ALGO</div>
            {backtest && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "2rem", fontFamily: "'Playfair Display', serif", color: backtest.return > 0 ? "#00e676" : "#ff5252" }}>
                    {backtest.return > 0 ? "+" : ""}{backtest.return}%
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#555" }}>Rendement total</div>
                </div>
                {[
                  { label: "Capital final", value: `$${backtest.finalCapital.toFixed(0)}`, color: "#e8e0d0" },
                  { label: "Nb trades", value: backtest.trades, color: "#60a5fa" },
                  { label: "Win rate", value: `${backtest.winRate}%`, color: backtest.winRate > 55 ? "#00e676" : "#ffd700" },
                  { label: "Période", value: "200 bougies", color: "#888" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-row" style={{ fontSize: "0.75rem" }}>
                    <span style={{ color: "#666" }}>{label}</span>
                    <span style={{ color, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </GlowCard>
        </div>

        {/* TAB NAV */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto", paddingBottom: "4px" }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* CHART TAB */}
        {activeTab === "chart" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <GlowCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "0.8rem", color: "#888", letterSpacing: "1px" }}>XAU/USD — {timeframe}</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[["SMA20", "sma20", "#ffd700"], ["SMA50", "sma50", "#fb923c"], ["BB", "bb", "#60a5fa"]].map(([l, k, c]) => (
                    <button key={k} className={`ind-toggle ${indicators[k] ? "on" : ""}`} style={{ "--c": c, borderColor: indicators[k] ? c + "55" : undefined, color: indicators[k] ? c : undefined, background: indicators[k] ? c + "11" : undefined }} onClick={() => setIndicators(p => ({ ...p, [k]: !p[k] }))}>
                      <div style={{ width: 8, height: 2, background: indicators[k] ? c : "#444", borderRadius: 2 }}></div>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData.slice(-100)}>
                  <defs>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffd700" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ffd700" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                  <XAxis dataKey="time" tick={{ fill: "#444", fontSize: 10 }} tickLine={false} axisLine={false} interval={15} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} domain={["auto", "auto"]} width={65} />
                  <Tooltip content={<CustomTooltip />} />
                  {indicators.bb && <Area type="monotone" dataKey="bbUpper" fill="transparent" stroke="#60a5fa33" strokeWidth={1} strokeDasharray="4 2" name="BB Sup" dot={false} />}
                  {indicators.bb && <Area type="monotone" dataKey="bbLower" fill="#60a5fa08" stroke="#60a5fa33" strokeWidth={1} strokeDasharray="4 2" name="BB Inf" dot={false} />}
                  {indicators.bb && <Line type="monotone" dataKey="bbMiddle" stroke="#60a5fa55" strokeWidth={1} dot={false} name="BB Mid" />}
                  {indicators.sma20 && <Line type="monotone" dataKey="sma20" stroke="#ffd700aa" strokeWidth={1.5} dot={false} name="SMA 20" />}
                  {indicators.sma50 && <Line type="monotone" dataKey="sma50" stroke="#fb923caa" strokeWidth={1.5} dot={false} name="SMA 50" />}
                  <Area type="monotone" dataKey="price" stroke="#ffd700" strokeWidth={2} fill="url(#goldGrad)" name="XAU/USD" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </GlowCard>

            {/* MACD */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>MACD (12, 26, 9)</div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData.slice(-80)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="time" hide />
                    <YAxis tick={{ fill: "#444", fontSize: 9 }} width={40} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="#ffffff22" />
                    <Bar dataKey="histogram" name="Histogramme" fill="#ffd700" radius={[2, 2, 0, 0]}
                      label={false}
                      shape={(props) => {
                        const { x, y, width, height, value } = props;
                        return <rect x={x} y={value >= 0 ? y : y + height} width={Math.max(width, 1)} height={Math.abs(height)} fill={value >= 0 ? "#00e676" : "#ff5252"} rx={1} opacity={0.8} />;
                      }} />
                    <Line type="monotone" dataKey="macd" stroke="#ffd700" strokeWidth={1.5} dot={false} name="MACD" />
                    <Line type="monotone" dataKey="signal_line" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Signal" />
                  </BarChart>
                </ResponsiveContainer>
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>RSI (14)</div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData.slice(-80)}>
                    <defs>
                      <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffd700" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#ffd700" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} tick={{ fill: "#444", fontSize: 9 }} width={30} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={70} stroke="#ff525244" strokeDasharray="4 2" />
                    <ReferenceLine y={30} stroke="#00e67644" strokeDasharray="4 2" />
                    <Area type="monotone" dataKey="rsi" stroke="#ffd700" strokeWidth={2} fill="url(#rsiGrad)" name="RSI" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlowCard>
            </div>
          </div>
        )}

        {/* SIGNALS TAB */}
        {activeTab === "signals" && signal && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard glow={signal.color}>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>SIGNAL PRINCIPAL</div>
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: "4rem", marginBottom: "8px" }}>{signal.icon}</div>
                  <div style={{ fontSize: "1.8rem", color: signal.color, fontWeight: 800, letterSpacing: "3px" }}>{signal.signal}</div>
                  <div style={{ marginTop: "16px", background: "#ffffff06", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "0.7rem", color: "#555", marginBottom: "4px" }}>CONFIANCE ALGORITHME</div>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} style={{ width: 20, height: 20, borderRadius: "4px", background: i <= Math.abs(signal.score) ? signal.color : "#1a1a2e", transition: "background 0.3s" }}></div>
                      ))}
                    </div>
                    <div style={{ color: signal.color, fontSize: "0.9rem", marginTop: "8px", fontFamily: "'DM Mono', monospace" }}>{Math.abs(signal.score).toFixed(1)} / 6</div>
                  </div>
                </div>
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>NIVEAUX SUGGÉRÉS</div>
                {[
                  { label: "📍 ENTRÉE", value: `$${currentPrice.toFixed(1)}`, color: "#ffd700" },
                  { label: "🛡️ STOP LOSS", value: `$${(currentPrice * (signal.score > 0 ? 0.993 : 1.007)).toFixed(1)}`, color: "#ff5252" },
                  { label: "🎯 TP 1", value: `$${(currentPrice * (signal.score > 0 ? 1.008 : 0.992)).toFixed(1)}`, color: "#00e676" },
                  { label: "🎯 TP 2", value: `$${(currentPrice * (signal.score > 0 ? 1.015 : 0.985)).toFixed(1)}`, color: "#69f0ae" },
                  { label: "📊 R/R Ratio", value: signal.score > 0 ? "1:2.5" : "1:2", color: "#60a5fa" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-row">
                    <span style={{ color: "#777", fontSize: "0.78rem" }}>{label}</span>
                    <span style={{ color, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </GlowCard>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>DÉTAIL DES SIGNAUX ALGORITHME</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  {[
                    { name: "RSI", value: chartData[chartData.length - 1]?.rsi?.toFixed(1), status: chartData[chartData.length - 1]?.rsi < 30 ? "ACHAT" : chartData[chartData.length - 1]?.rsi > 70 ? "VENTE" : "NEUTRE", color: chartData[chartData.length - 1]?.rsi < 30 ? "#00e676" : chartData[chartData.length - 1]?.rsi > 70 ? "#ff5252" : "#ffd700" },
                    { name: "MACD", value: chartData[chartData.length - 1]?.histogram?.toFixed(2), status: chartData[chartData.length - 1]?.histogram > 0 ? "HAUSSIER" : "BAISSIER", color: chartData[chartData.length - 1]?.histogram > 0 ? "#00e676" : "#ff5252" },
                    { name: "Boll. Bands", value: "Actif", status: currentPrice < (chartData[chartData.length - 1]?.bbLower || 0) ? "SURVENDU" : currentPrice > (chartData[chartData.length - 1]?.bbUpper || 999999) ? "SURACHETÉ" : "NORMAL", color: "#60a5fa" },
                    { name: "SMA 20/50", value: "", status: chartData[chartData.length - 1]?.sma20 > chartData[chartData.length - 1]?.sma50 ? "BULL TREND" : "BEAR TREND", color: chartData[chartData.length - 1]?.sma20 > chartData[chartData.length - 1]?.sma50 ? "#00e676" : "#ff5252" },
                    { name: "Momentum", value: `${((currentPrice / prices[prices.length - 14] - 1) * 100).toFixed(2)}%`, status: currentPrice > prices[prices.length - 14] ? "POSITIF" : "NÉGATIF", color: currentPrice > prices[prices.length - 14] ? "#00e676" : "#ff5252" },
                    { name: "Volatilité", value: `${(Math.abs(Math.max(...prices.slice(-20)) - Math.min(...prices.slice(-20))).toFixed(1))}`, status: "MODÉRÉE", color: "#fb923c" },
                  ].map(({ name, value, status, color }) => (
                    <div key={name} style={{ background: "#ffffff05", borderRadius: "10px", padding: "14px", border: `1px solid ${color}22` }}>
                      <div style={{ fontSize: "0.7rem", color: "#555", marginBottom: "6px" }}>{name}</div>
                      {value && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9rem", color: "#ccc", marginBottom: "4px" }}>{value}</div>}
                      <div style={{ color, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "1px" }}>{status}</div>
                    </div>
                  ))}
                </div>
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>RAISONS DU SIGNAL</div>
                {signal.reasons.length ? signal.reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid #ffffff06" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "8px", background: `${signal.color}22`, display: "flex", alignItems: "center", justifyContent: "center", color: signal.color, fontSize: "0.8rem", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <span style={{ color: "#aaa", fontSize: "0.85rem" }}>{r}</span>
                  </div>
                )) : <div style={{ color: "#555", fontSize: "0.85rem" }}>Aucune condition forte détectée — marché en consolidation.</div>}
              </GlowCard>
            </div>
          </div>
        )}

        {/* BACKTEST TAB */}
        {activeTab === "backtest" && backtest && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>COURBE D'ÉQUITÉ — STRATÉGIE RSI + BOLLINGER</div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={backtest.equity}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00e676" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                    <XAxis dataKey="i" tick={{ fill: "#444", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#444", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={10000} stroke="#ffffff22" strokeDasharray="4 2" />
                    <Area type="monotone" dataKey="value" stroke="#00e676" strokeWidth={2} fill="url(#eqGrad)" name="Capital" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>DERNIERS TRADES</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ color: "#555" }}>
                        {["#", "Entrée", "Sortie", "P&L", "Résultat"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid #ffffff08" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {backtest.recentTrades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #ffffff05" }}>
                          <td style={{ padding: "8px 12px", color: "#555" }}>{i + 1}</td>
                          <td style={{ padding: "8px 12px", color: "#ccc", fontFamily: "'DM Mono', monospace" }}>${t.entry.toFixed(1)}</td>
                          <td style={{ padding: "8px 12px", color: "#ccc", fontFamily: "'DM Mono', monospace" }}>${t.exit.toFixed(1)}</td>
                          <td style={{ padding: "8px 12px", color: t.pnl > 0 ? "#00e676" : "#ff5252", fontFamily: "'DM Mono', monospace" }}>{t.pnl > 0 ? "+" : ""}{t.pnl.toFixed(2)}%</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ background: t.win ? "#00e67622" : "#ff525222", color: t.win ? "#00e676" : "#ff5252", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem" }}>
                              {t.win ? "WIN" : "LOSS"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlowCard>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard glow="#60a5fa">
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>MÉTRIQUES DE PERFORMANCE</div>
                {[
                  { label: "Capital initial", value: "$10,000", color: "#888" },
                  { label: "Capital final", value: `$${backtest.finalCapital.toFixed(2)}`, color: "#e8e0d0" },
                  { label: "Rendement total", value: `${backtest.return > 0 ? "+" : ""}${backtest.return}%`, color: backtest.return > 0 ? "#00e676" : "#ff5252" },
                  { label: "Nombre de trades", value: backtest.trades, color: "#60a5fa" },
                  { label: "Taux de réussite", value: `${backtest.winRate}%`, color: backtest.winRate > 55 ? "#00e676" : "#ffd700" },
                  { label: "Stratégie", value: "RSI + BB", color: "#fb923c" },
                  { label: "Période testée", value: "200 bougies", color: "#888" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-row">
                    <span style={{ color: "#666", fontSize: "0.78rem" }}>{label}</span>
                    <span style={{ color, fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: "0.82rem" }}>{value}</span>
                  </div>
                ))}
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>STRATÉGIES DISPONIBLES</div>
                {[
                  { name: "RSI + BB", return: "+18.4%", status: "ACTIVE" },
                  { name: "MACD Crossover", return: "+12.1%", status: "TEST" },
                  { name: "Golden Cross", return: "+24.7%", status: "STABLE" },
                  { name: "Trend Following", return: "+9.8%", status: "BETA" },
                ].map(({ name, ret, status }) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #ffffff06" }}>
                    <div>
                      <div style={{ color: "#ccc", fontSize: "0.82rem" }}>{name}</div>
                      <div style={{ color: "#555", fontSize: "0.7rem" }}>Rendement: <span style={{ color: "#00e676" }}>{ret || "+15%"}</span></div>
                    </div>
                    <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: "4px", background: status === "ACTIVE" ? "#00e67622" : "#ffd70022", color: status === "ACTIVE" ? "#00e676" : "#ffd700", border: `1px solid ${status === "ACTIVE" ? "#00e67644" : "#ffd70044"}` }}>
                      {status}
                    </span>
                  </div>
                ))}
              </GlowCard>
            </div>
          </div>
        )}

        {/* MARKETS TAB */}
        {activeTab === "markets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              {correlated.map(m => (
                <GlowCard key={m.name} glow={m.change > 0 ? "#00e676" : "#ff5252"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "1.4rem", marginBottom: "4px" }}>{m.icon}</div>
                      <div style={{ fontSize: "1rem", color: "#ccc", fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1rem", color: "#e8e0d0", marginTop: "4px" }}>{m.price.toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: m.change > 0 ? "#00e676" : "#ff5252", fontSize: "0.9rem", fontWeight: 600 }}>{m.change > 0 ? "+" : ""}{m.change}%</div>
                    </div>
                  </div>
                  <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.72rem" }}>
                    <div style={{ background: "#ffffff06", borderRadius: "6px", padding: "6px 10px" }}>
                      <div style={{ color: "#555" }}>Corrélation</div>
                      <div style={{ color: Math.abs(m.correlation) > 0.6 ? "#ffd700" : "#888", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{m.correlation > 0 ? "+" : ""}{m.correlation}</div>
                    </div>
                    <div style={{ background: "#ffffff06", borderRadius: "6px", padding: "6px 10px" }}>
                      <div style={{ color: "#555" }}>Impact Or</div>
                      <div style={{ color: m.impact === "FORT" ? "#ffd700" : "#888" }}>{m.direction} • {m.impact}</div>
                    </div>
                  </div>
                </GlowCard>
              ))}
            </div>

            <GlowCard>
              <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>MATRICE DE CORRÉLATION — INFLUENCE SUR L'OR</div>
              <div style={{ overflowX: "auto" }}>
                {correlated.map(m => (
                  <div key={m.name} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.75rem" }}>
                      <span style={{ color: "#888" }}>{m.icon} {m.name}</span>
                      <span style={{ color: Math.abs(m.correlation) > 0.6 ? "#ffd700" : "#888", fontFamily: "'DM Mono', monospace" }}>{m.correlation}</span>
                    </div>
                    <div style={{ background: "#ffffff08", borderRadius: "4px", height: "8px", overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", background: "#ffffff22" }}></div>
                      <div style={{
                        position: "absolute",
                        left: m.correlation > 0 ? "50%" : `${50 + m.correlation * 50}%`,
                        width: `${Math.abs(m.correlation) * 50}%`,
                        height: "100%",
                        background: m.correlation > 0 ? "linear-gradient(90deg, #00e67633, #00e676)" : "linear-gradient(270deg, #ff525233, #ff5252)",
                        transition: "all 0.5s"
                      }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === "calendar" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
            <GlowCard>
              <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>AGENDA ÉCONOMIQUE — IMPACT OR</div>
              {economicEvents.map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto auto auto", gap: "16px", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #ffffff06" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.8rem", color: "#ffd700" }}>{e.time}</div>
                  <div>
                    <div style={{ color: "#ddd", fontSize: "0.85rem", fontWeight: 500 }}>{e.event}</div>
                    <div style={{ fontSize: "0.7rem", color: "#555", marginTop: "2px" }}>Prévu: {e.expected} • Précédent: {e.prev}</div>
                  </div>
                  <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: "4px", background: e.impact === "HIGH" ? "#ff525222" : "#ffd70022", color: e.impact === "HIGH" ? "#ff5252" : "#ffd700", border: `1px solid ${e.impact === "HIGH" ? "#ff525244" : "#ffd70044"}`, whiteSpace: "nowrap" }}>
                    {e.impact}
                  </span>
                  <div style={{ color: e.goldImpact.includes("Haussier") ? "#00e676" : e.goldImpact.includes("Baissier") ? "#ff5252" : "#888", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {e.goldImpact}
                  </div>
                </div>
              ))}
            </GlowCard>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>CONTEXTE MACRO</div>
                {[
                  { label: "🏦 Taux Fed", value: "5.25-5.50%", trend: "→", color: "#ff5252" },
                  { label: "📊 CPI USA", value: "3.2%", trend: "↓", color: "#00e676" },
                  { label: "💹 DXY Index", value: "104.2", trend: "↑", color: "#ff5252" },
                  { label: "🛢️ WTI Oil", value: "$78.5", trend: "↑", color: "#ffd700" },
                  { label: "🏦 US 10Y", value: "4.32%", trend: "→", color: "#888" },
                  { label: "🥇 Réserves BC", value: "+350T", trend: "↑", color: "#00e676" },
                ].map(({ label, value, trend, color }) => (
                  <div key={label} className="metric-row">
                    <span style={{ color: "#777", fontSize: "0.78rem" }}>{label}</span>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span style={{ color, fontFamily: "'DM Mono', monospace", fontSize: "0.8rem" }}>{value}</span>
                      <span style={{ color }}>{trend}</span>
                    </div>
                  </div>
                ))}
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>SENTIMENT MARCHÉ</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: "8px" }}>Fear & Greed Index</div>
                  <div style={{ fontSize: "2.5rem", color: "#ffd700", fontFamily: "'Playfair Display', serif" }}>62</div>
                  <div style={{ fontSize: "0.8rem", color: "#ffd700", marginBottom: "12px" }}>GREED</div>
                  <div style={{ background: "linear-gradient(90deg, #ff5252, #ffd700, #00e676)", borderRadius: "4px", height: "8px", position: "relative" }}>
                    <div style={{ position: "absolute", left: "62%", top: "-4px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", border: "2px solid #ffd700", transform: "translateX(-50%)" }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "#444", marginTop: "6px" }}>
                    <span>Peur Extrême</span><span>Neutre</span><span>Greed Extrême</span>
                  </div>
                </div>
              </GlowCard>
            </div>
          </div>
        )}

        {/* AI TAB */}
        {activeTab === "ai" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <GlowCard>
              <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "16px" }}>🤖 ANALYSE IA — CLAUDE INTELLIGENCE</div>
              <div style={{ background: "#ffffff05", borderRadius: "12px", padding: "16px", marginBottom: "16px", fontSize: "0.78rem", color: "#888", lineHeight: 1.6 }}>
                <div style={{ color: "#ffd70099", marginBottom: "8px", fontSize: "0.7rem" }}>DONNÉES INJECTÉES DANS L'ANALYSE:</div>
                {signal && (
                  <>
                    <div>• Prix actuel: <span style={{ color: "#ffd700", fontFamily: "'DM Mono', monospace" }}>${currentPrice.toFixed(2)}</span></div>
                    <div>• Signal algo: <span style={{ color: signal.color }}>{signal.signal}</span> (score {signal.score.toFixed(1)})</div>
                    <div>• RSI: <span style={{ color: "#ccc" }}>{chartData[chartData.length - 1]?.rsi?.toFixed(1)}</span></div>
                    <div>• Marchés corrélés: DXY, SPX, Oil, BTC</div>
                    <div>• Contexte macro: Fed rates, CPI, DXY Index</div>
                  </>
                )}
              </div>
              <button className="ai-btn" onClick={handleAIAnalysis} disabled={aiLoading} style={{ width: "100%" }}>
                {aiLoading ? "⏳ Analyse en cours..." : "🤖 Lancer l'analyse IA"}
              </button>
              {aiAnalysis && (
                <div style={{ marginTop: "16px", background: "#ffd70008", border: "1px solid #ffd70033", borderRadius: "12px", padding: "16px" }}>
                  <div style={{ fontSize: "0.65rem", color: "#ffd70099", letterSpacing: "2px", marginBottom: "8px" }}>ANALYSE CLAUDE AI</div>
                  <div style={{ color: "#ddd", fontSize: "0.85rem", lineHeight: 1.7 }}>{aiAnalysis}</div>
                </div>
              )}
            </GlowCard>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <GlowCard glow="#60a5fa">
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>SCÉNARIOS DE TRADING</div>
                {signal && [
                  {
                    scenario: "BULL CASE",
                    color: "#00e676",
                    emoji: "🐂",
                    desc: `Rupture au-dessus de $${(currentPrice * 1.012).toFixed(0)} avec volume → cible $${(currentPrice * 1.025).toFixed(0)}`,
                    prob: "45%"
                  },
                  {
                    scenario: "BASE CASE",
                    color: "#ffd700",
                    emoji: "↔️",
                    desc: `Consolidation entre $${(currentPrice * 0.997).toFixed(0)} - $${(currentPrice * 1.008).toFixed(0)}. Attendre signal clair.`,
                    prob: "38%"
                  },
                  {
                    scenario: "BEAR CASE",
                    color: "#ff5252",
                    emoji: "🐻",
                    desc: `Cassure sous $${(currentPrice * 0.995).toFixed(0)} → risque de correction vers $${(currentPrice * 0.982).toFixed(0)}`,
                    prob: "17%"
                  }
                ].map(({ scenario, color, emoji, desc, prob }) => (
                  <div key={scenario} style={{ border: `1px solid ${color}22`, borderRadius: "10px", padding: "12px", marginBottom: "10px", background: `${color}06` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ color, fontSize: "0.78rem", fontWeight: 700 }}>{emoji} {scenario}</div>
                      <div style={{ color, fontFamily: "'DM Mono', monospace", fontSize: "0.82rem" }}>{prob}</div>
                    </div>
                    <div style={{ color: "#888", fontSize: "0.75rem", lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </GlowCard>

              <GlowCard>
                <div style={{ fontSize: "0.7rem", color: "#666", letterSpacing: "2px", marginBottom: "12px" }}>GESTION DES RISQUES</div>
                {[
                  { label: "Taille de position max", value: "2% du capital", color: "#ffd700" },
                  { label: "Stop loss recommandé", value: "0.7%", color: "#ff5252" },
                  { label: "Take profit 1", value: "0.8% (1:1.1)", color: "#00e676" },
                  { label: "Take profit 2", value: "1.5% (1:2.1)", color: "#69f0ae" },
                  { label: "Max drawdown", value: "< 5% par session", color: "#fb923c" },
                  { label: "Levier suggéré", value: "1:5 max", color: "#60a5fa" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-row">
                    <span style={{ color: "#666", fontSize: "0.75rem" }}>{label}</span>
                    <span style={{ color, fontFamily: "'DM Mono', monospace", fontSize: "0.78rem" }}>{value}</span>
                  </div>
                ))}
              </GlowCard>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: "1px solid #ffd70011", marginTop: "24px", padding: "16px 24px", textAlign: "center", color: "#333", fontSize: "0.65rem", letterSpacing: "1px" }}>
        AURUM TRADER © 2026 — EDUCATIONAL PURPOSE ONLY — NOT FINANCIAL ADVICE — XAU/USD LIVE SIMULATION
      </div>
    </div>
  );
}
