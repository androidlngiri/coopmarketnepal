// Phonetic Romanized Nepali -> Devanagari Unicode transliteration engine
// Lets users type naturally on a standard English QWERTY keyboard without switching OS input language.

const WORD_OVERRIDES: Record<string, string> = {
  // Cooperative & Legal terms
  sahakari: 'सहकारी',
  sahakaari: 'सहकारी',
  sanstha: 'संस्था',
  sastha: 'संस्था',
  samiti: 'समिति',
  samuha: 'समूह',
  sangh: 'संघ',
  bahuuddeshiya: 'बहुउद्देश्यीय',
  bahuuddeshya: 'बहुउद्देश्यीय',
  bahuddeshiya: 'बहुउद्देश्यीय',
  krishi: 'कृषि',
  bachat: 'बचत',
  rin: 'ऋण',
  reen: 'ऋण',
  tatha: 'तथा',
  dugdha: 'दुग्ध',
  byapar: 'व्यापार',
  vyapar: 'व्यापार',
  upabhokta: 'उपभोक्ता',
  hastakala: 'हस्तकला',
  mahila: 'महिला',
  bazar: 'बजार',
  bazaar: 'बजार',
  pasal: 'पसल',
  utpadan: 'उत्पादन',
  bikas: 'विकास',
  vikas: 'विकास',
  multipurpose: 'बहुउद्देश्यीय',
  agriculture: 'कृषि',
  limited: 'लिमिटेड',
  ltd: 'लि',
  li: 'लि',
  laltin: 'लाल्टिन',
  // Authorities & Geography
  division: 'डिभिजन',
  dibhijan: 'डिभिजन',
  karyalaya: 'कार्यालय',
  mantralaya: 'मन्त्रालय',
  bibhag: 'विभाग',
  vibhag: 'विभाग',
  nagarpalika: 'नगरपालिका',
  mahanagarpalika: 'महानगरपालिका',
  upamahanagarpalika: 'उपमहानगरपालिका',
  gaunpalika: 'गाउँपालिका',
  gaupalika: 'गाउँपालिका',
  wada: 'वडा',
  ward: 'वडा',
  tole: 'टोल',
  tol: 'टोल',
  chowk: 'चोक',
  chok: 'चोक',
  marg: 'मार्ग',
  marga: 'मार्ग',
  sadak: 'सडक',
  pradesh: 'प्रदेश',
  jilla: 'जिल्ला',
  nepal: 'नेपाल',
  kathmandu: 'काठमाडौँ',
  lalitpur: 'ललितपुर',
  bhaktapur: 'भक्तपुर',
  pokhara: 'पोखरा',
  chitwan: 'चितवन',
  butwal: 'बुटवल',
  biratnagar: 'विराटनगर',
  birgunj: 'वीरगञ्ज',
  dharan: 'धरान',
  janakpur: 'जनकपुर',
  nepalgunj: 'नेपालगञ्ज',
  dhangadhi: 'धनगढी',
  hetauda: 'हेटौँडा',
  itahari: 'इटहरी',
  ilam: 'इलाम',
  jhapa: 'झापा',
  morang: 'मोरङ',
  kaski: 'कास्की',
  rupandehi: 'रुपन्देही',
  dang: 'दाङ',
  kailali: 'कैलाली',
  kavre: 'काभ्रे',
  sagarmatha: 'सगरमाथा',
  baneshwor: 'बानेश्वर',
  baneswor: 'बानेश्वर',
  koteshwor: 'कोटेश्वर',
  kalanki: 'कलङ्की',
  chabahil: 'चाबहिल',
  patan: 'पाटन',
  maharajgunj: 'महाराजगञ्ज',
  newroad: 'न्युरोड',
  // Designations & Roles
  adhyaksha: 'अध्यक्ष',
  adhyakshya: 'अध्यक्ष',
  upadhyaksha: 'उपाध्यक्ष',
  sachib: 'सचिव',
  sachiv: 'सचिव',
  kosadhyaksha: 'कोषाध्यक्ष',
  byabasthapak: 'व्यवस्थापक',
  vyavasthapak: 'व्यवस्थापक',
  sanchalak: 'सञ्चालक',
  prabandhak: 'प्रबन्धक',
  karmachari: 'कर्मचारी',
  pratinidhi: 'प्रतिनिधि',
  sadasya: 'सदस्य',
  // Common Nepali names & surnames
  ram: 'राम',
  bahadur: 'बहादुर',
  thapa: 'थापा',
  sharma: 'शर्मा',
  adhikari: 'अधिकारी',
  poudel: 'पौडेल',
  paudel: 'पौडेल',
  gurung: 'गुरुङ',
  magar: 'मगर',
  tamang: 'तामाङ',
  rai: 'राई',
  limbu: 'लिम्बू',
  shrestha: 'श्रेष्ठ',
  maharjan: 'महर्जन',
  karki: 'कार्की',
  khadka: 'खड्का',
  bhandari: 'भण्डारी',
  bhattarai: 'भट्टराई',
  acharya: 'आचार्य',
  dahal: 'दहाल',
  dhakal: 'ढकाल',
  giri: 'गिरि',
  basnet: 'बस्नेत',
  pandey: 'पाण्डे',
  khatri: 'खत्री',
  joshi: 'जोशी',
  subedi: 'सुवेदी',
  neupane: 'न्यौपाने',
  regmi: 'रेग्मी',
  riyal: 'रियाल',
  rijal: 'रिजाल',
  prasad: 'प्रसाद',
  kumar: 'कुमार',
  kumari: 'कुमारी',
  devi: 'देवी',
  hari: 'हरि',
  shyam: 'श्याम',
  krishna: 'कृष्ण',
  sita: 'सीता',
  gita: 'गीता',
  laxmi: 'लक्ष्मी',
  nirmala: 'निर्मला',
  suman: 'सुमन',
  bimal: 'विमल',
  deepak: 'दीपक',
  dipak: 'दीपक',
  rajan: 'राजन',
  rajesh: 'राजेश',
  ramesh: 'रमेश',
  suresh: 'सुरेश',
  mahesh: 'महेश',
  ganesh: 'गणेश',
  prakash: 'प्रकाश',
  bikash: 'विकास',
  santosh: 'सन्तोष',
  sarita: 'सरिता',
  sunita: 'सुनिता',
  anita: 'अनिता',
  kabita: 'कविता',
  // Common products & units
  ghee: 'घिउ',
  ghiu: 'घिउ',
  maha: 'मह',
  chiya: 'चिया',
  coffee: 'कफी',
  chamal: 'चामल',
  dal: 'दाल',
  besan: 'बेसन',
  aalu: 'आलु',
  gundruk: 'गुन्द्रुक',
  timur: 'टिमुर',
  besar: 'बेसार',
  aduwa: 'अदुवा',
  alaichi: 'अलैँची',
  kg: 'के.जी.',
  keji: 'के.जी.',
  gram: 'ग्राम',
  liter: 'लिटर',
  litar: 'लिटर',
  packet: 'प्याकेट',
  shuddha: 'शुद्ध',
  organic: 'अर्गानिक',
  taaja: 'ताजा',
  taja: 'ताजा',
  pahadi: 'पहाडी',
  himali: 'हिमाली',
};

