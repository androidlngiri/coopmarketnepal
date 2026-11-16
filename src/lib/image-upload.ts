const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function optimizeImageFileToDataUrl(
  file: File,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    preservePng?: boolean;
  }
): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('कृपया PNG, JPG वा WEBP ढाँचाको फोटो छान्नुहोस्। (Please upload a PNG, JPG, or WEBP image.)');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('फोटो १५ MB भन्दा सानो हुनुपर्छ। (Image must be smaller than 15 MB.)');
  }

  const maxWidth = options?.maxWidth ?? 1200;
  const maxHeight = options?.maxHeight ?? 1200;
  const quality = options?.quality ?? 0.86;
  const preservePng = Boolean(options?.preservePng && file.type === 'image/png');

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('छवि फाइल पढ्न सकिएन। कृपया अर्को फोटो छान्नुहोस्।'));
      el.src = objectUrl;
    });

    const ratio = Math.min(1, maxWidth / Math.max(1, img.width), maxHeight / Math.max(1, img.height));
    const targetW = Math.max(1, Math.round(img.width * ratio));
    const targetH = Math.max(1, Math.round(img.height * ratio));

    // Keep small files directly if dimensions are already within bounds and size < 800 KB
    if (ratio === 1 && file.size <= 800 * 1024) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('फाइल पढ्न सकिएन।'));
        reader.readAsDataURL(file);
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('ब्राउजरमा छवि प्रशोधन गर्न सकिएन।');
    }

    if (!preservePng) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outputMime = preservePng ? 'image/png' : 'image/jpeg';
    let dataUrl = canvas.toDataURL(outputMime, quality);

    // If PNG exceeds ~2.5 MB base64, convert to JPEG so Vercel 4.5 MB payload cap is never hit
    if (dataUrl.length > 2_800_000) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
