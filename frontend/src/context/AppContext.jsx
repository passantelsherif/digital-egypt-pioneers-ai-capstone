import { createContext, useContext, useState, useEffect } from 'react'

const AppContext = createContext(null)

// ── All UI strings ─────────────────────────────────────────────────────────────
export const T = {
  en: {
    // Home
    badge:            '🤟 Sign Language Bridge',
    homeTitle:        'Sawa',
    homeSub:          'Bridging communication through sign language —\nsupporting both Arabic and English alphabets.',
    card_s2t_title:   'Sign to Text',
    card_s2t_desc:    'Show a hand sign on camera — the app reads it and builds words in real time.',
    card_sts_title:   'Speech to Sign',
    card_sts_desc:    "Speak a word and the app transcribes it, then shows you each letter's sign.",
    foot:             'Arabic · English · Real-time · Privacy-first',

    // Shared
    back:             '← Back',
    clear:            '🗑 Clear',
    prev:             '← Prev',
    next:             'Next →',
    autoplay:         '▶ Auto-play',
    pause:            '⏸ Pause',
    noData:           'No landmark data for this letter',
    showSigns:        'Show signs',

    // Sign to Text
    s2t_title:        'Sign to Text',
    startCamera:      '▶ Start camera',
    stopCamera:       '⏹ Stop camera',
    delete:           '⌫ Delete',
    space:            '␣ Space',
    copy:             '📋 Copy',
    cameraOff:        'Camera is off',
    tip:              'Hold a sign steady for ~0.8s to type it · Sign SPACE to add a space · Sign DEL to delete',

    // Speech to Sign
    sts_title:        '🎙️ Speech to Sign',
    startRec:         '🎙️ Start Recording',
    stopRec:          '⏹ Stop Recording',
    recording:        '🔴 Recording…',
    transcribing:     '⏳ Transcribing…',
    uploadLabel:      '— or upload an audio file —',
    manualLabel:      '— or type manually —',
    manualPlaceholder:'e.g. hello',
    dragDrop:         'Drag & drop or browse — mp3, wav, m4a, ogg…',
    stsEmpty:         'Record your voice, upload an audio file, or type a word to see the signs',
  },

  ar: {
    // Home
    badge:            '🤟 جسر لغة الإشارة',
    homeTitle:        'سوا',
    homeSub:          'نجسر التواصل من خلال لغة الإشارة —\nندعم الأبجدية العربية والإنجليزية.',
    card_s2t_title:   'إشارة إلى نص',
    card_s2t_desc:    'أظهر إشارة يدوية أمام الكاميرا — يقرأها التطبيق ويبني الكلمات فورياً.',
    card_sts_title:   'صوت إلى إشارة',
    card_sts_desc:    'انطق كلمة وسيحوّلها التطبيق إلى نص ثم يعرض لك إشارة كل حرف.',
    foot:             'عربي · إنجليزي · فوري · الخصوصية أولاً',

    // Shared
    back:             'رجوع →',
    clear:            '🗑 مسح',
    prev:             'السابق →',
    next:             '← التالي',
    autoplay:         '▶ تشغيل تلقائي',
    pause:            '⏸ إيقاف',
    noData:           'لا توجد بيانات لهذا الحرف',
    showSigns:        'عرض الإشارات',

    // Sign to Text
    s2t_title:        'إشارة إلى نص',
    startCamera:      '▶ تشغيل الكاميرا',
    stopCamera:       '⏹ إيقاف الكاميرا',
    delete:           '⌫ حذف',
    space:            '␣ مسافة',
    copy:             '📋 نسخ',
    cameraOff:        'الكاميرا متوقفة',
    tip:              'ابقِ الإشارة ثابتة لمدة ~٠.٨ ثانية لكتابتها · اضغط زر المسافة للفصل بين الكلمات · أشِر بـ DEL للحذف',

    // Speech to Sign
    sts_title:        '🎙️ صوت إلى إشارة',
    startRec:         '🎙️ بدء التسجيل',
    stopRec:          '⏹ إيقاف التسجيل',
    recording:        '🔴 جارٍ التسجيل…',
    transcribing:     '⏳ جارٍ النسخ…',
    uploadLabel:      '— أو ارفع ملف صوتي —',
    manualLabel:      '— أو اكتب يدوياً —',
    manualPlaceholder:'اكتب كلمة…',
    dragDrop:         'اسحب وأفلت أو تصفّح — mp3، wav، m4a، ogg…',
    stsEmpty:         'سجّل صوتك أو ارفع ملف صوتي أو اكتب كلمة لعرض الإشارات',
  },
}

// ── Provider ────────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [uiLang, setUiLang] = useState(() => localStorage.getItem('uiLang') || 'en')

  useEffect(() => {
    localStorage.setItem('uiLang', uiLang)
    // Apply RTL direction to the whole document
    document.documentElement.dir  = uiLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = uiLang
  }, [uiLang])

  const t = T[uiLang]

  return (
    <AppContext.Provider value={{ uiLang, setUiLang, t }}>
      {children}
    </AppContext.Provider>
  )
}

// ── Hook ────────────────────────────────────────────────────────────────────────
export function useApp() {
  return useContext(AppContext)
}
