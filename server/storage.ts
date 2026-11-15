import crypto from 'crypto';
import { getSupabaseAdminClient } from './supabase-admin.ts';

export type StorageBucket =
  | 'cooperative-logos'
  | 'cooperative-documents'
  | 'product-images'
  | 'store-banners';

export async function uploadBase64ToSupabaseStorage(params: {
  dataUrl: string;
  bucket: StorageBucket;
  folder: string;
  allowPdf?: boolean;
}): Promise<{ url: string; size: number }> {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    throw new Error('Supabase Storage कन्फिगर गरिएको छैन।');
  }

  const pattern = params.allowPdf
    ? /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/
    : /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/;

  const match = params.dataUrl.match(pattern);
  if (!match) {
    throw new Error(
      params.allowPdf
        ? 'अमान्य फाइल ढाँचा (PNG/JPG/WEBP/PDF मात्र)।'
        : 'अमान्य छवि ढाँचा (PNG/JPG/WEBP मात्र)।'
    );
  }

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('फाइल साइज ५ MB भन्दा कम हुनुपर्छ।');
  }

  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const safeFolder = params.folder.replace(/[^a-zA-Z0-9_-]/g, '');
  const objectPath = `${safeFolder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await sb.storage.from(params.bucket).upload(objectPath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase Storage अपलोड त्रुटि: ${error.message}`);
  }

  if (params.bucket === 'cooperative-documents') {
    return {
      url: `storage://cooperative-documents/${objectPath}`,
      size: buffer.length,
    };
  }

  const { data } = sb.storage.from(params.bucket).getPublicUrl(objectPath);
  return {
    url: data.publicUrl,
    size: buffer.length,
  };
}

export async function resolveDocumentAccessUrl(fileUrl: string): Promise<string> {
  if (!fileUrl.startsWith('storage://')) {
    return fileUrl;
  }
  const sb = getSupabaseAdminClient();
  if (!sb) return fileUrl;

  const rest = fileUrl.slice('storage://'.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return fileUrl;

  const bucket = rest.slice(0, slashIdx);
  const objectPath = rest.slice(slashIdx + 1);
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(objectPath, 3600);
  if (error || !data?.signedUrl) {
    return fileUrl;
  }
  return data.signedUrl;
}
