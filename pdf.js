'use strict';
/* 인쇄소용 PDF 만들기.
   - 글자·선·네모·모눈 전부 벡터(선과 글자 모양 그대로)로 그려서 해상도 걱정이 없습니다.
   - 색은 CMYK로 넣습니다. 검정은 K 한 가지(K 100%)로만 찍습니다.
   - 쪽마다 용지 크기 = 재단 크기 + 도련(+ 재단선 여백). TrimBox/BleedBox도 기록합니다.
   - 쓰인 글꼴은 파일 안에 통째로 넣습니다(인쇄소 컴퓨터에 글꼴이 없어도 똑같이 나옴). */
(function () {
  const NP = window.NP;
  const K = 72 / 25.4; // 1mm = 몇 pt

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-lib="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.dataset.lib = src; s.onload = res;
      s.onerror = () => rej(new Error(`${src} 파일을 불러오지 못했어요. 웹 주소로 열었는지 확인해 주세요.`));
      document.head.append(s);
    });
  }
  NP.loadPdfLibs = async () => {
    if (window.PDFLib && window.fontkit) return;
    await loadScript('lib/pdf-lib.min.js');
    await loadScript('lib/fontkit.umd.min.js');
  };

  /* doc: 노트 전체, o: { bleed, marks, pages:[쪽 번호(0부터)], title } */
  NP.exportPDF = async function (doc, o, progress = () => {}) {
    await NP.loadPdfLibs();
    const L = window.PDFLib, { PDFDocument, cmyk, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, concatTransformationMatrix, moveTo, lineTo, appendBezierCurve, closePath, stroke, fill, fillAndStroke, setLineWidth, setDashPattern, setStrokingColor, setFillingColor, setLineCap, LineCapStyle, drawObject } = L;
    const W = doc.page.w, H = doc.page.h, b = o.bleed;
    const mg = o.marks ? b + 8 : b;               // 재단선에서 종이 끝까지 거리(mm)
    const MW = (W + 2 * mg) * K, MH = (H + 2 * mg) * K;
    const X = x => (mg + x) * K, Y = y => MH - (mg + y) * K;
    const total = doc.pages.length;
    const colorOf = (id, t = 1) => {
      const c = doc.colors.find(q => q.id === id) || doc.colors[0];
      return cmyk(c.c * t / 100, c.m * t / 100, c.y * t / 100, c.k * t / 100);
    };

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    pdf.setTitle(o.title || '노트 내지');
    pdf.setCreator('노트 인쇄');
    pdf.setProducer('노트 인쇄 (pdf-lib)');

    /* ---- 글꼴 ---- */
    const fcache = new Map(), usedFonts = new Set(), missing = {};
    async function getFont(fam, bold) {
      const def = NP.fonts[fam] || NP.fonts.pretendard;
      const key = NP.fonts[fam] ? fam : 'pretendard';
      const wt = bold && def.files[700] ? 700 : 400;
      const id = key + '|' + wt;
      if (fcache.has(id)) return fcache.get(id);
      progress(`글꼴 넣는 중… ${def.label}`);
      const res = await fetch(def.files[wt]);
      if (!res.ok) throw new Error(`글꼴 파일(${def.files[wt]})을 불러오지 못했어요.`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const fk = window.fontkit.create(bytes);
      // 일부 글자만 담는 방식(subset)은 한글 글자가 빠지는 문제가 있어서, 글꼴 전체를 넣습니다.
      const pf = await pdf.embedFont(bytes, { subset: false, features: { calt: false, liga: false, clig: false } }); // 화면과 글자 폭이 같도록 자동 글자 바꿈 기능은 끔
      const f = { pf, fk, key, wt };
      fcache.set(id, f); usedFonts.add(`${def.label}${wt === 700 ? ' 굵게' : ''}`);
      return f;
    }

    /* ---- 바탕(모눈)은 한 번만 그려서 모든 쪽에 같은 걸 씁니다 ---- */
    const gridForms = new Map();
    async function gridForm(m) {
      if (!m || m.grid.type === 'none') return null;
      if (gridForms.has(m.id)) return gridForms.get(m.id);
      const tdoc = await PDFDocument.create();
      const TW = (W + 2 * b) * K, TH = (H + 2 * b) * K;
      const tp = tdoc.addPage([TW, TH]);
      const tx = x => (b + x) * K, ty = y => TH - (b + y) * K;
      const col = colorOf(m.grid.color, m.grid.tone / 100);
      const plan = NP.gridPlan(W, H, m.grid, b), { xs, ys } = plan;
      if (m.grid.type === 'square' || m.grid.type === 'line') {
        if (m.grid.type === 'square') for (const x of xs) tp.drawLine({ start: { x: tx(x), y: ty(plan.ay0) }, end: { x: tx(x), y: ty(plan.ay1) }, thickness: (m.grid.lw || 0.15) * K, color: col });
        for (const y of ys) tp.drawLine({ start: { x: tx(plan.ax0), y: ty(y) }, end: { x: tx(plan.ax1), y: ty(y) }, thickness: (m.grid.lw || 0.15) * K, color: col });
      } else if (m.grid.type === 'dot') {
        for (const y of ys) for (const x of xs) tp.drawCircle({ x: tx(x), y: ty(y), size: ((m.grid.dot || 0.6) / 2) * K, color: col, borderWidth: 0 });
      }
      const [emb] = await pdf.embedPdf(await tdoc.save());
      gridForms.set(m.id, emb);
      return emb;
    }

    /* ---- 물건 그리기 ---- */
    const safePages = new Set();

    /* ---- 사진: 인쇄용 CMYK로 바꿔 넣기 (크기에 맞춰 최대 300dpi까지만 쓰고, 투명한 곳은 흰 종이로) ---- */
    const imgRefs = new Map(), lowRes = [], missingImgs = new Set(), transparentPages = new Set(); let imgCounter = 0;
    async function imageRef(it) {
      const key = JSON.stringify([it.src, it.cl, it.ct, it.cr, it.cb, it.gray, Math.round(it.w * 10), Math.round(it.h * 10)]);
      if (imgRefs.has(key)) return imgRefs.get(key);
      const blob = o.getImage ? await o.getImage(it.src).catch(() => null) : null;
      if (!blob) { imgRefs.set(key, null); return null; }
      progress('사진을 인쇄용 색으로 바꾸는 중…');
      const url = URL.createObjectURL(blob), img = new Image();
      try {
        img.src = url; await img.decode();
        const sw = img.naturalWidth, sh = img.naturalHeight;
        const sx = it.cl * sw, sy = it.ct * sh, cw = (1 - it.cl - it.cr) * sw, ch = (1 - it.ct - it.cb) * sh;
        const tw = Math.max(1, Math.round(Math.min(it.w / 25.4 * 300, cw))), th = Math.max(1, Math.round(Math.min(it.h / 25.4 * 300, ch)));
        const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, sx, sy, cw, ch, 0, 0, tw, th);
        const rgba = cx.getImageData(0, 0, tw, th).data, out = new Uint8Array(tw * th * 4);
        let hasAlpha = false; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) { hasAlpha = true; break; }
        const alpha = hasAlpha ? new Uint8Array(tw * th) : null; // 투명한 PNG: 투명도는 따로(soft mask) 넣어서 투명 그대로 유지
        for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
          const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
          if (alpha) alpha[p] = a;
          if (a === 0) continue; // 완전 투명: 색 없음
          if (it.gray) { out[i + 3] = 255 - Math.round(0.299 * r + 0.587 * g + 0.114 * b); continue; } // 흑백: 검정(K)만
          const mx = Math.max(r, g, b);
          if (mx === 0) { out[i + 3] = 255; continue; }
          out[i] = Math.round((mx - r) / mx * 255); out[i + 1] = Math.round((mx - g) / mx * 255); out[i + 2] = Math.round((mx - b) / mx * 255); out[i + 3] = 255 - mx;
        }
        const dict = { Type: 'XObject', Subtype: 'Image', Width: tw, Height: th, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 };
        if (alpha) dict.SMask = pdf.context.register(pdf.context.flateStream(alpha, { Type: 'XObject', Subtype: 'Image', Width: tw, Height: th, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
        const stream = pdf.context.flateStream(out, dict);
        const res = { ref: pdf.context.register(stream), dpi: cw / (it.w / 25.4), transparent: hasAlpha };
        imgRefs.set(key, res); return res;
      } finally { URL.revokeObjectURL(url); }
    }
    const dashOpts = (dash, th) => dash ? { dashArray: NP.dashOf(th).map(v => v * K), dashPhase: 0 } : {};
    async function drawItem(page, it, gs, pageNo) {
      if (it.hide) return;
      const safe = NP.designArea(doc, Math.max(0, pageNo - 1));
      const outOfArea = bounds => !safe.valid || bounds.x < safe.x - 0.01 || bounds.y < safe.y - 0.01 || bounds.x + bounds.w > safe.x + safe.w + 0.01 || bounds.y + bounds.h > safe.y + safe.h + 0.01;
      if (it.type !== 'text' && outOfArea(NP.itemBounds(it))) safePages.add(pageNo);
      const color = colorOf(it.color, it.type !== 'text' && it.tone ? it.tone / 100 : 1); // 선 농도
      const dd = (dash, th) => (dash ? { dashArray: NP.dashOf(th).map(v => v * K), dashPhase: 0 } : {});
      if (it.type === 'line') { // 두 끝점을 잇는 선 (+ 화살표 머리)
        const ag = NP.arrowGeom(it);
        page.drawLine({ start: { x: X(ag.x1), y: Y(ag.y1) }, end: { x: X(ag.x2), y: Y(ag.y2) }, thickness: it.th * K, color, ...dd(it.dash, it.th) });
        for (const poly of ag.heads) page.pushOperators(pushGraphicsState(), setFillingColor(color), moveTo(X(poly[0][0]), Y(poly[0][1])), lineTo(X(poly[1][0]), Y(poly[1][1])), lineTo(X(poly[2][0]), Y(poly[2][1])), closePath(), fill(), popGraphicsState());
        return;
      }
      // 나머지: 물건의 가운데를 기준으로 돌려서 그린다 (화면의 회전과 같은 방향)
      const w = it.w; let hh = it.h, lines = null, lh = 0, f = null, Smm = 0, asc = 0, desc = 0, measure = null, rich = null;
      if (it.type === 'text') {
        const text = NP.resolveText(it.text, pageNo, total);
        if (!text.trim()) return;
        f = await getFont(it.font, it.bold);
        for (const ch of text) { const cp = ch.codePointAt(0); if (cp > 32 && !f.fk.hasGlyphForCodePoint(cp)) (missing[f.key] = missing[f.key] || new Set()).add(ch); }
        measure = s => f.pf.widthOfTextAtSize(s, it.pt) / K; // mm
        Smm = it.pt * NP.MM_PT; const upm = f.fk.unitsPerEm;
        asc = f.fk.ascent / upm; desc = -f.fk.descent / upm;
        if ((it.spans && it.spans.length) || it.align === 'justify' || it.align === 'distribute') {
          // 글자 일부 크기·색 / 양쪽 맞춤 / 균등 배분: 글자마다 폭을 재서 줄을 나눔 (화면과 같은 규칙)
          const rr = NP.resolveChars([...it.text], NP.charStyles(it, [...it.text].length), pageNo, total), chars = rr.chars, styles = rr.styles;
          const cw = chars.map((ch, i) => f.pf.widthOfTextAtSize(ch, styles[i].pt) / K), L = NP.layoutChars(chars, w, i => cw[i]);
          for (const ln of L) { let mx = it.pt; for (let j = ln.a; j < ln.b; j++) mx = Math.max(mx, styles[j].pt); ln.pt = mx; ln.lh = it.lh > 0 ? it.lh * gs : 1.35 * mx * NP.MM_PT; }
          rich = { chars, styles, cw, L };
          hh = L.reduce((t, ln) => t + ln.lh, 0);
        } else {
          lines = NP.wrapText(text, w, measure);
          lh = it.lh > 0 ? it.lh * gs : 1.35 * Smm;
          hh = lines.length * lh;
        }
        if (pageNo && outOfArea(NP.itemBounds(it, hh))) safePages.add(pageNo);
      }
      const th = -(it.rot || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
      const LX = x => (x - w / 2) * K, LY = y => (hh / 2 - y) * K; // 물건 안쪽 좌표(mm, 왼쪽 위가 0,0) → 가운데 기준 pt
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(cs, sn, -sn, cs, X(it.x + w / 2), Y(it.y + hh / 2)));
      const pathOps = ops => ops.map(o => (o[0] === 'M' ? moveTo(LX(o[1]), LY(o[2])) : o[0] === 'L' ? lineTo(LX(o[1]), LY(o[2])) : o[0] === 'C' ? appendBezierCurve(LX(o[1]), LY(o[2]), LX(o[3]), LY(o[4]), LX(o[5]), LY(o[6])) : closePath()));
      const strokeOps = (c, th2, dash, cap) => [setStrokingColor(c), setLineWidth(th2 * K), ...(dash ? [setDashPattern(NP.dashOf(th2).map(v => v * K), 0)] : []), ...(cap != null ? [setLineCap(cap)] : [])];
      if (it.type === 'shape' || it.type === 'path') {
        const ops = NP.shapePath(it), closed = NP.isClosedShape(it);
        if (closed && it.fill) { const fc = colorOf(it.fill.color, it.fill.tone / 100); page.pushOperators(pushGraphicsState(), setFillingColor(fc), ...pathOps(ops), fill(), popGraphicsState()); }
        if (closed && it.pat) {
          const pc = colorOf(it.pat.color), m = NP.patternMarks(it.pat, w, hh);
          page.pushOperators(pushGraphicsState(), ...pathOps(ops), clip(), endPath());
          if (it.pat.kind === 'dot') for (const [x, y] of m.dots) page.drawCircle({ x: LX(x), y: LY(y), size: it.pat.size / 2 * K, color: pc, borderWidth: 0 });
          else {
            for (const x of m.vl) page.drawLine({ start: { x: LX(x), y: LY(0) }, end: { x: LX(x), y: LY(hh) }, thickness: it.pat.size * K, color: pc });
            for (const y of m.hl) page.drawLine({ start: { x: LX(0), y: LY(y) }, end: { x: LX(w), y: LY(y) }, thickness: it.pat.size * K, color: pc });
          }
          page.pushOperators(popGraphicsState());
        }
        if (it.stroke !== false) page.pushOperators(pushGraphicsState(), ...strokeOps(color, it.th, it.dash, null), ...pathOps(ops), stroke(), popGraphicsState());
      } else if (it.type === 'table') {
        const g = NP.tableGeom(it);
        for (const c of g.cells) {
          const cst = NP.cellStyle(it, c.key);
          if (cst.fill) page.pushOperators(pushGraphicsState(), setFillingColor(colorOf(cst.fill.color, cst.fill.tone / 100)), rectangle(LX(c.x), LY(c.y + c.h), c.w * K, c.h * K), fill(), popGraphicsState());
        }
        for (const [x1, y1, x2, y2] of NP.tableSegments(it))
          page.drawLine({ start: { x: LX(x1), y: LY(y1) }, end: { x: LX(x2), y: LY(y2) }, thickness: it.th * K, color, lineCap: it.dash ? LineCapStyle.Butt : LineCapStyle.Projecting, ...dd(it.dash, it.th) });
        for (const c of g.cells) {
          const cst = NP.cellStyle(it, c.key), text = NP.resolveText(cst.text, pageNo, total);
          if (!text.trim()) continue;
          const cf = await getFont(cst.font, cst.bold);
          for (const ch of text) { const cp = ch.codePointAt(0); if (cp > 32 && !cf.fk.hasGlyphForCodePoint(cp)) (missing[cf.key] = missing[cf.key] || new Set()).add(ch); }
          const pad = 1, cm = s2 => cf.pf.widthOfTextAtSize(s2, cst.pt) / K, cl = NP.wrapText(text, Math.max(1, c.w - 2 * pad), cm);
          const cS = cst.pt * NP.MM_PT, clh = 1.35 * cS, upm = cf.fk.unitsPerEm, ca = cf.fk.ascent / upm, cd = -cf.fk.descent / upm, total2 = cl.length * clh;
          const y0 = cst.valign === 'middle' ? (c.h - total2) / 2 : cst.valign === 'bottom' ? c.h - pad - total2 : pad;
          page.pushOperators(pushGraphicsState(), rectangle(LX(c.x), LY(c.y + c.h), c.w * K, c.h * K), clip(), endPath());
          cl.forEach((raw, i) => {
            const line = raw.replace(/ +$/, ''); if (!line) return;
            const lw = cm(line), x = cst.align === 'center' ? (c.w - lw) / 2 : cst.align === 'right' ? c.w - pad - lw : pad;
            const base = y0 + i * clh + (clh - (ca + cd) * cS) / 2 + ca * cS;
            page.drawText(line, { x: LX(c.x + x), y: LY(c.y + base), size: cst.pt, font: cf.pf, color: colorOf(cst.color) });
          });
          page.pushOperators(popGraphicsState());
        }
      } else if (it.type === 'image') {
        const im = await imageRef(it);
        if (!im) missingImgs.add(it.name || it.src);
        else {
          const nm = page.node.newXObject('Im' + (++imgCounter), im.ref);
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(w * K, 0, 0, hh * K, LX(0), LY(hh)), drawObject(nm), popGraphicsState());
          if (im.transparent) transparentPages.add(pageNo);
          if (im.dpi < 300 && !lowRes.some(x => x.page === pageNo && x.dpi === Math.round(im.dpi))) lowRes.push({ page: pageNo, dpi: Math.round(im.dpi) });
        }
      } else if (it.type === 'text' && rich) {
        let y0 = 0;
        for (const ln of rich.L) {
          const S = ln.pt * NP.MM_PT, base = y0 + (ln.lh - (asc + desc) * S) / 2 + asc * S;
          let nsp = 0; for (let j = ln.a; j < ln.b; j++) if (rich.chars[j] === ' ') nsp++;
          const gaps = ln.b - ln.a - 1;
          const exSp = it.align === 'justify' && !ln.last && nsp > 0 ? (w - ln.w) / nsp : 0, exCh = it.align === 'distribute' && gaps > 0 ? (w - ln.w) / gaps : 0;
          let x = it.align === 'center' ? (w - ln.w) / 2 : it.align === 'right' ? w - ln.w : 0, run = null;
          const flush = () => { if (run) { page.drawText(run.t, { x: LX(run.x), y: LY(base), size: run.pt, font: f.pf, color: colorOf(run.color) }); run = null; } };
          for (let j = ln.a; j < ln.b; j++) {
            const ch = rich.chars[j], st = rich.styles[j];
            if (exCh) { flush(); if (ch !== ' ') page.drawText(ch, { x: LX(x), y: LY(base), size: st.pt, font: f.pf, color: colorOf(st.color) }); x += rich.cw[j] + exCh; continue; }
            if (ch === ' ') { flush(); x += rich.cw[j] + exSp; continue; }
            if (run && run.pt === st.pt && run.color === st.color) run.t += ch; else { flush(); run = { t: ch, x, pt: st.pt, color: st.color }; }
            x += rich.cw[j];
          }
          flush();
          y0 += ln.lh;
        }
      } else if (it.type === 'text') {
        lines.forEach((raw, i) => {
          const line = raw.replace(/ +$/, '');
          if (!line) return;
          const lw = measure(line);
          const x = it.align === 'center' ? (w - lw) / 2 : it.align === 'right' ? w - lw : 0;
          const base = i * lh + (lh - (asc + desc) * Smm) / 2 + asc * Smm;
          page.drawText(line, { x: LX(x), y: LY(base), size: it.pt, font: f.pf, color });
        });
      }
      page.pushOperators(popGraphicsState());
    }

    /* ---- 쪽 만들기 ---- */
    const plan = o.pages.map(i => ({ idx: i }));
    if (o.blankEnd && o.pages.length) plan.push({ blank: true }); // 양면 인쇄용: 쪽수가 홀수이면 끝에 빈 쪽 1개
    let n = 0;
    for (const pl of plan) {
      const blank = !!pl.blank, lastPg = doc.pages[o.pages[o.pages.length - 1]];
      const pg = blank ? { master: lastPg.master, items: [], guides: [] } : doc.pages[pl.idx], pageNo = blank ? total + 1 : pl.idx + 1, m = doc.masters.find(q => q.id === pg.master) || null;
      progress(`${++n} / ${plan.length} 쪽 만드는 중…`);
      const page = pdf.addPage([MW, MH]);
      page.setBleedBox((mg - b) * K, (mg - b) * K, (W + 2 * b) * K, (H + 2 * b) * K);
      page.setTrimBox(mg * K, mg * K, W * K, H * K);
      page.pushOperators(pushGraphicsState(), rectangle((mg - b) * K, (mg - b) * K, (W + 2 * b) * K, (H + 2 * b) * K), clip(), endPath());
      for (const bgx of [m && m.bg, pg.bg]) { const bi = NP.bgItem(bgx, W, H, b); if (bi) await drawItem(page, bi, 5, pageNo); } // 양식(밖에서 만든 노트 양식) — 맨 아래
      const form = await gridForm(m);
      if (form) page.drawPage(form, { x: (mg - b) * K, y: (mg - b) * K, width: (W + 2 * b) * K, height: (H + 2 * b) * K });
      const gs = m ? m.grid.size : 5;
      if (m) for (const it of m.items) await drawItem(page, it, gs, pageNo);
      for (const it of pg.items) await drawItem(page, it, gs, pageNo);
      if (!blank) { const ni = NP.pageNumItem(doc, pl.idx); if (ni) await drawItem(page, ni, gs, pageNo); }
      page.pushOperators(popGraphicsState());

      if (o.marks) {
        const reg = cmyk(1, 1, 1, 1), th = 0.25;
        for (const [cx, cy, sx, sy] of [[0, 0, -1, -1], [W, 0, 1, -1], [0, H, -1, 1], [W, H, 1, 1]]) {
          page.drawLine({ start: { x: X(cx + sx * (b + 1)), y: Y(cy) }, end: { x: X(cx + sx * (b + 6)), y: Y(cy) }, thickness: th, color: reg });
          page.drawLine({ start: { x: X(cx), y: Y(cy + sy * (b + 1)) }, end: { x: X(cx), y: Y(cy + sy * (b + 6)) }, thickness: th, color: reg });
        }
        const f = await getFont('pretendard', false);
        page.drawText(`${o.title || '노트'}  ·  ${pageNo}/${total}쪽  ·  재단 ${W}×${H}mm  ·  도련 ${b}mm`, { x: X(8), y: Y(-(b + 4.5)), size: 6, font: f.pf, color: cmyk(0, 0, 0, 1) });
      }
      await new Promise(r => setTimeout(r)); // 화면이 멈추지 않게 잠깐 숨 돌리기
    }

    progress('파일로 묶는 중…');
    const bytes = await pdf.save();
    const missingList = Object.entries(missing).map(([k, set]) => `${NP.fonts[k].label}에 없는 글자: ${[...set].join(' ')}`);
    return {
      bytes,
      info: {
        pages: plan.length, blankAdded: !!(o.blankEnd && o.pages.length), trim: `${W}×${H}mm`, bleed: b, marks: !!o.marks,
        media: `${r1(MW / K)}×${r1(MH / K)}mm`, fonts: [...usedFonts],
        missing: missingList, safePages: [...safePages].sort((a, c) => a - c), lowRes, missingImages: [...missingImgs], transparentPages: [...transparentPages].sort((a, c) => a - c),
      },
    };
  };
  const r1 = v => Math.round(v * 10) / 10;
})();
