import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export function getGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_MODEL;
}

function getThinkingLevelForModel(model: string): ThinkingLevel {
  return model.includes('flash-lite') ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
}

export interface GlobalCategoryChoice {
  id: string;
  slug: string;
  name_ne: string;
  name_en: string;
}

export interface AiGenerateProductInput {
  productName: string;
  language: 'ne' | 'en';
  cooperativeName?: string;
  cooperativeType?: string;
  cooperativeDistrict?: string;
  existingNotes?: string;
  knownSpecs?: string;
  unitHint?: string;
  globalCategories: GlobalCategoryChoice[];
}

export interface AiSpecificationItem {
  label: string;
  value: string;
}

export interface AiRecipeSuggestion {
  title: string;
  ingredients: string[];
  steps: string[];
}

export interface AiGeneratedProductData {
  refined_name_ne: string;
  refined_name_en: string;
  short_description_ne: string;
  short_description_en: string;
  detailed_description_ne: string;
  detailed_description_en: string;
  highlights: string[];
  suggested_category_slug: string;
  suggested_category_reason: string;
  unit_label_ne: string;
  unit_label_en: string;
  product_type_detected: string;
  known_specifications: AiSpecificationItem[];
  ingredients_or_materials: string[];
  uses_and_benefits: string[];
  preparation_or_usage: string;
  recipe_suggestions: AiRecipeSuggestion[];
  storage_instructions: string;
  handling_instructions: string;
  safety_precautions: string;
  packaging_suggestions: string;
  seo_title: string;
  seo_meta_description: string;
  search_keywords: string[];
  needs_confirmation: string[];
}

export type GeminiErrorCode =
  | 'AI_UNCONFIGURED'
  | 'AI_QUOTA_EXHAUSTED'
  | 'AI_AUTH_ERROR'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_FAILED';

export class GeminiAssistantError extends Error {
  code: GeminiErrorCode;
  httpStatus: number;

  constructor(code: GeminiErrorCode, message: string, httpStatus = 502) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const productResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    refined_name_ne: { type: Type.STRING, description: 'Clear customer-ready product name in Nepali Devanagari.' },
    refined_name_en: { type: Type.STRING, description: 'Clear customer-ready product name in English.' },
    short_description_ne: { type: Type.STRING, description: 'Concise 1-2 sentence Nepali summary.' },
    short_description_en: { type: Type.STRING, description: 'Concise 1-2 sentence English summary.' },
    detailed_description_ne: {
      type: Type.STRING,
      description: 'Natural, professional customer-friendly Nepali description (2-3 paragraphs).',
    },
    detailed_description_en: {
      type: Type.STRING,
      description: 'Natural, professional customer-friendly English description (2-3 paragraphs).',
    },
    highlights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 6 product highlights / key features in the primary requested language.',
    },
    suggested_category_slug: {
      type: Type.STRING,
      description: 'Exact slug chosen from the provided global_categories list, or empty string if none fit.',
    },
    suggested_category_reason: {
      type: Type.STRING,
      description: 'Brief explanation for why this category fits.',
    },
    unit_label_ne: { type: Type.STRING, description: 'Suggested Nepali unit label such as के.जी., लिटर, प्याकेट, थान.' },
    unit_label_en: { type: Type.STRING, description: 'Suggested English unit label such as kg, liter, pack, piece.' },
    product_type_detected: {
      type: Type.STRING,
      description: 'Category style: agricultural, dairy, food_beverage, handicraft, textile, herbal, or general.',
    },
    known_specifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ['label', 'value'],
      },
      description:
        'Specifications ONLY when explicitly known or supplied in input/notes. Do NOT fabricate weights, prices, dates, or nutritional facts.',
    },
    ingredients_or_materials: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Primary ingredients or raw materials where clearly applicable; empty array if unknown or irrelevant.',
    },
    uses_and_benefits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Practical uses and everyday benefits, strictly avoiding unsupported medical or curative health claims.',
    },
    preparation_or_usage: {
      type: Type.STRING,
      description: 'Product-specific preparation or usage instructions.',
    },
    recipe_suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'ingredients', 'steps'],
      },
      description: 'Recipe suggestions ONLY for food/cooking/beverage items; MUST be empty [] for non-food products.',
    },
    storage_instructions: {
      type: Type.STRING,
      description: 'Specific storage and preservation guidance appropriate to this product.',
    },
    handling_instructions: {
      type: Type.STRING,
      description: 'Shipping, handling, and care instructions.',
    },
    safety_precautions: {
      type: Type.STRING,
      description: 'Relevant allergen, handling, or safety precautions.',
    },
    packaging_suggestions: {
      type: Type.STRING,
      description: 'Practical cooperative packaging and presentation recommendations.',
    },
    seo_title: { type: Type.STRING, description: 'Search-friendly title under 65 characters.' },
    seo_meta_description: { type: Type.STRING, description: 'Meta description around 120-160 characters.' },
    search_keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '5 to 10 relevant bilingual Nepali/English search keywords.',
    },
    needs_confirmation: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Explicit checklist of facts the cooperative MUST verify/fill before publishing (weight, price, harvest/expiry dates, certifications, ingredients).',
    },
  },
  required: [
    'refined_name_ne',
    'refined_name_en',
    'short_description_ne',
    'short_description_en',
    'detailed_description_ne',
    'detailed_description_en',
    'highlights',
    'suggested_category_slug',
    'suggested_category_reason',
    'unit_label_ne',
    'unit_label_en',
    'product_type_detected',
    'known_specifications',
    'ingredients_or_materials',
    'uses_and_benefits',
    'preparation_or_usage',
    'recipe_suggestions',
    'storage_instructions',
    'handling_instructions',
    'safety_precautions',
    'packaging_suggestions',
    'seo_title',
    'seo_meta_description',
    'search_keywords',
    'needs_confirmation',
  ],
};

