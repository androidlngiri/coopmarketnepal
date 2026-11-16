// Bikram Sambat (BS) <-> Gregorian (AD) Date Utility & Nepali Formatting
// Supports Asia/Kathmandu timezone, Devanagari numerals, NPR currency, and full 2030-2090 BS <-> AD conversion

const BS_MONTH_DAYS: Record<number, number[]> = {
  2030: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2031: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2032: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2033: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2034: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2035: [31, 31, 32, 32, 30, 31, 30, 29, 30, 29, 30, 30],
  2036: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2037: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2038: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2039: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2050: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2051: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2052: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2053: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2054: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2055: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2056: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2057: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2058: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2059: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2060: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2061: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2062: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2063: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2064: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2065: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2066: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2067: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2068: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2071: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2073: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2074: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2088: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2089: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

// Anchor: 2021-04-14 AD = 2078-01-01 BS
const ANCHOR_AD_UTC = Date.UTC(2021, 3, 14);
const ANCHOR_BS_YEAR = 2078;
const DAY_MS = 24 * 60 * 60 * 1000;

function sumBsYearDays(year: number): number {
  const months = BS_MONTH_DAYS[year];
  if (!months) return 0;
  return months.reduce((acc, d) => acc + d, 0);
}

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

export function fromNepaliDigits(input: string): string {
  return String(input).replace(/[०-९]/g, (ch) => {
    const idx = NEPALI_DIGITS.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
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
  let targetUtc: number;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-').map(Number);
    targetUtc = Date.UTC(y, m - 1, d);
    const check = new Date(targetUtc);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return null;
    }
  } else {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (Number.isNaN(d.getTime())) return null;
    const ktmMs = d.getTime() + (5 * 60 + 45) * 60 * 1000;
    const ktmDate = new Date(ktmMs);
    targetUtc = Date.UTC(ktmDate.getUTCFullYear(), ktmDate.getUTCMonth(), ktmDate.getUTCDate());
  }

  let diffDays = Math.floor((targetUtc - ANCHOR_AD_UTC) / DAY_MS);

  if (diffDays >= 0) {
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

  let bsYear = ANCHOR_BS_YEAR - 1;
  while (BS_MONTH_DAYS[bsYear]) {
    const yrDays = sumBsYearDays(bsYear);
    diffDays += yrDays;
    if (diffDays >= 0) {
      const months = BS_MONTH_DAYS[bsYear];
      for (let m = 0; m < 12; m++) {
        const daysInMonth = months[m];
        if (diffDays < daysInMonth) {
          return { year: bsYear, month: m + 1, day: diffDays + 1 };
        }
        diffDays -= daysInMonth;
      }
    }
    bsYear--;
  }
  return null;
}

export function bsToAd(year: number, month: number, day: number): string | null {
  const months = BS_MONTH_DAYS[year];
  if (!months) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const maxDay = months[month - 1];
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return null;

  let offsetDays = 0;
  if (year >= ANCHOR_BS_YEAR) {
    for (let y = ANCHOR_BS_YEAR; y < year; y++) {
      offsetDays += sumBsYearDays(y);
    }
  } else {
    for (let y = year; y < ANCHOR_BS_YEAR; y++) {
      offsetDays -= sumBsYearDays(y);
    }
  }

  for (let m = 0; m < month - 1; m++) {
    offsetDays += months[m];
  }
  offsetDays += day - 1;

  return new Date(ANCHOR_AD_UTC + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export function formatBsIso(bs: { year: number; month: number; day: number }, nepaliDigits = true): string {
  const y = String(bs.year).padStart(4, '0');
  const m = String(bs.month).padStart(2, '0');
  const d = String(bs.day).padStart(2, '0');
  const iso = `${y}-${m}-${d}`;
  return nepaliDigits ? toNepaliDigits(iso) : iso;
}

export function adStringToBsString(adDateStr: string, nepaliDigits = true): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adDateStr.trim())) return null;
  const bs = adToBs(adDateStr.trim());
  if (!bs) return null;
  return formatBsIso(bs, nepaliDigits);
}

export function parseBsDateInput(input: string): { year: number; month: number; day: number } | null {
  const ascii = fromNepaliDigits(input).trim();
  const match = ascii.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ad = bsToAd(year, month, day);
  if (!ad) return null;
  return { year, month, day };
}

export function bsStringToAdString(bsDateStr: string): string | null {
  const parsed = parseBsDateInput(bsDateStr);
  if (!parsed) return null;
  return bsToAd(parsed.year, parsed.month, parsed.day);
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
