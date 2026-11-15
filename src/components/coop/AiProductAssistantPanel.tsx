import { useState } from 'react';
import { AlertCircle, CheckCircle2, History, RotateCcw, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/utils';
import { toNepaliDigits } from '../../lib/bs-date';
import { Input, Textarea } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import type { ProductAiDetails } from '../ProductCard';

export interface AiQuotaState {
  used: number;
  limit: number;
  remaining: number;
  dateKtm?: string;
}

export interface AiGeneratedPayload extends ProductAiDetails {
  refined_name_ne?: string;
  refined_name_en?: string;
  short_description_ne?: string;
  short_description_en?: string;
  detailed_description_ne?: string;
  detailed_description_en?: string;
  suggested_category_slug?: string;
  suggested_category_reason?: string;
  unit_label_ne?: string;
  unit_label_en?: string;
  seo_title?: string;
  seo_meta_description?: string;
  search_keywords?: string[];
}

export interface AiHistoryRecord {
  id: string;
  product_id: string | null;
  mode: string;
  product_name_input: string;
  language: string;
  generation_date_ktm: string;
  model: string;
  status: string;
  counts_toward_quota: boolean;
  generated_payload_json: AiGeneratedPayload | null;
  error_message: string | null;
  created_at: string;
}

interface AiProductAssistantPanelProps {
  lang: 'ne' | 'en';
  mode: 'create' | 'edit';
  productId?: string;
  productName: string;
  unitHint?: string;
  quota: AiQuotaState | null;
  geminiConfigured: boolean;
  modelName?: string;
  history: AiHistoryRecord[];
  globalCategories: Array<{ id: string; slug?: string; name_ne: string; name_en: string }>;
  needsConfirmation: string[];
  onApplyGenerated: (args: {
    generated: AiGeneratedPayload;
    generationId?: string;
    suggestedCategoryId?: string;
    language: 'ne' | 'en';
  }) => void;
  onQuotaUpdate: (quota: AiQuotaState) => void;
  onRefreshHistory: () => void;
}

export function AiProductAssistantPanel({
  lang,
  mode,
  productId,
  productName,
  unitHint,
  quota,
  geminiConfigured,
  modelName,
  history,
  globalCategories,
  needsConfirmation,
  onApplyGenerated,
  onQuotaUpdate,
  onRefreshHistory,
}: AiProductAssistantPanelProps) {
  const [aiLang, setAiLang] = useState<'ne' | 'en'>('ne');
  const [knownSpecsHint, setKnownSpecsHint] = useState('');
  const [existingNotes, setExistingNotes] = useState('');
  const [showAdvancedHints, setShowAdvancedHints] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fallbackError, setFallbackError] = useState('');

  const remaining = quota ? Math.max(0, Number(quota.remaining ?? 0)) : 2;
  const limit = quota ? Number(quota.limit ?? 2) : 2;
  const used = quota ? Number(quota.used ?? 0) : 0;
  const quotaExhausted = quota !== null && remaining <= 0;

  const handleGenerate = async () => {
    const queryName = productName.trim();
    if (queryName.length < 2) {
      toast.error(
        lang === 'ne'
          ? 'कृपया पहिले कम्तीमा २ अक्षरको उत्पादन नाम प्रविष्ट गर्नुहोस्।'
          : 'Please enter at least 2 characters for the product name first.'
      );
      return;
    }

    setGenerating(true);
    setFallbackError('');
    const res = await apiFetch<{
      generationId?: string;
      generated?: AiGeneratedPayload;
      suggestedCategoryId?: string;
      quota?: AiQuotaState;
      manualFallback?: boolean;
    }>('/api/coop-dashboard/products/ai-generate', {
      method: 'POST',
      body: JSON.stringify({
        productName: queryName,
        language: aiLang,
        mode,
        productId,
        unitHint: unitHint || undefined,
        knownSpecs: knownSpecsHint || undefined,
        existingNotes: existingNotes || undefined,
      }),
    });
    setGenerating(false);

    if (res.ok && res.data.generated) {
      if (res.data.quota) onQuotaUpdate(res.data.quota);
      onApplyGenerated({
        generated: res.data.generated,
        generationId: res.data.generationId,
        suggestedCategoryId: res.data.suggestedCategoryId,
        language: aiLang,
      });
      onRefreshHistory();
      toast.success(
        lang === 'ne'
          ? 'AI बाट विवरण तयार भयो! कृपया समीक्षा र सम्पादन गरेर मात्र सुरक्षित गर्नुहोस्।'
          : 'AI draft populated! Please review and verify before saving.'
      );
      return;
    }

    const msg = res.error || (lang === 'ne' ? 'AI सेवा अनुपलब्ध छ। म्यानुअल प्रविष्टि जारी राख्नुहोस्।' : 'AI assistant unavailable. Continue manually.');
    setFallbackError(msg);
    onRefreshHistory();
    toast.error(msg);
  };

  return (
    <div className="rounded-xl border border-[#D6D3CD] bg-[#FAF9F6] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              {lang === 'ne' ? 'AI उत्पादन विवरण सहायक (Gemini)' : 'AI Product Assistant (Gemini)'}
            </h3>
            <p className="text-[11px] text-[#57534E]">
              {lang === 'ne'
                ? 'उत्पादनको नाम मात्र राखेर विवरण, विशेषता, प्रयोग विधि, भण्डारण र SEO स्वतः भर्नुहोस्।'
                : 'Enter product name to auto-draft descriptions, highlights, care instructions, and SEO.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`px-2.5 py-1 rounded-md border font-semibold tabular-nums ${
              quotaExhausted
                ? 'bg-red-50 border-red-200 text-[#B91C1C]'
                : 'bg-white border-[#E5E2DC] text-[#0F172A]'
            }`}
          >
            {lang === 'ne'
              ? `आजको निःशुल्क कोटा: ${toNepaliDigits(remaining)} / ${toNepaliDigits(limit)} बाँकी (${toNepaliDigits(used)} प्रयोग)`
              : `Daily Free Quota: ${remaining}/${limit} left (Asia/Kathmandu)`}
          </span>
          {history.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowHistory((s) => !s)}>
              <History className="w-3.5 h-3.5" />
              {lang === 'ne' ? `इतिहास (${toNepaliDigits(history.length)})` : `History (${history.length})`}
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-[#E5E2DC] bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setAiLang('ne')}
            className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
              aiLang === 'ne' ? 'bg-[#0F172A] text-white' : 'text-[#57534E]'
            }`}
          >
            नेपाली (Default)
          </button>
          <button
            type="button"
            onClick={() => setAiLang('en')}
            className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
              aiLang === 'en' ? 'bg-[#0F172A] text-white' : 'text-[#57534E]'
            }`}
          >
            English
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={generating || quotaExhausted || !geminiConfigured}
          onClick={handleGenerate}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating
            ? lang === 'ne'
              ? 'AI ले विवरण तयार गर्दैछ...'
              : 'Generating with AI...'
            : lang === 'ne'
            ? 'AI बाट विवरण बनाउनुहोस्'
            : 'Generate with AI'}
        </Button>

        <button
          type="button"
          onClick={() => setShowAdvancedHints((v) => !v)}
          className="text-xs text-[#57534E] hover:text-[#0F172A] underline cursor-pointer ml-1"
        >
          {showAdvancedHints
            ? lang === 'ne'
              ? 'थप जानकारी लुकाउनुहोस्'
              : 'Hide optional specs'
            : lang === 'ne'
            ? '+ ज्ञात विशेषता / नोट थप्नुहोस्'
            : '+ Add known specs / notes'}
        </button>

        {modelName && (
          <span className="ml-auto text-[11px] font-mono text-[#78716C]">{modelName}</span>
        )}
      </div>

      {showAdvancedHints && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Input
            placeholder={lang === 'ne' ? 'ज्ञात विशेषता (जस्तै: ग्रेड A, शुद्ध वजन ५०० ग्राम)' : 'Known specs (e.g. Grade A, 500g)'}
            value={knownSpecsHint}
            onChange={(e) => setKnownSpecsHint(e.target.value)}
            className="bg-white text-xs h-9"
          />
          <Textarea
            placeholder={lang === 'ne' ? 'सहकारी वा उत्पादन सम्बन्धी अतिरिक्त नोट' : 'Additional cooperative or harvest notes'}
            value={existingNotes}
            onChange={(e) => setExistingNotes(e.target.value)}
            className="bg-white text-xs min-h-[38px]"
          />
        </div>
      )}

      {!geminiConfigured && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {lang === 'ne' ? 'AI कुञ्जी सर्भरमा सेट गरिएको छैन (म्यानुअल प्रविष्टि उपलब्ध छ)' : 'Gemini API Key Not Configured (Manual Entry Active)'}
            </p>
            <p className="text-[11px] mt-0.5">
              {lang === 'ne'
                ? 'तपाईं सामान्य रूपमा सबै उत्पादन र विस्तृत विवरण म्यानुअल रूपमा भरेर सुरक्षित वा प्रकाशित गर्न सक्नुहुन्छ।'
                : 'You can fill and publish all product fields manually without interruption.'}
            </p>
          </div>
        </div>
      )}

      {quotaExhausted && geminiConfigured && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {lang === 'ne'
              ? `तपाईंको सहकारीको आजको (${quota?.dateKtm || 'नेपाल समय'}) ${toNepaliDigits(limit)} निःशुल्क AI उत्पादन सीमा पूरा भएको छ। इतिहासबाट पहिलेका नतिजा पुनः प्रयोग गर्न वा म्यानुअल रूपमा विवरण भर्न सक्नुहुन्छ।`
              : `Your cooperative has reached today's free limit of ${limit} AI generations (Asia/Kathmandu). You may reuse previous results from History or continue manually.`}
          </span>
        </div>
      )}

      {fallbackError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#B91C1C] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{fallbackError}</span>
        </div>
      )}

      {needsConfirmation.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-300 text-xs text-amber-950 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-amber-700" />
            {lang === 'ne'
              ? 'प्रकाशित गर्नुअघि सहकारीले अनिवार्य जाँच र पुष्टि गर्नुपर्ने बुँदाहरू:'
              : 'Cooperative Verification Checklist (Confirm before publishing):'}
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
            {needsConfirmation.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {showHistory && history.length > 0 && (
        <div className="bg-white border border-[#E5E2DC] rounded-lg p-3 space-y-2 max-h-56 overflow-y-auto">
          <p className="text-xs font-semibold text-[#0F172A]">
            {lang === 'ne' ? 'सहकारीको हालैका AI सिर्जना इतिहास' : 'Cooperative Recent AI Generations'}
          </p>
          {history.map((h) => {
            const payload = h.generated_payload_json;
            const matchedCat = payload?.suggested_category_slug
              ? globalCategories.find((c) => c.slug === payload.suggested_category_slug)
              : undefined;
            return (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#F3F1EC] last:border-b-0 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#0F172A] truncate">
                    {h.product_name_input} <span className="font-mono text-[10px] text-[#78716C]">({h.language})</span>
                  </p>
                  <p className="text-[11px] text-[#57534E]">
                    {h.generation_date_ktm} · {h.status} {h.counts_toward_quota ? '· Quota Used' : '· Not Counted'}
                  </p>
                </div>
                {h.status === 'completed' && payload && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onApplyGenerated({
                        generated: payload,
                        generationId: h.id,
                        suggestedCategoryId: matchedCat?.id || '',
                        language: h.language === 'en' ? 'en' : 'ne',
                      });
                      toast.success(lang === 'ne' ? 'इतिहासबाट विवरण फारममा भरियो।' : 'Loaded draft from history.');
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {lang === 'ne' ? 'फारममा भर्नुहोस्' : 'Apply'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
