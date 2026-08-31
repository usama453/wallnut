/**
 * Roman Urdu (Urdu in Latin script) is meaning- and sound-driven, not dictionary
 * English. When a line reads as Roman Urdu, deterministic spellcheck must not
 * rewrite it toward English words (e.g. "mext" → "meat").
 */

/** High-signal Roman Urdu function words, pronouns, and common verbs. */
const ROMAN_URDU_VOCAB = new Set(
  `
  mein main maine meri mere mera tum tumhari tumhara tumhare aap ap apna apni apne
  hum ham hamara hamari hamare wo woh ye yeh yahan wahan idhar udhar kahan kab kaise kyun kya
  hai hain ho hun tha the thi thee raha rahi rahe raho
  nahi nahin na haan ji han acha accha achha theek thik sahi galat
  bohat bahut boht zyada kam ab phir aur ya lekin magar par per se ko ka ki ke ne
  kuch sab koi kis kisne kisko kisne sabko sabne
  jao jaao aao aaya aaye gaye gaya gai ja raha jaa raha
  karo karna karte karta karti chahiye lagta lagti lagte pasand pyar muhabbat
  khana paani pani roti ghar duniya zindagi dil subah sham raat din
  yaar bhai behn dost salaam shukriya khair mashaallah mashallah inshaallah
  wala wali wale walay saath sath andar bahar upar neeche
  batao batana suno sunna dekho dekhna likho likhna parho parhna
  kaisa kaisi kaise kitna kitni kitne kabhi hamesha aksar shayad zaroor bilkul
  liye dena dene karna karni karne walay waly kay
  `.split(/\s+/).filter(Boolean),
);

/** Roman Urdu tokens that collide with common English words — cannot trigger detection alone. */
const WEAK_ROMAN_URDU_HOMOGRAPHS = new Set([
  "the",
  "thi",
  "tha",
  "thee",
  "main",
  "mein",
  "per",
  "par",
  "ya",
  "ho",
  "hum",
  "ham",
  "kam",
  "sab",
  "din",
  "ji",
  "han",
  "haan",
  "na",
  "ka",
  "ki",
  "ke",
  "ko",
  "se",
  "ne",
  "wo",
  "ye",
  "yeh",
  "aur",
  "ab",
]);

function countRomanUrduMarkers(words: string[]): { strong: number; weak: number } {
  let strong = 0;
  let weak = 0;
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/'s$/, "");
    if (!ROMAN_URDU_VOCAB.has(w)) continue;
    if (WEAK_ROMAN_URDU_HOMOGRAPHS.has(w)) weak++;
    else strong++;
  }
  return { strong, weak };
}

/** Per-line flags aligned with `text.split("\n")`. */
export function detectRomanUrduLines(text: string): boolean[] {
  return text.replace(/\r/g, "").split("\n").map(isRomanUrduLine);
}

export function hasRomanUrduContent(text: string): boolean {
  return detectRomanUrduLines(text).some(Boolean);
}

/** Roman Urdu tokens should never be "corrected" to English by spellcheck. */
export function isRomanUrduToken(word: string): boolean {
  const w = word.toLowerCase().replace(/'s$/, "");
  return ROMAN_URDU_VOCAB.has(w);
}

/**
 * True when a line likely mixes Roman Urdu (sound/meaning) rather than formal
 * English copy. One strong marker in a short caption is enough.
 */
export function isRomanUrduLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const words = trimmed.match(/[a-z']+/gi) ?? [];
  if (words.length === 0) return false;

  const { strong: strongMarkers, weak: weakMarkers } = countRomanUrduMarkers(words);

  if (strongMarkers >= 2) return true;
  if (strongMarkers >= 1 && words.length <= 8) return true;
  if (strongMarkers >= 1 && weakMarkers >= 1 && words.length <= 12) return true;

  // Roman Urdu captions often mix helper words with non-English tokens — but English
  // copy with "the" plus typos must not be skipped (weak homographs alone are not enough).
  if (strongMarkers >= 1) {
    const nonEnglishish = words.filter((w) => !looksEnglishish(w)).length;
    if (nonEnglishish >= 2 && nonEnglishish / words.length >= 0.4) return true;
  }

  return false;
}

/** Whether to dictionary-spellcheck this token on a Roman-Urdu-heavy line. */
export function shouldSpellcheckToken(word: string, romanUrduLine: boolean): boolean {
  if (isRomanUrduToken(word)) return false;
  if (!romanUrduLine) return true;
  return looksEnglishish(word);
}

/** Loose check — avoids importing the full spellcheck dictionary. */
export function looksEnglishish(word: string): boolean {
  const w = word.toLowerCase().replace(/'s$/, "");
  if (w.length <= 2) return true;
  if (/^(un|re|pre|post|non)/.test(w) && w.length > 5) return true;
  if (ENGLISH_MARKETING.has(w)) return true;
  // Common English endings in ad copy
  if (/(?:tion|sion|ment|ness|less|able|ible|ing|ed|ly|est|ful|ous|ive|ity|ally)$/.test(w)) {
    return true;
  }
  return false;
}

const ENGLISH_MARKETING = new Set(
  `
  the and for you your our new sale deal off free buy now today limited offer shop order
  click link bio instagram facebook whatsapp get save best hot fresh quality premium
  special edition weekend daily flash price discount percent off upto up to call visit
  website email phone address delivery shipping returns terms conditions privacy policy
  `.split(/\s+/).filter(Boolean),
);
