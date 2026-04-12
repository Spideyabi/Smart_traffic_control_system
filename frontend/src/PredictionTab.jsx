import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
const DIR_ICONS = { NORTH: '⬆', EAST: '➡', SOUTH: '⬇', WEST: '⬅' };
const DIR_COLORS = { NORTH: '#6366f1', EAST: '#f59e0b', SOUTH: '#10b981', WEST: '#ef4444' };
const HISTORY_SIZE = 60;
const FORECAST_STEPS = 5;
const API = 'http://localhost:8000/api';

/* ── Simple linear regression ── */
function linearRegression(y) {
    const n = y.length;
    if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i; sumY += y[i];
        sumXY += i * y[i]; sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

function predict(history, steps) {
    if (history.length < 2) return Array(steps).fill(0);
    const { slope, intercept } = linearRegression(history);
    const n = history.length;
    return Array.from({ length: steps }, (_, i) =>
        Math.max(0, Math.round(slope * (n + i) + intercept))
    );
}

function getTrend(history) {
    const recent = history.slice(-10);
    if (recent.length < 2) return '—';
    const { slope } = linearRegression(recent);
    if (slope > 0.3) return '↑';
    if (slope < -0.3) return '↓';
    return '→';
}

/* ── Smooth Bezier path ── */
function getSmoothPath(points) {
    if (points.length < 2) return "";
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cp1x = p0.x + (p1.x - p0.x) / 2;
        const cp1y = p0.y;
        const cp2x = p0.x + (p1.x - p0.x) / 2;
        const cp2y = p1.y;
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
    }
    return d;
}

