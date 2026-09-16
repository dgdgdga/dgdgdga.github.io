/* ============================================================
   THE MEOWSEUM · 3D 展館
   內容全部來自 data.js（由 labels/copy.json 生成），這裡只管空間。
   ============================================================ */
import * as THREE from 'three';
import { DATA } from './data.js';

/* 牆上的字有一半是畫在 canvas 上的（展籤、廳牌、海報），而 canvas 的 fillText
   不會等 webfont：字型還沒到就畫，缺字會直接烤成替代字形、之後補不回來。
   所以先把兩個字重都確定就緒，才開始蓋展館。
   @font-face 的 src 是 local() 優先，系統本來就有宋體的機器這裡不會有任何下載；
   真的沒有才會抓 vendor/fonts/ 的子集（約 300 KB）。
   加個時限，免得字型出狀況時卡在「Preparing the galleries…」不動。 */
try {
  await Promise.race([
    Promise.all([
      document.fonts.load('400 16px "Meowseum Serif"'),
      document.fonts.load('700 16px "Meowseum Serif"'),
    ]),
    new Promise((r) => setTimeout(r, 10000)),
  ]);
} catch (_) {}

/* ---------------- 展館尺寸 ---------------- */
const T      = 0.28;    // 牆厚
const PORTAL = 1.35;    // 門洞半寬 → 淨寬 2.7 m
const DOOR   = 3.00;    // 門洞高（收窄後的門洞，太高會變成「牆少做了一塊」）
const EYE    = 1.62;    // 視高
const RADIUS = 0.34;    // 玩家碰撞半徑
const WALK   = 2.55;
const RUN    = 4.60;
const FOV    = 55;

/* ---------------- 平面圖 ----------------
   房間以 (x0…x1, z0…z1) 表示，入口在南（+z），動線往北（-z）推進。 */
const ROOMS = {
  hall: { x0: -6,  x1: 6,  z0: 0,   z1: 12,  h: 4.8, mat: 'wallA' },
  I:    { x0: -7,  x1: 7,  z0: -19, z1: -5,  h: 4.8, mat: 'wallA', room: 'I' },
  II:   { x0: -10, x1: 10, z0: -40, z1: -24, h: 5.2, mat: 'wallA', room: 'II' },
  III:  { x0: -10, x1: 10, z0: -60, z1: -44, h: 5.6, mat: 'wallB', room: 'III' },
  IV:   { x0: 10,  x1: 22, z0: -56, z1: -40, h: 3.6, mat: 'wallC', room: 'IV' },
};

const WALLS = [
  // 入口大廳
  { a: [-6, 12],  b: [6, 12],   h: 4.8, mat: 'wallA' },
  { a: [-6, 12],  b: [-6, 0],   h: 4.8, mat: 'wallA' },
  { a: [6, 12],   b: [6, 0],    h: 4.8, mat: 'wallA' },
  { a: [-6, 0],   b: [6, 0],    h: 4.8, mat: 'wallA', openings: [[-PORTAL, PORTAL]] },
  // 通道 A
  { a: [-PORTAL, 0], b: [-PORTAL, -5], h: 4.8, mat: 'wallA' },
  { a: [PORTAL, 0],  b: [PORTAL, -5],  h: 4.8, mat: 'wallA' },
  // Room I
  { a: [-7, -5],  b: [7, -5],   h: 4.8, mat: 'wallA', openings: [[-PORTAL, PORTAL]] },
  { a: [-7, -5],  b: [-7, -19], h: 4.8, mat: 'wallA' },
  { a: [7, -5],   b: [7, -19],  h: 4.8, mat: 'wallA' },
  { a: [-7, -19], b: [7, -19],  h: 4.8, mat: 'wallA', openings: [[-PORTAL, PORTAL]] },
  // 通道 B
  { a: [-PORTAL, -19], b: [-PORTAL, -24], h: 5.2, mat: 'wallA' },
  { a: [PORTAL, -19],  b: [PORTAL, -24],  h: 5.2, mat: 'wallA' },
  // Room II
  { a: [-10, -24], b: [10, -24], h: 5.2, mat: 'wallA', openings: [[-PORTAL, PORTAL]] },
  { a: [-10, -24], b: [-10, -40], h: 5.2, mat: 'wallA' },
  { a: [10, -24],  b: [10, -40],  h: 5.2, mat: 'wallA' },
  { a: [-10, -40], b: [10, -40],  h: 5.2, mat: 'wallA', openings: [[5.6, 7.4]] },
  // 通道 C
  { a: [5.6, -40], b: [5.6, -44], h: 5.6, mat: 'wallB' },
  { a: [7.4, -40], b: [7.4, -44], h: 5.6, mat: 'wallB' },
  // Room III
  { a: [-10, -44], b: [10, -44], h: 5.6, mat: 'wallB', openings: [[5.6, 7.4]] },
  { a: [-10, -44], b: [-10, -60], h: 5.6, mat: 'wallB' },
  { a: [10, -44],  b: [10, -60],  h: 5.6, mat: 'wallB', openings: [[-48.7, -46.3]] },
  { a: [-10, -60], b: [10, -60],  h: 5.6, mat: 'wallB' },
  // Room IV（禮品店）
  { a: [10, -40], b: [10, -44],  h: 3.6, mat: 'wallC' },
  { a: [10, -40], b: [22, -40],  h: 3.6, mat: 'wallC' },
  { a: [22, -40], b: [22, -56],  h: 3.6, mat: 'wallC' },
  { a: [10, -56], b: [22, -56],  h: 3.6, mat: 'wallC' },
];

// 通道天花板（低於門洞，形成「門檻」）
const PASSAGES = [
  { x0: -PORTAL, x1: PORTAL, z0: 0,   z1: -5,  y: DOOR, mat: 'ceil' },
  { x0: -PORTAL, x1: PORTAL, z0: -19, z1: -24, y: DOOR, mat: 'ceil' },
  { x0: 5.6,     x1: 7.4,    z0: -40, z1: -44, y: DOOR, mat: 'ceil' },
];

/* ---------------- 作品掛位 ----------------
   wall: 所在牆 | at: 沿牆座標 | 掛畫下沿由畫高決定 */
const HANG = {
  '01': { room: 'I',   wall: 'N', at: -4.70 },
  '02': { room: 'I',   wall: 'N', at:  4.70 },
  '03': { room: 'II',  wall: 'W', at: -28.60 },
  '04': { room: 'II',  wall: 'W', at: -35.40 },
  '05': { room: 'II',  wall: 'E', at: -28.60 },
  '06': { room: 'II',  wall: 'E', at: -35.40 },
  '07': { room: 'III', wall: 'N', at:  0.00 },
  '08': { room: 'III', wall: 'W', at: -49.00 },
  '09': { room: 'III', wall: 'W', at: -55.50 },
  '10': { room: 'III', wall: 'E', at: -54.50 },
};

const ROOM_TITLE = {
  hall: { cn: '入口大廳', en: 'Entrance Hall', range: '1486 – 1942' },
  I:    { cn: '神與神話', en: 'Myth & Origin', range: '1486 – 1512' },
  II:   { cn: '肖像沙龍', en: 'The Portrait Salon', range: '1503 – 1871' },
  III:  { cn: '浪漫主義之後', en: 'After Romanticism', range: '1818 – 1942' },
  IV:   { cn: '周邊商店', en: 'The Gift Shop', range: '—' },
};

/* ---------------- 色彩 / 字體 ---------------- */
const INK = '#111213', INK2 = '#23262A', GREY = '#575B5F', GREY2 = '#8B9095', RULE = '#D6D9DB';
const CREAM = '#F4F1E8', GREEN = '#0E2B22';
// 廳牌（深綠底）上的字：不純白，帶一點米，跟主視覺牆同一組
const CARD_TXT = '#D8D2C2', CARD_DIM = '#948F80', CARD_RULE = 'rgba(216,210,194,.30)';
const FT = 'Songti TC,"宋体-繁","Songti SC","Songti","Noto Serif TC",serif';
const FL = 'Baskerville,"Iowan Old Style","Times New Roman",serif';
const MM = 25.4 / 72;                       // pt → mm

const songti = (px, w = 700) => `${w} ${px}px ${FT}`;
const bask   = (px, it = false) => `${it ? 'italic ' : ''}${px}px ${FL}`;

/* ============================================================
   畫布工具
   ============================================================ */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

const LATIN = `[A-Za-z0-9'\u2019.,;:!?()[\\]{}&%/@#*+=<>"\u2013\u2014\\-]+`;
const TOKEN = new RegExp(`${LATIN}|[\\u3000 ]+|.`, 'gu');
const NO_START = '，。、；：！？）」』】》〉…·.,;:!?)]}';

function wrapText(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const tk of (text.match(TOKEN) || [])) {
    if (tk === '\n') { lines.push(line); line = ''; continue; }
    const test = line + tk;
    if (ctx.measureText(test).width > maxW && line !== '') {
      if (NO_START.includes(tk) && tk.length === 1) { lines.push(line + tk); line = ''; continue; }
      lines.push(line.replace(/[\s\u3000]+$/, ''));
      line = /^[\s\u3000]+$/.test(tk) ? '' : tk;
    } else line = test;
  }
  if (line.trim() !== '') lines.push(line.replace(/[\s\u3000]+$/, ''));
  return lines;
}

/* 展簽：148 × 105 mm（A6 橫版），白卡黑字，細線是唯一的裝飾 */
function labelTexture(work, room) {
  const S = 2048 / 148, W = 2048, H = Math.round(105 * S);
  const { c, x } = makeCanvas(W, H);
  const M = (v) => v * S;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';

  const L = M(14), R = W - M(14);
  const width = R - L;
  let y = M(12);

  const line = (txt, font, color, lh, gap) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    for (const t of wrapText(x, txt, width)) {
      y += size * 0.86; x.fillText(t, L, y); y += size * (lh - 0.86) + gap;
    }
  };

  line(work.titleCn, songti(M(29 * MM)), INK, 1.2, 0);
  line(work.titleEn, bask(M(13 * MM)), GREY, 1.3, M(3.2));

  y = Math.round(y) + M(6.6);
  x.fillStyle = RULE; x.fillRect(L, y, width, 1);
  y += M(5.2);

  line(work.noteCn, songti(M(8.9 * MM), 400), GREY, 2.02, 0);

  // 收尾短句固定貼底
  const ps = M(8.9 * MM), es = M(8.4 * MM);
  const punchLines = (x.font = songti(ps, 700), wrapText(x, work.punchCn, width));
  const enLines = (x.font = bask(es, true), wrapText(x, work.punchEn, width));
  let by = H - M(11) - (enLines.length * es * 1.5) - (punchLines.length * ps * 2.02);
  x.font = songti(ps, 700); x.fillStyle = INK2;
  for (const t of punchLines) { by += ps * 0.86; x.fillText(t, L, by); by += ps * (2.02 - 0.86); }
  x.font = bask(es, true); x.fillStyle = GREY2;
  by += M(0.2);
  for (const t of enLines) { by += es * 0.86; x.fillText(t, L, by); by += es * (1.5 - 0.86); }

  return canvasTex(c);
}

/* 廳牌：A4 豎版的版式，但底色是展館的深綠，不是白紙。
   白紙在淺色牆上會整片糊掉，深綠底 + 米白字才撐得住展場的暗，
   也跟入口主視覺牆同一套色。 */
function roomCardTexture(room, works) {
  const S = 2100 / 210, W = 2100, H = Math.round(297 * S);
  const { c, x } = makeCanvas(W, H);
  const M = (v) => v * S;
  const INK = CREAM, INK2 = CARD_TXT, GREY = CARD_TXT, GREY2 = CARD_DIM, RULE = CARD_RULE;
  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  const L = M(24), R = W - M(24), width = R - L;
  let y = M(24);

  const put = (txt, font, color, lh, gap, align) => {
    x.font = font; x.fillStyle = color; x.textAlign = align || 'left';
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    const px = align === 'right' ? R : L;
    for (const t of wrapText(x, txt, width)) { y += size * 0.86; x.fillText(t, px, y); y += size * (lh - 0.86) + gap; }
    x.textAlign = 'left';
  };

  x.font = bask(M(8.6 * MM)); x.fillStyle = GREY2;
  x.fillText('THE MEOWSEUM · VOL. I     ·     ROOM', L, y + M(8.6 * MM) * 0.86);
  x.textAlign = 'right'; x.fillText(room.range, R, y + M(8.6 * MM) * 0.86); x.textAlign = 'left';
  y += M(8.6 * MM) * 1.1;

  x.font = bask(M(132 * MM)); x.fillStyle = INK;
  y += M(132 * MM) * 0.79; x.fillText(room.numeral, L, y);
  y += M(132 * MM) * 0.13;

  y += M(7);
  put(room.nameCn, songti(M(40 * MM)), INK, 1.14, 0);
  y += M(4);
  put(room.nameEn, bask(M(15 * MM)), GREY, 1.3, 0);

  y = Math.round(y) + M(10);
  x.fillStyle = RULE; x.fillRect(L, y, width, 1);
  y += M(7);

  put(room.statementCn, songti(M(10.4 * MM), 400), GREY, 2.15, 0);
  y += M(6);
  put(room.statementEn, bask(M(8.8 * MM), true), GREY2, 1.85, 0);

  // 本廳作品，貼底
  const items = works.map((w, i) => ({
    n: w.no, cn: w.titleCn, en: w.titleEn,
  }));
  const fs = M(10 * MM), lh = fs * 1.8;
  const hdrH = M(6 + 7.6 * MM * 1.2);
  const blockH = hdrH + items.length * (lh + M(1.6) * 2) + M(9);
  let by = H - M(24) - blockH;

  x.fillStyle = RULE; x.fillRect(L, by, width, 1);
  x.font = songti(M(7.6 * MM), 400); x.fillStyle = GREY2;
  x.fillText(room.itemsHeading || DATA.ui.worksHeading, L, by + M(6) + M(7.6 * MM) * 0.86);

  let iy = by + hdrH;
  for (const it of items) {
    x.font = bask(fs); x.fillStyle = GREY2; x.fillText(it.n, L, iy + fs * 0.86);
    x.font = songti(fs, 400); x.fillStyle = INK2; x.fillText(it.cn, L + M(9), iy + fs * 0.86);
    const cw = x.measureText(it.cn).width;
    x.font = bask(fs * 0.92); x.fillStyle = GREY2;
    x.fillText(it.en, L + M(9) + cw + M(4), iy + fs * 0.86);
    x.fillStyle = RULE; x.fillRect(L, iy + lh, width, 0);
    iy += lh + M(1.6) * 2;
  }

  x.font = bask(M(7.6 * MM)); x.fillStyle = GREY2;
  x.fillText('LADY MIMI · A RETROSPECTIVE IN NINE LIVES', L, H - M(24) + M(7.6 * MM) * 0.86);
  x.textAlign = 'right';
  x.fillText(DATA.brand.vol.toUpperCase(), R, H - M(24) + M(7.6 * MM) * 0.86);
  x.textAlign = 'left';

  return canvasTex(c);
}

