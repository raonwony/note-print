'use strict';
/* 노트 인쇄 — 모눈(바탕) 위에 글자·선·네모를 올려 여러 쪽짜리 노트를 만들고,
   집에서 인쇄하거나 인쇄소에 보낼 PDF로 내보내는 앱.
   길이는 모두 mm(밀리미터)로 저장합니다. 화면 배율은 CSS 변수 --u (1mm가 화면에서 몇 px인지)로만 바뀝니다. */
(() => {
const NP = window.NP, MM_PT = NP.MM_PT, FONTS = NP.fonts;
const NS = 'http://www.w3.org/2000/svg';

const PRESETS = [
  { id: 'a4', name: 'A4', w: 210, h: 297 }, { id: 'a5', name: 'A5', w: 148, h: 210 },
  { id: 'a6', name: 'A6', w: 105, h: 148 }, { id: 'a6s', name: 'A6 슬림', w: 85, h: 148 }, { id: 'a7', name: 'A7', w: 74, h: 105 },
  { id: 'b5', name: 'B5', w: 176, h: 250 }, { id: 'b6', name: 'B6', w: 128, h: 182 }, { id: 'b6s', name: 'B6 슬림', w: 106, h: 182 }, { id: 'b7', name: 'B7', w: 91, h: 128 },
  { id: 'bible', name: '바이블 (6공)', w: 95, h: 171 }, { id: 'm5', name: 'M5 마이크로5 (5공)', w: 62, h: 105 },
];
// 새 파일 만들 때 보여주는 크기 (슬림은 임시값 — 나중에 실물에 맞춰 고치기)
const SIZE_SETS = {
  binder: [{ k: 'bible', n: '바이블 (6공)', w: 95, h: 171, hole: 'bible' }, { k: 'a5', n: 'A5 (6공)', w: 148, h: 210, hole: 'a5' }, { k: 'a6', n: 'A6 (6공)', w: 105, h: 148, hole: 'a6' }, { k: 'm5', n: 'M5 마이크로5 (5공)', w: 62, h: 105, hole: 'm5' }],
  bound: [{ k: 'a6', n: 'A6', w: 105, h: 148 }, { k: 'a6s', n: 'A6 슬림', w: 85, h: 148 }, { k: 'b6', n: 'B6', w: 128, h: 182 }, { k: 'b6s', n: 'B6 슬림', w: 106, h: 182 }, { k: 'a5', n: 'A5', w: 148, h: 210 }, { k: 'a7', n: 'A7', w: 74, h: 105 }, { k: 'b7', n: 'B7', w: 91, h: 128 }],
};
// 링 구멍: 구멍 사이 간격(mm). 가장자리 거리는 자료가 없어 추정값(실물 확인 후 수정)
const HOLE_PRESETS = {
  bible: { name: '바이블 6공', gaps: [19, 19, 51, 19, 19], dia: 5, edge: 6 },
  a5: { name: 'A5 6공', gaps: [19, 19, 70, 19, 19], dia: 6, edge: 6 },
  a6: { name: 'A6 6공', gaps: [19, 19, 38, 19, 19], dia: 5, edge: 5 },
  m5: { name: 'M5 5공', gaps: [19, 19, 19, 19], dia: 4, edge: 4 },
};
const SHEETS = [
  { name: 'A4', w: 210, h: 297 }, { name: 'A3', w: 297, h: 420 }, { name: 'B5', w: 176, h: 250 },
  { name: 'B4', w: 250, h: 353 }, { name: 'Letter', w: 215.9, h: 279.4 },
];
const LS = { cur: 'noteprint.current.v2', cur1: 'noteprint.current.v1', saved: 'noteprint.saved.v2', saved1: 'noteprint.saved.v1', sizes: 'noteprint.sizes.v1', print: 'noteprint.print.v2' };

/* ---------- 작은 도우미 ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } };
const r2 = v => Math.round(v * 100) / 100;
const U = v => `calc(var(--u)*${(+v).toFixed(3)})`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = d => d * Math.PI / 180;
const normDeg = d => { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; };
function rotPt(px, py, cx, cy, deg) { // 화면(아래가 +y)에서 시계 방향으로 deg도 돌림
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

/* ---------- 노트 전체(doc) ---------- */
function defaultDoc() {
  return {
    v: 5, kind: 'free', page: { w: 105, h: 148 }, bleed: 5, safe: 5, snap: true, colors: NP.defaultColors(),
    guideSets: [],
    pageNum: { on: false, h: 'outer', v: 'bottom', start: 1, pt: 8, font: 'pretendard', color: 'k100' },
    holes: { on: false, preset: 'custom', gaps: [19, 19, 38, 19, 19], dia: 5, edge: 6, est: true },
    masters: [{ id: 'm1', name: '바탕 1', grid: { type: 'square', size: 5, tone: 35, color: 'k100' }, guides: [], items: [] }],
    pages: [{ id: 'p1', master: 'm1', guides: [], items: [] }],
  };
}
const HEX_MAP = { '#111111': 'k100', '#555555': 'k70', '#999999': 'k40', '#c0392b': 'b-orange' };
function normalize(s) {
  const d = defaultDoc();
  if (!s || typeof s !== 'object') return d;
  let src = s;
  if (!s.pages) { // 예전(1쪽짜리) 저장본 → 새 구조로
    const g = s.grid || {};
    src = { page: s.page, snap: g.snap !== false, masters: [{ id: 'm1', name: '바탕 1', grid: { type: g.type, size: g.size, tone: g.tone }, items: [] }], pages: [{ id: 'p1', master: 'm1', items: s.items }] };
  }
  const old = !(src.v >= 3);
  const o = { v: 5, kind: ['free', 'binder', 'bound'].includes(src.kind) ? src.kind : 'free', page: { ...d.page, ...src.page }, bleed: clamp(+src.bleed >= 0 ? +src.bleed : 5, 0, 10), safe: clamp(+src.safe >= 0 ? +src.safe : 5, 0, 20), snap: src.snap !== false, colors: d.colors, masters: [], pages: [] };
  o.page.w = clamp(+o.page.w || d.page.w, 20, 500); o.page.h = clamp(+o.page.h || d.page.h, 20, 500);
  { // 색 목록: 기본·브랜드 색은 항상 있고(브랜드 색은 고친 값 유지), 그 밖의 색은 "내 색"으로 남김
    const saved = Array.isArray(src.colors) ? src.colors.filter(q => q && typeof q.id === 'string') : [];
    const nv = v => clamp(Math.round(+v) || 0, 0, 100);
    o.colors = d.colors.map(c => { const q = saved.find(x => x.id === c.id); return q && !c.fixed ? { ...c, name: String(q.name || c.name), c: nv(q.c), m: nv(q.m), y: nv(q.y), k: nv(q.k) } : c; });
    for (const q of saved) {
      if (o.colors.some(c => c.id === q.id) || !/^[A-Za-z0-9_-]{1,24}$/.test(q.id)) continue;
      if (o.colors.filter(c => c.group === 'mine').length >= NP.MAX_CUSTOM_COLORS) break;
      o.colors.push({ id: q.id, name: String(q.name || '내 색'), group: 'mine', c: nv(q.c), m: nv(q.m), y: nv(q.y), k: nv(q.k) });
    }
  }
  const mc = v => (o.colors.some(c => c.id === v) ? v : HEX_MAP[String(v).toLowerCase()] || 'k100');
  { // 쪽 번호·링 구멍 설정
    const pn = src.pageNum || {}, hl = src.holes || {};
    o.pageNum = { on: !!pn.on, h: pn.h === 'center' ? 'center' : 'outer', v: pn.v === 'top' ? 'top' : 'bottom', start: clamp(Math.round(+pn.start) || 1, -99, 9999), pt: clamp(+pn.pt || 8, 4, 40), font: FONTS[pn.font] ? pn.font : 'pretendard', color: mc(pn.color || 'k100') };
    const gaps = Array.isArray(hl.gaps) && hl.gaps.length ? hl.gaps.map(v => clamp(+v || 19, 3, 120)).slice(0, 11) : [19, 19, 38, 19, 19];
    o.holes = { on: !!hl.on, preset: typeof hl.preset === 'string' ? hl.preset : 'custom', gaps, dia: clamp(+hl.dia || 5, 3, 6), edge: clamp(+hl.edge || 6, 1.5, 25), est: hl.est !== false };
  }
  const used = new Set(); let next = 1;
  const all = [...(src.masters || []).flatMap(m => (m && m.items) || []), ...(src.pages || []).flatMap(p => (p && p.items) || [])];
  for (const it of all) if (it && Number.isInteger(it.id)) next = Math.max(next, it.id + 1);
  const ZO = { shape: 0, table: 0, path: 1, line: 1, text: 2 };
  const fillOf = f => (f && typeof f === 'object' ? { color: mc(f.color), tone: clamp(+f.tone || 100, 5, 100) } : null);
  const patOf = p => (p && ['dot', 'grid', 'line'].includes(p.kind) ? { kind: p.kind, color: mc(p.color || 'k40'), size: clamp(+p.size || 0.4, 0.1, 3), gap: clamp(+p.gap || 3, 1, 30) } : null);
  const sum = a => a.reduce((t, v) => t + v, 0);
  const items = arr => {
    const out = [];
    for (let it of Array.isArray(arr) ? arr : []) {
      if (!it) continue;
      if (it.type === 'rect') it = { ...it, type: 'shape', kind: 'rect', stroke: true };           // 예전 "네모" → 도형
      else if (it.type === 'cells') {                                                                // 예전 "칸 나누기" → 표
        const cols = clamp(Math.round(+it.cols) || 2, 1, 40), rows = clamp(Math.round(+it.rows) || 2, 1, 80), w = +it.w || 40, hh = +it.h || 40;
        it = { ...it, type: 'table', cw: Array(cols).fill(w / cols), rh: Array(rows).fill(hh / rows), cells: {}, merges: [] };
      }
      if (!['text', 'line', 'shape', 'path', 'table', 'image'].includes(it.type)) continue;
      let id = Number.isInteger(it.id) && !used.has(it.id) ? it.id : next++;
      used.add(id);
      const b = { type: it.type, id, color: mc(it.color), rot: normDeg(+it.rot || 0), lock: !!it.lock, hide: !!it.hide, gid: typeof it.gid === 'string' ? it.gid : null, ar: !!it.ar };
      if (it.type === 'text') {
        const font = FONTS[it.font] ? it.font : 'pretendard';
        Object.assign(b, { x: +it.x || 0, y: +it.y || 0, w: +it.w || 30, pt: +it.pt || 12, text: String(it.text ?? ''), bold: !!it.bold && !!FONTS[font].files[700], align: ['left', 'center', 'right'].includes(it.align) ? it.align : 'left', font, lh: +it.lh || 0 });
      } else if (it.type === 'line') {
        let { x1, y1, x2, y2 } = it;
        if (![x1, y1, x2, y2].every(Number.isFinite)) { // 예전 방식(방향+길이) 변환
          const x = +it.x || 0, y = +it.y || 0, len = +it.len || 20;
          x1 = x; y1 = y; x2 = it.dir === 'v' ? x : x + len; y2 = it.dir === 'v' ? y + len : y;
        }
        Object.assign(b, { x1, y1, x2, y2, rot: 0, th: +it.th || 0.3, dash: !!it.dash, ah: it.ah === 'arrow' ? 'arrow' : 'none', at: it.at === 'arrow' ? 'arrow' : 'none' });
      } else if (it.type === 'shape') {
        Object.assign(b, { x: +it.x || 0, y: +it.y || 0, w: Math.max(0.5, +it.w || 20), h: Math.max(0.5, +it.h || 10), kind: ['rect', 'ellipse', 'triangle', 'star'].includes(it.kind) ? it.kind : 'rect', r: +it.r || 0, pts: clamp(Math.round(+it.pts) || 5, 3, 12), th: +it.th || 0.3, dash: !!it.dash, stroke: it.stroke !== false, fill: fillOf(it.fill), pat: patOf(it.pat) });
      } else if (it.type === 'path') {
        const pts = (Array.isArray(it.pts) ? it.pts : []).filter(p => Array.isArray(p) && p.length >= 2).map(p => [clamp(+p[0] || 0, 0, 1), clamp(+p[1] || 0, 0, 1)]);
        if (pts.length < 2) continue;
        const closed = !!it.closed;
        Object.assign(b, { x: +it.x || 0, y: +it.y || 0, w: Math.max(0.5, +it.w || 10), h: Math.max(0.5, +it.h || 10), pts, closed, th: +it.th || 0.4, dash: !!it.dash, stroke: it.stroke !== false, fill: closed ? fillOf(it.fill) : null, pat: closed ? patOf(it.pat) : null });
      } else if (it.type === 'image') {
        if (typeof it.src !== 'string' || !it.src) continue;
        let cl = clamp(+it.cl || 0, 0, 0.95), cr = clamp(+it.cr || 0, 0, 0.95), ct = clamp(+it.ct || 0, 0, 0.95), cb = clamp(+it.cb || 0, 0, 0.95);
        if (cl + cr > 0.95) cl = cr = 0; if (ct + cb > 0.95) ct = cb = 0;
        Object.assign(b, { x: +it.x || 0, y: +it.y || 0, w: Math.max(0.5, +it.w || 20), h: Math.max(0.5, +it.h || 20), src: it.src, nw: Math.max(1, Math.round(+it.nw) || 1000), nh: Math.max(1, Math.round(+it.nh) || 1000), name: String(it.name || ''), cl, ct, cr, cb, gray: !!it.gray });
      } else { // table
        const cw = (Array.isArray(it.cw) && it.cw.length ? it.cw : [20, 20]).map(v => Math.max(2, +v || 10)), rh = (Array.isArray(it.rh) && it.rh.length ? it.rh : [8, 8]).map(v => Math.max(2, +v || 8));
        const cells = {};
        for (const [k, v] of Object.entries(it.cells && typeof it.cells === 'object' ? it.cells : {})) {
          if (!/^\d+,\d+$/.test(k) || !v) continue;
          const font = FONTS[v.font] ? v.font : 'pretendard';
          cells[k] = { font, pt: clamp(+v.pt || 9, 4, 80), bold: !!v.bold && !!FONTS[font].files[700], align: ['left', 'center', 'right'].includes(v.align) ? v.align : 'left', valign: ['top', 'middle', 'bottom'].includes(v.valign) ? v.valign : 'top', color: mc(v.color), text: String(v.text ?? ''), fill: fillOf(v.fill) };
        }
        const merges = (Array.isArray(it.merges) ? it.merges : []).filter(m => m && [m.r, m.c, m.rs, m.cs].every(Number.isInteger) && m.rs * m.cs > 1).map(m => ({ r: m.r, c: m.c, rs: m.rs, cs: m.cs }));
        Object.assign(b, { x: +it.x || 0, y: +it.y || 0, cw, rh, w: sum(cw), h: sum(rh), cells, merges, th: +it.th || 0.3, dash: !!it.dash, outer: it.outer !== false });
      }
      out.push(b);
    }
    if (old) out.sort((a, b) => ZO[a.type] - ZO[b.type]); // 예전 파일: 네모 < 선 < 글자 순서를 그대로 유지
    return out;
  };
  const gcolors = NP.GUIDE_COLORS.map(x => x[0]);
  const guides = arr => (Array.isArray(arr) ? arr : []).filter(g => g && (g.axis === 'x' || g.axis === 'y') && Number.isFinite(+g.pos)).map((g, i) => ({ id: String(g.id || 'g' + i + Math.random().toString(36).slice(2, 6)), axis: g.axis, pos: +g.pos, ...(gcolors.includes(g.color) ? { color: g.color } : {}), ...(g.lock ? { lock: true } : {}) }));
  const mids = new Set();
  for (const m of src.masters || []) {
    if (!m) continue;
    let id = typeof m.id === 'string' && !mids.has(m.id) ? m.id : 'm' + (mids.size + 100);
    mids.add(id);
    const g = m.grid || {};
    o.masters.push({ id, name: String(m.name || '바탕'), grid: { type: ['square', 'dot', 'line', 'none'].includes(g.type) ? g.type : 'square', size: clamp(+g.size || 5, 2, 30), tone: clamp(+g.tone || 35, 5, 100), color: mc(g.color || 'k100'), lw: clamp(+g.lw || 0.15, 0.05, 1), dot: clamp(+g.dot || 0.6, 0.2, 3), inset: { l: clamp(+(g.inset || {}).l || 0, 0, 60), t: clamp(+(g.inset || {}).t || 0, 0, 60), r: clamp(+(g.inset || {}).r || 0, 0, 60), b: clamp(+(g.inset || {}).b || 0, 0, 60) }, start: g.start === 'corner' ? 'corner' : 'center', dx: clamp(+g.dx || 0, -60, 60), dy: clamp(+g.dy || 0, -60, 60) }, guides: guides(m.guides), items: items(m.items) });
  }
  const pids = new Set();
  for (const p of src.pages || []) {
    if (!p) continue;
    let id = typeof p.id === 'string' && !pids.has(p.id) ? p.id : 'p' + (pids.size + 100);
    pids.add(id);
    const pnum = p.num && typeof p.num === 'object' ? { ...(p.num.off ? { off: true } : {}), ...(p.num.h === 'outer' || p.num.h === 'center' ? { h: p.num.h } : {}), ...(p.num.v === 'top' || p.num.v === 'bottom' ? { v: p.num.v } : {}) } : null;
    o.pages.push({ id, master: o.masters.some(m => m.id === p.master) ? p.master : null, guides: guides(p.guides), items: items(p.items), ...(pnum && Object.keys(pnum).length ? { num: pnum } : {}) });
  }
  if (!o.pages.length) o.pages.push({ id: 'p1', master: o.masters[0] ? o.masters[0].id : null, guides: [], items: [] });
  o.guideSets = (Array.isArray(src.guideSets) ? src.guideSets : []).slice(0, 30).map((q, i) => ({ id: String((q && q.id) || 'S' + i), name: String((q && q.name) || '가이드 묶음'), guides: guides(q && q.guides).map(({ axis, pos, color }) => ({ axis, pos, ...(color ? { color } : {}) })) })).filter(q => q.guides.length);
  return o;
}
let doc = normalize(lsGet(LS.cur, null) || lsGet(LS.cur1, null));
const ui = { tab: 'doc', tabManual: false, pageIdx: 0, editMaster: false, masterId: null, guides: true, rulers: true, userGuides: true, smart: true, guideScope: 'page', alignTo: 'sel', draw: false, guideColor: '#14b8d4', divArea: 'page' };
let selIds = [], selGuide = null, extraGuides = [], editingId = null, editingCell = null, cellSel = null, editBefore = null, zoom = 1;
let clip = null, fmt = null, pasteN = 0;
const els = new Map();

const curPage = () => doc.pages[ui.pageIdx];
const masterById = id => doc.masters.find(m => m.id === id) || null;
const ctxMaster = () => (ui.editMaster ? masterById(ui.masterId) : masterById(curPage().master));
const ctxItems = () => (ui.editMaster ? ctxMaster().items : curPage().items);
const ctxKey = () => (ui.editMaster ? 'm:' + ui.masterId : 'p:' + curPage().id);
const findItem = id => ctxItems().find(i => i.id === id);
const gridStep = () => { const m = ctxMaster(); return m ? m.grid.size : 5; };
const colorOf = id => doc.colors.find(c => c.id === id) || doc.colors[0];
const colorRGB = (id, t = 1) => { const c = colorOf(id); return NP.cmykToRgb(c.c, c.m, c.y, c.k, t); };
const isSel = id => selIds.includes(id);
const selItems = () => selIds.map(findItem).filter(Boolean);
function clampUI() {
  ui.pageIdx = clamp(ui.pageIdx, 0, doc.pages.length - 1);
  if (ui.editMaster && !masterById(ui.masterId)) ui.editMaster = false;
  selIds = selIds.filter(id => findItem(id));
  if (selGuide && !findGuide(selGuide)) selGuide = null;
}
const nextItemId = () => { let n = 1; for (const it of [...doc.masters.flatMap(m => m.items), ...doc.pages.flatMap(p => p.items)]) n = Math.max(n, it.id + 1); return n; };
const newId = (prefix, list) => { let n = 1; for (const x of list) { const v = parseInt(String(x.id).slice(1), 10); if (v >= n) n = v + 1; } return prefix + n; };
const newUid = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* ---------- 되돌리기·저장 ---------- */
const undoStack = [], redoStack = [];
let lastKey = '', lastT = 0;
function snapshot(key) {
  const now = Date.now();
  if (key && key === lastKey && now - lastT < 900) { lastT = now; return; }
  lastKey = key || ''; lastT = now;
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0; updateUndo();
}
function restore(json) {
  endEdit(true);
  doc = normalize(JSON.parse(json));
  clampUI(); renderAll(); save(); updateUndo();
}
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(doc)); lastKey = ''; restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(doc)); lastKey = ''; restore(redoStack.pop()); }
function updateUndo() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }
let saveT;
function writeNow() { // 지금 바로 이 브라우저에 저장
  clearTimeout(saveT); saveT = null;
  const ok = lsSet(LS.cur, doc), el = $('#saveState');
  if (el) { const t = new Date(); el.textContent = ok ? `✔ 자동 저장됨 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '⚠ 저장 공간이 부족해요 — “내 노트 → 파일로 내보내기”로 백업하세요'; el.classList.toggle('bad', !ok); }
  return ok;
}
function save() { clearTimeout(saveT); saveT = setTimeout(writeNow, 250); scheduleStrip(); }
/* ---- 닫기 전 저장·확인 ---- */
let lastBackup = '';
const markBackup = () => { lastBackup = JSON.stringify(doc); }; // “내 노트 저장”이나 “파일로 내보내기”를 한 시점의 모습
const hasContent = () => doc.pages.length > 1 || doc.pages.some(p => p.items.length) || doc.masters.some(m => m.items.length);
const confirmCloseOn = () => lsGet('noteprint.confirmClose', true) !== false;
function flushBeforeLeave() { endEdit(true); writeNow(); }
window.addEventListener('pagehide', flushBeforeLeave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushBeforeLeave(); });
window.addEventListener('beforeunload', e => {
  flushBeforeLeave(); // 어떤 경우에도 마지막 수정까지 이 브라우저에 저장
  if (confirmCloseOn() && hasContent() && JSON.stringify(doc) !== lastBackup) { e.preventDefault(); e.returnValue = ''; } // 백업(내 노트·파일) 안 한 변경이 있으면 닫기 전에 한 번 물어봄
});
function mutate(fn, key) { snapshot(key); fn(); save(); }

/* ---------- 이미지 보관 (브라우저 안 IndexedDB: 사진은 용량이 커서 노트 데이터와 따로 둡니다) ---------- */
let idbP = null;
const idbOpen = () => idbP || (idbP = new Promise((res, rej) => { const rq = indexedDB.open('noteprint', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('images'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }));
const idbPut = async (id, blob) => { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
const idbGet = async id => { const db = await idbOpen(); return new Promise((res, rej) => { const rq = db.transaction('images').objectStore('images').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); };
const imgUrls = new Map(), imgPending = new Map();
function ensureImgUrl(id) {
  if (imgUrls.has(id)) return Promise.resolve(imgUrls.get(id));
  if (!imgPending.has(id)) imgPending.set(id, idbGet(id).then(b => { if (!b) return null; const u = URL.createObjectURL(b); imgUrls.set(id, u); return u; }).catch(() => null).finally(() => imgPending.delete(id)));
  return imgPending.get(id);
}
const imgDpi = it => Math.round(it.nw * (1 - it.cl - it.cr) / (it.w / 25.4));
let imgReplaceId = null;
async function readImageInfo(file) { // 사진 크기(가로·세로 픽셀) 알아내기 — 사진에 적힌 회전 정보까지 반영
  const url = URL.createObjectURL(file), img = new Image();
  try { img.src = url; await img.decode(); return { nw: img.naturalWidth, nh: img.naturalHeight }; } finally { URL.revokeObjectURL(url); }
}
async function importImageFiles(files) {
  for (const file of files) {
    if (!/^image\/(png|jpe?g)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) { toast('JPG 또는 PNG 사진만 넣을 수 있어요'); continue; }
    let info; try { info = await readImageInfo(file); } catch (e) { toast('이 사진은 읽을 수 없어요'); continue; }
    const id = newUid('img');
    try { await idbPut(id, file); } catch (e) { toast('사진을 저장하지 못했어요 (브라우저 저장 공간을 확인해 주세요)'); continue; }
    if (imgReplaceId != null) {
      const it = findItem(imgReplaceId); imgReplaceId = null;
      if (it && it.type === 'image') { mutate(() => { it.src = id; it.nw = info.nw; it.nh = info.nh; it.name = file.name; it.cl = it.ct = it.cr = it.cb = 0; it.h = r2(it.w * info.nh / info.nw); }); refreshItems([it.id]); renderPropBox(); }
      continue;
    }
    const { w, h: ph } = doc.page, st = gridStep(), n = ctxItems().length % 5;
    let ww = r2(w * 0.6), hh = r2(ww * info.nh / info.nw);
    if (hh > ph * 0.7) { hh = r2(ph * 0.7); ww = r2(hh * info.nw / info.nh); }
    const it = { type: 'image', rot: 0, lock: false, hide: false, gid: null, color: 'k100', x: snapPos(w * 0.12, 'x') + n * st, y: snapPos(ph * 0.12, 'y') + n * st, w: ww, h: hh, src: id, nw: info.nw, nh: info.nh, name: file.name, cl: 0, ct: 0, cr: 0, cb: 0, gray: false, ar: true };
    mutate(() => { it.id = nextItemId(); ctxItems().push(it); });
    renderItems(); select([it.id]);
  }
}
function applyCrop(it, cl, ct, cr, cb) { // 사진을 보이는 크기 그대로 두고 가장자리를 잘라냄/되살림
  const FW = it.w / (1 - it.cl - it.cr), FH = it.h / (1 - it.ct - it.cb);
  cl = clamp(cl, 0, 0.95); cr = clamp(cr, 0, 0.95); ct = clamp(ct, 0, 0.95); cb = clamp(cb, 0, 0.95);
  if (cl + cr > 0.95 || ct + cb > 0.95) return;
  const nw = FW * (1 - cl - cr), nh = FH * (1 - ct - cb);
  const [dx, dy] = rotPt(FW * (cl - it.cl) + (nw - it.w) / 2, FH * (ct - it.ct) + (nh - it.h) / 2, 0, 0, it.rot || 0);
  const cx = it.x + it.w / 2 + dx, cy = it.y + it.h / 2 + dy;
  Object.assign(it, { cl, ct, cr, cb, w: r2(nw), h: r2(nh) }); it.x = r2(cx - it.w / 2); it.y = r2(cy - it.h / 2);
}

/* ---------- 모눈·도형 계산 ---------- */
function snapPos(v, axis) { // 모눈 칸에 맞춤 (모눈이 시작하는 위치 기준)
  const s = gridStep(), m = ctxMaster();
  const o = m ? NP.gridPlan(doc.page.w, doc.page.h, m.grid, 0)[axis === 'x' ? 'ox' : 'oy'] : (axis === 'x' ? doc.page.w : doc.page.h) % s / 2;
  return r2(o + Math.round((v - o) / s) * s);
}
function snapLen(v) { const s = gridStep(); return Math.max(s, r2(Math.round(v / s) * s)); }
function gridSVG(m, bleed) {
  const { w, h: ph } = doc.page, b = bleed;
  const svg = svgEl('svg', { viewBox: `${-b} ${-b} ${w + 2 * b} ${ph + 2 * b}`, preserveAspectRatio: 'none', class: 'grid' });
  svg.style.cssText = `left:${U(-b)};top:${U(-b)};width:${U(w + 2 * b)};height:${U(ph + 2 * b)}`;
  const g = m.grid;
  if (g.type === 'none') return svg;
  const pl = NP.gridPlan(w, ph, g, b), { xs, ys } = pl;
  let d = '', sw = g.lw || 0.15, cap = 'butt';
  if (g.type === 'square') { for (const x of xs) d += `M${x} ${pl.ay0}V${pl.ay1}`; for (const y of ys) d += `M${pl.ax0} ${y}H${pl.ax1}`; }
  else if (g.type === 'line') { for (const y of ys) d += `M${pl.ax0} ${y}H${pl.ax1}`; }
  else { sw = g.dot || 0.6; cap = 'round'; for (const y of ys) for (const x of xs) d += `M${x} ${y}h0`; }
  svg.append(svgEl('path', { d, stroke: colorRGB(g.color, g.tone / 100), 'stroke-width': sw, 'stroke-linecap': cap, fill: 'none' }));
  return svg;
}
function textH(it) { const el = els.get(it.id); return el && el.offsetHeight ? el.offsetHeight / ppm() : it.pt * MM_PT * 1.35; }
function boxOf(it) { // 돌리기 전의 상자 {x,y,w,h}
  if (it.type === 'line') return { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1) };
  if (it.type === 'text') return { x: it.x, y: it.y, w: it.w, h: textH(it) };
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function bboxOf(it) { // 돌린 뒤 실제로 차지하는 영역
  const b = boxOf(it);
  if (!it.rot || it.type === 'line') return b;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(p => rotPt(p[0], p[1], cx, cy, it.rot));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function unionBox(list) {
  const x0 = Math.min(...list.map(b => b.x)), y0 = Math.min(...list.map(b => b.y));
  const x1 = Math.max(...list.map(b => b.x + b.w)), y1 = Math.max(...list.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function moveItem(it, dx, dy) {
  if (it.type === 'line') { it.x1 = r2(it.x1 + dx); it.x2 = r2(it.x2 + dx); it.y1 = r2(it.y1 + dy); it.y2 = r2(it.y2 + dy); }
  else { it.x = r2(it.x + dx); it.y = r2(it.y + dy); }
}

/* ---------- 물건 그리기 (편집 화면·미리보기·인쇄가 같이 씀) ---------- */
function makeItemEl(it, editor, pageNo, gs) {
  const el = h('div', { class: 'it ' + it.type, 'data-id': it.id });
  if (it.type === 'text') el.append(h('div', { class: 'body' }));
  else if (it.type === 'image') el.append(h('div', { class: 'imgwrap' }, h('img', { draggable: 'false', alt: '' }), h('div', { class: 'imgmiss' }, '사진을 찾을 수 없어요')));
  else { el.append(svgEl('svg', { class: 'shape', preserveAspectRatio: 'none' })); if (it.type === 'table') el.append(h('div', { class: 'tcells' })); }
  syncItemEl(el, it, pageNo, gs);
  return el;
}
let svgUid = 0;
function fillShape(svg, it, W, Hh) {
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.textContent = '';
  const stroke = colorRGB(it.color);
  const dashOn = e => { if (it.dash) { const [d, g] = NP.dashOf(it.th); e.setAttribute('stroke-dasharray', `${d} ${g}`); } };
  const add = (tag, attrs, extra) => { const e = svgEl(tag, attrs); if (extra) extra(e); svg.append(e); return e; };
  if (it.type === 'line') {
    const mx = Math.min(it.x1, it.x2), my = Math.min(it.y1, it.y2), ag = NP.arrowGeom(it);
    add('line', { x1: ag.x1 - mx, y1: ag.y1 - my, x2: ag.x2 - mx, y2: ag.y2 - my, stroke, 'stroke-width': it.th, fill: 'none' }, dashOn);
    for (const poly of ag.heads) add('polygon', { points: poly.map(p => `${p[0] - mx},${p[1] - my}`).join(' '), fill: stroke, stroke: 'none' });
    add('line', { x1: it.x1 - mx, y1: it.y1 - my, x2: it.x2 - mx, y2: it.y2 - my, class: 'hit', stroke: 'transparent', 'stroke-width': 3, fill: 'none' });
    return;
  }
  if (it.type === 'table') {
    const g = NP.tableGeom(it);
    for (const c of g.cells) { const cs = NP.cellStyle(it, c.key); if (cs.fill) add('rect', { x: c.x, y: c.y, width: c.w, height: c.h, fill: colorRGB(cs.fill.color, cs.fill.tone / 100), stroke: 'none' }); }
    let d = ''; for (const [x1, y1, x2, y2] of NP.tableSegments(it)) d += `M${x1} ${y1}L${x2} ${y2}`;
    if (d) add('path', { d, fill: 'none', stroke, 'stroke-width': it.th, 'stroke-linecap': it.dash ? 'butt' : 'square' }, dashOn);
    return;
  }
  const d = NP.opsToD(NP.shapePath(it)), closed = NP.isClosedShape(it);
  if (closed && it.fill) add('path', { d, fill: colorRGB(it.fill.color, it.fill.tone / 100), stroke: 'none' });
  if (closed && it.pat) {
    const id = 'cp' + (++svgUid), cp = svgEl('clipPath', { id }); cp.append(svgEl('path', { d })); svg.append(cp);
    const pc = colorRGB(it.pat.color), m = NP.patternMarks(it.pat, it.w, it.h), g = svgEl('g', { 'clip-path': `url(#${id})` });
    let pd = '';
    if (it.pat.kind === 'dot') { for (const [x, y] of m.dots) pd += `M${r2(x)} ${r2(y)}h0`; g.append(svgEl('path', { d: pd, stroke: pc, 'stroke-width': it.pat.size, 'stroke-linecap': 'round', fill: 'none' })); }
    else { for (const x of m.vl) pd += `M${r2(x)} 0V${it.h}`; for (const y of m.hl) pd += `M0 ${r2(y)}H${it.w}`; g.append(svgEl('path', { d: pd, stroke: pc, 'stroke-width': it.pat.size, fill: 'none' })); }
    svg.append(g);
  }
  if (it.stroke !== false) add('path', { d, fill: 'none', stroke, 'stroke-width': it.th, 'stroke-linejoin': 'round' }, dashOn);
}
function renderTableCells(el, it, pageNo) {
  const box = el.querySelector('.tcells'); box.textContent = '';
  for (const c of NP.tableGeom(it).cells) {
    const cs = NP.cellStyle(it, c.key), f = FONTS[cs.font] || FONTS.pretendard;
    const cell = h('div', { class: 'tcell', 'data-key': c.key, style: `left:${U(c.x)};top:${U(c.y)};width:${U(c.w)};height:${U(c.h)};justify-content:${{ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[cs.valign] || 'flex-start'}` });
    const t = h('div', { class: 'tt', style: `font-size:${U(cs.pt * MM_PT)};font-weight:${cs.bold && f.files[700] ? 700 : 400};text-align:${cs.align};font-family:${f.css},sans-serif;color:${colorRGB(cs.color)}` });
    t.textContent = NP.resolveText(cs.text, pageNo, doc.pages.length);
    cell.append(t); box.append(cell);
  }
}
function syncItemEl(el, it, pageNo, gs) {
  const s = el.style;
  s.display = it.hide ? 'none' : '';
  el.classList.toggle('locked', !!it.lock);
  if (it.type === 'text') {
    s.left = U(it.x); s.top = U(it.y); s.width = U(it.w);
    s.transform = it.rot ? `rotate(${it.rot}deg)` : '';
    const b = el.querySelector('.body'), f = FONTS[it.font] || FONTS.pretendard;
    b.style.fontSize = U(it.pt * MM_PT);
    b.style.lineHeight = it.lh > 0 ? U(it.lh * gs) : '1.35';
    b.style.fontWeight = it.bold && f.files[700] ? '700' : '400';
    b.style.textAlign = it.align;
    b.style.fontFamily = `${f.css}, sans-serif`;
    b.style.color = colorRGB(it.color);
    if (!el.classList.contains('editing')) {
      const t = NP.resolveText(it.text, pageNo, doc.pages.length);
      if (b.textContent !== t) b.textContent = t;
    }
    return;
  }
  if (it.type === 'image') {
    s.left = U(it.x); s.top = U(it.y); s.width = U(it.w); s.height = U(it.h);
    s.transform = it.rot ? `rotate(${it.rot}deg)` : '';
    const wrap = el.querySelector('.imgwrap'), img = wrap.querySelector('img');
    const FW = it.w / (1 - it.cl - it.cr), FH = it.h / (1 - it.ct - it.cb);
    img.style.cssText = `position:absolute;max-width:none;left:${U(-it.cl * FW)};top:${U(-it.ct * FH)};width:${U(FW)};height:${U(FH)};filter:${it.gray ? 'grayscale(1)' : 'none'}`;
    if (img.dataset.src !== it.src) {
      img.dataset.src = it.src; img.removeAttribute('src'); wrap.classList.remove('miss');
      ensureImgUrl(it.src).then(u => { if (img.dataset.src !== it.src) return; if (u) img.src = u; else wrap.classList.add('miss'); });
    }
    return;
  }
  const bx = boxOf(it), pad = it.type === 'line' ? 0.01 : 0;
  s.left = U(bx.x); s.top = U(bx.y); s.width = U(Math.max(bx.w, pad)); s.height = U(Math.max(bx.h, pad));
  s.transform = it.type !== 'line' && it.rot ? `rotate(${it.rot}deg)` : '';
  const sig = it.type === 'line'
    ? JSON.stringify([it.x2 - it.x1, it.y2 - it.y1, it.th, it.dash, it.color, it.ah, it.at, doc.colors])
    : JSON.stringify({ ...it, x: 0, y: 0, rot: 0, lock: 0, hide: 0, gid: 0, id: 0, _c: doc.colors, _p: it.type === 'table' ? pageNo : 0 });
  if (el._sig !== sig && !el.classList.contains('editing')) {
    el._sig = sig;
    fillShape(el.querySelector('svg.shape'), it, Math.max(bx.w, 0.01), Math.max(bx.h, 0.01));
    if (it.type === 'table') renderTableCells(el, it, pageNo);
  }
}
/* 한 쪽을 그대로 그린 요소 (썸네일·집 인쇄 미리보기용) */
function buildPageDOM(page, pageNo, o = {}) {
  const m = masterById(page.master), gs = m ? m.grid.size : 5;
  const root = h('div', { class: 'pgv' });
  if (m && o.grid !== false) root.append(gridSVG(m, 0));
  if (m) for (const it of m.items) if (!it.hide) root.append(makeItemEl(it, false, pageNo, gs));
  for (const it of page.items) if (!it.hide) root.append(makeItemEl(it, false, pageNo, gs));
  const ni = NP.pageNumItem(doc, pageNo - 1, page); if (ni) root.append(makeItemEl(ni, false, pageNo, gs));
  return root;
}

/* ---------- 편집 화면 ---------- */
const pageEl = $('#page'), layerM = $('#layerM'), layerP = $('#layerP'), layerSel = $('#layerSel'), frameEl = $('#bleedFrame'), scroller = $('#stageScroll');
function fitPPM() {
  const aw = Math.max(120, scroller.clientWidth - 48), ah = Math.max(120, scroller.clientHeight - 48);
  return Math.min(aw / (doc.page.w + 2 * doc.bleed), ah / (doc.page.h + 2 * doc.bleed));
}
const ppm = () => fitPPM() * zoom;
function applyView() {
  const p = ppm(), b = doc.bleed;
  frameEl.style.setProperty('--u', p + 'px');
  frameEl.style.width = (doc.page.w + 2 * b) * p + 'px'; frameEl.style.height = (doc.page.h + 2 * b) * p + 'px';
  pageEl.style.left = b * p + 'px'; pageEl.style.top = b * p + 'px';
  pageEl.style.width = doc.page.w * p + 'px'; pageEl.style.height = doc.page.h * p + 'px';
  $('#sizeInfo').textContent = `재단 크기 ${doc.page.w} × ${doc.page.h} mm · 도련 ${doc.bleed}mm(바깥)`;
  drawRulers(); renderSelection();
}
function renderBackdrop() {
  layerM.textContent = '';
  const pageNo = ui.pageIdx + 1;
  if (ui.editMaster) { const m = ctxMaster(); if (m) layerM.append(gridSVG(m, doc.bleed)); return; }
  const m = masterById(curPage().master);
  if (m) { layerM.append(gridSVG(m, doc.bleed)); for (const it of m.items) if (!it.hide) layerM.append(makeItemEl(it, false, pageNo, m.grid.size)); }
  const ni = NP.pageNumItem(doc, ui.pageIdx); if (ni) layerM.append(makeItemEl(ni, false, pageNo, m ? m.grid.size : 5));
}
function renderGuides() { // 재단선·도련·안전선 안내선
  const old = pageEl.querySelector('svg.guides'); if (old) old.remove();
  if (!ui.guides) return;
  const { w, h: ph } = doc.page, b = doc.bleed, sf = doc.safe;
  const svg = svgEl('svg', { class: 'guides', viewBox: `${-b} ${-b} ${w + 2 * b} ${ph + 2 * b}`, preserveAspectRatio: 'none' });
  svg.style.cssText = `left:${U(-b)};top:${U(-b)};width:${U(w + 2 * b)};height:${U(ph + 2 * b)}`;
  const rect = (x, y, ww, hh, stroke, dash, sw = 1) => svg.append(svgEl('rect', { x, y, width: ww, height: hh, fill: 'none', stroke, 'stroke-width': sw, 'vector-effect': 'non-scaling-stroke', ...(dash ? { 'stroke-dasharray': '6 4' } : {}) }));
  // 흰 쪽 = 재단 크기(자르는 자리), 그 바깥 빗금 띠 = 도련. 쪽 가장자리가 곧 재단선이라 따로 선을 긋지 않아요.
  if (b > 0) { // 도련 띠: 종이 바깥이라는 걸 알 수 있게 빗금으로 덮고, 쪽(재단 크기) 안쪽은 구멍으로 비워 둠
    const defs = svgEl('defs', {}), pat = svgEl('pattern', { id: 'bleedHatch', width: 2.2, height: 2.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.append(svgEl('rect', { width: 2.2, height: 2.2, fill: 'rgba(229,72,77,.14)' }), svgEl('rect', { width: 0.55, height: 2.2, fill: 'rgba(229,72,77,.42)' }));
    defs.append(pat); svg.append(defs);
    svg.append(svgEl('path', { d: `M${-b} ${-b}h${w + 2 * b}v${ph + 2 * b}h${-(w + 2 * b)}z M0 0v${ph}h${w}v${-ph}z`, 'fill-rule': 'evenodd', fill: 'url(#bleedHatch)' }));
    rect(-b, -b, w + 2 * b, ph + 2 * b, '#e5484d', true, 1.4); // 도련 끝(바깥 빨간 점선)
  }
  if (sf > 0) rect(sf, sf, w - 2 * sf, ph - 2 * sf, '#1f6fd0', true, 2); // 안전선(파란 점선)
  if (doc.holes.on && doc.kind !== 'bound') { // 링 구멍 가이드: 홀수 쪽=왼쪽 가장자리, 짝수 쪽=오른쪽 가장자리, 세로는 가운데 기준 대칭
    const hl = doc.holes, left = ui.editMaster || ui.pageIdx % 2 === 0, hx = left ? hl.edge : w - hl.edge, span = hl.gaps.reduce((a, c) => a + c, 0);
    let y = (ph - span) / 2;
    for (let i = 0; i <= hl.gaps.length; i++) {
      svg.append(svgEl('circle', { cx: hx, cy: y, r: hl.dia / 2, fill: 'rgba(138,63,252,.10)', stroke: '#8a3ffc', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }));
      svg.append(svgEl('path', { d: `M${hx - 1.6} ${y}h3.2M${hx} ${y - 1.6}v3.2`, stroke: '#8a3ffc', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke', fill: 'none' }));
      y += hl.gaps[i] || 0;
    }
  }
  pageEl.append(svg);
}
function renderItems() {
  clampUI();
  const seen = new Set(), items = ctxItems(), pageNo = ui.pageIdx + 1, gs = gridStep();
  for (const it of items) {
    seen.add(it.id);
    let el = els.get(it.id);
    if (!el) { el = makeItemEl(it, true, pageNo, gs); els.set(it.id, el); layerP.append(el); } else syncItemEl(el, it, pageNo, gs);
    el.classList.toggle('sel', isSel(it.id));
  }
  for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); }
  for (const it of items) layerP.append(els.get(it.id)); // 겹치는 순서 = 목록 순서
  const pm = ui.editMaster ? null : masterById(curPage().master);
  $('#emptyHint').hidden = items.length > 0 || !!(pm && pm.items.length);
  renderSelection();
}
function renderBanner() {
  const b = $('#masterBanner');
  b.hidden = !ui.editMaster;
  if (ui.editMaster) { const m = ctxMaster(); $('#masterBannerText').textContent = `“${m.name}” 편집 중 — 여기에 넣은 것은 이 바탕을 쓰는 모든 쪽에 똑같이 반복됩니다 (${doc.pages.filter(p => p.master === m.id).length}쪽에 쓰는 중)`; }
}
function renderStage() { // 지금 보는 쪽(또는 바탕)을 처음부터 다시 그림
  clampUI(); els.clear(); layerP.textContent = '';
  renderBackdrop(); renderItems(); renderGuides(); renderUserGuides(); applyView(); renderBanner();
}
function renderAll() { renderStage(); renderPanels(); renderStrip(); updateToggles(); }

/* ---------- 눈금자 · 가이드선 ---------- */
const rulerTop = $('#rulerTop'), rulerLeft = $('#rulerLeft');
function toMM(e) { const fr = frameEl.getBoundingClientRect(), p = ppm(); return { x: (e.clientX - fr.left) / p - doc.bleed, y: (e.clientY - fr.top) / p - doc.bleed }; }
function drawRulers() {
  $('#rulerwrap').classList.toggle('norulers', !ui.rulers);
  if (!ui.rulers) return;
  const dpr = window.devicePixelRatio || 1, p = ppm();
  const sr = scroller.getBoundingClientRect(), fr = frameEl.getBoundingClientRect();
  const ox = fr.left + doc.bleed * p - sr.left, oy = fr.top + doc.bleed * p - sr.top;
  const draw = (cv, horiz, origin) => {
    const len = horiz ? scroller.clientWidth : scroller.clientHeight, thick = 22;
    cv.width = (horiz ? len : thick) * dpr; cv.height = (horiz ? thick : len) * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    c.fillStyle = '#f2f4f2'; c.fillRect(0, 0, horiz ? len : thick, horiz ? thick : len);
    c.strokeStyle = '#7b857f'; c.fillStyle = '#5b655f'; c.font = '9px -apple-system,sans-serif'; c.lineWidth = 1;
    const steps = [1, 2, 5, 10, 20, 50, 100];
    const lab = steps.find(s => s * p >= 45) || 100, minor = lab >= 10 ? lab / 10 : lab >= 5 ? 1 : lab >= 2 ? 1 : lab;
    const from = Math.floor(-origin / p / minor) * minor, to = Math.ceil((len - origin) / p / minor) * minor;
    for (let v = from; v <= to; v += minor) {
      const pos = Math.round(origin + v * p) + 0.5, major = Math.abs(v % lab) < 1e-6, mid = !major && Math.abs(v % (lab / 2)) < 1e-6;
      const L = major ? 12 : mid ? 8 : 4;
      c.beginPath();
      if (horiz) { c.moveTo(pos, thick); c.lineTo(pos, thick - L); } else { c.moveTo(thick, pos); c.lineTo(thick - L, pos); }
      c.stroke();
      if (major) { if (horiz) c.fillText(String(Math.round(v)), pos + 2, 9); else { c.save(); c.translate(9, pos + 2); c.rotate(-Math.PI / 2); c.fillText(String(Math.round(v)), 0, 0); c.restore(); } }
    }
    // 쪽 범위 표시
    c.fillStyle = 'rgba(47,111,94,.10)';
    if (horiz) c.fillRect(origin, 0, doc.page.w * p, thick); else c.fillRect(0, origin, thick, doc.page.h * p);
  };
  draw(rulerTop, true, ox); draw(rulerLeft, false, oy);
}
scroller.addEventListener('scroll', drawRulers);
function allGuides() {
  const out = [];
  if (!ui.editMaster) for (const g of curPage().guides) out.push({ g, owner: 'page' });
  const m = ctxMaster(); if (m) for (const g of m.guides) out.push({ g, owner: 'master' });
  return out;
}
const findGuide = id => allGuides().find(x => x.g.id === id);
function guideTarget() {
  if (ui.editMaster) return ctxMaster().guides;
  const m = masterById(curPage().master);
  return ui.guideScope === 'master' && m ? m.guides : curPage().guides;
}
let tempGuide = null;
const guideSel = () => (selGuide ? [...new Set([...extraGuides, selGuide])].filter(id => findGuide(id)) : []);
function renderUserGuides() {
  const svg = $('#guideLayer'); svg.textContent = '';
  if (!ui.userGuides) return;
  const { w, h: ph } = doc.page, b = doc.bleed, sel = guideSel();
  svg.setAttribute('viewBox', `${-b} ${-b} ${w + 2 * b} ${ph + 2 * b}`); svg.setAttribute('preserveAspectRatio', 'none');
  const list = allGuides().map(x => x.g); if (tempGuide) list.push(tempGuide);
  for (const g of list) {
    const a = g.axis === 'x' ? { x1: g.pos, x2: g.pos, y1: -b, y2: ph + b } : { x1: -b, x2: w + b, y1: g.pos, y2: g.pos };
    const on = sel.includes(g.id), col = g.color || '#14b8d4';
    if (on) svg.append(svgEl('line', { ...a, stroke: col, 'stroke-width': 7, 'stroke-opacity': 0.28, 'vector-effect': 'non-scaling-stroke' }));
    svg.append(svgEl('line', { ...a, stroke: col, 'stroke-width': on ? 2 : 1.2, ...(g.lock ? { 'stroke-dasharray': '7 3' } : {}), 'vector-effect': 'non-scaling-stroke' }));
    svg.append(svgEl('line', { ...a, class: 'hit ' + g.axis, 'data-gid': g.id }));
  }
}
function startNewGuide(e, axis) {
  e.preventDefault();
  const p = toMM(e);
  tempGuide = { id: newUid('g'), axis, pos: r2(axis === 'x' ? p.x : p.y), color: ui.guideColor };
  drag = { mode: 'newguide', axis };
  renderUserGuides();
}
rulerTop.addEventListener('pointerdown', e => startNewGuide(e, 'y'));
rulerLeft.addEventListener('pointerdown', e => startNewGuide(e, 'x'));

/* ---------- 선택 ---------- */
function expandGroups(ids) {
  const set = new Set(ids);
  for (const id of ids) { const it = findItem(id); if (it && it.gid) for (const o of ctxItems()) if (o.gid === it.gid) set.add(o.id); }
  return ctxItems().filter(i => set.has(i.id)).map(i => i.id);
}
function showTab(name, manual) {
  ui.tab = name; ui.tabManual = !!manual;
  for (const [k, id] of [['doc', '#tabDoc'], ['obj', '#tabObj'], ['color', '#tabColor']]) $(id).hidden = k !== name;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'doc') renderPagesBox();
}
document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab, true); });
function select(ids) {
  ids = expandGroups([].concat(ids == null ? [] : ids));
  if (editingId != null && !(ids.length === 1 && ids[0] === editingId)) endEdit();
  selIds = ids; selGuide = null; extraGuides = [];
  if (!(ids.length === 1 && cellSel && cellSel.id === ids[0])) cellSel = null;
  for (const [i, el] of els) el.classList.toggle('sel', isSel(i));
  renderSelection(); renderPropBox(); renderUserGuides();
  if (selIds.length) showTab('obj'); else if (ui.tab === 'obj' && !ui.tabManual) showTab('doc');
}
function selectGuide(id, additive) {
  if (additive && selGuide) {
    const cur = guideSel();
    if (cur.includes(id)) { const rest = cur.filter(x => x !== id); selGuide = rest[rest.length - 1] || null; extraGuides = rest.slice(0, -1); }
    else { extraGuides = cur; selGuide = id; }
  } else { selGuide = id; extraGuides = []; }
  selIds = []; cellSel = null;
  for (const [, el] of els) el.classList.remove('sel');
  renderSelection(); renderPropBox(); renderUserGuides();
  if (selGuide) showTab('obj');
}
function renderSelection() {
  layerSel.textContent = '';
  if (editingId != null) return;
  const items = selItems().filter(i => !i.hide);
  if (!items.length) return;
  const handle = (cls, dir, style) => h('div', { class: 'sh ' + cls, 'data-h': dir, style });
  if (items.length === 1 && items[0].type === 'line') {
    const it = items[0];
    layerSel.append(handle('pt', 'p1', `left:${U(it.x1)};top:${U(it.y1)}`), handle('pt', 'p2', `left:${U(it.x2)};top:${U(it.y2)}`));
    return;
  }
  const dirs = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
  const addBox = (b, rot, multi, only) => {
    const box = h('div', { class: 'selbox' + (multi ? ' multi' : ''), style: `left:${U(b.x)};top:${U(b.y)};width:${U(b.w)};height:${U(b.h)};transform:rotate(${rot || 0}deg)` });
    for (const [d, [px, py]] of Object.entries(dirs)) {
      if (only && !only.includes(d)) continue;
      box.append(handle(d, d, `left:${px}%;top:${py}%`));
    }
    box.append(h('div', { class: 'rotline', style: 'left:50%;top:-24px;height:24px' }), handle('rot', 'rot', 'left:50%;top:-24px'));
    layerSel.append(box);
    return box;
  };
  if (items.length === 1) {
    const it = items[0], box = addBox(boxOf(it), it.rot, false, it.type === 'text' ? ['e', 'w'] : null);
    if (it.type === 'table') {
      const g = NP.tableGeom(it);
      box.append(handle('tmove', 'tmove', 'left:-16px;top:-16px'));
      for (let i = 1; i < g.C; i++) box.append(h('div', { class: 'tl v', 'data-h': 'col:' + i, style: `left:${U(g.X[i])}` }));
      for (let j = 1; j < g.R; j++) box.append(h('div', { class: 'tl hz', 'data-h': 'row:' + j, style: `top:${U(g.Y[j])}` }));
      if (cellSel && cellSel.id === it.id) { const rr = cellRangeRect(it, cellSel); box.append(h('div', { class: 'cellsel', style: `left:${U(rr.x)};top:${U(rr.y)};width:${U(rr.w)};height:${U(rr.h)}` })); }
    }
    return;
  }
  for (const it of items) {
    const b = boxOf(it);
    layerSel.append(h('div', { class: 'selitem', style: `left:${U(b.x)};top:${U(b.y)};width:${U(Math.max(b.w, 0.3))};height:${U(Math.max(b.h, 0.3))};transform:rotate(${it.type === 'line' ? 0 : it.rot || 0}deg)` }));
  }
  addBox(unionBox(items.map(bboxOf)), 0, true);
}
/* ---- 표 칸 고르기 도우미 ---- */
function expandRange(it, rg) { // 합친 칸이 걸치면 그 칸 전체가 들어가도록 범위를 넓힘
  const g = NP.tableGeom(it);
  let r1 = Math.min(rg.r1, rg.r2), r2_ = Math.max(rg.r1, rg.r2), c1 = Math.min(rg.c1, rg.c2), c2 = Math.max(rg.c1, rg.c2), changed = true;
  while (changed) {
    changed = false;
    for (let r = r1; r <= r2_; r++) for (let c = c1; c <= c2; c++) {
      const o = g.owner[r][c];
      if (o.r < r1) { r1 = o.r; changed = true; } if (o.c < c1) { c1 = o.c; changed = true; }
      if (o.r + o.rs - 1 > r2_) { r2_ = o.r + o.rs - 1; changed = true; } if (o.c + o.cs - 1 > c2) { c2 = o.c + o.cs - 1; changed = true; }
    }
  }
  return { r1, c1, r2: r2_, c2 };
}
function cellRangeRect(it, rg) { const g = NP.tableGeom(it), e = expandRange(it, rg); return { x: g.X[e.c1], y: g.Y[e.r1], w: g.X[e.c2 + 1] - g.X[e.c1], h: g.Y[e.r2 + 1] - g.Y[e.r1] }; }
function rangeKeys(it, rg) { const e = expandRange(it, rg); return NP.tableGeom(it).cells.filter(c => c.r >= e.r1 && c.r <= e.r2 && c.c >= e.c1 && c.c <= e.c2).map(c => c.key); }
function tableCellAt(it, p) {
  const g = NP.tableGeom(it), [lx, ly] = rotPt(p.x, p.y, it.x + it.w / 2, it.y + it.h / 2, -(it.rot || 0)), x = lx - it.x, y = ly - it.y;
  let c = g.C - 1, r = g.R - 1;
  for (let i = 0; i < g.C; i++) if (x < g.X[i + 1]) { c = i; break; }
  for (let j = 0; j < g.R; j++) if (y < g.Y[j + 1]) { r = j; break; }
  return { r: Math.max(0, r), c: Math.max(0, c) };
}
function startCellSel(e, it) {
  const { r, c } = tableCellAt(it, toMM(e)), o = NP.tableGeom(it).owner[r][c];
  const same = !!cellSel && cellSel.id === it.id && cellSel.r1 === o.r && cellSel.c1 === o.c && cellSel.r2 === o.r + o.rs - 1 && cellSel.c2 === o.c + o.cs - 1;
  cellSel = { id: it.id, r1: o.r, c1: o.c, r2: o.r + o.rs - 1, c2: o.c + o.cs - 1 };
  drag = { mode: 'cellsel', id: it.id, r0: r, c0: c, moved: false, same, key: o.r + ',' + o.c };
  renderSelection(); renderPropBox();
}

