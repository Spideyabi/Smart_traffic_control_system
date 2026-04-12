import React, { useState, useCallback, useEffect, useRef } from 'react';
import TrafficScene from './TrafficScene';

const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

function sigColor(state) {
    if (state === 'GREEN') return '#22c55e';
    if (state === 'AMBER') return '#fbbf24';
    return '#ef4444';
}

function ReasonBadge({ reason }) {
    if (!reason) return null;
    const isEmergency = reason.includes('EMERGENCY');
    const isForce = reason.includes('starvation') || reason.includes('Force');
    const isDensity = reason.includes('density') || reason.includes('Highest');
    const bg = isEmergency ? '#ef4444' : isForce ? '#fef2f2' : isDensity ? '#eff6ff' : '#f8fafc';
    const color = isEmergency ? '#fff' : isForce ? '#dc2626' : isDensity ? '#2563eb' : '#64748b';
    const border = isEmergency ? '#dc2626' : isForce ? '#fecaca' : isDensity ? '#bfdbfe' : '#e2e8f0';
    return (
        <div style={{
            fontSize: '11px', fontWeight: 700, padding: '5px 10px',
            borderRadius: 7, background: bg, color, border: `1px solid ${border}`,
            animation: isEmergency ? 'pulse 0.6s ease-in-out infinite alternate' : 'none',
            lineHeight: 1.4, marginTop: 8,
        }}>
            {reason}
        </div>
    );
}

/* Large traffic-light style card for one direction */
function SignalCard({ dir, state, time, count, waitTime, isEmergency }) {
    const isGreen = state === 'GREEN';
    const isAmber = state === 'AMBER';
    const isRed = !isGreen && !isAmber;
    const activeColor = sigColor(state);

    const BULB = 22;
    const mkBulb = (active, color) => (
        <div style={{
            width: BULB, height: BULB, borderRadius: '50%',
            background: active ? color : `${color}22`,
            border: `2px solid ${active ? color : color + '55'}`,
            boxShadow: active ? `0 0 14px ${color}88` : 'none',
            transition: 'all 0.3s ease',
        }} />
    );

    return (
        <div style={{
            flex: 1,
            background: isGreen
                ? 'linear-gradient(160deg, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.10) 100%)'
                : isAmber
                    ? 'linear-gradient(160deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.07) 100%)'
                    : '#fff',
            border: `2px solid ${isGreen ? '#22c55e' : isAmber ? '#fbbf24' : '#f1f5f9'}`,
            borderRadius: 14,
            padding: '14px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            boxShadow: isGreen
                ? '0 4px 20px rgba(34,197,94,0.35)'
                : isAmber
                    ? '0 4px 16px rgba(251,191,36,0.28)'
                    : '0 1px 4px rgba(0,0,0,0.04)',
            transition: 'all 0.3s ease',
            minWidth: 0,
        }}>
            {/* Direction name */}
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.5px' }}>
                {dir}
            </div>

            {/* Traffic light housing */}
            <div style={{
                background: '#1a1a1a',
                borderRadius: 8,
                padding: '8px 6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
                border: '2px solid #2a2a2a',
            }}>
                {mkBulb(isRed, '#ef4444')}
                {mkBulb(isAmber, '#fbbf24')}
                {mkBulb(isGreen, '#22c55e')}
            </div>

            {/* Status text */}
            <div style={{
                fontSize: '11px', fontWeight: 800,
                color: activeColor,
                letterSpacing: '0.5px',
            }}>
                {state}
            </div>

            {/* Timer (only for active) */}
            {(isGreen || isAmber) && time !== null && !isEmergency && (
                <div style={{
                    fontSize: '20px', fontWeight: 900,
                    color: activeColor,
                    lineHeight: 1,
                    background: `${activeColor}15`,
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: `1px solid ${activeColor}44`,
                }}>
                    {Math.round(time)}s
                </div>
            )}

            {/* Wait time (only for non-active) */}
            {!isGreen && !isAmber && waitTime !== undefined && (
                <div style={{
                    fontSize: '11px', fontWeight: 700, color: '#ef4444',
                    background: 'rgba(239,68,68,0.08)', padding: '2px 8px',
                    borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)'
                }}>
                    Waited: {Math.round(waitTime)}s
                </div>
            )}

            {/* Vehicle count */}
            {count !== undefined && (
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                    🚗 {count}
                </div>
            )}
        </div>
    );
}

