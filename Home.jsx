import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import styles from './Home.module.css'

const fade = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

export default function Home() {
  const nav = useNavigate()
  return (
    <div className={styles.root}>
      {/* Background glow */}
      <div className={styles.glow} />

      <motion.div
        className={styles.hero}
        variants={{ show: { transition: { staggerChildren: 0.12 } } }}
        initial="hidden" animate="show"
      >
        <motion.div className={styles.badge} variants={fade}>
          🤟 Sign Language Bridge
        </motion.div>

        <motion.h1 className={styles.title} variants={fade}>
          Sawa
        </motion.h1>

        <motion.p className={styles.sub} variants={fade}>
          Bridging communication through sign language —<br />
          supporting both Arabic and English alphabets.
        </motion.p>

        <motion.div className={styles.cards} variants={fade}>
          {/* Sign to Text */}
          <button className={styles.card} onClick={() => nav('/sign-to-text')}>
            <div className={styles.cardIcon}>
              <CameraIcon />
            </div>
            <div className={styles.cardBody}>
              <h2>Sign to Text</h2>
              <p>Show a hand sign on camera — the app reads it and builds words in real time.</p>
            </div>
            <div className={styles.cardArrow}>→</div>
          </button>

          {/* Text to Sign */}
          <button className={styles.card} onClick={() => nav('/text-to-sign')}>
            <div className={styles.cardIcon}>
              <KeyboardIcon />
            </div>
            <div className={styles.cardBody}>
              <h2>Text to Sign</h2>
              <p>Type any word and watch an animated hand skeleton show each letter's sign.</p>
            </div>
            <div className={styles.cardArrow}>→</div>
          </button>
        </motion.div>

        <motion.p className={styles.foot} variants={fade}>
          Arabic · English · Real-time · Privacy-first
        </motion.p>
      </motion.div>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
    </svg>
  )
}