/* 館內內容海報：A3 豎版（297 × 420 mm），深綠底。
   掛在大廳通往 Room I 的牆上、門洞兩側——走過主視覺牆之後，
   第二眼看到的就是「這裡到底展了什麼」。
   內容全部從 data.js 來，不另外寫一份文案。 */
let POSTER_CANVAS = null;
function posterTexture() {
  const B = DATA.brand;
  const S = 2600 / 297, W = 2600, H = Math.round(420 * S);
  const { c, x } = makeCanvas(W, H);
  POSTER_CANVAS = c;
  const M = (v) => v * S;
  const dim = (a) => `rgba(244,241,232,${a})`;
  const L = M(22), R = W - M(22), width = R - L;
  let y = M(22);

  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';

  const rule = (a) => { x.strokeStyle = dim(a); x.lineWidth = 1.6; x.beginPath(); x.moveTo(L, Math.round(y)); x.lineTo(R, Math.round(y)); x.stroke(); };
  const put = (txt, font, color, lh, gap) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    for (const t of wrapText(x, txt, width)) { y += size * 0.86; x.fillText(t, L, y); y += size * (lh - 0.86) + gap; }
  };

  x.font = bask(M(8.4 * MM)); x.fillStyle = CARD_DIM;
  x.fillText('THE MEOWSEUM', L, y + M(8.4 * MM) * 0.86);
  x.textAlign = 'right'; x.fillText(B.vol.toUpperCase(), R, y + M(8.4 * MM) * 0.86); x.textAlign = 'left';
  y += M(8.4 * MM) * 1.4; rule(0.26); y += M(9);

  put(B.museumCn, songti(M(60 * MM)), CREAM, 1.12, 0);
  y += M(4);
  put(B.museumEn.toUpperCase(), bask(M(15 * MM)), CARD_DIM, 1.3, 0);
  y += M(9); rule(0.20); y += M(9);

  put(B.heroEn, bask(M(30 * MM)), CREAM, 1.15, 0);
  y += M(2);
  put(`${B.heroCn}　·　${B.attributionCn}`, songti(M(12 * MM), 400), CARD_TXT, 1.75, 0);
  put(B.attributionEn, bask(M(10 * MM), true), CARD_DIM, 1.6, 0);
  y += M(9); rule(0.20); y += M(10);

  put(B.subtitleCn, songti(M(15 * MM), 700), CREAM, 1.7, 0);
  y += M(1.5);
  put(B.subtitleEn, bask(M(11 * MM), true), CARD_DIM, 1.55, 0);
  y += M(14); rule(0.20); y += M(10);

  // 展覽內容：三廳
  x.font = songti(M(9 * MM), 400); x.fillStyle = CARD_DIM;
  x.fillText('展覽內容　CONTENTS', L, y + M(9 * MM) * 0.86);
  y += M(9 * MM) * 2.1;
  for (const room of DATA.rooms) {
    const n = DATA.works.filter((w) => w.room === room.numeral).length;
    const base = y;
    x.font = bask(M(17 * MM)); x.fillStyle = CARD_DIM; x.fillText(room.numeral, L, base + M(17 * MM) * 0.8);
    x.font = songti(M(15 * MM), 700); x.fillStyle = CREAM; x.fillText(room.nameCn, L + M(22), base + M(15 * MM) * 0.8);
    x.font = bask(M(9.5 * MM)); x.fillStyle = CARD_DIM;
    x.textAlign = 'right'; x.fillText(`${room.range}　·　${n} 件`, R, base + M(15 * MM) * 0.8); x.textAlign = 'left';
    y = base + M(17 * MM) * 0.8 + M(4);
    x.font = bask(M(9.5 * MM), true); x.fillStyle = CARD_DIM;
    x.fillText(room.nameEn, L + M(22), y + M(9.5 * MM) * 0.8);
    y += M(9.5 * MM) * 0.8 + M(7);
  }

  y += M(4); rule(0.20); y += M(9);
  x.font = songti(M(9 * MM), 400); x.fillStyle = CARD_DIM;
  x.fillText('本回作品　WORKS', L, y + M(9 * MM) * 0.86);
  y += M(9 * MM) * 2.0;

  const fs = M(11 * MM), lh = fs * 1.85;
  for (const w of DATA.works) {
    x.font = bask(fs * 0.86); x.fillStyle = CARD_DIM; x.fillText(w.no, L, y + fs * 0.82);
    x.font = songti(fs, 400); x.fillStyle = CARD_TXT; x.fillText(w.titleCn, L + M(13), y + fs * 0.82);
    y += lh;
  }

  // 頁腳：檔期與地點
  const fy = H - M(30);
  x.strokeStyle = dim(0.26); x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(L, fy - M(11)); x.lineTo(R, fy - M(11)); x.stroke();
  x.font = songti(M(11 * MM), 700); x.fillStyle = CREAM;
  x.fillText(B.datesCn, L, fy + M(11 * MM) * 0.4);
  x.font = bask(M(9.5 * MM)); x.fillStyle = CARD_DIM;
  x.fillText(B.placeCn, L, fy + M(11 * MM) * 0.4 + M(7));
  x.textAlign = 'right';
  x.fillText(B.taglines[0] ? B.taglines[0].en : '', R, fy + M(11 * MM) * 0.4);
  x.textAlign = 'left';

  return canvasTex(c);
}

/* 入口主視覺：曲面牆的整面圖稿
   展開 8.40 × 4.20 m（正好 2:1）→ 畫布 2560 × 1280
   這是「還沒給外部圖稿」時的預設設計。
   把成品丟到 assets/title-wall.png 就會自動換掉，見 gallery/TITLE-WALL-SPEC.md。 */
let TW_CANVAS = null;
function titleWallTexture() {
  const B = DATA.brand;
  const W = 2560, H = 1280, M = W / 8.40;      // 1 m = 304.8 px
  const { c, x } = makeCanvas(W, H);
  TW_CANVAS = c;
  const m = (v) => v * M;

  const CREAM = '#F4F1E8';
  const dim = (a) => `rgba(244,241,232,${a})`;

  x.fillStyle = '#0E2B22'; x.fillRect(0, 0, W, H);

  // 淡淡的註冊十字格線——整面牆是「設計過的表面」，不是一張大海報
  x.strokeStyle = dim(0.055); x.lineWidth = 1.4;
  for (let gx = m(0.6); gx < W; gx += m(0.6)) {
    for (let gy = m(0.6); gy < H; gy += m(0.6)) {
      x.beginPath();
      x.moveTo(gx - 5, gy); x.lineTo(gx + 5, gy);
      x.moveTo(gx, gy - 5); x.lineTo(gx, gy + 5);
      x.stroke();
    }
  }
  // 板材分縫（每 1.4 m 一道）
  x.strokeStyle = dim(0.05); x.lineWidth = 2;
  for (let k = 1; k < 6; k++) { x.beginPath(); x.moveTo(m(k * 1.4), 0); x.lineTo(m(k * 1.4), H); x.stroke(); }

  // 呼應弧線的大圓弧
  x.strokeStyle = dim(0.085); x.lineWidth = 2.4;
  x.beginPath(); x.arc(m(7.2), m(4.7), m(2.6), Math.PI * 0.70, Math.PI * 1.70); x.stroke();

  const rule = (x0, y, x1, a) => { x.strokeStyle = dim(a); x.lineWidth = 2; x.beginPath(); x.moveTo(x0, y); x.lineTo(x1, y); x.stroke(); };

  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillStyle = dim(0.55);
  x.font = bask(m(0.115));
  x.fillText('THE MEOWSEUM', m(0.42), m(0.38));
  x.textAlign = 'right';
  x.fillText(B.vol.toUpperCase(), m(7.98), m(0.38));
  x.textAlign = 'left';
  rule(m(0.42), m(0.52), m(7.98), 0.26);

  // A 欄：館名
  x.fillStyle = CREAM;
  x.font = songti(m(0.88), 700);
  x.fillText(B.museumCn, m(0.42), m(1.64));
  x.font = bask(m(0.215));
  x.fillStyle = dim(0.78);
  x.fillText(B.museumEn.toUpperCase(), m(0.44), m(1.99));
  rule(m(0.42), m(2.19), m(2.92), 0.24);

  x.fillStyle = CREAM;
  x.font = bask(m(0.355));
  x.fillText(B.heroEn, m(0.42), m(2.70));
  x.font = songti(m(0.125), 400);
  x.fillStyle = dim(0.66);
  x.fillText(`${B.heroCn}　${B.attributionCn}`, m(0.42), m(2.99));
  x.font = bask(m(0.115), true);
  x.fillText(B.attributionEn, m(0.42), m(3.23));

  // B 欄：展名與宣傳語
  x.fillStyle = dim(0.9);
  x.font = songti(m(0.27), 700);
  x.fillText(B.subtitleCn, m(3.72), m(1.64));
  x.font = bask(m(0.16), true);
  x.fillStyle = dim(0.62);
  x.fillText(B.subtitleEn, m(3.74), m(1.95));

  let ty = m(2.54);
  for (const t of B.taglines) {
    x.font = songti(m(0.13), 400); x.fillStyle = dim(0.86);
    x.fillText(t.cn, m(3.72), ty);
    x.font = bask(m(0.105), true); x.fillStyle = dim(0.5);
    x.fillText(t.en, m(3.72), ty + m(0.185));
    ty += m(0.40);
  }

  // C 欄：檔期
  x.textAlign = 'right';
  x.font = bask(m(0.1)); x.fillStyle = dim(0.42);
  x.font = bask(m(0.1)); x.fillStyle = dim(0.42);
  x.fillText('DATES', m(7.98), m(2.56));
  x.font = bask(m(0.14)); x.fillStyle = dim(0.9);
  x.fillText(B.datesCn, m(7.98), m(2.82));
  x.font = songti(m(0.115), 400); x.fillStyle = dim(0.6);
  x.fillText(B.placeCn, m(7.98), m(3.08));
  x.font = bask(m(0.115)); x.fillStyle = dim(0.5);
  x.fillText(B.vol.toUpperCase(), m(7.98), m(3.34));
  x.textAlign = 'left';

  // 底部走馬燈
  rule(m(0.42), m(3.60), m(7.98), 0.2);
  const tick = 'LADY MIMI　·　A RETROSPECTIVE IN NINE LIVES　·　VOL. I　·　1486–1942　·　';
  x.save();
  x.beginPath(); x.rect(m(0.42), m(3.66), m(7.56), m(0.40)); x.clip();
  x.font = bask(m(0.1)); x.fillStyle = dim(0.38);
  const tw = x.measureText(tick).width;
  for (let tx = m(0.42); tx < W; tx += tw) x.fillText(tick, tx, m(3.94));
  x.restore();

  x.font = songti(m(0.1), 400); x.fillStyle = dim(0.3);
  x.fillText('修復還原 · 第一回', m(0.42), m(0.80));

  return canvasTex(c);
}

