/* ============================================================
   THE MEOWSEUM · 3D 展館
   內容全部來自 data.js（由 labels/copy.json 生成），這裡只管空間。
   ============================================================ */
import * as THREE from 'three';
import { DATA } from './data.js';

/* index.html 裡的準備畫面（window.LOAD）。這裡只負責往上報進度——
   最後一格是入口那面牆的圖到位，見 hideLoader()。 */
const LOAD = window.LOAD || { mile() {}, done() {} };
LOAD.mile(18, '下載入口主視覺 · Loading the entrance wall');

/* 牆上的字有一半是畫在 canvas 上的（展籤、廳牌、海報），而 canvas 的 fillText
   不會等 webfont：字型還沒到就畫，缺字會直接烤成替代字形、之後補不回來。
   所以先把畫得到的每個字族、每個字重都確定就緒，才開始蓋展館。
   @font-face 的 src 是 local() 優先，系統本來就有宋體／Baskerville 的機器這裡
   不會有任何下載；真的沒有才會抓 vendor/fonts/ 的子集（約 510 KB）。
   兩族都要等（2026-09-17）：Windows 上一個 local() 都命中不了，只等 Serif 的話
   英文那族會在下載途中就開始烤字，烤出來的英文是替代字形，而且只在 Windows
   看得出來——作者那台 Mac 有真的 Baskerville 頂著，永遠不會走到這條路。
   加個時限，免得字型出狀況時卡在「Preparing the galleries…」不動。 */
try {
  await Promise.race([
    Promise.all([
      document.fonts.load('400 16px "Meowseum Serif"'),
      document.fonts.load('700 16px "Meowseum Serif"'),
      document.fonts.load('400 16px "Meowseum Baskerville"'),
      document.fonts.load('700 16px "Meowseum Baskerville"'),
      document.fonts.load('italic 400 16px "Meowseum Baskerville"'),
    ]),
    new Promise((r) => setTimeout(r, 10000)),
  ]);
} catch (_) {}

LOAD.mile(38, '布置展廳 · Building the galleries');

/* ---------------- 展館尺寸 ---------------- */
const T      = 0.28;    // 牆厚
const PORTAL = 1.35;    // 門洞半寬 → 淨寬 2.7 m
const DOOR   = 3.00;    // 門洞高（收窄後的門洞，太高會變成「牆少做了一塊」）
const EYE    = 1.62;    // 視高
const RADIUS = 0.34;    // 玩家碰撞半徑
const WALK   = 2.55;
const RUN    = 4.60;
const FOV    = 55;
const HEAD_R = 0.030;   // 燈頭半徑（刻意做小：交代光源，不搶戲）
const HEAD_L = 0.085;   // 燈頭長度

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
  { a: [-10, -40], b: [10, -40],  h: 5.2, mat: 'wallA', openings: [[-7.4, -5.6]] },
  // 通道 C
  { a: [-5.6, -40], b: [-5.6, -44], h: 5.6, mat: 'wallB' },
  { a: [-7.4, -40], b: [-7.4, -44], h: 5.6, mat: 'wallB' },
  // Room III
  { a: [-10, -44], b: [10, -44], h: 5.6, mat: 'wallB', openings: [[-7.4, -5.6]] },
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
  { x0: -7.4,    x1: -5.6,   z0: -40, z1: -44, y: DOOR, mat: 'ceil' },
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
const FT = '"Meowseum Serif",Songti TC,"宋体-繁","Songti SC","Songti","Noto Serif TC",serif';
const FL = '"Meowseum Baskerville",Baskerville,"Iowan Old Style","Times New Roman","Meowseum Serif",serif';
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

/* ---------------- 規範頁的行盒 ----------------
   labels/labels.html 是這一套牌子的設計源。那一頁的每個文字塊都有三件事：
   字級、line-height、以及跟前一塊之間的毫米外距。canvas 沒有行盒只有基線，
   所以這裡把 CSS 的盒子還原回來——盒高 = 字級 × line-height，
   基線 = 盒頂 + 半行距 + 字體 ascent。下面每張貼圖的外距常數就是照著
   labels.html 量出來的毫米值填的，改文案不會讓版面走位。 */
function boxBase(ctx, txt, top, boxH) {
  const m = ctx.measureText(txt);
  const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
  if (a == null) return top + boxH * 0.75;      // 沒有這兩個欄位的舊瀏覽器
  return top + (boxH - (a + d)) / 2 + a;
}

/* 宋體的字身自帶左邊距，標題會往內縮約 0.07 em。
   規範頁靠 margin-left:-.07em 拉回來，canvas 這邊用同一個數值做光學對齊。 */
const OPTICAL = 0.07;

/* 展簽：148 × 105 mm（A6 橫版），白卡黑字，無裝飾。
   版式照 labels/labels.html 的「展签」整組搬過來：題名 → 英文題名 →
   11 mm 留白 → 考據段落 →（彈性留白）→ 收尾短句貼底。中間那條細線已拿掉。 */
function labelTexture(work, room) {
  const S = 2048 / 148, W = 2048, H = Math.round(105 * S);
  const { c, x } = makeCanvas(W, H);
  const M = (v) => v * S;                        // mm → px
  const PT = (v) => v * MM;                      // pt → mm
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';

  const PADT = 12, PADX = 14, PADB = 11;
  const L = M(PADX), R = W - M(PADX), width = R - L;

  /* 一個文字塊；gap 是上一塊盒底到這一塊盒頂的外距，回傳這一塊的盒底 */
  const put = (txt, font, color, lh, gap, top, optical) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    const boxH = size * lh;
    const dx = optical ? -size * OPTICAL : 0;
    let t0 = top + M(gap);
    for (const t of wrapText(x, txt, width)) {
      x.fillText(t, L + dx, boxBase(x, t, t0, boxH));
      t0 += boxH;
    }
    return t0;
  };

  let y = M(PADT);
  y = put(work.titleCn, songti(M(PT(29))), INK, 1.16, 0, y, true);
  y = put(work.titleEn, bask(M(PT(13))), GREY, 1.3, 1.9, y);

  y = put(work.noteCn, songti(M(PT(8.9)), 400), GREY, 2.02, 11, y);

  /* 收尾短句固定貼底：先量行數，再從 105 − 11 mm 往上排。
     規範頁的 padding-top:7 mm 在 canvas 這裡是多餘的——貼底之後那段距離
     本來就會空出來，只有段落短到不佔位時才需要它，所以留著 0.2 mm 的行距。 */
  const ps = M(PT(8.9)), es = M(PT(8.4));
  x.font = songti(ps, 700); const pl = wrapText(x, work.punchCn, width);
  x.font = bask(es, true);  const el = wrapText(x, work.punchEn, width);
  const enBox = es * 1.5, cnBox = ps * 2.02;
  const enTop = H - M(PADB) - el.length * enBox;
  const cnTop = enTop - M(0.2) - pl.length * cnBox;
  x.font = songti(ps, 700); x.fillStyle = INK2;
  pl.forEach((t, i) => x.fillText(t, L, boxBase(x, t, cnTop + i * cnBox, cnBox)));
  x.font = bask(es, true); x.fillStyle = GREY2;
  el.forEach((t, i) => x.fillText(t, L, boxBase(x, t, enTop + i * enBox, enBox)));

  return canvasTex(c);
}

/* 廳牌：A4 豎版，版式照 labels/labels.html 的「厅牌」整組搬過來。
   規範頁那張的紙色是白（可切深綠／酒紅），展館這裡固定用深綠——白紙掛在
   淺色牆上會整片糊掉，深綠底配米白字才撐得住展場的暗。色票直接取規範頁
   body.theme-dark 那一組，所以兩邊是同一套色。
   規範頁拿掉了屋簷式的資訊列，也明講厅牌不列作品清單（作品明細在展簽上），
   這裡就跟著不放。 */