const INDEP_VOWELS: Array<[string, string]> = [
  ['aa', 'आ'],
  ['ee', 'ई'],
  ['ii', 'ई'],
  ['oo', 'ऊ'],
  ['uu', 'ऊ'],
  ['ai', 'ऐ'],
  ['au', 'औ'],
  ['ou', 'औ'],
  ['ri', 'ऋ'],
  ['A', 'आ'],
  ['I', 'ई'],
  ['U', 'ऊ'],
  ['a', 'अ'],
  ['i', 'इ'],
  ['u', 'उ'],
  ['e', 'ए'],
  ['o', 'ओ'],
];

const VOWEL_MATRAS: Array<[string, string]> = [
  ['aa', 'ा'],
  ['ee', 'ी'],
  ['ii', 'ी'],
  ['oo', 'ू'],
  ['uu', 'ू'],
  ['ai', 'ै'],
  ['au', 'ौ'],
  ['ou', 'ौ'],
  ['ri', 'ृ'],
  ['A', 'ा'],
  ['I', 'ी'],
  ['U', 'ू'],
  ['a', ''],
  ['i', 'ि'],
  ['u', 'ु'],
  ['e', 'े'],
  ['o', 'ो'],
];

const CONSONANTS: Array<[string, string]> = [
  ['ksh', 'क्ष'],
  ['chh', 'छ'],
  ['kh', 'ख'],
  ['gh', 'घ'],
  ['ng', 'ङ'],
  ['ch', 'च'],
  ['jh', 'झ'],
  ['yn', 'ञ'],
  ['Th', 'ठ'],
  ['Dh', 'ढ'],
  ['th', 'थ'],
  ['dh', 'ध'],
  ['ph', 'फ'],
  ['bh', 'भ'],
  ['sh', 'श'],
  ['Sh', 'ष'],
  ['tr', 'त्र'],
  ['gy', 'ज्ञ'],
  ['k', 'क'],
  ['g', 'ग'],
  ['c', 'च'],
  ['j', 'ज'],
  ['T', 'ट'],
  ['D', 'ड'],
  ['N', 'ण'],
  ['t', 'त'],
  ['d', 'द'],
  ['n', 'न'],
  ['p', 'प'],
  ['f', 'फ'],
  ['b', 'ब'],
  ['m', 'म'],
  ['y', 'य'],
  ['r', 'र'],
  ['l', 'ल'],
  ['w', 'व'],
  ['v', 'व'],
  ['s', 'स'],
  ['h', 'ह'],
  ['x', 'क्ष'],
  ['z', 'ज'],
  ['q', 'क'],
];