/* ---------- 따라붙기(스냅) · 스마트 가이드 ---------- */
function buildCands(excl) {
  const xs = [], ys = [], W = doc.page.w, H = doc.page.h;
  if (ui.smart) { xs.push(0, W / 2, W); ys.push(0, H / 2, H); if (doc.safe > 0) { xs.push(doc.safe, W - doc.safe); ys.push(doc.safe, H - doc.safe); } }
  if (ui.userGuides) for (const { g } of allGuides()) (g.axis === 'x' ? xs : ys).push(g.pos);
  if (ui.smart) for (const it of ctxItems()) {
    if (excl.has(it.id) || it.hide) continue;
    const b = bboxOf(it); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}
function bestSnap(anchors, cands, thr) {
  let best = null;
  for (const a of anchors) for (const c of cands) { const d = c - a; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v: c }; }
  return best;
}
function snapMove(b0, dx, dy, cands, alt) {
  let sdx = dx, sdy = dy; const lines = [];
  if (alt) return { dx, dy, lines };
  const thr = 7 / ppm();
  const bx = bestSnap([b0.x + dx, b0.x + b0.w / 2 + dx, b0.x + b0.w + dx], cands.xs, thr);
  if (bx) { sdx = dx + bx.d; lines.push({ axis: 'x', pos: bx.v }); } else if (doc.snap) sdx = snapPos(b0.x + dx, 'x') - b0.x;
  const by = bestSnap([b0.y + dy, b0.y + b0.h / 2 + dy, b0.y + b0.h + dy], cands.ys, thr);
  if (by) { sdy = dy + by.d; lines.push({ axis: 'y', pos: by.v }); } else if (doc.snap) sdy = snapPos(b0.y + dy, 'y') - b0.y;
  return { dx: sdx, dy: sdy, lines };
}
function snapPoint(x, y, cands, alt) {
  if (alt) return { x, y, lines: [] };
  const thr = 7 / ppm(), lines = [];
  const bx = bestSnap([x], cands.xs, thr), by = bestSnap([y], cands.ys, thr);
  if (bx) { x = bx.v; lines.push({ axis: 'x', pos: bx.v }); } else if (doc.snap) x = snapPos(x, 'x');
  if (by) { y = by.v; lines.push({ axis: 'y', pos: by.v }); } else if (doc.snap) y = snapPos(y, 'y');
  return { x, y, lines };
}
function drawSmart(lines) {
  const svg = $('#smartLayer'); svg.textContent = '';
  if (!lines || !lines.length) return;
  const { w, h: ph } = doc.page, b = doc.bleed;
  svg.setAttribute('viewBox', `0 0 ${w} ${ph}`); svg.setAttribute('preserveAspectRatio', 'none');
  for (const l of lines) {
    const a = l.axis === 'x' ? { x1: l.pos, x2: l.pos, y1: -b, y2: ph + b } : { x1: -b, x2: w + b, y1: l.pos, y2: l.pos };
    svg.append(svgEl('line', { ...a, stroke: '#e0409a', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  }
}

/* ---------- 끌기: 이동·크기·회전·선택 영역·가이드선·화면 이동·핀치 ---------- */
let drag = null, spaceDown = false;
const touchPts = new Map();
const cloneItems = ids => { const m = new Map(); for (const id of ids) { const it = findItem(id); if (it) { const c = JSON.parse(JSON.stringify(it)); if (it.type === 'text') c._h = textH(it); m.set(id, c); } } return m; };
function restoreFrom(orig) { for (const [id, o] of orig) { const it = findItem(id); if (!it) continue; const { _h, ...c } = o; Object.assign(it, c); } }
function refreshItems(ids) { for (const id of ids) { const it = findItem(id), el = els.get(id); if (it && el) syncItemEl(el, it, ui.pageIdx + 1, gridStep()); } renderSelection(); }

function scaleItems(orig, ax, ay, fx, fy, tx, ty) { // 기준점(ax,ay)에서 늘리고 줄인 뒤 (tx,ty)만큼 이동
  restoreFrom(orig);
  for (const [id, o] of orig) {
    const it = findItem(id); if (!it) continue;
    if (it.type === 'line') {
      it.x1 = r2(ax + (o.x1 - ax) * fx + tx); it.x2 = r2(ax + (o.x2 - ax) * fx + tx); it.y1 = r2(ay + (o.y1 - ay) * fy + ty); it.y2 = r2(ay + (o.y2 - ay) * fy + ty);
      continue;
    }
    const w = o.w, hh = it.type === 'text' ? o._h : o.h, cx = o.x + w / 2, cy = o.y + hh / 2;
    const ncx = ax + (cx - ax) * fx + tx, ncy = ay + (cy - ay) * fy + ty;
    const q = ((Math.round((o.rot || 0) / 90) % 2) + 2) % 2, near = Math.abs((o.rot || 0) % 90) < 0.01;
    const sw = near ? (q ? fy : fx) : Math.sqrt(fx * fy), sh = near ? (q ? fx : fy) : Math.sqrt(fx * fy);
    it.w = r2(Math.max(0.5, w * sw));
    if (it.type !== 'text') it.h = r2(Math.max(0.5, hh * sh));
    if (it.type === 'table') rescaleTable(it, o);
    it.x = r2(ncx - it.w / 2); it.y = r2(ncy - (it.type === 'text' ? hh : it.h) / 2);
  }
}
function rescaleTable(it, o) { // 표를 늘리면 칸 너비·높이도 같은 비율로
  const kx = it.w / o.w, ky = it.h / o.h;
  it.cw = o.cw.map(v => r2(Math.max(2, v * kx))); it.rh = o.rh.map(v => r2(Math.max(2, v * ky)));
  it.w = r2(it.cw.reduce((a, b) => a + b, 0)); it.h = r2(it.rh.reduce((a, b) => a + b, 0));
}
function rotateItems(orig, cx, cy, delta, setAbs) { // 선택한 것 전체를 (cx,cy) 중심으로 delta도 돌림
  restoreFrom(orig);
  for (const [id, o] of orig) {
    const it = findItem(id); if (!it) continue;
    if (it.type === 'line') {
      [it.x1, it.y1] = rotPt(o.x1, o.y1, cx, cy, delta).map(r2); [it.x2, it.y2] = rotPt(o.x2, o.y2, cx, cy, delta).map(r2); continue;
    }
    const hh = it.type === 'text' ? o._h : o.h, [ncx, ncy] = rotPt(o.x + o.w / 2, o.y + hh / 2, cx, cy, delta);
    it.x = r2(ncx - o.w / 2); it.y = r2(ncy - hh / 2); it.rot = r2(normDeg(setAbs != null ? setAbs : (o.rot || 0) + delta));
  }
}

function startDragCommon() { if (!drag.moved) { snapshot(); drag.moved = true; } }

scroller.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPts.size === 2) { startPinch(); return; }
  }
  if (e.pointerType === 'mouse' && e.button > 1) return;
  if (spaceDown || (e.pointerType === 'mouse' && e.button === 1)) { e.preventDefault(); drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop }; return; }
  if (e.target.closest('#masterBanner')) return;
  if (ui.draw) { e.preventDefault(); const p = toMM(e); drag = { mode: 'draw', pts: [[p.x, p.y]], moved: false }; return; }
  const t = e.target;
  if (editingId != null && t.closest('.tt, .body')) return; // 글자 안에서 커서 옮기기
  const sh = t.closest('.sh, .tl');
  if (sh) { startHandle(e, sh.dataset.h); return; }
  const gh = t.closest('.hit[data-gid]');
  if (gh) { const additive = e.shiftKey || e.metaKey || e.ctrlKey; selectGuide(gh.dataset.gid, additive); const f = findGuide(gh.dataset.gid); if (f && !f.g.lock && !additive) drag = { mode: 'guide', gid: gh.dataset.gid, moved: false, axis: f.g.axis, orig: f.g.pos }; return; }
  const itEl = t.closest('.it');
  if (itEl && itEl.parentElement === layerP) {
    const id = +itEl.dataset.id, it = findItem(id);
    if (it && !it.lock) {
      if (it.type === 'table' && editingId == null) {
        if (selIds.length === 1 && selIds[0] === id) { startCellSel(e, it); return; }
        startItemDrag(e, id); // 처음 누른 표: 표를 고르고(끌면 옮기고), 누른 칸도 함께 골라 둠 → 같은 칸을 한 번 더 누르면 글자 쓰기
        const { r, c } = tableCellAt(it, toMM(e)), o = NP.tableGeom(it).owner[r][c];
        cellSel = { id: it.id, r1: o.r, c1: o.c, r2: o.r + o.rs - 1, c2: o.c + o.cs - 1 }; renderSelection(); renderPropBox();
        return;
      }
      startItemDrag(e, id); return;
    }
  }
  // 빈 곳: 선택 영역 상자
  if (editingId != null) endEdit();
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;
  if (!additive) select([]);
  const p = toMM(e);
  const box = h('div', { class: 'marquee' }); pageEl.append(box);
  drag = { mode: 'marquee', x0: p.x, y0: p.y, box, base: additive ? selIds.slice() : [], moved: false, cx: e.clientX, cy: e.clientY };
});
function startItemDrag(e, id) {
  const additive = e.shiftKey || e.metaKey || e.ctrlKey, wasSel = isSel(id);
  if (editingId === id) return;
  if (additive) { if (!wasSel) select([...selIds, id]); } else if (!wasSel) select([id]);
  const ids = selIds.filter(i => { const x = findItem(i); return x && !x.lock; });
  if (!ids.length) return;
  const orig = cloneItems(ids), items = ids.map(findItem).filter(Boolean);
  drag = { mode: 'move', id, sx: e.clientX, sy: e.clientY, moved: false, wasSel, additive, orig, ids, b0: unionBox(items.map(bboxOf)), cands: buildCands(new Set(ids)), shift: e.shiftKey };
}
function startHandle(e, dir) {
  e.preventDefault();
  const items = selItems();
  if (!items.length) return;
  if (items.some(i => i.lock)) { toast('잠긴 개체는 바꿀 수 없어요. 잠금을 풀어 주세요'); return; }
  const ids = items.map(i => i.id), orig = cloneItems(ids), p = toMM(e);
  if (dir === 'tmove') { startItemDrag(e, ids[0]); return; }
  if (dir.startsWith('col:') || dir.startsWith('row:')) { drag = { mode: 'tsize', axis: dir.slice(0, 3), i: +dir.slice(4), id: ids[0], orig, moved: false, p0: p, rot: items[0].rot || 0 }; return; }
  if (dir === 'p1' || dir === 'p2') { drag = { mode: 'linept', dir, id: ids[0], orig, moved: false, cands: buildCands(new Set(ids)) }; return; }
  const b = items.length === 1 && items[0].type !== 'line' ? boxOf(items[0]) : unionBox(items.map(bboxOf));
  const rot0 = items.length === 1 ? items[0].rot || 0 : 0, c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (dir === 'rot') { drag = { mode: 'rotate', ids, orig, moved: false, c, a0: Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI, rot0, single: items.length === 1 }; return; }
  drag = { mode: 'resize', dir, ids, orig, moved: false, b, rot0, p0: p, single: items.length === 1, cands: buildCands(new Set(ids)) };
}
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' && touchPts.has(e.pointerId)) { touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch) { updatePinch(); return; } }
  if (!drag) return;
  const alt = e.altKey;
  if (drag.mode === 'pan') { scroller.scrollLeft = drag.sl - (e.clientX - drag.sx); scroller.scrollTop = drag.st - (e.clientY - drag.sy); return; }
  if (drag.mode === 'draw') {
    const p = toMM(e), last = drag.pts[drag.pts.length - 1];
    if (Math.hypot(p.x - last[0], p.y - last[1]) < 0.4) return;
    drag.moved = true; drag.pts.push([p.x, p.y]); drawPreview(drag.pts); return;
  }
  if (drag.mode === 'newguide') {
    const p = toMM(e); tempGuide.pos = r2(drag.axis === 'x' ? p.x : p.y);
    const sr = scroller.getBoundingClientRect(); tempGuide.out = e.clientX < sr.left || e.clientX > sr.right || e.clientY < sr.top || e.clientY > sr.bottom;
    renderUserGuides(); return;
  }
  if (drag.mode === 'guide') {
    const f = findGuide(drag.gid); if (!f) return;
    if (!drag.moved) { snapshot(); drag.moved = true; }
    const p = toMM(e); f.g.pos = r2(drag.axis === 'x' ? p.x : p.y);
    const sr = scroller.getBoundingClientRect(); drag.out = e.clientX < sr.left || e.clientX > sr.right || e.clientY < sr.top || e.clientY > sr.bottom;
    renderUserGuides(); return;
  }
  if (drag.mode === 'marquee') {
    const p = toMM(e), x = Math.min(p.x, drag.x0), y = Math.min(p.y, drag.y0), w = Math.abs(p.x - drag.x0), hh = Math.abs(p.y - drag.y0);
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
    drag.moved = true;
    Object.assign(drag.box.style, { left: U(x), top: U(y), width: U(w), height: U(hh) });
    const hit = ctxItems().filter(it => !it.hide && !it.lock).filter(it => { const b = bboxOf(it); return b.x <= x + w && b.x + b.w >= x && b.y <= y + hh && b.y + b.h >= y; }).map(i => i.id);
    const ids = expandGroups([...new Set([...drag.base, ...hit])]);
    if (ids.join() !== selIds.join()) { selIds = ids; for (const [i, el] of els) el.classList.toggle('sel', isSel(i)); renderSelection(); }
    return;
  }
  if (drag.mode === 'cellsel') {
    const it = findItem(drag.id); if (!it) return;
    const { r, c } = tableCellAt(it, toMM(e));
    if (!drag.moved && r === drag.r0 && c === drag.c0) return;
    drag.moved = true;
    cellSel = { id: it.id, ...expandRange(it, { r1: drag.r0, c1: drag.c0, r2: r, c2: c }) };
    renderSelection(); return;
  }
  if (drag.mode === 'tsize') {
    startDragCommon();
    const it = findItem(drag.id), o = drag.orig.get(drag.id), p = toMM(e);
    const [dx, dy] = rotPt(p.x - drag.p0.x, p.y - drag.p0.y, 0, 0, -drag.rot);
    const key = drag.axis === 'col' ? 'cw' : 'rh', d0 = drag.axis === 'col' ? dx : dy, i = drag.i;
    const d = r2(clamp(Math.round(d0 * 2) / 2, -(o[key][i - 1] - 3), o[key][i] - 3));
    it[key] = o[key].slice(); it[key][i - 1] = r2(o[key][i - 1] + d); it[key][i] = r2(o[key][i] - d);
    refreshItems([it.id]); return;
  }
  if (drag.mode === 'move') {
    const p = ppm(), dxpx = e.clientX - drag.sx, dypx = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dxpx, dypx) < 4) return;
    startDragCommon();
    const s = snapMove(drag.b0, dxpx / p, dypx / p, drag.cands, alt);
    restoreFrom(drag.orig);
    for (const id of drag.ids) { const it = findItem(id); if (it) moveItem(it, s.dx, s.dy); }
    refreshItems(drag.ids); drawSmart(s.lines);
    return;
  }
  if (drag.mode === 'linept') {
    startDragCommon();
    const it = findItem(drag.id), o = drag.orig.get(drag.id), p = toMM(e);
    const other = drag.dir === 'p1' ? [o.x2, o.y2] : [o.x1, o.y1];
    let { x, y, lines } = snapPoint(p.x, p.y, drag.cands, alt);
    if (e.shiftKey) { const ang = Math.round(Math.atan2(p.y - other[1], p.x - other[0]) / rad(15)) * rad(15), len = Math.hypot(p.x - other[0], p.y - other[1]); x = other[0] + Math.cos(ang) * len; y = other[1] + Math.sin(ang) * len; lines = []; }
    if (drag.dir === 'p1') { it.x1 = r2(x); it.y1 = r2(y); } else { it.x2 = r2(x); it.y2 = r2(y); }
    refreshItems([it.id]); drawSmart(lines); return;
  }
  if (drag.mode === 'rotate') {
    startDragCommon();
    const p = toMM(e), a = Math.atan2(p.y - drag.c.y, p.x - drag.c.x) * 180 / Math.PI;
    let delta = a - drag.a0;
    if (drag.single) {
      let abs = normDeg(drag.rot0 + delta);
      if (e.shiftKey) abs = Math.round(abs / 15) * 15;
      rotateItems(drag.orig, drag.c.x, drag.c.y, abs - drag.rot0, abs);
    } else { if (e.shiftKey) delta = Math.round(delta / 15) * 15; rotateItems(drag.orig, drag.c.x, drag.c.y, delta, null); }
    refreshItems(drag.ids); return;
  }
  if (drag.mode === 'resize') {
    startDragCommon();
    const p = toMM(e), dir = drag.dir, b = drag.b;
    const sx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0, sy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
    let [dx, dy] = rotPt(p.x - drag.p0.x, p.y - drag.p0.y, 0, 0, -drag.rot0);
    const noSnap = alt || (drag.rot0 % 180 !== 0);
    if (!noSnap) {
      if (sx) { const edge = sx > 0 ? b.x + b.w + dx : b.x + dx; const r = snapPoint(edge, 0, drag.cands, false); dx += r.x - edge; }
      if (sy) { const edge = sy > 0 ? b.y + b.h + dy : b.y + dy; const r = snapPoint(0, edge, drag.cands, false); dy += r.y - edge; }
    }
    let nw = Math.max(0.5, b.w + sx * dx), nh = Math.max(0.5, b.h + sy * dy), cropNew = null;
    const corner = sx && sy, isImg = drag.single && drag.orig.get(drag.ids[0]).type === 'image';
    const o0 = drag.single ? drag.orig.get(drag.ids[0]) : null, itAr = !!(o0 && o0.ar && o0.type !== 'text' && !isImg);
    if (corner && (e.shiftKey || !drag.single || isImg || itAr)) { const k = Math.max(nw / b.w, nh / b.h); nw = b.w * k; nh = b.h * k; }
    if (itAr && !corner) { if (sx) nh = b.h * nw / b.w; else nw = b.w * nh / b.h; } // 비율 고정: 가장자리를 끌어도 다른 쪽이 따라옴
    if (isImg && !corner) { // 사진의 가장자리 손잡이 = 자르기
      const o = drag.orig.get(drag.ids[0]), FW = o.w / (1 - o.cl - o.cr), FH = o.h / (1 - o.ct - o.cb);
      let { cl, cr, ct, cb } = o;
      if (sx > 0) cr = clamp(o.cr - dx / FW, 0, 0.98 - o.cl); if (sx < 0) cl = clamp(o.cl + dx / FW, 0, 0.98 - o.cr);
      if (sy > 0) cb = clamp(o.cb - dy / FH, 0, 0.98 - o.ct); if (sy < 0) ct = clamp(o.ct + dy / FH, 0, 0.98 - o.cb);
      nw = FW * (1 - cl - cr); nh = FH * (1 - ct - cb); cropNew = { cl, cr, ct, cb };
    }
    if (drag.single) {
      const it = findItem(drag.ids[0]), o = drag.orig.get(it.id);
      if (it.type === 'text') nh = o._h;
      if (!sx && !itAr) nw = b.w; if (!sy && !itAr) nh = b.h;
      const [ox, oy] = [b.x + b.w / 2, b.y + b.h / 2];
      const [sh1, sh2] = rotPt(sx * (nw - b.w) / 2, sy * (nh - b.h) / 2, 0, 0, drag.rot0);
      const ncx = ox + sh1, ncy = oy + sh2;
      restoreFrom(drag.orig);
      if (cropNew) Object.assign(it, cropNew);
      it.w = r2(nw); if (it.type !== 'text') it.h = r2(nh);
      if (it.type === 'table') rescaleTable(it, o);
      it.x = r2(ncx - it.w / 2); it.y = r2(ncy - (it.type === 'text' ? o._h : it.h) / 2);
      refreshItems([it.id]);
    } else {
      const fx = sx ? nw / b.w : 1, fy = sy ? nh / b.h : 1;
      const ax = sx > 0 ? b.x : sx < 0 ? b.x + b.w : b.x, ay = sy > 0 ? b.y : sy < 0 ? b.y + b.h : b.y;
      scaleItems(drag.orig, ax, ay, fx, fy, 0, 0);
      refreshItems(drag.ids);
    }
    drawSmart([]);
    return;
  }
});
function endDrag(cancel) {
  if (!drag) return;
  const d = drag; drag = null;
  drawSmart([]);
  if (d.mode === 'draw') { finishDraw(d, cancel); return; }
  if (d.mode === 'newguide') {
    const g = tempGuide; tempGuide = null;
    if (!cancel && !g.out) { mutate(() => { guideTarget().push({ id: g.id, axis: g.axis, pos: g.pos, ...(g.color && g.color !== '#14b8d4' ? { color: g.color } : {}) }); }); selectGuide(g.id); renderGuideBox(); }
    renderUserGuides(); return;
  }
  if (d.mode === 'guide') {
    if (d.moved && d.out) { const f = findGuide(d.gid); if (f) { const arr = f.owner === 'page' ? curPage().guides : ctxMaster().guides; arr.splice(arr.indexOf(f.g), 1); } selGuide = null; save(); renderPropBox(); }
    else if (d.moved) { save(); renderPropBox(); }
    renderUserGuides(); return;
  }
  if (d.mode === 'marquee') { d.box.remove(); renderPropBox(); return; }
  if (d.mode === 'pan') return;
  if (d.mode === 'cellsel') { renderPropBox(); if (!d.moved && d.same && !cancel) enterCellEdit(d.id, d.key); return; }
  if (d.moved) { save(); renderPropBox(); renderSelection(); return; }
  if (d.mode === 'move' && !cancel) {
    if (d.additive && d.wasSel) select(selIds.filter(i => i !== d.id));
    else if (!d.additive && d.wasSel && selIds.length === 1) { const it = findItem(d.id); if (it && it.type === 'text') enterEdit(d.id, false); }
    else if (!d.additive && d.wasSel && selIds.length > 1) select([d.id]);
  }
}
/* ---- 자유곡선 그리기 ---- */
function drawPreview(pts) {
  const svg = $('#smartLayer'); svg.textContent = '';
  svg.setAttribute('viewBox', `0 0 ${doc.page.w} ${doc.page.h}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.append(svgEl('path', { d: 'M' + pts.map(p => `${r2(p[0])} ${r2(p[1])}`).join('L'), fill: 'none', stroke: '#2f6f5e', 'stroke-width': 0.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
function rdp(pts, eps) { // 점을 솎아서 부드럽게 (Ramer–Douglas–Peucker)
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  let mi = 0, md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > md) { md = d; mi = i; } }
  if (md <= eps) return [a, b];
  return [...rdp(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdp(pts.slice(mi), eps)];
}
function finishDraw(d, cancel) {
  ui.draw = false; updateDrawUI(); $('#smartLayer').textContent = '';
  if (cancel || d.pts.length < 2) return;
  const raw = d.pts, first = raw[0], last = raw[raw.length - 1];
  const looped = raw.length >= 6 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 3;
  let pts;
  if (looped) { // 처음과 끝이 만나는 그림: 가장 먼 점에서 둘로 나눠 각각 솎은 뒤 이어 붙임
    let k = 0, md = 0; raw.forEach((p, i) => { const dd = Math.hypot(p[0] - first[0], p[1] - first[1]); if (dd > md) { md = dd; k = i; } });
    pts = [...rdp(raw.slice(0, k + 1), 0.35).slice(0, -1), ...rdp(raw.slice(k), 0.35)];
  } else pts = rdp(raw, 0.35);
  if (pts.length < 2) return;
  const closed = looped && pts.length >= 4;
  if (closed) pts = pts.slice(0, -1);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(Math.max(...xs) - x0, 0.5), hh = Math.max(Math.max(...ys) - y0, 0.5);
  const it = { type: 'path', rot: 0, lock: false, hide: false, gid: null, color: 'k100', x: r2(x0), y: r2(y0), w: r2(w), h: r2(hh), pts: pts.map(p => [(p[0] - x0) / w, (p[1] - y0) / hh]), closed, th: 0.4, dash: false, stroke: true, fill: null, pat: null };
  mutate(() => { it.id = nextItemId(); ctxItems().push(it); });
  renderItems(); select([it.id]);
}
function updateDrawUI() { const b = document.querySelector('[data-add=path]'); if (b) b.classList.toggle('on', ui.draw); scroller.style.cursor = ui.draw ? 'crosshair' : ''; }
window.addEventListener('pointerup', e => { touchPts.delete(e.pointerId); if (pinch && touchPts.size < 2) pinch = null; endDrag(false); });
window.addEventListener('pointercancel', e => { touchPts.delete(e.pointerId); if (pinch && touchPts.size < 2) pinch = null; endDrag(true); });
scroller.addEventListener('dblclick', e => {
  const itEl = e.target.closest('.it'); if (!itEl) return;
  const it = findItem(+itEl.dataset.id); if (!it || it.lock) return;
  if (it.type === 'text') { select([it.id]); enterEdit(it.id, false); }
  else if (it.type === 'table') {
    select([it.id]);
    const { r, c } = tableCellAt(it, toMM(e)), o = NP.tableGeom(it).owner[r][c];
    cellSel = { id: it.id, r1: o.r, c1: o.c, r2: o.r + o.rs - 1, c2: o.c + o.cs - 1 };
    renderSelection(); renderPropBox(); enterCellEdit(it.id, o.r + ',' + o.c);
  }
});

/* ---------- 확대·축소 (손가락 두 개 / Ctrl+휠 / 단추) ---------- */
let pinch = null;
function zoomAt(newZoom, cx, cy) { // 화면의 (cx,cy)에 있는 지점이 그대로 있도록 확대
  newZoom = clamp(newZoom, 0.3, 8);
  const sr = scroller.getBoundingClientRect(), p0 = ppm(), fr = frameEl.getBoundingClientRect();
  const mmx = (cx - fr.left) / p0, mmy = (cy - fr.top) / p0;
  zoom = newZoom; applyView();
  const fr2 = frameEl.getBoundingClientRect(), p1 = ppm();
  scroller.scrollLeft += fr2.left + mmx * p1 - cx; scroller.scrollTop += fr2.top + mmy * p1 - cy;
  drawRulers();
}
function startPinch() {
  if (drag) { if (drag.mode === 'marquee') drag.box.remove(); drag = null; }
  const [a, b] = [...touchPts.values()];
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: zoom };
}
function updatePinch() {
  const [a, b] = [...touchPts.values()]; if (!a || !b || !pinch) return;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  zoomAt(pinch.z0 * d / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
}
scroller.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoomAt(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); }, { passive: false });
let gz0 = 1;
scroller.addEventListener('gesturestart', e => { e.preventDefault(); gz0 = zoom; });
scroller.addEventListener('gesturechange', e => { e.preventDefault(); const r = scroller.getBoundingClientRect(); zoomAt(gz0 * e.scale, r.left + r.width / 2, r.top + r.height / 2); });
$('#zoomIn').onclick = () => { const r = scroller.getBoundingClientRect(); zoomAt(zoom * 1.25, r.left + r.width / 2, r.top + r.height / 2); };
$('#zoomOut').onclick = () => { const r = scroller.getBoundingClientRect(); zoomAt(zoom / 1.25, r.left + r.width / 2, r.top + r.height / 2); };
$('#zoomFit').onclick = () => { zoom = 1; applyView(); scroller.scrollLeft = 0; scroller.scrollTop = 0; drawRulers(); };

/* ---------- 글자 고쳐 쓰기 ---------- */
function enterEdit(id, selectAll) {
  const it = findItem(id); if (!it || it.type !== 'text' || editingId === id) return;
  endEdit();
  const el = els.get(id), b = el.querySelector('.body');
  editingId = id; editBefore = JSON.stringify(doc);
  el.classList.add('editing');
  b.textContent = it.text;
  try { b.contentEditable = 'plaintext-only'; } catch (e) { /* 아래에서 보완 */ }
  if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
  renderSelection();
  b.focus();
  const range = document.createRange(); range.selectNodeContents(b);
  if (!selectAll) range.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(range);
  b.onblur = () => endEdit();
  b.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); b.blur(); } };
}
function endEdit(skipRender) {
  if (editingId == null) return;
  const id = editingId, key = editingCell; editingId = null; editingCell = null;
  const it = findItem(id), el = els.get(id);
  if (!el) return;
  el.classList.remove('editing');
  if (key != null) { // 표 칸
    const tt = el.querySelector(`.tcell[data-key="${key}"] .tt`);
    if (tt) {
      tt.onblur = null; tt.onkeydown = null; tt.removeAttribute('contenteditable');
      const t = tt.innerText.replace(/\n$/, '');
      if (it && t !== NP.cellStyle(it, key).text) { undoStack.push(editBefore); redoStack.length = 0; lastKey = ''; updateUndo(); it.cells[key] = { ...NP.cellStyle(it, key), text: t }; save(); }
    }
    if (it) { el._sig = null; syncItemEl(el, it, ui.pageIdx + 1, gridStep()); }
    editBefore = null; renderSelection(); renderPropBox(); return;
  }
  const b = el.querySelector('.body');
  b.onblur = null; b.onkeydown = null;
  b.removeAttribute('contenteditable');
  if (it) {
    const t = b.innerText.replace(/\n$/, '');
    if (t !== it.text) { undoStack.push(editBefore); redoStack.length = 0; lastKey = ''; updateUndo(); it.text = t; save(); }
    syncItemEl(el, it, ui.pageIdx + 1, gridStep());
  }
  editBefore = null;
  renderSelection();
}
function enterCellEdit(id, key) {
  const it = findItem(id); if (!it || it.type !== 'table' || it.lock) return;
  endEdit();
  const el = els.get(id), tt = el && el.querySelector(`.tcell[data-key="${key}"] .tt`); if (!tt) return;
  editingId = id; editingCell = key; editBefore = JSON.stringify(doc);
  el.classList.add('editing');
  tt.textContent = NP.cellStyle(it, key).text;
  try { tt.contentEditable = 'plaintext-only'; } catch (e) { /* 아래에서 보완 */ }
  if (tt.contentEditable !== 'plaintext-only') tt.contentEditable = 'true';
  renderSelection();
  tt.focus();
  const range = document.createRange(); range.selectNodeContents(tt); range.collapse(false);
  const sl = getSelection(); sl.removeAllRanges(); sl.addRange(range);
  tt.onblur = () => endEdit();
  tt.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); tt.blur(); } };
}

/* ---------- 명령: 넣기·복사·붙여넣기·순서·정렬·그룹·잠금 ---------- */
function addItem(kind) {
  if (kind === 'image') { imgReplaceId = null; $('#imgFile').click(); return; }
  if (kind === 'path') { ui.draw = !ui.draw; updateDrawUI(); if (ui.draw) toast('페이지 위에서 끌어서 그려 보세요 (그만하려면 Esc)'); return; }
  endEdit(); ui.draw = false; updateDrawUI();
  const { w, h: ph } = doc.page, st = gridStep(), n = ctxItems().length % 5;
  const bx = snapPos(w * 0.12, 'x') + n * st, by = snapPos(ph * 0.12, 'y') + n * st;
  const gm = ctxMaster();
  const base = { rot: 0, lock: false, hide: false, gid: null, color: 'k100' };
  const shape = (k, ww, hh, extra = {}) => ({ ...base, type: 'shape', kind: k, x: bx, y: by, w: snapLen(ww), h: snapLen(hh), r: 0, pts: 5, th: 0.3, dash: false, stroke: true, fill: null, pat: null, ...extra });
  let it;
  if (kind === 'text') it = { ...base, type: 'text', x: bx, y: by, w: snapLen(w * 0.6), text: '여기에 글자', pt: w < 120 ? 10 : 12, bold: false, align: 'left', font: 'pretendard', lh: gm && gm.grid.type !== 'none' ? 1 : 0 };
  else if (kind === 'line') it = { ...base, type: 'line', x1: snapPos(w * 0.1, 'x'), y1: by + st * 2, x2: snapPos(w * 0.9, 'x'), y2: by + st * 2, th: 0.3, dash: false, ah: 'none', at: 'none' };
  else if (kind === 'rect') it = shape('rect', w * 0.6, ph * 0.2);
  else if (kind === 'round') it = shape('rect', w * 0.6, ph * 0.2, { r: 4 });
  else if (kind === 'ellipse') it = shape('ellipse', w * 0.45, ph * 0.2);
  else if (kind === 'triangle') it = shape('triangle', w * 0.35, ph * 0.2);
  else if (kind === 'star') it = shape('star', w * 0.3, w * 0.3);
  else if (kind === 'table') {
    const cols = 3, rows = 4, cwv = Math.max(st, snapLen(w * 0.8 / cols)), rhv = Math.max(st, snapLen(8));
    it = { ...base, type: 'table', x: bx, y: by, cw: Array(cols).fill(cwv), rh: Array(rows).fill(rhv), w: cwv * cols, h: rhv * rows, cells: {}, merges: [], th: 0.3, dash: false, outer: true };
  } else return;
  mutate(() => { it.id = nextItemId(); ctxItems().push(it); });
  renderItems(); select([it.id]);
  if (kind === 'text') enterEdit(it.id, true);
}
function removeSel() {
  const items = selItems().filter(i => !i.lock);
  if (!items.length) { if (selIds.length) toast('잠긴 개체는 지울 수 없어요'); return; }
  const ids = items.map(i => i.id);
  endEdit(true);
  mutate(() => { const a = ctxItems(); for (const id of ids) { const i = a.findIndex(x => x.id === id); if (i >= 0) a.splice(i, 1); } });
  selIds = selIds.filter(i => !ids.includes(i)); cellSel = null; renderItems(); renderPropBox();
}
function removeSelGuide() {
  const all = guideSel().map(findGuide).filter(Boolean), fs = all.filter(f => !f.g.lock);
  if (!fs.length) { if (all.length) toast('잠긴 가이드선은 지울 수 없어요. 잠금을 풀어 주세요'); return; }
  mutate(() => { for (const f of fs) { const arr = f.owner === 'page' ? curPage().guides : ctxMaster().guides; arr.splice(arr.indexOf(f.g), 1); } });
  selGuide = null; extraGuides = []; renderUserGuides(); renderPropBox(); renderGuideBox();
}
function copySel() { const items = selItems(); if (!items.length) return false; clip = { items: JSON.parse(JSON.stringify(items)), key: ctxKey() }; pasteN = 0; renderPropBox(); return true; }
function pasteClip() {
  if (!clip) return toast('복사한 것이 없어요');
  endEdit();
  const same = clip.key === ctxKey(), st = gridStep(); pasteN++;
  const gmap = new Map(), made = [];
  mutate(() => {
    let id = nextItemId();
    for (const src of clip.items) {
      const c = JSON.parse(JSON.stringify(src)); c.id = id++; c.lock = false;
      if (c.gid) { if (!gmap.has(c.gid)) gmap.set(c.gid, newUid('G')); c.gid = gmap.get(c.gid); }
      if (same) moveItem(c, st * pasteN, st * pasteN);
      ctxItems().push(c); made.push(c.id);
    }
  });
  renderItems(); select(made);
}
function dupSel() { if (copySel()) { pasteN = 0; pasteClip(); } }
function reorder(mode) {
  const ids = new Set(selIds); if (!ids.size) return;
  mutate(() => {
    const a = ctxItems(), sel = a.filter(i => ids.has(i.id)), rest = a.filter(i => !ids.has(i.id));
    let out;
    if (mode === 'front') out = [...rest, ...sel];
    else if (mode === 'back') out = [...sel, ...rest];
    else {
      out = a.slice();
      if (mode === 'up') for (let i = out.length - 2; i >= 0; i--) { if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]; }
      else for (let i = 1; i < out.length; i++) { if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]; }
    }
    a.splice(0, a.length, ...out);
  });
  renderItems(); renderPropBox();
}
function groupSel() { const items = selItems(); if (items.length < 2) return toast('2개 이상 골라야 묶을 수 있어요'); const g = newUid('G'); mutate(() => { for (const it of items) it.gid = g; }); renderPropBox(); }
function ungroupSel() { const items = selItems(); mutate(() => { for (const it of items) it.gid = null; }); renderPropBox(); }
function setProp(prop, val) { // 잠금·숨김은 잠긴 것에도 적용
  const items = selItems();
  mutate(() => { for (const it of items) it[prop] = val; });
  refreshItems(items.map(i => i.id)); renderPropBox();
}
function units(items) { // 묶음은 하나로 취급
  const map = new Map(), out = [];
  for (const it of items) { const k = it.gid || 'i' + it.id; if (!map.has(k)) { const u = { items: [] }; map.set(k, u); out.push(u); } map.get(k).items.push(it); }
  for (const u of out) u.box = unionBox(u.items.map(bboxOf));
  return out;
}
function alignSel(mode) {
  const free = selItems().filter(i => !i.lock);
  if (!free.length) return toast('잠긴 개체는 움직일 수 없어요');
  const us = units(free);
  const ref = ui.alignTo === 'page' || us.length === 1 ? { x: 0, y: 0, w: doc.page.w, h: doc.page.h } : unionBox(us.map(u => u.box));
  mutate(() => {
    for (const u of us) {
      const b = u.box; let dx = 0, dy = 0;
      if (mode === 'l') dx = ref.x - b.x; else if (mode === 'c') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); else if (mode === 'r') dx = ref.x + ref.w - (b.x + b.w);
      else if (mode === 't') dy = ref.y - b.y; else if (mode === 'm') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); else if (mode === 'b') dy = ref.y + ref.h - (b.y + b.h);
      for (const it of u.items) moveItem(it, dx, dy);
    }
  });
  refreshItems(selIds); renderPropBox();
}
function distSel(axis) {
  const us = units(selItems().filter(i => !i.lock)); if (us.length < 3) return toast('잠기지 않은 것 3개 이상을 골라야 같은 간격으로 배열할 수 있어요');
  const k = axis === 'x' ? ['x', 'w'] : ['y', 'h'];
  us.sort((a, b) => a.box[k[0]] - b.box[k[0]]);
  const first = us[0].box, last = us[us.length - 1].box, total = (last[k[0]] + last[k[1]]) - first[k[0]], sum = us.reduce((t, u) => t + u.box[k[1]], 0), gap = (total - sum) / (us.length - 1);
  mutate(() => { let pos = first[k[0]] + first[k[1]] + gap; for (let i = 1; i < us.length - 1; i++) { const d = pos - us[i].box[k[0]]; for (const it of us[i].items) moveItem(it, axis === 'x' ? d : 0, axis === 'y' ? d : 0); pos += us[i].box[k[1]] + gap; } });
  refreshItems(selIds); renderPropBox();
}
const STYLE_KEYS = {
  text: ['font', 'pt', 'bold', 'align', 'lh', 'color'], line: ['th', 'dash', 'color', 'ah', 'at'],
  image: ['gray'], shape: ['th', 'dash', 'color', 'stroke', 'fill', 'pat', 'r'], path: ['th', 'dash', 'color', 'stroke', 'fill', 'pat'], table: ['th', 'dash', 'color', 'outer'],
};
function copyFormat() { const it = selItems()[0]; if (!it) return; fmt = { type: it.type, props: JSON.parse(JSON.stringify(Object.fromEntries(STYLE_KEYS[it.type].map(k => [k, it[k]])))) }; toast('서식을 복사했어요. 다른 것을 골라 “서식 붙여넣기”를 누르세요'); renderPropBox(); }
function pasteFormat() {
  if (!fmt) return; const items = selItems().filter(i => !i.lock); if (!items.length) return;
  mutate(() => {
    for (const it of items) {
      for (const [k, v] of Object.entries(fmt.props)) {
        const sameFam = it.type === fmt.type || (['shape', 'path'].includes(it.type) && ['shape', 'path'].includes(fmt.type) && k !== 'r');
        if (STYLE_KEYS[it.type].includes(k) && (sameFam || ['color', 'th', 'dash'].includes(k))) it[k] = JSON.parse(JSON.stringify(v));
      }
      if (it.type === 'path' && !it.closed) { it.fill = null; it.pat = null; }
    }
  });
  refreshItems(items.map(i => i.id)); renderPropBox();
}
function selectAll() { select(ctxItems().filter(i => !i.hide && !i.lock).map(i => i.id)); }

/* ---------- 키보드 ---------- */
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (e.code === 'Space' && !typing && editingId == null) { spaceDown = true; scroller.style.cursor = 'grab'; if (!$('#printModal').hidden) return; e.preventDefault(); return; }
  if (editingId != null || typing || !$('#printModal').hidden || !$('#pdfModal').hidden || !$('#myModal').hidden) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
  if (mod && k === 'c' && e.shiftKey) { e.preventDefault(); copyFormat(); return; }
  if (mod && k === 'v' && e.shiftKey) { e.preventDefault(); pasteFormat(); return; }
  if (mod && k === 'c') { e.preventDefault(); copySel(); return; }
  if (mod && k === 'x') { e.preventDefault(); if (copySel()) removeSel(); return; }
  if (mod && k === 'v') { e.preventDefault(); pasteClip(); return; }
  if (mod && k === 'd') { e.preventDefault(); dupSel(); return; }
  if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); return; }
  if (e.key === 'Escape') { if (ui.draw) { ui.draw = false; updateDrawUI(); return; } cellSel = null; select([]); selGuide = null; renderUserGuides(); renderPropBox(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); if (selGuide) removeSelGuide(); else removeSel(); return; }
  const items = selItems().filter(i => !i.lock); if (!items.length) return;
  if (e.key === 'Enter' && items.length === 1 && items[0].type === 'text') { e.preventDefault(); enterEdit(items[0].id, false); return; }
  if (e.key === 'Enter' && items.length === 1 && items[0].type === 'table' && cellSel && cellSel.id === items[0].id) { e.preventDefault(); enterCellEdit(items[0].id, expandRange(items[0], cellSel).r1 + ',' + expandRange(items[0], cellSel).c1); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key]) {
    e.preventDefault();
    const st = e.shiftKey ? 1 : (doc.snap ? gridStep() : 0.5), [dx, dy] = arrows[e.key];
    mutate(() => { for (const it of items) moveItem(it, dx * st, dy * st); }, 'nudge');
    refreshItems(items.map(i => i.id)); renderPropBox();
  }
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; scroller.style.cursor = ''; } });

/* ---------- 오른쪽(아래) 설정 칸 ---------- */
function seg(options, value, onPick) {
  return h('span', { class: 'seg' }, options.map(([v, label]) => h('button', { type: 'button', class: v === value ? 'on' : '', onclick: () => onPick(v) }, label)));
}
function stepper(value, { min, max, step }, onChange) {
  const inp = h('input', { type: 'number', value, min, max, step: 'any' });
  const set = v => { v = r2(clamp(+v, min, max)); inp.value = v; onChange(v); };
  inp.addEventListener('change', () => set(inp.value));
  return h('span', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': '줄이기', onclick: () => set(+inp.value - step) }, '−'), inp,
    h('button', { type: 'button', 'aria-label': '늘리기', onclick: () => set(+inp.value + step) }, '＋'));
}
function swatches(value, onPick) {
  const out = []; let last = null;
  for (const c of doc.colors) {
    if (last && last !== c.group) out.push(h('span', { class: 'swsep' }));
    last = c.group;
    out.push(h('button', { type: 'button', class: 'swatch' + (c.id === value ? ' on' : ''), style: `background:${colorRGB(c.id)}`, title: `${c.name}  (C${c.c} M${c.m} Y${c.y} K${c.k})`, 'aria-label': c.name, onclick: () => onPick(c.id) }));
  }
  return h('span', { class: 'swatches' }, out);
}
const row = (label, ...kids) => h('div', { class: 'row' }, h('label', {}, label), ...kids);
const btn = (label, fn, extra = {}) => h('button', { type: 'button', onclick: fn, ...extra }, label);

function renderPanels() { renderKindBox(); renderPaperBox(); renderGuideBox(); renderNumBox(); renderHoleBox(); renderMasterBox(); renderPropBox(); renderColorBox(); }

function renderPaperBox() {
  const b = $('#paperBox'); b.textContent = '';
  const custom = lsGet(LS.sizes, []);
  const all = [...PRESETS, ...custom.map(c => ({ id: 'u:' + c.name, name: c.name + ' ★', w: c.w, h: c.h, user: true }))];
  const { w, h: ph } = doc.page;
  const cur = all.find(p => (p.w === w && p.h === ph) || (p.w === ph && p.h === w));
  b.append(row('크기', h('select', { onchange: e => {
    const p = all.find(x => x.id === e.target.value); if (!p) return;
    const land = doc.page.w > doc.page.h, lo = Math.min(p.w, p.h), hi = Math.max(p.w, p.h);
    mutate(() => { doc.page.w = land ? hi : lo; doc.page.h = land ? lo : hi; }); zoom = 1; renderAll();
  } }, all.map(p => h('option', { value: p.id, selected: cur && cur.id === p.id }, `${p.name}  (${p.w}×${p.h})`)), h('option', { value: 'custom', selected: !cur }, '직접 입력'))));
  const setSize = (nw, nh) => { mutate(() => { doc.page.w = clamp(nw, 20, 500); doc.page.h = clamp(nh, 20, 500); }); zoom = 1; renderAll(); };
  b.append(row('가로 × 세로', stepper(w, { min: 20, max: 500, step: 1 }, v => setSize(v, doc.page.h)), h('span', { class: 'unit' }, '×'),
    stepper(ph, { min: 20, max: 500, step: 1 }, v => setSize(doc.page.w, v)), h('span', { class: 'unit' }, 'mm')));
  b.append(row('', btn('↻ 가로·세로 바꾸기', () => setSize(doc.page.h, doc.page.w)),
    cur && cur.user
      ? btn('이 크기 지우기', () => { lsSet(LS.sizes, custom.filter(c => 'u:' + c.name !== cur.id)); renderPaperBox(); toast('저장한 크기를 지웠어요'); })
      : (!cur ? btn('이 크기 저장', () => {
        const name = (prompt('이 크기에 붙일 이름을 적어 주세요 (예: 슬림)', '') || '').trim(); if (!name) return;
        const list = custom.filter(c => c.name !== name); list.push({ name, w: doc.page.w, h: doc.page.h });
        lsSet(LS.sizes, list); renderPaperBox(); toast(`“${name}” 크기를 저장했어요`);
      }) : null)));
  b.append(row('도련', stepper(doc.bleed, { min: 0, max: 10, step: 1 }, v => { mutate(() => { doc.bleed = v; }); zoom = 1; renderAll(); }), h('span', { class: 'unit' }, 'mm')));
  b.append(row('안전 여백', stepper(doc.safe, { min: 0, max: 20, step: 1 }, v => { mutate(() => { doc.safe = v; }); renderGuides(); }), h('span', { class: 'unit' }, 'mm')));
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: ui.guides, onchange: e => { ui.guides = e.target.checked; renderGuides(); } }), '도련·안전선 보기 (인쇄되지 않아요)')));
  b.append(h('p', { class: 'hint' }, '위 크기는 최종 재단 크기예요(흰 쪽 = 자르는 자리). 도련은 그 바깥으로 따로 더해지는 빗금 띠(종이 밖, 재단 때 잘려 나가는 여유이며 배경·그림은 빨간 점선까지 채우기)이고, 파란 점선 = 안전선(중요한 글자는 안쪽에)이에요. 목록에 없는 크기(예: 슬림)는 mm로 적고 “이 크기 저장”을 누르세요.'));
}

function renderMasterBox() {
  const b = $('#masterBox'); b.textContent = '';
  const m = ctxMaster(), pg = curPage();
  if (!ui.editMaster) {
    b.append(row('이 쪽의 바탕', h('select', { onchange: e => { mutate(() => { pg.master = e.target.value || null; }); renderStage(); renderPanels(); } },
      h('option', { value: '', selected: !pg.master }, '없음 (흰 종이)'), doc.masters.map(x => h('option', { value: x.id, selected: pg.master === x.id }, x.name)))));
    b.append(row('', btn('✎ 바탕 꾸미기', () => enterMaster(pg.master), { disabled: !pg.master }), btn('＋ 새 바탕', newMaster)));
    b.append(row('', btn('이 바탕을 모든 쪽에', () => { mutate(() => { for (const p of doc.pages) p.master = pg.master; }); renderStrip(); toast(`모든 쪽에 “${masterById(pg.master).name}”을(를) 적용했어요`); renderPanels(); }, { disabled: !pg.master })));
    b.append(h('p', { class: 'hint' }, '바탕 = 모든 쪽에 한꺼번에 깔리는 밑그림(모눈·점·줄, 반복할 선·가이드선 등). 한 번 꾸미면 쓰는 쪽 전부에 반복됩니다.'));
  } else {
    b.append(row('바탕 이름', h('b', {}, m.name), btn('이름 바꾸기', () => renameMaster(m)), btn('지우기', () => deleteMaster(m))));
  }
  if (!m) { b.append(h('p', { class: 'hint' }, '바탕이 없는 쪽이에요. 위에서 바탕을 고르거나 “새 바탕”을 만드세요.')); return; }
  const g = m.grid;
  const set = (fn, key) => { mutate(fn, key); renderBackdrop(); renderItems(); renderStrip(); renderMasterBox(); };
  b.append(h('div', { class: 'sub' }, '모눈 설정' + (ui.editMaster ? '' : ` (“${m.name}” — 이 바탕을 쓰는 모든 쪽에 적용)`)));
  b.append(row('모양', seg([['square', '모눈'], ['dot', '점'], ['line', '줄'], ['none', '없음']], g.type, v => set(() => { g.type = v; }))));
  b.append(row('칸 간격', stepper(g.size, { min: 2, max: 30, step: 0.5 }, v => set(() => { g.size = v; })), h('span', { class: 'unit' }, 'mm')));
  if (g.type === 'dot') b.append(row('도트 크기', stepper(g.dot || 0.6, { min: 0.2, max: 3, step: 0.1 }, v => set(() => { g.dot = v; }, 'gdot')), h('span', { class: 'unit' }, 'mm (지름)')));
  else if (g.type !== 'none') b.append(row('선 굵기', stepper(g.lw || 0.15, { min: 0.05, max: 1, step: 0.05 }, v => set(() => { g.lw = v; }, 'glw')), h('span', { class: 'unit' }, 'mm')));
  b.append(h('div', { class: 'sub2' }, '모눈이 그려지는 범위 — 노트 가장자리에서 안쪽으로 비울 여백(mm)'));
  { const ins = g.inset || { l: 0, t: 0, r: 0, b: 0 }, setIns = (k, v) => set(() => { g.inset = { ...ins, [k]: clamp(v, 0, 60) }; }, 'gins');
    b.append(h('div', { class: 'numgrid' }, ...numField('위', ins.t, v => setIns('t', v)), ...numField('아래', ins.b, v => setIns('b', v)), ...numField('왼쪽', ins.l, v => setIns('l', v)), ...numField('오른쪽', ins.r, v => setIns('r', v))));
    b.append(h('div', { class: 'btnrow' }, btn('노트 전체에 (여백 0)', () => set(() => { g.inset = { l: 0, t: 0, r: 0, b: 0 }; })), btn('안쪽 5mm부터', () => set(() => { g.inset = { l: 5, t: 5, r: 5, b: 5 }; }))));
    b.append(row('시작 위치', seg([['center', '가운데 맞춤'], ['corner', '범위의 왼쪽 위부터']], g.start || 'center', v => set(() => { g.start = v; }))));
    b.append(h('div', { class: 'numgrid' }, ...numField('가로 이동', g.dx || 0, v => set(() => { g.dx = clamp(v, -60, 60); }, 'gdx')), ...numField('세로 이동', g.dy || 0, v => set(() => { g.dy = clamp(v, -60, 60); }, 'gdy'))));
    b.append(h('p', { class: 'hint' }, '여백을 주면 모눈이 그 안쪽 칸 안에서만 그려져요(도련·바깥 여백에는 안 그려짐). “왼쪽 위부터”는 범위의 모서리에서 첫 줄이 시작해요. 가로·세로 이동은 모눈을 mm 단위로 밀어요.')); }
  b.append(h('p', { class: 'hint' }, `가로 ${Math.floor(doc.page.w / g.size)}칸 × 세로 ${Math.floor(doc.page.h / g.size)}칸. 가장자리 여백이 같게 가운데 맞춰 그려져요.`));
  b.append(row('진하기', h('input', { type: 'range', min: 5, max: 100, value: g.tone, oninput: e => { g.tone = +e.target.value; snapshot('tone'); save(); renderBackdrop(); } })));
  b.append(row('모눈 색', swatches(g.color, c => set(() => { g.color = c; }))));
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: doc.snap, onchange: e => { mutate(() => { doc.snap = e.target.checked; }); updateToggles(); } }), '넣은 것을 모눈 칸에 딱 맞춰 붙이기')));
}

function remapColor(from, to) { // 지운 색을 쓰던 곳을 다른 색으로
  const fix = o => { if (!o) return; if (o.color === from) o.color = to; };
  const items = [...doc.masters.flatMap(m => m.items), ...doc.pages.flatMap(p => p.items)];
  for (const m of doc.masters) fix(m.grid);
  for (const it of items) { fix(it); fix(it.fill); fix(it.pat); for (const cs of Object.values(it.cells || {})) { fix(cs); fix(cs.fill); } }
}
function usesNonK(id) { const c = colorOf(id); return c.c > 0 || c.m > 0 || c.y > 0; }
const colorHint = id => (usesNonK(id) ? h('p', { class: 'hint warnc' }, '이 색은 잉크가 여러 색 섞여서, 작은 글씨는 살짝 번져 보일 수 있어요. 가는 글씨는 검정·회색·Ink Black을 권해요.') : null);
function renderColorBox() {
  const b = $('#colorBox'); b.textContent = '';
  b.append(h('p', { class: 'hint' }, '모든 색은 인쇄용 CMYK(%)예요. 검정·회색은 먹(K) 한 가지로만 찍혀서 가는 글씨도 또렷해요. 화면 색은 실제 인쇄색과 조금 달라요 — 색이 중요하면 인쇄소 색상 견본으로 확인하세요.'));
  const refreshAll = () => { renderItems(); renderBackdrop(); renderStrip(); };
  const row2 = (c, { editName, deletable }) => {
    const sw = h('input', { type: 'color', class: 'cpick', value: NP.cmykToHex(c.c, c.m, c.y, c.k), title: '눌러서 화면에서 색 고르기' });
    const inputs = {};
    const upd = (k, v) => { mutate(() => { c[k] = v; }, 'col' + c.id + k); sw.value = NP.cmykToHex(c.c, c.m, c.y, c.k); refreshAll(); };
    sw.addEventListener('change', () => { const hx = sw.value, v = NP.rgbToCmyk(parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)); mutate(() => { Object.assign(c, v); }); refreshAll(); renderColorBox(); });
    const cm = ['c', 'm', 'y', 'k'].map(k => h('label', { class: 'cm' }, k.toUpperCase(), (inputs[k] = h('input', { type: 'number', min: 0, max: 100, step: 1, value: c[k], onchange: e => { const v = clamp(Math.round(+e.target.value) || 0, 0, 100); e.target.value = v; upd(k, v); } }))));
    const name = h('input', { class: 'cname-in', value: c.name, 'aria-label': '색 이름', onchange: e => { const v = e.target.value.trim() || c.name; mutate(() => { c.name = v; }); renderColorBox(); } });
    return h('div', { class: 'colrow' }, sw, name, ...cm, deletable ? btn('지우기', () => { const used = usedCount(c.id); if (used && !confirm(`이 색을 쓰는 곳이 ${used}군데 있어요. 지우면 검정으로 바뀌어요. 지울까요?`)) return; mutate(() => { remapColor(c.id, 'k100'); doc.colors = doc.colors.filter(x => x !== c); }); refreshAll(); renderPanels(); }) : null);
  };
  const usedCount = id => { let n = 0; const items = [...doc.masters.flatMap(m => m.items), ...doc.pages.flatMap(p => p.items)]; for (const it of items) { if (it.color === id) n++; if (it.fill && it.fill.color === id) n++; if (it.pat && it.pat.color === id) n++; for (const cs of Object.values(it.cells || {})) { if (cs.color === id) n++; if (cs.fill && cs.fill.color === id) n++; } } for (const m of doc.masters) if (m.grid.color === id) n++; return n; };
  b.append(h('div', { class: 'sub2' }, '기본 (검정·회색, 먹 한 가지)'));
  b.append(h('div', { class: 'basicrow' }, doc.colors.filter(c => c.group === 'basic').map(c => h('span', { class: 'bchip' }, h('span', { class: 'swatch big', style: `background:${colorRGB(c.id)}` }), `${c.name} K${c.k}`))));
  b.append(h('div', { class: 'sub2' }, 'iLang 브랜드 색 (값을 고칠 수 있어요)'));
  for (const c of doc.colors.filter(x => x.group === 'brand')) b.append(row2(c, {}));
  const mine = doc.colors.filter(x => x.group === 'mine');
  b.append(h('div', { class: 'sub2' }, `내 색 (${mine.length}/${NP.MAX_CUSTOM_COLORS})`));
  for (const c of mine) b.append(row2(c, { deletable: true }));
  b.append(btn('＋ 내 색 추가', () => {
    if (mine.length >= NP.MAX_CUSTOM_COLORS) return toast(`내 색은 ${NP.MAX_CUSTOM_COLORS}개까지예요`);
    mutate(() => { doc.colors.push({ id: 'u' + Date.now().toString(36), name: `내 색 ${mine.length + 1}`, group: 'mine', c: 0, m: 50, y: 50, k: 0 }); });
    renderPanels();
  }, { disabled: mine.length >= NP.MAX_CUSTOM_COLORS }));
  b.append(h('p', { class: 'hint' }, '색 동그라미를 누르면 화면에서 색을 고를 수 있고(CMYK로 자동 변환), 숫자를 직접 적어도 돼요. 연한 색은 색을 새로 만들지 않고 채우기의 “농도(%)”로도 만들 수 있어요.'));
}

/* ---- 고른 것 바꾸기 + 개체 목록 ---- */
const SHAPE_NAME = { rect: '네모', ellipse: '타원', triangle: '삼각형', star: '별' };
const typeName = it => (it.type === 'text' ? '글자' : it.type === 'line' ? (it.ah === 'arrow' || it.at === 'arrow' ? '화살표 선' : '선') : it.type === 'path' ? '자유곡선' : it.type === 'table' ? '표' : it.type === 'image' ? '이미지' : (it.kind === 'rect' && it.r > 0 ? '둥근 네모' : SHAPE_NAME[it.kind] || '도형'));
function numField(label, value, onChange, step = 0.5) {
  const inp = h('input', { type: 'number', value: r2(value), step: 'any' });
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) onChange(v); else inp.value = r2(value); });
  return [h('label', {}, label), inp];
}
const guideColorBtns = (value, onPick) => h('span', { class: 'gcolors' }, NP.GUIDE_COLORS.map(([c, n]) => h('button', { type: 'button', class: c === value ? 'on' : '', style: `background:${c}`, title: n, 'aria-label': n, onclick: () => onPick(c) })));
function renderGuideProps(b, ids) {
  const fs = ids.map(findGuide).filter(Boolean), gl = fs.map(f => f.g), single = fs.length === 1, locked = gl.every(g => g.lock);
  b.append(h('div', { class: 'sub2' }, single ? `가이드선 (${gl[0].axis === 'x' ? '세로선' : '가로선'}) — ${fs[0].owner === 'master' ? '바탕: 이 바탕을 쓰는 모든 쪽' : '이 쪽만'}${gl[0].lock ? ' · 잠김' : ''}` : `가이드선 ${fs.length}개 선택`));
  if (single) b.append(h('div', { class: 'numgrid' }, ...numField('위치(mm)', gl[0].pos, v => { if (gl[0].lock) return toast('잠긴 가이드선이에요. 잠금을 풀어 주세요'); mutate(() => { gl[0].pos = r2(v); }); renderUserGuides(); renderPropBox(); })));
  b.append(row('색', guideColorBtns(gl[0].color || '#14b8d4', c => { mutate(() => { for (const g of gl) { if (c === '#14b8d4') delete g.color; else g.color = c; } }); renderUserGuides(); renderPropBox(); })));
  const m = masterById(curPage().master), btns = [btn(locked ? '잠금 풀기' : '잠금', () => { mutate(() => { for (const g of gl) { if (locked) delete g.lock; else g.lock = true; } }); renderUserGuides(); renderPropBox(); renderGuideBox(); }), btn('지우기', removeSelGuide), btn('묶음으로 저장…', () => saveGuideSet(gl))];
  if (single && fs[0].owner === 'page' && m && !ui.editMaster) btns.push(btn('모든 쪽에 쓰기(바탕으로)', () => { const g = gl[0]; mutate(() => { const arr = curPage().guides; arr.splice(arr.indexOf(g), 1); m.guides.push(g); }); renderUserGuides(); renderPropBox(); }));
  if (single && fs[0].owner === 'master' && !ui.editMaster) btns.push(btn('이 쪽에서만 쓰기', () => { const g = gl[0]; mutate(() => { m.guides.splice(m.guides.indexOf(g), 1); curPage().guides.push(g); }); renderUserGuides(); renderPropBox(); }));
  b.append(h('div', { class: 'btnrow' }, btns));
  b.append(h('p', { class: 'hint' }, 'Shift(또는 Cmd)를 누른 채 가이드선을 누르면 여러 개를 함께 고를 수 있어요. 가이드선은 인쇄되지 않아요.'));
}
function renderPropBox() {
  const b = $('#propBox'); b.textContent = '';
  const gids = guideSel(), items = selItems();
  if (gids.length) renderGuideProps(b, gids);
  if (!items.length && !gids.length) b.append(h('p', { class: 'hint' }, '페이지 위의 글자·선·네모를 누르면 여기서 자세히 바꿀 수 있어요. 눈금자에서 끌어내면 가이드선이 만들어져요. (가이드선 도구는 “문서·쪽” 탭의 “가이드선”에 있어요)'));
  if (items.length) renderItemProps(b, items);
  renderObjList(b);
}
/* ---- 가이드선 도구: 자동 나누기 · 묶음 저장/불러오기 ---- */
function autoDivide(axis, n) { // axis 'y' = 가로선(위아래로 나눔), 'x' = 세로선(좌우로 나눔)
  n = clamp(Math.round(n) || 2, 2, 24);
  const sf = ui.divArea === 'safe' ? doc.safe : 0, len = axis === 'x' ? doc.page.w : doc.page.h, a = sf, bb = len - sf, list = guideTarget();
  let made = 0;
  mutate(() => { for (let i = 1; i < n; i++) { const pos = r2(a + (bb - a) * i / n); if (list.some(g => g.axis === axis && Math.abs(g.pos - pos) < 0.05)) continue; list.push({ id: newUid('g'), axis, pos, ...(ui.guideColor !== '#14b8d4' ? { color: ui.guideColor } : {}) }); made++; } });
  renderUserGuides(); renderGuideBox(); toast(made ? `${axis === 'x' ? '세로' : '가로'}선 ${made}개를 만들었어요 (${n}등분)` : '이미 같은 자리에 가이드선이 있어요');
}
function saveGuideSet(list) {
  if (!list.length) return toast('저장할 가이드선이 없어요');
  const name = (prompt('가이드 묶음 이름', `가이드 묶음 ${doc.guideSets.length + 1}`) || '').trim(); if (!name) return;
  mutate(() => { doc.guideSets.push({ id: newUid('S'), name, guides: list.map(g => ({ axis: g.axis, pos: g.pos, ...(g.color ? { color: g.color } : {}) })) }); });
  renderGuideBox(); toast(`“${name}” 묶음을 저장했어요 (${list.length}개)`);
}
function loadGuideSet(set, replace) {
  const list = guideTarget();
  mutate(() => {
    if (replace) for (let i = list.length - 1; i >= 0; i--) if (!list[i].lock) list.splice(i, 1);
    for (const g of set.guides) if (!list.some(x => x.axis === g.axis && Math.abs(x.pos - g.pos) < 0.05)) list.push({ id: newUid('g'), axis: g.axis, pos: g.pos, ...(g.color ? { color: g.color } : {}) });
  });
  renderUserGuides(); renderGuideBox(); toast(`“${set.name}” 묶음을 ${replace ? '바꿔 넣었어요' : '더했어요'}`);
}
function renderGuideBox() {
  const b = $('#guideBox'); if (!b) return; b.textContent = '';
  const m = masterById(curPage().master), tg = guideTarget();
  b.append(row('만들 곳', seg([['page', '이 쪽만'], ['master', '모든 쪽(바탕)']], ui.editMaster ? 'master' : (m ? ui.guideScope : 'page'), v => { if (ui.editMaster || !m) return; ui.guideScope = v; renderGuideBox(); })));
  b.append(row('새 가이드 색', guideColorBtns(ui.guideColor, c => { ui.guideColor = c; renderGuideBox(); })));
  b.append(h('div', { class: 'sub2' }, '자동으로 나누기'));
  b.append(row('기준', seg([['page', '노트 전체'], ['safe', '안전선 안쪽']], ui.divArea, v => { ui.divArea = v; renderGuideBox(); })));
  const nIn = (axis) => { const inp = h('input', { type: 'number', min: 2, max: 24, value: 5, style: 'width:56px' }); return [inp, btn('나누기', () => autoDivide(axis, +inp.value))]; };
  b.append(row('위아래로 (가로선)', [2, 3, 4].map(n => btn(`${n}등분`, () => autoDivide('y', n))), ...nIn('y')));
  b.append(row('좌우로 (세로선)', [2, 3, 4].map(n => btn(`${n}등분`, () => autoDivide('x', n))), ...nIn('x')));
  b.append(h('p', { class: 'hint' }, '“위아래로 3등분”은 가로선 2개를 그어 노트를 위아래 3칸으로 나눠요. 자동으로 만든 뒤 눈금자에서 끌어내 하나씩 더 추가할 수 있어요.'));
  b.append(h('div', { class: 'btnrow' }, btn(`여기(${ui.editMaster ? '바탕' : (m && ui.guideScope === 'master' ? '바탕' : '이 쪽')})의 가이드선 전부 잠금`, () => { mutate(() => { for (const g of tg) g.lock = true; }); renderUserGuides(); renderGuideBox(); }, { disabled: !tg.length }),
    btn('전부 잠금 풀기', () => { mutate(() => { for (const g of tg) delete g.lock; }); renderUserGuides(); renderGuideBox(); }, { disabled: !tg.some(g => g.lock) }),
    btn('잠기지 않은 것 모두 지우기', () => { mutate(() => { for (let i = tg.length - 1; i >= 0; i--) if (!tg[i].lock) tg.splice(i, 1); }); selGuide = null; extraGuides = []; renderUserGuides(); renderGuideBox(); renderPropBox(); }, { disabled: !tg.some(g => !g.lock) })));
  b.append(h('div', { class: 'sub2' }, '가이드 묶음 (저장해 두고 다른 쪽에서 불러오기)'));
  b.append(h('div', { class: 'btnrow' }, btn('여기의 가이드선 전부를 묶음으로 저장…', () => saveGuideSet(tg), { disabled: !tg.length }), btn('고른 가이드선만 묶음으로 저장…', () => saveGuideSet(guideSel().map(findGuide).filter(Boolean).map(f => f.g)), { disabled: !guideSel().length })));
  if (!doc.guideSets.length) b.append(h('p', { class: 'hint' }, '저장한 묶음이 아직 없어요. 가로·세로 가이드선을 만든 뒤 위 단추로 저장하면, 다른 쪽에서 불러올 수 있어요.'));
  for (const set of doc.guideSets) {
    const hn = set.guides.filter(g => g.axis === 'y').length, vn = set.guides.filter(g => g.axis === 'x').length;
    b.append(h('div', { class: 'gsetrow' }, h('span', { class: 'nm' }, `${set.name} (가로 ${hn} · 세로 ${vn})`), btn('더하기', () => loadGuideSet(set, false)), btn('바꾸기', () => loadGuideSet(set, true)),
      btn('지우기', () => { if (!confirm(`“${set.name}” 묶음을 지울까요? (노트 위의 가이드선은 그대로예요)`)) return; mutate(() => { doc.guideSets = doc.guideSets.filter(x => x !== set); }); renderGuideBox(); })));
  }
  b.append(h('p', { class: 'hint' }, '“더하기”는 지금 있는 가이드선에 묶음을 더하고, “바꾸기”는 잠기지 않은 가이드선을 지우고 묶음으로 바꿔요. 위의 “만들 곳”(이 쪽/바탕)에 적용돼요.'));
}
/* ---- 표 편집 도우미: 행·열 넣기/지우기, 칸 합치기, 칸 서식 ---- */
function tblSync(it) { it.w = r2(it.cw.reduce((a, b) => a + b, 0)); it.h = r2(it.rh.reduce((a, b) => a + b, 0)); }
function tblInsert(it, axis, at) {
  const row = axis === 'row', arr = row ? it.rh : it.cw;
  at = clamp(at, 0, arr.length);
  const size = arr[Math.min(at, arr.length - 1)];
  arr.splice(at, 0, size);
  const nc = {};
  for (const [k, v] of Object.entries(it.cells || {})) { let [r, c] = k.split(',').map(Number); if (row ? r >= at : c >= at) { if (row) r++; else c++; } nc[r + ',' + c] = v; }
  it.cells = nc;
  for (const m of it.merges) { if (row) { if (m.r >= at) m.r++; else if (m.r + m.rs > at) m.rs++; } else if (m.c >= at) m.c++; else if (m.c + m.cs > at) m.cs++; }
  tblSync(it);
}
function tblDelete(it, axis, idx) {
  const row = axis === 'row', arr = row ? it.rh : it.cw;
  if (arr.length <= 1) return;
  arr.splice(idx, 1);
  const nc = {};
  for (const [k, v] of Object.entries(it.cells || {})) { let [r, c] = k.split(',').map(Number); if (row ? r === idx : c === idx) continue; if (row ? r > idx : c > idx) { if (row) r--; else c--; } nc[r + ',' + c] = v; }
  it.cells = nc;
  for (const m of it.merges) { if (row) { if (m.r > idx) m.r--; else if (m.r + m.rs > idx) m.rs--; } else if (m.c > idx) m.c--; else if (m.c + m.cs > idx) m.cs--; }
  it.merges = it.merges.filter(m => m.rs >= 1 && m.cs >= 1 && m.rs * m.cs > 1);
  tblSync(it);
}
function mergeSel(it) {
  const rg = cellSel && cellSel.id === it.id ? expandRange(it, cellSel) : null;
  if (!rg || (rg.r1 === rg.r2 && rg.c1 === rg.c2)) return;
  mutate(() => {
    it.merges = it.merges.filter(m => !(m.r >= rg.r1 && m.r + m.rs - 1 <= rg.r2 && m.c >= rg.c1 && m.c + m.cs - 1 <= rg.c2));
    it.merges.push({ r: rg.r1, c: rg.c1, rs: rg.r2 - rg.r1 + 1, cs: rg.c2 - rg.c1 + 1 });
    for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) if (r !== rg.r1 || c !== rg.c1) delete it.cells[r + ',' + c];
  });
  cellSel = { id: it.id, r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2 }; refreshItems([it.id]); renderPropBox();
}
function unmergeSel(it) {
  const rg = cellSel && cellSel.id === it.id ? expandRange(it, cellSel) : null; if (!rg) return;
  mutate(() => { it.merges = it.merges.filter(m => !(m.r >= rg.r1 && m.r <= rg.r2 && m.c >= rg.c1 && m.c <= rg.c2)); });
  refreshItems([it.id]); renderPropBox();
}
function cellPatch(it, patch) {
  if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요. 잠금을 풀어 주세요');
  const keys = cellSel && cellSel.id === it.id ? rangeKeys(it, cellSel) : NP.tableGeom(it).cells.map(c => c.key);
  mutate(() => {
    it.cells = it.cells || {};
    for (const k of keys) { const st = { ...NP.cellStyle(it, k), ...patch }; if (st.bold && !(FONTS[st.font] || FONTS.pretendard).files[700]) st.bold = false; it.cells[k] = st; }
  }, 'cell' + Object.keys(patch).join(''));
  refreshItems([it.id]); renderPropBox();
}
function setTableDims(it, R, C) { // 행 수·열 수를 숫자로 바꾸기 (늘리면 끝에 추가, 줄이면 끝에서 삭제)
  if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요. 잠금을 풀어 주세요');
  R = clamp(Math.round(R), 1, 80); C = clamp(Math.round(C), 1, 40);
  const g = NP.tableGeom(it);
  const lost = Object.entries(it.cells || {}).some(([k, v]) => { const [r, c] = k.split(',').map(Number); return (r >= R || c >= C) && v && v.text; });
  if (lost && !confirm('줄이면 지워지는 칸에 글자가 있어요. 계속할까요?\n(“되돌리기”로 되살릴 수 있어요)')) { renderPropBox(); return; }
  mutate(() => {
    while (it.rh.length < R) tblInsert(it, 'row', it.rh.length);
    while (it.rh.length > R) tblDelete(it, 'row', it.rh.length - 1);
    while (it.cw.length < C) tblInsert(it, 'col', it.cw.length);
    while (it.cw.length > C) tblDelete(it, 'col', it.cw.length - 1);
  });
  cellSel = null; refreshItems([it.id]); renderPropBox();
}
function renderItemProps(b, items) {
  const primary = items[items.length - 1], same = items.every(i => i.type === primary.type);
  const ids = items.map(i => i.id);
  const upd = (fn, key) => {
    const t = items.filter(i => !i.lock);
    if (!t.length) return toast('잠긴 개체는 바꿀 수 없어요. 잠금을 풀어 주세요');
    mutate(() => { for (const it of t) fn(it); }, key ? key + primary.id : ''); refreshItems(ids); renderPropBox();
  };
  const locked = items.some(i => i.lock);
  b.append(h('div', { class: 'sub2' }, items.length === 1 ? `${typeName(primary)} 1개 선택${primary.lock ? ' (잠김)' : ''}` : `${items.length}개 선택${items.some(i => i.gid) ? ' (묶음 포함)' : ''}`));

  // 위치·크기·회전
  const setW = (it, v) => { const o = JSON.parse(JSON.stringify(it)); it.w = Math.max(it.type === 'table' ? 4 : 0.5, r2(v)); if (it.ar && it.type !== 'text') it.h = r2(o.h * it.w / o.w); if (it.type === 'table') rescaleTable(it, o); };
  const setH = (it, v) => { const o = JSON.parse(JSON.stringify(it)); it.h = Math.max(it.type === 'table' ? 4 : 0.5, r2(v)); if (it.ar && it.type !== 'text') it.w = r2(o.w * it.h / o.h); if (it.type === 'table') rescaleTable(it, o); };
  const nums = [];
  if (items.length === 1 && primary.type === 'line') {
    nums.push(...numField('시작 X', primary.x1, v => upd(it => { it.x1 = r2(v); })), ...numField('시작 Y', primary.y1, v => upd(it => { it.y1 = r2(v); })),
      ...numField('끝 X', primary.x2, v => upd(it => { it.x2 = r2(v); })), ...numField('끝 Y', primary.y2, v => upd(it => { it.y2 = r2(v); })));
    const len = Math.hypot(primary.x2 - primary.x1, primary.y2 - primary.y1), ang = Math.atan2(primary.y2 - primary.y1, primary.x2 - primary.x1) * 180 / Math.PI;
    nums.push(...numField('길이', len, v => upd(it => { const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1); it.x2 = r2(it.x1 + Math.cos(a) * v); it.y2 = r2(it.y1 + Math.sin(a) * v); })),
      ...numField('각도', ang, v => upd(it => { const L = Math.hypot(it.x2 - it.x1, it.y2 - it.y1), cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = rad(v); it.x1 = r2(cx - Math.cos(a) * L / 2); it.y1 = r2(cy - Math.sin(a) * L / 2); it.x2 = r2(cx + Math.cos(a) * L / 2); it.y2 = r2(cy + Math.sin(a) * L / 2); })));
  } else if (items.length === 1) {
    const bx = boxOf(primary);
    nums.push(...numField('X', bx.x, v => upd(it => { it.x = r2(v); })), ...numField('Y', bx.y, v => upd(it => { it.y = r2(v); })),
      ...numField('가로', bx.w, v => upd(it => setW(it, v))));
    if (primary.type !== 'text') nums.push(...numField('세로', bx.h, v => upd(it => setH(it, v))));
    else nums.push(h('span'), h('span'));
    nums.push(...numField('회전°', primary.rot || 0, v => upd(it => { it.rot = r2(normDeg(v)); })));
  } else {
    const free = items.filter(i => !i.lock), fids = free.map(i => i.id), ub = unionBox(free.map(bboxOf));
    const apply = (nx, ny, nw, nh) => { if (!free.length) return toast('잠긴 개체는 바꿀 수 없어요'); const o = cloneItems(fids); mutate(() => { scaleItems(o, ub.x, ub.y, nw / ub.w, nh / ub.h, nx - ub.x, ny - ub.y); }); refreshItems(fids); renderPropBox(); };
    if (free.length) nums.push(...numField('X', ub.x, v => apply(v, ub.y, ub.w, ub.h)), ...numField('Y', ub.y, v => apply(ub.x, v, ub.w, ub.h)),
      ...numField('가로', ub.w, v => apply(ub.x, ub.y, Math.max(0.5, v), ub.h)), ...numField('세로', ub.h, v => apply(ub.x, ub.y, ub.w, Math.max(0.5, v))));
  }
  b.append(h('div', { class: 'numgrid' }, nums));
  if (items.every(i => ['shape', 'path', 'table', 'image'].includes(i.type))) { const arOn = items.every(i => i.ar); b.append(h('div', { class: 'btnrow' }, btn(arOn ? '🔗 가로세로 비율 고정: 켜짐' : '🔓 가로세로 비율 고정: 꺼짐', () => upd(it => { it.ar = !arOn; }), { class: arOn ? 'on' : '' }))); }

  // 정렬
  b.append(h('div', { class: 'sub2' }, '정렬'));
  if (items.length > 1) b.append(row('기준', seg([['sel', '선택한 것끼리'], ['page', '쪽']], ui.alignTo, v => { ui.alignTo = v; renderPropBox(); })));
  b.append(h('div', { class: 'btnrow' }, [['l', '왼쪽'], ['c', '가운데'], ['r', '오른쪽'], ['t', '위'], ['m', '중간'], ['b', '아래']].map(([k, l]) => btn(l, () => alignSel(k))),
    items.length > 2 ? [btn('가로 같은 간격', () => distSel('x')), btn('세로 같은 간격', () => distSel('y'))] : []));
  // 순서·그룹·잠금
  b.append(h('div', { class: 'sub2' }, '순서 · 묶기 · 잠금'));
  b.append(h('div', { class: 'btnrow' }, btn('맨 앞으로', () => reorder('front')), btn('앞으로', () => reorder('up')), btn('뒤로', () => reorder('down')), btn('맨 뒤로', () => reorder('back'))));
  b.append(h('div', { class: 'btnrow' }, btn('묶기', groupSel, { disabled: items.length < 2 }), btn('묶음 풀기', ungroupSel, { disabled: !items.some(i => i.gid) }),
    btn(locked ? '잠금 풀기' : '잠금', () => setProp('lock', !locked)), btn('숨기기', () => { setProp('hide', true); })));
  b.append(h('div', { class: 'btnrow' }, btn('복사', copySel), btn('오려두기', () => { if (copySel()) removeSel(); }), btn('붙여넣기', pasteClip, { disabled: !clip }), btn('복제', dupSel), btn('지우기', removeSel),
    btn('서식 복사', copyFormat), btn('서식 붙여넣기', pasteFormat, { disabled: !fmt })));

  // 종류별 설정 (같은 종류만 골랐을 때)
  if (!same) { b.append(h('p', { class: 'hint' }, '종류가 다른 것을 함께 골랐어요. 색·선 굵기는 “서식 복사”로 맞출 수 있어요.')); return; }
  const thick = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2];
  const thickSel = () => h('select', { onchange: e => upd(it => { it.th = +e.target.value; }) }, thick.map(t => h('option', { value: t, selected: Math.abs(primary.th - t) < 0.001 }, t + ' mm')));
  const dashSeg = () => seg([[0, '실선'], [1, '점선']], primary.dash ? 1 : 0, v => upd(it => { it.dash = !!v; }));
  const color = (label = '색') => row(label, swatches(primary.color, c => upd(it => { it.color = c; })));
  const toneRow = (cur, onTone) => row('농도', stepper(cur, { min: 5, max: 100, step: 5 }, onTone), h('span', { class: 'unit' }, '%'));
  b.append(h('div', { class: 'sub2' }, `${typeName(primary)} 설정`));
  if (primary.type === 'text') {
    const f = FONTS[primary.font] || FONTS.pretendard;
    b.append(row('글꼴', h('select', { onchange: e => upd(it => { it.font = e.target.value; if (!FONTS[it.font].files[700]) it.bold = false; }) }, Object.entries(FONTS).map(([k, v]) => h('option', { value: k, selected: primary.font === k }, v.label)))));
    b.append(row('글자 크기', stepper(primary.pt, { min: 4, max: 80, step: 1 }, v => upd(it => { it.pt = v; }, 'pt')), h('span', { class: 'unit' }, 'pt')));
    b.append(row('모양', f.files[700] ? btn('굵게', () => upd(it => { it.bold = !primary.bold; }), { class: primary.bold ? 'on' : '' }) : h('span', { class: 'hint' }, '이 글꼴은 굵게가 없어요'),
      seg([['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], primary.align, v => upd(it => { it.align = v; }))));
    b.append(row('줄 간격', h('select', { onchange: e => upd(it => { it.lh = parseFloat(e.target.value); }) }, [[0, '자동'], [1, '모눈 1칸'], [1.5, '모눈 1.5칸'], [2, '모눈 2칸']].map(([v, l]) => h('option', { value: v, selected: primary.lh === v }, l)))));
    b.append(color()); { const hn = colorHint(primary.color); if (hn) b.append(hn); }
    if (items.length === 1) b.append(row('', btn('글자 고쳐 쓰기', () => enterEdit(primary.id, false))));
    b.append(h('p', { class: 'hint' }, '글 속에 {쪽} 이라고 쓰면 쪽 번호로, {전체} 는 전체 쪽 수로 바뀌어요. (바탕에 넣으면 모든 쪽에 번호가 자동으로 찍혀요)'));
    if (f.limited) b.append(h('p', { class: 'hint' }, '개구 글꼴은 흔한 글자 위주라 드문 글자는 빠질 수 있어요. 내보낼 때 빠진 글자를 알려드려요.'));
  } else if (primary.type === 'line') {
    b.append(row('굵기', thickSel())); b.append(row('모양', dashSeg())); b.append(color());
    b.append(row('끝에 화살표', seg([['none', '없음'], ['arrow', '화살표']], primary.ah, v => upd(it => { it.ah = v; }))));
    b.append(row('시작에 화살표', seg([['none', '없음'], ['arrow', '화살표']], primary.at, v => upd(it => { it.at = v; }))));
  } else if (primary.type === 'shape' || primary.type === 'path') {
    const closed = NP.isClosedShape(primary);
    if (primary.type === 'path') b.append(row('곡선', seg([[0, '열린 곡선'], [1, '닫힌 곡선']], primary.closed ? 1 : 0, v => upd(it => { it.closed = !!v; if (!it.closed) { it.fill = null; it.pat = null; } }))));
    if (primary.type === 'shape' && primary.kind === 'rect') {
      b.append(row('모서리 둥글기', stepper(primary.r || 0, { min: 0, max: 100, step: 0.5 }, v => upd(it => { it.r = v; }, 'rad')), h('span', { class: 'unit' }, 'mm')));
      b.append(h('div', { class: 'btnrow' }, btn('각지게', () => upd(it => { it.r = 0; })), btn('살짝', () => upd(it => { it.r = 2; })), btn('둥글게', () => upd(it => { it.r = 5; })), btn('완전히 둥글게(알약·원)', () => upd(it => { it.r = r2(Math.min(it.w, it.h) / 2); }))));
    }
    if (primary.type === 'shape' && primary.kind === 'star') b.append(row('꼭짓점 수', stepper(primary.pts, { min: 3, max: 12, step: 1 }, v => upd(it => { it.pts = Math.round(v); }, 'pts'))));
    b.append(row('테두리', seg([[1, '있음'], [0, '없음']], primary.stroke !== false ? 1 : 0, v => upd(it => { it.stroke = !!v; }))));
    if (primary.stroke !== false) { b.append(color('테두리 색')); b.append(row('굵기', thickSel())); b.append(row('모양', dashSeg())); }
    if (closed) {
      b.append(row('채우기', seg([[0, '없음'], [1, '색']], primary.fill ? 1 : 0, v => upd(it => { it.fill = v ? { color: 'k20', tone: 100 } : null; }))));
      if (primary.fill) { b.append(row('채울 색', swatches(primary.fill.color, c => upd(it => { it.fill = { ...it.fill, color: c }; })))); b.append(toneRow(primary.fill.tone, v => upd(it => { it.fill = { ...it.fill, tone: v }; }, 'tone'))); }
      b.append(row('안쪽 무늬', seg([['', '없음'], ['dot', '도트'], ['grid', '격자'], ['line', '줄']], primary.pat ? primary.pat.kind : '', v => upd(it => { const o = it.pat || {}; it.pat = v ? { kind: v, color: o.color || 'k40', size: o.size || (v === 'dot' ? 0.8 : 0.2), gap: o.gap || 4 } : null; }))));
      if (primary.pat) {
        b.append(row('무늬 색', swatches(primary.pat.color, c => upd(it => { it.pat = { ...it.pat, color: c }; }))));
        b.append(row(primary.pat.kind === 'dot' ? '도트 크기' : '선 굵기', stepper(primary.pat.size, { min: 0.1, max: 3, step: 0.1 }, v => upd(it => { it.pat = { ...it.pat, size: v }; }, 'psize')), h('span', { class: 'unit' }, 'mm')));
        b.append(row('간격', stepper(primary.pat.gap, { min: 1, max: 30, step: 0.5 }, v => upd(it => { it.pat = { ...it.pat, gap: v }; }, 'pgap')), h('span', { class: 'unit' }, 'mm')));
      }
    }
  } else if (primary.type === 'image') {
    const it = primary, dpi = imgDpi(it);
    b.append(row('색', seg([[0, '컬러'], [1, '흑백']], it.gray ? 1 : 0, v => upd(x => { x.gray = !!v; }))));
    b.append(h('p', { class: 'hint' + (dpi < 150 ? ' bad' : dpi < 300 ? ' warnc' : '') }, `인쇄 크기 기준 약 ${dpi}dpi — 300 이상이면 선명하고, ${dpi < 300 ? '지금은 조금 흐릿할 수 있어요. 크기를 줄이거나 더 큰 사진을 쓰세요.' : '충분해요.'}`));
    b.append(h('p', { class: 'hint' }, '모서리 손잡이 = 비율 그대로 크기 조절, 가장자리(위·아래·옆) 손잡이 = 자르기예요. “흑백”은 검정 한 가지로 찍혀서 색이 달라질 걱정이 없어요. 컬러 사진은 인쇄용으로 변환할 때 색이 조금 달라질 수 있어요.'));
    const crops = [];
    for (const [k, label] of [['cl', '왼쪽 자르기 %'], ['cr', '오른쪽 자르기 %'], ['ct', '위 자르기 %'], ['cb', '아래 자르기 %']])
      crops.push(...numField(label, it[k] * 100, v => { if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요'); mutate(() => { const c = { cl: it.cl, ct: it.ct, cr: it.cr, cb: it.cb }; c[k] = clamp(v, 0, 90) / 100; applyCrop(it, c.cl, c.ct, c.cr, c.cb); }); refreshItems([it.id]); renderPropBox(); }));
    b.append(h('div', { class: 'numgrid' }, crops));
    b.append(h('div', { class: 'btnrow' },
      btn('자르기 풀기', () => { if (it.lock) return; mutate(() => applyCrop(it, 0, 0, 0, 0)); refreshItems([it.id]); renderPropBox(); }),
      btn('원래 비율로', () => { if (it.lock) return; mutate(() => { const ar = it.nw * (1 - it.cl - it.cr) / (it.nh * (1 - it.ct - it.cb)); it.h = r2(it.w / ar); }); refreshItems([it.id]); renderPropBox(); }),
      btn('사진 바꾸기', () => { if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요'); imgReplaceId = it.id; $('#imgFile').click(); })));
    if (it.name) b.append(h('p', { class: 'hint' }, `파일: ${it.name} (${it.nw}×${it.nh}px)`));
  } else if (primary.type === 'table') {
    const it = primary, g = NP.tableGeom(it), rg = cellSel && cellSel.id === it.id ? expandRange(it, cellSel) : null, single = items.length === 1;
    if (!single) { b.append(h('p', { class: 'hint' }, '표는 하나씩 골라야 칸을 고칠 수 있어요.')); b.append(row('선 굵기', thickSel())); b.append(row('선 모양', dashSeg())); b.append(color('선 색')); return; }
    const op = fn => { if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요. 잠금을 풀어 주세요'); mutate(fn); cellSel = null; refreshItems([it.id]); renderPropBox(); };
    b.append(h('p', { class: 'hint' }, '표를 고른 뒤 칸을 누르면 칸이 선택되고(끌면 여러 칸), 한 번 더 누르거나 두 번 누르면 글자를 쓸 수 있어요. 표를 옮길 때는 왼쪽 위의 ✥ 손잡이를 끄세요. 칸 사이 선을 끌면 너비·높이가 바뀌어요.'));
    b.append(row('행 × 열', stepper(g.R, { min: 1, max: 80, step: 1 }, v => setTableDims(it, v, g.C)), h('span', { class: 'unit' }, '행 ×'), stepper(g.C, { min: 1, max: 40, step: 1 }, v => setTableDims(it, g.R, v)), h('span', { class: 'unit' }, '열')));
    b.append(h('div', { class: 'btnrow' }, btn('✎ 이 칸에 글자 쓰기', () => { if (it.lock) return toast('잠긴 개체는 바꿀 수 없어요'); const r0 = rg || { r1: 0, c1: 0 }; if (!rg) { cellSel = { id: it.id, r1: 0, c1: 0, r2: 0, c2: 0 }; } enterCellEdit(it.id, r0.r1 + ',' + r0.c1); }, { class: 'primary' })));
    const rowsN = rg ? rg.r2 - rg.r1 + 1 : 0, colsN = rg ? rg.c2 - rg.c1 + 1 : 0;
    b.append(h('div', { class: 'btnrow' },
      btn('위에 행 추가', () => op(() => tblInsert(it, 'row', rg ? rg.r1 : 0))), btn('아래에 행 추가', () => op(() => tblInsert(it, 'row', rg ? rg.r2 + 1 : g.R))),
      btn('행 삭제', () => op(() => { for (let r = rg.r2; r >= rg.r1; r--) tblDelete(it, 'row', r); }), { disabled: !rg || rowsN >= g.R }),
      btn('왼쪽에 열 추가', () => op(() => tblInsert(it, 'col', rg ? rg.c1 : 0))), btn('오른쪽에 열 추가', () => op(() => tblInsert(it, 'col', rg ? rg.c2 + 1 : g.C))),
      btn('열 삭제', () => op(() => { for (let c = rg.c2; c >= rg.c1; c--) tblDelete(it, 'col', c); }), { disabled: !rg || colsN >= g.C }),
      btn('칸 합치기', () => mergeSel(it), { disabled: !rg || (rg.r1 === rg.r2 && rg.c1 === rg.c2) }),
      btn('합침 풀기', () => unmergeSel(it), { disabled: !rg || !it.merges.some(m => m.r >= rg.r1 && m.r <= rg.r2 && m.c >= rg.c1 && m.c <= rg.c2) }),
      btn('행 높이 같게', () => op(() => { const a = r2(it.h / g.R); it.rh = it.rh.map(() => a); tblSync(it); })), btn('열 너비 같게', () => op(() => { const a = r2(it.w / g.C); it.cw = it.cw.map(() => a); tblSync(it); }))));
    const sz = [];
    if (rg && rg.c1 === rg.c2) sz.push(...numField('열 너비', it.cw[rg.c1], v => { if (it.lock) return; mutate(() => { it.cw[rg.c1] = Math.max(2, r2(v)); tblSync(it); }); refreshItems([it.id]); renderPropBox(); }));
    if (rg && rg.r1 === rg.r2) sz.push(...numField('행 높이', it.rh[rg.r1], v => { if (it.lock) return; mutate(() => { it.rh[rg.r1] = Math.max(2, r2(v)); tblSync(it); }); refreshItems([it.id]); renderPropBox(); }));
    if (sz.length) b.append(h('div', { class: 'numgrid' }, sz));
    b.append(row('선 굵기', thickSel())); b.append(row('선 모양', dashSeg())); b.append(color('선 색'));
    b.append(row('바깥 테두리', seg([[1, '있음'], [0, '없음']], it.outer ? 1 : 0, v => upd(x => { x.outer = !!v; }))));
    const keys = rg ? rangeKeys(it, rg) : g.cells.map(c => c.key), cs = NP.cellStyle(it, keys[0] || '0,0'), f = FONTS[cs.font] || FONTS.pretendard;
    b.append(h('div', { class: 'sub2' }, rg ? '선택한 칸의 서식' : '칸 서식 (칸을 고르지 않으면 표 전체에 적용)'));
    b.append(row('글꼴', h('select', { onchange: e => cellPatch(it, { font: e.target.value }) }, Object.entries(FONTS).map(([k, v]) => h('option', { value: k, selected: cs.font === k }, v.label)))));
    b.append(row('글자 크기', stepper(cs.pt, { min: 4, max: 80, step: 1 }, v => cellPatch(it, { pt: v })), h('span', { class: 'unit' }, 'pt')));
    b.append(row('모양', f.files[700] ? btn('굵게', () => cellPatch(it, { bold: !cs.bold }), { class: cs.bold ? 'on' : '' }) : h('span', { class: 'hint' }, '굵게 없음'),
      seg([['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], cs.align, v => cellPatch(it, { align: v }))));
    b.append(row('세로 위치', seg([['top', '위'], ['middle', '가운데'], ['bottom', '아래']], cs.valign, v => cellPatch(it, { valign: v }))));
    b.append(row('글자색', swatches(cs.color, c => cellPatch(it, { color: c })))); { const hn = colorHint(cs.color); if (hn) b.append(hn); }
    b.append(row('칸 채우기', seg([[0, '없음'], [1, '색']], cs.fill ? 1 : 0, v => cellPatch(it, { fill: v ? { color: 'k20', tone: 100 } : null }))));
    if (cs.fill) { b.append(row('채울 색', swatches(cs.fill.color, c => cellPatch(it, { fill: { ...cs.fill, color: c } })))); b.append(toneRow(cs.fill.tone, v => cellPatch(it, { fill: { ...cs.fill, tone: v } }))); }
  }
}
function renderObjList(b) {
  const all = ctxItems();
  b.append(h('div', { class: 'sub2' }, `개체 목록 (${ui.editMaster ? '바탕' : (ui.pageIdx + 1) + '쪽'}, 위쪽이 앞) — 잠금·숨김 풀기는 여기서`));
  if (!all.length) { b.append(h('p', { class: 'hint' }, '아직 아무것도 없어요.')); return; }
  const ul = h('ul', { class: 'objlist' });
  for (const it of all.slice().reverse()) {
    const label = it.type === 'text' ? `글자: ${(it.text || '').replace(/\s+/g, ' ').slice(0, 14) || '(빈 글자)'}` : typeName(it);
    ul.append(h('li', { class: isSel(it.id) ? 'on' : '', onclick: e => { if (e.target.closest('button')) return; select(e.shiftKey || e.metaKey ? [...selIds, it.id] : [it.id]); } },
      h('span', { class: 'ol' }, (it.gid ? '▣ ' : '') + label),
      h('button', { type: 'button', title: '숨기기/보이기', onclick: () => { mutate(() => { it.hide = !it.hide; }); refreshItems([it.id]); renderPropBox(); } }, it.hide ? '숨김' : '보임'),
      h('button', { type: 'button', title: '잠금', onclick: () => { mutate(() => { it.lock = !it.lock; }); refreshItems([it.id]); renderPropBox(); } }, it.lock ? '🔒' : '🔓')));
  }
  b.append(ul);
}

/* ---------- 쪽 목록(아래 줄 + 펼침면)과 쪽 관리 ---------- */
let pageSel = [], pageAnchor = null; // 고른 쪽의 id들
const pageIdxOf = id => doc.pages.findIndex(p => p.id === id);
function selPageIdxs() { const ix = pageSel.map(pageIdxOf).filter(i => i >= 0).sort((a, b) => a - b); return ix.length ? ix : [ui.pageIdx]; }
let stripT;
function scheduleStrip() { clearTimeout(stripT); stripT = setTimeout(renderStrip, 150); }
function renderStrip() {
  const box = $('#thumbs'); box.textContent = '';
  const { w, h: ph } = doc.page, u = Math.min(84 / ph, 120 / w), sel = new Set(selPageIdxs());
  doc.pages.forEach((pg, i) => {
    const th = h('div', { class: 'thumb' + (i === ui.pageIdx && !ui.editMaster ? ' cur' : '') + (sel.has(i) && sel.size > 1 ? ' sel' : ''), style: `width:${w * u}px;height:${ph * u}px;--u:${u}px`, onclick: e => clickPage(i, e), title: `${i + 1}쪽` },
      buildPageDOM(pg, i + 1), h('span', { class: 'tn' }, String(i + 1)));
    box.append(th);
  });
  $('#pageLabel').textContent = `${ui.pageIdx + 1} / ${doc.pages.length}쪽` + (sel.size > 1 ? ` (${sel.size}쪽 선택)` : '');
  const cur = box.querySelector('.thumb.cur'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#pgLeft').disabled = sel.has(0); $('#pgRight').disabled = sel.has(doc.pages.length - 1);
  renderPagesBox(); updateCountBanner();
}
function gotoPage(i, keepSel) {
  endEdit(); ui.editMaster = false; ui.pageIdx = clamp(i, 0, doc.pages.length - 1); selIds = []; selGuide = null; cellSel = null;
  if (!keepSel) { pageSel = [doc.pages[ui.pageIdx].id]; pageAnchor = pageSel[0]; }
  renderStage(); renderPanels(); renderStrip();
  if (ui.tab === 'obj' && !ui.tabManual) showTab('doc');
}
function clickPage(i, e) { // 눌러서 열기 / Cmd·Ctrl = 하나씩 더하기·빼기 / Shift = 범위
  const id = doc.pages[i].id;
  if (e && e.shiftKey && pageAnchor && pageIdxOf(pageAnchor) >= 0) {
    const a = pageIdxOf(pageAnchor), lo = Math.min(a, i), hi = Math.max(a, i);
    pageSel = doc.pages.slice(lo, hi + 1).map(p => p.id); gotoPage(i, true);
  } else if (e && (e.metaKey || e.ctrlKey)) {
    pageSel = pageSel.includes(id) ? pageSel.filter(x => x !== id) : [...pageSel, id]; pageAnchor = id;
    if (!pageSel.length) pageSel = [id];
    renderStrip();
  } else gotoPage(i);
}
function addPage() {
  endEdit();
  const ix = selPageIdxs(), last = ix[ix.length - 1], src = doc.pages[last], cnt = doc.kind === 'bound' ? 4 : 1, made = [];
  mutate(() => {
    const all = doc.pages.slice();
    for (let k = 0; k < cnt; k++) { const np = { id: newId('p', all), master: src.master, guides: [], items: [] }; all.push(np); made.push(np); }
    doc.pages.splice(last + 1, 0, ...made);
  });
  gotoPage(last + 1); toast(cnt > 1 ? '4쪽을 한꺼번에 추가했어요 (노출제본은 4쪽 단위예요)' : '새 쪽을 만들었어요 (같은 바탕을 씁니다)');
}
function addBlankPages(count) { // 맨 뒤에 빈 쪽 추가 (마지막 쪽과 같은 바탕)
  const src = doc.pages[doc.pages.length - 1], made = [], all = doc.pages.slice();
  mutate(() => { for (let k = 0; k < count; k++) { const np = { id: newId('p', all), master: src.master, guides: [], items: [] }; all.push(np); made.push(np); } doc.pages.push(...made); });
  renderStrip();
}
function updateCountBanner() {
  const b = $('#countBanner'), n = doc.pages.length, need = (4 - (n % 4)) % 4;
  b.textContent = '';
  if (doc.kind !== 'bound' || !need) { b.hidden = true; return; }
  b.hidden = false;
  b.append(h('span', {}, `⚠ 지금 ${n}쪽이에요. 노출제본은 4의 배수여야 해서 ${need}쪽이 모자라요.`), btn(`빈 쪽 ${need}개 추가`, () => { addBlankPages(need); toast(`빈 쪽 ${need}개를 맨 뒤에 추가했어요`); }, { class: 'primary' }));
}
function duplicatePage() {
  endEdit();
  const ix = selPageIdxs(), last = ix[ix.length - 1], copies = [], all = doc.pages.slice();
  mutate(() => {
    let n = nextItemId();
    for (const i of ix) {
      const src = doc.pages[i], c = { id: newId('p', all), master: src.master, guides: JSON.parse(JSON.stringify(src.guides)), items: JSON.parse(JSON.stringify(src.items)) };
      for (const it of c.items) it.id = n++;
      all.push(c); copies.push(c);
    }
    doc.pages.splice(last + 1, 0, ...copies);
  });
  pageSel = copies.map(c => c.id); pageAnchor = pageSel[0];
  gotoPage(pageIdxOf(copies[0].id), true); toast(`${copies.length}쪽을 복제했어요`);
}
function deletePage() {
  const ix = selPageIdxs();
  if (ix.length >= doc.pages.length) return toast('모든 쪽을 지울 수는 없어요');
  const withItems = ix.filter(i => doc.pages[i].items.length).length;
  if (withItems && !confirm(`${ix.map(i => i + 1).join(', ')}쪽을 지울까요?\n(“되돌리기”로 살릴 수 있어요)`)) return;
  endEdit(true);
  mutate(() => { doc.pages = doc.pages.filter((_, i) => !ix.includes(i)); });
  pageSel = [];
  gotoPage(Math.min(ix[0], doc.pages.length - 1));
}
function movePages(ids, insertAt) { // ids 쪽들을 한 덩어리로 insertAt 번째 앞으로 옮김(원래 목록 기준 위치)
  const set = new Set(ids), order = doc.pages.map(p => p.id);
  const moving = doc.pages.filter(p => set.has(p.id)), before = doc.pages.slice(0, insertAt).filter(p => set.has(p.id)).length;
  const rest = doc.pages.filter(p => !set.has(p.id)); rest.splice(insertAt - before, 0, ...moving);
  if (rest.map(p => p.id).join() === order.join()) return false;
  endEdit(true);
  const curId = doc.pages[ui.pageIdx].id;
  mutate(() => { doc.pages = rest; });
  ui.pageIdx = Math.max(0, pageIdxOf(curId)); pageSel = ids.slice(); renderStage(); renderPanels(); renderStrip();
  return true;
}
function movePage(dir) { // ◀ ▶ : 고른 쪽들을 한 칸씩
  const ix = selPageIdxs(), ids = ix.map(i => doc.pages[i].id);
  if (dir < 0 && ix[0] === 0) return; if (dir > 0 && ix[ix.length - 1] === doc.pages.length - 1) return;
  movePages(ids, dir < 0 ? ix[0] - 1 : ix[ix.length - 1] + 2);
}

/* ---- 펼침면 쪽 목록 (1쪽은 오른쪽부터, 그 아래 줄부터 왼쪽·오른쪽 한 쌍) ---- */
function renderPagesBox() {
  const b = $('#pagesBox'); if (!b) return;
  b.textContent = '';
  const n = doc.pages.length, sel = new Set(selPageIdxs());
  b.append(h('p', { class: 'hint' }, `총 ${n}쪽 · 1쪽은 오른쪽 페이지부터 시작해요 (2·3쪽이 마주 봐요). 쪽을 눌러 열고, Shift/Cmd를 누른 채 눌러 여러 쪽을 고른 뒤 끌어서 순서를 바꿔요. (터치: 쪽 위쪽 ⠿ 손잡이를 끌기)`));
  b.append(h('div', { class: 'btnrow' }, btn('＋ 빈 쪽', addPage), btn('복제', duplicatePage), btn('삭제', deletePage), btn('◀ 앞으로', () => movePage(-1)), btn('뒤로 ▶', () => movePage(1)),
    btn('모두 선택', () => { pageSel = doc.pages.map(p => p.id); pageAnchor = pageSel[0]; renderStrip(); }), btn('선택 풀기', () => { pageSel = [doc.pages[ui.pageIdx].id]; renderStrip(); })));
  const width = b.clientWidth || 300, tw = clamp(Math.floor((width - 6) / 2), 60, 150), u = tw / doc.page.w, th = doc.page.h * u;
  const grid = h('div', { class: 'spreads', style: `--tw:${tw}px` });
  doc.pages.forEach((pg, i) => {
    const t = h('div', { class: 'pthumb ' + (i % 2 === 0 ? 'R' : 'L') + (i === ui.pageIdx ? ' cur' : '') + (sel.has(i) ? ' sel' : ''), 'data-i': i, style: `width:${tw}px;height:${th}px;--u:${u}px;${i === 0 ? 'grid-column:2;' : ''}`, title: `${i + 1}쪽` },
      buildPageDOM(pg, i + 1), h('span', { class: 'grip', title: '끌어서 순서 바꾸기' }, '⠿'), h('span', { class: 'pn' }, String(i + 1)));
    grid.append(t);
  });
  b.append(grid);
}
(() => { // 쪽 목록 끌기: 마우스는 쪽 아무 데나, 터치는 ⠿ 손잡이
  const box = $('#pagesBox'); let pd = null, ghost = null, ins = null, suppress = false;
  const target = e => {
    const grid = box.querySelector('.spreads'); if (!grid) return null;
    let best = null, bd = Infinity;
    for (const t of grid.querySelectorAll('.pthumb')) { const r = t.getBoundingClientRect(), dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0, dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } }
    if (!best) return null;
    const r = best.getBoundingClientRect(), i = +best.dataset.i, after = e.clientX > r.left + r.width / 2;
    return { index: after ? i + 1 : i, r, after, grid };
  };
  box.addEventListener('pointerdown', e => {
    const t = e.target.closest('.pthumb'); if (!t || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
    pd = { i: +t.dataset.i, sx: e.clientX, sy: e.clientY, started: false };
  });
  window.addEventListener('pointermove', e => {
    if (!pd) return;
    if (!pd.started) {
      if (Math.hypot(e.clientX - pd.sx, e.clientY - pd.sy) < 6) return;
      pd.started = true; const id = doc.pages[pd.i].id;
      if (!pageSel.includes(id)) { pageSel = [id]; pageAnchor = id; renderStrip(); }
      pd.ids = selPageIdxs().map(i => doc.pages[i].id);
      for (const t of box.querySelectorAll('.pthumb')) if (pd.ids.includes(doc.pages[+t.dataset.i].id)) t.classList.add('dragging');
      ghost = h('div', { class: 'pghost' }, `${pd.ids.length}쪽 옮기는 중`); document.body.append(ghost);
      ins = h('div', { class: 'pins' }); box.querySelector('.spreads').append(ins);
    }
    ghost.style.left = e.clientX + 12 + 'px'; ghost.style.top = e.clientY + 12 + 'px';
    const tg = target(e);
    if (tg) { const gr = tg.grid.getBoundingClientRect(); ins.style.left = (tg.after ? tg.r.right : tg.r.left) - gr.left - 2 + 'px'; ins.style.top = tg.r.top - gr.top + 'px'; ins.style.height = tg.r.height + 'px'; pd.drop = tg.index; }
    const side = $('#side'), sr = side.getBoundingClientRect(); if (e.clientY < sr.top + 40) side.scrollTop -= 14; else if (e.clientY > sr.bottom - 40) side.scrollTop += 14;
  });
  const end = cancel => {
    if (!pd) return; const d = pd; pd = null;
    if (ghost) ghost.remove(); if (ins) ins.remove(); ghost = ins = null;
    box.querySelectorAll('.dragging').forEach(t => t.classList.remove('dragging'));
    if (d.started) { suppress = true; setTimeout(() => { suppress = false; }, 0); if (!cancel && d.drop != null) movePages(d.ids, d.drop); }
  };
  window.addEventListener('pointerup', () => end(false)); window.addEventListener('pointercancel', () => end(true));
  box.addEventListener('click', e => { if (suppress) return; const t = e.target.closest('.pthumb'); if (t) clickPage(+t.dataset.i, e); });
})();
$('#pgAdd').onclick = addPage; $('#pgDup').onclick = duplicatePage; $('#pgDel').onclick = deletePage;
$('#pgLeft').onclick = () => movePage(-1); $('#pgRight').onclick = () => movePage(1);

/* ---------- 바탕(마스터) ---------- */
function enterMaster(id) { endEdit(); ui.editMaster = true; ui.masterId = id; selIds = []; selGuide = null; zoom = 1; renderStage(); renderPanels(); renderStrip(); }
function exitMaster() { endEdit(); ui.editMaster = false; selIds = []; selGuide = null; renderStage(); renderPanels(); renderStrip(); }
$('#masterExit').onclick = exitMaster;
function newMaster() {
  const src = ctxMaster();
  const m = { id: newId('m', doc.masters), name: `바탕 ${doc.masters.length + 1}`, grid: src ? { ...src.grid } : { type: 'square', size: 5, tone: 35, color: 'k100' }, guides: [], items: [] };
  mutate(() => { doc.masters.push(m); if (!ui.editMaster) curPage().master = m.id; });
  enterMaster(m.id); toast('새 바탕을 만들었어요. 여기에 모눈과 반복할 것을 꾸며 보세요');
}
function renameMaster(m) {
  const name = (prompt('바탕 이름', m.name) || '').trim(); if (!name) return;
  mutate(() => { m.name = name; }); renderPanels(); renderBanner();
}
function deleteMaster(m) {
  const n = doc.pages.filter(p => p.master === m.id).length;
  if (!confirm(`“${m.name}”을(를) 지울까요?${n ? `\n이 바탕을 쓰던 ${n}쪽은 바탕 없이(흰 종이로) 남습니다.` : ''}\n(“되돌리기”로 살릴 수 있어요)`)) return;
  endEdit(true);
  mutate(() => { doc.masters = doc.masters.filter(x => x !== m); for (const p of doc.pages) if (p.master === m.id) p.master = null; });
  if (ui.editMaster) ui.editMaster = false;
  selIds = []; renderAll();
}

/* ---------- 집에서 인쇄 ---------- */
const po = Object.assign({ mode: 'sheet', what: 'all', fill: 'repeat', bg: true, sheet: 'A4', orient: 'auto', margin: 5, gap: 4, marks: true, count: 0, cut: null, duplex: null, flip: 'long' }, lsGet(LS.print, {}));
if (!po.cut) po.cut = po.marks === false ? 'none' : 'line';
const duplexOn = () => (po.duplex == null ? doc.kind === 'binder' : !!po.duplex); // 바인더 노트는 기본이 양면
const printOpen = () => !$('#printModal').hidden;
const PREVIEW_SHEETS = 6;

function layoutCalc() {
  const { w, h: ph } = doc.page;
  if (po.mode === 'single') return { SW: w, SH: ph, cols: 1, rows: 1, n: 1, max: 1, cells: [{ x: 0, y: 0 }], marks: false, label: '' };
  const sh = SHEETS.find(s => s.name === po.sheet) || SHEETS[0];
  const tries = po.orient === 'portrait' ? [[sh.w, sh.h, '세로']] : po.orient === 'landscape' ? [[sh.h, sh.w, '가로']] : [[sh.w, sh.h, '세로'], [sh.h, sh.w, '가로']];
  const m = po.margin, g = po.gap;
  let best = null;
  for (const [SW, SH, label] of tries) {
    const cols = Math.max(0, Math.floor((SW - 2 * m + g + 1e-6) / (w + g)));
    const rows = Math.max(0, Math.floor((SH - 2 * m + g + 1e-6) / (ph + g)));
    if (!best || cols * rows > best.cols * best.rows) best = { SW, SH, cols, rows, label };
  }
  const max = best.cols * best.rows, n = po.count > 0 ? Math.min(po.count, max) : max;
  const x0 = (best.SW - (best.cols * w + (best.cols - 1) * g)) / 2, y0 = (best.SH - (best.rows * ph + (best.rows - 1) * g)) / 2;
  const cells = [];
  for (let i = 0; i < n; i++) { const c = i % best.cols, r = Math.floor(i / best.cols); cells.push({ x: r2(x0 + c * (w + g)), y: r2(y0 + r * (ph + g)) }); }
  return { ...best, n, max, cells, marks: po.marks && g >= 1 };
}
function leafPairs() { // 같은 종이의 앞(홀수 쪽)·뒤(짝수 쪽) 짝
  const ix = po.what === 'current' ? [ui.pageIdx] : doc.pages.map((_, i) => i), seen = new Set(), out = [];
  for (const i of ix) { const f = i - (i % 2); if (seen.has(f)) continue; seen.add(f); out.push([f, f + 1 < doc.pages.length ? f + 1 : -1]); }
  return out;
}
function mirrorCell(L, c) { // 종이를 뒤집으면 뒷면에서 같은 자리는 거울처럼 반대쪽이 됨
  const { w, h: ph } = doc.page, portrait = L.SW <= L.SH, longEdge = po.flip !== 'short';
  return (portrait ? longEdge : !longEdge) ? { x: r2(L.SW - c.x - w), y: c.y } : { x: c.x, y: r2(L.SH - c.y - ph) };
}
function planSheets(L) { // [{ side: '앞'|'뒤'|'', cells: [{ page(-1=빈 뒷면), blankOf, cell }] }]
  if (!duplexOn()) {
    const sel = po.what === 'current' ? [ui.pageIdx] : doc.pages.map((_, i) => i);
    if (po.mode === 'single') return sel.map(i => ({ side: '', cells: [{ page: i, cell: L.cells[0] }] }));
    if (po.fill === 'repeat') return sel.map(i => ({ side: '', cells: L.cells.map(c => ({ page: i, cell: c })) }));
    const sheets = [], n = Math.max(1, L.cells.length);
    for (let k = 0; k < sel.length; k += n) sheets.push({ side: '', cells: sel.slice(k, k + n).map((p, j) => ({ page: p, cell: L.cells[j] })) });
    return sheets;
  }
  const pairs = leafPairs(), sheets = [], n = Math.max(1, L.cells.length);
  if (po.mode === 'single') { for (const [f, b] of pairs) { sheets.push({ side: '앞', cells: [{ page: f, cell: L.cells[0] }] }); sheets.push({ side: '뒤', cells: [{ page: b, blankOf: f, cell: L.cells[0] }] }); } return sheets; }
  if (po.fill === 'repeat') { for (const [f, b] of pairs) { sheets.push({ side: '앞', cells: L.cells.map(c => ({ page: f, cell: c })) }); sheets.push({ side: '뒤', cells: L.cells.map(c => ({ page: b, blankOf: f, cell: mirrorCell(L, c) })) }); } return sheets; }
  for (let k = 0; k < pairs.length; k += n) {
    const chunk = pairs.slice(k, k + n);
    sheets.push({ side: '앞', cells: chunk.map(([f], j) => ({ page: f, cell: L.cells[j] })) });
    sheets.push({ side: '뒤', cells: chunk.map(([f, b], j) => ({ page: b, blankOf: f, cell: mirrorCell(L, L.cells[j]) })) });
  }
  return sheets;
}
function marksSVG(L, cells) { // 모서리 표시(짧은 선)
  const svg = svgEl('svg', { viewBox: `0 0 ${L.SW} ${L.SH}`, preserveAspectRatio: 'none', class: 'marks' });
  const { w, h: ph } = doc.page, len = Math.min(3, po.gap / 2 + (po.gap < 2 ? 0 : 0.5));
  let d = '';
  for (const c of cells) for (const [cx, cy, sx, sy] of [[c.x, c.y, -1, -1], [c.x + w, c.y, 1, -1], [c.x, c.y + ph, -1, 1], [c.x + w, c.y + ph, 1, 1]])
    d += `M${r2(cx)} ${r2(cy)}h${sx * len}M${r2(cx)} ${r2(cy)}v${sy * len}`;
  svg.append(svgEl('path', { d, stroke: '#000', 'stroke-width': 0.15, fill: 'none' }));
  return svg;
}
function cutLinesSVG(L, cells) { // 재단기용: 노트 가장자리를 따라 용지 끝(프린터가 찍을 수 있는 곳)에서 끝까지 이어지는 점선
  const svg = svgEl('svg', { viewBox: `0 0 ${L.SW} ${L.SH}`, preserveAspectRatio: 'none', class: 'marks' });
  const { w, h: ph } = doc.page, e = 3, xs = new Set(), ys = new Set();
  for (const c of cells) { xs.add(r2(c.x)); xs.add(r2(c.x + w)); ys.add(r2(c.y)); ys.add(r2(c.y + ph)); }
  let d = '';
  for (const x of xs) d += `M${x} ${e}V${r2(L.SH - e)}`;
  for (const y of ys) d += `M${e} ${y}H${r2(L.SW - e)}`;
  svg.append(svgEl('path', { d, stroke: '#000', 'stroke-width': 0.12, 'stroke-dasharray': '1.6 1.2', fill: 'none' }));
  return svg;
}
function renderSheets(full) {
  const L = layoutCalc(), host = $('#sheets');
  host.textContent = '';
  $('#pageRule').textContent = `@page{size:${r2(L.SW)}mm ${r2(L.SH)}mm;margin:0}`;
  const plan = planSheets(L), pv = $('#pv');
  const aw = Math.max(200, pv.clientWidth - 30), ah = Math.max(160, Math.min(window.innerHeight * 0.45, 480));
  const p = Math.min(aw / L.SW, ah / L.SH);
  const shown = full ? plan : plan.slice(0, PREVIEW_SHEETS);
  shown.forEach((sh, si) => {
    const sheetCells = sh.cells;
    if (sh.side) host.append(h('div', { class: 'sheetlabel' }, `${si + 1}번째 면 — ${sh.side}면`));
    const sheet = h('div', { class: 'sheet' });
    sheet.style.setProperty('--pv', p + 'px');
    sheet.style.width = U(L.SW); sheet.style.height = U(L.SH - 0.4);
    for (const { page, blankOf, cell } of sheetCells) {
      const pgObj = page >= 0 ? doc.pages[page] : { master: doc.pages[blankOf].master, items: [], guides: [], num: { off: true } }; // 뒷면이 없으면 모눈만 있는 빈 쪽
      const pg = h('div', { class: 'pg', style: `left:${U(cell.x)};top:${U(cell.y)};width:${U(doc.page.w)};height:${U(doc.page.h)}` }, buildPageDOM(pgObj, (page >= 0 ? page : blankOf + 1) + 1, { grid: po.bg }));
      sheet.append(pg);
    }
    if (po.mode === 'sheet') { const cs = sheetCells.map(c => c.cell); if (po.cut === 'line') sheet.append(cutLinesSVG(L, cs)); else if (po.cut === 'tick' && po.gap >= 1) sheet.append(marksSVG(L, cs)); }
    host.append(sheet);
  });
  const info = $('#layoutInfo'), tip = $('#printTip'), nsel = po.what === 'current' ? 1 : doc.pages.length, dup = duplexOn();
  info.classList.toggle('warn', L.max === 0);
  $('#doPrint').disabled = L.max === 0;
  if (po.mode === 'single') {
    info.textContent = `노트 크기(${doc.page.w}×${doc.page.h}mm) 용지에 한 쪽씩, 모두 ${plan.length}${dup ? '면(앞·뒤 번갈아)' : '장'} 인쇄합니다.`;
    tip.textContent = '프린터에서 이 크기의 용지를 고를 수 없으면 “큰 용지에 모아 찍기”를 쓰세요. 인쇄 창에서 배율은 100%(실제 크기)로 두세요.';
  } else if (L.max === 0) {
    info.textContent = '노트가 이 용지보다 커서 들어가지 않아요. 용지를 바꾸거나 여백·간격을 줄여 보세요.'; tip.textContent = '';
  } else {
    info.textContent = `${po.sheet} ${L.label} 용지 한 면에 노트 ${L.n}개 (가로 ${L.cols} × 세로 ${L.rows}, 최대 ${L.max}개) · ${nsel}쪽 → ${dup ? `용지 ${plan.length / 2}장(앞·뒤 ${plan.length}면)` : `용지 ${plan.length}장`}`;
    tip.textContent = `용지 ${r2(L.SW)}×${r2(L.SH)}mm. 인쇄 창에서 배율은 100%(실제 크기), 여백은 “없음”, 머리글·바닥글은 끄세요.` + (dup ? ` 양면 인쇄는 “${po.flip === 'short' ? '짧은' : '긴'} 변 기준으로 넘기기”로 하세요. 뒷면은 그에 맞게 좌우(또는 위아래)를 뒤집어 놓았어요.` : '') + (po.cut === 'line' ? ' 자르는 점선은 프린터가 찍을 수 있는 가장자리(약 3mm)부터 시작해요.' : '');
  }
  if (!full && plan.length > PREVIEW_SHEETS) host.append(h('p', { class: 'muted small more' }, `미리보기는 앞 ${PREVIEW_SHEETS}장만 보여드려요. 인쇄는 전체(${plan.length}장)를 찍어요.`));
}
function renderPrintOpts() {
  const b = $('#printOpts'); b.textContent = '';
  const upd = () => { lsSet(LS.print, po); renderPrintOpts(); renderSheets(false); };
  b.append(row('쪽', seg([['all', `모든 쪽 (${doc.pages.length})`], ['current', `지금 쪽(${ui.pageIdx + 1})만`]], po.what, v => { po.what = v; upd(); })));
  b.append(row('방식', seg([['single', '노트 크기 그대로 한 쪽씩'], ['sheet', '큰 용지에 모아 찍기']], po.mode, v => { po.mode = v; upd(); })));
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: duplexOn(), onchange: e => { po.duplex = e.target.checked; upd(); } }), '양면 인쇄 (1쪽=앞면, 2쪽=뒷면 — 앞뒤가 겹치게 자동으로 배치)')));
  if (duplexOn()) b.append(row('종이 넘기는 방향', seg([['long', '긴 변 기준 (보통)'], ['short', '짧은 변 기준']], po.flip, v => { po.flip = v; upd(); })));
  if (po.mode === 'sheet') {
    b.append(row('채우는 법', seg([['repeat', '한 쪽을 반복해서 가득'], ['order', '쪽 순서대로']], po.fill, v => { po.fill = v; upd(); })));
    b.append(row('용지', h('select', { onchange: e => { po.sheet = e.target.value; upd(); } }, SHEETS.map(s => h('option', { value: s.name, selected: s.name === po.sheet }, `${s.name} (${s.w}×${s.h})`)))));
    b.append(row('방향', h('select', { onchange: e => { po.orient = e.target.value; upd(); } }, [['auto', '자동 (많이 들어가는 쪽)'], ['portrait', '세로'], ['landscape', '가로']].map(([v, l]) => h('option', { value: v, selected: po.orient === v }, l)))));
    b.append(row('바깥 여백', stepper(po.margin, { min: 0, max: 30, step: 1 }, v => { po.margin = v; upd(); }), h('span', { class: 'unit' }, 'mm (프린터는 가장자리 3~5mm를 못 찍어요)')));
    b.append(row('노트 사이', stepper(po.gap, { min: 0, max: 30, step: 1 }, v => { po.gap = v; upd(); }), h('span', { class: 'unit' }, 'mm')));
    b.append(row('한 면에', stepper(po.count, { min: 0, max: 99, step: 1 }, v => { po.count = Math.round(v); upd(); }), h('span', { class: 'unit' }, po.count ? '개만' : '(0 = 가득)')));
    b.append(row('자르는 선', seg([['line', '점선 (재단기용)'], ['tick', '모서리 표시'], ['none', '없음']], po.cut, v => { po.cut = v; upd(); })));
    if (po.cut !== 'none' && po.gap < 1) b.append(h('p', { class: 'hint warnc' }, '노트 사이가 0이면 선이 노트 가장자리에 겹쳐요. 4mm쯤 띄우면 선이 빈 틈에 놓여서 보기 좋아요.'));
  }
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: po.bg, onchange: e => { po.bg = e.target.checked; upd(); } }), '바탕 모눈도 함께 찍기')));
}
function openPrint() { endEdit(); select([]); $('#printModal').hidden = false; renderPrintOpts(); renderSheets(false); }
const closeModal = id => { $(id).hidden = true; };
$('#printBtn').onclick = openPrint;
$('#printClose').onclick = () => closeModal('#printModal');
$('#doPrint').onclick = async () => { renderSheets(true); await new Promise(r => setTimeout(r, 80)); await Promise.all([...document.querySelectorAll('#sheets img')].map(i => (i.decode ? i.decode().catch(() => {}) : null))); setTimeout(() => window.print(), 50); };
window.addEventListener('beforeprint', () => { renderSheets(true); });
window.addEventListener('afterprint', () => { if (printOpen()) renderSheets(false); else $('#sheets').textContent = ''; });

/* ---------- 인쇄소용 PDF ---------- */
const pdfOpt = Object.assign({ marks: false, what: 'all' }, lsGet('noteprint.pdf.v2', {}));
function pdfFileName() { return `노트내지_${doc.page.w}x${doc.page.h}_${pdfOpt.what === 'current' ? '1쪽' : doc.pages.length + '쪽'}.pdf`; }
function renderPdfOpts() {
  const b = $('#pdfOpts'); b.textContent = '';
  const upd = () => { lsSet('noteprint.pdf.v2', pdfOpt); renderPdfOpts(); };
  const n = doc.pages.length, need = doc.kind === 'bound' && pdfOpt.what === 'all' ? (4 - (n % 4)) % 4 : 0, oddEnd = doc.kind === 'binder' && pdfOpt.what === 'all' && n % 2 === 1;
  b.append(row('내보낼 쪽', seg([['all', `모든 쪽 (${n}쪽)`], ['current', `지금 쪽(${ui.pageIdx + 1})만`]], pdfOpt.what, v => { pdfOpt.what = v; upd(); })));
  b.append(row('도련', stepper(doc.bleed, { min: 0, max: 10, step: 1 }, v => { mutate(() => { doc.bleed = v; }); zoom = 1; renderAll(); renderPdfOpts(); }), h('span', { class: 'unit' }, 'mm  (레드프린팅 책자는 5mm)')));
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: pdfOpt.marks, onchange: e => { pdfOpt.marks = e.target.checked; upd(); } }), '재단선(자르는 표시)을 파일에 넣기')));
  b.append(h('p', { class: 'hint' }, pdfOpt.marks
    ? '재단선을 넣으면 종이가 도련보다 사방 8mm 더 커지고, 모서리에 자르는 표시와 쪽 번호가 들어가요. 레드프린팅은 표시(Marks)를 넣지 말라고 해요.'
    : '재단선 표시 없이 “재단 크기 + 도련”만 꽉 채워 내보내요(레드프린팅 가이드 방식).'));
  if (need) b.append(h('p', { class: 'info warn' }, `⚠ 노출제본은 쪽수가 4의 배수여야 해요. 지금 ${n}쪽이라 ${need}쪽이 모자라요. 아래 단추를 누르면 빈 쪽 ${need}개를 맨 뒤에 더하고 내보내요.`));
  if (oddEnd) b.append(h('p', { class: 'info' }, 'ℹ 쪽수가 홀수라, 양면 인쇄에서 앞뒤가 맞도록 PDF 끝에 빈 쪽 1개를 붙여서 내보내요 (노트 파일에는 더해지지 않아요).'));
  $('#doPdf').textContent = need ? `빈 쪽 ${need}개 추가하고 PDF 만들기` : 'PDF 만들기';
}
function openPdf() { endEdit(); select([]); $('#pdfResult').textContent = ''; $('#pdfModal').hidden = false; renderPdfOpts(); }
$('#pdfBtn').onclick = openPdf;
$('#pdfClose').onclick = () => closeModal('#pdfModal');
$('#doPdf').onclick = async () => {
  const btn0 = $('#doPdf'), out = $('#pdfResult');
  btn0.disabled = true; out.textContent = '';
  const status = h('p', { class: 'info' }, 'PDF를 만드는 중…'); out.append(status);
  try {
    if (doc.kind === 'bound' && pdfOpt.what === 'all') { const need = (4 - (doc.pages.length % 4)) % 4; if (need) { addBlankPages(need); renderPdfOpts(); } }
    const pages = pdfOpt.what === 'current' ? [ui.pageIdx] : doc.pages.map((_, i) => i);
    const blankEnd = doc.kind === 'binder' && pdfOpt.what === 'all' && doc.pages.length % 2 === 1;
    const res = await NP.exportPDF(doc, { blankEnd, bleed: doc.bleed, marks: pdfOpt.marks, pages, title: `노트 ${doc.page.w}×${doc.page.h}`, getImage: idbGet }, m => { status.textContent = m; });
    const blob = new Blob([res.bytes], { type: 'application/pdf' }), name = pdfFileName();
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const i = res.info, mb = (res.bytes.length / 1048576).toFixed(1);
    out.textContent = '';
    out.append(h('p', { class: 'info' }, `✔ ${name} 를 만들었어요 (${mb}MB)`),
      h('ul', { class: 'sum' },
        h('li', {}, `${i.pages}쪽 · 재단 크기 ${i.trim} · 도련 ${i.bleed}mm · ${i.marks ? `재단선 포함, 종이 크기 ${i.media}` : `도련 포함 크기 ${i.media}`}`),
        ...(i.blankAdded ? [h('li', {}, '쪽수가 홀수라 양면 인쇄용으로 끝에 빈 쪽 1개를 붙였어요')] : []),
        h('li', {}, '색: CMYK (검정·회색은 K 한 가지만 사용)'),
        h('li', {}, `글꼴: ${i.fonts.length ? i.fonts.join(', ') + ' — 파일 안에 포함됨' : '글자 없음'}`),
        h('li', {}, '모눈·선·글자는 모두 벡터라 해상도(dpi) 걱정이 없어요')),
      h('p', { class: 'info' }, '인쇄소(레드프린팅) 규칙 점검'),
      h('ul', { class: 'sum' }, [
        [doc.bleed === 5, doc.bleed === 5 ? '도련 5mm' : `도련이 ${doc.bleed}mm예요 — 레드프린팅 책자는 5mm를 요구해요`],
        [!i.marks, i.marks ? '재단선 표시가 들어 있어요 — 레드프린팅은 표시(Marks)를 넣지 말라고 해요' : '재단선 표시 없음'],
        [true, '낱장 PDF(펼침면 아님), 1쪽은 오른쪽 페이지부터'],
        [doc.kind !== 'bound' || pdfOpt.what !== 'all' || doc.pages.length % 4 === 0, doc.kind === 'bound' ? (doc.pages.length % 4 === 0 ? `쪽수 ${doc.pages.length}쪽 (4의 배수)` : '쪽수가 4의 배수가 아니에요') : `쪽수 ${i.pages}쪽`],
        [true, 'CMYK · 글꼴 파일 포함 · PDF 1.7 (6.0 이상)'],
      ].map(([ok, t]) => h('li', { class: ok ? '' : 'bad' }, (ok ? '✔ ' : '⚠ ') + t))),
      ...(i.missing.length ? [h('p', { class: 'info warn' }, '⚠ 글꼴에 없는 글자가 있어요 — 다른 글꼴로 바꿔 주세요'), h('ul', { class: 'sum' }, i.missing.map(t => h('li', {}, t)))] : []),
      ...(i.lowRes && i.lowRes.length ? [h('p', { class: 'info warn' }, '⚠ 사진이 흐릿하게 인쇄될 수 있어요 (인쇄 크기 기준 해상도)'), h('ul', { class: 'sum' }, i.lowRes.map(x => h('li', {}, `${x.page}쪽: 약 ${x.dpi}dpi (300 이상 권장)`)))] : []),
      ...(i.transparentPages && i.transparentPages.length ? [h('p', { class: 'info' }, `ℹ 투명한 PNG가 ${i.transparentPages.join(', ')}쪽에 있어요 — 투명하게 들어갔어요. 인쇄소가 투명 부분을 합치는(평탄화) 과정에서 달라질 수 있으니 시안을 확인해 보세요.`)] : []),
      ...(i.missingImages && i.missingImages.length ? [h('p', { class: 'info warn' }, `⚠ 찾을 수 없는 사진이 있어 빠졌어요: ${i.missingImages.join(', ')}`)] : []),
      ...(i.safePages.length ? [h('p', { class: 'info warn' }, `⚠ 안전선(${doc.safe}mm) 밖으로 나온 글자가 있는 쪽: ${i.safePages.join(', ')}쪽 — 잘릴 수 있어요`)] : []));
  } catch (err) {
    out.textContent = '';
    out.append(h('p', { class: 'info warn' }, `만들지 못했어요: ${err.message || err}`));
  } finally { btn0.disabled = false; }
};

/* ---------- 내 노트(저장·불러오기) ---------- */
function getSaved() {
  const old = lsGet(LS.saved1, null);
  if (old) { const merged = { ...old, ...lsGet(LS.saved, {}) }; if (lsSet(LS.saved, merged)) lsDel(LS.saved1); return merged; }
  return lsGet(LS.saved, {});
}
function openMy() { endEdit(); renderMy(); $('#myModal').hidden = false; }
function renderMy() {
  const saved = getSaved(), list = $('#myList'); list.textContent = '';
  const names = Object.keys(saved).sort((a, b) => (saved[b].t || 0) - (saved[a].t || 0));
  if (!names.length) list.append(h('li', { class: 'empty' }, '아직 저장한 노트가 없어요'));
  for (const n of names) {
    const s = saved[n], st = normalize(s.state);
    list.append(h('li', {},
      h('span', { class: 'nm' }, h('b', {}, n), h('span', { class: 'muted small' }, `${st.page.w}×${st.page.h}mm · ${st.pages.length}쪽 · ${new Date(s.t).toLocaleDateString('ko-KR')}`)),
      btn('불러오기', () => { loadDoc(s.state); closeModal('#myModal'); toast(`“${n}”을(를) 불러왔어요`); }),
      btn('지우기', () => { if (!confirm(`“${n}”을(를) 지울까요?`)) return; delete saved[n]; lsSet(LS.saved, saved); renderMy(); })));
  }
}
function loadDoc(obj) { snapshot(); endEdit(true); doc = normalize(obj); ui.pageIdx = 0; ui.editMaster = false; selIds = []; selGuide = null; zoom = 1; renderAll(); save(); markBackup(); }
$('#myBtn').onclick = openMy;
$('#myClose').onclick = () => closeModal('#myModal');
$('#saveCur').onclick = () => {
  const name = (prompt('저장할 이름을 적어 주세요', `노트 ${doc.page.w}×${doc.page.h}`) || '').trim(); if (!name) return;
  const saved = getSaved();
  if (saved[name] && !confirm(`“${name}”이(가) 이미 있어요. 덮어쓸까요?`)) return;
  saved[name] = { t: Date.now(), state: doc };
  if (!lsSet(LS.saved, saved)) { toast('저장 공간이 부족해요. 파일로 내보내기를 써 주세요'); return; }
  markBackup(); renderMy(); toast(`“${name}”로 저장했어요`);
};
const allItems = d => [...d.masters.flatMap(m => m.items), ...d.pages.flatMap(p => p.items)];
const blobToDataURL = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
$('#exportBtn').onclick = async () => {
  const images = {};
  for (const id of new Set(allItems(doc).filter(i => i.type === 'image').map(i => i.src))) { const b = await idbGet(id).catch(() => null); if (b) images[id] = { type: b.type, data: await blobToDataURL(b) }; }
  const blob = new Blob([JSON.stringify({ noteprint: 4, doc, images })], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `노트인쇄-${doc.page.w}x${doc.page.h}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); markBackup(); toast('파일로 내보냈어요');
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j && j.noteprint && j.doc) { for (const [id, v] of Object.entries(j.images || {})) { const blob = await (await fetch(v.data)).blob(); await idbPut(id, blob); imgUrls.delete(id); } loadDoc(j.doc); }
    else loadDoc(j);
    closeModal('#myModal'); toast('파일에서 불러왔어요');
  } catch (err) { toast('이 파일은 읽을 수 없어요'); }
};
for (const m of ['#printModal', '#myModal', '#pdfModal']) $(m).addEventListener('pointerdown', e => { if (e.target === $(m)) $(m).hidden = true; });