/* 禮品店門口的告示：白紙黑字、公文語氣，笑點全部放在內容 */
function noticeTexture() {
  const BW = 400, BH = 560;                    // 板面尺寸（mm）
  const W = 1120, H = Math.round(BH * W / BW);
  const M = (v) => v * (W / BW);
  const { c, x } = makeCanvas(W, H);
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';

  const L = M(34), R = W - M(34), width = R - L;
  let y = M(34);

  const put = (txt, font, color, lh, gap, indent) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    for (const t of wrapText(x, txt, width - (indent || 0))) {
      y += size * 0.86; x.fillText(t, L + (indent || 0), y);
      y += size * (lh - 0.86) + (gap || 0);
    }
  };

  x.font = bask(M(3.6));
  x.fillStyle = GREY2;
  x.fillText('THE MEOWSEUM', L, y + M(3.6) * 0.86);
  x.textAlign = 'right';
  x.fillText('張貼日期　兩天前', R, y + M(3.6) * 0.86);
  x.textAlign = 'left';
  y += M(3.6) * 1.1;

  y = Math.round(y) + M(9);
  x.fillStyle = RULE; x.fillRect(L, y, width, 1.5);
  y += M(22);

  put('本廳商品　暫時售罄', songti(M(20), 700), INK, 1.2, 0);
  y += M(4);
  put('Temporarily Out of Stock', bask(M(9.5)), GREY, 1.3, 0);

  y = Math.round(y) + M(11);
  x.fillStyle = RULE; x.fillRect(L, y, width, 1.5);
  y += M(11);

  const body = songti(M(6.2), 400);
  put('各位觀眾：', body, INK2, 1.95, M(3));
  put('本廳文創商品已全數售罄。原因與銷量無關。', body, GREY, 1.95, M(6));
  put('前天凌晨，Lady Mimi 小姐進入本廳，對架上商品做了一次未經預約的藝術評論。' +
      '她認為其中若干件把她畫得不像她本人，並在現場表達了明確的不滿。' +
      '本館尊重她的意見，但商品已經沒有了。', body, GREY, 1.95, M(8));

  put('受影響品項：', songti(M(6.2), 700), INK2, 1.95, M(4));
  for (const [item, why] of [
    ['冰箱貼 · 牛軋糖時期限定', '她指出那是她體重最高的一年。'],
    ['明信片 · 修復前後對照', '她拒絕對照「修復前」那一張。'],
    ['帆布袋 · 側臉', '她否認自己有側臉，說那是角度問題。'],
    ['馬克杯 · 打哈欠', '她堅持那是《喵喊》。我們同意，但杯子確實比較好賣。'],
  ]) {
    put(item, songti(M(6.2), 400), INK2, 1.95, 0, M(9));
    put(why, songti(M(5.4), 400), GREY, 1.9, M(3.4), M(9));
  }

  y += M(4);
  put('損失統計：展櫃一面、明信片兩箱、絨毛玩具若干。本館員工均安，她也非常健康。',
      body, GREY, 1.95, M(6));
  put('新一批商品已在製作中，上架前會先送她審閱。', body, GREY, 1.95, M(4));

  // 收尾短句固定貼底
  const ps = M(6.6), es = M(5.2);
  x.font = songti(ps, 700);
  const pl = wrapText(x, '她對自己的形象有很明確的意見。', width);
  x.font = bask(es, true);
  const el2 = wrapText(x, 'She has very clear opinions about her likeness.', width);
  let by = H - M(34) - el2.length * es * 1.5 - pl.length * ps * 1.9;
  x.font = songti(ps, 700); x.fillStyle = INK2;
  for (const t of pl) { by += ps * 0.86; x.fillText(t, L, by); by += ps * (1.9 - 0.86); }
  x.font = bask(es, true); x.fillStyle = GREY2;
  by += M(1.2);
  for (const t of el2) { by += es * 0.86; x.fillText(t, L, by); by += es * (1.5 - 0.86); }

  // 售罄章：壓在段落與短句之間的空白上
  const cy = by - M(58);
  x.save();
  x.translate(R - M(38), cy);
  x.rotate(-0.15);
  const sw = M(120), sh = M(58);
  x.strokeStyle = 'rgba(17,18,19,.40)';
  x.lineWidth = M(1.6); x.strokeRect(-sw, -sh / 2, sw, sh);
  x.lineWidth = M(0.5); x.strokeRect(-sw + M(3.4), -sh / 2 + M(3.4), sw - M(6.8), sh - M(6.8));
  x.fillStyle = 'rgba(17,18,19,.40)';
  x.textAlign = 'center';
  x.font = songti(M(24), 700);
  x.fillText('售罄', -sw / 2, sh / 2 - M(19));
  x.font = bask(M(10));
  x.fillText('SOLD  OUT', -sw / 2, sh / 2 - M(7));
  x.restore();
  x.textAlign = 'left';

  return canvasTex(c);
}

/* 「修復中」占位：畫還沒生成時掛這張，深綠底、白字，和廳牌同套色 */
function placeholderTexture(work, onRef) {
  const ratio = work.w / work.h;
  const H = 1400, W = Math.round(H * ratio);
  const { c, x } = makeCanvas(W, H);
  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(244,241,232,.22)'; x.lineWidth = Math.max(2, W * 0.004);
  x.strokeRect(x.lineWidth * 5, x.lineWidth * 5, W - x.lineWidth * 10, H - x.lineWidth * 10);
  x.textBaseline = 'alphabetic';

  const P = Math.min(W, H) * 0.111;
  const L = P, R = W - P, width = R - L;
  const big = Math.min(W * 0.115, H * 0.115);
  let y = P + big * 1.2;

  x.font = bask(big * 0.30); x.fillStyle = 'rgba(244,241,232,.55)';
  x.fillText('THE MEOWSEUM · RESTORATION FILE', L, P + big * 0.30);
  y = P + big * 1.5;

  x.font = songti(big, 700); x.fillStyle = CREAM;
  y += big * 0.86; x.fillText(work.titleCn, L, y); y += big * 0.5;
  x.font = bask(big * 0.42); x.fillStyle = 'rgba(244,241,232,.7)';
  y += big * 0.42 * 0.86; x.fillText(work.titleEn, L, y);

  y += big * 0.8;
  x.fillStyle = 'rgba(244,241,232,.30)'; x.fillRect(L, y, width, 2);

  y += big * 1.25;
  x.font = songti(big * 1.05, 700); x.fillStyle = CREAM;
  y += big * 1.05 * 0.86; x.fillText('修復中', L, y);
  y += big * 0.62;
  x.font = bask(big * 0.36); x.fillStyle = 'rgba(244,241,232,.55)';
  y += big * 0.36 * 0.86; x.fillText('IN RESTORATION', L, y);

  const fs = big * 0.30;
  x.font = bask(fs, true); x.fillStyle = 'rgba(244,241,232,.75)';
  x.fillText(work.after, L, H - P - fs * 2.6);
  x.fillText(work.year, L, H - P - fs * 1.2);

  x.font = songti(big * 0.24, 400); x.fillStyle = 'rgba(244,241,232,.55)';
  x.textAlign = 'right';
  x.fillText(`參考素材 ${work.ref}`, R, H - P - fs * 2.6);
  x.textAlign = 'left';

  const tex = canvasTex(c);
  if (work.refImage) {
    const im = new Image();
    im.onload = () => {
      const box = Math.min(W, H) * 0.30;
      const ih = box, iw = box * (im.width / im.height);
      const bx = R - iw, by = H - P - ih - fs * 4.2;
      x.save();
      x.beginPath(); x.rect(bx, by, iw, ih); x.clip();
      x.filter = 'saturate(.25) brightness(.85)';
      x.drawImage(im, bx, by, iw, ih);
      x.restore();
      x.strokeStyle = 'rgba(244,241,232,.35)'; x.lineWidth = 2;
      x.strokeRect(bx, by, iw, ih);
      x.filter = 'none';
      tex.needsUpdate = true;
      onRef && onRef();
    };
    im.src = work.refImage;
  }
  return tex;
}

