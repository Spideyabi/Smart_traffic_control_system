import React, { useState, useCallback, useEffect } from 'react';

export default function LiveFeedTab({ running, streamState, start, stop, VIDEO, wsOk, entries, counts, maxCount, wsSignals, total, setCounts, logs, signalTime, signalNext }) {
    const [rightWidth, setRightWidth] = useState(380);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseDown = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const onMouseUp = useCallback(() => setIsDragging(false), []);
    const onMouseMove = useCallback((e) => {
        if (!isDragging) return;
        const w = window.innerWidth - e.clientX;
        setRightWidth(Math.min(700, Math.max(280, w)));
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

    const totalVehicles = entries.reduce((s, [, v]) => s + v.count, 0);
    const maxOcc = Math.max(1, ...entries.map(([, v]) => v.occupancy || 0));

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

            {/* ── Top Bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 20px', height: 48, flexShrink: 0,
                background: '#fff', borderBottom: '1px solid #e2e8f0',
            }}>
                <span style={{ fontSize: 16 }}>📹</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.2px' }}>
                    Live Video Detection
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '1px' }}>
                    / CAMERA FEED ONLY
                </span>

                <div style={{ flex: 1 }} />

                {/* Connection dot */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: wsOk ? '#22c55e' : '#94a3b8',
                        boxShadow: wsOk ? '0 0 5px #22c55e' : 'none',
                        animation: wsOk ? 'blink 1.8s ease-in-out infinite' : 'none',
                    }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: wsOk ? '#16a34a' : '#94a3b8' }}>
                        {wsOk ? 'CONNECTED' : 'OFFLINE'}
                    </span>
                </div>

                {/* Vehicles total badge */}
                {running && (
                    <div style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 9, fontWeight: 800,
                        background: '#f0fdf4', color: '#16a34a',
                        border: '1px solid #86efac',
                    }}>
                        🚗 {totalVehicles} detected
                    </div>
                )}

                {/* Start / Stop button */}
                <button
                    onClick={running ? stop : start}
                    style={{
                        padding: '5px 16px', fontSize: 9, fontWeight: 800,
                        borderRadius: 6, letterSpacing: '0.6px', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all .15s ease',
                        border: running ? '1px solid #ef444466' : '1px solid #22c55e66',
                        background: running ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                        color: running ? '#dc2626' : '#16a34a',
                    }}
                >
                    {running ? '■ STOP VIDEO' : '▶ START VIDEO'}
                </button>
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `1fr 6px ${rightWidth}px`, minHeight: 0 }}>

                {/* ── Left: video feed ── */}
                <div style={{
                    display: 'flex', flexDirection: 'column',
                    background: '#fff', margin: '10px 0 10px 10px',
                    borderRadius: 14, border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                }}>
                    {/* Video header */}
                    <div style={{
                        padding: '10px 14px', flexShrink: 0,
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: running ? '#ef4444' : '#94a3b8',
                            boxShadow: running ? '0 0 6px #ef4444' : 'none',
                            animation: running ? 'blink 1s ease-in-out infinite' : 'none',
                        }} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#374151', letterSpacing: '0.5px' }}>
                            {running ? 'LIVE DETECTION STREAM' : 'CAMERA OFFLINE'}
                        </span>
                    </div>

                    {/* Video area */}
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#fff', overflow: 'hidden', position: 'relative',
                    }}>
                        {streamState === 'PLAYING' && (
                            <>
                                <img
                                    src={VIDEO}
                                    alt="live detection feed"
                                    style={{
                                        maxWidth: '100%', maxHeight: '100%',
                                        objectFit: 'contain', transition: 'all 0.5s ease',
                                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                    }}
                                />
                                {/* Live Indicator Overlay */}
                                <div style={{
                                    position: 'absolute', top: 12, right: 12,
                                    padding: '4px 8px', borderRadius: 6,
                                    background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                                    fontSize: 8, fontWeight: 900, letterSpacing: '0.5px',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                }}>
                                    <div style={{
                                        width: 4, height: 4, borderRadius: '50%',
                                        background: '#fff', animation: 'blink 0.8s infinite'
                                    }} />
                                    LIVE
                                </div>
                            </>
                        )}

                        {streamState === 'BUFFERING' && (
                            <div style={{
                                textAlign: 'center',
                                background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.05) 0%, #fff 100%)',
                                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 0,
                                position: 'relative', overflow: 'hidden',
                            }}>
                                {/* Animated scanline */}
                                <div style={{
                                    position: 'absolute', left: 0, right: 0,
                                    height: '30%',
                                    background: 'linear-gradient(to bottom, transparent, rgba(139,92,246,0.06), transparent)',
                                    animation: 'scanline 3s linear infinite',
                                    pointerEvents: 'none',
                                }} />
                                <div style={{
                                    width: 72, height: 72,
                                    border: '3px solid rgba(139,92,246,0.15)',
                                    borderTop: '3px solid #a855f7',
                                    borderRight: '3px solid #7c3aed',
                                    borderRadius: '50%',
                                    animation: 'spin 0.9s linear infinite',
                                    marginBottom: 24, boxShadow: '0 0 20px rgba(139,92,246,0.1)'
                                }} />
                                <div style={{ fontSize: 15, fontWeight: 900, color: '#7c3aed', marginBottom: 10, letterSpacing: '2px' }}>
                                    PRE-CALIBRATING
                                </div>
                                <div style={{
                                    fontSize: 11, color: '#a78bfa', fontWeight: 600,
                                    maxWidth: 260, lineHeight: 1.7,
                                    background: 'rgba(109,40,217,0.12)',
                                    padding: '8px 16px', borderRadius: 8,
                                    border: '1px solid rgba(139,92,246,0.2)',
                                }}>
                                    🔬 Lane detection & vehicle tracking in progress<br/>
                                    <span style={{ color: '#7c3aed', fontSize: 10 }}>Queue filling — stream will release automatically</span>
                                </div>
                            </div>
                        )}

                        {streamState === 'ENDED' && (
                            <div style={{
                                textAlign: 'center',
                                background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.05) 0%, #fff 100%)',
                                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 0,
                                position: 'relative', overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    background: 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.05) 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    boxShadow: '0 0 30px rgba(239,68,68,0.2)',
                                }}>
                                    <span style={{ fontSize: 32 }}>🎬</span>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444', marginBottom: 10, letterSpacing: '2px' }}>
                                    STREAM ENDED
                                </div>
                                <div style={{
                                    fontSize: 11, color: '#fca5a5', fontWeight: 600,
                                    maxWidth: 260, lineHeight: 1.7,
                                    background: 'rgba(127,29,29,0.2)',
                                    padding: '8px 16px', borderRadius: 8,
                                    border: '1px solid rgba(239,68,68,0.2)',
                                }}>
                                    All annotated frames have been displayed.<br/>
                                    <span style={{ color: '#ef4444' }}>Press <strong style={{ color: '#fff' }}>▶ START VIDEO</strong> for instant RAM replay!</span>
                                </div>
                            </div>
                        )}

                        {(streamState === 'STANDBY' || !streamState) && (
                            <div style={{
                                textAlign: 'center',
                                background: 'radial-gradient(ellipse at 50% 60%, rgba(248,250,252,0.9) 0%, #fff 100%)',
                                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 0,
                            }}>
                                <div style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    background: 'rgba(51, 65, 85, 0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 20, border: '1px solid rgba(0,0,0,0.05)',
                                    boxShadow: '0 4px 20px rgba(99,102,241,0.1)',
                                }}>
                                    <span style={{ fontSize: 32, opacity: 0.8 }}>📹</span>
                                </div>
                                {/* Static dots */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: '#4f46e5',
                                        }} />
                                    ))}
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 8, letterSpacing: '0.5px' }}>
                                    SYSTEM STANDBY
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220, lineHeight: 1.6, fontWeight: 500 }}>
                                    Click <span style={{ color: '#4ade80', fontWeight: 800 }}>▶ START VIDEO</span> to release the live detection stream.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Drag Handle ── */}
                <div
                    onMouseDown={onMouseDown}
                    style={{
                        cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', transition: 'background .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <div style={{ width: 2, height: 40, borderRadius: 2, background: isDragging ? '#6366f1' : '#cbd5e1' }} />
                </div>

                {/* ── Right: stats panel ── */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: 0,
                    margin: '10px 10px 10px 0',
                    borderRadius: 14, border: '1px solid #e2e8f0',
                    background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                }}>

                    {/* Panel header */}
                    <div style={{
                        padding: '10px 14px', flexShrink: 0,
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: '1px' }}>
                            DETECTION RESULTS
                        </span>
                        <button
                            onClick={() => setCounts({})}
                            style={{
                                fontSize: 8, fontWeight: 800, padding: '2px 8px',
                                border: '1px solid #e2e8f0', borderRadius: 4,
                                background: '#f8fafc', color: '#64748b',
                                cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            CLEAR
                        </button>
                    </div>

                    {/* Summary strip */}
                    {running && (
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 0, borderBottom: '1px solid #f1f5f9', flexShrink: 0,
                        }}>
                            {[
                                { label: 'CAMERAS', value: entries.length, icon: '📹' },
                                { label: 'TOTAL VEHICLES', value: totalVehicles, icon: '🚗' },
                            ].map(({ label, value, icon }) => (
                                <div key={label} style={{
                                    padding: '10px 14px', textAlign: 'center',
                                    borderRight: label === 'CAMERAS' ? '1px solid #f1f5f9' : 'none',
                                }}>
                                    <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{value}</div>
                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', marginTop: 3, letterSpacing: '0.5px' }}>{label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Vehicle count list */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                        <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', letterSpacing: '1px', marginBottom: 2 }}>
                            PER-CAMERA COUNTS
                        </div>

                        {entries.length === 0 ? (
                            <div style={{
                                flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 8,
                                color: '#94a3b8', minHeight: 100,
                            }}>
                                <span style={{ fontSize: 30 }}>🎥</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>
                                    {running ? 'Counting vehicles…' : 'Start video to see detection data'}
                                </span>
                            </div>
                        ) : (
                            entries.map(([name, { second, count, occupancy }]) => {
                                const occ = occupancy || 0;
                                const pct = Math.round((occ / Math.max(maxOcc, 1)) * 100);
                                return (
                                    <div key={name} style={{
                                        background: '#f8fafc', borderRadius: 10,
                                        padding: '10px 12px',
                                        border: '1px solid #f1f5f9',
                                    }}>
                                        {/* Row 1: name + counts */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontSize: 10, fontWeight: 900, color: '#1e293b',
                                                    letterSpacing: '0.5px', marginBottom: 2
                                                }}>
                                                    {name.toUpperCase()}
                                                </div>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '2px 6px', borderRadius: 4, background: '#e2e8f0',
                                                    fontSize: 8, fontWeight: 700, color: '#64748b'
                                                }}>
                                                    ⏱ {second}s
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{count}</div>
                                                    <div style={{ fontSize: 7, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.4px', marginTop: 2 }}>VEHICLES</div>
                                                </div>
                                                <div style={{ width: 1, height: 24, background: '#cbd5e1' }} />
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0ea5e9', lineHeight: 1 }}>{occ.toFixed(1)}%</div>
                                                    <div style={{ fontSize: 7, fontWeight: 800, color: '#0ea5e9', letterSpacing: '0.4px', marginTop: 2 }}>DENSITY</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Occupancy bar */}
                                        <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 2,
                                                width: `${pct}%`,
                                                background: occ > 70 ? '#ef4444' : occ > 40 ? '#f59e0b' : '#22c55e',
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Backend terminal log */}
                    <div style={{
                        flexShrink: 0, height: 140,
                        background: '#0f172a', padding: '10px 14px',
                        overflowY: 'auto',
                        borderTop: '1px solid #1e293b',
                    }}>
                        <div style={{ fontSize: 8, fontWeight: 800, color: '#475569', letterSpacing: '1px', marginBottom: 6 }}>
                            BACKEND LOG
                        </div>
                        {logs && logs.length > 0
                            ? logs
                                .filter(log => !log.message?.match(/\[(AI SIGNAL|TIME SIGNAL|CONTROLLER|EMERGENCY|MANUAL)\]/))
                                .slice(-40)
                                .map((log, i) => (
                                    <div key={i} style={{ fontSize: 9, color: '#10b981', marginBottom: 3, fontFamily: 'monospace', lineHeight: 1.4 }}>
                                        <span style={{ color: '#475569' }}>[{log.ts}]</span> {log.message}
                                    </div>
                                ))
                            : <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>Waiting for logs…</div>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