/* ---------- 위쪽 단추 ---------- */
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;
$('#newBtn').onclick = () => {
  if (!ctxItems().length) return toast('이미 비어 있어요');
  if (!confirm(`${ui.editMaster ? '이 바탕에' : '이 쪽에'} 넣은 글자·선·네모를 모두 지울까요?\n(“되돌리기”로 다시 살릴 수 있어요)`)) return;
  endEdit(true); mutate(() => { ctxItems().length = 0; }); selIds = []; renderItems(); renderPropBox();
};
document.querySelectorAll('[data-add]').forEach(b => { b.onclick = () => addItem(b.dataset.add); });
$('#imgFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await importImageFiles(fs); else imgReplaceId = null; };
scroller.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
scroller.addEventListener('drop', e => { const fs = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter(f => /^image\//.test(f.type)); if (!fs.length) return; e.preventDefault(); imgReplaceId = null; importImageFiles(fs); });
function updateToggles() {
  $('#tgRuler').classList.toggle('on', ui.rulers); $('#tgGuides').classList.toggle('on', ui.userGuides);
  $('#tgSmart').classList.toggle('on', ui.smart); $('#tgGrid').classList.toggle('on', doc.snap);
}
$('#tgRuler').onclick = () => { ui.rulers = !ui.rulers; updateToggles(); drawRulers(); setTimeout(applyView, 0); };
$('#tgGuides').onclick = () => { ui.userGuides = !ui.userGuides; updateToggles(); renderUserGuides(); };
$('#tgSmart').onclick = () => { ui.smart = !ui.smart; updateToggles(); };
$('#tgGrid').onclick = () => { mutate(() => { doc.snap = !doc.snap; }); updateToggles(); renderMasterBox(); };
let rT;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { applyView(); if (printOpen()) renderSheets(false); }, 120); });

/* ---------- 노트 종류 · 쪽 번호 · 링 구멍 패널 ---------- */
function renderKindBox() {
  const b = $('#kindBox'); b.textContent = '';
  b.append(row('종류', h('select', { onchange: e => { mutate(() => { doc.kind = e.target.value; if (doc.kind === 'bound') doc.holes.on = false; }); renderPanels(); renderGuides(); renderStrip(); } },
    [['free', '자유 (규칙 없음)'], ['binder', '바인더용 속지 (낱장)'], ['bound', '노출제본 속지 (4쪽 단위)']].map(([v, l]) => h('option', { value: v, selected: doc.kind === v }, l)))));
  b.append(h('p', { class: 'hint' }, doc.kind === 'binder'
    ? '낱장 인쇄예요. 쪽은 1쪽씩 추가돼요. 양면이라 1쪽=앞면, 2쪽=뒷면이고, 홀수 쪽은 왼쪽·짝수 쪽은 오른쪽에 구멍 가이드가 그려져요. PDF는 쪽수가 홀수면 끝에 빈 쪽 1개를 붙여요.'
    : doc.kind === 'bound' ? '쪽수가 늘 4의 배수여야 해요. 쪽 추가는 4쪽씩이고, 지워서 4의 배수가 깨지면 경고가 떠요. PDF는 4의 배수일 때만 만들 수 있어요.' : '규칙 없이 자유롭게 만드는 모드예요.'));
  b.append(row('', btn('＋ 새 파일 만들기…', () => openNew())));
}
function renderNumBox() {
  const b = $('#numBox'); b.textContent = '';
  const pn = doc.pageNum, pg = curPage();
  const after = () => { renderBackdrop(); renderStrip(); renderNumBox(); };
  b.append(row('쪽 번호', seg([[0, '넣지 않음'], [1, '자동으로 넣기']], pn.on ? 1 : 0, v => { mutate(() => { pn.on = !!v; }); after(); })));
  if (!pn.on) { b.append(h('p', { class: 'hint' }, '켜면 모든 쪽에 번호가 자동으로 찍혀요. 어떤 쪽만 끄거나 위치를 바꿀 수도 있어요.')); return; }
  b.append(row('가로 위치', seg([['outer', '바깥 가장자리'], ['center', '가운데']], pn.h, v => { mutate(() => { pn.h = v; }); after(); })));
  b.append(row('세로 위치', seg([['bottom', '아래'], ['top', '위']], pn.v, v => { mutate(() => { pn.v = v; }); after(); })));
  b.append(row('시작 번호', stepper(pn.start, { min: -99, max: 9999, step: 1 }, v => { mutate(() => { pn.start = Math.round(v); }, 'pnstart'); after(); })));
  b.append(row('글자 크기', stepper(pn.pt, { min: 5, max: 24, step: 0.5 }, v => { mutate(() => { pn.pt = v; }, 'pnpt'); after(); }), h('span', { class: 'unit' }, 'pt')));
  b.append(row('글꼴', h('select', { onchange: e => { mutate(() => { pn.font = e.target.value; }); after(); } }, Object.entries(FONTS).map(([k, v]) => h('option', { value: k, selected: pn.font === k }, v.label)))));
  b.append(row('색', swatches(pn.color, c => { mutate(() => { pn.color = c; }); after(); })));
  { const hn = colorHint(pn.color); if (hn) b.append(hn); }
  b.append(h('div', { class: 'sub' }, `이 쪽(${ui.pageIdx + 1}쪽)만 따로`));
  const ov = pg.num || {}, setOv = (k, v) => { mutate(() => { const o = { ...(pg.num || {}) }; if (v === undefined || v === '' || v === false) delete o[k]; else o[k] = v; pg.num = Object.keys(o).length ? o : undefined; }); after(); };
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: !!ov.off, onchange: e => setOv('off', e.target.checked) }), '이 쪽은 쪽 번호를 넣지 않기')));
  if (!ov.off) {
    b.append(row('가로', seg([['', '전체와 같게'], ['outer', '바깥'], ['center', '가운데']], ov.h || '', v => setOv('h', v))));
    b.append(row('세로', seg([['', '전체와 같게'], ['bottom', '아래'], ['top', '위']], ov.v || '', v => setOv('v', v))));
  }
}
function renderHoleBox() {
  const b = $('#holeBox'); b.textContent = '';
  const hl = doc.holes;
  if (doc.kind === 'bound') { b.append(h('p', { class: 'hint' }, '노출제본에는 링 구멍이 없어요.')); return; }
  const after = () => { renderGuides(); renderHoleBox(); };
  b.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: hl.on, onchange: e => { mutate(() => { hl.on = e.target.checked; }); after(); } }), '링 구멍 가이드 보이기 (인쇄되지 않아요)')));
  if (!hl.on) return;
  b.append(row('크기별 기본값', h('select', { onchange: e => { const p = HOLE_PRESETS[e.target.value]; if (!p) return; mutate(() => { Object.assign(hl, { preset: e.target.value, gaps: [...p.gaps], dia: p.dia, edge: p.edge, est: true }); }); after(); } },
    h('option', { value: '', selected: !HOLE_PRESETS[hl.preset] }, '직접 설정'), Object.entries(HOLE_PRESETS).map(([k, p]) => h('option', { value: k, selected: hl.preset === k }, p.name)))));
  b.append(row('구멍 지름', stepper(hl.dia, { min: 3, max: 6, step: 0.5 }, v => { mutate(() => { hl.dia = v; }, 'hdia'); renderGuides(); }), h('span', { class: 'unit' }, 'mm (3~6)')));
  b.append(row('가장자리 거리', stepper(hl.edge, { min: 1.5, max: 25, step: 0.5 }, v => { mutate(() => { hl.edge = v; hl.est = false; }, 'hedge'); renderGuides(); renderHoleBox(); }), h('span', { class: 'unit' }, 'mm (구멍 중심까지)')));
  b.append(h('div', { class: 'sub2' }, `구멍 사이 간격 (위에서부터, mm) — 구멍 ${hl.gaps.length + 1}개`));
  b.append(h('div', { class: 'holegaps' }, hl.gaps.map((g, i) => h('input', { type: 'number', step: 0.5, min: 3, max: 120, value: g, 'aria-label': `${i + 1}번째 간격`, onchange: e => { const v = clamp(+e.target.value || 19, 3, 120); mutate(() => { hl.gaps[i] = v; hl.preset = 'custom'; }, 'hgap'); renderGuides(); } })),
    btn('＋ 구멍', () => { if (hl.gaps.length >= 11) return; mutate(() => { hl.gaps.push(19); hl.preset = 'custom'; }); after(); }), btn('－ 구멍', () => { if (hl.gaps.length <= 1) return; mutate(() => { hl.gaps.pop(); hl.preset = 'custom'; }); after(); })));
  b.append(h('p', { class: 'hint' + (hl.est ? ' warnc' : '') }, (hl.est ? '※ 가장자리 거리와 지름은 자료로 확정하지 못한 추정값이에요. 가지고 계신 속지를 재서 고쳐 주세요(고치면 이 표시가 사라져요). ' : '') + '구멍은 종이 세로 가운데를 기준으로 위아래 대칭이에요. 홀수 쪽은 왼쪽, 짝수 쪽은 오른쪽에 그려져요.'));
}