function sanitizeStringArray(arr: unknown, max = 12): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0)
    .slice(0, max);
}

function normalizeAiPayload(
  raw: Record<string, unknown>,
  categories: GlobalCategoryChoice[]
): AiGeneratedProductData {
  const validSlugs = new Set(categories.map((c) => c.slug));
  const rawSlug = String(raw.suggested_category_slug ?? '').trim();
  const suggested_category_slug = validSlugs.has(rawSlug) ? rawSlug : '';

  const known_specifications = Array.isArray(raw.known_specifications)
    ? raw.known_specifications
        .map((item) => {
          const obj = item as Record<string, unknown>;
          return {
            label: String(obj?.label ?? '').trim(),
            value: String(obj?.value ?? '').trim(),
          };
        })
        .filter((item) => item.label.length > 0 && item.value.length > 0)
        .slice(0, 12)
    : [];

  const recipe_suggestions = Array.isArray(raw.recipe_suggestions)
    ? raw.recipe_suggestions
        .map((item) => {
          const obj = item as Record<string, unknown>;
          return {
            title: String(obj?.title ?? '').trim(),
            ingredients: sanitizeStringArray(obj?.ingredients, 12),
            steps: sanitizeStringArray(obj?.steps, 10),
          };
        })
        .filter((r) => r.title.length > 0 && (r.ingredients.length > 0 || r.steps.length > 0))
        .slice(0, 3)
    : [];

  return {
    refined_name_ne: String(raw.refined_name_ne ?? '').trim(),
    refined_name_en: String(raw.refined_name_en ?? '').trim(),
    short_description_ne: String(raw.short_description_ne ?? '').trim(),
    short_description_en: String(raw.short_description_en ?? '').trim(),
    detailed_description_ne: String(raw.detailed_description_ne ?? '').trim(),
    detailed_description_en: String(raw.detailed_description_en ?? '').trim(),
    highlights: sanitizeStringArray(raw.highlights, 8),
    suggested_category_slug,
    suggested_category_reason: String(raw.suggested_category_reason ?? '').trim(),
    unit_label_ne: String(raw.unit_label_ne ?? '').trim() || 'के.जी.',
    unit_label_en: String(raw.unit_label_en ?? '').trim() || 'kg',
    product_type_detected: String(raw.product_type_detected ?? 'general').trim(),
    known_specifications,
    ingredients_or_materials: sanitizeStringArray(raw.ingredients_or_materials, 12),
    uses_and_benefits: sanitizeStringArray(raw.uses_and_benefits, 8),
    preparation_or_usage: String(raw.preparation_or_usage ?? '').trim(),
    recipe_suggestions,
    storage_instructions: String(raw.storage_instructions ?? '').trim(),
    handling_instructions: String(raw.handling_instructions ?? '').trim(),
    safety_precautions: String(raw.safety_precautions ?? '').trim(),
    packaging_suggestions: String(raw.packaging_suggestions ?? '').trim(),
    seo_title: String(raw.seo_title ?? '').trim(),
    seo_meta_description: String(raw.seo_meta_description ?? '').trim(),
    search_keywords: sanitizeStringArray(raw.search_keywords, 12),
    needs_confirmation: sanitizeStringArray(raw.needs_confirmation, 10),
  };
}

function createGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiAssistantError(
      'AI_UNCONFIGURED',
      'AI सेवा हाल सर्भरमा कन्फिगर गरिएको छैन। कृपया म्यानुअल रूपमा विवरण भर्नुहोस्।',
      503
    );
  }

  return {
    model: getGeminiModel(),
    ai: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
  };
}

function mapGeminiRuntimeError(err: unknown, model: string): GeminiAssistantError {
  if (err instanceof GeminiAssistantError) {
    return err;
  }

  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[Gemini Error]', { model, status: status ?? null, message: msg.slice(0, 350) });

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return new GeminiAssistantError(
      'AI_QUOTA_EXHAUSTED',
      'AI सेवाको हालको अनुरोध सीमा पूरा भएको छ। तपाईं म्यानुअल रूपमा विवरण भरेर सुरक्षित गर्न सक्नुहुन्छ।',
      429
    );
  }
  if (status === 400 || status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return new GeminiAssistantError(
      'AI_AUTH_ERROR',
      'AI सेवा कुञ्जी मान्य छैन वा अनुमति अस्वीकृत भयो। कृपया म्यानुअल प्रविष्टि जारी राख्नुहोस्।',
      503
    );
  }
  if (status === 404 || /NOT_FOUND|not found/i.test(msg)) {
    return new GeminiAssistantError(
      'AI_MODEL_NOT_FOUND',
      `चयन गरिएको AI मोडेल (${model}) उपलब्ध छैन। म्यानुअल प्रविष्टि जारी राख्नुहोस्।`,
      502
    );
  }

  return new GeminiAssistantError(
    'AI_FAILED',
    'AI सहायक हाल अस्थायी रूपमा अनुपलब्ध छ। कृपया म्यानुअल रूपमा विवरण भर्नुहोस्।',
    502
  );
}

