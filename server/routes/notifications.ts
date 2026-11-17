import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import { requireSupabaseAdmin } from '../supabase-admin.ts';

export const notificationsRouter = Router();

export interface SmartAlertItem {
  id: string;
  severity: 'urgent' | 'warning' | 'info';
  title_ne: string;
  title_en: string;
  body_ne: string;
  body_en: string;
  action_url: string;
}

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  try {
    const sb = requireSupabaseAdmin();
    const user = req.authUser!;

    let notifQuery = sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);

    if (user.cooperative_id) {
      notifQuery = notifQuery.or(`recipient_user_id.eq.${user.id},cooperative_id.eq.${user.cooperative_id}`);
    } else {
      notifQuery = notifQuery.eq('recipient_user_id', user.id);
    }

    const { data: rows } = await notifQuery;
    const notifications = rows || [];
    const unreadNotificationsCount = notifications.filter((n: Record<string, unknown>) => !n.is_read).length;

    const smartAlerts: SmartAlertItem[] = [];

    if (user.role === 'super_admin') {
      const [pendingCoopsRes, pendingPaysRes, openTicketsRes] = await Promise.all([
        sb
          .from('cooperatives')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending_review', 'pending_otp'])
          .is('deleted_at', null),
        sb.from('subscription_payments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ]);

      const pendingCoops = pendingCoopsRes.count || 0;
      const pendingPays = pendingPaysRes.count || 0;
      const openTickets = openTicketsRes.count || 0;

      if (pendingCoops > 0) {
        smartAlerts.push({
          id: 'alert_pending_coops',
          severity: 'urgent',
          title_ne: `${pendingCoops} सहकारी स्वीकृतिको प्रतीक्षामा`,
          title_en: `${pendingCoops} Cooperative(s) Awaiting Review`,
          body_ne: 'दर्ता कागजात र OTP जाँच गरी पसल स्वीकृत वा समीक्षा गर्नुहोस्।',
          body_en: 'Review registration documents and approve pending cooperative stores.',
          action_url: '/super-admin?tab=cooperatives',
        });
      }
      if (pendingPays > 0) {
        smartAlerts.push({
          id: 'alert_pending_payments',
          severity: 'warning',
          title_ne: `${pendingPays} सदस्यता भुक्तानी प्रमाणीकरण बाँकी`,
          title_en: `${pendingPays} Subscription Payment(s) Pending`,
          body_ne: 'सहकारी सदस्यता नवीकरण भौचर पुष्टि गर्नुहोस्।',
          body_en: 'Verify cooperative subscription payment vouchers.',
          action_url: '/super-admin?tab=plans',
        });
      }
      if (openTickets > 0) {
        smartAlerts.push({
          id: 'alert_open_tickets',
          severity: 'info',
          title_ne: `${openTickets} खुला सहायता टिकट`,
          title_en: `${openTickets} Open Support Ticket(s)`,
          body_ne: 'सहकारीबाट आएका प्रश्न वा सहायता अनुरोधहरू हेर्नुहोस्।',
          body_en: 'Reply to open cooperative support tickets.',
          action_url: '/super-admin?tab=logs',
        });
      }
    } else if ((user.role === 'cooperative_admin' || user.role === 'cooperative_staff') && user.cooperative_id) {
      const [coopRes, pendingOrdRes, prodsRes] = await Promise.all([
        sb.from('cooperatives').select('status').eq('id', user.cooperative_id).maybeSingle(),
        sb
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('cooperative_id', user.cooperative_id)
          .eq('status', 'pending'),
        sb
          .from('products')
          .select('stock_quantity, low_stock_threshold')
          .eq('cooperative_id', user.cooperative_id)
          .is('deleted_at', null)
          .limit(100),
      ]);

      const coopStatus = coopRes.data?.status;
      if (coopStatus === 'pending_otp') {
        smartAlerts.push({
          id: 'alert_coop_otp',
          severity: 'urgent',
          title_ne: 'मोबाइल OTP प्रमाणीकरण बाँकी छ',
          title_en: 'Mobile OTP Verification Pending',
          body_ne: 'आफ्नो सहकारी आवेदन समीक्षामा पठाउन OTP प्रमाणित गर्नुहोस्।',
          body_en: 'Verify your cooperative mobile OTP to submit for approval.',
          action_url: '/cooperative?tab=overview',
        });
      } else if (coopStatus === 'pending_review') {
        smartAlerts.push({
          id: 'alert_coop_review',
          severity: 'info',
          title_ne: 'सुपर एडमिन स्वीकृतिको प्रतीक्षामा',
          title_en: 'Awaiting Super Admin Approval',
          body_ne: 'तपाईं मस्यौदा उत्पादन र पसल डिजाइन तयार पार्न सक्नुहुन्छ।',
          body_en: 'Your application is under review. You can pre-fill store & draft products.',
          action_url: '/cooperative?tab=store',
        });
      }

      const pendingOrders = pendingOrdRes.count || 0;
      if (pendingOrders > 0) {
        smartAlerts.push({
          id: 'alert_coop_pending_orders',
          severity: 'urgent',
          title_ne: `${pendingOrders} नयाँ अर्डर प्रशोधन गर्न बाँकी`,
          title_en: `${pendingOrders} New Order(s) Need Action`,
          body_ne: 'ग्राहकको अर्डर पुष्टि गरी डेलिभरी प्रक्रिया अघि बढाउनुहोस्।',
          body_en: 'Confirm and process waiting customer orders quickly.',
          action_url: '/cooperative?tab=orders',
        });
      }

      const lowStockCount = (prodsRes.data || []).filter(
        (p: Record<string, unknown>) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)
      ).length;
      if (lowStockCount > 0) {
        smartAlerts.push({
          id: 'alert_coop_low_stock',
          severity: 'warning',
          title_ne: `${lowStockCount} उत्पादनको स्टक न्यून छ`,
          title_en: `${lowStockCount} Product(s) Low on Stock`,
          body_ne: 'स्टक समाप्त हुनुअघि इन्भेन्टरी अद्यावधिक गर्नुहोस्।',
          body_en: 'Restock low-inventory products early to avoid missed sales.',
          action_url: '/cooperative?tab=inventory',
        });
      }
    } else {
      const { count: activeOrders } = await sb
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_user_id', user.id)
        .in('status', ['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped']);

      if ((activeOrders || 0) > 0) {
        smartAlerts.push({
          id: 'alert_buyer_active_orders',
          severity: 'info',
          title_ne: `${activeOrders} सक्रिय अर्डर प्रक्रियामा`,
          title_en: `${activeOrders} Active Order(s) In Progress`,
          body_ne: 'अर्डर स्थिति र डेलिभरी विवरण हेर्न यहाँ क्लिक गर्नुहोस्।',
          body_en: 'Click to view your latest order status and invoice.',
          action_url: '/account',
        });
      }
    }

    res.json({
      notifications,
      smartAlerts,
      unreadCount: unreadNotificationsCount + smartAlerts.length,
      unreadNotificationsCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch notifications' });
  }
});

notificationsRouter.post('/read-all', async (req, res) => {
  const sb = requireSupabaseAdmin();
  const user = req.authUser!;
  if (user.cooperative_id) {
    await sb
      .from('notifications')
      .update({ is_read: true })
      .or(`recipient_user_id.eq.${user.id},cooperative_id.eq.${user.cooperative_id}`);
  } else {
    await sb.from('notifications').update({ is_read: true }).eq('recipient_user_id', user.id);
  }
  res.json({ ok: true });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const sb = requireSupabaseAdmin();
  const user = req.authUser!;
  if (user.cooperative_id) {
    await sb
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .or(`recipient_user_id.eq.${user.id},cooperative_id.eq.${user.cooperative_id}`);
  } else {
    await sb.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('recipient_user_id', user.id);
  }
  res.json({ ok: true });
});
