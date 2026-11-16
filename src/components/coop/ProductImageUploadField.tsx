import { useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, X } from 'lucide-react';
import { optimizeImageFileToDataUrl } from '../../lib/image-upload';
import { SafeImage } from '../SafeImage';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface ProductImageUploadFieldProps {
  lang: 'ne' | 'en';
  previewUrl?: string | null;
  isNewSelection?: boolean;
  productName?: string;
  onImageSelect: (dataUrl: string) => void;
  onClearNewImage?: () => void;
}

export function ProductImageUploadField({
  lang,
  previewUrl,
  isNewSelection = false,
  productName,
  onImageSelect,
  onClearNewImage,
}: ProductImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setProcessing(true);
    try {
      const optimized = await optimizeImageFileToDataUrl(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.86,
      });
      onImageSelect(optimized);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'फोटो अपलोड गर्न सकिएन।');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!previewUrl ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`w-full rounded-xl border-2 border-dashed p-4 transition-colors cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 ${
            dragging
              ? 'border-[#B91C1C] bg-red-50/70'
              : 'border-[#B91C1C]/40 bg-gradient-to-r from-[#FFF7ED] via-[#FAF9F6] to-white hover:border-[#B91C1C]'
          }`}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-24 h-20 rounded-lg border border-[#E5E2DC] overflow-hidden shrink-0">
              <SafeImage
                src={null}
                variant="product"
                lang={lang}
                alt={productName || 'Product Branding Preview'}
                className="w-full h-full"
              />
            </div>
            <div className="space-y-1 text-left">
              <p className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#B91C1C] shrink-0" />
                <span>
                  {lang === 'ne'
                    ? 'उत्पादनको फोटो अपलोड गरिएको छैन'
                    : 'No Product Photo Uploaded Yet'}
                </span>
              </p>
              <p className="text-xs text-[#57534E] leading-relaxed">
                {lang === 'ne'
                  ? 'वास्तविक उत्पादनको फोटो अपलोड गर्दा ग्राहकको विश्वास बढ्छ। फोटो अपलोड नभएसम्म सहकारी बजार नेपालको ब्रान्डिङ देखिनेछ।'
                  : 'Upload a clear product photo to build buyer confidence. Until uploaded, Sahakari Bazar Nepal branding is displayed automatically.'}
              </p>
              <p className="text-[11px] text-[#78716C]">
                {lang === 'ne' ? 'PNG, JPG वा WEBP छान्नुहोस् वा यहाँ ड्रप गर्नुहोस्' : 'Click to browse or drag & drop PNG, JPG, WEBP'}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={processing}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="shrink-0"
          >
            <ImagePlus className="w-4 h-4" />
            {processing
              ? lang === 'ne'
                ? 'तयार हुँदैछ...'
                : 'Processing...'
              : lang === 'ne'
              ? 'फोटो अपलोड गर्नुहोस्'
              : 'Upload Product Photo'}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={previewUrl}
              alt={productName || 'Product photo preview'}
              className="w-20 h-16 rounded-lg border border-[#E5E2DC] object-cover bg-white shrink-0"
            />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-[#15803D]">
                {isNewSelection
                  ? lang === 'ne'
                    ? 'नयाँ फोटो चयन गरियो (सुरक्षित गर्न तयार)'
                    : 'New photo selected (ready to save)'
                  : lang === 'ne'
                  ? 'उत्पादनको फोटो उपलब्ध छ'
                  : 'Current product photo active'}
              </p>
              <p className="text-[11px] text-[#57534E] truncate">
                {lang === 'ne'
                  ? 'आवश्यक भएमा नयाँ फोटोले प्रतिस्थापन गर्न सक्नुहुन्छ।'
                  : 'You can replace this photo anytime.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {processing
                ? lang === 'ne'
                  ? 'तयार हुँदैछ...'
                  : 'Processing...'
                : lang === 'ne'
                ? 'फोटो बदल्नुहोस्'
                : 'Change Photo'}
            </Button>
            {isNewSelection && onClearNewImage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClearNewImage}
                title={lang === 'ne' ? 'चयन हटाउनुहोस्' : 'Clear selected image'}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