/* 混凝土地坪：細斑點 + 大塊色差 + 2 m 一道分格線 */
function floorTexture() {
  const N = 512, { c, x } = makeCanvas(N, N);
  x.fillStyle = '#6F6A63'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 22; i++) {
    const r = 40 + Math.random() * 150, cx = Math.random() * N, cy = Math.random() * N;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const d = Math.random() < .5;
    g.addColorStop(0, d ? 'rgba(48,45,41,.13)' : 'rgba(150,145,136,.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5200; i++) {
    const v = Math.random();
    x.fillStyle = v < .5 ? `rgba(40,38,35,${.04 + Math.random() * .10})`
                         : `rgba(190,185,175,${.03 + Math.random() * .07})`;
    x.fillRect(Math.random() * N, Math.random() * N, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  x.strokeStyle = 'rgba(40,38,35,.22)'; x.lineWidth = 3;
  x.strokeRect(-1.5, -1.5, N + 3, N + 3);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function woodTexture() {
  const N = 512, { c, x } = makeCanvas(N, N);
  x.fillStyle = '#6B5844'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(${30 + Math.random() * 60},${20 + Math.random() * 40},${12 + Math.random() * 28},${.05 + Math.random() * .12})`;
    x.lineWidth = .6 + Math.random() * 2.2;
    const y0 = Math.random() * N;
    x.beginPath(); x.moveTo(0, y0);
    for (let px = 0; px <= N; px += 16) x.lineTo(px, y0 + Math.sin(px * .02 + i) * 2.4);
    x.stroke();
  }
  x.fillStyle = 'rgba(22,16,10,.30)';
  for (let i = 0; i < 6; i++) x.fillRect(0, i * (N / 6) - 1, N, 2);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function poolTexture() {
  const N = 256, { c, x } = makeCanvas(N, N);
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0.0, 'rgba(255,236,206,.85)');
  g.addColorStop(0.45, 'rgba(255,232,198,.42)');
  g.addColorStop(1.0, 'rgba(255,228,190,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return canvasTex(c);
}

function canvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ============================================================
   場景
   ============================================================ */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0c);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 220);
camera.rotation.order = 'YXZ';

/* 反射環境：一張上亮下暗的等距長方圖，經 PMREM 之後「只」給金屬用。
   這裡刻意不設 scene.environment ——
   那是全域 IBL，會把每一面牆、每一塊地板平均照亮，
   等於整間展廳自己會發光，燈怎麼調都暗不下來。
   所以改成把 envMap 指定給金框 / 內襯 / 玻璃，建築本體完全不接受 IBL。 */
const ENV = (() => {
  const { c, x } = makeCanvas(64, 128);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, '#f6f4f0');
  g.addColorStop(0.34, '#c2c7cc');
  g.addColorStop(0.50, '#6e6b66');
  g.addColorStop(1.00, '#171412');
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromEquirectangular(t).texture;
  pmrem.dispose(); t.dispose();
  return tex;
})();

const FTEX = floorTexture(), WTEX = woodTexture(), POOL = poolTexture();
FTEX.repeat.set(12, 12); WTEX.repeat.set(4, 3);

/* 展廳的建材：不吃 IBL，沒有直射光就是暗的。
   只有金屬（金框、內襯）與玻璃指定自己的反射貼圖，
   它們在暗室裡靠反射發亮，剛好變成畫作旁的一圈光澤。 */
const MATS = {
  wallA:  new THREE.MeshStandardMaterial({ color: 0xE9E5DF, roughness: 0.98, metalness: 0.0 }),
  wallB:  new THREE.MeshStandardMaterial({ color: 0xE3DCD2, roughness: 0.98, metalness: 0.0 }),
  wallC:  new THREE.MeshStandardMaterial({ color: 0x1B4033, roughness: 0.90, metalness: 0.0 }),
  ceil:   new THREE.MeshStandardMaterial({ color: 0x2F2D29, roughness: 0.99, metalness: 0.0 }),
  ceilIV: new THREE.MeshStandardMaterial({ color: 0x0E2A21, roughness: 0.99, metalness: 0.0 }),
  skirt:  new THREE.MeshStandardMaterial({ color: 0x7C7871, roughness: 0.86, metalness: 0.0 }),
  floor:  new THREE.MeshStandardMaterial({ map: FTEX, color: 0xDDD8D1, roughness: 0.64, metalness: 0.0 }),
  wood:   new THREE.MeshStandardMaterial({ map: WTEX, color: 0xDCD0C4, roughness: 0.68, metalness: 0.0 }),
  gold:   new THREE.MeshStandardMaterial({ color: 0x8A6E38, roughness: 0.34, metalness: 0.88, envMap: ENV, envMapIntensity: 1.7 }),
  fillet: new THREE.MeshStandardMaterial({ color: 0xC8A24C, roughness: 0.22, metalness: 0.95, envMap: ENV, envMapIntensity: 2.0 }),
  dark:   new THREE.MeshStandardMaterial({ color: 0x1A1C1E, roughness: 0.55, metalness: 0.35, envMap: ENV, envMapIntensity: 0.55 }),
  glass:  new THREE.MeshStandardMaterial({ color: 0x0D141A, roughness: 0.10, metalness: 0.55, envMap: ENV, envMapIntensity: 1.3 }),
  bench:  new THREE.MeshStandardMaterial({ color: 0x4B423A, roughness: 0.80, metalness: 0.0 }),
  paper:  new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.94, metalness: 0.0, emissive: 0xFFFFFF, emissiveIntensity: 0.10 }),
  pool:   new THREE.MeshBasicMaterial({ map: POOL, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending, depthWrite: false }),
  coral:  new THREE.MeshStandardMaterial({ color: 0xE8E4DC, roughness: 0.90, metalness: 0.0 }),
  merch:  new THREE.MeshStandardMaterial({ color: 0xF6F4F0, roughness: 0.90, metalness: 0.0 }),
  exit:   new THREE.MeshStandardMaterial({ color: 0x1E7A44, emissive: 0x2FBF6B, emissiveIntensity: 1.5, roughness: 0.4 }),
};

const COLLIDERS = [];   // 擋人
const OCCLUDERS = [];   // 擋視線（準心不能穿牆瞄到畫）
/* 牆上的紙：展籤 / 廳牌 / 海報。準星對著點一下，會攤平放大成一張大圖。
   跟「點畫作 → 看作品介紹」是兩件事，各走各的。 */
const SHEET = [];

function box(cx, cy, cz, sx, sy, sz, mat, opt = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), MATS[mat] || mat);
  m.position.set(cx, cy, cz);
  if (opt.ry) m.rotation.y = opt.ry;
  scene.add(m);
  if (opt.collide !== false) COLLIDERS.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
  if (opt.occlude !== false) OCCLUDERS.push(m);
  return m;
}

/* ---------------- 牆 ---------------- */
function wallPiece(alongX, fixed, s0, s1, y0, y1, matKey, collide) {
  const len = s1 - s0;
  if (len <= 1e-4 || y1 - y0 <= 1e-4) return;
  const cy = (y0 + y1) / 2, ch = y1 - y0, cm = (s0 + s1) / 2;
  const m = alongX
    ? box(cm, cy, fixed, len, ch, T, matKey, { collide })
    : box(fixed, cy, cm, T, ch, len, matKey, { collide });
  if (y0 === 0) {                       // 踢腳板
    const sd = 0.038, sh = 0.135, half = T / 2 + sd / 2 - 0.004;
    for (const s of [1, -1]) {
      if (alongX) box(cm, sh / 2, fixed + s * half, len, sh, sd, 'skirt', { collide: false });
      else        box(fixed + s * half, sh / 2, cm, sd, sh, len, 'skirt', { collide: false });
    }
  }
  return m;
}

for (const w of WALLS) {
  const alongX = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const fixed = alongX ? w.a[1] : w.a[0];
  const c0 = alongX ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const c1 = alongX ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const ops = (w.openings || []).slice().sort((p, q) => p[0] - q[0]);
  let cur = c0;
  for (const [o0, o1] of ops) {
    wallPiece(alongX, fixed, cur, o0, 0, w.h, w.mat, true);
    wallPiece(alongX, fixed, o0, o1, DOOR, w.h, w.mat, false);   // 門楣
    cur = Math.max(cur, o1);
  }
  wallPiece(alongX, fixed, cur, c1, 0, w.h, w.mat, true);
}

/* 地坪 / 天花板 */
for (const [k, r] of Object.entries(ROOMS)) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const fl = box(cx, -0.05, cz, w, 0.1, d, k === 'IV' ? 'wood' : 'floor', { collide: false });
  fl.material = (k === 'IV' ? MATS.wood.clone() : MATS.floor.clone());
  if (k === 'IV') fl.material.map = WTEX.clone();
  else { fl.material.map = FTEX.clone(); fl.material.map.repeat.set(w / 2, d / 2); }
  fl.material.map.needsUpdate = true;
  box(cx, r.h + 0.05, cz, w, 0.1, d, k === 'IV' ? 'ceilIV' : 'ceil', { collide: false });
}
for (const p of PASSAGES) {
  const w = p.x1 - p.x0, d = Math.abs(p.z1 - p.z0), cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
  box(cx, p.y + 0.05, cz, w, 0.1, d, 'ceil', { collide: false });
  const pf = box(cx, -0.05, cz, w, 0.1, d, 'floor', { collide: false });
  pf.material = MATS.floor.clone();
  pf.material.map = FTEX.clone();
  pf.material.map.repeat.set(w / 2, d / 2);
  pf.material.map.needsUpdate = true;
}

/* ---------------------------------------------------------------
   照壁：立在門洞正後方的一道獨立板牆
   四個門洞對成一直線，站在大廳就能一眼看穿到第二展廳的長凳；
   第一展廳於是變成一條走道，而不是一個展廳。這道牆把軸線收在
   Room I 的門口，人得繞過去才進得了展廳；碑面同時是整檔展覽的第一句話。
   3.00 × 3.10 × 0.24 m，兩側各留 5.5 m 可以繞。
   --------------------------------------------------------------- */
const SCREEN = { z: -6.45, hw: 1.50, h: 3.10, th: 0.24 };
{
  const S = SCREEN;
  box(0, S.h / 2, S.z, S.hw * 2, S.h, S.th, 'wallA');
  for (const s of [1, -1]) {
    box(0, 0.0675, S.z + s * (S.th / 2 + 0.019), S.hw * 2, 0.135, 0.038, 'skirt', { collide: false });
  }
  box(0, S.h + 0.045, S.z, S.hw * 2 + 0.20, 0.09, S.th + 0.20, 'dark', { collide: false });

  /* 碑面：淺灰底、墨字、橫排。整個展覽就從這一句開始，所以不掛廳名、
     不標年代、不畫分隔線——只有一句話，其餘交給留白。
     館名與卷次收在底部一行小字，像封面的副標；右下角一枚朱紅小印。
     板面 2.90 × 3.00 m → 畫布 1200 × 1240，1 px ≈ 2.4 mm。 */
  {
    const W = 1200, H = 1240;
    const INK = '#111213';
    const { c, x } = makeCanvas(W, H);
    x.fillStyle = '#C7C4BE'; x.fillRect(0, 0, W, H);
    x.strokeStyle = INK; x.globalAlpha = 0.13; x.lineWidth = 2;
    x.strokeRect(30, 30, W - 60, H - 60);        // 極淡的內框：讓板面讀得出是一件「物件」
    x.globalAlpha = 1;
    x.textBaseline = 'middle';

    const MAIN = '歡迎光臨';                      // 換句子只要改這一行，級數會自己重算
    x.textAlign = 'center';
    x.font = songti(150, 700);
    const size = Math.min(232, 150 * (W * 0.80 / x.measureText(MAIN).width));
    x.font = songti(size, 700); x.fillStyle = INK;
    x.fillText(MAIN, W / 2, H * 0.44);

    x.textAlign = 'left';
    x.font = bask(28); x.fillStyle = INK; x.globalAlpha = 0.55; x.letterSpacing = '5px';
    x.fillText('THE MEOWSEUM  ·  VOL. I  ·  1486 – 1942', 96, H - 140);
    x.letterSpacing = '0px'; x.globalAlpha = 1;

    x.fillStyle = '#9E2B25';                      // 全館唯一的朱紅
    x.fillRect(W - 172, H - 178, 76, 76);
    x.textAlign = 'center'; x.fillStyle = '#F4F1E8'; x.font = songti(28, 700);
    x.fillText('喵', W - 134, H - 154); x.fillText('術', W - 134, H - 122);

    const tex = canvasTex(c);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(S.hw * 2 - 0.10, S.h - 0.10),
      new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.96, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.05 }));
    face.position.set(0, S.h / 2, S.z + S.th / 2 + 0.006);
    scene.add(face);
  }

  /* 洗牆燈：只有一顆，光暈落在碑面上，地上留一點餘光 */
  const wash = new THREE.SpotLight(0xFFEFD6, 15, 10, 0.58, 0.80, 1.4);
  wash.position.set(0, 4.45, -5.20);
  wash.target.position.set(0, 1.45, S.z - 0.20);
  scene.add(wash, wash.target);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), MATS.pool.clone());
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.012, S.z + 1.55);
  scene.add(pool);
}

/* 入口玻璃門 */
box(0, 1.75, 12 - T / 2 + 0.02, 5.4, 3.5, 0.06, 'glass', { collide: false });
for (const x of [-2.7, -0.9, 0.9, 2.7]) box(x, 1.75, 12 - T / 2 + 0.06, 0.07, 3.5, 0.05, 'dark', { collide: false });
box(0, 3.56, 12 - T / 2 + 0.06, 5.6, 0.12, 0.06, 'dark', { collide: false });

/* ---------------------------------------------------------------
   入口主視覺：一面弧形的獨立大牆
   弦長 8.00 m、矢高 1.12 m、半徑 7.70 m → 展開 8.40 m × 4.20 m（正好 2:1）
   內凹向入口，人一走進來會被它包住；兩端各留 1.3 m 走道繞過去。
   --------------------------------------------------------------- */
const TW = (() => {
  const R = 7.70, T = 0.18, H = 4.20, CHORD = 8.00, ZMID = 3.60;
  const TH = Math.asin(CHORD / 2 / R);            // 半角 31.31°
  return { R, T, H, CHORD, ZMID, TH, ZC: ZMID + R, ARC: 2 * R * TH, Y0: 0 };
})();
TW.ASPECT = TW.ARC / TW.H;

const TW_ART = (DATA.titleWall && DATA.titleWall.image) || null;

{
  const g = new THREE.Group();
  g.position.set(0, 0, TW.ZC);
  scene.add(g);

  const seg = Math.max(56, Math.round(TW.ARC * 9));
  const thetaStart = Math.PI - TW.TH, thetaLen = 2 * TW.TH;

  // 正面：整面圖稿
  const faceTex = TW_ART
    ? new THREE.TextureLoader().load(TW_ART, () => hideLoader())
    : titleWallTexture();
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 8;

  const faceGeo = new THREE.CylinderGeometry(TW.R, TW.R, TW.H, seg, 1, true, thetaStart, thetaLen);
  {
    const uv = faceGeo.attributes.uv;                 // 從入口看過去才不會左右相反
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  }
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({
    map: faceTex, side: THREE.BackSide, roughness: 0.93, metalness: 0.0,
    emissive: 0xFFFFFF, emissiveMap: faceTex, emissiveIntensity: 0.07,
  }));
  face.position.y = TW.H / 2;
  g.add(face);

  // 背面：白牆
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(TW.R + TW.T, TW.R + TW.T, TW.H, seg, 1, true, thetaStart, thetaLen),
    MATS.wallA);
  back.position.y = TW.H / 2;
  g.add(back);

  // 上下封邊
  const ringStart = -Math.PI / 2 - TW.TH;
  for (const y of [0, TW.H]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TW.R, TW.R + TW.T, seg, 1, ringStart, 2 * TW.TH),
      new THREE.MeshStandardMaterial({ color: 0x4A473F, roughness: 0.96, side: THREE.DoubleSide }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }

  // 兩端封邊
  for (const sgn of [-1, 1]) {
    const th = Math.PI + sgn * TW.TH;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, TW.H, TW.T + 0.03), MATS.wallA);
    cap.position.set(Math.sin(th) * (TW.R + TW.T / 2), TW.H / 2, Math.cos(th) * (TW.R + TW.T / 2));
    cap.rotation.y = th;
    g.add(cap);
  }

  // 遮蔽：準心的射線要打在牆上，不然隔著曲面牆就能瞄到第一展廳的畫
  for (const m of g.children) if (m.isMesh) OCCLUDERS.push(m);

  // 碰撞：沿弧線切成一串小方塊，才不會把人擋在弧的外面
  const N = 36;
  for (let i = 0; i < N; i++) {
    const t0 = Math.PI - TW.TH + 2 * TW.TH * (i / N);
    const t1 = Math.PI - TW.TH + 2 * TW.TH * ((i + 1) / N);
    const xs = [], zs = [];
    for (const t of [t0, t1]) for (const rr of [TW.R, TW.R + TW.T]) {
      xs.push(rr * Math.sin(t)); zs.push(TW.ZC + rr * Math.cos(t));
    }
    COLLIDERS.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
  }
}

/* 洗牆：四顆投射燈打在弧面上，加一條跟著弧走的軌道 */
{
  const pt = (f) => {
    const th = Math.PI + (f - 0.5) * 2 * TW.TH;
    return new THREE.Vector3(Math.sin(th) * TW.R, 0, TW.ZC + Math.cos(th) * TW.R);
  };
  for (let i = 0; i < 4; i++) {
    const tgt = pt((i + 0.5) / 4);
    const fp = new THREE.Vector3(tgt.x, 4.55, tgt.z + 2.30);

    const sp = new THREE.SpotLight(0xFFF0D8, 120, 15, 0.62, 0.80, 1.36);
    sp.position.copy(fp);
    sp.target.position.set(tgt.x, 2.05, tgt.z);
    scene.add(sp, sp.target);

    const th = Math.atan2(tgt.x, tgt.z - TW.ZC);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 2.35), MATS.dark);
    rail.position.copy(fp).setY(4.63);
    rail.rotation.y = th;
    scene.add(rail);

    const dir = new THREE.Vector3().subVectors(sp.target.position, fp).normalize();
    const can = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.066, 0.20, 16), MATS.dark);
    tube.position.y = -0.10;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.054, 16), new THREE.MeshBasicMaterial({ color: 0xFFEFD8 }));
    lens.position.y = -0.20; lens.rotation.x = -Math.PI / 2;
    can.add(tube, lens);
    can.position.copy(fp);
    can.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    scene.add(can);
  }
}

/* 大廳服務台 */
box(4.55, 0.50, 9.4, 1.9, 1.00, 0.58, 'coral', { collide: true });
box(4.55, 1.02, 9.4, 2.0, 0.045, 0.66, 'bench', { collide: false });
box(3.90, 1.10, 9.4, 0.22, 0.14, 0.15, 'paper', { collide: false });

/* ---------------- 作品上牆 ---------------- */
const ROOM_OF = (n) => Object.values(ROOMS).find((r) => r.room === n);
const WORK_GROUPS = [];
const WORK_LOOK = {};   // slug → { pos, normal, h }

function orient(n) { return Math.atan2(n.x, n.z); }

function buildWork(work, hang) {
  const r = ROOM_OF(hang.room);
  let pos, n;
  if (hang.wall === 'N') { pos = new THREE.Vector3(hang.at, 0, r.z0 + T / 2); n = new THREE.Vector3(0, 0, 1); }
  else if (hang.wall === 'S') { pos = new THREE.Vector3(hang.at, 0, r.z1 - T / 2); n = new THREE.Vector3(0, 0, -1); }
  else if (hang.wall === 'W') { pos = new THREE.Vector3(r.x0 + T / 2, 0, hang.at); n = new THREE.Vector3(1, 0, 0); }
  else { pos = new THREE.Vector3(r.x1 - T / 2, 0, hang.at); n = new THREE.Vector3(-1, 0, 0); }

  const w = work.w, h = work.h;
  const bottomY = h > 1.70 ? 1.02 : (h > 1.00 ? 1.10 : 1.32);
  const cy = bottomY + h / 2;
  pos.y = cy;
  WORK_LOOK[work.slug] = { pos: pos.clone(), normal: n.clone(), h, w, cy };

  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = orient(n);
  g.userData.slug = work.slug;
  g.userData.room = work.room;
  scene.add(g);
  WORK_GROUPS.push(g);

  const fw = THREE.MathUtils.clamp(0.052 + Math.min(w, h) * 0.06, 0.058, 0.145);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - fw, -h / 2 - fw); shape.lineTo(w / 2 + fw, -h / 2 - fw);
  shape.lineTo(w / 2 + fw, h / 2 + fw); shape.lineTo(-w / 2 - fw, h / 2 + fw); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, -h / 2); hole.lineTo(w / 2, -h / 2);
  hole.lineTo(w / 2, h / 2); hole.lineTo(-w / 2, h / 2); hole.closePath();
  shape.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.105, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.009, bevelSegments: 2, curveSegments: 1,
  }), MATS.gold);
  frame.position.z = 0.012;
  g.add(frame);

  const f2 = fw * 0.42;
  const sh2 = new THREE.Shape();
  sh2.moveTo(-w / 2 - f2, -h / 2 - f2); sh2.lineTo(w / 2 + f2, -h / 2 - f2);
  sh2.lineTo(w / 2 + f2, h / 2 + f2); sh2.lineTo(-w / 2 - f2, h / 2 + f2); sh2.closePath();
  const h2 = new THREE.Path();
  h2.moveTo(-w / 2, -h / 2); h2.lineTo(w / 2, -h / 2); h2.lineTo(w / 2, h / 2); h2.lineTo(-w / 2, h / 2); h2.closePath();
  sh2.holes.push(h2);
  const fillet = new THREE.Mesh(new THREE.ExtrudeGeometry(sh2, { depth: 0.02, bevelEnabled: false, curveSegments: 1 }), MATS.fillet);
  fillet.position.z = 0.112;
  g.add(fillet);

  let art;
  if (work.image) {
    const tex = new THREE.TextureLoader().load(work.image, () => hideLoader());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    art = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.74, metalness: 0.0 }));
  } else {
    art = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: placeholderTexture(work, hideLoader), roughness: 0.92, metalness: 0.0 }));
  }
  art.position.z = 0.058;
  g.add(art);

  // 展簽：掛在畫框「右側」，不是正下方
  // 正下方會被畫框的投影與燈的邊緣切掉，站在畫前面根本讀不到；
  // 移到右邊、抬到視線高度，順便落進燈池裡。
  const LW = 0.420, LH = 0.297;                    // A3 橫版
  const labTex = labelTexture(work);
  const labX = w / 2 + fw + 0.150 + LW / 2;        // 跟畫框拉開 15 cm
  const labY = -(h / 2 + fw) + LH / 2;              // 底邊與畫框下沿齊平
  const labBack = new THREE.Mesh(new THREE.PlaneGeometry(LW + 0.018, LH + 0.018),
    new THREE.MeshStandardMaterial({ color: 0x14161A, roughness: 0.82, metalness: 0.0 }));
  labBack.position.set(labX, labY, 0.002);
  g.add(labBack);

  const lab = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH),
    new THREE.MeshStandardMaterial({
      map: labTex, roughness: 0.9, metalness: 0.0,
      emissive: 0xFFFFFF, emissiveMap: labTex, emissiveIntensity: 0.42,
    }));
  lab.position.set(labX, labY, 0.008);
  g.add(lab);
  g.userData.label = lab;
  SHEET.push({ mesh: lab, room: work.room, cap: `NO. ${work.no} · 展籤 · Wall Label`, short: '看展籤' });

  // 牆面上的光暈（燈打得亮，離畫越遠越暗）
  const pw = w * 2.2 + 2.1, ph = h * 2.0 + 1.7;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), MATS.pool.clone());
  pool.position.set(0, h * 0.10, 0.004);
  g.add(pool);

  return { work, g, pos, n, cy };
}

const BUILT = [];
for (const work of DATA.works) {
  const hang = HANG[work.no];
  if (!hang) continue;
  BUILT.push(buildWork(work, hang));
}

/* ============================================================
   照明 ── 全館只有「打在作品上」的燈
   ------------------------------------------------------------
   1. 建築本身幾乎不吃 IBL（見 MATS 的低 envMapIntensity），所以牆、
      地、天花在沒有直射光的地方就是暗的，房間不會自己發亮。
   2. 環境光只負責把暗部從純黑拉起來一點點，不做照明用。
   3. 每一件作品、每一面說明牆都有自己的投射燈，光暈只落在它身上。
   ============================================================ */
scene.add(new THREE.AmbientLight(0xB9B2A6, 0.065));
scene.add(new THREE.HemisphereLight(0xC8D2DA, 0x2A2620, 0.12));

/* 軌道燈具：一根軌道 + 一顆燈頭，方向由 from → to 決定 */
function trackLamp(from, to, railLen) {
  const dir = new THREE.Vector3().subVectors(to, from).normalize();

  const along = new THREE.Vector3(-dir.z, 0, dir.x);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, railLen), MATS.dark);
  rail.position.copy(from).setY(from.y + 0.15);
  rail.rotation.y = orient(along);
  scene.add(rail);

  const can = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.19, 16), MATS.dark);
  tube.position.y = -0.095;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16),
    new THREE.MeshBasicMaterial({ color: 0xFFEFD8 }));
  lens.position.y = -0.19; lens.rotation.x = -Math.PI / 2;
  can.add(tube, lens);
  can.position.copy(from);
  can.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  scene.add(can);
}

const SPOT_I = 66;
for (const b of BUILT) {
  const { pos, n } = { pos: b.pos, n: b.n };
  const ceil = ROOM_OF(HANG[b.work.no].room).h;
  const fp = new THREE.Vector3().copy(pos).addScaledVector(n, 1.95);
  fp.y = ceil - 0.24;

  const spot = new THREE.SpotLight(0xFFE4BE, SPOT_I, 16, 0.62, 0.84, 1.44);
  spot.position.copy(fp);
  spot.target.position.copy(pos);
  scene.add(spot, spot.target);

  trackLamp(fp, pos, b.work.w + 1.5);
}

// 展廳只剩一點點「看得見路」的餘光，不構成照明
for (const [k, r] of Object.entries(ROOMS)) {
  if (k === 'IV') continue;
  const p = new THREE.PointLight(0xFFF3E2, 4.2, 26, 1.7);
  p.position.set((r.x0 + r.x1) / 2, r.h - 1.4, (r.z0 + r.z1) / 2);
  scene.add(p);
}
// 走道補光，不然門洞看過去是一條黑帶
for (const p of PASSAGES) {
  const l = new THREE.PointLight(0xFFF1DE, 3.6, 11, 1.6);
  l.position.set((p.x0 + p.x1) / 2, p.y - 0.35, (p.z0 + p.z1) / 2);
  scene.add(l);
}
// 禮品店：還是要能挑東西，但底光只留到剛好看見貨架
{
  const p = new THREE.PointLight(0xFFE2B8, 34, 24, 1.6);
  p.position.set(16, 3.0, -48);
  scene.add(p);
  for (const [x, z] of [[13.2, -46], [19.2, -52]]) {
    const sp = new THREE.SpotLight(0xFFE7C6, 62, 14, 0.74, 0.84, 1.5);
    sp.position.set(x, 3.25, z);
    sp.target.position.set(x, 0.2, z);
    scene.add(sp, sp.target);
  }
}

/* ---------------- 廳牌 ---------------- */
function surfacePoint(roomKey, wall, at) {
  const r = ROOMS[roomKey];
  if (wall === 'N') return { p: new THREE.Vector3(at, 0, r.z0 + T / 2), n: new THREE.Vector3(0, 0, 1) };
  if (wall === 'S') return { p: new THREE.Vector3(at, 0, r.z1 - T / 2), n: new THREE.Vector3(0, 0, -1) };
  if (wall === 'W') return { p: new THREE.Vector3(r.x0 + T / 2, 0, at), n: new THREE.Vector3(1, 0, 0) };
  return { p: new THREE.Vector3(r.x1 - T / 2, 0, at), n: new THREE.Vector3(-1, 0, 0) };
}

function mountCard(roomKey, wall, at, y, tex, w, h, cap) {
  const { p, n } = surfacePoint(roomKey, wall, at);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, metalness: 0.0,
      emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.10,
    }));
  m.position.set(p.x + n.x * 0.013, y, p.z + n.z * 0.013);
  m.rotation.y = orient(n);
  scene.add(m);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false }));
  shadow.position.set(p.x + n.x * 0.006, y - 0.005, p.z + n.z * 0.006);
  shadow.rotation.y = orient(n);
  scene.add(shadow);
  m.userData.n = n;
  if (cap) SHEET.push({ mesh: m, room: roomKey, cap, short: '看這張' });
  return m;
}
const CARD_MESH = {};

const CARD_AT = {
  I:   { wall: 'W', at: -6.9 },
  II:  { wall: 'W', at: -25.9 },
  III: { wall: 'E', at: -45.3 },
  IV:  { wall: 'E', at: -48.2 },
};
for (const room of DATA.rooms) {
  const c = CARD_AT[room.numeral];
  if (!c) continue;
  const ws = DATA.works.filter((w) => w.room === room.numeral);
  CARD_MESH[room.numeral] = mountCard(room.numeral, c.wall, c.at, 1.62, roomCardTexture(room, ws), 0.841, 1.189,
      `ROOM ${room.numeral} · 廳牌 · ${room.nameCn}`);

  // 說明牆跟作品一樣有自己的一盞燈：光只落在這張廳牌上。
  const { p, n } = surfacePoint(room.numeral, c.wall, c.at);
  const fp = new THREE.Vector3(p.x + n.x * 1.85, ROOMS[room.numeral].h - 0.30, p.z + n.z * 1.85);
  const sp = new THREE.SpotLight(0xFFEFD6, 60, 13, 0.60, 0.84, 1.42);
  sp.position.copy(fp);
  sp.target.position.set(p.x, 1.55, p.z);
  scene.add(sp, sp.target);
  trackLamp(fp, sp.target.position, 1.75);
}

/* 內容海報：貼在大廳通往 Room I 的牆上，門洞兩側各一張。
   這裡是「走過主視覺牆之後」的下一眼，所以放的是館內到底展了什麼。 */
{
  const POSTER = { w: 1.190, h: 1.682, y: 1.88, at: [-3.50, 3.50] };   // 約 A0 的兩倍

  const tex = posterTexture();
  POSTER.at.forEach((at, i) => {
    const m = mountCard('hall', 'N', at, POSTER.y, tex, POSTER.w, POSTER.h,
      'THE MEOWSEUM · VOL. I · 展覽內容海報');
    CARD_MESH['poster' + i] = m;

    const { p, n } = surfacePoint('hall', 'N', at);
    const fp = new THREE.Vector3(p.x + n.x * 2.70, ROOMS.hall.h - 0.30, p.z + n.z * 2.70);
    const sp = new THREE.SpotLight(0xFFEFD6, 82, 15, 0.34, 0.86, 1.42);
    sp.position.copy(fp);
    sp.target.position.set(p.x, POSTER.y, p.z);
    scene.add(sp, sp.target);
    trackLamp(fp, sp.target.position, 2.10);
  });
}

/* ---------------- 家具 ---------------- */
for (const [x, z] of [[0, -32], [0, -52]]) {
  box(x, 0.21, z, 0.09, 0.42, 0.44, 'dark', { collide: false });
  box(x - 0.92, 0.21, z, 0.09, 0.42, 0.44, 'dark', { collide: false });
  box(x + 0.92, 0.21, z, 0.09, 0.42, 0.44, 'dark', { collide: false });
  box(x, 0.44, z, 2.40, 0.065, 0.50, 'bench', { collide: false });
  COLLIDERS.push({ x0: x - 1.2, x1: x + 1.2, z0: z - 0.25, z1: z + 0.25 });
}

/* 禮品店 */
box(15.6, 0.50, -41.5, 3.2, 1.00, 0.70, 'coral', { collide: true });
box(15.6, 1.02, -41.5, 3.3, 0.05, 0.80, 'dark', { collide: false });
box(14.4, 1.12, -41.5, 0.34, 0.16, 0.22, 'merch', { collide: false });

for (const y of [1.02, 1.50, 1.98, 2.46]) {
  box(16, y, -55.70, 7.2, 0.045, 0.32, 'merch', { collide: false });
  for (let i = 0; i < 7; i++)
    box(12.9 + i * 1.05, y + 0.09, -55.68, 0.20, 0.13, 0.05,
      i % 3 === 0 ? 'dark' : 'merch', { collide: false });
}
for (const x of [12.6, 16, 19.4]) box(x, 1.4, -55.7, 0.06, 2.8, 0.36, 'dark', { collide: true });

box(13.5, 0.42, -50, 1.7, 0.06, 0.95, 'bench', { collide: true });
for (const [dx, dz] of [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]])
  box(13.5 + dx, 0.20, -50 + dz, 0.06, 0.40, 0.06, 'dark', { collide: false });
for (let i = 0; i < 4; i++) box(13.1 + i * 0.28, 0.47, -50, 0.22, 0.03, 0.32, 'paper', { collide: false });

box(9.80, 3.62, -47.5, 0.10, 0.24, 0.66, 'exit', { collide: false });   // 掛在門楣上，不要浮在門洞中間

/* 禮品店門口的告示架：底座 + 立柱 + 斜面板，板上夾一張 A 字級的白紙 */
{
  /* 位置有兩個條件：
     1) 要在店裡、不能出現在門洞的視線上。站在 Room III（x < 8）往東看時，
        視線切過 x = 10 的落點必須落在門洞南側的牆面（z > -46.3），
        所以告示要往門的右手邊、靠南一點擺，才不會被看成「還放在上一廳」。
     2) 一進門（往 +x 走）往右一看就要看到它，所以貼著門內側、斜朝門口。
     以 (11.95, -45.05) 為例：從 (7.5, -47.5) 看過去，視線在 x = 10 的落點
     是 z ≈ -46.12，被門南側那道牆擋住；人一站進門就整個露出來。 */
  const NX = 11.95, NZ = -45.05, RY = -2.02;
  const g = new THREE.Group();
  g.position.set(NX, 0, NZ);
  g.rotation.y = RY;
  scene.add(g);

  const part = (w, h, d, px, py, pz, mat, tilt) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MATS[mat]);
    m.position.set(px, py, pz);
    if (tilt) m.rotation.x = tilt;
    g.add(m);
    OCCLUDERS.push(m);
    return m;
  };

  const TILT = -0.13;
  part(0.42, 0.035, 0.30, 0, 0.018, 0, 'dark');            // 底座
  part(0.045, 0.88, 0.045, 0, 0.475, -0.02, 'dark');       // 立柱
  part(0.46, 0.64, 0.022, 0, 1.20, 0.03, 'dark', TILT);    // 背板

  const tex = noticeTexture();
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.575), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.2,
    emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.05,
  }));
  paper.position.set(0, 1.20, 0.058);
  paper.rotation.x = TILT;
  g.add(paper);
  SHEET.push({ mesh: paper, room: 'IV', cap: '告示 · Notice', short: '看告示' });

  COLLIDERS.push({ x0: NX - 0.28, x1: NX + 0.28, z0: NZ - 0.28, z1: NZ + 0.28 });

  // 告示燈：店裡的底光只夠看見貨架，這張不補光會讀不到
  const fn = new THREE.Vector3(Math.sin(RY), 0, Math.cos(RY));   // 告示正面朝向
  const sp = new THREE.SpotLight(0xFFEFD6, 19, 7, 0.62, 0.85, 1.5);
  sp.position.set(NX + fn.x * 0.62, 2.50, NZ + fn.z * 0.62);
  sp.target.position.set(NX, 1.20, NZ);
  scene.add(sp, sp.target);
}
box(22 - T / 2 - 0.02, 1.5, -53.5, 0.04, 1.1, 0.8, 'merch', { collide: false });

/* ============================================================
   第一展廳的牆上投影
   ------------------------------------------------------------
   東牆（x = -7）整片留白，拿來當投影面：一台吊在天花板上的投影機，
   把 Lady Mimi 自己的話一句一句打在牆上。

   手法：開場把六句話各畫成一張 canvas 貼圖，之後不動 canvas 也不動貼圖，
   打字機效果全在 fragment shader 裡做——一條由左往右掃的前緣，
   左邊的字清楚、右邊還沒出現，前緣附近用 5 tap 抽樣糊掉。
   換場是反過來掃：舊句從左邊被擦掉，新句跟著補上。

   投影不接 TrackLamp，也不進 SHEET / COLLIDERS：它是光，不是紙，也不是牆。
   ============================================================ */
const PROJ_PHRASES = [
  { cn: '我不是被畫進去的。',       en: 'I was not painted in. I was always here.', i: 'I' },
  { cn: '我沒有在看你。',           en: 'I am not looking at you.',                 i: 'II' },
  { cn: '這面牆本來是空的。',       en: 'This wall used to be blank.',              i: 'III' },
  { cn: '把我掛在這裡是可以的。',   en: 'Hanging me here is acceptable.',           i: 'IV' },
  { cn: '我不會說謝謝。',           en: 'I will not say thank you.',                i: 'V' },
  { cn: '你可以繼續看。',           en: 'You may keep looking.',                    i: 'VI' },
];

/* 牆有多大，畫布就長什麼樣（1.8 MP，牆上約 3.1 mm / px） */
const PROJ = {
  W: 6.40, H: 2.75, X: -6.855, Z: -13.60, Y: 2.62,
  CW: 2048, CH: 880,              // 2.33:1，跟牆面同一組比例
  SAFE_W: 0.82,                   // 版面不超過畫布的比例（六句都收成一行）
  HOLD: [4.0, 5.6],               // 停留秒數範圍（每輪抽一次，節奏才不會死板）
  FADE: 1.50,                     // 換場秒數
  REVEAL: 0.46,                   // 打字機掃過版面的速度（版面寬度／秒）
  LEAD: 0.36,                     // 軟開場：字還沒開始打就先亮起來
};

/* 六句話各一張貼圖：置中的一句話，上面一條索引，下面一行小字英文。
   打字機的前緣是垂直掃的，所以會換行的句子會變成「先打完第一行再打第二行」，
   讀起來剛好就是斷句。 */
function projTexture(phrase) {
  const { c, x } = makeCanvas(PROJ.CW, PROJ.CH);
  const W = PROJ.CW, H = PROJ.CH;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';

  const maxW = W * PROJ.SAFE_W;
  // 一律收成一行：打字機是橫著掃的，換行的句子前緣會一次打在兩行上，
  // 掃過去會變成「兩行一起長出來」，不像打字。所以先量寬度再定字級。
  let fs = Math.round(H * 0.26);
  for (;;) {
    x.font = songti(fs, 700);
    if (x.measureText(phrase.cn).width <= maxW || fs <= 40) break;
    fs = Math.round(fs * 0.94);
  }
  const lines = [phrase.cn];
  const lh = fs * 1.22;
  const es = Math.round(H * 0.055);
  const gap = H * 0.11;                       // 主句與小字之間
  const total = lines.length * lh + gap + es * 0.92;
  let y = H / 2 - total / 2 + fs * 0.80;

  // 索引：主句上方一段距離，兩側各一條短線
  const ry = y - fs * 1.55;
  x.font = bask(Math.round(H * 0.034), true);
  x.fillStyle = 'rgba(242,234,216,.42)';
  x.fillText(phrase.i, W / 2, ry);
  const rw = W * 0.052, rg = x.measureText(phrase.i).width / 2 + W * 0.022;
  x.strokeStyle = 'rgba(242,234,216,.22)';
  x.lineWidth = Math.max(1, H * 0.0012);
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(W / 2 + s * rg, ry - H * 0.011);
    x.lineTo(W / 2 + s * (rg + rw), ry - H * 0.011);
    x.stroke();
  }

  x.font = songti(fs, 700);
  x.fillStyle = '#F2EAD8';
  x.shadowColor = 'rgba(255,238,205,.55)';
  x.shadowBlur = H * 0.030;                   // 一點點暈開，像是打在牆上的光
  for (const t of lines) { x.fillText(t, W / 2, y); y += lh; }
  x.shadowBlur = 0;

  x.font = bask(es, true);
  x.fillStyle = 'rgba(232,222,200,.58)';
  x.fillText(phrase.en, W / 2, y + gap * 0.20 + es * 0.60);

  return canvasTex(c);
}

/* 投影機打出來的那一小片亮：四周羽化，像光不像貼紙。
   逐點算 alpha 而不是用 canvas 的 blur filter——每個瀏覽器濾鏡品質不一，
   這裡要的是一塊邊緣確定會溶掉的長方形。 */
function projPoolTexture() {
  const W = 512, H = 224, { c, x } = makeCanvas(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const FX = 0.10, FY = 0.16;                    // 從邊緣算起的羽化比例
  const sm = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1), v = j / (H - 1);
      const a = sm(u / FX) * sm((1 - u) / FX) * sm(v / FY) * sm((1 - v) / FY);
      const o = (j * W + i) * 4;
      d[o] = 255; d[o + 1] = 242; d[o + 2] = 220;
      d[o + 3] = Math.round(255 * a * a);        // 平方一次，中心才不會一片平
    }
  }
  x.putImageData(img, 0, 0);
  return canvasTex(c);
}

/* 打字機＋模糊。
   文字與小字都在同一張貼圖裡，所以用 vUv.x 掃：左邊 u 小（先出現）。
   前緣用 smoothstep 給 0.055 的軟邊（版面約 35 cm，前緣不會是一刀切），
   再按 (前緣 − u) 抽樣 5 個點糊掉在那道邊上；字本身夠大，
   5 個點還不足以讓它認不出來。

   一塊平面同時吃 uFwd / uRev 這兩個前緣：
   平常 uFwd 從 0 掃到 1（新句打出來，uRev 停在 0）；
   換場時 uRev 從 0 掃到 1，把舊句從左邊擦掉，uFwd 再從頭打一次新句。
   交集的結果就是「舊句被擦掉、新句跟著補上」。
   全程只改這兩個 uniform。 */

const PROJ_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const PROJ_FRAG = `
uniform sampler2D tMap;
uniform float uFwd, uRev, uOpacity, uOn, uGlow;
varying vec2 vUv;
void main() {
  float edge = 0.040;
  float blank = 1.0 - smoothstep(uFwd, uFwd + edge, vUv.x);
  float gone  = smoothstep(uRev, uRev + edge, vUv.x);
  float m = blank * gone;
  float w = smoothstep(0.0, edge, uFwd - vUv.x);
  vec2 px = vec2(2.0 / 2048.0, 0.0);
  vec4 t = texture2D(tMap, vUv) * 0.44
         + texture2D(tMap, vUv + px * w) * 0.14
         + texture2D(tMap, vUv - px * w) * 0.14
         + texture2D(tMap, vUv + px * 2.0 * w) * 0.14
         + texture2D(tMap, vUv - px * 2.0 * w) * 0.14;
  gl_FragColor = vec4(t.rgb * uGlow, t.a * m * uOpacity * uOn);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PROJ_TEX = PROJ_PHRASES.map(projTexture);
const PROJ_N = new THREE.Vector3(1, 0, 0);        // 東牆內面朝 +x

/* 亮的先畫、字的後畫；同一點上三塊都開 depthWrite:false，靠 renderOrder 分先後 */
{
  const wallX = -7 + T / 2;                       // 內牆面 -6.86
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(PROJ.W, PROJ.H),
    new THREE.MeshBasicMaterial({
      map: projPoolTexture(), transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  pool.position.set(wallX + 0.005, PROJ.Y, PROJ.Z);
  pool.rotation.y = orient(PROJ_N);
  pool.renderOrder = 1;
  scene.add(pool);
}

const PROJ_PLANE = [];
for (const k of [0, 1]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PROJ.W, PROJ.H),
    new THREE.ShaderMaterial({
      vertexShader: PROJ_VERT, fragmentShader: PROJ_FRAG,
      uniforms: {
        tMap: { value: PROJ_TEX[k] },
        uFwd: { value: 0 }, uRev: { value: 0 },      // 兩個都 0 → 整面黑，開場才交給排程
        uOpacity: { value: 0 }, uOn: { value: 1 }, uGlow: { value: 1.05 },
      },
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    }));
  m.position.set(PROJ.X, PROJ.Y, PROJ.Z);
  m.rotation.y = orient(PROJ_N);
  m.renderOrder = 3 + k;                          // 淡入那塊在上
  scene.add(m);
  PROJ_PLANE.push(m);
}

/* 投影機本體：吊桿 + 機身 + 鏡頭，機首朝著牆 */
{
  const g = new THREE.Group();
  g.position.set(3.10, 4.055, -15.50);
  const dir = new THREE.Vector3(-1, -0.36, 0.22).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  scene.add(g);

  const part = (geo, matKey, x2, y2, z2) => {
    const m = new THREE.Mesh(geo, MATS[matKey]);
    m.position.set(x2, y2, z2);
    g.add(m); OCCLUDERS.push(m);
    return m;
  };
  part(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 12), 'dark', 0, 0.30, 0);   // 吊桿
  part(new THREE.BoxGeometry(0.42, 0.17, 0.34), 'dark', 0, 0, 0);                 // 機身
  part(new THREE.CylinderGeometry(0.062, 0.072, 0.085, 20), 'dark', 0, 0.005, -0.205);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.050, 20),
    new THREE.MeshBasicMaterial({ color: 0xFFF3DC }));
  lens.position.set(0, 0.005, -0.249); lens.rotation.y = Math.PI;
  g.add(lens);
}

/* 投影的光柱與補光：這一段是「打得亮」的來源，不是裝飾 */
{
  const target = new THREE.Vector3(-6.86, PROJ.Y, PROJ.Z);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 2.05, 1, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xFFF0D4, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const src = new THREE.Vector3(3.10, 4.05, -15.50);
  beam.scale.set(1, src.distanceTo(target), 1);
  beam.position.copy(src).lerp(target, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0),
    new THREE.Vector3().subVectors(target, src).normalize());
  beam.renderOrder = 2;
  scene.add(beam);

  const sp = new THREE.SpotLight(0xFFECD3, 8.5, 18, 0.62, 0.96, 1.40);
  sp.position.set(3.10, 4.05, -15.50);
  sp.target.position.copy(target);
  scene.add(sp, sp.target);
}

/* 排程：軟開場 → 打字 → 停留 →（舊句從左邊擦掉、新句順手補上）→ …
   只有兩塊平面，所以永遠是「一塊顯示這一句、另一塊先領好下一句的貼圖」，
   nxt 不必記，就是 1 - cur。 */
const projState = { cur: 0, tex: 0, ph: 'lead', t: 0, dur: PROJ.HOLD[0] };
function projectNext(dt) {
  const st = projState;
  const a = PROJ_PLANE[st.cur], b = PROJ_PLANE[1 - st.cur];
  const ua = a.material.uniforms, ub = b.material.uniforms;

  st.t += dt;
  let up = 0;

  if (st.ph === 'lead') {                        // 光先亮，字還沒開始打
    up = Math.min(1, st.t / PROJ.LEAD);
    ua.uFwd.value = 0; ua.uRev.value = 0; ua.uOpacity.value = 1; ua.uOn.value = 1;
    if (up >= 1) { st.ph = 'run'; st.t = 0; }
  } else if (st.ph === 'run') {                  // 前緣從左掃過版面
    up = Math.min(1, st.t * PROJ.REVEAL);
    ua.uFwd.value = up; ua.uRev.value = 0; ua.uOpacity.value = 1; ua.uOn.value = 1;
    if (up >= 1) {
      st.ph = 'hold'; st.t = 0;
      st.dur = PROJ.HOLD[0] + Math.random() * (PROJ.HOLD[1] - PROJ.HOLD[0]);
    }
  } else if (st.ph === 'hold') {
    ua.uFwd.value = 1; ua.uRev.value = 0; ua.uOpacity.value = 1; ua.uOn.value = 1;
    if (st.t >= st.dur) { st.ph = 'fade'; st.t = 0; }
  } else {                                       // 舊的擦掉、新的補上
    up = Math.min(1, st.t / PROJ.FADE);
    const done = up >= 1;
    ua.uRev.value = up;                          // 舊句：前緣掃過去就沒了
    ua.uOpacity.value = 1 - 0.25 * up;           // 順手整體淡一點，邊緣才不會髒
    ub.uOpacity.value = 1;
    ub.uRev.value = 0;
    ub.uFwd.value = Math.min(1, up * 1.6);       // 新句：打得比擦的快一點，才追得上

    if (done) {
      a.material.uniforms.uOpacity.value = 0;
      a.material.uniforms.uOn.value = 0;
      st.cur = 1 - st.cur;
      st.tex = (st.tex + 1) % PROJ_TEX.length;   // 這塊接下來要顯示的話
      const nxtTex = PROJ_TEX[(st.tex + 1) % PROJ_TEX.length];
      PROJ_PLANE[1 - st.cur].material.uniforms.tMap.value = nxtTex;
      st.ph = 'hold'; st.t = 0;
      st.dur = PROJ.HOLD[0] + Math.random() * (PROJ.HOLD[1] - PROJ.HOLD[0]);
    }
  }
}

/* ============================================================
   操作
   ============================================================ */
/* 站在某個牆面物件正前方 dist 公尺、平視它的機位 */
function facePose(mesh, n, dist) {
  const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const x = p.x + n.x * dist, z = p.z + n.z * dist;
  const dir = new THREE.Vector3(p.x - x, p.y - EYE, p.z - z).normalize();
  return { x, z, yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) };
}