async function runStructuredGeminiPrompt<T>(params: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Schema;
  timeoutMs?: number;
}): Promise<{ parsed: T; model: string; promptTokens: number | null; outputTokens: number | null }> {
  const { ai, model } = createGeminiClient();
  const timeoutMs = params.timeoutMs ?? 45_000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
          thinkingConfig: { thinkingLevel: getThinkingLevelForModel(model) },
        },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new GeminiAssistantError(
              'AI_TIMEOUT',
              'AI प्रतिक्रिया समय समाप्त भयो। कृपया पुनः प्रयास वा म्यानुअल प्रविष्टि गर्नुहोस्।',
              504
            )
          );
        }, timeoutMs);
      }),
    ]);

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new GeminiAssistantError('AI_INVALID_OUTPUT', 'AI बाट खाली प्रतिक्रिया प्राप्त भयो।', 502);
    }

    let parsed: T;
    try {
      parsed = JSON.parse(rawText) as T;
    } catch {
      throw new GeminiAssistantError('AI_INVALID_OUTPUT', 'AI प्रतिक्रिया JSON ढाँचामा प्राप्त भएन।', 502);
    }

    const usage = response.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;

    return {
      parsed,
      model,
      promptTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null,
      outputTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
    };
  } catch (err) {
    throw mapGeminiRuntimeError(err, model);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generateProductWithGemini(input: AiGenerateProductInput): Promise<{
  data: AiGeneratedProductData;
  model: string;
  promptTokens: number | null;
  outputTokens: number | null;
}> {
  const primaryLangLabel =
    input.language === 'en'
      ? 'English (clear, natural, customer-friendly English for Nepali and international buyers; still populate *_ne fields accurately in Nepali Devanagari)'
      : 'Nepali (natural, respectful, customer-friendly Nepali Devanagari as the primary language across highlights, usage, storage, handling, safety, packaging, recipes, SEO, and confirmation checklist; also populate *_en fields accurately in English)';

  const categoryListText = input.globalCategories
    .map((c) => `- ${c.slug} (${c.name_ne} / ${c.name_en})`)
    .join('\n');

  const systemInstruction = `You are a careful product merchandising specialist for "Sahakari Bazar Nepal" (सहकारी बजार), an e-commerce platform for community cooperatives across Nepal.

STRICT ACCURACY & SAFETY RULES:
1. NEVER invent, guess, or assume:
   - Words like "Organic" / "अर्गानिक", "100% Pure", "Certified", ISO, DFTQC, Fair Trade, or GI tags unless explicitly stated in the user input
   - Manufacturing dates, harvest dates, or expiry dates
   - Net weights, volumes, prices, or batch numbers unless explicitly supplied
   - Laboratory nutritional values or chemical breakdowns
   - Undisclosed ingredients/additives
   - Unsupported medical, therapeutic, or disease-curing health claims
2. List everything the cooperative must verify (e.g., net weight, price, certification proof, expiry/batch date, ingredient/origin details) as 3-5 short items in "needs_confirmation".
3. Known specifications ("known_specifications") MUST ONLY include facts explicitly supplied in the input; otherwise return [].
4. Recipes ("recipe_suggestions"): Generate 1 concise practical recipe ONLY if the product is an edible food, spice, dairy, tea/coffee, grain, or cooking ingredient. Return an EMPTY array [] for handicrafts, textiles, fertilizers, utensils, cosmetics, or non-food items.
5. Tailor tone specifically to the product category (agricultural, dairy, food, handicraft, herbal, etc.) — avoid generic filler.
6. Primary output language: ${primaryLangLabel}. Keep content crisp and scannable: write the primary detailed description in 2 concise paragraphs (~70-120 words), keep the secondary-language detailed description to 2 concise sentences, keep list bullets short, and complete concisely so merchants can review quickly.`;

  const userPrompt = [
    `Product Name Input: ${input.productName}`,
    input.cooperativeName ? `Cooperative Name: ${input.cooperativeName}` : null,
    input.cooperativeType ? `Cooperative Type: ${input.cooperativeType}` : null,
    input.cooperativeDistrict ? `Origin District: ${input.cooperativeDistrict}` : null,
    input.unitHint ? `Unit Hint: ${input.unitHint}` : null,
    input.knownSpecs ? `Known Specifications Supplied by Store:\n${input.knownSpecs}` : null,
    input.existingNotes ? `Additional Cooperative Notes:\n${input.existingNotes}` : null,
    `\nAvailable Global Categories (choose exact slug or leave empty):\n${categoryListText}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { parsed, model, promptTokens, outputTokens } = await runStructuredGeminiPrompt<Record<string, unknown>>({
    systemInstruction,
    userPrompt,
    responseSchema: productResponseSchema,
  });

  return {
    data: normalizeAiPayload(parsed, input.globalCategories),
    model,
    promptTokens,
    outputTokens,
  };
}

export interface AiCoopPrefillSource {
  title: string;
  url: string;
}

export interface AiCoopPrefillResult {
  name_ne: string;
  name_en: string;
  registration_number: string;
  registration_authority: string;
  registration_date_ad: string;
  registration_date_bs: string;
  cooperative_type: string;
  pan_vat_number: string;
  province: string;
  district: string;
  municipality: string;
  ward_number: string;
  tole_address: string;
  contact_email: string;
  contact_phone: string;
  authorized_rep_name: string;
  authorized_rep_designation: string;
  requested_store_name: string;
  requested_slug: string;
  research_summary: string;
  sources: AiCoopPrefillSource[];
}

const NEPAL_PROVINCE_DISTRICTS: Record<string, string[]> = {
  'कोशी प्रदेश': ['इलाम', 'झापा', 'मोरङ', 'सुनसरी', 'धनकुटा', 'ताप्लेजुङ', 'भोजपुर', 'उदयपुर', 'संखुवासभा', 'ओखलढुंगा', 'सोलुखुम्बु', 'खोटाङ', 'तेह्रथुम', 'पाँचथर'],
  'मधेश प्रदेश': ['पर्सा', 'बारा', 'रौतहट', 'सर्लाही', 'महोत्तरी', 'धनुषा', 'सिरहा', 'सप्तरी'],
  'बागमती प्रदेश': ['काठमाडौँ', 'ललितपुर', 'भक्तपुर', 'काभ्रेपलाञ्चोक', 'चितवन', 'मकवानपुर', 'धादिङ', 'नुवाकोट', 'सिन्धुपाल्चोक', 'दोलखा', 'रामेछाप', 'सिन्धुली', 'रसुवा'],
  'गण्डकी प्रदेश': ['कास्की', 'गोरखा', 'लमजुङ', 'तनहुँ', 'स्याङ्जा', 'पर्वत', 'बागलुङ', 'म्याग्दी', 'मुस्ताङ', 'मनाङ', 'नवलपुर'],
  'लुम्बिनी प्रदेश': ['रुपन्देही', 'पाल्पा', 'गुल्मी', 'अर्घाखाँची', 'कपिलवस्तु', 'दाङ', 'बाँके', 'बर्दिया', 'प्युठान', 'रोल्पा', 'पूर्वी रुकुम', 'परासी'],
  'कर्णाली प्रदेश': ['सुर्खेत', 'जुम्ला', 'दैलेख', 'सल्यान', 'कालिकोट', 'मुगु', 'डोल्पा', 'हुम्ला', 'जाजरकोट', 'पश्चिम रुकुम'],
  'सुदूरपश्चिम प्रदेश': ['कैलाली', 'कञ्चनपुर', 'डडेल्धुरा', 'डोटी', 'अछाम', 'बाजुरा', 'बझाङ', 'बैतडी', 'दार्चुला'],
};

function resolveProvinceAndDistrict(rawProv: string, rawDist: string): { province: string; district: string } {
  const cleanProv = rawProv.trim();
  const cleanDist = rawDist.trim();

  if (cleanProv && Object.prototype.hasOwnProperty.call(NEPAL_PROVINCE_DISTRICTS, cleanProv)) {
    const validDistrict = NEPAL_PROVINCE_DISTRICTS[cleanProv].includes(cleanDist) ? cleanDist : '';
    return { province: cleanProv, district: validDistrict };
  }

  if (cleanDist) {
    for (const [prov, dists] of Object.entries(NEPAL_PROVINCE_DISTRICTS)) {
      if (dists.includes(cleanDist)) {
        return { province: prov, district: cleanDist };
      }
    }
  }

  return { province: '', district: '' };
}

const coopPrefillSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name_ne: { type: Type.STRING, description: 'Full official cooperative name in Nepali Devanagari.' },
    name_en: { type: Type.STRING, description: 'Full official cooperative name in English.' },
    registration_number: {
      type: Type.STRING,
      description: 'Official registration number ONLY if explicitly found in search results or user input, else empty string "".',
    },
    registration_authority: {
      type: Type.STRING,
      description: 'Registration authority in Nepali (discovered from research, or appropriate Nepali office like डिभिजन सहकारी कार्यालय / स्थानीय तह सहकारी शाखा).',
    },
    registration_date_ad: {
      type: Type.STRING,
      description: 'Registration date in YYYY-MM-DD AD ONLY if explicitly found in research/input, else empty string "".',
    },
    registration_date_bs: {
      type: Type.STRING,
      description: 'Registration date in YYYY-MM-DD BS (ASCII digits e.g. 2068-04-12) ONLY if explicitly found in research/input, else empty string "".',
    },
    cooperative_type: {
      type: Type.STRING,
      description: 'One of: agriculture, dairy, multipurpose, handicraft, consumer, savings_credit_producer, other.',
    },
    pan_vat_number: {
      type: Type.STRING,
      description: 'PAN or VAT number ONLY if explicitly found in research/input, else empty string "".',
    },
    province: { type: Type.STRING, description: 'Exact Nepali province key if known/inferred, else empty string.' },
    district: { type: Type.STRING, description: 'Exact Nepali district name inside that province, else empty string.' },
    municipality: {
      type: Type.STRING,
      description: 'Municipality or Rural Municipality name in Nepali (e.g. गुलरिया नगरपालिका) if found in research or user hint, else empty string.',
    },
    ward_number: {
      type: Type.STRING,
      description: 'Ward number (digits e.g. 5) ONLY if explicitly found in research or user hint, else empty string.',
    },
    tole_address: {
      type: Type.STRING,
      description: 'Tole/street/locality in Nepali if found in research or user hint, else empty string.',
    },
    contact_email: {
      type: Type.STRING,
      description: 'Official cooperative email ONLY if explicitly found in research/input, else empty string.',
    },
    contact_phone: {
      type: Type.STRING,
      description: 'Official Nepal phone/mobile number ONLY if explicitly found in research/input, else empty string.',
    },
    authorized_rep_name: {
      type: Type.STRING,
      description: 'Chairperson/Manager/Secretary full name in Nepali ONLY if explicitly found in research/input, else empty string.',
    },
    authorized_rep_designation: {
      type: Type.STRING,
      description: 'Representative designation in Nepali e.g. अध्यक्ष or व्यवस्थापक.',
    },
    requested_store_name: { type: Type.STRING, description: 'Customer-facing store name in Nepali.' },
    requested_slug: { type: Type.STRING, description: 'Clean URL slug using lowercase a-z, digits, hyphens only.' },
    research_summary: {
      type: Type.STRING,
      description: 'Concise 1-2 sentence summary in requested UI language stating what public cooperative details were found online and what must be filled/verified manually.',
    },
  },
  required: [
    'name_ne',
    'name_en',
    'registration_number',
    'registration_authority',
    'registration_date_ad',
    'registration_date_bs',
    'cooperative_type',
    'pan_vat_number',
    'province',
    'district',
    'municipality',
    'ward_number',
    'tole_address',
    'contact_email',
    'contact_phone',
    'authorized_rep_name',
    'authorized_rep_designation',
    'requested_store_name',
    'requested_slug',
    'research_summary',
  ],
};

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    // Fall through to brace slicing
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const sliced = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      if (sliced && typeof sliced === 'object' && !Array.isArray(sliced)) {
        return sliced as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function researchAndStructureCooperativeOnline(
  hint: string,
  language: 'ne' | 'en',
  locationGuide: string
): Promise<{
  parsed: Record<string, unknown> | null;
  researchNotes: string;
  sources: AiCoopPrefillSource[];
}> {
  const { ai, model } = createGeminiClient();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: `Search the internet thoroughly for this Nepali cooperative: "${hint}".
Look for any publicly available official records, municipality cooperative lists, Department of Cooperatives (deoc.gov.np) records, news articles, directories, or official social pages/websites.

Return ONLY a single valid JSON object (no markdown commentary) with these exact keys:
{
  "name_ne": "Full official cooperative name in Nepali Devanagari",
  "name_en": "Full official cooperative name in English",
  "registration_number": "Official registration number ONLY if explicitly found online or in hint, else empty string",
  "registration_authority": "Registration authority in Nepali (from web if found, else appropriate Nepali authority e.g. स्थानीय तह सहकारी शाखा / डिभिजन सहकारी कार्यालय)",
  "registration_date_ad": "YYYY-MM-DD AD ONLY if explicitly found online or in hint, else empty string",
  "registration_date_bs": "YYYY-MM-DD BS ASCII digits ONLY if explicitly found online or in hint, else empty string",
  "cooperative_type": "ONE OF: agriculture, dairy, multipurpose, handicraft, consumer, savings_credit_producer, other",
  "pan_vat_number": "PAN/VAT ONLY if explicitly found online or in hint, else empty string",
  "province": "Exact Nepali province key from the province list below",
  "district": "Exact Nepali district name from that province in the list below",
  "municipality": "Municipality/Rural Municipality in Nepali if found online or in hint, else empty string",
  "ward_number": "Ward digits ONLY if explicitly found online or in hint, else empty string",
  "tole_address": "Tole/street in Nepali if found online or in hint, else empty string",
  "contact_email": "Official email ONLY if explicitly found online or in hint, else empty string",
  "contact_phone": "Official Nepal phone/mobile ONLY if explicitly found online or in hint, else empty string",
  "authorized_rep_name": "Chairperson/Manager name in Nepali ONLY if explicitly found online or in hint, else empty string",
  "authorized_rep_designation": "Designation in Nepali e.g. अध्यक्ष or व्यवस्थापक",
  "requested_store_name": "Customer-facing store name in Nepali",
  "requested_slug": "lowercase a-z 0-9 hyphen slug",
  "research_summary": "1-2 concise sentences in ${language === 'en' ? 'English' : 'Nepali'} summarizing what public details were found online vs what needs manual verification"
}

STRICT ACCURACY RULES:
- NEVER invent, guess, or fabricate registration_number, registration_date_ad, registration_date_bs, pan_vat_number, ward_number, contact_email, contact_phone, or authorized_rep_name; use "" if not verified in search results or user hint.
- Note: "Bahudeshya" / "बहुउद्देश्यीय" => "multipurpose", "Krishi" / "कृषि" => "agriculture", "Dugdha" / "दुग्ध" => "dairy".
- Use EXACT Nepali province and district names from:\n${locationGuide}`,
        config: {
          systemInstruction:
            'You are a careful Nepal cooperative registry researcher. Use Google Search grounding to look up the requested Nepali cooperative and output strictly valid JSON with verified facts only.',
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: getThinkingLevelForModel(model) },
        },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new GeminiAssistantError(
              'AI_TIMEOUT',
              'AI प्रतिक्रिया समय समाप्त भयो। कृपया पुनः प्रयास वा म्यानुअल प्रविष्टि गर्नुहोस्।',
              504
            )
          );
        }, 20_000);
      }),
    ]);

    const rawText = (response.text ?? '').trim();
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const seenUrls = new Set<string>();
    const sources: AiCoopPrefillSource[] = [];

    if (Array.isArray(rawChunks)) {
      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri ? String(chunk.web.uri).trim() : '';
        if (!uri || seenUrls.has(uri)) continue;
        seenUrls.add(uri);
        const title = chunk?.web?.title ? String(chunk.web.title).trim() : uri;
        sources.push({ title: title || 'Web Source', url: uri });
        if (sources.length >= 5) break;
      }
    }

    return {
      parsed: rawText ? extractJsonObject(rawText) : null,
      researchNotes: rawText,
      sources,
    };
  } catch (err) {
    throw mapGeminiRuntimeError(err, model);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function prefillCooperativeRegistrationWithGemini(input: {
  hint: string;
  language: 'ne' | 'en';
}): Promise<AiCoopPrefillResult> {
  const locationGuide = Object.entries(NEPAL_PROVINCE_DISTRICTS)
    .map(([p, ds]) => `${p}: ${ds.join(', ')}`)
    .join('\n');

  let parsed: Record<string, unknown> | null = null;
  let sources: AiCoopPrefillSource[] = [];
  let webSearchSkippedNote = '';

  try {
    const grounded = await researchAndStructureCooperativeOnline(input.hint, input.language, locationGuide);
    parsed = grounded.parsed;
    sources = grounded.sources;

    if (!parsed && grounded.researchNotes) {
      const structured = await runStructuredGeminiPrompt<Record<string, unknown>>({
        systemInstruction: `Extract cooperative registration fields strictly from the provided hint and web research notes. Never fabricate registration numbers, PAN, dates, ward numbers, phones, emails, or personal names. Use exact Nepali province/district keys:\n${locationGuide}`,
        userPrompt: `Preferred UI language: ${input.language}\nUser Hint:\n${input.hint}\n\nWeb Research Notes:\n${grounded.researchNotes}`,
        responseSchema: coopPrefillSchema,
        timeoutMs: 25_000,
      });
      parsed = structured.parsed;
    }
  } catch (err) {
    const mapped = err instanceof GeminiAssistantError ? err : mapGeminiRuntimeError(err, getGeminiModel());
    if (mapped.code === 'AI_AUTH_ERROR' || mapped.code === 'AI_UNCONFIGURED' || mapped.code === 'AI_MODEL_NOT_FOUND') {
      throw mapped;
    }
    webSearchSkippedNote =
      input.language === 'en'
        ? 'Live web search is temporarily rate-limited; auto-filled bilingual names and Nepal location from your input.'
        : 'इन्टरनेट खोज सीमा अस्थायी रूपमा पूरा भएकाले तपाईंले लेख्नुभएको नाम र ठेगानाबाट नेपाली/अंग्रेजी विवरण मात्र स्वतः भरिएको छ। बाँकी दर्ता र सम्पर्क विवरण कृपया म्यानुअल रूपमा भर्नुहोस्।';

    const fallbackStructured = await runStructuredGeminiPrompt<Record<string, unknown>>({
      systemInstruction: `You structure Nepali cooperative registration details faithfully from the user's input.
RULES:
- Translate/transliterate faithfully between Nepali Devanagari and English for name_ne, name_en, requested_store_name.
- NEVER invent registration_number, registration_date_ad, registration_date_bs, pan_vat_number, ward_number, contact_email, contact_phone, or authorized_rep_name (return "" if not in input).
- Pick cooperative_type ONLY from: agriculture, dairy, multipurpose, handicraft, consumer, savings_credit_producer, other.
- Pick EXACT Nepali province and district from:\n${locationGuide}
- Clean lowercase hyphenated requested_slug (a-z, 0-9, hyphens).`,
      userPrompt: `Preferred UI language: ${input.language}\nUser Cooperative Hint:\n${input.hint}`,
      responseSchema: coopPrefillSchema,
      timeoutMs: 25_000,
    });
    parsed = fallbackStructured.parsed;
  }

  if (!parsed) {
    throw new GeminiAssistantError('AI_INVALID_OUTPUT', 'AI बाट मान्य JSON विवरण प्राप्त भएन।', 502);
  }

  const allowedTypes = ['agriculture', 'dairy', 'multipurpose', 'handicraft', 'consumer', 'savings_credit_producer', 'other'];
  const coopType = allowedTypes.includes(String(parsed.cooperative_type || '')) ? String(parsed.cooperative_type) : 'multipurpose';

  const { province, district } = resolveProvinceAndDistrict(
    String(parsed.province || ''),
    String(parsed.district || '')
  );

  const slug = String(parsed.requested_slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const rawDateAd = String(parsed.registration_date_ad || '').trim();
  const registration_date_ad = /^\d{4}-\d{2}-\d{2}$/.test(rawDateAd) ? rawDateAd : '';

  const rawDateBs = String(parsed.registration_date_bs || '').trim();
  const registration_date_bs = /^\d{4}-\d{2}-\d{2}$/.test(rawDateBs) ? rawDateBs : '';

  const rawEmail = String(parsed.contact_email || '').trim().toLowerCase();
  const contact_email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '';

  const rawPhoneDigits = String(parsed.contact_phone || '').replace(/[^0-9]/g, '');
  let contact_phone = '';
  if (rawPhoneDigits.length === 13 && rawPhoneDigits.startsWith('977')) {
    contact_phone = rawPhoneDigits.slice(3);
  } else if (rawPhoneDigits.length >= 9 && rawPhoneDigits.length <= 10) {
    contact_phone = rawPhoneDigits;
  }

  const rawWard = String(parsed.ward_number || '').replace(/[^0-9]/g, '').slice(0, 3);

  return {
    name_ne: String(parsed.name_ne || '').trim(),
    name_en: String(parsed.name_en || '').trim(),
    registration_number: String(parsed.registration_number || '').trim(),
    registration_authority: String(parsed.registration_authority || '').trim(),
    registration_date_ad,
    registration_date_bs,
    cooperative_type: coopType,
    pan_vat_number: String(parsed.pan_vat_number || '').replace(/[^0-9A-Za-z-]/g, '').trim(),
    province,
    district,
    municipality: String(parsed.municipality || '').trim(),
    ward_number: rawWard,
    tole_address: String(parsed.tole_address || '').trim(),
    contact_email,
    contact_phone,
    authorized_rep_name: String(parsed.authorized_rep_name || '').trim(),
    authorized_rep_designation: String(parsed.authorized_rep_designation || '').trim() || 'अध्यक्ष',
    requested_store_name: String(parsed.requested_store_name || '').trim(),
    requested_slug: slug,
    research_summary: webSearchSkippedNote || String(parsed.research_summary || '').trim(),
    sources,
  };
}

export interface AiStorePrefillResult {
  store_name_ne: string;
  store_name_en: string;
  tagline_ne: string;
  tagline_en: string;
  intro_ne: string;
  intro_en: string;
  mission_ne: string;
  mission_en: string;
  vision_ne: string;
  vision_en: string;
  notice_ne: string;
  notice_en: string;
  footer_text_ne: string;
  footer_text_en: string;
}

const storePrefillSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    store_name_ne: { type: Type.STRING },
    store_name_en: { type: Type.STRING },
    tagline_ne: { type: Type.STRING },
    tagline_en: { type: Type.STRING },
    intro_ne: { type: Type.STRING },
    intro_en: { type: Type.STRING },
    mission_ne: { type: Type.STRING },
    mission_en: { type: Type.STRING },
    vision_ne: { type: Type.STRING },
    vision_en: { type: Type.STRING },
    notice_ne: { type: Type.STRING },
    notice_en: { type: Type.STRING },
    footer_text_ne: { type: Type.STRING },
    footer_text_en: { type: Type.STRING },
  },
  required: [
    'store_name_ne',
    'store_name_en',
    'tagline_ne',
    'tagline_en',
    'intro_ne',
    'intro_en',
    'mission_ne',
    'mission_en',
    'vision_ne',
    'vision_en',
    'notice_ne',
    'notice_en',
    'footer_text_ne',
    'footer_text_en',
  ],
};

export async function prefillStoreBuilderWithGemini(input: {
  coopNameNe: string;
  coopNameEn: string;
  district: string;
  cooperativeType: string;
  hint?: string;
  language: 'ne' | 'en';
}): Promise<AiStorePrefillResult> {
  const systemInstruction = `You write warm, trustworthy, bilingual Nepali & English storefront copy for a registered cooperative store on Sahakari Bazar Nepal.
Keep taglines under 12 words, intro/mission/vision concise (1-2 sentences each), notice clear and helpful (e.g. ordering & dispatch timing guidance without inventing fake phone numbers or guarantees), and never fabricate certifications or statistics.`;

  const userPrompt = [
    `Cooperative Name (Nepali): ${input.coopNameNe}`,
    `Cooperative Name (English): ${input.coopNameEn}`,
    `District: ${input.district}`,
    `Cooperative Type: ${input.cooperativeType}`,
    `Primary UI Language: ${input.language}`,
    input.hint ? `Cooperative Focus / Hint: ${input.hint}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const { parsed } = await runStructuredGeminiPrompt<Record<string, unknown>>({
    systemInstruction,
    userPrompt,
    responseSchema: storePrefillSchema,
    timeoutMs: 25_000,
  });

  return {
    store_name_ne: String(parsed.store_name_ne || '').trim(),
    store_name_en: String(parsed.store_name_en || '').trim(),
    tagline_ne: String(parsed.tagline_ne || '').trim(),
    tagline_en: String(parsed.tagline_en || '').trim(),
    intro_ne: String(parsed.intro_ne || '').trim(),
    intro_en: String(parsed.intro_en || '').trim(),
    mission_ne: String(parsed.mission_ne || '').trim(),
    mission_en: String(parsed.mission_en || '').trim(),
    vision_ne: String(parsed.vision_ne || '').trim(),
    vision_en: String(parsed.vision_en || '').trim(),
    notice_ne: String(parsed.notice_ne || '').trim(),
    notice_en: String(parsed.notice_en || '').trim(),
    footer_text_ne: String(parsed.footer_text_ne || '').trim(),
    footer_text_en: String(parsed.footer_text_en || '').trim(),
  };
}

export interface AiDashboardDraftResult {
  code?: string;
  title_ne?: string;
  title_en?: string;
  discount_type?: 'percentage' | 'flat';
  discount_value?: string;
  min_order_npr?: string;
  delivery_instructions_ne?: string;
  bank_payment_instructions_ne?: string;
  subject?: string;
  message?: string;
}

const dashboardDraftSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    code: { type: Type.STRING, description: 'Uppercase promo coupon code (e.g. TEEJ10) when kind=promotion.' },
    title_ne: { type: Type.STRING, description: 'Nepali promo campaign title when kind=promotion.' },
    title_en: { type: Type.STRING, description: 'English promo campaign title when kind=promotion.' },
    discount_type: { type: Type.STRING, description: 'percentage or flat when kind=promotion.' },
    discount_value: { type: Type.STRING, description: 'Numeric string e.g. 10 or 150 when kind=promotion.' },
    min_order_npr: { type: Type.STRING, description: 'Numeric string e.g. 500 when kind=promotion.' },
    delivery_instructions_ne: { type: Type.STRING, description: 'Clear Nepali delivery & dispatch instructions when kind=delivery.' },
    bank_payment_instructions_ne: { type: Type.STRING, description: 'Safe template reminder for bank/QR reference upload when kind=delivery (no invented account numbers).' },
    subject: { type: Type.STRING, description: 'Support ticket subject when kind=support.' },
    message: { type: Type.STRING, description: 'Clear support ticket message when kind=support.' },
  },
};

