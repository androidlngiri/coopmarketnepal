import { useState } from 'react';
import { Store } from 'lucide-react';
import { cn } from '../lib/utils';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({ src, alt, className, fallbackLabel }: SafeImageProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
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
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn('object-cover', className)}
    />
  );
}
