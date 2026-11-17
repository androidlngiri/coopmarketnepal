import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, ChevronRight, Info, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, toNepaliDigits } from '../lib/bs-date';

interface SmartAlertItem {
  id: string;
  severity: 'urgent' | 'warning' | 'info';
  title_ne: string;
  title_en: string;
  body_ne: string;
  body_en: string;
  action_url: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title_ne: string;
  title_en: string;
  body_ne: string;
  body_en: string;
  action_url?: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsPayload {
  notifications: NotificationRow[];
  smartAlerts: SmartAlertItem[];
  unreadCount: number;
  unreadNotificationsCount: number;
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { lang, user, navigate } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NotificationsPayload>({
    notifications: [],
    smartAlerts: [],
    unreadCount: 0,
    unreadNotificationsCount: 0,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const res = await apiFetch<NotificationsPayload>('/api/notifications');
    if (res.ok && res.data) {
      setData(res.data);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setData({ notifications: [], smartAlerts: [], unreadCount: 0, unreadNotificationsCount: 0 });
      setOpen(false);
      return;
    }
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    const onFocus = () => void loadNotifications();
    const onRefresh = () => void loadNotifications();
    window.addEventListener('focus', onFocus);
    window.addEventListener('sahakari:refresh-notifications', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('sahakari:refresh-notifications', onRefresh);
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const totalCount = data.unreadCount;
  const hasUrgent = data.smartAlerts.some((a) => a.severity === 'urgent');

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await loadNotifications();
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    const res = await apiFetch('/api/notifications/read-all', { method: 'POST' });
    if (res.ok) {
      setData((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
        unreadNotificationsCount: 0,
        unreadCount: prev.smartAlerts.length,
      }));
    }
  };

  const handleClickAlert = (url: string) => {
    setOpen(false);
    if (url) navigate(url);
  };

  const handleClickNotification = async (n: NotificationRow) => {
    if (!n.is_read) {
      void apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      setData((prev) => {
        const nextList = prev.notifications.map((x) => (x.id === n.id ? { ...x, is_read: true } : x));
        const nextUnreadNotifs = nextList.filter((x) => !x.is_read).length;
        return {
          ...prev,
          notifications: nextList,
          unreadNotificationsCount: nextUnreadNotifs,
          unreadCount: nextUnreadNotifs + prev.smartAlerts.length,
        };
      });
    }
    setOpen(false);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={lang === 'ne' ? 'सूचना तथा स्मार्ट अलर्ट' : 'Notifications & Early Alerts'}
        title={lang === 'ne' ? 'सूचना तथा स्मार्ट अलर्ट' : 'Notifications & Early Alerts'}
        className={`relative inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
          compact ? 'h-8 w-8' : 'h-9 w-9'
        } ${
          open
            ? 'border-[#0F172A] bg-[#F3F1EC] text-[#0F172A]'
            : 'border-[#E5E2DC] bg-white text-[#0F172A] hover:bg-[#F3F1EC]'
        }`}
      >
        <Bell className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${hasUrgent ? 'text-[#B91C1C]' : ''}`} />
        {totalCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center tabular-nums leading-none ${
              hasUrgent ? 'bg-[#B91C1C]' : 'bg-[#0F172A]'
            }`}
          >
            {totalCount > 99
              ? lang === 'ne'
                ? '९९+'
                : '99+'
              : lang === 'ne'
              ? toNepaliDigits(totalCount)
              : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute right-3 sm:right-0 top-16 sm:top-11 z-50 w-[calc(100vw-1.5rem)] sm:w-96 max-h-[75vh] flex flex-col bg-white border border-[#E5E2DC] rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E5E2DC] bg-[#FAF9F6] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-[#B91C1C] shrink-0" />
              <span className="text-xs font-bold text-[#0F172A] truncate">
                {lang === 'ne' ? 'स्मार्ट अलर्ट र सूचनाहरू' : 'Smart Alerts & Notifications'}
              </span>
            </div>
            {data.unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B91C1C] hover:underline cursor-pointer shrink-0"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{lang === 'ne' ? 'सबै पढिएको' : 'Mark all read'}</span>
              </button>
            )}
          </div>

          <div className="overflow-y-auto divide-y divide-[#F3F1EC]">
            {loading && data.smartAlerts.length === 0 && data.notifications.length === 0 && (
              <div className="p-6 text-center text-xs text-[#78716C]">
                {lang === 'ne' ? 'सूचना लोड हुँदैछ...' : 'Loading notifications...'}
              </div>
            )}

            {/* Early Catch Smart Alerts */}
            {data.smartAlerts.length > 0 && (
              <div className="p-3 bg-[#FAF9F6]/70 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#78716C] px-1">
                  {lang === 'ne' ? 'तत्काल ध्यान दिनुपर्ने (Early Catch)' : 'Early Catch Action Alerts'}
                </p>
                {data.smartAlerts.map((alert) => {
                  const style =
                    alert.severity === 'urgent'
                      ? 'border-red-200 bg-red-50/70 text-red-950'
                      : alert.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50/80 text-amber-950'
                      : 'border-emerald-200 bg-emerald-50/70 text-emerald-950';
                  const IconComp =
                    alert.severity === 'urgent' || alert.severity === 'warning' ? AlertTriangle : Info;
                  const iconColor =
                    alert.severity === 'urgent'
                      ? 'text-[#B91C1C]'
                      : alert.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-[#15803D]';
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => handleClickAlert(alert.action_url)}
                      className={`w-full text-left p-2.5 rounded-lg border ${style} hover:opacity-90 transition-opacity flex items-start justify-between gap-2 cursor-pointer`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug">
                            {lang === 'ne' ? alert.title_ne : alert.title_en}
                          </p>
                          <p className="text-[11px] opacity-80 leading-snug mt-0.5">
                            {lang === 'ne' ? alert.body_ne : alert.body_en}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recorded Event Notifications */}
            {data.notifications.length === 0 ? (
              data.smartAlerts.length === 0 &&
              !loading && (
                <div className="p-8 text-center text-xs text-[#78716C] space-y-1">
                  <Bell className="w-6 h-6 mx-auto opacity-30" />
                  <p>{lang === 'ne' ? 'अहिले नयाँ सूचना छैन। सब ठीक छ!' : 'All caught up! No new notifications.'}</p>
                </div>
              )
            ) : (
              data.notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#FAF9F6] transition-colors flex items-start gap-2.5 cursor-pointer ${
                    !n.is_read ? 'bg-[#B91C1C]/[0.03]' : ''
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      !n.is_read ? 'bg-[#B91C1C]' : 'bg-transparent'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${!n.is_read ? 'font-semibold text-[#0F172A]' : 'font-medium text-[#44403C]'}`}>
                        {lang === 'ne' ? n.title_ne : n.title_en}
                      </p>
                      <span className="text-[10px] text-[#78716C] shrink-0">
                        {formatDateBS(n.created_at, lang)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#57534E] leading-snug mt-0.5">
                      {lang === 'ne' ? n.body_ne : n.body_en}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