export async function prefillDashboardDraftWithGemini(input: {
  kind: 'promotion' | 'delivery' | 'support';
  hint?: string;
  coopName: string;
  district: string;
  language: 'ne' | 'en';
}): Promise<AiDashboardDraftResult> {
  const systemInstruction = `You generate concise, practical cooperative seller drafts for Sahakari Bazar Nepal.
- Never invent real bank account numbers, phone numbers, or fake order IDs (use clear placeholders like "[खाता नम्बर राख्नुहोस्]" if needed).
- Tailor strictly to kind="${input.kind}".`;

  const userPrompt = [
    `Draft Kind: ${input.kind}`,
    `Cooperative: ${input.coopName} (${input.district})`,
    `Language Preference: ${input.language}`,
    input.hint ? `Seller Hint: ${input.hint}` : 'No custom hint given; create a helpful standard cooperative template.',
  ].join('\n');

  const { parsed } = await runStructuredGeminiPrompt<Record<string, unknown>>({
    systemInstruction,
    userPrompt,
    responseSchema: dashboardDraftSchema,
    timeoutMs: 25_000,
  });

  return {
    code: parsed.code ? String(parsed.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) : undefined,
    title_ne: parsed.title_ne ? String(parsed.title_ne).trim() : undefined,
    title_en: parsed.title_en ? String(parsed.title_en).trim() : undefined,
    discount_type: parsed.discount_type === 'flat' ? 'flat' : 'percentage',
    discount_value: parsed.discount_value ? String(parsed.discount_value).replace(/[^0-9.]/g, '') : undefined,
    min_order_npr: parsed.min_order_npr ? String(parsed.min_order_npr).replace(/[^0-9.]/g, '') : undefined,
    delivery_instructions_ne: parsed.delivery_instructions_ne ? String(parsed.delivery_instructions_ne).trim() : undefined,
    bank_payment_instructions_ne: parsed.bank_payment_instructions_ne ? String(parsed.bank_payment_instructions_ne).trim() : undefined,
    subject: parsed.subject ? String(parsed.subject).trim() : undefined,
    message: parsed.message ? String(parsed.message).trim() : undefined,
  };
}

