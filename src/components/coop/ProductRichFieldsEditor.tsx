import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Input, Textarea } from '../ui/input';
import { Button } from '../ui/button';
import type { ProductAiDetails } from '../ProductCard';

export interface ProductRichFormFields {
  shortDescriptionNe: string;
  shortDescriptionEn: string;
  aiDetails: ProductAiDetails;
  seoTitleNe: string;
  seoTitleEn: string;
  seoMetaDescriptionNe: string;
  seoMetaDescriptionEn: string;
  seoKeywords: string[];
}

export const EMPTY_RICH_FIELDS: ProductRichFormFields = {
  shortDescriptionNe: '',
  shortDescriptionEn: '',
  aiDetails: {
    highlights: [],
    known_specifications: [],
    ingredients_or_materials: [],
    uses_and_benefits: [],
    preparation_or_usage: '',
    recipe_suggestions: [],
    storage_instructions: '',
    handling_instructions: '',
    safety_precautions: '',
    packaging_suggestions: '',
    needs_confirmation: [],
  },
  seoTitleNe: '',
  seoTitleEn: '',
  seoMetaDescriptionNe: '',
  seoMetaDescriptionEn: '',
  seoKeywords: [],
};

interface ProductRichFieldsEditorProps {
  lang: 'ne' | 'en';
  value: ProductRichFormFields;
  onChange: (next: ProductRichFormFields) => void;
  defaultExpanded?: boolean;
}

