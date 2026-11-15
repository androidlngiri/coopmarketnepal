import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export function getGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_MODEL;
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

export async function generateProductWithGemini(input: AiGenerateProductInput): Promise<{
  data: AiGeneratedProductData;
  model: string;
  promptTokens: number | null;
  outputTokens: number | null;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiAssistantError(
      'AI_UNCONFIGURED',
      'AI सेवा हाल सर्भरमा कन्फिगर गरिएको छैन। कृपया म्यानुअल रूपमा उत्पादन विवरण भर्नुहोस्।',
      503
    );
  }

  const model = getGeminiModel();
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const primaryLangLabel =
    input.language === 'en'
      ? 'English (clear, natural, customer-friendly English for Nepali and international buyers; still populate *_ne fields accurately in Nepali Devanagari)'
      : 'Nepali (natural, respectful, customer-friendly Nepali Devanagari as the primary language across highlights, usage, storage, handling, safety, packaging, recipes, SEO, and confirmation checklist; also populate *_en fields accurately in English)';

  const categoryListText = input.globalCategories
    .map((c) => `- ${c.slug} (${c.name_ne} / ${c.name_en})`)
    .join('\n');

  const systemInstruction = `You are a careful product merchandising specialist for "Sahakari Bazar Nepal" (सहकारी बजार), an e-commerce platform for community cooperatives across Nepal.

STRICT ACCURACY & SAFETY RULES:
1. NEVER invent, guess, or fabricate:
   - Certifications (Organic certified, ISO, DFTQC, Fair Trade, GI tag, etc.)
   - Manufacturing dates, harvest dates, or expiry dates
   - Net weights, volumes, prices, or batch numbers unless explicitly provided in the input
   - Exact laboratory nutritional values or chemical breakdowns
   - Undisclosed ingredients/additives
   - Unsupported medical, therapeutic, disease-curing, or health claims
2. List everything the cooperative must verify (e.g., exact net weight/price, certification proof, expiry/batch date, exact ingredient/material origin) in "needs_confirmation".
3. Known specifications ("known_specifications") MUST ONLY include facts explicitly supplied in the prompt or indisputable physical traits (never fake lab metrics or unverified weights).
4. Recipes ("recipe_suggestions"): Generate 1-2 authentic Nepali/practical recipes ONLY if the product is an edible food, spice, dairy, tea/coffee, grain, or cooking ingredient. Return an EMPTY array [] for handicrafts, textiles, fertilizers, utensils, cosmetics, or non-food items.
5. Tailor tone and guidance specifically to the product domain (agricultural produce, dairy, packaged food, bamboo/lokta/dhaka handicrafts, herbal products, etc.) — never generic filler.
6. Primary output language for all list/narrative fields: ${primaryLangLabel}.
7. Keep descriptions crisp, authentic to Nepal's cooperative ecosystem, and practical for online shoppers.`;

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

  const timeoutMs = 26_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const thinkingLevel = model.includes('flash-lite') ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: productResponseSchema,
          thinkingConfig: { thinkingLevel },
        },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new GeminiAssistantError('AI_TIMEOUT', 'AI प्रतिक्रिया समय समाप्त भयो। कृपया पुनः प्रयास वा म्यानुअल प्रविष्टि गर्नुहोस्।', 504));
        }, timeoutMs);
      }),
    ]);

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new GeminiAssistantError('AI_INVALID_OUTPUT', 'AI बाट खाली प्रतिक्रिया प्राप्त भयो।', 502);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new GeminiAssistantError('AI_INVALID_OUTPUT', 'AI प्रतिक्रिया JSON ढाँचामा प्राप्त भएन।', 502);
    }

    const usage = response.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;

    return {
      data: normalizeAiPayload(parsed, input.globalCategories),
      model,
      promptTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null,
      outputTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
    };
  } catch (err) {
    if (err instanceof GeminiAssistantError) {
      throw err;
    }

    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
      throw new GeminiAssistantError(
        'AI_QUOTA_EXHAUSTED',
        'AI सेवाको हालको अनुरोध सीमा पूरा भएको छ। तपाईं म्यानुअल रूपमा उत्पादन विवरण भरेर सुरक्षित गर्न सक्नुहुन्छ।',
        429
      );
    }
    if (status === 400 || status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
      throw new GeminiAssistantError(
        'AI_AUTH_ERROR',
        'AI सेवा कुञ्जी मान्य छैन वा अनुमति अस्वीकृत भयो। म्यानुअल प्रविष्टि जारी राख्नुहोस्।',
        503
      );
    }
    if (status === 404 || /NOT_FOUND|not found/i.test(msg)) {
      throw new GeminiAssistantError(
        'AI_MODEL_NOT_FOUND',
        `चयन गरिएको AI मोडेल (${model}) उपलब्ध छैन। म्यानुअल प्रविष्टि जारी राख्नुहोस्।`,
        502
      );
    }

    throw new GeminiAssistantError(
      'AI_FAILED',
      'AI सहायक हाल अस्थायी रूपमा अनुपलब्ध छ। कृपया म्यानुअल रूपमा उत्पादन विवरण भर्नुहोस्।',
      502
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