const player = { pos: new THREE.Vector3(0, EYE, 10.3), yaw: 0, pitch: 0 };
document.body.classList.add('gated');   // 還沒按進場，先不顯示 HUD
const view = { pos: player.pos.clone(), yaw: 0, pitch: 0 };
const keys = new Set();
let locked = false, focused = null, bob = 0, speedT = 0;

function blocked(x, z) {
  for (const b of COLLIDERS)
    if (x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return true;
  return false;
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && sheetEntry) { closeSheet(); return; }
  if (sheetEntry) {
    // 大圖開著的時候只認縮放鍵，WASD 不要餵給走動
    if (e.key === '+' || e.key === '=') { zZoomTo(zScale * ZSTEP); return; }
    if (e.key === '-' || e.key === '_') { zZoomTo(zScale / ZSTEP); return; }
    if (e.key === '0') { zReset(); return; }
    return;
  }
  if (e.code === 'Escape' && focused) { closeFocus(); return; }
  if (focused && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { stepWork(e.code === 'ArrowRight' ? 1 : -1); return; }
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function tryLock() {
  if (isTouch || !gateOff) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (_) {} });
  } catch (_) {
    try { canvas.requestPointerLock(); } catch (_) {}
  }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  dot.classList.toggle('locked', locked);
  paused.classList.toggle('on', !locked && gateOff && !focused && !sheetEntry);
});
document.addEventListener('mousemove', (e) => {
  if (!locked || focused || sheetEntry) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0021, -1.15, 1.15);
});