function roomCardTexture(room) {
  const S = 2100 / 210, W = 2100, H = Math.round(297 * S);
  const { c, x } = makeCanvas(W, H);
  const M = (v) => v * S;                        // mm → px
  const PT = (v) => v * MM;                      // pt → mm
  const PAPER = GREEN, INK = CREAM;
  const INK2 = '#E8E4D9', GREY = '#B4BDB7', GREY2 = '#93A29A';
  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';

  const PAD = 24;
  const L = M(PAD), R = W - M(PAD), width = R - L;

  /* 一個文字塊；gap 是上一塊盒底到這一塊盒頂的外距，回傳這一塊的盒底。
     line-height 沒寫的那些（英文廳名、年代）用瀏覽器的 normal 值 1.15。 */
  const put = (txt, font, color, lh, gap, top, optical) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    const boxH = size * (lh || 1.15);
    const dx = optical ? -size * OPTICAL : 0;
    let t0 = top + M(gap || 0);
    for (const t of wrapText(x, txt, width)) {
      x.fillText(t, L + dx, boxBase(x, t, t0, boxH));
      t0 += boxH;
    }
    return t0;
  };

  let y = M(PAD);
  y = put(room.numeral,     bask(M(PT(132))),         INK,   0.84, 5,   y);
  y = put(room.nameCn,      songti(M(PT(40))),        INK,   1.16, 7,   y, true);
  y = put(room.nameEn,      bask(M(PT(15))),          GREY,  1.15, 2.4, y);
  y = put(room.range,       bask(M(PT(10))),          GREY2, 1.15, 2.6, y);
  y = put(room.statementCn, songti(M(PT(10.4)), 400), GREY,  2.15, 11,  y);
  y = put(room.statementEn, bask(M(PT(8.8))),         GREY2, 1.85, 6,   y);

  /* 頁腳貼底，左右各一句：左邊館名（中文用宋體、拉丁用 Baskerville，
     兩種字型接在同一行上），右邊檔期。 */
  const fs = M(PT(7.6)), fh = fs * 1.15, fy = H - M(PAD) - fh;
  const lb = boxBase(x, 'Hg', fy, fh);
  x.font = songti(fs, 400); x.fillStyle = GREY2;
  x.fillText(DATA.brand.museumCn, L, lb);
  const w1 = x.measureText(DATA.brand.museumCn).width;
  x.font = bask(fs);
  x.fillText(` \u00b7 ${DATA.brand.museumEn.toUpperCase()}`, L + w1, lb);
  x.textAlign = 'right';
  x.fillText(`Lady Mimi \u00b7 ${DATA.brand.vol}`, R, lb);
  x.textAlign = 'left';

  return canvasTex(c);
}

/* ---------------- 館內海報 ----------------
   大廳通往 Room I 的那面牆、門洞兩側各一張 A3 豎版（297 × 420 mm）。
   面向那面牆時，左手邊是總介紹、右手邊是展場平面圖——先知道這是什麼展，
   再知道要往哪走。兩張同一個抬頭、同一套色，而且都不畫橫線：
   分節靠留白，跟展籤同一條規矩。
   平面圖不是另外描的圖，是直接從 ROOMS / WALLS / WORK_LOOK 畫出來，
   展場改了海報就會跟著改。 */
let POSTER_CANVAS = null, POSTER_MAP_CANVAS = null;

const POSTER_SHEET = { W: 2600, H: Math.round(2600 / 297 * 420), PAD: 22 };

/* 兩張共用的抬頭：館名與卷次各據一端 */
function posterMasthead(x, M, L, R) {
  const fs = M(8.4 * MM), base = M(POSTER_SHEET.PAD) + fs * 0.86;
  x.font = bask(fs); x.fillStyle = CARD_DIM; x.textAlign = 'left';
  x.fillText('THE MEOWSEUM', L, base);
  x.textAlign = 'right';
  x.fillText(DATA.brand.vol.toUpperCase(), R, base);
  x.textAlign = 'left';
  return base + fs * 0.9;
}

/* 兩張共用的頁腳：檔期與地點 */
function posterFoot(x, M, L, R) {
  const B = DATA.brand, fy = POSTER_SHEET.H - M(30) + M(11 * MM) * 0.4;
  x.font = songti(M(11 * MM), 700); x.fillStyle = CREAM; x.textAlign = 'left';
  x.fillText(B.datesCn, L, fy);
  x.font = bask(M(9.5 * MM)); x.fillStyle = CARD_DIM;
  x.fillText(B.placeCn, L, fy + M(7));
  x.textAlign = 'right';
  x.fillText(B.taglines[0] ? B.taglines[0].en : '', R, fy);
  x.textAlign = 'left';
}

/* 左邊那張：館名、Lady Mimi、展名，然後十件作品。
   四廳的資訊留給右邊那張平面圖，這裡不再列一次「展覽內容」。 */
function posterIntroTexture() {
  const B = DATA.brand;
  const W = POSTER_SHEET.W, H = POSTER_SHEET.H;
  const { c, x } = makeCanvas(W, H);
  POSTER_CANVAS = c;
  const M = (v) => v * (W / 297);
  const L = M(POSTER_SHEET.PAD), R = W - M(POSTER_SHEET.PAD), width = R - L;

  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';

  const put = (txt, font, color, lh, gap) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    for (const t of wrapText(x, txt, width)) { y += size * 0.86; x.fillText(t, L, y); y += size * (lh - 0.86) + gap; }
  };
  let y = posterMasthead(x, M, L, R);

  y += M(30);
  put(B.museumCn, songti(M(60 * MM)), CREAM, 1.12, 0);
  y += M(5);
  put(B.museumEn.toUpperCase(), bask(M(15 * MM)), CARD_DIM, 1.3, 0);

  y += M(32);
  put(B.heroEn, bask(M(30 * MM)), CREAM, 1.15, 0);
  y += M(6);
  put(`${B.heroCn}　·　${B.attributionCn}`, songti(M(12 * MM), 400), CARD_TXT, 1.75, 0);
  put(B.attributionEn, bask(M(10 * MM), true), CARD_DIM, 1.6, 0);

  y += M(36);
  put(B.subtitleCn, songti(M(15 * MM), 700), CREAM, 1.7, 0);
  y += M(5);
  put(B.subtitleEn, bask(M(11 * MM), true), CARD_DIM, 1.55, 0);

  y += M(50);
  x.font = songti(M(9 * MM), 400); x.fillStyle = CARD_DIM;
  x.fillText('本回作品　WORKS', L, y + M(9 * MM) * 0.86);
  y += M(9 * MM) * 2.0;

  const fs = M(11 * MM), lh = fs * 1.85;
  for (const w of DATA.works) {
    x.font = bask(fs * 0.86); x.fillStyle = CARD_DIM; x.fillText(w.no, L, y + fs * 0.82);
    x.font = songti(fs, 400); x.fillStyle = CARD_TXT; x.fillText(w.titleCn, L + M(13), y + fs * 0.82);
    y += lh;
  }

  posterFoot(x, M, L, R);
  return canvasTex(c);
}

