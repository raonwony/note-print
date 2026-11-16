'use strict';
/* 화면(app.js)과 PDF 내보내기(pdf.js)가 같이 쓰는 규칙들.
   두 곳이 같은 계산을 쓰기 때문에, 화면에서 본 것과 인쇄소 PDF가 같게 나옵니다. */
(function () {
  const NP = (window.NP = window.NP || {});
  NP.MM_PT = 25.4 / 72;

  /* 글꼴: 화면(@font-face, style.css)과 PDF(파일을 직접 넣음)가 같은 파일을 씁니다. */
  NP.fonts = {
    pretendard: { label: 'Pretendard (고딕)', css: "'NP-Pretendard'", files: { 400: 'fonts/Pretendard-Regular.ttf', 700: 'fonts/Pretendard-Bold.ttf' } },
    nanumpen: { label: '나눔손글씨 펜 (손글씨)', css: "'NP-NanumPen'", files: { 400: 'fonts/NanumPenScript-Regular.ttf' } },
    poorstory: { label: '푸어스토리 (손글씨)', css: "'NP-PoorStory'", files: { 400: 'fonts/PoorStory-Regular.ttf' } },
    gaegu: { label: '개구 (손글씨, 일상 글자만)', css: "'NP-Gaegu'", files: { 400: 'fonts/Gaegu-Regular.ttf', 700: 'fonts/Gaegu-Bold.ttf' }, limited: true },
  };

  /* 색: 인쇄용 CMYK(%)로 저장합니다. 검정은 K 한 가지로만 찍습니다.
     group: basic(검정·회색, 고정) / brand(iLang 브랜드 색, 값 수정 가능) / mine(내 색, 추가·삭제 가능) */
  NP.defaultColors = () => [
    { id: 'k100', name: '검정', group: 'basic', c: 0, m: 0, y: 0, k: 100, fixed: true },
    { id: 'k70', name: '진한 회색', group: 'basic', c: 0, m: 0, y: 0, k: 70, fixed: true },
    { id: 'k40', name: '회색', group: 'basic', c: 0, m: 0, y: 0, k: 40, fixed: true },
    { id: 'k20', name: '연한 회색', group: 'basic', c: 0, m: 0, y: 0, k: 20, fixed: true },
    // iLang 브랜드 색상표 (iLang_Final Deck 7쪽)
    { id: 'b-ink', name: 'Ink Black', group: 'brand', c: 0, m: 0, y: 0, k: 92 },
    { id: 'b-char', name: 'Charcoal', group: 'brand', c: 0, m: 22, y: 7, k: 77 },
    { id: 'b-stone', name: 'Stone Gray', group: 'brand', c: 0, m: 3, y: 8, k: 44 },
    { id: 'b-warm', name: 'Warm Gray', group: 'brand', c: 0, m: 2, y: 7, k: 21 },
    { id: 'b-ivory', name: 'Soft Ivory', group: 'brand', c: 0, m: 2, y: 5, k: 7 },
    { id: 'b-paper', name: 'Paper White', group: 'brand', c: 0, m: 1, y: 3, k: 3 },
    { id: 'b-orange', name: 'iLang Orange', group: 'brand', c: 0, m: 56, y: 81, k: 5 },
    { id: 'b-blue', name: 'Ripple Blue', group: 'brand', c: 43, m: 18, y: 0, k: 13 },
    // 브랜드 색에 어울리게 더한 자연스러운 녹색 (#8cb37a 쯤)
    { id: 'b-green', name: 'Leaf Green', group: 'brand', c: 22, m: 0, y: 32, k: 30 },
  ];
  NP.MAX_CUSTOM_COLORS = 12;
  NP.rgbToCmyk = (r, g, b) => { // 브랜드 색상표와 같은 단순 계산식 (r,g,b: 0~255)
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    const f = v => Math.round((1 - v - k) / (1 - k) * 100);
    return { c: f(r), m: f(g), y: f(b), k: Math.round(k * 100) };
  };
  NP.cmykToHex = (c, m, y, k) => '#' + [c, m, y].map(v => Math.round(255 * (1 - v / 100) * (1 - k / 100)).toString(16).padStart(2, '0')).join('');
  /* 화면에 보이는 색(RGB)은 CMYK를 단순 환산한 것이라 실제 인쇄색과 조금 다를 수 있습니다. */
  NP.cmykToRgb = (c, m, y, k, t = 1) => {
    const f = v => Math.round(255 * (1 - (v * t) / 100) * (1 - (k * t) / 100));
    return `rgb(${f(c)},${f(m)},${f(y)})`;
  };

  /* 모눈 줄·점의 위치 (도련 영역까지 이어서). 가장자리 여백이 같도록 가운데 맞춥니다. */
  NP.gridGeometry = (w, h, size, bleed) => {
    const r3 = v => Math.round(v * 1000) / 1000;
    const ox = (w % size) / 2, oy = (h % size) / 2, xs = [], ys = [];
    for (let i = Math.ceil((-bleed - ox) / size - 1e-9); i <= Math.floor((w + bleed - ox) / size + 1e-9); i++) xs.push(r3(ox + i * size));
    for (let i = Math.ceil((-bleed - oy) / size - 1e-9); i <= Math.floor((h + bleed - oy) / size + 1e-9); i++) ys.push(r3(oy + i * size));
    return { xs, ys, ox, oy };
  };

  /* "칸 나누기" 도형의 안쪽 줄들 (물건 안쪽 기준 mm) */
  NP.cellLines = it => {
    const out = [];
    for (let i = 1; i < it.cols; i++) out.push([it.w * i / it.cols, 0, it.w * i / it.cols, it.h]);
    for (let j = 1; j < it.rows; j++) out.push([0, it.h * j / it.rows, it.w, it.h * j / it.rows]);
    return out;
  };
  NP.dashOf = th => [Math.max(1.5, th * 5), Math.max(1, th * 3)];

  /* 글 속의 {쪽}, {전체}를 쪽 번호로 바꿉니다. */
  NP.resolveText = (text, pageNo, total) => String(text).replace(/\{쪽\}/g, pageNo).replace(/\{전체\}/g, total);

  /* 줄바꿈 규칙: 띄어쓰기에서만 줄을 바꾸고, 한 낱말이 너무 길면 글자 단위로 자릅니다.
     (화면 쪽은 CSS word-break:keep-all + overflow-wrap:anywhere 로 같은 규칙) */
  NP.wrapText = (text, maxW, measure) => {
    const out = [];
    for (const para of String(text).split('\n')) {
      const toks = para.match(/ +|[^ ]+/g) || [];
      let line = '', lw = 0;
      for (const t of toks) {
        if (t[0] === ' ') { line += t; lw += measure(t); continue; }
        const w = measure(t);
        if (lw + w <= maxW + 1e-6) { line += t; lw += w; continue; }
        if (line.trim() !== '') { out.push(line); line = ''; lw = 0; }
        if (w <= maxW + 1e-6) { line = t; lw = w; continue; }
        for (const ch of [...t]) {
          const cw = measure(ch);
          if (lw + cw > maxW + 1e-6 && line !== '') { out.push(line); line = ''; lw = 0; }
          line += ch; lw += cw;
        }
      }
      out.push(line);
    }
    return out;
  };

  /* ---------- 도형 윤곽 (화면 SVG와 PDF가 같은 좌표를 씁니다) ---------- */
  const KAPPA = 0.5522847498;
  function smoothPath(pts, closed) { // 점들을 부드러운 곡선(Catmull-Rom → 베지어)으로 잇기
    const n = pts.length, ops = [];
    if (n < 2) return ops;
    const P = i => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
    ops.push(['M', pts[0][0], pts[0][1]]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      ops.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
    }
    if (closed) ops.push(['Z']);
    return ops;
  }
  NP.shapePath = it => { // 물건 안쪽 좌표(mm, 왼쪽 위가 0,0)의 윤곽선 명령들
    const w = it.w, h = it.h;
    if (it.type === 'path') return smoothPath(it.pts.map(p => [p[0] * w, p[1] * h]), it.closed);
    if (it.kind === 'ellipse') {
      const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
      return [['M', cx + rx, cy], ['C', cx + rx, cy + KAPPA * ry, cx + KAPPA * rx, cy + ry, cx, cy + ry], ['C', cx - KAPPA * rx, cy + ry, cx - rx, cy + KAPPA * ry, cx - rx, cy],
        ['C', cx - rx, cy - KAPPA * ry, cx - KAPPA * rx, cy - ry, cx, cy - ry], ['C', cx + KAPPA * rx, cy - ry, cx + rx, cy - KAPPA * ry, cx + rx, cy], ['Z']];
    }
    if (it.kind === 'triangle') return [['M', w / 2, 0], ['L', w, h], ['L', 0, h], ['Z']];
    if (it.kind === 'star') {
      const n = Math.max(3, Math.min(12, Math.round(it.pts) || 5)), raw = [];
      for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? 0.42 : 1; raw.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const ops = raw.map((p, i) => [i ? 'L' : 'M', (p[0] - x0) / (x1 - x0) * w, (p[1] - y0) / (y1 - y0) * h]);
      ops.push(['Z']); return ops;
    }
    const r = Math.max(0, Math.min(it.r || 0, w / 2, h / 2)), k = r * (1 - KAPPA);
    if (r <= 0) return [['M', 0, 0], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']];
    return [['M', r, 0], ['L', w - r, 0], ['C', w - k, 0, w, k, w, r], ['L', w, h - r], ['C', w, h - k, w - k, h, w - r, h], ['L', r, h], ['C', k, h, 0, h - k, 0, h - r], ['L', 0, r], ['C', 0, k, k, 0, r, 0], ['Z']];
  };
  NP.opsToD = ops => ops.map(o => o.join(' ').replace(/^(.) /, '$1')).join(' ');
  NP.isClosedShape = it => it.type === 'shape' || (it.type === 'path' && it.closed);

  /* 무늬 채우기(도트·격자·줄)의 표시 위치 — 도형의 왼쪽 위를 기준으로 */
  NP.patternMarks = (pat, w, h) => {
    const g = Math.max(1, pat.gap || 3), out = { dots: [], vl: [], hl: [] };
    if (pat.kind === 'dot') { for (let y = g / 2; y < h + g; y += g) for (let x = g / 2; x < w + g; x += g) { out.dots.push([x, y]); if (out.dots.length > 9000) return out; } }
    else { if (pat.kind === 'grid') for (let x = 0; x <= w + 1e-6; x += g) out.vl.push(x); for (let y = 0; y <= h + 1e-6; y += g) out.hl.push(y); }
    return out;
  };

  /* 화살표: 끝점에 삼각형 머리를 달고, 선은 머리 밑에서 끊어서 뾰족한 끝이 삐져나오지 않게 */
  NP.arrowGeom = it => {
    let { x1, y1, x2, y2 } = it;
    const len = Math.hypot(x2 - x1, y2 - y1), heads = [];
    if (len < 0.01 || (it.ah !== 'arrow' && it.at !== 'arrow')) return { x1, y1, x2, y2, heads };
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, L = Math.min(len / 2, Math.max(2.5, it.th * 7)), Wd = L * 0.5;
    const make = (tx, ty, dx, dy) => { const bx = tx - dx * L, by = ty - dy * L; return { poly: [[tx, ty], [bx - dy * Wd, by + dx * Wd], [bx + dy * Wd, by - dx * Wd]], base: [bx + dx * L * 0.15, by + dy * L * 0.15] }; };
    if (it.ah === 'arrow') { const m = make(x2, y2, ux, uy); heads.push(m.poly); [x2, y2] = m.base; }
    if (it.at === 'arrow') { const m = make(it.x1, it.y1, -ux, -uy); heads.push(m.poly); [x1, y1] = m.base; }
    return { x1, y1, x2, y2, heads };
  };

  /* ---------- 표 ---------- */
  NP.tableGeom = it => {
    const R = it.rh.length, C = it.cw.length, X = [0], Y = [0];
    for (const v of it.cw) X.push(X[X.length - 1] + v);
    for (const v of it.rh) Y.push(Y[Y.length - 1] + v);
    const owner = Array.from({ length: R }, () => Array(C).fill(null)), cells = [];
    for (const m of it.merges || []) {
      if (m.r < 0 || m.c < 0 || m.r + m.rs > R || m.c + m.cs > C) continue;
      let clash = false; for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (owner[r][c]) clash = true;
      if (clash) continue;
      for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) owner[r][c] = { r: m.r, c: m.c, rs: m.rs, cs: m.cs };
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (!owner[r][c]) owner[r][c] = { r, c, rs: 1, cs: 1 };
      const o = owner[r][c];
      if (o.r === r && o.c === c) cells.push({ r, c, rs: o.rs, cs: o.cs, x: X[c], y: Y[r], w: X[c + o.cs] - X[c], h: Y[r + o.rs] - Y[r], key: r + ',' + c });
    }
    return { R, C, X, Y, owner, cells };
  };
  NP.tableSegments = it => {
    const g = NP.tableGeom(it), { R, C, X, Y, owner } = g, segs = [], same = (a, b) => a.r === b.r && a.c === b.c;
    for (let i = 0; i <= C; i++) {
      if (!it.outer && (i === 0 || i === C)) continue;
      let start = null;
      for (let r = 0; r <= R; r++) {
        const on = r < R && !(i > 0 && i < C && same(owner[r][i - 1], owner[r][i]));
        if (on && start === null) start = r;
        if (!on && start !== null) { segs.push([X[i], Y[start], X[i], Y[r]]); start = null; }
      }
    }
    for (let j = 0; j <= R; j++) {
      if (!it.outer && (j === 0 || j === R)) continue;
      let start = null;
      for (let c = 0; c <= C; c++) {
        const on = c < C && !(j > 0 && j < R && same(owner[j - 1][c], owner[j][c]));
        if (on && start === null) start = c;
        if (!on && start !== null) { segs.push([X[start], Y[j], X[c], Y[j]]); start = null; }
      }
    }
    return segs;
  };
  NP.cellStyle = (it, key) => ({ font: 'pretendard', pt: 9, bold: false, align: 'left', valign: 'top', color: 'k100', text: '', fill: null, ...((it.cells || {})[key] || {}) });

  /* ---------- 쪽 번호 (한 번에 자동 + 쪽마다 예외) ---------- */
  // 안전 여백: 기본값(doc.safe)을 네 면에 똑같이 쓰고, 면마다 따로 정한 값(doc.safeSides)이 있으면 그 값을 써요
  NP.safeOf = doc => { const s = doc.safe || 0, o = doc.safeSides || {}, v = k => (o[k] >= 0 ? o[k] : s); return { t: v('t'), r: v('r'), b: v('b'), l: v('l') }; };
  NP.pageNumItem = (doc, idx, pg) => {
    const pn = doc.pageNum; pg = pg || doc.pages[idx];
    if (!pn || !pn.on || !pg) return null;
    const ov = pg.num || {}; if (ov.off) return null;
    const hh = ov.h || pn.h, vv = ov.v || pn.v, W = doc.page.w, H = doc.page.h, sf = NP.safeOf(doc), mL = Math.max(sf.l, 4), mR = Math.max(sf.r, 4), mT = Math.max(sf.t, 4), mB = Math.max(sf.b, 4), bw = 24, lineH = pn.pt * NP.MM_PT * 1.35;
    const rightPage = idx % 2 === 0; // 1쪽·3쪽… 은 펼친 책의 오른쪽 페이지
    let x, align;
    if (hh === 'center') { x = (W - bw) / 2; align = 'center'; } else if (rightPage) { x = W - mR - bw; align = 'right'; } else { x = mL; align = 'left'; }
    return { type: 'text', id: -1, x, y: vv === 'top' ? mT : H - mB - lineH, w: bw, text: String((pn.start || 1) + idx), pt: pn.pt, bold: false, align, font: pn.font || 'pretendard', color: pn.color || 'k100', lh: 0, rot: 0, lock: true, hide: false, gid: null };
  };

  /* ---------- 모눈 그리는 범위·시작 위치 ---------- */
  NP.gridPlan = (w, h, g, bleed) => {
    const s = g.size, I = g.inset || { l: 0, t: 0, r: 0, b: 0 }, r3 = v => Math.round(v * 1000) / 1000;
    const tx0 = I.l, tx1 = w - I.r, ty0 = I.t, ty1 = h - I.b;
    const ax0 = I.l > 0 ? tx0 : -bleed, ax1 = I.r > 0 ? tx1 : w + bleed, ay0 = I.t > 0 ? ty0 : -bleed, ay1 = I.b > 0 ? ty1 : h + bleed;
    let ox, oy;
    if (g.start === 'corner') { ox = tx0; oy = ty0; } else { ox = tx0 + ((tx1 - tx0) % s) / 2; oy = ty0 + ((ty1 - ty0) % s) / 2; }
    ox += g.dx || 0; oy += g.dy || 0;
    const xs = [], ys = [];
    for (let i = Math.ceil((ax0 - ox) / s - 1e-9); i <= Math.floor((ax1 - ox) / s + 1e-9); i++) xs.push(r3(ox + i * s));
    for (let i = Math.ceil((ay0 - oy) / s - 1e-9); i <= Math.floor((ay1 - oy) / s + 1e-9); i++) ys.push(r3(oy + i * s));
    return { xs, ys, ox, oy, ax0, ax1, ay0, ay1 };
  };
  NP.GUIDE_COLORS = [['#14b8d4', '하늘'], ['#2563eb', '파랑'], ['#16a34a', '초록'], ['#f59e0b', '주황'], ['#9333ea', '보라'], ['#e11d48', '분홍']];
})();
