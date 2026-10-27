// Spanish (es-US) — North American Hispanic market.
// Must mirror EN key set exactly (parity test enforces).

import type { I18nKey } from './en';

export const ES: Record<I18nKey, string> = {
  // Order status display labels
  'order.status.NEW': 'Nuevo',
  'order.status.PREPARING': 'Preparando',
  'order.status.READY_TO_EXPEDITE': 'Listo para Despachar',
  'order.status.READY_FOR_PICKUP': 'Listo para Recoger',
  'order.status.PICKED_UP': 'Recogido',
  'order.status.REMAKING': 'Rehaciendo',
  'order.status.EXPIRED': 'Expirado',
  'order.status.CANCELED': 'Cancelado',
  'order.status.SCHEDULED': 'Programado',

  // Order priority labels
  'order.priority.normal': '',
  'order.priority.rush': 'URGENTE',
  'order.priority.scheduled': 'PROGRAMADO',
  'order.priority.catering': 'CATERING',

  // Order source labels (proper nouns kept as-is)
  'order.source.pos': 'POS',
  'order.source.kiosk': 'Quiosco',
  'order.source.manual': 'Manual',
  'order.source.doordash': 'DoorDash',
  'order.source.ubereats': 'UberEats',
  'order.source.grubhub': 'Grubhub',
  'order.source.fantuan': 'Fantuan',
  'order.source.hungrypanda': 'HungryPanda',

  // TV column headers
  'tv.column.preparing': 'PREPARANDO',
  'tv.column.expediting': 'DESPACHANDO',
  'tv.column.ready': 'LISTO PARA RECOGER',

  // TV footer / connection state
  'tv.footer.connected': 'Conectado',
  'tv.footer.disconnected': 'Desconectado — última actualización {{time}}',
  'tv.footer.reconnecting': 'Reconectando…',

  // TV empty / idle
  'tv.empty.no_orders': 'No hay órdenes activas',
  'tv.empty.all_caught_up': 'Todo al día',
  'tv.idle.welcome': 'Bienvenido — estamos preparando su orden',
  'tv.idle.thanks': 'Gracias por su orden',

  // TV card secondary lines
  'tv.card.estimated': '~{{minutes}} min',
  'tv.card.eta_range': '{{min}}–{{max}} min',
  'tv.card.customer_anonymous': 'Cliente',

  // TTS templates
  'tts.ready_announce': 'Orden {{number}} lista para recoger',
  'tts.ready_batch': 'Órdenes {{numbers}} listas para recoger',
  'tts.ready_prefix': 'Órdenes',
  'tts.ready_suffix': 'listas para recoger',
  'tts.ready_recall': 'Orden {{number}}, su orden está lista',
  'tts.rush_prefix': 'Orden urgente',
  'tts.remake_ready': 'Orden {{number}} ha sido rehecha y está lista para recoger',

  // Tablet — pickup management
  'tablet.action.accept': 'Aceptar',
  'tablet.action.reject': 'Rechazar',
  'tablet.action.mark_ready': 'Marcar Listo',
  'tablet.action.mark_picked_up': 'Marcar Recogido',
  'tablet.action.undo': 'Deshacer',
  'tablet.action.recall': 'Volver a llamar',
  'tablet.action.remake': 'Rehacer',
  'tablet.action.modify': 'Modificar',
  'tablet.action.cancel': 'Cancelar',
  'tablet.action.complete_all': 'Completar Todos Listos',
  'tablet.action.reset_all': 'Reiniciar Todo',
  'tablet.action.emergency': 'Alerta de Emergencia',

  // Tablet — accept / reject flow
  'tablet.accept.new_order': 'Nueva orden #{{number}}',
  'tablet.accept.auto_in': 'Auto-aceptar en {{seconds}}s',
  'tablet.accept.auto_accepted': 'Auto-aceptado',
  'tablet.accept.reject_reason.sold_out': 'Agotado',
  'tablet.accept.reject_reason.kitchen_busy': 'Cocina ocupada',
  'tablet.accept.reject_reason.closed': 'Fuera de horario',
  'tablet.accept.reject_reason.other': 'Otro',

  // Tablet — feedback toasts
  'tablet.toast.picked_up': 'Orden #{{number}} recogida',
  'tablet.toast.undo_window': 'Toque Deshacer en {{seconds}}s',
  'tablet.toast.reconnected': 'Conectado',

  // Errors
  'error.network': 'Red no disponible',
  'error.unauthorized': 'Sesión expirada — por favor inicie sesión',
  'error.generic': 'Algo salió mal',
  'error.invalid_transition': 'No se puede cambiar el estado de {{from}} a {{to}}',

  // UX-001 states
  'ux.loading': 'Cargando…',
  'ux.empty': 'Nada aquí todavía',
  'ux.error': 'Algo salió mal',
  'ux.offline': 'Sin conexión',
};