/* 右邊那張：展場平面圖。北（−z）在上，所以動線是從紙的下緣往上走。 */
function posterMapTexture() {
  const W = POSTER_SHEET.W, H = POSTER_SHEET.H;
  const { c, x } = makeCanvas(W, H);
  POSTER_MAP_CANVAS = c;
  const M = (v) => v * (W / 297);
  const L = M(POSTER_SHEET.PAD), R = W - M(POSTER_SHEET.PAD);

  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  let y = posterMasthead(x, M, L, R);

  y += M(15);
  x.font = songti(M(30 * MM)); x.fillStyle = CREAM;
  x.fillText('展場平面圖', L, y + M(30 * MM) * 0.95);
  y += M(30 * MM) * 1.35;
  x.font = bask(M(11 * MM)); x.fillStyle = CARD_DIM;
  x.fillText('FLOOR PLAN　·　NORTH UP', L, y + M(11 * MM) * 0.9);
  y += M(11 * MM) * 2.4;

  /* 世界座標 → 紙面：北（−z）在上，所以 z 越大越靠下緣。
     比例取「塞得進剩下的版面」的那一個，另一軸置中。 */
  const PADM = 1.4;
  const bx0 = -10 - PADM, bx1 = 22 + PADM, bz0 = -60 - PADM, bz1 = 12 + PADM;
  const planH = H - M(112) - y;                       // 下面留給圖例與頁腳
  const k = Math.min((R - L) / (bx1 - bx0), planH / (bz1 - bz0));
  const pw = (bx1 - bx0) * k, ph = (bz1 - bz0) * k;
  const ox = L + ((R - L) - pw) / 2, oy = y;
  const PX = (wx) => ox + (wx - bx0) * k;
  const PZ = (wz) => oy + (wz - bz0) * k;

  const roomFill = 'rgba(244,241,232,.075)';
  for (const r of Object.values(ROOMS)) {
    x.fillStyle = roomFill;
    x.fillRect(PX(r.x0), PZ(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
  }
  for (const p of PASSAGES) {
    const z0 = Math.min(p.z0, p.z1), z1 = Math.max(p.z0, p.z1);
    x.fillStyle = roomFill;
    x.fillRect(PX(Math.min(p.x0, p.x1)), PZ(z0), Math.abs(p.x1 - p.x0) * k, (z1 - z0) * k);
  }

  /* 牆走 wallSegs，門洞就會自動留空——平面圖上的開口是真的開口 */
  x.strokeStyle = 'rgba(244,241,232,.46)'; x.lineWidth = M(0.5); x.lineCap = 'butt';
  for (const w of WALLS) {
    const { alongX, fixed, segs } = wallSegs(w);
    for (const [s0, s1] of segs) {
      x.beginPath();
      if (alongX) { x.moveTo(PX(s0), PZ(fixed)); x.lineTo(PX(s1), PZ(fixed)); }
      else { x.moveTo(PX(fixed), PZ(s0)); x.lineTo(PX(fixed), PZ(s1)); }
      x.stroke();
    }
  }

  /* 十件作品：點貼在牆上，編號跟在旁邊 */
  x.font = bask(M(6.6 * MM));
  for (const work of DATA.works) {
    const wl = WORK_LOOK[work.slug];
    if (!wl) continue;
    const px = PX(wl.pos.x), pz = PZ(wl.pos.z);
    x.beginPath(); x.arc(px, pz, M(1.45), 0, 7);
    x.fillStyle = CREAM; x.fill();
    x.fillStyle = CARD_DIM;
    x.fillText(work.no, px + M(2.9), pz + M(2.3));
  }

  /* 廳名：擺在廳的中央 */
  for (const key of ['hall', 'I', 'II', 'III', 'IV']) {
    const r = ROOMS[key], t = ROOM_TITLE[key];
    if (!r || !t) continue;
    const cx = PX((r.x0 + r.x1) / 2);
    const mid = PZ((r.z0 + r.z1) / 2);
    const nf = bask(M(key === 'hall' ? 0 : 19 * MM));
    const cf = songti(M(10.5 * MM)), ef = bask(M(7.4 * MM), true);
    const nh = key === 'hall' ? 0 : M(19 * MM) * 1.05;
    const ch = M(10.5 * MM) * 1.25, eh = M(7.4 * MM) * 1.45;
    let ty = mid - (nh + ch + eh) / 2;
    x.textAlign = 'center';
    if (nh) { ty += M(19 * MM) * 0.82; x.font = nf; x.fillStyle = CARD_DIM; x.fillText(key, cx, ty); ty += M(19 * MM) * 0.23; }
    ty += ch * 0.78; x.font = cf; x.fillStyle = CREAM; x.fillText(t.cn, cx, ty);
    ty += ch * 0.22 + eh * 0.8; x.font = ef; x.fillStyle = CARD_DIM; x.fillText(t.en, cx, ty);
    x.textAlign = 'left';
  }

  /* 入口：大廳南牆內側一個朝北的箭頭，跟 HUD 的小地圖同一個符號 */
  const ex = PX(0), ey = PZ(10.7), a = M(6.2);
  x.beginPath();
  x.moveTo(ex, ey - a); x.lineTo(ex + a * 0.62, ey + a * 0.42);
  x.lineTo(ex, ey - a * 0.08); x.lineTo(ex - a * 0.62, ey + a * 0.42);
  x.closePath(); x.fillStyle = CREAM; x.fill();

  /* 圖例：貼在平面圖下方一排 */
  const ly = oy + ph + M(13);
  let lx = ox;
  const item = (glyph, label, gapAfter) => {
    x.textAlign = 'left';
    x.font = bask(M(8 * MM)); x.fillStyle = CREAM;
    x.fillText(glyph, lx, ly);
    const gw = x.measureText(glyph).width;
    x.font = songti(M(8 * MM), 400); x.fillStyle = CARD_DIM;
    x.fillText(label, lx + gw + M(3.4), ly);
    lx += gw + M(3.4) + x.measureText(label).width + M(gapAfter);
  };
  item('▶', '入口　ENTRANCE', 16);
  item('●', '展品位置　WORKS', 16);
  item('Ⅰ–Ⅳ', '四個展廳　ROOMS', 0);

  posterFoot(x, M, L, R);
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

/* 禮品店門口的告示：白紙黑字、公文語氣，笑點全部放在內容。
   這張紙是給站在店門口的人讀的，不是給人點開讀的——所以字要大、句子要少。 */
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

  /* 這張紙上不放分隔線：標題變大、正文縮排、行距拉開，層次就夠了。
     橫線在這種尺寸的白紙上會變成一排黑槓，比字還搶眼。 */
  y = Math.round(y) + M(34);

  put('本廳商品　僅存一件', songti(M(22), 700), INK, 1.2, 0);
  y += M(6);
  put('One Item Left', bask(M(10.5)), GREY, 1.3, 0);

  y = Math.round(y) + M(36);

  const body = songti(M(10.2), 400);
  put('各位觀眾：', body, INK, 2.05, M(4));
  put('前天凌晨，Lady Mimi 小姐進到本廳，破壞了不少紀念品。' +
      '她說架上沒有一件像她。', body, INK, 2.05, M(4));
  put('架上現在只剩這一件裙子。裙子掛在東牆上，不賣。' +
      '請不要伸手——她會記得的。', body, INK, 2.05, M(4));
  put('新一批商品已在製作中，上架前會先送她審閱。', body, GREY, 2.05, 0);

  // 收尾短句固定貼底
  const ps = M(7.0), es = M(5.4);
  x.font = songti(ps, 700);
  const pl = wrapText(x, '本館不會追究。追究也沒有用。', width);
  x.font = bask(es, true);
  const el2 = wrapText(x, 'We are not pursuing damages. It would not help.', width);
  let by = H - M(34) - el2.length * es * 1.5 - pl.length * ps * 1.9;
  x.font = songti(ps, 700); x.fillStyle = INK2;
  for (const t of pl) { by += ps * 0.86; x.fillText(t, L, by); by += ps * (1.9 - 0.86); }
  x.font = bask(es, true); x.fillStyle = GREY2;
  by += M(1.2);
  for (const t of el2) { by += es * 0.86; x.fillText(t, L, by); by += es * (1.5 - 0.86); }

  // 僅存一件章：跟在正文後面，不飄到紙的中間
  const foot = by - el2.length * es * 1.5 - pl.length * ps * 1.9;
  const cy = y + (foot - y) * 0.42;
  x.save();
  x.translate(R - M(40), cy);
  x.rotate(-0.15);
  const sw = M(130), sh = M(58);
  x.strokeStyle = 'rgba(17,18,19,.42)';
  x.lineWidth = M(1.6); x.strokeRect(-sw, -sh / 2, sw, sh);
  x.lineWidth = M(0.5); x.strokeRect(-sw + M(3.4), -sh / 2 + M(3.4), sw - M(6.8), sh - M(6.8));
  x.fillStyle = 'rgba(17,18,19,.42)';
  x.textAlign = 'center';
  x.font = songti(M(23), 700);
  x.fillText('僅存一件', -sw / 2, sh / 2 - M(18));
  x.font = bask(M(10));
  x.fillText('ONE  LEFT', -sw / 2, sh / 2 - M(6));
  x.restore();
  x.textAlign = 'left';

  return canvasTex(c);
}

/* ---------------- 禮品店桌上的紀念冊 ----------------
   桌上那四本是同一本 Vol. I 展冊（繁體版）——真的可以拿的那一種。封面不是
   另外畫的，直接抽 brochure/out/hant 那份 PDF 的第 1 頁（見
   scripts/make_brochure_assets.py）：桌上的書與觀眾下載的 PDF 得是同一張臉，
   不然「照著封面找那一本」這件事就不成立。

   `pdf` 是下載連結：點桌上的書，攤平放大時大圖右上角會多一顆下載鈕
   （index.html 的 #sheetDl，openSheet 負責開關）；點牆上那面「免費紀念冊」
   告示則是直接開下載面板（index.html 的 #sheetOffer）。 */
const CATALOGUE = {
  cover: 'assets/brochures/cover-hant.webp',
  pdf: 'assets/brochures/meowseum-catalogue-hant.pdf',
  cap: 'CAT-ALOGUE RAISONNÉ · Lady Mimi, Vol. I · 桌上',
  short: '看展冊',
  dlTitle: '免費紀念冊',
  dlTitleEn: 'Free Souvenir Catalogue',
  /* 面板上只留封面沒說的那幾個數字：館名、題名、卷次封面自己已經寫了，
     再印一次只是把同一句話說兩遍。 */
  dlMeta: '25 頁 · 繁體中文 · 148 × 210 mm',
};
const TABLE_BOOKS = 4;                    // 桌上四本，都是同一本

/* 封面先畫進 canvas 再當貼圖：SHEET（點一下攤平）只認 canvas，而貼圖在開場
   就得有一張（圖是非同步下載的）——所以先鋪展冊自己的深綠底，圖到了再畫上去。
   蓋的那塊綠就是封面底色，慢半拍也看不出來。 */
function catalogueCoverTexture(src) {
  const W = 1240, H = 1759;               // 與 assets/brochures/cover-hant.webp 同尺寸（A5）
  const { c, x } = makeCanvas(W, H);
  x.fillStyle = GREEN; x.fillRect(0, 0, W, H);
  const tex = canvasTex(c);
  const img = new Image();
  img.onload = () => { x.drawImage(img, 0, 0, W, H); tex.needsUpdate = true; };
  img.src = src;
  return tex;
}

/* 牆上那面「免費紀念冊」的告示：白卡黑字，跟展籤同一套（宋體 + Baskerville、
   靠留白分節、不放裝飾線）。它掛在展示桌正後方的南牆上——觀眾低頭看完桌上
   那四本，抬頭會看到的就是這張。

   版面三分：左上標題、右邊展冊封面（跟桌上的書同一張圖，所以不會走版）、
   正文貼底。中間那一大塊留白是刻意的，展籤與展冊封面都是同一個做法。

   尺寸 A1 橫版（841 × 594 mm）。條子原本是 A2，2026-09-17 放大成 A1——原因不是
   「A2 不夠體面」，是**看不清**：展籤在 1 m 內讀，這面告示在 2 m 外讀，而宋體的
   橫畫只有字身的 1/20，A2 在 2 m 處只剩 1 px 寬，被降採樣平均成一條灰線。
   放大紙而不放大字，觀眾看到的字還是一樣小，所以整個版面連字級、封面一起等比
   放大 K = √2（A2 → A1 的標準跳級，面積 ×2）——下面所有數字仍是當初 A2 版的
   那一組，換算時一次乘 K。

   封面跟著大 1.41 倍，比桌上那四本（148 × 210 mm）大了。桌上那四本才是實物，
   這面告示的封面只負責讓人在 2 m 外認得出「就是這一本」，一比一在這個距離沒有
   意義（真要看實物大小，桌上有四本可以疊上去比）。

   S = 3.5 px/mm 而不是 A2 版的 5：紙大了 1.41 倍，3.5 × 1.41 ≈ 5，貼圖的實際
   畫素密度與原本同一個量級（2944 × 2079 vs 2970 × 2100），記憶體沒有變重。 */
function catalogueSignTexture() {
  const S = 3.5, K = Math.SQRT2;          // A1 橫版（841 × 594 mm）
  const W = 841 * S, H = 594 * S;
  const { c, x } = makeCanvas(W, H);
  const M = (v) => v * K * S;             // 版面單位（A2 版的 mm）→ px
  const PT = (v) => v * MM;               // pt → mm
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';

  const PADT = 40, PADX = 40, PADB = 40;
  const L = M(PADX), R = W - M(PADX), width = M(330);   // 左欄：文字只佔到封面左邊
  const CVR = { x: 400, y: 105, w: 148, h: 210 };       // 右欄：展冊實物大小（A5）

  /* 一個文字塊；gap 是上一塊盒底到這一塊盒頂的外距，回傳這一塊的盒底 */
  const put = (txt, font, color, lh, gap, top, optical) => {
    x.font = font; x.fillStyle = color;
    const size = parseFloat(font.match(/([\d.]+)px/)[1]);
    const boxH = size * lh;
    const dx = optical ? -size * OPTICAL : 0;
    let t0 = top + M(gap);
    for (const t of wrapText(x, txt, width)) {
      x.fillText(t, L + dx, boxBase(x, t, t0, boxH));
      t0 += boxH;
    }
    return t0;
  };

  let y = M(PADT);
  y = put('THE MEOWSEUM · THE GIFT SHOP', bask(M(PT(12)), true), GREY2, 1.15, 0, y);
  y = put('免費紀念冊', songti(M(PT(76)), 700), INK, 1.16, 15, y, true);
  y = put('Free Souvenir Catalogue', bask(M(PT(24))), GREY, 1.25, 4, y);
  y = put('CAT-ALOGUE RAISONNÉ: Lady Mimi, Vol. I', bask(M(PT(13))), GREY2, 1.3, 13, y);
  y = put('25 頁 · 繁體中文版 · 148 × 210 mm', songti(M(PT(11.5)), 400), GREY2, 1.5, 1.5, y);

  /* 右欄的封面。圖是非同步下載的，所以先鋪一塊紙灰當底（跟商店那張原照
     同一個做法），圖到了再畫上去；那塊灰也順便當成封面自己的投影底座。 */
  const cx = M(CVR.x), cy = M(CVR.y), cw = M(CVR.w), ch = M(CVR.h);
  x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(cx + M(2.5), cy + M(3.5), cw, ch);
  x.fillStyle = '#E7E3DC'; x.fillRect(cx, cy, cw, ch);
  const tex = canvasTex(c);
  const img = new Image();
  img.onload = () => { x.drawImage(img, cx, cy, cw, ch); tex.needsUpdate = true; };
  img.src = CATALOGUE.cover;

  /* 正文貼底（展籤、告示都是這個規矩：收尾短句固定貼底） */
  const bs = M(PT(16)), es = M(PT(13));
  x.font = songti(bs, 400);
  const bl = wrapText(x, '桌上的四本請自取。電子版也可以帶走——點桌上的書，或點這面告示。', width);
  x.font = bask(es);
  const el2 = wrapText(x, 'Take one. The PDF is free to download: click a book on the table, or this sign.', width);
  const cnBox = bs * 1.95, enBox = es * 1.65;
  const fs = M(PT(11)), fh = fs * 1.15, fy = H - M(PADB) - fh;
  const enTop = fy - M(12) - el2.length * enBox;
  const cnTop = enTop - M(4) - bl.length * cnBox;
  x.fillStyle = INK2;
  bl.forEach((t, i) => {
    x.font = songti(bs, 400);
    x.fillText(t, L, boxBase(x, t, cnTop + i * cnBox, cnBox));
  });
  x.fillStyle = GREY;
  el2.forEach((t, i) => {
    x.font = bask(es);
    x.fillText(t, L, boxBase(x, t, enTop + i * enBox, enBox));
  });

  /* 頁腳貼底，左右各一句（跟廳牌同一個做法） */
  const lb = boxBase(x, 'Hg', fy, fh);
  x.font = songti(fs, 400); x.fillStyle = GREY2;
  x.fillText(DATA.brand.museumCn, L, lb);
  const w1 = x.measureText(DATA.brand.museumCn).width;
  x.font = bask(fs);
  x.fillText(` \u00b7 ${DATA.brand.museumEn.toUpperCase()}`, L + w1, lb);
  x.textAlign = 'right';
  x.fillText(DATA.brand.vol.toUpperCase(), R, lb);
  x.textAlign = 'left';

  return tex;
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

/* 從一張圖做貼圖（取代 TextureLoader），差別只有 fetchPriority：
   入口那面牆是「進館第一眼」，10 件作品的圖在進場之前一張也看不到，
   兩邊一起抓就是讓那 1.8 MB 去搶那面牆的頻寬。所以牆 high、作品 low。
   onReady 一律排進 microtask：圖在快取裡時 ready() 會同步跑，
   而它要呼叫的 hideLoader 還在檔案後面（TDZ），同步叫會炸掉整個模組。 */
function imageTex(src, onReady, priority) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.decoding = 'async';
  if (priority) img.fetchPriority = priority;
  let fired = false;
  const ready = () => {
    if (fired) return; fired = true;
    if (img.naturalWidth) { tex.image = img; tex.needsUpdate = true; }
    if (onReady) queueMicrotask(onReady);
  };
  img.onload = ready;
  img.onerror = ready;
  img.src = src;
  if (img.complete) ready();
  return tex;
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
  board:  new THREE.MeshStandardMaterial({ color: 0x7E7A73, roughness: 0.94, metalness: 0.0 }),
  tee:    new THREE.MeshStandardMaterial({ color: 0x17181A, roughness: 0.88, metalness: 0.0 }),
  lace:   new THREE.MeshStandardMaterial({ color: 0xF2EFE9, roughness: 0.94, metalness: 0.0, side: THREE.DoubleSide }),
  laceB:  new THREE.MeshStandardMaterial({ color: 0xFBF9F5, roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide }),
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

  /* 碑面：淺灰底、墨字、橫排。整檔展覽就從這一句開始，所以只有一句話
     加一行英文，不掛廳名、不標年代、不留分隔線，其餘交給留白。
     板面 2.90 × 3.00 m → 畫布 1200 × 1240，1 px ≈ 2.4 mm。 */
  {
    const W = 1200, H = 1240;
    const INK = '#111213';
    const { c, x } = makeCanvas(W, H);
    x.fillStyle = '#C7C4BE'; x.fillRect(0, 0, W, H);
    x.strokeStyle = INK; x.globalAlpha = 0.13; x.lineWidth = 2;
    x.strokeRect(30, 30, W - 60, H - 60);        // 極淡的內框：讓板面讀得出是一件「物件」
    x.globalAlpha = 1;
    x.textAlign = 'center'; x.textBaseline = 'middle';

    /* 一句話加一行英文，整組垂直置中；兩行之間的距離是固定的，
       不隨字級浮動（1 px ≈ 2.4 mm，所以 62 px ≈ 0.15 m）。 */
    const MAIN = '歡迎';                          // 換句子只要改這一行，級數會自己重算
    const CAP = 140, GAP = 62, EH = 31;           // 級數上限 / 中英文間距 / 英文行高
    x.font = songti(150, 700);
    const size = Math.max(58, Math.min(CAP, 150 * (W * 0.53 / x.measureText(MAIN).width)));
    const top = H * 0.485 - (size + GAP + EH) / 2;

    x.font = songti(size, 700); x.fillStyle = INK;
    x.fillText(MAIN, W / 2, top + size / 2);
    x.font = bask(EH, true); x.fillStyle = INK; x.globalAlpha = 0.48;
    x.fillText('Welcome to The Meowseum.', W / 2, top + size + GAP + EH / 2);

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
  wash.position.set(0, 4.56, -5.20);
  wash.target.position.set(0, 1.45, S.z - 0.20);
  scene.add(wash, wash.target);
  /* 燈長在碑牆上緣，不掛天花板 */
  lightHead(wash.position, wash.target.position);
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
    ? imageTex(TW_ART, hideLoader, 'high')       // <link rel=preload> 已經在抓了，這裡只是接手
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

    /* 燈貼在弧面上沿、不掛天花板——大廳頂上不留燈 */
    lightHead(sp.position, sp.target.position);
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
  const fw = THREE.MathUtils.clamp(0.052 + Math.min(w, h) * 0.06, 0.058, 0.145);
  WORK_LOOK[work.slug] = { pos: pos.clone(), normal: n.clone(), h, w, cy, fw };

  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = orient(n);
  g.userData.slug = work.slug;
  g.userData.room = work.room;
  scene.add(g);
  WORK_GROUPS.push(g);

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
    const tex = imageTex(work.image, null, 'low');
    art = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.74, metalness: 0.0 }));
  } else {
    art = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: placeholderTexture(work, null), roughness: 0.92, metalness: 0.0 }));
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

  return { work, g, pos, n, cy, fw };
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
/* 天花板上沒有燈之後，走道與地板只剩全域微光墊著——
   它沒有形體，所以不會變成「有光、卻找不到燈」的那種光。 */
