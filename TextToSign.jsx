import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LangToggle   from '../components/LangToggle'
import HandSkeleton from '../components/HandSkeleton'
import styles from './TextToSign.module.css'

const API = 'http://localhost:8000'
const DELAY_MS = 1200   // ms per letter during auto-play

export default function TextToSign() {
  const nav = useNavigate()

  const [lang,    setLang]    = useState('en')
  const [input,   setInput]   = useState('')
  const [tokens,  setTokens]  = useState([])   // [{char, landmarks}]
  const [current, setCurrent] = useState(0)    // index of currently shown letter
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)

  const timerRef = useRef(null)

  // ── Fetch landmarks for each letter in the typed word ─────────────────────
  async function fetchLandmarks(text, language) {
    setLoading(true)
    const chars = text.toUpperCase().split('').filter(c => /[A-Z\u0600-\u06FF ]/.test(c))
    const results = []

    for (const ch of chars) {
      if (ch === ' ') {
        results.push({ char: 'SPACE', landmarks: [] })
        continue
      }
      try {
        const res  = await fetch(`${API}/landmarks/${language}/${encodeURIComponent(ch)}`)
        const data = await res.json()
        results.push({ char: ch, landmarks: data.found ? data.landmarks : [] })
      } catch {
        results.push({ char: ch, landmarks: [] })
      }
    }

    setTokens(results)
    setCurrent(0)
    setPlaying(false)
    setLoading(false)
  }

  // ── Auto-play ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || tokens.length === 0) return
    timerRef.current = setInterval(() => {
      setCurrent(c => {
        if (c >= tokens.length - 1) {
          setPlaying(false)
          return c
        }
        return c + 1
      })
    }, DELAY_MS)
    return () => clearInterval(timerRef.current)
  }, [playing, tokens.length])

  const handleSubmit = () => {
    if (!input.trim()) return
    fetchLandmarks(input, lang)
  }

  const currentToken = tokens[current]

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topbar}>
        <button className="btn btn-ghost" onClick={() => nav('/')}>← Back</button>
        <h1 className={styles.title}>Text to Sign</h1>
        <LangToggle lang={lang} onChange={l => { setLang(l); setTokens([]); setInput('') }} />
      </div>

      {/* Input row */}
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder={lang === 'en' ? 'Type a word… e.g. HELLO' : 'اكتب كلمة…'}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        />
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? '…' : 'Show signs'}
        </button>
        {input && (
          <button className="btn btn-ghost" onClick={() => { setInput(''); setTokens([]) }}>
            Clear
          </button>
        )}
      </div>

      {tokens.length > 0 && (
        <>
          {/* Main skeleton display */}
          <div className={styles.display}>
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.22 }}
                className={styles.skeletonCard}
              >
                <div className={styles.skeletonLabel}>
                  {currentToken?.char === 'SPACE' ? 'SPACE' : currentToken?.char}
                </div>
                <HandSkeleton
                  landmarks={currentToken?.landmarks || []}
                  size={300}
                  animated={true}
                />
                {currentToken && !currentToken.landmarks.length && currentToken.char !== 'SPACE' && (
                  <div className={styles.noData}>No landmark data for this letter</div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Progress */}
            <div className={styles.progress}>
              {current + 1} / {tokens.length}
            </div>
          </div>

          {/* Playback controls */}
          <div className={styles.controls}>
            <button className="btn btn-ghost" onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}>
              ← Prev
            </button>
            <button
              className={`btn ${playing ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => {
                if (current >= tokens.length - 1) setCurrent(0)
                setPlaying(p => !p)
              }}
            >
              {playing ? '⏸ Pause' : '▶ Auto-play'}
            </button>
            <button className="btn btn-ghost" onClick={() => setCurrent(c => Math.min(tokens.length - 1, c + 1))} disabled={current === tokens.length - 1}>
              Next →
            </button>
          </div>

          {/* Letter strip */}
          <div className={styles.strip}>
            {tokens.map((t, i) => (
              <button
                key={i}
                className={`${styles.stripTile} ${i === current ? styles.stripActive : ''} ${!t.landmarks.length && t.char !== 'SPACE' ? styles.stripMissing : ''}`}
                onClick={() => { setCurrent(i); setPlaying(false) }}
              >
                {t.char === 'SPACE' ? '·' : t.char}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {tokens.length === 0 && !loading && (
        <div className={styles.empty}>
          <span>✋</span>
          <p>Type a word above to see each letter's sign</p>
        </div>
      )}
    </div>
  )
}