// 手機不開放：3D 展館要滑鼠 + 鍵盤才走得動，觸屏只會迷路。
// 只有在「完全沒有精細指標（滑鼠 / 觸控板）」時才當成手機，觸屏筆電不受影響
const isTouch = matchMedia('(any-pointer: coarse)').matches
  && !matchMedia('(any-pointer: fine)').matches;
document.body.classList.toggle('touch', isTouch);

/* 點擊：桌面版第一下先鎖滑鼠，之後才判定準星 */
canvas.addEventListener('click', (e) => {
  if (!gateOff) return;
  if (focused) { closeFocus(); return; }
  if (!locked && !isTouch) { tryLock(); return; }
  pick(e.clientX, e.clientY);
});

/* ============================================================
   靠近細看
   ============================================================ */
const ray = new THREE.Raycaster();
const el = (id) => document.getElementById(id);
const focusEl = el('focus'), dot = el('dot'), tipEl = el('tip'), paused = el('paused');
let gateOff = false;

/* ------------------------------------------------------------
   準星的勢力範圍：只認「你人現在待的那一廳」
   ------------------------------------------------------------
   展館是 enfilade——四個門洞對成一條線，站在 Room I 可以一眼望到
   Room III。射線只會被牆擋住（而且門洞是開的），所以如果不分廳，
   準星就會穿過兩間展廳點到對面的畫。
   做法很土但很準：先用地理座標判斷人在哪一廳，只對那一廳的物件打射線。
   ------------------------------------------------------------ */