scene.add(new THREE.AmbientLight(0xB9B2A6, 0.105));
scene.add(new THREE.HemisphereLight(0xC8D2DA, 0x2A2620, 0.20));

/* ------------------------------------------------------------
   燈頭：真的有光的那一點才掛燈
   ------------------------------------------------------------
   做得很小——它的工作是交代「這團光是從哪來的」，不是當裝飾。
   所以位置一律吃 `spot.position`，方向吃 `spot.target.position`，
   不在別的地方另外擺一顆好看的燈：燈擺在光斑正上方，光卻是從別處來的，
   看起來就是假的。過去那些吊在天花板的軌道與吊桿都撤掉了。
   ============================================================ */
function lightHead(pos, target) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(HEAD_R, HEAD_R * 1.18, HEAD_L, 14), MATS.dark);
  tube.position.y = -HEAD_L / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(HEAD_R * 1.05, 14),
    new THREE.MeshBasicMaterial({ color: 0xFFF0DA }));
  lens.position.y = -HEAD_L; lens.rotation.x = Math.PI / 2;     // 發光面朝光的方向
  g.add(tube, lens);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0),
    new THREE.Vector3().subVectors(target, pos).normalize());
  scene.add(g);
  return g;
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

  // 燈長在畫框上緣的正上方，站在畫前面抬頭就看得到
  lightHead(spot.position, spot.target.position);
}

