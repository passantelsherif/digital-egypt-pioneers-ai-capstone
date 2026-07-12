import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import LangToggle   from '../components/LangToggle'
import LetterBuffer from '../components/LetterBuffer'
import { useApp }   from '../context/AppContext'
import styles from './SignToText.module.css'

const STREAK_THRESHOLD = 10    // frames to hold a sign
const GRACE_FRAMES     = 4     // frames of "nothing" before streak resets
const WS_URL           = 'ws://localhost:8000/ws/sign-to-text'

// Maps ARSL model labels → Arabic characters
const AR_LABEL_TO_CHAR = {
  ain:   'ع',
  al:    'ال',
  aleff: 'أ',
  bb:    'ب',
  dal:   'د',
  dha:   'ظ',
  dhad:  'ض',
  fa:    'ف',
  gaaf:  'ق',
  ghain: 'غ',
  ha:    'ه',
  haa:   'ح',
  jeem:  'ج',
  kaaf:  'ك',
  khaa:  'خ',
  la:    'لا',
  laam:  'ل',
  meem:  'م',
  nun:   'ن',
  ra:    'ر',
  saad:  'ص',
  seen:  'س',
  sheen: 'ش',
  ta:    'ط',
  taa:   'ت',
  thaa:  'ث',
  thal:  'ذ',
  toot:  'ة',
  waw:   'و',
  ya:    'ى',
  yaa:   'ي',
  zay:   'ز',
}

export default function SignToText() {
  const nav = useNavigate()
  const { uiLang, t } = useApp()

  const [lang,         setLang]         = useState(() => uiLang)
  const [cameraOn,     setCameraOn]     = useState(false)
  const [detected,     setDetected]     = useState(null)
  const [conf,         setConf]         = useState(0)
  const [textBuffer,   setTextBuffer]   = useState('')
  const [streakLetter, setStreakLetter] = useState(null)
  const [streakCount,  setStreakCount]  = useState(0)

  const videoRef      = useRef(null)
  const wsRef         = useRef(null)
  const streamRef     = useRef(null)
  const sendCanvas    = useRef(document.createElement('canvas'))

  // Streak state in a ref so it's always current inside the WS callback
  const streakRef = useRef({ letter: null, count: 0, grace: 0 })
  const sending   = useRef(false)
  // Language ref — keeps handleMessage up-to-date without re-registering it
  const langRef   = useRef(lang)
  useEffect(() => { langRef.current = lang }, [lang])

  const handleMessage = useCallback((data) => {
    // We received a reply from the server, so we can send the next frame!
    sending.current = false

    const { letter, conf } = data

    // For Arabic mode, map the model's English label to the actual Arabic character
    const displayLetter = (letter && langRef.current === 'ar')
      ? (AR_LABEL_TO_CHAR[letter.toLowerCase()] ?? letter)
      : letter

    setDetected(displayLetter)
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
          setTextBuffer(b => b + (displayLetter ?? letter))
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
        <button className="btn btn-ghost" onClick={() => nav('/')}>{t.back}</button>
        <h1 className={styles.title}>{t.s2t_title}</h1>
        <LangToggle lang={lang} onChange={l => { setLang(l); clearBuffer() }} />
      </div>

      <div className={styles.main}>
        {/* Camera feed — shows annotated frame from server with green dots */}
        <div className={styles.camCol}>
          <div className={styles.camWrap}>
            {/* Live video feed */}
            <video
              ref={videoRef}
              autoPlay muted playsInline
              className={styles.video}
              style={{ transform: 'scaleX(-1)' }}
            />
            {!cameraOn && (
              <div className={styles.camPlaceholder}>
                <span>📷</span><p>{t.cameraOff}</p>
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
            {cameraOn ? t.stopCamera : t.startCamera}
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
            <button className="btn btn-ghost" onClick={() => setTextBuffer(b => b.slice(0, -1))}>{t.delete}</button>
            {lang === 'ar' && (
              <button className="btn btn-ghost" onClick={() => setTextBuffer(b => b + ' ')}>{t.space}</button>
            )}
            <button className="btn btn-ghost" onClick={clearBuffer}>{t.clear}</button>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(textBuffer)} disabled={!textBuffer}>{t.copy}</button>
          </div>
        </div>
      </div>

      <div className={styles.tip}>{t.tip}</div>
    </div>
  )
}