/* ── Flow Graph ── */
function FlowGraph({ history, preds, color, width = 450, height = 110, showTooltip = false }) {
    const histData = history.slice(-30);
    const combined = [...histData, ...preds];
    if (combined.length < 2) {
        return (
            <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11 }}>
                Waiting for data…
            </div>
        );
    }

    const max = Math.max(...combined, 1);
    const histLen = histData.length;
    const totalLen = combined.length;

    const points = combined.map((v, i) => {
        const x = (i / (totalLen - 1)) * width;
        const y = height - (v / max) * (height * 0.75) - 20;
        return { x, y, v };
    });

    const histPts = points.slice(0, histLen);
    const predPts = points.slice(histLen - 1);

    const histPath = getSmoothPath(histPts);
    const predPath = getSmoothPath(predPts);

    const nowX = points[histLen - 1]?.x || 0;
    const nowY = points[histLen - 1]?.y || 0;

    const gradId = `flow-${color.replace('#', '')}`;
    const glowId = `glow-${color.replace('#', '')}`;

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                    <feFlood floodColor={color} floodOpacity="0.5" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <line key={i} x1={0} y1={height * (1 - t)} x2={width} y2={height * (1 - t)}
                    stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
            ))}

            <path d={`${histPath} L ${nowX},${height} L 0,${height} Z`} fill={`url(#${gradId})`} />
            <line x1={nowX} y1={0} x2={nowX} y2={height} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="5,4" />
            <text x={nowX - 6} y={height - 4} textAnchor="end" fontSize={8} fontWeight={700} fill="#94a3b8">HIST</text>
            <text x={nowX + 6} y={height - 4} textAnchor="start" fontSize={8} fontWeight={700} fill={color}>FCST</text>

            <path d={histPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glowId})`} />
            <path d={predPath} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="7,5" strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
            <circle cx={nowX} cy={nowY} r={4} fill={color} stroke="#fff" strokeWidth={2} />

            {showTooltip && (
                <g transform={`translate(${nowX}, ${nowY - 14})`}>
                    <rect x="-14" y="-11" width="28" height="14" rx="3" fill={color} />
                    <text textAnchor="middle" y="0" fontSize={9} fontWeight={900} fill="#fff">{histPts[histPts.length - 1]?.v}</text>
                </g>
            )}
        </svg>
    );
}

/* ── Confidence Ring ── */
function ConfidenceRing({ value, color = '#3b82f6', size = 64 }) {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = circ * (value / 100);
    return (
        <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
            <text x={size / 2} y={size / 2 + 4} textAnchor="middle"
                fontSize={size > 50 ? 13 : 10} fontWeight={900} fill={color} fontFamily="inherit">
                {value}%
            </text>
        </svg>
    );
}

/* ── AI Decision Panel ── */
function AiDecisionPanel({ aiDecision, isEmergency, activeDir, signalTime, wsSignals, signalNext, signalNextReason }) {
    if (!aiDecision) {
        return (
            <div style={{
                background: '#f8fafc', borderRadius: 10,
                border: '1px dashed #cbd5e1', padding: '14px 12px',
                display: 'flex', alignItems: 'center', gap: 8,
                color: '#5ba8f5ff', fontSize: 11,
            }}>

                Waiting for first AI decision…
            </div>
        );
    }

    const confColor = aiDecision.confidence >= 70 ? '#22c55e' : aiDecision.confidence >= 50 ? '#f59e0b' : '#ef4444';
    const scores = aiDecision.scores || {};
    const maxScore = Math.max(...Object.values(scores), 0.001);

    let category = { label: 'AI DENSITY', color: '#3b82f6' };
    const reasonText = aiDecision.reason || '';
    if (reasonText.includes('EMERGENCY') || reasonText.includes('PREEMPT')) {
        category = { label: 'EMERGENCY', color: '#ef4444', icon: '🚑' };
    } else if (reasonText.includes('Starvation')) {
        category = { label: 'STARVATION', color: '#f59e0b' };
    } else if (reasonText.includes('REVERT')) {
        category = { label: 'REVERT', color: '#8b5cf6' };
    } else if (reasonText.includes('MANUAL')) {
        category = { label: 'MANUAL', color: '#a855f7' };
    } else if (reasonText.includes('TIME')) {
        category = { label: 'TIME-BASED', color: '#10b981' };
    }

    return (
        <div style={{
            background: isEmergency ? '#fff5f5' : '#fff',
            borderRadius: 10,
            border: `1px solid ${isEmergency ? '#fca5a5' : '#e2e8f0'}`,
            padding: '12px',
            animation: isEmergency ? 'pulse 0.7s ease-in-out infinite alternate' : 'none',
        }}>
            {/* Emergency banner */}
            {isEmergency && (
                <div style={{
                    background: '#ef4444', color: '#fff', borderRadius: 6,
                    padding: '5px 10px', fontSize: 10, fontWeight: 800,
                    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    🚑 EMERGENCY PREEMPTION
                </div>
            )}

            {/* Header: active signal + timer (no confidence ring) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: activeDir ? '#16a34a' : '#ef4444', marginBottom: 2 }}>
                        {activeDir ? `${DIR_ICONS[activeDir]} ${activeDir} 🟢` : 'ALL RED 🔴'}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                        {Math.ceil(signalTime || 0)}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>s</span>
                    </div>
                </div>
                <div style={{
                    padding: '4px 10px', borderRadius: 8,
                    background: `${confColor}12`, border: `1px solid ${confColor}30`,
                    fontSize: 13, fontWeight: 900, color: confColor,
                }}>{aiDecision.confidence}%</div>
            </div>

            {/* Category + reason */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                padding: '5px 8px', borderRadius: 6,
                background: `${category.color}10`, border: `1px solid ${category.color}25`,
            }}>
                <span style={{ fontSize: 12 }}>{category.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 900, color: category.color, letterSpacing: '0.5px' }}>
                    {category.label}
                </span>
            </div>

            <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.5, marginBottom: 10 }}>
                {aiDecision.reason}
            </div>

            {/* Score bars */}
            {Object.keys(scores).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px', marginBottom: 2 }}>
                        PRIORITY SCORES
                    </div>
                    {Object.entries(scores).sort(([, a], [, b]) => b - a).map(([dir, score]) => {
                        const pct = Math.round((score / maxScore) * 100);
                        const col = DIR_COLORS[dir] || '#3b82f6';
                        const chosen = dir === aiDecision.direction;
                        return (
                            <div key={dir}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span style={{ fontSize: 9, fontWeight: chosen ? 800 : 600, color: chosen ? col : '#64748b' }}>
                                        {chosen ? '▶ ' : ''}{DIR_ICONS[dir]} {dir}
                                    </span>
                                    <span style={{ fontSize: 8, color: '#94a3b8' }}>{score.toFixed(2)}</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: '#f1f5f9' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 2, width: `${pct}%`,
                                        background: chosen ? col : `${col}40`,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Decision History Log (side panel, white) ── */
function DecisionHistory({ decisions }) {
    if (!decisions || decisions.length === 0) return null;
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
            }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', letterSpacing: '1px' }}>
                    📋 DECISION LOG
                </div>
                <div style={{ fontSize: 8, color: '#94a3b8' }}>{decisions.length} entries</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px' }}>
                {[...decisions].reverse().map((d, i) => {
                    const col = DIR_COLORS[d.direction] || '#3b82f6';
                    return (
                        <div key={`${d.ts}-${i}`} style={{
                            padding: '6px 8px', borderRadius: 6,
                            background: i === 0 ? `${col}08` : '#f8fafc',
                            border: `1px solid ${i === 0 ? col + '22' : '#f1f5f9'}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: col }}>
                                    {DIR_ICONS[d.direction]} {d.direction}
                                </span>
                                <span style={{ fontSize: 8, color: '#94a3b8', fontFamily: 'monospace' }}>{d.ts}</span>
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b', lineHeight: 1.4, marginBottom: 3 }}>
                                {d.reason}
                            </div>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <span style={{
                                    fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                                    background: d.confidence >= 70 ? '#dcfce7' : '#fef3c7',
                                    color: d.confidence >= 70 ? '#16a34a' : '#92400e',
                                }}>{d.confidence}%</span>
                                {d.duration && <span style={{ fontSize: 8, color: '#94a3b8' }}>{d.duration}s</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   MAIN PredictionTab Component
   ══════════════════════════════════════════════════════════ */
export default function PredictionTab({
    wsSignals, signalTime, signalNext, signalNextReason,
    aiDecision: aiDecisionProp, isEmergency: isEmergencyProp, bkWaitTimes: bkWaitTimesProp,
    simRunning, trafficStats, signalMode, manualOverride
}) {
    /* ── State ── */
    const [snapshot, setSnapshot] = useState(
        Object.fromEntries(DIRS.map(d => [d, []]))
    );
    const [waitTimes, setWaitTimes] = useState(Object.fromEntries(DIRS.map(d => [d, 0])));
    const [accuracies, setAccuracies] = useState(Object.fromEntries(DIRS.map(d => [d, 0])));
    const [aiDecision, setAiDecision] = useState(null);
    const [decisionHistory, setDecisionHistory] = useState([]);
    const [selectedDir, setSelectedDir] = useState(null);
    const [lastTick, setLastTick] = useState(null);
    const [sidebarW, setSidebarW] = useState(250);
    const [logW, setLogW] = useState(240);
    const dragRef = useRef(null);
    const pastMatchesRef = useRef(Object.fromEntries(DIRS.map(d => [d, []])));
    const prevPredRef = useRef(Object.fromEntries(DIRS.map(d => [d, []])));

    /* ── Sidebar (left) drag to resize ── */
    const startDrag = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = sidebarW;
        const onMove = (ev) => setSidebarW(Math.min(420, Math.max(180, startW + ev.clientX - startX)));
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [sidebarW]);

    /* ── Log panel (right) drag to resize ── */
    const startLogDrag = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = logW;
        // dragging left edge of log panel: moving left increases logW
        const onMove = (ev) => setLogW(Math.min(480, Math.max(160, startW - (ev.clientX - startX))));
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [logW]);

    // Use prop values when available (from App.jsx WebSocket), fall back to local state
    const effectiveAiDecision = aiDecisionProp ?? aiDecision;
    const isEmergency = isEmergencyProp ?? (aiDecision?.reason?.includes('EMERGENCY') ?? false);
    const bkWaitTimes = bkWaitTimesProp ?? null;

    /* ── Derived ── */
    const predictions = useMemo(() =>
        Object.fromEntries(DIRS.map(d => [d, predict(snapshot[d], FORECAST_STEPS)])),
        [snapshot]
    );
    const trends = useMemo(() =>
        Object.fromEntries(DIRS.map(d => [d, getTrend(snapshot[d])])),
        [snapshot]
    );
    const hasData = DIRS.some(d => snapshot[d].length > 2);
    const isLive = lastTick && (Date.now() - lastTick.getTime() < 8000);
    const activeDir = wsSignals
        ? DIRS.find(d => wsSignals[d] === 'GREEN') ?? null
        : effectiveAiDecision?.direction ?? null;


    /* ── Accuracy tracking ── */
    useEffect(() => {
        DIRS.forEach(dir => {
            const prev = prevPredRef.current[dir];
            const actual = snapshot[dir].slice(-1)[0];
            if (prev.length > 0 && actual !== undefined) {
                const pred = prev[0];
                const err = Math.abs(pred - actual);
                const base = Math.max(actual, 1);
                const acc = Math.max(0, Math.min(100, Math.round((1 - err / base) * 100)));
                pastMatchesRef.current[dir] = [...(pastMatchesRef.current[dir] || []), { actual, pred, acc }].slice(-20);
                const recent = pastMatchesRef.current[dir].slice(-10);
                const avg = Math.round(recent.reduce((s, m) => s + m.acc, 0) / recent.length);
                setAccuracies(prev => ({ ...prev, [dir]: avg }));
            }
            prevPredRef.current[dir] = predictions[dir];
        });
    }, [snapshot]);

    /* ── Append live sim lane counts to snapshot (immediate graph update) ── */
    useEffect(() => {
        if (!simRunning || !trafficStats?.laneCounts) return;
        // trafficStats.laneCounts: [0..7] where:
        // 0,1 = NORTH; 2,3 = SOUTH; 4,5 = WEST; 6,7 = EAST
        const lc = trafficStats.laneCounts;
        const counts = {
            NORTH: (lc[0] || 0) + (lc[1] || 0),
            SOUTH: (lc[2] || 0) + (lc[3] || 0),
            WEST: (lc[4] || 0) + (lc[5] || 0),
            EAST: (lc[6] || 0) + (lc[7] || 0),
        };
        setSnapshot(prev => {
            const next = { ...prev };
            DIRS.forEach(dir => {
                next[dir] = [...(prev[dir] || []), counts[dir]].slice(-HISTORY_SIZE);
            });
            return next;
        });
        setLastTick(new Date());
    }, [trafficStats?.laneCounts, simRunning]);

    /* ── Reset snapshot + wait times when sim stops ── */
    useEffect(() => {
        if (!simRunning) {
            setSnapshot(Object.fromEntries(DIRS.map(d => [d, []])));
            setWaitTimes(Object.fromEntries(DIRS.map(d => [d, 0])));
            setLastTick(null);
            setDecisionHistory([]);
        }
    }, [simRunning]);


    /* ── Local wait time ticker (fallback when bkWaitTimes not available) ── */
    useEffect(() => {
        if (!simRunning) return;
        const id = setInterval(() => {
            setWaitTimes(prev => {
                const next = { ...prev };
                DIRS.forEach(dir => {
                    if (!wsSignals || wsSignals[dir] !== 'GREEN') {
                        next[dir] = (prev[dir] || 0) + 1;
                    } else {
                        next[dir] = 0;
                    }
                });
                return next;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [wsSignals, simRunning]);


    /* ── Poll /api/prediction ── */
    const poll = useCallback(async () => {
        try {
            const r = await fetch(`${API}/prediction`);
            if (!r.ok) return;
            const data = await r.json();
            setLastTick(new Date());

            // data.history = { NORTH: [...], EAST: [...], ... }
            // data.predictions = { NORTH: [...], EAST: [...], ... }
            // data.trends = { NORTH: '↑', ... }
            if (data.history) {
                setSnapshot(prev => {
                    const next = { ...prev };
                    DIRS.forEach(dir => {
                        const hist = data.history[dir] || [];
                        if (hist.length > 0) {
                            // Use backend history directly (already rolling 60 samples)
                            next[dir] = hist.slice(-HISTORY_SIZE);
                        }
                    });
                    return next;
                });
            }
        } catch {/* offline */ }
    }, []);


    /* ── Poll AI log ── */
    const pollAiLog = useCallback(async () => {
        try {
            const r = await fetch(`${API}/ai_log`);
            if (!r.ok) return;
            const data = await r.json();
            if (Array.isArray(data.decisions)) {
                setDecisionHistory(data.decisions.slice(-50));
            }
        } catch {/* offline */ }
    }, []);

    /* ── Poll: only when sim is running ── */
    useEffect(() => {
        if (!simRunning) return;
        poll();
        const t = setInterval(poll, 3000);
        return () => clearInterval(t);
    }, [poll, simRunning]);

    useEffect(() => {
        if (!simRunning) return;
        pollAiLog();
        const t = setInterval(pollAiLog, 8000);
        return () => clearInterval(t);
    }, [pollAiLog, simRunning]);

    /* ── colour helper ── */
    const sigCol = (s) => s === 'GREEN' ? '#22c55e' : s === 'AMBER' ? '#f59e0b' : '#ef4444';

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: '#f1f5f9', fontFamily: 'inherit', overflow: 'hidden',
        }}>

            {/* ══ TOP STATUS BAR ══ */}
            <div style={{
                display: 'flex', alignItems: 'center',
                background: '#fff', padding: '0 16px', height: 44, flexShrink: 0,
                borderBottom: '1px solid #e2e8f0', gap: 0,
            }}>
                {/* Brand & Mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 20 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px' }}>
                        Prediction Engine
                    </span>
                    <div style={{
                        marginLeft: 4, padding: '2px 6px', borderRadius: 4,
                        background: manualOverride ? '#f3e8ff' : signalMode === 'TIME' ? '#dcfce7' : '#e0f2fe',
                        border: `1px solid ${manualOverride ? '#d8b4fe' : signalMode === 'TIME' ? '#86efac' : '#bae6fd'}`,
                        color: manualOverride ? '#9333ea' : signalMode === 'TIME' ? '#16a34a' : '#0284c7',
                        fontSize: 8, fontWeight: 800, letterSpacing: '0.5px'
                    }}>
                        {manualOverride ? '🎮 MANUAL OVERRIDE' : signalMode === 'TIME' ? ' TIME-BASED' : ' AI DENSITY'}
                    </div>
                </div>

                {/* Signal pills */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {DIRS.map(dir => {
                        const sig = wsSignals?.[dir] || 'RED';
                        const col = sigCol(sig);
                        const isActive = dir === activeDir;
                        return (
                            <div key={dir} style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 800,
                                background: isActive ? `${col}15` : '#f8fafc',
                                border: `1px solid ${isActive ? col + '55' : '#e2e8f0'}`,
                                color: isActive ? col : '#94a3b8',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <div style={{
                                    width: 5, height: 5, borderRadius: '50%', background: col,
                                    boxShadow: isActive ? `0 0 5px ${col}` : 'none',
                                }} />
                                {dir}
                            </div>
                        );
                    })}
                </div>

                <div style={{ flex: 1 }} />

                {/* Active green badge */}
                {activeDir && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 5,
                        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)',
                        marginRight: 12,
                    }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', animation: 'blink 1.4s ease-in-out infinite' }} />
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#16a34a' }}>
                            {DIR_ICONS[activeDir]} {activeDir}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#0f172a' }}>
                            {Math.ceil(signalTime || 0)}s
                        </span>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 800, color: isLive ? '#16a34a' : '#94a3b8' }}>
                    <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: isLive ? '#22c55e' : '#cbd5e1',
                        boxShadow: isLive ? '0 0 5px #22c55e' : 'none',
                        animation: isLive ? 'blink 1.4s ease-in-out infinite' : 'none',
                    }} />
                    {isLive ? 'LIVE' : hasData ? 'PAUSED' : 'WAITING'}
                </div>
            </div>

            {/* ══ BODY ══ */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT SIDEBAR (white) + drag handle ── */}
                <div style={{
                    width: sidebarW, flexShrink: 0,
                    background: '#fff',
                    display: 'flex', flexDirection: 'column',
                    borderRight: '1px solid #e2e8f0',
                    overflowY: 'auto',
                    position: 'relative',
                }}>
                    {/* AI Decision Engine */}
                    <div style={{ padding: '12px 12px 0' }}>
                        <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', marginBottom: 8 }}>
                            AI DECISION ENGINE
                        </div>
                        <AiDecisionPanel
                            aiDecision={effectiveAiDecision}
                            isEmergency={isEmergency}
                            activeDir={activeDir}
                            signalTime={signalTime}
                            wsSignals={wsSignals}
                            signalNext={signalNext}
                            signalNextReason={signalNextReason}
                        />
                    </div>

                    <div style={{ height: 1, background: '#f1f5f9', margin: '12px 0' }} />

                    {/* Lane Overview */}
                    <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', marginBottom: 4 }}>
                            LANE OVERVIEW
                        </div>
                        {DIRS.map(dir => {
                            const sig = wsSignals?.[dir] || 'RED';
                            const col = sigCol(sig);
                            const cnt = snapshot[dir]?.slice(-1)[0] ?? 0;
                            const wt = (bkWaitTimes?.[dir] || waitTimes[dir]) || 0;
                            const acc = accuracies[dir] ?? 0;
                            const tr = trends[dir] ?? '→';
                            const isGreen = dir === activeDir;
                            return (
                                <div key={dir}
                                    style={{
                                        background: isGreen ? '#f0fdf4' : '#f8fafc',
                                        border: `1px solid ${isGreen ? '#86efac' : '#e2e8f0'}`,
                                        borderRadius: 7, padding: '7px 9px', cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onClick={() => setSelectedDir(dir)}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={e => e.currentTarget.style.background = isGreen ? '#f0fdf4' : '#f8fafc'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, boxShadow: sig !== 'RED' ? `0 0 4px ${col}` : 'none' }} />
                                            <span style={{ fontSize: 9, fontWeight: 900, color: isGreen ? '#16a34a' : '#374151' }}>
                                                {DIR_ICONS[dir]} {dir}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{sig}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 8, color: '#64748b' }}>{cnt} · {tr}</span>
                                        <span style={{ fontSize: 8, color: '#64748b' }}>{Math.round(wt)}s · {acc}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ height: 1, background: '#f1f5f9', margin: '12px 0' }} />

                    {/* Next prediction */}
                    {signalNext && (
                        <div style={{ padding: '0 12px 12px' }}>
                            <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', marginBottom: 6 }}>
                                NEXT PREDICTION
                            </div>
                            <div style={{
                                background: `${DIR_COLORS[signalNext] || '#3b82f6'}10`,
                                border: `1px solid ${DIR_COLORS[signalNext] || '#3b82f6'}28`,
                                borderRadius: 7, padding: '9px 10px',
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 900, color: DIR_COLORS[signalNext] || '#60a5fa' }}>
                                    {DIR_ICONS[signalNext]} {signalNext}
                                </div>
                                {signalNextReason && (
                                    <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                                        {signalNextReason}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div style={{ flex: 1 }} />

                    {/* Footer note */}
                    <div style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.6 }}>
                            <strong style={{ color: '#64748b' }}>AI weights:</strong>{' '}
                            60% density · 40% forecast · wait penalty.
                            Ambulance = instant GREEN.
                        </div>
                    </div>
                </div>

                {/* ── DRAG HANDLE ── */}
                <div
                    onMouseDown={startDrag}
                    style={{
                        width: 5, cursor: 'col-resize', flexShrink: 0,
                        background: 'transparent',
                        borderLeft: '1px solid #e2e8f0',
                        transition: 'background 0.15s',
                        position: 'relative', zIndex: 1,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                />

                {/* ── MAIN CONTENT: cards + drag handle + decision log ── */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', height: '100%' }}>

                    {/* Left: cards area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

                        {/* Sim not started notice */}
                        {!simRunning && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                                background: '#fff7ed', border: '1px solid #fed7aa',
                                borderRadius: 8, fontSize: 10, color: '#92400e', flexShrink: 0,
                            }}>
                                <span>⏸</span> Start the <strong>3D Simulator</strong> to activate predictions &amp; signal control.
                            </div>
                        )}

                        {/* No data */}
                        {!hasData && simRunning && (
                            <div style={{
                                flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 10,
                                minHeight: 200, background: '#fff', borderRadius: 12,
                                border: '2px dashed #e2e8f0', color: '#94a3b8',
                            }}>
                                <div style={{ fontSize: 36 }}>📡</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b' }}>Waiting for traffic data…</div>
                            </div>
                        )}

                        {/* 2×2 cards — fill remaining height */}
                        {hasData && (
                            <div style={{
                                flex: 1,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gridAutoRows: '1fr',
                                gap: 10,
                                minHeight: 0,
                            }}>
                                {DIRS.map(dir => {
                                    const sig = wsSignals?.[dir] || 'RED';
                                    const col = DIR_COLORS[dir];
                                    const isActive = dir === activeDir;
                                    const cnt = snapshot[dir]?.slice(-1)[0] ?? 0;
                                    const forecast = Math.max(...(predictions[dir] || [0]), 0);
                                    // Priority: backend WebSocket wait_times > local sim timer
                                    const wt = Math.round(
                                        (bkWaitTimes?.[dir] != null ? bkWaitTimes[dir] : waitTimes[dir]) || 0
                                    );
                                    const tr = trends[dir] || '→';
                                    const acc = accuracies[dir] ?? 0;
                                    return (
                                        <div key={dir}
                                            onClick={() => setSelectedDir(dir)}
                                            style={{
                                                background: '#fff', borderRadius: 14, overflow: 'hidden',
                                                border: `1.5px solid ${isActive ? col + '66' : '#e2e8f0'}`,
                                                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                                boxShadow: isActive
                                                    ? `0 0 0 3px ${col}18, 0 4px 20px rgba(0,0,0,0.07)`
                                                    : '0 1px 6px rgba(0,0,0,0.05)',
                                                transition: 'all 0.2s ease',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.1), 0 0 0 2px ${col}30`; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = isActive ? `0 0 0 3px ${col}18, 0 4px 20px rgba(0,0,0,0.07)` : '0 1px 6px rgba(0,0,0,0.05)'; }}
                                        >
                                            {/* Header strip */}
                                            <div style={{
                                                background: `linear-gradient(135deg, ${col}12 0%, ${col}06 100%)`,
                                                borderBottom: `1px solid ${col}20`,
                                                padding: '10px 14px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                flexShrink: 0,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 10, height: 10, borderRadius: '50%', background: col,
                                                        boxShadow: isActive ? `0 0 8px ${col}` : 'none',
                                                        flexShrink: 0,
                                                    }} />
                                                    <span style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px' }}>
                                                        {DIR_ICONS[dir]} {dir}
                                                    </span>
                                                    {isActive && (
                                                        <span style={{
                                                            fontSize: 8, fontWeight: 900, padding: '1px 6px',
                                                            borderRadius: 4, background: '#dcfce7', color: '#16a34a',
                                                        }}>ACTIVE</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <div style={{
                                                        padding: '2px 7px', borderRadius: 5, fontSize: 8, fontWeight: 800,
                                                        background: `${sigCol(sig)}15`, color: sigCol(sig),
                                                        border: `1px solid ${sigCol(sig)}30`,
                                                    }}>{sig}</div>
                                                    <div style={{
                                                        padding: '2px 7px', borderRadius: 5, fontSize: 8, fontWeight: 800,
                                                        background: acc >= 80 ? '#f0fdf4' : acc >= 60 ? '#fefce8' : '#fef2f2',
                                                        color: acc >= 80 ? '#16a34a' : acc >= 60 ? '#854d0e' : '#dc2626',
                                                        border: `1px solid ${acc >= 80 ? '#86efac' : acc >= 60 ? '#fde68a' : '#fca5a5'}`,
                                                    }}>{acc}% acc</div>
                                                </div>
                                            </div>

                                            {/* Body — flex:1 to fill card height */}
                                            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {/* 3 stat boxes */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                                    {[
                                                        { label: 'NOW', value: cnt, unit: 'veh' },
                                                        { label: 'FORECAST', value: forecast, unit: 'veh' },
                                                        { label: 'WAIT', value: wt, unit: 's' },
                                                    ].map(({ label, value, unit }) => (
                                                        <div key={label} style={{
                                                            textAlign: 'center', padding: '7px 4px',
                                                            background: '#f8fafc', borderRadius: 8,
                                                            border: '1px solid #f1f5f9',
                                                        }}>
                                                            <div style={{ fontSize: 18, fontWeight: 900, color: col, lineHeight: 1 }}>
                                                                {value}<span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 1 }}>{unit}</span>
                                                            </div>
                                                            <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', marginTop: 2, letterSpacing: '0.3px' }}>{label}</div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Trend + next row */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{
                                                        fontSize: 8, fontWeight: 800, padding: '3px 7px', borderRadius: 5,
                                                        background: tr === '↑' ? '#fee2e2' : tr === '↓' ? '#dcfce7' : '#eff6ff',
                                                        color: tr === '↑' ? '#ef4444' : tr === '↓' ? '#22c55e' : '#3b82f6',
                                                    }}>
                                                        {tr === '↑' ? '↗ RISING' : tr === '↓' ? '↘ FALLING' : '→ STABLE'}
                                                    </span>
                                                    {dir === signalNext && (
                                                        <span style={{
                                                            fontSize: 8, fontWeight: 900, padding: '3px 7px',
                                                            borderRadius: 5, background: '#eff6ff', color: '#3b82f6',
                                                            border: '1px solid #bfdbfe',
                                                        }}>▶ NEXT GREEN</span>
                                                    )}
                                                </div>

                                                {/* Sparkline */}
                                                <div style={{
                                                    flex: 1, minHeight: 60,
                                                    borderRadius: 8,
                                                    overflow: 'visible',
                                                    background: '#f8fafc',
                                                    position: 'relative',
                                                }}>
                                                    <FlowGraph
                                                        history={snapshot[dir]}
                                                        preds={predictions[dir]}
                                                        color={col}
                                                        width={400}
                                                        height={60}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Drag handle between cards and log */}
                    <div
                        onMouseDown={startLogDrag}
                        style={{
                            width: 6, cursor: 'col-resize', flexShrink: 0,
                            background: 'transparent',
                            borderLeft: '1px solid #e2e8f0',
                            transition: 'background 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#c7d2fe'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <div style={{ width: 2, height: 32, borderRadius: 2, background: '#cbd5e1' }} />
                    </div>

                    {/* Right: Decision Log panel */}
                    <div style={{
                        width: logW, flexShrink: 0,
                        overflowY: 'auto',
                        background: '#fff',
                        borderLeft: '1px solid #e2e8f0',
                        display: 'flex', flexDirection: 'column',
                    }}>
                        <DecisionHistory decisions={decisionHistory} />
                    </div>
                </div>
            </div>

            {/* ══ DETAIL MODAL ══ */}
            {selectedDir && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(8px)',
                    zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }} onClick={() => setSelectedDir(null)}>
                    <div style={{
                        background: '#fff', borderRadius: 18,
                        width: '92%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto',
                        border: `1.5px solid ${DIR_COLORS[selectedDir]}30`,
                        boxShadow: `0 30px 80px rgba(0,0,0,0.28)`,
                        animation: 'modalSlideUp 0.25s cubic-bezier(0.16,1,0.3,1) both',
                    }} className="no-scrollbar" onClick={e => e.stopPropagation()}>

                        {/* Modal header strip */}
                        <div style={{
                            background: `linear-gradient(135deg, ${DIR_COLORS[selectedDir]}14, ${DIR_COLORS[selectedDir]}06)`,
                            borderBottom: `1px solid ${DIR_COLORS[selectedDir]}20`,
                            padding: '14px 18px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            borderRadius: '18px 18px 0 0',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: `${DIR_COLORS[selectedDir]}12`,
                                    border: `1.5px solid ${DIR_COLORS[selectedDir]}35`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                                }}>{DIR_ICONS[selectedDir]}</div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>
                                        {selectedDir} Lane
                                        <span style={{
                                            marginLeft: 10, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                            background: `${sigCol(wsSignals?.[selectedDir] || 'RED')}14`,
                                            color: sigCol(wsSignals?.[selectedDir] || 'RED'),
                                            border: `1px solid ${sigCol(wsSignals?.[selectedDir] || 'RED')}28`,
                                            verticalAlign: 'middle',
                                        }}>{wsSignals?.[selectedDir] || 'RED'}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                        60-second window · Linear regression forecast
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedDir(null)} style={{
                                width: 30, height: 30, borderRadius: '50%',
                                border: '1px solid #e2e8f0', background: '#fff',
                                color: '#64748b', fontSize: 17, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s ease',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; }}
                            >×</button>
                        </div>

                        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                            {/* 4 stat tiles */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
                                {[
                                    { label: 'PRESENT', value: snapshot[selectedDir]?.slice(-1)[0] ?? 0, unit: 'veh', color: DIR_COLORS[selectedDir] },
                                    { label: 'FORECASTED', value: Math.max(...(predictions[selectedDir] || [0]), 0), unit: 'veh', color: DIR_COLORS[selectedDir] },
                                    { label: 'WAIT TIME', value: Math.round(bkWaitTimes?.[selectedDir] || waitTimes[selectedDir] || 0), unit: 's', color: (bkWaitTimes?.[selectedDir] || waitTimes[selectedDir] || 0) > 60 ? '#ef4444' : '#0f172a' },
                                    { label: 'ACCURACY', value: accuracies[selectedDir] ?? 0, unit: '%', color: (accuracies[selectedDir] ?? 0) >= 85 ? '#10b981' : '#3b82f6' },
                                ].map(({ label, value, unit, color }) => (
                                    <div key={label} style={{
                                        background: '#f8fafc', borderRadius: 10,
                                        padding: '11px 12px', border: '1px solid #e2e8f0', textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.7px', marginBottom: 4 }}>{label}</div>
                                        <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>
                                            {value}<span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 1 }}>{unit}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Flow graph */}
                            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>Traffic Flow — History + Forecast</div>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 8, fontWeight: 700, color: '#94a3b8' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <span style={{ width: 14, height: 2.5, background: DIR_COLORS[selectedDir], borderRadius: 2, display: 'inline-block' }} />
                                            HISTORY
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <span style={{ width: 14, height: 2.5, background: DIR_COLORS[selectedDir], opacity: 0.45, borderRadius: 2, display: 'inline-block' }} />
                                            FORECAST
                                        </span>
                                    </div>
                                </div>
                                <div style={{ height: 140 }}>
                                    <FlowGraph history={snapshot[selectedDir]} preds={predictions[selectedDir]} color={DIR_COLORS[selectedDir]} width={780} height={140} showTooltip />
                                </div>
                            </div>

                            {/* Bottom 2-col */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                                {/* Accuracy panel */}
                                <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', letterSpacing: '0.8px', marginBottom: 10 }}>PREDICTION ACCURACY</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <ConfidenceRing value={accuracies[selectedDir] ?? 0} color={DIR_COLORS[selectedDir]} size={60} />
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                                                {(accuracies[selectedDir] ?? 0) >= 85 ? 'High accuracy' : (accuracies[selectedDir] ?? 0) >= 70 ? 'Moderate' : 'Building data…'}
                                            </div>
                                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                                Deviation index: {(100 - (accuracies[selectedDir] ?? 0)).toFixed(1)}σ
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                                        {DIRS.map(d => (
                                            <div key={d} style={{
                                                padding: '4px 7px', borderRadius: 5,
                                                background: d === selectedDir ? `${DIR_COLORS[d]}10` : '#fff',
                                                border: `1px solid ${d === selectedDir ? DIR_COLORS[d] + '28' : '#e2e8f0'}`,
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            }}>
                                                <span style={{ fontSize: 8, fontWeight: 800, color: d === selectedDir ? DIR_COLORS[d] : '#64748b' }}>{DIR_ICONS[d]} {d}</span>
                                                <span style={{ fontSize: 9, fontWeight: 900, color: (accuracies[d] ?? 0) >= 80 ? '#22c55e' : '#3b82f6' }}>{accuracies[d] ?? 0}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Past predictions + system status */}
                                <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', letterSpacing: '0.8px' }}>PAST PREDICTIONS</div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 700, color: '#94a3b8', fontSize: 8 }}>ACTUAL</th>
                                                <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 700, color: '#94a3b8', fontSize: 8 }}>PREDICTED</th>
                                                <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 700, color: '#94a3b8', fontSize: 8 }}>DIFF</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(pastMatchesRef.current[selectedDir] || []).slice(-5).reverse().map((m, i) => {
                                                const diff = m.actual - m.pred;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '4px 0', fontWeight: 700, color: '#0f172a' }}>{m.actual} veh</td>
                                                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 800, color: DIR_COLORS[selectedDir] }}>{m.pred}</td>
                                                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, fontSize: 9, color: Math.abs(diff) <= 1 ? '#22c55e' : '#ef4444' }}>
                                                            {diff >= 0 ? '+' : ''}{diff}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {[
                                            { label: 'GREEN NOW', value: activeDir || 'NONE', color: activeDir ? DIR_COLORS[activeDir] : '#94a3b8' },
                                            { label: 'NEXT SWITCH', value: signalNext || '…', color: signalNext ? DIR_COLORS[signalNext] : '#3b82f6' },
                                            { label: 'TREND', value: trends[selectedDir] === '↑' ? '↗ Rising' : trends[selectedDir] === '↓' ? '↘ Falling' : '→ Stable', color: '#64748b' },
                                        ].map(({ label, value, color }) => (
                                            <div key={label} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '4px 7px', background: '#fff', borderRadius: 5, border: '1px solid #f1f5f9',
                                            }}>
                                                <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8' }}>{label}</span>
                                                <span style={{ fontSize: 9, fontWeight: 900, color }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