/* 展廳、走道沒有自己的燈——天花板上不該有燈。
   天花板只留全域微光把暗部墊起來（下面的 AmbientLight / HemisphereLight），
   地板與走道的亮度靠作品燈與說明牌燈的餘光。 */

/* 禮品店：唯一的「牆上的東西」是北牆那一排貨架，燈就長在貨架上面，
   一顆一顆往店裡斜打——貨架看得見，店裡也還走得動。 */
for (const [x, w] of [[13.4, 2.4], [16.0, 2.4], [18.6, 2.4]]) {
  const c = new THREE.Vector3(x, 0, ROOMS.IV.z0 + T / 2);
  const n = new THREE.Vector3(0, 0, 1);
  const sp = new THREE.SpotLight(0xFFE7C6, 25, 12, 0.95, 0.92, 1.4);
  sp.position.set(x, 2.95, ROOMS.IV.z0 + T / 2 + 0.36);
  sp.target.position.set(x, 1.5, -54.6);        // 掠過貨架，順便灑一點到地板
  scene.add(sp, sp.target);
  lightHead(sp.position, sp.target.position);
}
{
  /* 東牆那片陳列板也補一顆 */
  const sp = new THREE.SpotLight(0xFFE7C6, 24, 11, 0.86, 0.90, 1.35);
  sp.position.set(21.24, 2.48, -52.90);
  sp.target.position.set(21.84, 1.46, -53.95);       // 一件裙子 + 一張原照，一起顧到
  scene.add(sp, sp.target);
  lightHead(sp.position, sp.target.position);
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
  III: { wall: 'W', at: -45.3 },   // 不放東牆：東牆上是商店的門，牌子會替商店掛名
  IV:  { wall: 'E', at: -48.2 },
};
for (const room of DATA.rooms) {
  const c = CARD_AT[room.numeral];
  if (!c) continue;
  CARD_MESH[room.numeral] = mountCard(room.numeral, c.wall, c.at, 1.62, roomCardTexture(room), 0.841, 1.189,
      `ROOM ${room.numeral} · 廳牌 · ${room.nameCn}`);

  // 說明牆跟作品一樣有自己的一盞燈：光只落在這張廳牌上。
  const { p, n } = surfacePoint(room.numeral, c.wall, c.at);
  const fp = new THREE.Vector3(p.x + n.x * 1.85, ROOMS[room.numeral].h - 0.30, p.z + n.z * 1.85);
  const sp = new THREE.SpotLight(0xFFEFD6, 60, 13, 0.60, 0.84, 1.42);
  sp.position.copy(fp);
  sp.target.position.set(p.x, 1.55, p.z);
  scene.add(sp, sp.target);
  lightHead(sp.position, sp.target.position);
}

