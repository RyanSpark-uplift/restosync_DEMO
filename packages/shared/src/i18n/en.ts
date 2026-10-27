// English (en-US) baseline strings. Canonical key set — es.ts (P2) and any future
// language must mirror these keys exactly. Parity test will live in apps/api tests.
//
// Spec: ORDER_PICKUP_DISPLAY_SPEC.md v2.1 (English translation of Korean source).
// Market: North America.

export const EN = {
  // Order status display labels — keys match SpecOrderStatus union.
  'order.status.NEW': 'New',
  'order.status.PREPARING': 'Preparing',
  'order.status.READY_TO_EXPEDITE': 'Ready to Expedite',
  'order.status.READY_FOR_PICKUP': 'Ready for Pickup',
  'order.status.PICKED_UP': 'Picked Up',
  'order.status.REMAKING': 'Remaking',
  'order.status.EXPIRED': 'Expired',
  'order.status.CANCELED': 'Canceled',
  'order.status.SCHEDULED': 'Scheduled',

  // Order priority labels.
  'order.priority.normal': '',
  'order.priority.rush': 'RUSH',
  'order.priority.scheduled': 'SCHEDULED',
  'order.priority.catering': 'CATERING',

  // Order source labels (8 sources from ORDER_SOURCE).
  'order.source.pos': 'POS',
  'order.source.kiosk': 'Kiosk',
  'order.source.manual': 'Manual',
  'order.source.doordash': 'DoorDash',
  'order.source.ubereats': 'UberEats',
  'order.source.grubhub': 'Grubhub',
  'order.source.fantuan': 'Fantuan',
  'order.source.hungrypanda': 'HungryPanda',

  // TV column headers.
  'tv.column.preparing': 'PREPARING',
  'tv.column.expediting': 'EXPEDITING',
  'tv.column.ready': 'READY FOR PICKUP',

  // TV footer / connection state.
  'tv.footer.connected': 'Connected',
  'tv.footer.disconnected': 'Disconnected — last update {{time}}',
  'tv.footer.reconnecting': 'Reconnecting…',

  // TV empty / idle.
  'tv.empty.no_orders': 'No active orders',
  'tv.empty.all_caught_up': 'All caught up',
  'tv.idle.welcome': "Welcome — we're cooking your order",
  'tv.idle.thanks': 'Thank you for your order',

  // TV card secondary lines.
  'tv.card.estimated': '~{{minutes}} min',
  'tv.card.eta_range': '{{min}}–{{max}} min',
  'tv.card.customer_anonymous': 'Guest',

  // TTS templates ({{number}} = display_number).
  'tts.ready_announce': 'Order {{number}} is ready for pickup',
  'tts.ready_batch': 'Orders {{numbers}} are ready for pickup',
  'tts.ready_prefix': 'Orders',
  'tts.ready_suffix': 'are ready for pickup',
  'tts.ready_recall': 'Order {{number}}, your order is ready',
  'tts.rush_prefix': 'Rush order',
  'tts.remake_ready': 'Order {{number}} has been remade and is ready for pickup',

  // Tablet — pickup management.
  'tablet.action.accept': 'Accept',
  'tablet.action.reject': 'Reject',
  'tablet.action.mark_ready': 'Mark Ready',
  'tablet.action.mark_picked_up': 'Mark Picked Up',
  'tablet.action.undo': 'Undo',
  'tablet.action.recall': 'Recall',
  'tablet.action.remake': 'Remake',
  'tablet.action.modify': 'Modify',
  'tablet.action.cancel': 'Cancel',
  'tablet.action.complete_all': 'Complete All Ready',
  'tablet.action.reset_all': 'Reset All',
  'tablet.action.emergency': 'Emergency Broadcast',

  // Tablet — accept / reject flow.
  'tablet.accept.new_order': 'New order #{{number}}',
  'tablet.accept.auto_in': 'Auto-accept in {{seconds}}s',
  'tablet.accept.auto_accepted': 'Auto-accepted',
  'tablet.accept.reject_reason.sold_out': 'Sold out',
  'tablet.accept.reject_reason.kitchen_busy': 'Kitchen too busy',
  'tablet.accept.reject_reason.closed': 'Outside business hours',
  'tablet.accept.reject_reason.other': 'Other',

  // Tablet — feedback toasts.
  'tablet.toast.picked_up': 'Order #{{number}} picked up',
  'tablet.toast.undo_window': 'Tap Undo within {{seconds}}s',
  'tablet.toast.reconnected': 'Connected',

  // Errors.
  'error.network': 'Network unavailable',
  'error.unauthorized': 'Session expired — please sign in',
  'error.generic': 'Something went wrong',
  'error.invalid_transition': 'Cannot change status from {{from}} to {{to}}',

  // UX-001 states.
  'ux.loading': 'Loading…',
  'ux.empty': 'Nothing here yet',
  'ux.error': 'Something went wrong',
  'ux.offline': 'Offline',
} as const;

export type I18nKey = keyof typeof EN;
