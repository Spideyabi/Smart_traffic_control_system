import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import LiveFeedTab from './LiveFeedTab'
import SimulatorTab from './SimulatorTab'
import PredictionTab from './PredictionTab'

const API = 'http://localhost:8000'
const WS = 'ws://localhost:8000/ws/logs'
const VIDEO = `${API}/api/video`

export default function App() {
  // { videoName: { second, count } }
  const [counts, setCounts] = useState({})
  const [trafficStats, setTrafficStats] = useState(null)
  const [wsSignals, setWsSignals] = useState(null)
  const [signalTime, setSignalTime] = useState(null)
  const [signalNext, setSignalNext] = useState(null)
  const [signalNextReason, setSignalNextReason] = useState('')
  const [wsOk, setWsOk] = useState(false)
  const [waitTimes, setWaitTimes] = useState({})
  const [running, setRunning] = useState(false)
  const [simRunning, setSimRunning] = useState(false)
  const [activeTab, setActiveTab] = useState('sim') // 'live' | 'sim' | 'predict'
  const [signalMode, setSignalMode] = useState('DENSITY') // default: AI mode
  const [manualOverride, setManualOverride] = useState(false)
  const [logs, setLogs] = useState([])
  const [predictionData, setPredictionData] = useState(null)
  const [aiDecision, setAiDecision] = useState(null)   // latest ai_decision event
  const [isEmergency, setIsEmergency] = useState(false) // ambulance active
  const wsRef = useRef(null)

  // ── WebSocket ────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState <= 1) return
    const ws = new WebSocket(WS)
    wsRef.current = ws
    ws.onopen = () => setWsOk(true)
    ws.onclose = () => { setWsOk(false); setTimeout(connect, 3000) }
    ws.onerror = () => setWsOk(false)
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        // Structured count event: { type:'count', video, second, count }
        if (data.type === 'count') {
          setCounts(prev => ({
            ...prev,
            [data.video]: { second: data.second, count: data.count, occupancy: data.occupancy || 0.0 }
          }))
        }
        if (data.type === 'signal_update') {
          setWsSignals(data.signals)
          if (data.remaining !== undefined) setSignalTime(data.remaining)
          if (data.next_dir) setSignalNext(data.next_dir)
          if (data.next_reason !== undefined) setSignalNextReason(data.next_reason)
          if (data.is_emergency !== undefined) setIsEmergency(data.is_emergency)
          if (data.wait_times) setWaitTimes(data.wait_times)
        }
        if (data.type === 'ai_decision') {
          setAiDecision(data)
          if (data.reason?.includes('EMERGENCY') || data.reason?.includes('PREEMPT')) {
            setIsEmergency(true)
          } else {
            setIsEmergency(false)
          }
        }
        if (data.type === 'prediction_update') {
          setPredictionData(data)
        }
        if (data.message) {
          setLogs(prev => [...prev.slice(-99), data])
        }
      } catch { }
    }
  }, [])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  // ── Start/stop backend signal controller with the 3D simulator ──
  useEffect(() => {
    if (simRunning) {
      // Start the signal controller (without the video pipeline)
      fetch(`${API}/api/sim/start`, { method: 'POST' }).catch(() => {})
    } else {
      // Stop signal controller and clear stale state
      fetch(`${API}/api/sim/stop`, { method: 'POST' }).catch(() => {})
      setWsSignals(null)
      setSignalTime(null)
      setSignalNext(null)
      setWaitTimes({})
    }
  }, [simRunning])


  // ── Poll running state ───────────────────────────────────────
  const [streamState, setStreamState] = useState('STANDBY')

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const d = await (await fetch(`${API}/api/status`)).json()
        if (d.signal_mode) setSignalMode(d.signal_mode)
        if (d.manual_override !== undefined) setManualOverride(d.manual_override)
        if (d.stream_state !== undefined) setStreamState(d.stream_state)
        // Auto-sync the play button state with what the backend reports!
        if (d.running !== undefined) setRunning(d.running)
      } catch { }
    }
    fetchStatus()
    const t = setInterval(fetchStatus, 1000)
    return () => clearInterval(t)
  }, [])


  const start = async () => {
    try {
      const d = await (await fetch(`${API}/api/start`, { method: 'POST' })).json()
      if (d.status === 'started' || d.status === 'already_running') {
        setRunning(true)
        if (d.status === 'started') setCounts({})
      }
    } catch { }
  }

  const stop = async () => {
    setRunning(false)
    try { await fetch(`${API}/api/stop`, { method: 'POST' }) } catch { }
  }

  // Derived: sorted video entries + total
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  const maxCount = Math.max(1, ...entries.map(([, v]) => v.count))
  const total = entries.reduce((s, [, v]) => s + v.count, 0)

  return (
    <div className="root">

      {/* ── Header ── */}
      <header className="hdr">
        <span className="hdr-icon"></span>
        <span className="hdr-title">Traffic Control System</span>
        <div className="hdr-right">
          <div className="tabs-container">
            <button className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
              📹 LIVE VIDEO
            </button>
            <button className={`tab-btn ${activeTab === 'sim' ? 'active' : ''}`} onClick={() => setActiveTab('sim')}>
              3D SIMULATOR
            </button>
            <button className={`tab-btn ${activeTab === 'predict' ? 'active' : ''}`} onClick={() => setActiveTab('predict')}>
              📈 PREDICTION
            </button>
          </div>

          <span className={`dot ${wsOk ? 'green' : 'grey'}`} title={wsOk ? 'WS connected' : 'WS disconnected'} style={{ marginLeft: '16px' }} />
          <span className="dot-label">{wsOk ? 'Live' : 'Offline'}</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="body">
        {activeTab === 'live' && (
          <LiveFeedTab
            running={running}
            streamState={streamState}
            start={start}
            stop={stop}
            VIDEO={VIDEO}
            wsOk={wsOk}
            entries={entries}
            counts={counts}
            maxCount={maxCount}
            wsSignals={wsSignals}
            total={total}
            setCounts={setCounts}
            logs={logs}
            signalTime={signalTime}
            signalNext={signalNext}
          />
        )}

        <div style={{ display: activeTab === 'predict' ? 'contents' : 'none' }}>
          <PredictionTab
            predictionData={predictionData}
            wsSignals={wsSignals}
            trafficStats={trafficStats}
            simRunning={simRunning}
            aiDecision={aiDecision}
            isEmergency={isEmergency}
            signalTime={signalTime}
            signalNext={signalNext}
            signalNextReason={signalNextReason}
            bkWaitTimes={waitTimes}
            signalMode={signalMode}
            manualOverride={manualOverride}
          />
        </div>

        <div style={{ display: activeTab === 'sim' ? 'contents' : 'none' }}>
          <SimulatorTab
            simRunning={simRunning}
            setSimRunning={setSimRunning}
            running={running}
            start={start}
            stop={stop}
            trafficStats={trafficStats}
            setTrafficStats={setTrafficStats}
            counts={counts}
            wsSignals={wsSignals}
            signalTime={signalTime}
            signalNext={signalNext}
            signalNextReason={signalNextReason}
            signalMode={signalMode}
            setSignalMode={setSignalMode}
            aiDecision={aiDecision}
            isEmergency={isEmergency}
            waitTimes={waitTimes}
          />
        </div>
      </div>
    </div>
  )
}