/* ---------- 새 파일 만들기 ---------- */
function makeNewDoc(o) {
  const d = defaultDoc();
  d.kind = o.kind; d.page = { w: o.w, h: o.h };
  d.masters[0].grid = { type: o.grid, size: o.gs, tone: 35, color: 'k100' };
  d.pages = Array.from({ length: o.pages }, (_, i) => ({ id: 'p' + (i + 1), master: 'm1', guides: [], items: [] }));
  d.pageNum = { on: o.num, h: o.nh, v: o.nv, start: o.start, pt: 8, font: 'pretendard', color: 'k100' };
  if (o.kind === 'binder' && o.holes) { const p = HOLE_PRESETS[o.hp]; d.holes = { on: true, preset: o.hp, gaps: [...p.gaps], dia: p.dia, edge: p.edge, est: true }; }
  return d;
}
function openNew() {
  endEdit();
  const st = { kind: 'binder', size: 'bible', w: 95, h: 171, pages: 10, num: false, nh: 'outer', nv: 'bottom', start: 1, grid: 'square', gs: 5, holes: true, hp: 'bible' };
  const sizesOf = kind => [...SIZE_SETS[kind], ...lsGet(LS.sizes, []).map(c => ({ k: 'u:' + c.name, n: c.name + ' ★', w: c.w, h: c.h })), { k: 'custom', n: '사용자 지정 (mm로 직접 입력)', w: 105, h: 148 }];
  const draw = () => {
    const body = $('#newBody'); body.textContent = '';
    body.append(h('div', { class: 'sub' }, '1. 노트 종류'));
    body.append(row('', seg([['binder', '바인더용 속지'], ['bound', '노출제본 속지']], st.kind, v => { st.kind = v; const f = sizesOf(v)[0]; st.size = f.k; st.w = f.w; st.h = f.h; st.pages = v === 'bound' ? 16 : 10; st.hp = f.hole || 'a6'; draw(); })));
    body.append(h('p', { class: 'hint' }, st.kind === 'binder' ? '구멍을 뚫어 바인더에 끼우는 낱장 속지예요. 쪽은 1쪽씩 추가하고, 양면 인쇄라 1쪽=앞면, 2쪽=뒷면이에요.' : '실로 묶는 노트(노출제본)예요. 쪽수는 늘 4의 배수예요 — 쪽 추가는 4쪽씩이에요.'));
    body.append(h('div', { class: 'sub' }, '2. 용지 크기'));
    const list = sizesOf(st.kind);
    body.append(row('크기', h('select', { onchange: e => { const s = list.find(x => x.k === e.target.value); st.size = s.k; if (s.k !== 'custom') { st.w = s.w; st.h = s.h; } if (s.hole) st.hp = s.hole; draw(); } },
      list.map(s => h('option', { value: s.k, selected: st.size === s.k }, s.k === 'custom' ? s.n : `${s.n}  (${s.w}×${s.h})`)))));
    if (st.size === 'custom') body.append(row('가로 × 세로', stepper(st.w, { min: 20, max: 500, step: 1 }, v => { st.w = v; }), h('span', { class: 'unit' }, '×'), stepper(st.h, { min: 20, max: 500, step: 1 }, v => { st.h = v; }), h('span', { class: 'unit' }, 'mm')));
    if (st.kind === 'binder') {
      body.append(h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: st.holes, onchange: e => { st.holes = e.target.checked; draw(); } }), '링 구멍 가이드 넣기 (인쇄되지 않아요)')));
      if (st.holes) body.append(row('구멍', h('select', { onchange: e => { st.hp = e.target.value; } }, Object.entries(HOLE_PRESETS).map(([k, p]) => h('option', { value: k, selected: st.hp === k }, p.name)))));
    }
    body.append(h('div', { class: 'sub' }, '3. 쪽 수'));
    if (st.kind === 'bound') body.append(row('쪽 수', stepper(st.pages, { min: 4, max: 200, step: 4 }, v => { st.pages = Math.max(4, Math.round(v / 4) * 4); draw(); }), h('span', { class: 'unit' }, '쪽 (4의 배수)')));
    else body.append(row('쪽 수', stepper(st.pages, { min: 1, max: 200, step: 1 }, v => { st.pages = Math.round(v); }), h('span', { class: 'unit' }, `쪽 (양면이면 2쪽 = 종이 1장)`)));
    body.append(h('div', { class: 'sub' }, '4. 쪽 번호'));
    body.append(row('', seg([[0, '넣지 않음'], [1, '자동으로 넣기']], st.num ? 1 : 0, v => { st.num = !!v; draw(); })));
    if (st.num) {
      body.append(row('가로 위치', seg([['outer', '바깥 가장자리'], ['center', '가운데']], st.nh, v => { st.nh = v; draw(); })));
      body.append(row('세로 위치', seg([['bottom', '아래'], ['top', '위']], st.nv, v => { st.nv = v; draw(); })));
      body.append(row('시작 번호', stepper(st.start, { min: -99, max: 9999, step: 1 }, v => { st.start = Math.round(v); })));
    }
    body.append(h('div', { class: 'sub' }, '5. 바탕'));
    body.append(row('모양', seg([['square', '모눈'], ['dot', '점'], ['line', '줄'], ['none', '없음']], st.grid, v => { st.grid = v; draw(); })));
    if (st.grid !== 'none') body.append(row('칸 간격', stepper(st.gs, { min: 2, max: 30, step: 0.5 }, v => { st.gs = v; }), h('span', { class: 'unit' }, 'mm')));
  };
  draw();
  $('#newOk').onclick = () => {
    const d = makeNewDoc(st);
    const has = doc.pages.length > 1 || doc.pages.some(p => p.items.length) || doc.masters.some(m => m.items.length);
    if (has && !confirm('지금 만들던 노트를 닫고 새 파일을 만들까요?\n(“되돌리기”로 돌아올 수 있어요. 남기려면 먼저 “내 노트”에 저장하세요.)')) return;
    closeModal('#newModal'); loadDoc(d); showTab('doc', true); toast(`새 ${st.kind === 'bound' ? '노출제본' : '바인더'} 노트를 만들었어요 (${st.pages}쪽)`);
  };
  $('#newModal').hidden = false;
}
$('#fileNewBtn').onclick = openNew;
$('#newClose').onclick = () => closeModal('#newModal');
$('#newModal').addEventListener('pointerdown', e => { if (e.target === $('#newModal')) $('#newModal').hidden = true; });

/* ---------- 시작 ---------- */
updateUndo();
renderAll();
markBackup();
{ const el = $('#saveState'); if (el) el.textContent = '✔ 자동 저장 켜짐'; const chk = $('#confirmCloseChk'); if (chk) { chk.checked = confirmCloseOn(); chk.onchange = () => lsSet('noteprint.confirmClose', chk.checked); } }
if (!lsGet(LS.cur, null) && !lsGet(LS.cur1, null) && !lsGet('noteprint.seen', false)) { lsSet('noteprint.seen', true); openNew(); }
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__noteprint = { getImage: idbGet, get doc() { return doc; }, get ui() { return ui; }, get sel() { return selIds; }, get layout() { return layoutCalc(); } };
})();
