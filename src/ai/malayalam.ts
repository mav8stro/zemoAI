const ML_PHRASES: Record<string, string> = {
  'hello': 'നമസ്കാരം (Namaskaram)',
  'hi': 'ഹലോ, ഞാൻ സെമോ ആണ് (Hello, njan Zemo aanu)',
  'at your service': 'നിങ്ങളുടെ സേവനത്തിൽ ഞാൻ തയ്യാറാണ് (At your service)',
  'online': 'ഓൺലൈൻ (Online)',
  'offline': 'ഓഫ്‌ലൈൻ (Offline)',
  'analyzing': 'പരിശോധിക്കുന്നു (Parisodhikkunnu)',
  'system ready': 'സിസ്റ്റം സജ്ജമാണ് (System sajjamannu)',
  'what can i do for you': 'നിങ്ങൾക്ക് എന്താണ് ഞാൻ ചെയ്തു തരേണ്ടത്? (Enthaanu vendath?)',
  'opening': 'തുറക്കുന്നു (Thurakkunnu)',
  'success': 'വിജയകരം (Vijayathode poorthiyayi)',
  'error': 'തടസ്സം നേരിട്ടു (Thadasam nerittu)',
  'done': 'പൂർത്തിയായി (Poorthiyayi)',
  'searching': 'തിരയുന്നു (Thirayunnu)',
  'opening whatsapp for you now.': 'വാട്സ്ആപ്പ് ഇപ്പോൾ തുറക്കുന്നു (WhatsApp ippol thurakkunnu).',
  'powering down zemo systems. goodbye, boss.': 'സിസ്റ്റം പവർ ഓഫ് ചെയ്യുന്നു. നന്ദി, വിട.',
  'entering standby sleep mode.': 'സ്റ്റാൻഡ്ബൈ സ്ലീപ്പ് മോഡിലേക്ക് മാറുന്നു.'
};

export function toMalayalamSpeech(text: string): string {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  for (const [key, val] of Object.entries(ML_PHRASES)) {
    if (lower === key || lower.startsWith(key)) {
      return val;
    }
  }
  if (/[\u0D00-\u0D7F]/.test(clean)) {
    return clean;
  }
  return `ഉത്തരം: ${clean}`;
}

export function speakMalayalam(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const mlText = toMalayalamSpeech(text);
  const utter = new SpeechSynthesisUtterance(mlText);
  const voices = window.speechSynthesis.getVoices();
  const mlVoice = voices.find(v => v.lang.startsWith('ml') || v.name.toLowerCase().includes('malayalam') || v.lang.includes('IN'));
  if (mlVoice) {
    utter.voice = mlVoice;
  }
  utter.rate = 0.95;
  utter.pitch = 1.0;
  if (onEnd) {
    utter.onend = () => onEnd();
    utter.onerror = () => onEnd();
  }
  window.speechSynthesis.speak(utter);
}
