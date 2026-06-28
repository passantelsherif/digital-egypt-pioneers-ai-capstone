import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import LangToggle   from '../components/LangToggle'
import LetterBuffer from '../components/LetterBuffer'
import styles from './SignToText.module.css'

const STREAK_THRESHOLD = 10    // frames to hold a sign
const GRACE_FRAMES     = 4     // frames of "nothing" before streak resets
const WS_URL           = 'ws://localhost:8000/ws/sign-to-text'

export default function SignToText() {
  const nav = useNavigate()

  useEffect(() => {
    console.log("✅ NEW FRONTEND VERSION LOADED (Streamlit Pipeline Active)");
  }, []);

  const [lang,         setLang]         = useState('en')
  const [cameraOn,     setCameraOn]     = useState(false)
  const [detected,     setDetected]     = useState(null)
  const [conf,         setConf]         = useState(0)
  const [textBuffer,   setTextBuffer]   = useState('')
  const [streakLetter, setStreakLetter] = useState(null)
  const [streakCount,  setStreakCount]  = useState(0)

  const videoRef      = useRef(null)
  const annotatedRef  = useRef(null)   // <img> showing server-annotated frame
  const wsRef         = useRef(null)
  const streamRef     = useRef(null)
  const sendCanvas    = useRef(document.createElement('canvas'))

  // Streak state in a ref so it's always current inside the WS callback
  const streakRef = useRef({ letter: null, count: 0, grace: 0 })
  const sending   = useRef(false)

  const handleMessage = useCallback((data) => {
    // We received a reply from the server, so we can send the next frame!
    sending.current = false

    const { letter, conf, annotated_frame } = data

    // Show the server-rendered frame with green dots directly
    if (annotatedRef.current && annotated_frame) {
      annotatedRef.current.src = 'data:image/jpeg;base64,' + annotated_frame
    }

    setDetected(letter)
    setConf(conf || 0)

    const sk = streakRef.current

    if (letter) {
      sk.grace = 0   // reset grace period

      if (letter === sk.letter) {
        sk.count += 1
      } else {
        // New letter — start fresh streak
        sk.letter = letter
        sk.count  = 1
      }

      if (sk.count >= STREAK_THRESHOLD) {
        sk.count = 0   // reset so same letter needs re-hold

        const action = letter.toLowerCase()
        if (action === 'space') {
          setTextBuffer(b => b + ' ')
        } else if (action === 'del' || action === 'delete') {
          setTextBuffer(b => b.slice(0, -1))
        } else {
          setTextBuffer(b => b + letter.toUpperCase())
        }
      }
    } else {
      // No confident prediction — use grace period before resetting streak
      sk.grace += 1
      if (sk.grace >= GRACE_FRAMES) {
        sk.letter = null
        sk.count  = 0
        sk.grace  = 0
      }
    }

    setStreakLetter(sk.letter)
    setStreakCount(sk.count)
  }, [])

  useEffect(() => {
    if (!cameraOn) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
      // Clear the annotated image
      if (annotatedRef.current) annotatedRef.current.src = ''
      setDetected(null)
      setStreakLetter(null)
      setStreakCount(0)
      streakRef.current = { letter: null, count: 0, grace: 0 }
      return
    }

    const sc  = sendCanvas.current
    sc.width  = 640
    sc.height = 480

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream

        const ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          const interval = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN || sending.current) return
            if (!videoRef.current) return
            sending.current = true
            const ctx = sc.getContext('2d')
            const videoWidth  = videoRef.current.videoWidth  || 640
            const videoHeight = videoRef.current.videoHeight || 480
            // Send the raw frame exactly as Streamlit does — no cropping, no mirroring
            sc.width  = videoWidth
            sc.height = videoHeight
            ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight)
            sc.toBlob(blob => {
              if (!blob) { sending.current = false; return }
              const reader = new FileReader()
              reader.onloadend = () => {
                const b64 = reader.result.split(',')[1]
                if (streakCount === 0) console.log("Sending frame to backend...");
                ws.send(JSON.stringify({ lang, frame: b64 }))
                // Do NOT set sending.current = false here.
                // We will unlock it only when the server sends a response back!
              }
              reader.readAsDataURL(blob)
            }, 'image/jpeg', 0.8)
          }, 80)   // ~12fps — enough for signs

          ws._interval = interval
          wsRef.current = ws
        }

        ws.onmessage = e => handleMessage(JSON.parse(e.data))
        ws.onerror   = e => console.error('WS error', e)
      })
      .catch(err => { console.error('Camera error', err); setCameraOn(false) })

    return () => {
      clearInterval(wsRef.current?._interval)
      streamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
    }
  }, [cameraOn, lang, handleMessage])

  const clearBuffer = () => {
    setTextBuffer('')
    streakRef.current = { letter: null, count: 0, grace: 0 }
    setStreakLetter(null)
    setStreakCount(0)
  }

  const streakPct = Math.round((streakCount / STREAK_THRESHOLD) * 100)

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <button className="btn btn-ghost" onClick={() => nav('/')}>← Back</button>
        <h1 className={styles.title}>Sign to Text</h1>
        <LangToggle lang={lang} onChange={l => { setLang(l); clearBuffer() }} />
      </div>

      <div className={styles.main}>
        {/* Camera feed — shows annotated frame from server with green dots */}
        <div className={styles.camCol}>
          <div className={styles.camWrap}>
            {/* Live video feed — visible so user sees themselves immediately */}
            <video
              ref={videoRef}
              autoPlay muted playsInline
              className={styles.video}
              style={{ transform: 'scaleX(-1)' }}
            />
            {/* Server-annotated frame with green landmark dots — overlays the video */}
            {cameraOn && (
              <img
                ref={annotatedRef}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                }}
              />
            )}
            {!cameraOn && (
              <div className={styles.camPlaceholder}>
                <span>📷</span><p>Camera is off</p>
              </div>
            )}
            {detected && (
              <div className={styles.badge}>
                <span className={styles.badgeLetter}>{detected}</span>
                <span className={styles.badgeConf}>{Math.round(conf * 100)}%</span>
              </div>
            )}
          </div>

          <button
            className={`btn ${cameraOn ? 'btn-ghost' : 'btn-primary'} ${styles.camBtn}`}
            onClick={() => setCameraOn(v => !v)}
          >
            {cameraOn ? '⏹ Stop camera' : '▶ Start camera'}
          </button>
        </div>

        {/* Buffer panel */}
        <div className={styles.rightCol}>
          <LetterBuffer
            text={textBuffer}
            streakLetter={streakLetter}
            streakPct={streakPct}
          />
          <div className={styles.controls}>
            <button className="btn btn-ghost" onClick={() => setTextBuffer(b => b.slice(0, -1))}>⌫ Delete</button>
            <button className="btn btn-ghost" onClick={clearBuffer}>🗑 Clear</button>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(textBuffer)} disabled={!textBuffer}>📋 Copy</button>
          </div>
        </div>
      </div>

      <div className={styles.tip}>
        Hold a sign steady for ~0.8s to type it &nbsp;·&nbsp;
        Sign <strong>SPACE</strong> to add a space &nbsp;·&nbsp;
        Sign <strong>DEL</strong> to delete
      </div>
    </div>
  )
}
