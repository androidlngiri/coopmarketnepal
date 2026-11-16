import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { cn } from '../lib/utils';

export const DEFAULT_HERO_FALLBACK_IMAGE = '/images/hero-nepal-cooperative.jpg';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  variant?: 'product' | 'store' | 'banner' | 'default';
  compact?: boolean;
  lang?: 'ne' | 'en';
}

function BrandedCrestMark({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={compact ? 'w-7 h-7' : 'w-11 h-11'}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#B91C1C" />
      <rect x="8" y="8" width="48" height="48" rx="10" fill="none" stroke="#FDE68A" strokeWidth="1.5" strokeOpacity="0.65" />
      <path d="M16 40 L26 24 L33 34 L39 26 L48 40 Z" fill="#FFFFFF" fillOpacity="0.95" />
      <circle cx="43" cy="20" r="3.5" fill="#FDE68A" />
      <path d="M16 44 H48" stroke="#FDE68A" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SafeImage({
  src,
  alt,
  className,
  fallbackLabel,
  variant = 'default',
  compact = false,
  lang = 'ne',
}: SafeImageProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  const effectiveSrc =
    variant === 'store' && src === DEFAULT_HERO_FALLBACK_IMAGE ? '' : (src || '').trim();

  if (!effectiveSrc || errored) {
    if (variant === 'product') {
      if (compact) {
        return (
          <div
            className={cn(
              'relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FAF5F0] via-[#FFF8F1] to-[#F3EBE1] text-[#0F172A] select-none',
              className
            )}
            aria-label={alt}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-[#B91C1C]" />
            <BrandedCrestMark compact />
          </div>
        );
      }

      return (
        <div
          className={cn(
            'relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FAF6F0] via-[#FFFBF5] to-[#F3ECE2] text-[#0F172A] p-4 text-center select-none',
            className
          )}
          aria-label={alt}
        >
          {/* Subtle top & bottom Nepali crimson/emerald identity bars */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#B91C1C] via-[#991B1B] to-[#15803D]" />
          <div
            className="absolute inset-0 opacity-[0.045] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(#B91C1C 1px, transparent 1px), radial-gradient(#0F172A 1px, transparent 1px)',
              backgroundSize: '18px 18px',
              backgroundPosition: '0 0, 9px 9px',
            }}
          />

          <div className="relative z-10 flex flex-col items-center max-w-[88%]">
            <BrandedCrestMark />
            <p className="mt-2 font-display text-sm sm:text-base font-bold tracking-tight text-[#0F172A] leading-tight">
              {lang === 'ne' ? 'सहकारी बजार नेपाल' : 'Sahakari Bazar Nepal'}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold tracking-wider uppercase text-[#B91C1C]">
              {lang === 'ne' ? 'प्रमाणित सहकारी उत्पादन' : 'Verified Cooperative Produce'}
            </p>
            {fallbackLabel && (
              <p className="mt-2 px-2.5 py-0.5 rounded bg-white/85 border border-[#E5E2DC] text-[11px] font-medium text-[#57534E] line-clamp-1">
                {fallbackLabel}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (variant === 'store') {
      return (
        <div
          className={cn(
            'relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FAF6F0] to-[#EFE8DC] text-[#0F172A] p-2 text-center select-none',
            className
          )}
          aria-label={alt}
        >
          <BrandedCrestMark compact={compact} />
          {!compact && fallbackLabel && (
            <span className="mt-1 text-[10px] font-semibold text-[#57534E] line-clamp-1">{fallbackLabel}</span>
          )}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-gradient-to-br from-[#F3F1EC] to-[#E5E2DC] text-[#57534E] p-4 text-center',
          className
        )}
        aria-label={alt}
      >
        <Store className="w-7 h-7 mb-1.5 opacity-60" />
        {fallbackLabel && <span className="text-xs font-medium line-clamp-2">{fallbackLabel}</span>}
      </div>
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn('object-cover', className)}
    />
  );
}