const NEPALI_DIGITS_MAP = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

function matchLongest(str: string, pos: number, table: Array<[string, string]>): [string, string] | null {
  for (const [key, val] of table) {
    if (str.startsWith(key, pos)) {
      return [key, val];
    }
  }
  return null;
}

function normalizeTitleCaseWord(word: string): string {
  // If user types a Title-Case word like "Thapa" or "Dahal", treat initial capital like lowercase
  // so it doesn't accidentally force retroflex T/D (ठ/ड) instead of थ/द.
  if (word.length >= 2 && word[0] >= 'A' && word[0] <= 'Z' && word[1] >= 'a' && word[1] <= 'z') {
    return word[0].toLowerCase() + word.slice(1);
  }
  return word;
}

export function transliterateRomanWord(rawWord: string): string {
  if (!rawWord) return '';
  const lower = rawWord.toLowerCase();
  if (WORD_OVERRIDES[lower]) {
    return WORD_OVERRIDES[lower];
  }

  const word = normalizeTitleCaseWord(rawWord);
  let out = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < word.length) {
    const ch = word[i];

    if (ch === '*') {
      out += 'ं';
      lastWasConsonant = false;
      i += 1;
      continue;
    }
    if (ch === '~') {
      out += 'ँ';
      lastWasConsonant = false;
      i += 1;
      continue;
    }
    if (ch === 'M') {
      out += 'ं';
      lastWasConsonant = false;
      i += 1;
      continue;
    }
    if (ch === '\\' || ch === '/') {
      if (lastWasConsonant) {
        out += '्';
        lastWasConsonant = false;
      }
      i += 1;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      out += NEPALI_DIGITS_MAP[Number(ch)] ?? ch;
      lastWasConsonant = false;
      i += 1;
      continue;
    }

    const vowelMatch = lastWasConsonant
      ? matchLongest(word, i, VOWEL_MATRAS)
      : matchLongest(word, i, INDEP_VOWELS);

    if (vowelMatch) {
      out += vowelMatch[1];
      lastWasConsonant = false;
      i += vowelMatch[0].length;
      continue;
    }

    const consMatch = matchLongest(word, i, CONSONANTS);
    if (consMatch) {
      if (lastWasConsonant) {
        out += '्';
      }
      out += consMatch[1];
      lastWasConsonant = true;
      i += consMatch[0].length;
      continue;
    }

    if (ch >= 'A' && ch <= 'Z') {
      const rest = ch.toLowerCase() + word.slice(i + 1);
      const lowerVowel = lastWasConsonant ? matchLongest(rest, 0, VOWEL_MATRAS) : matchLongest(rest, 0, INDEP_VOWELS);
      if (lowerVowel) {
        out += lowerVowel[1];
        lastWasConsonant = false;
        i += lowerVowel[0].length;
        continue;
      }
      const lowerCons = matchLongest(rest, 0, CONSONANTS);
      if (lowerCons) {
        if (lastWasConsonant) out += '्';
        out += lowerCons[1];
        lastWasConsonant = true;
        i += lowerCons[0].length;
        continue;
      }
    }

    out += ch;
    lastWasConsonant = false;
    i += 1;
  }

  return out;
}

/**
 * Generates up to 2-3 phonetic Devanagari variants (e.g. "kaji" -> ["कजि", "काजी"]) for user click-selection if helpful.
 */
export function getNepaliCandidates(rawWord: string): string[] {
  if (!rawWord) return [];
  const primary = transliterateRomanWord(rawWord);
  const candidates = new Set<string>([primary]);

  // Offer long-'aa' variant if word has single 'a' after initial consonant
  const normalized = normalizeTitleCaseWord(rawWord);
  if (/^[bcdfghjklmnpqrstvwxyz]+a[bcdfghjklmnpqrstvwxyz]/i.test(normalized)) {
    const longFirst = normalized.replace(/a/, 'aa');
    candidates.add(transliterateRomanWord(longFirst));
  }
  if (/a$/i.test(normalized) && !/aa$/i.test(normalized)) {
    candidates.add(transliterateRomanWord(normalized + 'a'));
  }

  return Array.from(candidates).slice(0, 3);
}

/**
 * Converts all ASCII Romanized words/numbers in text to Devanagari Unicode,
 * preserving existing Devanagari characters, spaces, and punctuation.
 */
export function transliterateRomanToNepali(text: string): string {
  return text.replace(/[A-Za-z0-9*~\\]+/g, (token) => transliterateRomanWord(token));
}
