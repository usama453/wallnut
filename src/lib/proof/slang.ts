/**
 * Curated list of casual slang and Roman Urdu words (Urdu written in the Latin
 * alphabet, as commonly typed in Pakistan). Enabled via the brand profile toggle
 * "Allow slang & Roman Urdu" so marketing copy written in a casual voice is not
 * falsely flagged as typos or grammar errors.
 *
 * Roman Urdu spelling varies a lot; we include the most common variants.
 * This is a starter list — it can grow over time.
 */
export const SLANG_ROMAN_URDU = `
  haan nahi na jee ji
  aap hum tum main mein mujhe tumhe apne aapko
  mera meri mere meray hamara hamari
  aapka aapki aapke tumhara tumhari
  uska uski uske iska iski iske
  yaar bhai behen dost sajjan
  shukriya dhanyavaad dua mubarak
  zindagi dil jaan khushi gham dard
  mushkil aasan sahi theek thik achha acha achi theekha
  abhi kal aaj aj subah subha shaam raat din roz
  paisa paise paisay rupay rupaye rupee
  jaldi dair bohat bahut zyada ziada thora thora-sa kam
  kya kaise kyun kab kahan kahin kis kaun
  woh wo yeh ye is us in un
  aur bhi hai hain ho hoga hogi hote hua hui huwa
  nahin nhi nahi
  ka ke ki ko se ne tak par pe mein meyn baje bjay
  ek do teen char aadha aadhi
  kuch koi kisi kaam baat sawal jawab
  sath saath wale walay khuda wasta
  ghar ghr ammi abbu papa baji bhaiya
  pyar mohabbat yaad khayal soch
  khana khaya khao kha piya pee
  accha khoobsurat sohni sundar
  bara chhota lamba mota patla
  nikla nikle nikli nikal
  likha likhi likhe parha parhi parhe
  chal chalo chale jao jaye jayen ao aao aaye
  dekha dekho dekhe dekh
  suna suno suni sun
  bolo bola bole boli kehna
  wapas waapas phir dobara
  saala chalta karta karti karte kiya kiye kya
  man pasand dil-chahta
  kuch-kuch sab kuch bhi ho sakta
  insha-allah alhamdulillah mashallah mashaallah
  aajkal kal subah sone
  eid ramzan eid-mubarak bakra-eid shaadi shadi mehndi
  parh likh pata nahi pata
  thik hai okay acha bhai
  dil-se dil-dar dilbar
  bahut-shukriya
`.split(/\s+/).filter(Boolean);