function roomHere() {
  const k = currentRoom();
  if (k) return k;

  /* 站在走道上（不屬於任何一廳）：取「牆離你最近」的那一廳，
     再把你正朝哪邊看算進去——不然站在通道 C 會被判成旁邊的禮品店。
     score = 到該廳矩形的距離 − 2.5 × 朝向對齊度 */
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  let best = null, bs = Infinity;
  for (const [key, r] of Object.entries(ROOMS)) {
    const cx = Math.min(Math.max(view.pos.x, r.x0), r.x1);
    const cz = Math.min(Math.max(view.pos.z, r.z0), r.z1);
    const d = Math.hypot(view.pos.x - cx, view.pos.z - cz);
    const tx = (r.x0 + r.x1) / 2 - view.pos.x, tz = (r.z0 + r.z1) / 2 - view.pos.z;
    const len = Math.hypot(tx, tz) || 1;
    const align = Math.max(0, (fx * tx + fz * tz) / len);
    const score = d - 2.5 * align;
    if (score < bs) { bs = score; best = key; }
  }
  return best;
}

const ROOM_WORKS = {}, ROOM_PAPER = {};
for (const g of WORK_GROUPS) (ROOM_WORKS[g.userData.room] ||= []).push(g);
for (const e of SHEET) (ROOM_PAPER[e.room] ||= []).push(e.mesh);

/* 當下這一廳的紙與畫；找不到任何東西就是空陣列，射線自然不會有結果 */
const hereWorks = () => ROOM_WORKS[roomHere()] || [];
const herePaper = () => ROOM_PAPER[roomHere()] || [];

/* 準心能不能穿牆：最近的牆比目標近，就是被擋住了 */
function sightBlocked(dist) {
  const o = ray.intersectObjects(OCCLUDERS, false)[0];
  return !!o && o.distance < dist - 0.03;
}

function pick(cx, cy) {
  let nx = (cx / innerWidth) * 2 - 1, ny = -(cy / innerHeight) * 2 + 1;
  if (locked) { nx = 0; ny = 0; }
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);

  // 紙比畫近，先判紙：點展籤不該跳出作品介紹
  const papers = herePaper();
  const paper = papers.length ? ray.intersectObjects(papers, false)[0] : null;
  if (paper && !sightBlocked(paper.distance)) {
    const e = SHEET.find((s) => s.mesh === paper.object);
    if (e) { openSheet(e); return true; }
  }

  const groups = hereWorks();
  const hit = groups.length ? ray.intersectObjects(groups, true)[0] : null;
  if (hit && !sightBlocked(hit.distance)) {
    let o = hit.object;
    while (o && !o.userData.slug) o = o.parent;
    if (o) { openFocus(o.userData.slug); return true; }
  }
  return false;
}

let focusT = 0;
function openFocus(slug) {
  const work = DATA.works.find((w) => w.slug === slug);
  const lookd = WORK_LOOK[slug];
  if (!work || !lookd) return;
  focused = { slug, work };
  const d = Math.max(1.55, lookd.h * 1.24 + 0.92);
  const p = lookd.pos.clone().addScaledVector(lookd.normal, d);
  focusPose = { pos: p, yaw: 0, pitch: 0 };
  const dir = new THREE.Vector3().subVectors(lookd.pos, p);
  focusPose.yaw = Math.atan2(-dir.x, -dir.z);
  focusPose.pitch = Math.asin(dir.clone().normalize().y);
  focusT = 0;
  if (document.pointerLockElement) document.exitPointerLock();

  el('fTitle').textContent = work.titleCn;
  el('fEn').textContent = work.titleEn;
  el('fAfter').textContent = `${work.after}, ${work.year}`;
  el('fNote').textContent = work.noteCn;
  el('fPunch').textContent = work.punchCn;
  el('fPunchEn').textContent = work.punchEn;
  focusEl.classList.add('on');
}
let focusPose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };

let sheetEntry = null;
function openSheet(entry) {
  sheetEntry = entry;
  const src = entry.mesh.material.map && entry.mesh.material.map.image;
  el('sheetImg').src = src && src.toDataURL ? src.toDataURL('image/png') : '';
  el('sheetCap').textContent = entry.cap || '';
  el('sheet').classList.add('on');
  zReset();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeSheet() {
  sheetEntry = null;
  el('sheet').classList.remove('on');
  el('sheetImg').removeAttribute('src');
  zReset();
  if (!isTouch) tryLock();
}

/* ------------------------------------------------------------
   大圖的縮放：按鈕、滾輪、拖曳
   ------------------------------------------------------------
   比例是「相對剛好放滿」的倍率——100% 就是剛點開時的大小，
   接下來只是把同一張點陣圖放大，所以上限停在 4 倍（再上去只是變糊）。
   圖比視窗大之後用 transform 平移，超出 #sheet 的部分直接被裁掉。 */
const ZMIN = 1, ZMAX = 4, ZSTEP = 1.25;
const ZPAD = { x: 88, y: 78 };          // #sheet 的 padding：左右 44、上下 44 + 34
let zScale = 1, ztx = 0, zty = 0, zDrag = null, zDragMoved = 0;

const zClamp = (v, a, b) => Math.min(Math.max(v, a), b);

function zApply() {
  el('sheetImg').style.transform =
    `translate(${ztx.toFixed(1)}px,${zty.toFixed(1)}px) scale(${zScale.toFixed(3)})`;
  el('sheetPct').textContent = `${Math.round(zScale * 100)}%`;
  el('sheetOut').disabled = zScale <= ZMIN + 1e-3;
  el('sheetIn').disabled = zScale >= ZMAX - 1e-3;
  el('sheet').classList.toggle('zoomed', zScale > ZMIN + 1e-3);
}

/* 可以拖多遠：圖的邊拉進來剛好看得到就好，不要拖到整張飛出畫面 */
function zPan(px, py) {
  const img = el('sheetImg'), box = el('sheet');
  const mx = Math.max(0, (img.offsetWidth * zScale - (box.clientWidth - ZPAD.x)) / 2);
  const my = Math.max(0, (img.offsetHeight * zScale - (box.clientHeight - ZPAD.y)) / 2);
  ztx = zClamp(px, -mx, mx);
  zty = zClamp(py, -my, my);
}

/* cx / cy 是縮放的支點（游標相對畫面中央的位移），按鈕縮放就傳 0（畫面中央） */
function zZoomTo(s, cx = 0, cy = 0) {
  const k = zClamp(s, ZMIN, ZMAX) / zScale;
  if (Math.abs(k - 1) < 1e-4) return;
  ztx = cx - (cx - ztx) * k;
  zty = cy - (cy - zty) * k;
  zScale *= k;
  zPan(ztx, zty);
  zApply();
}

function zReset() { zScale = 1; ztx = 0; zty = 0; zEndDrag(); zDragMoved = 0; zApply(); }

el('sheetClose').onclick = closeSheet;
el('sheetIn').onclick = () => zZoomTo(zScale * ZSTEP);
el('sheetOut').onclick = () => zZoomTo(zScale / ZSTEP);
el('sheetPct').onclick = zReset;

el('sheet').addEventListener('wheel', (e) => {
  if (!sheetEntry) return;
  e.preventDefault();
  const r = el('sheet').getBoundingClientRect();
  zZoomTo(zScale * (e.deltaY < 0 ? 1.14 : 1 / 1.14),
    e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
}, { passive: false });

el('sheet').addEventListener('pointerdown', (e) => {
  if (!sheetEntry || zScale <= ZMIN + 1e-3 || e.target.closest('button')) return;
  zDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: ztx, ty: zty };
  zDragMoved = 0;
  el('sheet').classList.add('dragging');
});

/* 收工。pointercancel 也要走這裡：這張圖是原生可拖的 <img>，按住拖曳時瀏覽器
   會去接手原生拖曳、取消指標串流，只發 pointercancel 不發 pointerup。漏掉的話
   zDrag 會卡住不清，圖就一直黏著滑鼠跑（.dragging 也跟著留在上面）。 */
function zEndDrag() {
  if (!zDrag) return;
  zDrag = null;
  el('sheet').classList.remove('dragging');
}

addEventListener('pointermove', (e) => {
  if (!zDrag || e.pointerId !== zDrag.id || !e.buttons) return;   // 沒按著就不算在拖曳

  const dx = e.clientX - zDrag.x, dy = e.clientY - zDrag.y;
  zDragMoved = Math.max(zDragMoved, Math.hypot(dx, dy));
  zPan(zDrag.tx + dx, zDrag.ty + dy);
  zApply();
});
addEventListener('pointerup', zEndDrag);
addEventListener('pointercancel', zEndDrag);

/* 點圖快速來回：一倍 ↔ 兩倍半（支點在游標，跟滾輪同一套） */
el('sheet').addEventListener('dblclick', (e) => {
  if (!sheetEntry || e.target.id !== 'sheetImg') return;
  const r = el('sheet').getBoundingClientRect();
  if (zScale > ZMIN + 1e-3) zReset();
  else zZoomTo(2.5, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
});

el('sheet').addEventListener('click', (e) => {
  const dragged = zDragMoved > 4;      // 剛剛是拖曳，不是點背景
  zDragMoved = 0;
  if (!dragged && e.target.id === 'sheet') closeSheet();
});

function closeFocus() {
  focused = null;
  focusEl.classList.remove('on');
  if (!isTouch) tryLock();
}

function stepWork(dir) {
  const w = focused && focused.work;
  if (!w) return;
  const room = DATA.works.filter((x) => x.room === w.room);
  const i = room.findIndex((x) => x.slug === w.slug);
  openFocus(room[(i + dir + room.length) % room.length].slug);
}
el('focusClose').onclick = closeFocus;

/* ============================================================
   平面圖
   ============================================================ */
/* ============================================================
   雷達小地圖
   只顯示身邊一圈，盤面跟著人轉（GTA 那種），沒有卡片底、帶透明度。
   ============================================================ */
const RADAR_RANGE = 9.5;               // 圓盤半徑覆蓋幾公尺（看到身邊一圈就好）

const mapEl = el('map');
// 直徑以版面實際尺寸為準（窄螢幕的 media query 會把它縮小）
const RADAR_CSS = Math.round(mapEl.getBoundingClientRect().width) || 196;
const mapDPR = Math.min(devicePixelRatio, 2);
mapEl.width = Math.round(RADAR_CSS * mapDPR);
mapEl.height = Math.round(RADAR_CSS * mapDPR);
const mctx = mapEl.getContext('2d');
const R_PX = (RADAR_CSS / 2) * mapDPR; // 圓盤半徑（裝置 px）
const PPM = R_PX / RADAR_RANGE;        // 每公尺幾 px

/* 一面牆沿著開口切成幾段，雷達只畫實心的部分 */
function wallSegs(w) {
  const alongX = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const fixed = alongX ? w.a[1] : w.a[0];
  const c0 = alongX ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const c1 = alongX ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const ops = (w.openings || []).slice().sort((p, q) => p[0] - q[0]);
  const segs = []; let cur = c0;
  for (const [o0, o1] of ops) { if (o0 > cur) segs.push([cur, o0]); cur = Math.max(cur, o1); }
  if (cur < c1) segs.push([cur, c1]);
  return { alongX, fixed, segs };
}

function renderMap() {
  const W = mapEl.width, H = mapEl.height;
  const cx = W / 2, cy = H / 2;
  const t = ROOM_TITLE[lastRoom] || ROOM_TITLE.hall;

  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, W, H);

  /* 盤面轉正：畫面永遠朝著人看的方向 */
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  const rot = -Math.PI / 2 - Math.atan2(fz, fx);

  mctx.save();
  mctx.beginPath(); mctx.arc(cx, cy, R_PX - mapDPR, 0, 7); mctx.clip();
  mctx.fillStyle = 'rgba(17,18,19,.38)';
  mctx.fillRect(0, 0, W, H);

  /* 視野扇形：盤面已轉正，所以永遠朝上 */
  const cone = mctx.createRadialGradient(cx, cy, 0, cx, cy, R_PX * 0.96);
  cone.addColorStop(0, 'rgba(255,255,255,.18)');
  cone.addColorStop(1, 'rgba(255,255,255,0)');
  mctx.fillStyle = cone;
  mctx.beginPath(); mctx.moveTo(cx, cy);
  mctx.arc(cx, cy, R_PX * 0.96, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mctx.closePath(); mctx.fill();

  /* 世界座標 → 盤面（公尺為單位，z 朝下＝南） */
  mctx.translate(cx, cy);
  mctx.rotate(rot);
  mctx.scale(PPM, PPM);
  mctx.translate(-view.pos.x, -view.pos.z);

  const roomFill = 'rgba(244,241,232,.10)';
  for (const r of Object.values(ROOMS)) {
    mctx.fillStyle = roomFill;
    mctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  for (const p of PASSAGES) {
    mctx.fillStyle = roomFill;
    mctx.fillRect(p.x0, Math.min(p.z0, p.z1), p.x1 - p.x0, Math.abs(p.z1 - p.z0));
  }

  mctx.lineJoin = 'round'; mctx.lineCap = 'butt';
  mctx.strokeStyle = 'rgba(255,255,255,.62)';
  mctx.lineWidth = (1.15 * mapDPR) / PPM;
  for (const w of WALLS) {
    const { alongX, fixed, segs } = wallSegs(w);
    for (const [s0, s1] of segs) {
      mctx.beginPath();
      if (alongX) { mctx.moveTo(s0, fixed); mctx.lineTo(s1, fixed); }
      else { mctx.moveTo(fixed, s0); mctx.lineTo(fixed, s1); }
      mctx.stroke();
    }
  }

  /* 畫作位置：走近才亮，遠的淡掉 */
  for (const b of BUILT) {
    const { pos } = WORK_LOOK[b.work.slug];
    const d = Math.hypot(pos.x - view.pos.x, pos.z - view.pos.z);
    const a = Math.max(0, 1 - d / (RADAR_RANGE * 0.9));
    mctx.fillStyle = `rgba(244,241,232,${(0.30 + 0.55 * a).toFixed(3)})`;
    mctx.beginPath(); mctx.arc(pos.x, pos.z, 0.24, 0, 7); mctx.fill();
  }
  mctx.restore();

  /* 盤緣 */
  mctx.beginPath(); mctx.arc(cx, cy, R_PX - mapDPR, 0, 7);
  mctx.strokeStyle = 'rgba(255,255,255,.38)'; mctx.lineWidth = 1.2 * mapDPR; mctx.stroke();

  /* 北方：跟著盤面轉；畫在盤外，用陰影讓它在亮／暗牆上都讀得到 */
  const na = rot - Math.PI / 2;
  mctx.save();
  mctx.shadowColor = 'rgba(17,18,19,.60)'; mctx.shadowBlur = 4 * mapDPR;
  mctx.fillStyle = 'rgba(255,255,255,.92)';
  mctx.font = `10px ${FL}`;
  mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('N', cx + Math.cos(na) * (R_PX + 8 * mapDPR), cy + Math.sin(na) * (R_PX + 8 * mapDPR));
  mctx.restore();

  /* 廳名：貼在盤底，位置固定不會轉 */
  mctx.font = `8.6px ${FL}`;
  mctx.shadowColor = 'rgba(0,0,0,.55)'; mctx.shadowBlur = 3 * mapDPR;
  mctx.fillStyle = 'rgba(255,255,255,.88)';
  mctx.textBaseline = 'alphabetic';
  mctx.fillText(t.en.toUpperCase(), cx, cy + R_PX * 0.68);
  mctx.shadowColor = 'transparent'; mctx.shadowBlur = 0;

  /* 玩家：永遠朝上 */
  mctx.beginPath();
  mctx.moveTo(cx, cy - 6.5 * mapDPR);
  mctx.lineTo(cx + 4.6 * mapDPR, cy + 5.2 * mapDPR);
  mctx.lineTo(cx, cy + 2.2 * mapDPR);
  mctx.lineTo(cx - 4.6 * mapDPR, cy + 5.2 * mapDPR);
  mctx.closePath();
  mctx.fillStyle = '#FFFFFF'; mctx.fill();
  mctx.strokeStyle = 'rgba(17,18,19,.55)'; mctx.lineWidth = 1.1 * mapDPR; mctx.stroke();
  mctx.textAlign = 'left';
}

/* ============================================================
   HUD
   ============================================================ */

function currentRoom() {
  const keys = Object.keys(ROOMS);
  const inRect = (r, pad) =>
    view.pos.x > r.x0 - pad && view.pos.x < r.x1 + pad &&
    view.pos.z > r.z0 - pad && view.pos.z < r.z1 + pad;

  /* 先看精確範圍。房間外面那圈 ±0.6 容忍帶會互相重疊，而且誰先被列舉誰贏：
     Room III 的東界是 x = 10，禮品店的西界也是 x = 10，於是站在店裡（x > 10）
     會被判成 Room III，準心就點不到店裡的東西。精確範圍沒有這個問題。 */
  for (const k of keys) if (inRect(ROOMS[k], 0)) return k;
  for (const k of keys) if (inRect(ROOMS[k], 0.6)) return k;
  return null;
}

let lastRoom = null;
function updateHUD() {
  const k = currentRoom();
  if (k === lastRoom) return;
  lastRoom = k;
  const t = ROOM_TITLE[k] || ROOM_TITLE.hall;
  el('hudRoom').innerHTML = `<b>${t.cn}</b><span>${t.en}</span>`;
  el('hudVol').textContent = t.range;
}

/* ============================================================
   入口
   ============================================================ */
{
  const B = DATA.brand;
  el('gKicker').textContent = `The Meowseum · Vol. I · ${B.vol.replace(/^Vol\. I · /, '')}`;
  el('gName').textContent = B.museumCn;
  el('gNameEn').textContent = B.museumEn;
  el('gHero').textContent = B.heroEn;
  // 中英文各自一行：`formerly attributed to "Nougat"` 不跟著中文擠，才不會斷在半途
  el('gAttrCn').textContent = `${B.heroCn}　${B.attributionCn}`;
  el('gAttrEn').textContent = B.attributionEn;
  el('gSub').textContent = B.subtitleCn;
  el('gSubEn').textContent = B.subtitleEn;
  el('gTag').innerHTML = B.taglines.map((t) => `<b>${t.cn}</b>　<span>${t.en}</span>`).join('<br>')
    + `<br><em>#TheMeowseum　#LadyMimi　#本名牛軋糖</em>`;
  const ready = DATA.works.filter((w) => w.image).length;
  el('gInfo').innerHTML = [
    ['館名', `${B.museumCn}　${B.museumEn}`],
    ['展期', B.datesCn],
    ['地點', B.placeCn],
    ['卷次', B.vol],
    ['展廳', 'I 神與神話　II 肖像沙龍　III 浪漫主義之後　IV 周邊商店'],
    ['展品', `${DATA.works.length} 件（已上牆 ${ready}，修復中 ${DATA.works.length - ready}）`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const enter = () => {
    gateOff = true;
    document.body.classList.remove('gated');
    el('gate').classList.add('off');
    hideLoader();
    tryLock();
  };
  el('gGo').onclick = enter;
  addEventListener('keydown', (e) => {
    if (gateOff) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
  });
}

let loaderHidden = false;
function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  el('load').classList.add('off');
}

/* 收掉「Preparing the galleries…」的時機是入口那面牆的圖稿到位（見 TW_ART 的
   callback）——那面牆是進館第一眼，寧可多等一秒也不要空牆。這裡放個保險，
   圖稿萬一掛掉也不會永遠停在準備畫面。 */
setTimeout(hideLoader, 15000);

/* ============================================================
   主迴圈
   ============================================================ */
const clock = new THREE.Clock();
let hudT = 0;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // 移動
  let mx = 0, mz = 0;
  if (!focused && !sheetEntry) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  }
  const mag = Math.hypot(mx, mz);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const want = mag > 0.05 ? (run ? RUN : WALK) : 0;
  speedT += (want - speedT) * Math.min(1, dt * 9);
  if (mag > 0.05) {
    const ux = mx / Math.max(mag, 1), uz = mz / Math.max(mag, 1);
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    const dx = (fx * -uz + rx * ux) * speedT * dt;
    const dz = (fz * -uz + rz * ux) * speedT * dt;
    if (!blocked(player.pos.x + dx, player.pos.z)) player.pos.x += dx;
    if (!blocked(player.pos.x, player.pos.z + dz)) player.pos.z += dz;
    bob += dt * speedT * 2.0;
  } else {
    bob += dt * 0.9;
  }

  // 視角
  const want2 = focused ? focusPose : player;
  const k = 1 - Math.exp(-(focused ? 6.2 : 22) * dt);
  view.pos.lerp(want2.pos, k);
  let dy = want2.yaw - view.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  view.yaw += dy * k;
  view.pitch += (want2.pitch - view.pitch) * k;

  camera.position.set(view.pos.x, view.pos.y + Math.sin(bob) * 0.014 * (speedT / WALK), view.pos.z);
  camera.rotation.set(view.pitch, view.yaw, 0);
  camera.updateMatrixWorld();

  // 準星提示
  if (!focused && !sheetEntry && locked) {
    ray.setFromCamera(new THREE.Vector2(locked ? 0 : (pointer.x / innerWidth) * 2 - 1,
      locked ? 0 : -(pointer.y / innerHeight) * 2 + 1), camera);

    // 準星先看紙（展籤 / 廳牌 / 海報），沒紙才看畫；一律只認當下這一廳
    const papers = herePaper(), groups = hereWorks();
    const paper = papers.length ? ray.intersectObjects(papers, false)[0] : null;
    let label = null, slug = null;
    if (paper && !sightBlocked(paper.distance)) {
      const e = SHEET.find((q) => q.mesh === paper.object);
      label = e ? (e.short || '放大看') : '放大看';
    } else {
      const hit = groups.length ? ray.intersectObjects(groups, true)[0] : null;
      if (hit && !sightBlocked(hit.distance)) {
        let o = hit.object;
        while (o && !o.userData.slug) o = o.parent;
        slug = o && o.userData.slug;
      }
    }
    const hot = !!(label || slug);
    dot.classList.toggle('hot', hot);
    tipEl.classList.toggle('on', hot);
    if (label) tipEl.textContent = `點一下　${label}`;
    else if (slug) {
      const w = DATA.works.find((x) => x.slug === slug);
      tipEl.textContent = `${w.titleCn}　${w.titleEn}`;
    }
  } else {
    dot.classList.remove('hot'); tipEl.classList.remove('on');
  }

  // 展廳牆上的投影：只改不透明度，貼圖只有在換句時才換
  projectNext(dt);

  hudT += dt;
  if (hudT > 0.1) { hudT = 0; updateHUD(); renderMap(); }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
addEventListener('mousemove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });

/* 對外開個小門，方便截圖 / 佈展時直接跳到某個位置 */
window.MEOWSEUM = {
  DATA, scene, camera, renderer, player, view,
  enter() {
    gateOff = true;
    document.body.classList.remove('gated');
    el('gate').classList.add('off');
    hideLoader();
  },
  goto(x, z, yaw = 0, pitch = 0) {
    player.pos.set(x, EYE, z);
    player.yaw = yaw; player.pitch = pitch;
    view.pos.set(x, EYE, z); view.yaw = yaw; view.pitch = pitch;
  },
  focus: openFocus, close: closeFocus, closeSheet,
  roomHere, roomWorks: ROOM_WORKS, roomPaper: ROOM_PAPER,
  /* 準心此刻會瞄到什麼：回傳 { slug } 或 { paper } 或 null。
     verify.mjs 用它檢查「隔著牆不該瞄得到畫」。 */
  probe(nx = 0, ny = 0) {
    camera.position.copy(view.pos);
    camera.rotation.set(view.pitch, view.yaw, 0);
    camera.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const paper = ray.intersectObjects(herePaper(), false)[0];
    if (paper && !sightBlocked(paper.distance)) return { paper: true, dist: paper.distance };
    const hit = ray.intersectObjects(hereWorks(), true)[0];
    if (hit && !sightBlocked(hit.distance)) {
      let o = hit.object;
      while (o && !o.userData.slug) o = o.parent;
      return o ? { slug: o.userData.slug, dist: hit.distance } : null;
    }
    return null;
  },
  sightBlocked, occluders: OCCLUDERS,
  /* 由場景裡的實際位置算出「站在正前方看它」的機位。
     展籤搬了位置或換了尺寸，shot.mjs 的驗收截圖不用跟著改。 */
  labelPose(slug, dist = 1.05) {
    scene.updateMatrixWorld(true);
    const g = WORK_GROUPS.find((x) => x.userData.slug === slug);
    const lab = g && g.userData.label;
    return lab ? facePose(lab, WORK_LOOK[slug].normal, dist) : null;
  },
  sheetForLabel(slug) {
    const g = WORK_GROUPS.find((x) => x.userData.slug === slug);
    const e = g && g.userData.label && SHEET.find((s) => s.mesh === g.userData.label);
    if (e) openSheet(e);
    return !!e;
  },
  sheetFor(key) {
    const e = SHEET.find((s) => (s.cap || '').includes(key));
    if (e) openSheet(e);
    return !!e;
  },
  cardPose(numeral, dist = 1.9) {
    scene.updateMatrixWorld(true);
    const m = CARD_MESH[numeral];
    return m ? facePose(m, m.userData.n, dist) : null;
  },
  rooms: ROOMS, works: WORK_LOOK, featureWall: TW, titleWallArt: TW_ART,
  flatTitleWall() { if (!TW_CANVAS) titleWallTexture(); return TW_CANVAS.toDataURL('image/png'); },
  flatPoster() { if (!POSTER_CANVAS) posterTexture(); return POSTER_CANVAS.toDataURL('image/png'); },
  colliders: COLLIDERS,
};

renderMap();
if (isTouch) hideLoader();          // 手機只顯示說明卡，不必跑 3D 迴圈
else requestAnimationFrame(tick);
console.log('%cTHE MEOWSEUM', 'font:600 13px Baskerville,serif', '展館已載入 · Vol. I');
