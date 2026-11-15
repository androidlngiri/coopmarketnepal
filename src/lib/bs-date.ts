// Bikram Sambat (BS) <-> Gregorian (AD) Date Utility & Nepali Formatting
// Supports Asia/Kathmandu timezone, Devanagari numerals, NPR currency, and BS calendar dates

const BS_MONTH_DAYS: Record<number, number[]> = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

// Anchor: 2021-04-14 AD = 2078-01-01 BS
const ANCHOR_AD_UTC = Date.UTC(2021, 3, 14);
const ANCHOR_BS_YEAR = 2078;

export const BS_MONTHS_NE = [
  'वैशाख',
  'जेठ',
  'असार',
  'साउन',
  'भदौ',
  'असोज',
  'कार्तिक',
  'मंसिर',
  'पुस',
  'माघ',
  'फागुन',
  'चैत',
];

export const BS_MONTHS_EN = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];

const NEPALI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toNepaliDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => NEPALI_DIGITS[Number(d)] ?? d);
}

export function formatNPR(amount: number, lang: 'ne' | 'en' = 'ne'): string {
  const num = Number(amount || 0);
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return lang === 'ne' ? `रु. ${toNepaliDigits(formatted)}` : `NPR ${formatted}`;
}

export function adToBs(dateInput: string | Date): { year: number; month: number; day: number } | null {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return null;

  // Convert to Asia/Kathmandu (+05:45)
  const ktmMs = d.getTime() + (5 * 60 + 45) * 60 * 1000;
  const ktmDate = new Date(ktmMs);
  const targetUtc = Date.UTC(ktmDate.getUTCFullYear(), ktmDate.getUTCMonth(), ktmDate.getUTCDate());

  let diffDays = Math.floor((targetUtc - ANCHOR_AD_UTC) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return null;

  let bsYear = ANCHOR_BS_YEAR;
  while (BS_MONTH_DAYS[bsYear]) {
    const months = BS_MONTH_DAYS[bsYear];
    for (let m = 0; m < 12; m++) {
      const daysInMonth = months[m];
      if (diffDays < daysInMonth) {
        return { year: bsYear, month: m + 1, day: diffDays + 1 };
      }
      diffDays -= daysInMonth;
    }
    bsYear++;
  }
  return null;
}

export function formatDateBS(dateInput: string | Date, lang: 'ne' | 'en' = 'ne'): string {
  const bs = adToBs(dateInput);
  if (!bs) {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (Number.isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString(lang === 'ne' ? 'ne-NP' : 'en-US', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (lang === 'ne') {
    return `${toNepaliDigits(bs.year)} ${BS_MONTHS_NE[bs.month - 1]} ${toNepaliDigits(bs.day)}`;
  }
  return `${bs.year} ${BS_MONTHS_EN[bs.month - 1]} ${bs.day} BS`;
}

export const NEPAL_PROVINCES: Record<string, { ne: string; en: string; districts: string[] }> = {
  'कोशी प्रदेश': {
    ne: 'कोशी प्रदेश',
    en: 'Koshi Province',
    districts: ['इलाम', 'झापा', 'मोरङ', 'सुनसरी', 'धनकुटा', 'ताप्लेजुङ', 'भोजपुर', 'उदयपुर', 'संखुवासभा', 'ओखलढुंगा', 'सोलुखुम्बु', 'खोटाङ', 'तेह्रथुम', 'पाँचथर'],
  },
  'मधेश प्रदेश': {
    ne: 'मधेश प्रदेश',
    en: 'Madhesh Province',
    districts: ['पर्सा', 'बारा', 'रौतहट', 'सर्लाही', 'महोत्तरी', 'धनुषा', 'सिरहा', 'सप्तरी'],
  },
  'बागमती प्रदेश': {
    ne: 'बागमती प्रदेश',
    en: 'Bagmati Province',
    districts: ['काठमाडौँ', 'ललितपुर', 'भक्तपुर', 'काभ्रेपलाञ्चोक', 'चितवन', 'मकवानपुर', 'धादिङ', 'नुवाकोट', 'सिन्धुपाल्चोक', 'दोलखा', 'रामेछाप', 'सिन्धुली', 'रसुवा'],
  },
  'गण्डकी प्रदेश': {
    ne: 'गण्डकी प्रदेश',
    en: 'Gandaki Province',
    districts: ['कास्की', 'गोरखा', 'लमजुङ', 'तनहुँ', 'स्याङ्जा', 'पर्वत', 'बागलुङ', 'म्याग्दी', 'मुस्ताङ', 'मनाङ', 'नवलपुर'],
  },
  'लुम्बिनी प्रदेश': {
    ne: 'लुम्बिनी प्रदेश',
    en: 'Lumbini Province',
    districts: ['रुपन्देही', 'पाल्पा', 'गुल्मी', 'अर्घाखाँची', 'कपिलवस्तु', 'दाङ', 'बाँके', 'बर्दिया', 'प्युठान', 'रोल्पा', 'पूर्वी रुकुम', 'परासी'],
  },
  'कर्णाली प्रदेश': {
    ne: 'कर्णाली प्रदेश',
    en: 'Karnali Province',
    districts: ['सुर्खेत', 'जुम्ला', 'दैलेख', 'सल्यान', 'कालिकोट', 'मुगु', 'डोल्पा', 'हुम्ला', 'जाजरकोट', 'पश्चिम रुकुम'],
  },
  'सुदूरपश्चिम प्रदेश': {
    ne: 'सुदूरपश्चिम प्रदेश',
    en: 'Sudurpashchim Province',
    districts: ['कैलाली', 'कञ्चनपुर', 'डडेल्धुरा', 'डोटी', 'अछाम', 'बाजुरा', 'बझाङ', 'बैतडी', 'दार्चुला'],
  },
};