export default function SimulatorTab({ simRunning, setSimRunning, running, start, stop, trafficStats, setTrafficStats, counts, wsSignals, signalMode, setSignalMode, signalTime, signalNext, signalNextReason, aiDecision, isEmergency, waitTimes }) {
    const [rightWidth, setRightWidth] = useState(320);
    const [isDragging, setIsDragging] = useState(false);
    const [manualOverride, setManualOverride] = useState(false);
    const [manualDir, setManualDir] = useState(null);
    const [localWaitTimes, setLocalWaitTimes] = useState({ NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 });
    const localWaitRef = useRef({ NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 });
    const [spawnCount, setSpawnCount] = useState(3);
    const [spawnType, setSpawnType] = useState('car');
    const [spawnDir, setSpawnDir] = useState('NORTH');
    const [spawnActive, setSpawnActive] = useState(false);   // toggle switch
    const [selectedType, setSelectedType] = useState('car'); // which type is selected
    const [selectedDir, setSelectedDir] = useState(null);    // which dir is selected
    const [spawnEvent, setSpawnEvent] = useState(null);

    // Local wait time tracking (reset ONLY when signal finishes turning RED, increment every 1s for RED)
    const prevSignalsRef = useRef({});
    useEffect(() => {
        if (!simRunning) return;
        const id = setInterval(() => {
            DIRS.forEach(d => {
                const current = wsSignals?.[d];
                const prev = prevSignalsRef.current[d];
                const isActive = current === 'GREEN' || current === 'AMBER';
                const wasActive = prev === 'GREEN' || prev === 'AMBER';

                // If it just finished its turn (changed from Green/Amber to Red), reset to 0
                if (wasActive && !isActive) {
                    localWaitRef.current[d] = 0;
                }
                // If it is currently RED, it is waiting, so increment time
                else if (!isActive) {
                    localWaitRef.current[d] += 1;
                }
                // If it is GREEN/AMBER, it freezes (neither resets nor increments)
            });
            setLocalWaitTimes({ ...localWaitRef.current });
            prevSignalsRef.current = { ...wsSignals };
        }, 1000);
        return () => clearInterval(id);
    }, [simRunning, wsSignals]);

    const onMouseDown = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const onMouseUp = useCallback(() => setIsDragging(false), []);
    const onMouseMove = useCallback((e) => {
        if (!isDragging) return;
        let w = window.innerWidth - e.clientX;
        setRightWidth(Math.min(520, Math.max(260, w)));
    }, [isDragging]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, onMouseMove, onMouseUp]);

    const handleModeSelect = async (mode) => {
        setSignalMode(mode);
        try { await fetch(`http://localhost:8000/api/signal_mode?mode=${mode}`, { method: 'POST' }); } catch { }
    };

    const toggleManualOverride = async () => {
        const next = !manualOverride;
        setManualOverride(next);
        if (!next) {
            setManualDir(null);
            try {
                await fetch('http://localhost:8000/api/manual_override', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: false, direction: null }),
                });
            } catch { }
        }
    };

    const selectManualDir = async (dir) => {
        setManualDir(dir);
        try {
            await fetch('http://localhost:8000/api/manual_override', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: true, direction: dir }),
            });
        } catch { }
    };

    const rawSignals = trafficStats?.rawSignals || {};
    const laneCounts = trafficStats?.laneCounts || Array(8).fill(0);
    const totalVehicles = laneCounts.reduce((a, b) => a + b, 0);

    const dirCounts = {
        NORTH: (laneCounts[0] || 0) + (laneCounts[1] || 0),
        SOUTH: (laneCounts[2] || 0) + (laneCounts[3] || 0),
        EAST: (laneCounts[6] || 0) + (laneCounts[7] || 0),
        WEST: (laneCounts[4] || 0) + (laneCounts[5] || 0),
    };
    const maxDirCount = Math.max(1, ...Object.values(dirCounts));

    const latestDirCounts = useRef(dirCounts);
    useEffect(() => {
        latestDirCounts.current = dirCounts;
    }, [dirCounts]);

    // Sync simulated counts to the backend AI
    useEffect(() => {
        if (!simRunning || signalMode !== 'DENSITY') return;

        const syncDensity = async () => {
            try {
                // Read from the ref to avoid effect dependency churn
                await fetch('http://localhost:8000/api/density', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(latestDirCounts.current),
                });
            } catch (err) {
                console.error("Failed to sync density", err);
            }
        };

        // Sync every 1 second to keep the AI updated without spamming
        const id = setInterval(syncDensity, 1000);
        return () => clearInterval(id);
    }, [simRunning, signalMode]);

    /* spawn helper — ambulance always 1 */
    const spawnVehicles = async (type, direction) => {
        const count = type === 'ambulance' ? 1 : spawnCount;
        setSpawnEvent({ type, direction, count, timestamp: Date.now() });

        if (type === 'ambulance') {
            try {
                // Immediate notification to backend for interrupt
                await fetch('http://localhost:8000/api/ambulance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction, active: true }),
                });

                // Auto-clear once it likely passes the junction
                setTimeout(async () => {
                    try {
                        await fetch('http://localhost:8000/api/ambulance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ direction, active: false }),
                        });
                    } catch (err) { }
                }, 12000);
            } catch (err) { }
        }
    };

    /* Continuous spawn — fires ONCE then auto-stops */
    useEffect(() => {
        if (!spawnActive || !simRunning || !selectedDir) return;
        spawnVehicles(selectedType, selectedDir);
        setSpawnActive(false); // auto-off after one shot
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spawnActive]);

    /* shared button style builder */
    const ctrlBtn = (active, activeColors, inactiveColors) => ({
        padding: '6px 16px', fontSize: '0.75rem', fontWeight: 800,
        border: `1px solid ${active ? activeColors.border : inactiveColors.border}`,
        borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        background: active ? activeColors.bg : inactiveColors.bg,
        color: active ? activeColors.fg : inactiveColors.fg,
        boxShadow: active ? activeColors.shadow : 'none',
        transition: 'all .18s ease',
        letterSpacing: '0.5px',
    });

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `1fr 5px ${rightWidth}px`, flex: 1, minHeight: 0 }}>

                {/* ── Left: 3D Canvas ── */}
                <div style={{
                    marginRight: 4, display: 'flex', flexDirection: 'column',
                    borderRadius: 12, border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
                    background: '#fff',
                }}>
                    {/* ── Toolbar: Sim Start + Spawn controls ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', flexShrink: 0,
                        background: '#ffffff',
                        borderBottom: '1px solid #e2e8f0',
                        flexWrap: 'wrap',
                    }}>
                        {/* ── Sim Start / Stop — independent of Live Video ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            {/* Live dot */}
                            <div style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: simRunning ? '#22c55e' : '#94a3b8',
                                boxShadow: simRunning ? '0 0 5px #22c55e' : 'none',
                                animation: simRunning ? 'blink 1.8s ease-in-out infinite' : 'none',
                                flexShrink: 0,
                            }} />
                            <button
                                onClick={() => setSimRunning(v => !v)}
                                style={{
                                    padding: '3px 12px', fontSize: '9px', fontWeight: 800,
                                    borderRadius: 5, fontFamily: 'inherit', letterSpacing: '0.6px',
                                    cursor: 'pointer', transition: 'all .15s ease', whiteSpace: 'nowrap',
                                    border: simRunning ? '1px solid #ef444466' : '1px solid #22c55e66',
                                    background: simRunning ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                                    color: simRunning ? '#dc2626' : '#16a34a',
                                    boxShadow: simRunning ? '0 0 6px rgba(239,68,68,0.2)' : '0 0 6px rgba(34,197,94,0.2)',
                                }}
                            >
                                {simRunning ? '■ STOP SIM' : '▶ START SIM'}
                            </button>
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Section label */}
                        <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', letterSpacing: '1.2px', whiteSpace: 'nowrap' }}>SPAWN</span>

                        {/* Count input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>×</span>
                            <input
                                type="number" min={1} max={20} value={spawnCount}
                                onChange={e => setSpawnCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                                style={{
                                    width: 40, padding: '2px 5px', fontSize: '11px', fontWeight: 800,
                                    border: '1px solid #e2e8f0', borderRadius: 5,
                                    background: '#f8fafc', color: '#0f172a',
                                    textAlign: 'center', fontFamily: 'inherit', outline: 'none',
                                }}
                            />
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Car direction selector buttons */}
                        <span style={{ fontSize: '9px', fontWeight: 800, color: '#3b82f6', whiteSpace: 'nowrap', marginRight: '4px' }}>VEHICLE</span>
                        {DIRS.map(dir => {
                            const isSel = selectedType === 'car' && selectedDir === dir;
                            return (
                                <button
                                    key={`car-${dir}`}
                                    onClick={() => { setSelectedType('car'); setSelectedDir(dir); setSpawnActive(false); }}
                                    disabled={!simRunning}
                                    style={{
                                        padding: '3px 9px', fontSize: '9px', fontWeight: 800,
                                        borderRadius: 5,
                                        border: isSel ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                                        background: isSel ? 'rgba(59,130,246,0.15)' : 'transparent',
                                        color: isSel ? '#2563eb' : (simRunning ? '#94a3b8' : '#cbd5e1'),
                                        cursor: simRunning ? 'pointer' : 'not-allowed',
                                        fontFamily: 'inherit', letterSpacing: '0.3px',
                                        transition: 'all .15s ease', whiteSpace: 'nowrap',
                                        boxShadow: isSel ? '0 0 6px rgba(59,130,246,0.2)' : 'none',
                                    }}
                                >{dir}</button>
                            );
                        })}

                        {/* Divider */}
                        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* Ambulance direction selector buttons */}
                        <span style={{ fontSize: '9px', fontWeight: 800, color: '#ef4444', whiteSpace: 'nowrap', marginRight: '4px' }}>🚑 AMBULANCE</span>
                        {DIRS.map(dir => {
                            const isSel = selectedType === 'ambulance' && selectedDir === dir;
                            return (
                                <button
                                    key={`amb-${dir}`}
                                    onClick={() => { setSelectedType('ambulance'); setSelectedDir(dir); setSpawnActive(false); }}
                                    disabled={!simRunning}
                                    style={{
                                        padding: '3px 9px', fontSize: '9px', fontWeight: 800,
                                        borderRadius: 5,
                                        border: isSel ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                                        background: isSel ? 'rgba(239,68,68,0.15)' : 'transparent',
                                        color: isSel ? '#dc2626' : (simRunning ? '#94a3b8' : '#cbd5e1'),
                                        cursor: simRunning ? 'pointer' : 'not-allowed',
                                        fontFamily: 'inherit', letterSpacing: '0.3px',
                                        transition: 'all .15s ease', whiteSpace: 'nowrap',
                                        boxShadow: isSel ? '0 0 6px rgba(239,68,68,0.2)' : 'none',
                                    }}
                                >{dir}</button>
                            );
                        })}

                        {/* Divider */}
                        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

                        {/* SPAWN toggle button */}
                        <button
                            onClick={() => {
                                if (!simRunning || !selectedDir) return;
                                setSpawnActive(prev => !prev);
                            }}
                            disabled={!simRunning || !selectedDir}
                            title={selectedDir ? `Continuously spawn ${selectedType} from ${selectedDir}` : 'Select a direction first'}
                            style={{
                                padding: '4px 14px', fontSize: '9px', fontWeight: 800,
                                borderRadius: 6, fontFamily: 'inherit', letterSpacing: '0.8px',
                                cursor: (simRunning && selectedDir) ? 'pointer' : 'not-allowed',
                                transition: 'all .18s ease', whiteSpace: 'nowrap',
                                border: spawnActive
                                    ? '1.5px solid #22c55e'
                                    : '1px solid #e2e8f0',
                                background: spawnActive
                                    ? 'linear-gradient(135deg,#dcfce7,#bbf7d0)'
                                    : (simRunning && selectedDir ? '#f8fafc' : '#f1f5f9'),
                                color: spawnActive ? '#15803d' : (simRunning && selectedDir ? '#475569' : '#94a3b8'),
                                boxShadow: spawnActive ? '0 0 10px rgba(34,197,94,0.35)' : 'none',
                            }}
                        >
                            {spawnActive ? '■ STOP' : '▶ SPAWN'}
                        </button>

                        {/* Status hint */}
                        {spawnActive && selectedDir && (
                            <span style={{ fontSize: '9px', color: '#22c55e', fontWeight: 700 }}>
                                spawning {selectedType} ← {selectedDir}
                            </span>
                        )}
                        {!selectedDir && simRunning && (
                            <span style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic' }}>select a direction first</span>
                        )}
                    </div>


                    {/* 3D scene — fills remaining space */}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <TrafficScene
                            key={signalMode}
                            signalMode={signalMode}
                            onTrafficUpdate={setTrafficStats}
                            initialCounts={counts}
                            wsSignals={wsSignals}
                            simRunning={simRunning}
                            signalTime={signalTime}
                            isEmergency={isEmergency}
                            spawnEvent={spawnEvent}
                        />
                    </div>

                </div>


                {/* ── Resizer ── */}
                <div
                    onMouseDown={onMouseDown}
                    style={{
                        cursor: 'col-resize', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 10,
                        backgroundColor: isDragging ? '#3b82f6' : 'transparent',
                        transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (!isDragging) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                    onMouseLeave={e => { if (!isDragging) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <div style={{ width: 2, height: 40, borderRadius: 2, background: isDragging ? '#3b82f6' : '#cbd5e1' }} />
                </div>

                {/* ── Right: Minimal Stats Panel ── */}
                <div style={{ marginLeft: 4, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>

                    {/* ── Signal Status row ── */}
                    <div style={{
                        background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                        padding: '10px 12px', flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px' }}>SIGNALS</span>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: signalMode === 'DENSITY' ? '#10b981' : '#f59e0b' }}>
                                {signalMode === 'DENSITY' ? ' AI' : ' TIME'}
                            </span>
                        </div>

                        {/* Emergency banner */}
                        {isEmergency && (
                            <div style={{
                                marginBottom: 8, padding: '5px 10px', borderRadius: 6,
                                background: '#ef4444', color: '#fff',
                                fontWeight: 800, fontSize: '10px',
                                animation: 'pulse 0.7s ease-in-out infinite alternate',
                            }}>🚑 EMERGENCY PREEMPTION</div>
                        )}

                        {/* Compact signal rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {DIRS.map(dir => {
                                const sig = rawSignals[dir] || 'RED';
                                const col = sig === 'GREEN' ? '#22c55e' : sig === 'AMBER' ? '#fbbf24' : '#ef4444';
                                const cnt = simRunning ? dirCounts[dir] : '—';
                                const wt = waitTimes?.[dir] ?? localWaitTimes[dir];
                                return (
                                    <div key={dir} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '5px 8px', borderRadius: 6,
                                        background: sig === 'GREEN' ? 'rgba(34,197,94,0.07)' : sig === 'AMBER' ? 'rgba(251,191,36,0.07)' : '#fafafa',
                                        border: `1px solid ${col}30`,
                                    }}>
                                        {/* Signal dot */}
                                        <div style={{
                                            width: 9, height: 9, borderRadius: '50%',
                                            background: col,
                                            boxShadow: sig !== 'RED' ? `0 0 6px ${col}99` : 'none',
                                            flexShrink: 0,
                                        }} />
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a', minWidth: 42 }}>{dir}</span>
                                        <span style={{ fontSize: '9px', fontWeight: 700, color: col, flex: 1 }}>{sig}</span>
                                        {sig !== 'GREEN' && wt > 0 && (
                                            <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>⏳{Math.round(wt)}s</span>
                                        )}
                                        {sig === 'GREEN' && signalTime != null && (
                                            <span style={{ fontSize: '10px', fontWeight: 900, color: '#22c55e' }}>{Math.round(signalTime)}s</span>
                                        )}
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', minWidth: 18, textAlign: 'right' }}>{cnt}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Next turn */}
                        {simRunning && signalNext && (
                            <div style={{ marginTop: 8, fontSize: '9px', color: '#64748b', display: 'flex', gap: 6 }}>
                                <span style={{ fontWeight: 700 }}>NEXT →</span>
                                <span style={{ fontWeight: 900, color: '#3b82f6' }}>{signalNext}</span>
                                {signalNextReason && <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signalNextReason}</span>}
                            </div>
                        )}
                    </div>

                    {/* ── Density bars ── */}
                    {simRunning && (
                        <div style={{
                            background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                            padding: '10px 12px', flexShrink: 0,
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1.2px', marginBottom: 8 }}>DENSITY</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {DIRS.map(dir => {
                                    const cnt = dirCounts[dir];
                                    const pct = (cnt / maxDirCount) * 100;
                                    const sig = rawSignals[dir] || 'RED';
                                    const col = sig === 'GREEN' ? '#22c55e' : sig === 'AMBER' ? '#fbbf24' : '#3b82f6';
                                    return (
                                        <div key={dir}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>{dir}</span>
                                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#0f172a' }}>{cnt}</span>
                                            </div>
                                            <div style={{ height: 4, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 3,
                                                    width: `${pct}%`, background: col,
                                                    transition: 'width 0.4s ease',
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Manual override ── */}
                    <div style={{
                        background: manualOverride ? '#0f172a' : '#f8fafc',
                        borderRadius: 10,
                        border: `1px solid ${manualOverride ? '#ef4444' : '#e2e8f0'}`,
                        padding: '10px 12px', flexShrink: 0,
                        opacity: manualOverride ? 1 : 0.6,
                        transition: 'all 0.2s ease'
                    }}>
                        <div style={{
                            fontSize: '9px', fontWeight: 800,
                            color: manualOverride ? '#f87171' : '#94a3b8',
                            letterSpacing: '1px', marginBottom: 8
                        }}>MANUAL OVERRIDE</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                            {DIRS.map(dir => {
                                const sel = manualOverride && manualDir === dir;
                                return (
                                    <button
                                        key={dir}
                                        onClick={() => manualOverride && selectManualDir(dir)}
                                        disabled={!manualOverride}
                                        style={{
                                            padding: '6px 4px', borderRadius: 6,
                                            border: `1px solid ${sel ? '#22c55e' : (manualOverride ? '#ef444450' : '#cbd5e1')}`,
                                            background: sel ? 'rgba(34,197,94,0.15)' : (manualOverride ? 'rgba(239,68,68,0.08)' : '#f1f5f9'),
                                            color: sel ? '#4ade80' : (manualOverride ? '#f87171' : '#64748b'),
                                            fontWeight: 800, fontSize: '10px',
                                            cursor: manualOverride ? 'pointer' : 'not-allowed',
                                            fontFamily: 'inherit',
                                            transition: 'all .15s ease',
                                        }}>
                                        {sel ? '🟢' : '🔴'} {dir}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Idle placeholder */}
                    {!simRunning && (
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column', gap: 6,
                            color: manualOverride ? '#ef4444' : '#94a3b8', fontSize: '11px', fontWeight: 600,
                            background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                            padding: 16, minHeight: 60,
                        }}>
                            <span style={{ fontSize: '1.4rem' }}>{manualOverride ? '🎮' : '🚦'}</span>
                            <span>{manualOverride ? 'Manual Mode Override' : 'Press ▶ START SIM to begin'}</span>
                        </div>
                    )}

                    {/* ── Bottom controls ── */}
                    <div style={{
                        background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                        padding: '8px 12px', flexShrink: 0,
                        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                        marginTop: 'auto',
                    }}>
                        {/* AI / Time mode pills */}
                        <div style={{
                            display: 'inline-flex', background: '#f1f5f9',
                            borderRadius: 6, padding: 2, gap: 0, border: '1px solid #e2e8f0',
                        }}>
                            {[['TIME', '', '#f59e0b'], ['DENSITY', '', '#10b981']].map(([val, icon, accent]) => (
                                <button key={val} onClick={() => handleModeSelect(val)} style={{
                                    padding: '3px 8px', fontSize: '9px', fontWeight: 800,
                                    border: 'none', borderRadius: 5,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    background: signalMode === val ? `${accent}dd` : 'transparent',
                                    color: signalMode === val ? '#fff' : '#94a3b8',
                                    transition: 'all .15s ease',
                                }}>{icon} {val === 'TIME' ? 'Time' : 'AI'}</button>
                            ))}
                        </div>

                        {/* Manual override toggle */}
                        <button onClick={toggleManualOverride} style={{
                            padding: '3px 10px', fontSize: '9px', fontWeight: 800,
                            borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                            border: `1px solid ${manualOverride ? '#dc262640' : '#e2e8f0'}`,
                            background: manualOverride ? 'rgba(220,38,38,0.1)' : '#f8fafc',
                            color: manualOverride ? '#dc2626' : '#64748b',
                            transition: 'all .15s ease',
                        }}> {manualOverride ? 'Override Stop' : 'Override'}</button>
                    </div>

                </div>{/* end right panel */}
            </div>
        </div>
    );
}