export function ProductRichFieldsEditor({
  lang,
  value,
  onChange,
  defaultExpanded = false,
}: ProductRichFieldsEditorProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const details = value.aiDetails || {};

  const updateDetails = (patch: Partial<ProductAiDetails>) => {
    onChange({
      ...value,
      aiDetails: {
        ...details,
        ...patch,
      },
    });
  };

  const linesToArray = (txt: string) =>
    txt
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  const specs = details.known_specifications || [];
  const recipes = details.recipe_suggestions || [];

  return (
    <div className="border border-[#E5E2DC] rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#0F172A] bg-[#FAF9F6] hover:bg-[#F3F1EC] cursor-pointer"
      >
        <span>
          {lang === 'ne'
            ? 'विस्तृत उत्पादन जानकारी, प्रयोग/भण्डारण, रेसिपी र SEO विवरण (सम्पादनयोग्य)'
            : 'Rich Product Details, Usage/Storage, Recipes & SEO (Editable)'}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 text-xs">
          {/* Short descriptions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'संक्षिप्त विवरण (नेपाली)' : 'Short Description (Nepali)'}
              </label>
              <Input
                value={value.shortDescriptionNe}
                onChange={(e) => onChange({ ...value, shortDescriptionNe: e.target.value })}
                placeholder={lang === 'ne' ? '१-२ वाक्यको सारांश' : '1-2 sentence summary (Nepali)'}
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'संक्षिप्त विवरण (English)' : 'Short Description (English)'}
              </label>
              <Input
                value={value.shortDescriptionEn}
                onChange={(e) => onChange({ ...value, shortDescriptionEn: e.target.value })}
                placeholder="1-2 sentence summary (English)"
              />
            </div>
          </div>

          {/* Highlights, Ingredients, Uses */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'मुख्य विशेषताहरू (प्रत्येक हरफमा १)' : 'Highlights (one per line)'}
              </label>
              <Textarea
                value={(details.highlights || []).join('\n')}
                onChange={(e) => updateDetails({ highlights: linesToArray(e.target.value) })}
                className="min-h-[84px]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'सामग्री / कच्चा पदार्थ (१ प्रति हरफ)' : 'Ingredients / Raw Materials'}
              </label>
              <Textarea
                value={(details.ingredients_or_materials || []).join('\n')}
                onChange={(e) => updateDetails({ ingredients_or_materials: linesToArray(e.target.value) })}
                className="min-h-[84px]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'प्रयोग र फाइदा (१ प्रति हरफ)' : 'Uses & Benefits (one per line)'}
              </label>
              <Textarea
                value={(details.uses_and_benefits || []).join('\n')}
                onChange={(e) => updateDetails({ uses_and_benefits: linesToArray(e.target.value) })}
                className="min-h-[84px]"
              />
            </div>
          </div>

          {/* Known Specifications */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium">
                {lang === 'ne' ? 'प्रमाणित विशेषताहरू (Specifications — केवल ज्ञात तथ्य मात्र)' : 'Known Specifications'}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateDetails({ known_specifications: [...specs, { label: '', value: '' }] })}
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'थप्नुहोस्' : 'Add Spec'}
              </Button>
            </div>
            {specs.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-5 h-8 text-xs"
                  placeholder={lang === 'ne' ? 'शीर्षक (जस्तै: उत्पत्ति)' : 'Label'}
                  value={sp.label}
                  onChange={(e) => {
                    const next = [...specs];
                    next[idx] = { ...sp, label: e.target.value };
                    updateDetails({ known_specifications: next });
                  }}
                />
                <Input
                  className="col-span-6 h-8 text-xs"
                  placeholder={lang === 'ne' ? 'मान (जस्तै: इलाम)' : 'Value'}
                  value={sp.value}
                  onChange={(e) => {
                    const next = [...specs];
                    next[idx] = { ...sp, value: e.target.value };
                    updateDetails({ known_specifications: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => updateDetails({ known_specifications: specs.filter((_, i) => i !== idx) })}
                  className="col-span-1 text-[#78716C] hover:text-[#DC2626] flex justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'तयारी वा प्रयोग विधि' : 'Preparation / Usage Instructions'}
              </label>
              <Textarea
                value={details.preparation_or_usage || ''}
                onChange={(e) => updateDetails({ preparation_or_usage: e.target.value })}
                className="min-h-[70px]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'भण्डारण र संरक्षण विधि' : 'Storage & Preservation'}
              </label>
              <Textarea
                value={details.storage_instructions || ''}
                onChange={(e) => updateDetails({ storage_instructions: e.target.value })}
                className="min-h-[70px]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'ढुवानी र ह्यान्डलिङ निर्देशन' : 'Handling Instructions'}
              </label>
              <Textarea
                value={details.handling_instructions || ''}
                onChange={(e) => updateDetails({ handling_instructions: e.target.value })}
                className="min-h-[70px]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                {lang === 'ne' ? 'सुरक्षा सावधानी' : 'Safety Precautions'}
              </label>
              <Textarea
                value={details.safety_precautions || ''}
                onChange={(e) => updateDetails({ safety_precautions: e.target.value })}
                className="min-h-[70px]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">
              {lang === 'ne' ? 'प्याकेजिङ तथा प्रस्तुतीकरण सुझाव' : 'Packaging & Presentation Suggestions'}
            </label>
            <Input
              value={details.packaging_suggestions || ''}
              onChange={(e) => updateDetails({ packaging_suggestions: e.target.value })}
            />
          </div>

          {/* Recipe suggestions (food items only) */}
          <div className="space-y-2 pt-2 border-t border-[#F3F1EC]">
            <div className="flex items-center justify-between">
              <label className="font-medium">
                {lang === 'ne' ? 'रेसिपी सुझावहरू (खाद्य सामग्रीको लागि मात्र)' : 'Recipe Suggestions (Food items only)'}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  updateDetails({ recipe_suggestions: [...recipes, { title: '', ingredients: [], steps: [] }] })
                }
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'रेसिपी थप्नुहोस्' : 'Add Recipe'}
              </Button>
            </div>
            {recipes.map((rcp, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6] space-y-2">
                <div className="flex gap-2 items-center">
                  <Input
                    className="h-8 text-xs bg-white"
                    placeholder={lang === 'ne' ? 'रेसिपी शीर्षक' : 'Recipe title'}
                    value={rcp.title}
                    onChange={(e) => {
                      const next = [...recipes];
                      next[idx] = { ...rcp, title: e.target.value };
                      updateDetails({ recipe_suggestions: next });
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => updateDetails({ recipe_suggestions: recipes.filter((_, i) => i !== idx) })}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Textarea
                    className="bg-white min-h-[60px] text-xs"
                    placeholder={lang === 'ne' ? 'सामग्रीहरू (प्रत्येक हरफमा १)' : 'Ingredients (one per line)'}
                    value={(rcp.ingredients || []).join('\n')}
                    onChange={(e) => {
                      const next = [...recipes];
                      next[idx] = { ...rcp, ingredients: linesToArray(e.target.value) };
                      updateDetails({ recipe_suggestions: next });
                    }}
                  />
                  <Textarea
                    className="bg-white min-h-[60px] text-xs"
                    placeholder={lang === 'ne' ? 'बनाउने विधि (प्रत्येक हरफमा १)' : 'Steps (one per line)'}
                    value={(rcp.steps || []).join('\n')}
                    onChange={(e) => {
                      const next = [...recipes];
                      next[idx] = { ...rcp, steps: linesToArray(e.target.value) };
                      updateDetails({ recipe_suggestions: next });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* SEO */}
          <div className="space-y-3 pt-2 border-t border-[#F3F1EC]">
            <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'SEO तथा खोज शब्दहरू' : 'SEO & Search Metadata'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder={lang === 'ne' ? 'SEO शीर्षक (नेपाली)' : 'SEO Title (Nepali)'}
                value={value.seoTitleNe}
                onChange={(e) => onChange({ ...value, seoTitleNe: e.target.value })}
              />
              <Input
                placeholder="SEO Title (English)"
                value={value.seoTitleEn}
                onChange={(e) => onChange({ ...value, seoTitleEn: e.target.value })}
              />
              <Input
                placeholder={lang === 'ne' ? 'SEO मेटा विवरण (नेपाली)' : 'SEO Meta Description (Nepali)'}
                value={value.seoMetaDescriptionNe}
                onChange={(e) => onChange({ ...value, seoMetaDescriptionNe: e.target.value })}
              />
              <Input
                placeholder="SEO Meta Description (English)"
                value={value.seoMetaDescriptionEn}
                onChange={(e) => onChange({ ...value, seoMetaDescriptionEn: e.target.value })}
              />
            </div>
            <Input
              placeholder={lang === 'ne' ? 'खोज शब्दहरू (अल्पविराम "," ले छुट्टाउनुहोस्)' : 'Search keywords (comma separated)'}
              value={value.seoKeywords.join(', ')}
              onChange={(e) =>
                onChange({
                  ...value,
                  seoKeywords: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
