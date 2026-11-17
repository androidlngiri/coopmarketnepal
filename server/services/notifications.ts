import { isValidNepalMobile, normalizeNepalPhone, sendAkashSms } from '../akash-sms.ts';
import { requireSupabaseAdmin } from '../supabase-admin.ts';

export async function notifySuperAdmins(params: {
  type: string;
  titleNe: string;
  titleEn: string;
  bodyNe: string;
  bodyEn: string;
  actionUrl?: string;
  smsText?: string;
  smsPurpose?: string;
  cooperativeId?: string | null;
}) {
  try {
    const sb = requireSupabaseAdmin();
    const { data: admins } = await sb
      .from('platform_administrators')
      .select('user_id, profiles:user_id (phone)')
      .eq('is_active', true);

    const adminRows = (admins || []) as Array<{
      user_id: string;
      profiles?: { phone?: string | null } | Array<{ phone?: string | null }> | null;
    }>;

    if (adminRows.length > 0) {
      await sb.from('notifications').insert(
        adminRows.map((a) => ({
          recipient_user_id: a.user_id,
          cooperative_id: null,
          type: params.type,
          title_ne: params.titleNe,
          title_en: params.titleEn,
          body_ne: params.bodyNe,
          body_en: params.bodyEn,
          action_url: params.actionUrl || '/super-admin',
        }))
      );
    }

    if (params.smsText) {
      const phones = new Set<string>();
      for (const a of adminRows) {
        const prof = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
        const phone = prof?.phone ? normalizeNepalPhone(String(prof.phone)) : '';
        if (phone && isValidNepalMobile(phone)) {
          phones.add(phone);
        }
      }

      const envAlertPhones = String(process.env.SUPER_ADMIN_ALERT_PHONE || '')
        .split(',')
        .map((p) => normalizeNepalPhone(p.trim()))
        .filter((p) => isValidNepalMobile(p));

      for (const p of envAlertPhones) {
        phones.add(p);
      }

      await Promise.all(
        Array.from(phones).map((phone) =>
          sendAkashSms({
            to: phone,
            text: params.smsText!,
            purpose: params.smsPurpose || params.type,
            cooperativeId: params.cooperativeId ?? null,
          })
        )
      );
    }
  } catch {
    // Non-blocking notification safeguard
  }
}
