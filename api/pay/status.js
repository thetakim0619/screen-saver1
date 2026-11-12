// GET /api/pay/status?order=..  -> { status, purchased }
// 위젯이 결제창을 띄운 뒤 폴링해서 완료를 확인한다.
'use strict';
const { kvGet } = require('../_store');
const { send } = require('../_http');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const url = new URL(req.url, 'http://x');
  const orderId = url.searchParams.get('order');
  if (!orderId) return send(res, 400, { error: 'order 필요' });
  const order = await kvGet(`sw:pay:${orderId}`);
  if (!order) return send(res, 200, { status: 'expired' });
  return send(res, 200, { status: order.status, purchased: order.purchased == null ? null : order.purchased });
};