/* 內容海報：貼在大廳通往 Room I 的牆上，門洞兩側各一張。
   這裡是「走過主視覺牆之後」的下一眼，所以放的是館內到底展了什麼。 */
{
  const P = { w: 1.190, h: 1.682, y: 1.88 };                 // 約 A0 的兩倍
  /* 面向這面牆時，−x 在人的左手邊 */
  const SIDES = [
    { at: -3.50, tex: posterIntroTexture(), cap: 'THE MEOWSEUM · VOL. I · 展覽總介紹' },
    { at:  3.50, tex: posterMapTexture(),   cap: 'THE MEOWSEUM · VOL. I · 展場平面圖' },
  ];
  SIDES.forEach((side, i) => {
    const m = mountCard('hall', 'N', side.at, P.y, side.tex, P.w, P.h, side.cap);
    CARD_MESH['poster' + i] = m;

    const { p, n } = surfacePoint('hall', 'N', side.at);
    const fp = new THREE.Vector3(p.x + n.x * 2.70, ROOMS.hall.h - 0.30, p.z + n.z * 2.70);
    const sp = new THREE.SpotLight(0xFFEFD6, 82, 15, 0.34, 0.86, 1.42);
    sp.position.copy(fp);
    sp.target.position.set(p.x, P.y, p.z);
    scene.add(sp, sp.target);
    lightHead(sp.position, sp.target.position);
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
/* 中央那張展示桌。桌面很寬，平放的手冊照實體尺寸排開——
   手冊是 210 × 297 mm，四本並排加起來還不到桌子的一半。

   原本想在南牆／東牆做一座立式手冊架，後來撤掉了：這個空間只有 12 × 16 m，
   再加一座 1.1 m 寬、1.7 m 高的架子，四張牆就擠滿了，弧面也救不回來。
   手冊改放桌上——觀眾本來就會走到桌前，紙在桌上也讀得到。 */
box(15.6, 0.50, -41.5, 3.2, 1.00, 0.70, 'bench', { collide: true });
box(15.6, 1.02, -41.5, 3.3, 0.05, 0.80, 'coral', { collide: false });

/* 桌上平放的展冊：面朝上、稍微轉一個角度。四本都是同一本，尺寸就是展冊的
   實物尺寸 A5（148 × 210 mm）。紙很薄，所以只是一片 6 mm 的板子貼封面；
   真正厚度的陰影在這個暗室裡看不到。

   ★ 封面要朝著店裡（北側）。觀眾從西牆的門（z ≈ −47.5）進來，走到桌前是站在
   桌子的北邊低頭看；第一版讓封面朝南牆，一行人從店裡看過去四本全是倒的。 */
{
  const BW = 0.148, BH = 0.210, D = 0.006, TOP = 1.045 + D / 2;
  const PITCH = 0.178, Z = -41.62;
  const x0 = 15.6 - PITCH * (TABLE_BOOKS - 1) / 2;      // 四本以桌子中心排開
  const tex = catalogueCoverTexture(CATALOGUE.cover);
  for (let i = 0; i < TABLE_BOOKS; i++) {
    const side = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.94, metalness: 0.0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(BW, D, BH), [
      side,                              // +x 書口
      side,                              // −x 書口
      new THREE.MeshStandardMaterial({   // +y 封面
        map: tex, roughness: 0.90, metalness: 0.0, emissive: 0xFFFFFF,
        emissiveMap: tex, emissiveIntensity: 0.10,
      }),
      side,                              // −y 封底
      side,                              // +z 頁尾
      side,                              // −z 書脊
    ]);
    m.position.set(x0 + i * PITCH, TOP, Z);
    m.rotation.y = Math.PI + 0.05 - i * 0.03;   // π：封面轉向店裡那一側
    scene.add(m);
    OCCLUDERS.push(m);
    SHEET.push({ mesh: m, room: 'IV', pdf: CATALOGUE.pdf,
      cap: CATALOGUE.cap, short: CATALOGUE.short });
  }
  COLLIDERS.push({ x0: x0 - BW / 2 - 0.03, x1: x0 + PITCH * (TABLE_BOOKS - 1) + BW / 2 + 0.03,
    z0: Z - BH / 2, z1: Z + BH / 2 });

  /* 桌燈。這一顆不是裝飾——展示桌原本落在貨架燈的射程外，
     桌面整片是黑的，桌上的東西等於不存在。燈從北邊斜下來（北牆那排燈的位置），
     光才不會跟著觀眾的頭一起擋住紙面。 */
  /* 強度與高度是量出來的：桌面是消光材質、燈又離得遠，
     照「貨架燈那個數量級」（i=25、離 0.6 m）換算，桌面上只有它的 1/7，
     等於沒開燈。所以燈收近到 1.9 m 高、正對桌上那排紙，強度提到 70。 */
  /* 桌面的亮度不能只靠 SpotLight：這個場景的燈衰減是 1.4 次方，
     燈掛在 2 m 高的話，桌面拿到的能量只有貨架燈（燈離貨架 0.6 m）的 1/8，
     白桌面也會變成一片灰。所以照展籤的做法——紙自己帶 ±，
     桌面再補一片 additive 的柔光暈（MATS.pool 同一套貼圖），
     燈只負責在桌面上留下一個看得出來源的亮斑。 */
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.66),
    new THREE.MeshBasicMaterial({ map: POOL, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(15.6, 1.047, -41.50);
  scene.add(glow);

  for (const dx of [-0.42, 0.42]) {
    const sp = new THREE.SpotLight(0xFFE7C6, 62, 6, 0.72, 0.86, 1.4);
    sp.position.set(15.6 + dx, 2.05, -43.55);      // 往店裡退開，別壓在桌沿上
    sp.target.position.set(15.6 + dx * 0.55, 1.00, -41.70);
    scene.add(sp, sp.target);
    lightHead(sp.position, sp.target.position);
  }
}

/* ---------------- 牆上的「免費紀念冊」告示 ----------------
   展示桌的正後方就是南牆（z = −40）：觀眾站在桌子北側低頭看那四本，
   抬頭看到的就是這面牆，告示掛這裡才成對。掛法用廳牌那一支 mountCard
   （白卡、貼牆、進 SHEET、點一下攤平放大），所以它本身也可以點開、
   也可以下載（paper.pdf）。

   點它的時候不攤平那張紙（紙就掛在觀眾眼前，放大一遍只是把同一句話再說
   一次），直接開下載面板：左邊封面、中間下載鈕（paper.offer，見 openSheet）。 */
{
  const W = 0.841, H = 0.594, SIGN_Y = 1.98;        // A1 橫版
  const sign = mountCard('IV', 'S', 15.6, SIGN_Y, catalogueSignTexture(), W, H,
    '免費紀念冊 · 商店告示');
  const paper = SHEET.find((s) => s.mesh === sign);
  if (paper) {
    paper.pdf = CATALOGUE.pdf; paper.short = '看告示';
    paper.offer = CATALOGUE;
    /* 白卡在 mountCard 裡帶 0.10 的自發光：對深綠底的廳牌是好事（暗室裡
       讓它不要沉下去），對這張滿版白紙是多餘的亮——紙面被推上滿白，墨色
       跟著一起被抬起來。 */
    sign.material.emissiveIntensity = 0.04;
  }

  /* 這面牆原本一顆燈也沒有，告示會整片掉進黑裡。燈從店裡斜打上去，
     位置比桌燈更靠天花板，觀眾的影子才不會蓋在紙上。

     強度是量出來的（2026-09-17，站在 2 m 外截圖數像素）：34 打在 A2 上，
     紙面 251（近滿白）、標題的墨只剩 74——「太亮，直接看不清」就是這件事：
     白紙本來就吃光，而 ACES 在高光端是壓縮的，紙面越接近滿白，墨色被抬得
     越兇。燈壓到 8 之後**紙面還是 249**（白紙壓不下去），墨從 74 回到 41。
     要壓的是墨，所以燈要壓得比「紙看起來太亮」那個直覺更低。 */
  const sp = new THREE.SpotLight(0xFFE7C6, 8, 8, 0.62, 0.86, 1.4);
  sp.position.set(15.6, 3.10, -42.55);
  /* 目標點放在紙面上，不是牆面上：紙貼在牆前 13 mm，目標點壓在牆面的話，
     光軸穿過紙面時會偏掉 6 cm（燈是斜的，13 mm 的落差在 2.7 m 的光程上被放大）。 */
  const face = surfacePoint('IV', 'S', 15.6);
  sp.target.position.set(face.p.x, SIGN_Y, face.p.z);
  scene.add(sp, sp.target);
  lightHead(sp.position, sp.target.position);
}

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

box(9.80, 3.62, -47.5, 0.10, 0.24, 0.66, 'exit', { collide: false });   // 掛在門楣上，不要浮在門洞中間

/* ---------------- 僅存的那件裙子 ----------------
   東牆陳列板前面掛著店裡唯一一件還在的商品：小貴婦尺寸的黑 T 恤 + 白蕾絲裙。
   尺寸照她的身量做（上身 + 裙子約 42 cm）——這是她的衣服，不是童裝。
   吊牌寫「非賣品」，跟門口那張告示同一件事。
   衣架、裙身都在同一個平面上，牆上那根釘子沿著法線穿過衣架勾——
   吊衣架就是這樣掛的，勾面跟衣服同一個平面，桿子穿過去。 */
function dressTagTexture() {
  const W = 360, H = 226;
  const { c, x } = makeCanvas(W, H);
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(17,18,19,.48)'; x.lineWidth = 3.5;
  x.strokeRect(12, 12, W - 24, H - 24);
  x.textAlign = 'center';
  x.fillStyle = INK; x.font = songti(74, 700);
  x.fillText('非賣品', W / 2, 106);
  x.fillStyle = GREY; x.font = bask(30);
  x.fillText('NOT FOR SALE', W / 2, 154);
  x.fillStyle = GREY2; x.font = songti(25, 400);
  x.fillText('僅存一件', W / 2, 194);
  x.textAlign = 'left';
  return canvasTex(c);
}

{
  const DZ = -53.50, WALLX = ROOMS.IV.x1 - T / 2;      // 牆面 x = 21.86
  const g = new THREE.Group();
  g.position.set(WALLX - 0.07, 0, DZ);
  g.rotation.y = -Math.PI / 2;                          // 正面朝 −x（店裡）
  scene.add(g);

  const add = (mesh) => { g.add(mesh); OCCLUDERS.push(mesh); return mesh; };
  const rod = (x1, y1, x2, y2, th, d, matKey) => {      // 平面上兩點之間的一根桿件
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), th, d), MATS[matKey]);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    return add(m);
  };

  const HOOK_Y = 1.760;                 // 牆上那根釘子的高度
  const SY = HOOK_Y - 0.040;            // 衣架頂點，衣服的肩線掛在這兩支木臂上

  // 釘子 + 衣架勾
  const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, 10), MATS.dark);
  peg.rotation.x = Math.PI / 2;
  peg.position.set(0, HOOK_Y, -0.015);
  add(peg);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0030, 6, 20), MATS.dark);
  hook.position.set(0, HOOK_Y - 0.019, 0);
  add(hook);

  // 木衣架：頂點兩側各一支臂
  rod(0, SY, -0.155, SY - 0.038, 0.010, 0.014, 'wood');
  rod(0, SY, 0.155, SY - 0.038, 0.010, 0.014, 'wood');
  rod(-0.150, SY - 0.037, 0.150, SY - 0.037, 0.011, 0.016, 'wood');

  // T 恤：肩線貼著衣架臂，袖口垂下來，領口往下凹
  const tee = new THREE.Shape();
  tee.moveTo(-0.050, SY - 0.011);
  tee.lineTo(-0.116, SY - 0.029);       // 左肩
  tee.lineTo(-0.163, SY - 0.072);       // 左袖外上
  tee.lineTo(-0.160, SY - 0.132);       // 左袖外下
  tee.lineTo(-0.124, SY - 0.124);       // 左袖內下
  tee.lineTo(-0.104, SY - 0.086);       // 左腋
  tee.lineTo(-0.106, SY - 0.216);       // 左下襬
  tee.lineTo(0.106, SY - 0.216);
  tee.lineTo(0.104, SY - 0.086);
  tee.lineTo(0.124, SY - 0.124);
  tee.lineTo(0.160, SY - 0.132);
  tee.lineTo(0.163, SY - 0.072);
  tee.lineTo(0.116, SY - 0.029);
  tee.lineTo(0.050, SY - 0.011);
  tee.quadraticCurveTo(0, SY - 0.042, -0.050, SY - 0.011);
  const teeGeo = new THREE.ExtrudeGeometry(tee, { depth: 0.052, bevelEnabled: false });
  teeGeo.translate(0, 0, -0.026);
  add(new THREE.Mesh(teeGeo, MATS.tee));

  // 蕾絲裙：車出來的 A 字，深度壓扁；花邊是一圈一圈疊上去的蕾絲
  const CY = SY - 0.192, SH = 0.200;
  const A = [
    [0.100, 0.00], [0.110, -0.26], [0.124, -0.52], [0.141, -0.78], [0.156, -1.00],
  ];
  const skirtGeo = new THREE.LatheGeometry(A.map(([r, t]) => new THREE.Vector2(r, t * SH)), 30);
  skirtGeo.scale(1, 1, 0.62);
  const skirt = new THREE.Mesh(skirtGeo, MATS.lace);
  skirt.position.set(0, CY, 0);
  add(skirt);
  const rAt = (t) => {
    for (let i = 1; i < A.length; i++) {
      if (t <= -A[i][1] || i === A.length - 1) {
        const [r0, t0] = A[i - 1], [r1, t1] = A[i];
        const k = (-t - -t0) / (t1 - t0);
        return r0 + (r1 - r0) * Math.min(1, Math.max(0, k));
      }
    }
    return A[0][0];
  };
  const layer = (t0, t1, d0, d1, matKey) => {           // 疊在裙身上的一層蕾絲
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const k = i / 6, t = t0 + (t1 - t0) * k;
      pts.push(new THREE.Vector2(rAt(t) + d0 + (d1 - d0) * k, -SH * t));
    }
    const geo = new THREE.LatheGeometry(pts, 30);
    geo.scale(1, 1, 0.62);
    const m = new THREE.Mesh(geo, MATS.laceB);
    m.position.set(0, CY, 0);
    return add(m);
  };
  layer(0.50, 1.00, 0.0000, 0.0055);                    // 裙襬那一層
  layer(0.86, 1.00, 0.0055, 0.0120);                    // 最下面再壓一圈

  // 吊牌：別在左袖口
  rod(-0.150, SY - 0.100, -0.150, SY - 0.124, 0.0022, 0.0022, 'dark');
  const tagTex = dressTagTexture();
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.050, 0.0314), new THREE.MeshStandardMaterial({
    map: tagTex, roughness: 0.92, metalness: 0.0,
    emissive: 0xFFFFFF, emissiveMap: tagTex, emissiveIntensity: 0.05,
  }));
  tag.position.set(-0.152, SY - 0.140, 0.032);
  tag.rotation.set(-0.20, 0.10, 0.15);
  add(tag);
}

