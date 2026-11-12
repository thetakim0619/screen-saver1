// GET /api/pay/done?r=cancel|fail  (결제 취소/실패 시 돌아오는 곳)
'use strict';
module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const r = url.searchParams.get('r') || 'cancel';
  const msg = r === 'fail' ? '결제에 실패했어요.' : '결제를 취소했어요.';
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><body style="font-family:'Malgun Gothic',system-ui;background:#17181a;color:#e8e8ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:16px">${msg}</div><div style="color:#5a5f66;font-size:12px;margin-top:10px">이 창은 닫으셔도 됩니다.</div></div><script>setTimeout(function(){try{window.close()}catch(e){}},1800)</script></body></html>`);
};