/* ---------------- 相框裡的那張原照 ----------------
   店裡除了實物，還掛著這件裙子唯一的照片：小貴婦本人穿著它。
   照片先畫到 canvas 上再當貼圖——SHEET（點一下攤平放大）只認 canvas，
   認不得 HTMLImageElement，所以不能直接把圖丟給 TextureLoader。 */
function shopPhotoTexture(src) {
  const W = 1400, H = Math.round(W * 4 / 3);          // 原圖 3072 × 4096
  const { c, x } = makeCanvas(W, H);
  x.fillStyle = '#E7E3DC'; x.fillRect(0, 0, W, H);
  const tex = canvasTex(c);
  const img = new Image();
  img.onload = () => { x.drawImage(img, 0, 0, W, H); tex.needsUpdate = true; };
  img.src = src;
  return tex;
}

if (DATA.shopPhoto && DATA.shopPhoto.image) {
  const PW = 0.166, PH = PW * 4 / 3;
  const g = new THREE.Group();
  g.position.set(ROOMS.IV.x1 - T / 2, 1.50, -54.44);   // 東牆，陳列板的北邊
  g.rotation.y = -Math.PI / 2;                          // 正面朝 −x（店裡）
  scene.add(g);

  const back = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.020, PH + 0.020, 0.014), MATS.dark);
  back.position.set(0, 0, 0.007);
  g.add(back); OCCLUDERS.push(back);

  const tex = shopPhotoTexture(DATA.shopPhoto.image);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.48, metalness: 0.0, envMap: ENV, envMapIntensity: 0.22,
  }));
  photo.position.set(0, 0, 0.0152);
  g.add(photo);
  SHEET.push({ mesh: photo, room: 'IV', cap: '商品照 · 原圖', short: '看照片' });
}

box(22 - T / 2 - 0.02, 1.5, -53.5, 0.04, 1.1, 0.8, 'board', { collide: false });

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
  const es = Math.round(H * 0.055);           // 英文那行
  const cs = Math.round(H * 0.036);           // 出處那行（最小一級）
  /* 四層——索引／主句／英文／出處——當成一整組在版面裡垂直置中，
     三個 gap 都是基線到基線的距離。 */
  const g0 = fs * 1.15, g1 = H * 0.20, g2 = H * 0.115;
  const top = H / 2 - (g0 + g1 + g2) / 2;
  const yEn = top + g0 + g1, yCre = yEn + g2;
  let y = top + g0;

  // 索引：主句上方一段距離，兩側各一條短線
  const ry = top;
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
  x.fillText(phrase.en, W / 2, yEn);

  /* 出處：牆上這些話是小貴婦說的。最小一級，壓在英文下面。 */
  const c1 = '—— 小貴婦', c2 = 'LADY MIMI';
  x.font = songti(cs, 400);
  const w1 = x.measureText(c1).width;
  x.font = bask(cs * 0.92);
  const w2 = x.measureText(c2).width;
  const sep = cs * 1.3, x0 = W / 2 - (w1 + sep + w2) / 2;
  x.textAlign = 'left'; x.fillStyle = 'rgba(232,222,200,.46)';
  x.font = songti(cs, 400); x.fillText(c1, x0, yCre);
  x.font = bask(cs * 0.92); x.fillText(c2, x0 + w1 + sep, yCre);
  x.textAlign = 'center';

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

let sheetEntry = null, sheetCloseTimer = 0;
function openSheet(entry) {
  sheetEntry = entry;
  const src = entry.mesh.material.map && entry.mesh.material.map.image;
  const sh = el('sheet');
  clearTimeout(sheetCloseTimer);
  sh.classList.remove('off');
  /* 換一張紙（已經開著的時候）不重跑進場動畫，直接換圖就好 */
  if (!sh.classList.contains('on')) {
    void sh.offsetWidth;               // 強制重排，動畫才會每次都從頭跑
    sh.classList.add('on');
  }
  /* 先把 canvas 的像素尺寸寫進 width/height：那兩個屬性就是「載入前」的內在尺寸，
     少了它，src 剛換上去、圖還沒解碼的那一瞬間整張紙是 0×0，
     進場動畫會從一粒米彈成一張海報。CSS 的 max-* 還是照樣把它夾進視窗。 */
  /* 告示那一張不攤平：紙就掛在觀眾眼前，放大只是把同一句話再說一次。人點它
     是想把電子版帶走，所以換成一片下載面板（左邊封面、中間下載鈕）。面板上
     那顆下載鈕和右上角那顆指向同一份檔案，只是這張紙不需要右上角那顆。 */
  const offer = el('sheetOffer');
  sh.classList.toggle('offer', !!entry.offer);
  if (entry.offer) {
    const o = entry.offer;
    el('offerCover').src = o.cover;
    el('offerTitle').textContent = o.dlTitle;
    el('offerEn').textContent = o.dlTitleEn;
    el('offerMeta').textContent = o.dlMeta;
    el('offerDl').href = o.pdf;
  }
  const img = el('sheetImg');
  if (entry.offer) {
    /* 面板底下那張圖不載入。留著上一張紙的 src 也無所謂——CSS 在 .offer 時
       把 figure 整個收起來；這裡只是不做白工（那張 canvas 轉 dataURL 是
       2944 px，要幾十毫秒）。 */
  } else if (src && src.toDataURL) {
    /* 比例相關的三個宣告也寫一份 inline。width/height 屬性的值在 CSS 裡算 px，
       只要 index.html 還是舊版（`#sheet img` 少了 width:auto;height:auto），
       兩個方向就會各自被 max-* 夾一次而變形——2026-09-17 那次就是這樣：
       app.js 已經換好、index.html 的 CSS 還沒跟上，開著舊頁面的人點開廳牌
       看到一張被拉寬的 A0（2100×2970 被夾成 1293×607）。寫在元素上就不看
       index.html 的版本：舊頁面配新程式也會是對的形狀。 */
    img.style.width = 'auto'; img.style.height = 'auto'; img.style.objectFit = 'contain';
    img.width = src.width; img.height = src.height;
    img.src = src.toDataURL('image/png');
  } else {
    img.removeAttribute('width'); img.removeAttribute('height'); img.removeAttribute('src');
  }
  el('sheetCap').textContent = entry.cap || '';
  /* 有電子版的紙（桌上的展冊）多一顆下載鈕。沒有的紙連 href 都不留——留著
     會讓瀏覽器把「下載」當成離開頁面。告示那張不掛這顆：面板上已經有一顆
     大的，同一份檔案掛兩顆只是讓人猶豫要按哪一顆。 */
  const dl = el('sheetDl');
  if (entry.pdf && !entry.offer) { dl.href = entry.pdf; dl.hidden = false; }
  else { dl.hidden = true; dl.removeAttribute('href'); }
  zReset();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeSheet() {
  const sh = el('sheet');
  if (!sh.classList.contains('on')) return;
  sheetEntry = null;
  sh.classList.add('off');             // 收場動畫（CSS），跑完才真的收起來
  clearTimeout(sheetCloseTimer);
  sheetCloseTimer = setTimeout(() => {
    sh.classList.remove('on', 'off');
    el('sheetImg').removeAttribute('src');   // 太早拿掉，圖會在淡出的半路上先消失
  }, 260);
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
  /* 兩段式入場：第一張「這是什麼展」，第二張「怎麼逛」。
     換段時前一張先淡出、空一拍（GATE_GAP）、下一張才淡入——
     兩張卡同時疊上去會讀成一張很長的表單，不像兩個彈窗。 */
  const GATE_GAP = 340;
  const cards = { 1: el('gateCard'), 2: el('gateCard2') };
  let gateStep = 1;
  function gotoStep(n) {
    if (gateOff || n === gateStep) return;
    const cur = cards[gateStep];
    gateStep = n;
    el('gate').dataset.step = String(n);
    cur.classList.remove('on');
    cur.classList.add('out');
    setTimeout(() => {
      cur.classList.remove('out');
      cards[n].classList.add('on');
    }, GATE_GAP);
  }
  el('gStep2').onclick = () => gotoStep(2);
  el('gBack').onclick = () => gotoStep(1);
  el('gGo').onclick = enter;
  addEventListener('keydown', (e) => {
    if (gateOff) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (gateStep === 1) gotoStep(2); else enter();
    } else if (e.key === 'Escape' && gateStep === 2) {
      gotoStep(1);
    }
  });
}

let loaderHidden = false;
function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  /* 不直接關掉：讓準備畫面自己把數字補到 100 再淡出。
     分頁被切到背景時 rAF 會停，所以補一個保險。 */
  LOAD.done();
  setTimeout(() => el('load').classList.add('off'), 2600);
}

/* 收掉準備畫面的時機只有一個：入口那面牆的圖稿到位（見 TW_ART 的 callback）。
   那面牆是進館第一眼，寧可多等一秒也不要空牆——作品的圖再快都不算數。
   index.html 那邊另有一個 15 秒的保險，圖稿萬一掛掉也不會永遠停在準備畫面。 */
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
  /* 沒有 slug、也沒有廳號的紙（桌上的展冊、牆上那面告示）：用 cap 找。
     跟 cardPose / labelPose 同一支，驗收截圖才不用把機位寫死。 */
  paperPose(key, dist = 2.0) {
    scene.updateMatrixWorld(true);
    const e = SHEET.find((s) => (s.cap || '').includes(key));
    return e ? facePose(e.mesh, e.mesh.userData.n, dist) : null;
  },
  rooms: ROOMS, works: WORK_LOOK, featureWall: TW, titleWallArt: TW_ART,
  flatTitleWall() { if (!TW_CANVAS) titleWallTexture(); return TW_CANVAS.toDataURL('image/png'); },
  flatPoster() { if (!POSTER_CANVAS) posterIntroTexture(); return POSTER_CANVAS.toDataURL('image/png'); },
  flatPosterMap() { if (!POSTER_MAP_CANVAS) posterMapTexture(); return POSTER_MAP_CANVAS.toDataURL('image/png'); },
  colliders: COLLIDERS,
};

renderMap();
LOAD.mile(76, '等入口主視覺 · Waiting for the entrance wall');
if (isTouch) hideLoader();          // 手機只顯示說明卡，不必跑 3D 迴圈
else requestAnimationFrame(tick);
console.log('%cTHE MEOWSEUM', 'font:600 13px Baskerville,serif', '展館已載入 · Vol. I');
