/* ======================================================================
   SCRIPT.JS — the wardrobe itself: settings, matching rules, the views and every button.
   It works with these files (see the bottom of index.html):
     db.js        saves each person's closet inside their own browser
     zip.js       packs and unpacks backup files
     backup.js    what goes into a BACKUP file, and how RESTORE reads it
     photos.js    getting photos ready (shrink, crop, colour guess)
     cutout.js    background removal
     doll.js      the doll: drawing it, body markers, FIT PIECES, USE MY PHOTO
     add-piece.js the ADD PIECE screens, and editing pieces
   ====================================================================== */

/* ======================================================================
   SETTINGS — change these
   ====================================================================== */
const CONFIG = {
  ownerName: "MY",            // shows as "MY WARDROBE". Try "MEGAN'S" or your name.
  hemisphere: "south",        // NZ! Picks the starting season from today's date. Use "north" to flip.
  backupReminderDays: 7,      // gently suggest a backup when the last one is older than this
  // The default doll: this picture if the file exists, otherwise the drawn mannequin.
  // (800 x 2000 px PNG, see sizes in README.txt.) Set to null to always use the mannequin.
  silhouette: "images/doll-silhouette.png",
  // Where the silhouette's head/shoulders/waist/ankles are. null = measured from the picture automatically.
  silhouetteMarks: null,
  // Where this site's code is published (the AGPL licence asks for a link to it). "" hides the link.
  sourceCode: ""
};

/* ======================================================================
   YOUR CLOTHES — everyone's clothes are saved in their own browser (see db.js),
   so there's no list of clothes in this file. Each piece is saved with these tags:
   cat:     top | bottom | dress | jacket | shoes | earrings | bracelets | scarves | hats | sunnies | underwear
   color:   the main colour. Neutrals: black white cream grey navy brown tan olive denim gold silver
            Accent colours: yellow orange coral pink red purple lilac blue green multi
   pattern: solid | print | plaid | floral | dots | stripes   (lace and knit count as solid)
   shape:   tops/dresses: fitted | loose     bottoms: fitted | wide | flare
   crop:    true for cropped tops
   dressy:  0 = sporty/outdoor, 1 = casual, 2 = everyday, 3 = going out
   seasons: which seasons you'd wear it in
   box:     where the photo sits on the doll [left, top, width, height] (the doll is 200 wide, 500 tall)
   stretch: true lets the photo squash to fit its box (used for long pants laid out flat)
   image:   the cut-out photo (earrings also have imageL and imageR: one photo per ear)
   ====================================================================== */
let ITEMS = [];   // filled in from this browser's storage when the page opens (see loadCloset)
const SEASON_LIST = ["spring", "summer", "fall", "winter"];

// The colour names a piece can be tagged with, and roughly what each looks like.
// Used for the swatches on the tag form, and to guess a new photo's main colour.
const COLORS = {
  black: "#1E1B1E", white: "#F4F2EE", cream: "#EDE3CC", grey: "#8E8C90", navy: "#24304F", brown: "#6E4A33",
  tan: "#C7A27C", olive: "#6E6B3A", denim: "#5873A0", gold: "#C9A43E", silver: "#B9BBC2",
  yellow: "#F2D33D", orange: "#EE8A2C", coral: "#F0796A", pink: "#F29CC0", red: "#C92A35",
  purple: "#6F3A8E", lilac: "#B9A3DA", blue: "#3F6FD1", green: "#3E9A55", multi: null
};

// Where a new piece sits on the doll until it's moved: [left, top, width, height]
const DEFAULT_BOX = {
  top: [50, 86, 100], bottom: [62, 197, 76], dress: [52, 88, 96], jacket: [24, 80, 152],
  shoes: [40], earrings: [14], bracelets: [143, 232, 22], scarves: [66, 76, 68],
  hats: [72, 8, 56], sunnies: [75, 38, 50], underwear: [56, 90, 88]
};

// A better starting spot for a new piece, using its photo's shape (ratio = width ÷ height).
// Long, thin photos are long pieces (trousers, maxi dresses), so they reach further down the doll.
function defaultBox(cat, shape, ratio, isPair) {
  const centred = (top, w, h) => (h ? [100 - w / 2, top, w, h] : [100 - w / 2, top, w]);
  const tall = (top, h, minW, maxW) => centred(top, Math.max(minW, Math.min(maxW, h * ratio)), h);
  if (cat === "top") return centred(84, shape === "loose" ? 136 : 100);
  if (cat === "dress") return ratio < 0.42 ? tall(88, 360, 70, 140) : centred(88, shape === "loose" ? 112 : 96);
  if (cat === "bottom") return ratio < 0.55 ? tall(197, 255, 64, 110) : ratio < 0.85 ? tall(197, 160, 64, 110) : centred(197, 76);
  if (cat === "shoes") return [isPair ? 26 : 40];
  return DEFAULT_BOX[cat].slice();
}

/* ======================================================================
   MATCHING RULES — based on common styling advice
   ====================================================================== */
const NEUTRALS = ["black", "white", "cream", "grey", "navy", "brown", "tan", "olive", "denim", "gold", "silver"];

// Colour pairs that work (complementary or close neighbours on the colour wheel)
const GOOD_PAIRS = [
  ["yellow", "blue"], ["yellow", "lilac"], ["yellow", "purple"], ["yellow", "green"],
  ["orange", "blue"], ["coral", "blue"], ["pink", "blue"], ["lilac", "blue"], ["purple", "blue"],
  ["pink", "lilac"], ["pink", "purple"], ["lilac", "purple"], ["coral", "pink"], ["green", "blue"],
  ["red", "blue"], ["yellow", "pink"], ["yellow", "orange"], ["yellow", "coral"]
];
// Colour pairs that usually fight
const BAD_PAIRS = [
  ["red", "pink"], ["red", "orange"], ["red", "coral"], ["orange", "pink"], ["orange", "purple"],
  ["orange", "lilac"], ["coral", "purple"], ["red", "green"], ["coral", "orange"], ["red", "purple"]
];
const BOLD_PATTERNS = ["print", "plaid", "floral", "dots", "stripes"];

/* ====================================================================== */

const CATS = {
  top: "TOPS", bottom: "BOTTOMS", dress: "DRESSES", jacket: "JACKETS", shoes: "SHOES",
  earrings: "EARRINGS", bracelets: "BRACELETS", scarves: "SCARVES", hats: "HATS",
  sunnies: "SUNNIES", underwear: "UNDERWEAR"
};
const ACC = ["jacket", "shoes", "earrings", "bracelets", "scarves", "hats", "sunnies", "underwear"];
const SEASONS = ["ALL", "SPRING", "SUMMER", "FALL", "WINTER"];
const VIEWS = [["doll", "DOLL"], ["browse", "BROWSE"], ["catalog", "CATALOG"], ["lookbook", "LOOKBOOK"]];
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// iPhones/iPads (newer iPads say they're Macs, but Macs don't have touch screens)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// true when the site was opened from a home-screen icon instead of the browser
const STANDALONE = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let byId = {};   // every piece by its id, plus its catalog number (idx). Rebuilt by loadCloset.
const get = id => (id && byId[id] ? byId[id] : null);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad3 = n => String(n).padStart(3, "0");
const pickR = arr => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
// plural(1, "LOOK") -> "1 LOOK"    plural(2, "LOOK") -> "2 LOOKS"    plural(2, "look") -> "2 looks"
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : /[a-z]$/.test(word) ? "s" : "S"}`;

// The season on a date (today if no date is given), e.g. "SPRING"
function seasonOf(date = new Date()) {
  const m = date.getMonth(); // 0 = Jan
  const north = ["WINTER", "WINTER", "SPRING", "SPRING", "SPRING", "SUMMER", "SUMMER", "SUMMER", "FALL", "FALL", "FALL", "WINTER"][m];
  if (CONFIG.hemisphere !== "south") return north;
  return { WINTER: "SUMMER", SUMMER: "WINTER", SPRING: "FALL", FALL: "SPRING" }[north];
}
const seasonNow = () => seasonOf(new Date());

const emptyOutfit = () => ({ top: null, bottom: null, shoes: null, jacket: null, earrings: null, bracelets: null, scarves: null, hats: null, sunnies: null, underwear: null });

let state = {
  season: seasonNow(),
  view: "doll",
  accCat: "shoes",
  catFilter: "all",
  // Clean slate: every time the page opens, the doll starts in a random underwear set and nothing else
  // (picked in start() once the closet has loaded).
  outfit: emptyOutfit(),
  saved: [],
  loading: true,
  editing: false,  // true when the catalog's EDIT PIECES switch is on
  fitting: false,  // true while FIT PIECES is on (dragging pieces on the doll)
  fitId: null,     // which piece FIT PIECES is moving
  lookSeason: "ALL"   // the LOOKBOOK's season filter
};
let busy = false;

/* ---------- storage: this browser's private closet (see db.js) ---------- */
let photoURLs = [];       // temporary web addresses that let <img> tags show the saved photos
let backupInfo = { key: "backupInfo", last: null, changes: 0 };   // when the last backup was made
let storageOK = true;     // false if this browser won't let the site save (e.g. some private windows)
let storageKept = false;  // true once the browser has promised not to clear the closet

// Tidy up a saved piece so the rest of the code can trust it (fills in any missing tags).
function normalizeItem(rec) {
  if (!rec || typeof rec.id !== "string" || !(rec.image instanceof Blob)) return null;
  const cat = CATS[rec.cat] ? rec.cat : "top";
  const seasons = Array.isArray(rec.seasons) ? rec.seasons.filter(s => SEASON_LIST.includes(s)) : [];
  const it = {
    ...rec,
    cat,
    name: String(rec.name || "Unnamed piece"),
    color: typeof rec.color === "string" ? rec.color : "multi",
    pattern: typeof rec.pattern === "string" ? rec.pattern : "solid",
    seasons: seasons.length ? seasons : [...SEASON_LIST],
    box: Array.isArray(rec.box) && rec.box.length ? rec.box.map(Number) : DEFAULT_BOX[cat].slice(),
    created: Number(rec.created) || 0
  };
  if (cat !== "underwear" && typeof it.dressy !== "number") it.dressy = 2;
  if (["top", "bottom", "dress", "jacket"].includes(cat) && !it.shape) it.shape = "fitted";
  return it;
}

// Read everything from the browser's storage into ITEMS and state.saved.
async function loadCloset() {
  photoURLs.forEach(u => URL.revokeObjectURL(u));
  photoURLs = [];
  const url = blob => { const u = URL.createObjectURL(blob); photoURLs.push(u); return u; };
  const [items, looks, info, doll] = await Promise.all([DB.getAll("items"), DB.getAll("looks"), DB.get("settings", "backupInfo"), DB.get("settings", "doll")]);
  Doll.setMine(doll || null);   // this person's own photo doll, if they made one
  await Lookbook.load();        // outfit photos (see lookbook.js)
  ITEMS = items.map(normalizeItem).filter(Boolean)
    .sort((a, b) => a.created - b.created)
    .map(it => ({
      ...it,
      img: url(it.image),
      imgL: it.imageL instanceof Blob ? url(it.imageL) : null,
      imgR: it.imageR instanceof Blob ? url(it.imageR) : null
    }));
  byId = Object.fromEntries(ITEMS.map((it, i) => [it.id, { ...it, idx: i + 1 }]));
  state.saved = looks.filter(s => s && s.outfit).sort((a, b) => (b.n || 0) - (a.n || 0));
  if (info) backupInfo = info;
}

// Save or delete one record, then count it as a change (for the backup reminder).
function saveRecord(store, record) {
  return DB.put(store, record).then(noteChange, storageError);
}
function deleteRecord(store, key) {
  return DB.remove(store, key).then(noteChange, storageError);
}
async function noteChange() {
  backupInfo.changes = (backupInfo.changes || 0) + 1;
  try { await DB.put("settings", backupInfo); } catch (e) { /* not important */ }
  askToKeepData();
  renderChrome();
}
function storageError(err) {
  toast(err && err.name === "QuotaExceededError"
    ? "THIS DEVICE IS OUT OF SPACE, SO THAT WASN'T SAVED. FREE UP SOME SPACE, THEN TRY AGAIN."
    : "COULDN'T SAVE THAT. RELOAD THE PAGE AND TRY AGAIN.");
}

// Ask the browser to keep the closet even when the device is low on space.
// (Chrome decides by itself; Firefox may ask the person; Safari is happiest from the home screen.)
async function askToKeepData() {
  if (storageKept || !navigator.storage || !navigator.storage.persist) return;
  try { storageKept = (await navigator.storage.persisted()) || (await navigator.storage.persist()); }
  catch (e) { /* not supported: fine */ }
}

/* ---------- backup reminder ---------- */
function daysAgo(time) {
  const day = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const n = Math.round((day(Date.now()) - day(time)) / 86400000);
  return n <= 0 ? "TODAY" : n === 1 ? "YESTERDAY" : `${n} DAYS AGO`;
}
function backupDue() {
  const changes = backupInfo.changes || 0;
  if (!changes) return false;                      // nothing new since the last backup
  if (!backupInfo.last) return changes >= 3;       // never backed up: nudge after a few changes
  return Date.now() - backupInfo.last >= CONFIG.backupReminderDays * 86400000;
}
function backupLine() {
  if (!storageOK) return `<div class="warn">THIS BROWSER WON'T SAVE YOUR CLOSET.</div>`;
  return `<div>LAST BACKUP: ${backupInfo.last ? daysAgo(backupInfo.last) : "NEVER"}</div>` +
    (backupDue() ? `<div class="reminder">♥ TIME FOR A BACKUP? ${plural(backupInfo.changes, "CHANGE")} SINCE THE LAST ONE.</div>` : "");
}

/* ---------- the doll ---------- */
// Drawing the doll and placing clothes on it (dollSVG, placeOnDoll) lives in doll.js.

function thumb(it) {
  if (!it) return `<div class="none">NONE</div>`;
  return `<img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy">`;
}

/* ---------- closet logic ---------- */
// season: "ALL", "SPRING"... (normally the season picked with the SEASON buttons)
function inSeason(it, season = state.season) {
  return season === "ALL" || it.seasons.includes(season.toLowerCase());
}
function pool(slot) {
  const cats = slot === "top" ? ["top", "dress"] : [slot];
  return ITEMS.filter(it => cats.includes(it.cat) && (inSeason(it) || it.cat === "underwear")).map(it => it.id);
}
function wornItems(o) {
  const top = get(o.top), dress = top && top.cat === "dress";
  return [top, dress ? null : get(o.bottom), ...ACC.map(c => get(o[c]))].filter(Boolean);
}
function step(slot, dir) {
  const p = pool(slot);
  const list = ACC.includes(slot) ? [null, ...p] : p;
  if (!list.length) return;
  const i = list.indexOf(state.outfit[slot] ?? null);
  const next = i === -1 ? 0 : (i + dir + list.length) % list.length;
  state.outfit[slot] = list[next];
}

/* ---------- verdict ---------- */
const isNeutral = c => NEUTRALS.includes(c);
const pairIn = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const isSummery = it => !it.seasons.includes("fall") && !it.seasons.includes("winter");
const isWintry = it => !it.seasons.includes("spring") && !it.seasons.includes("summer");
const lower = it => it.name.toLowerCase();

// o = an outfit ({ top: id, bottom: id, ... }). season = the season to judge it for
// (normally the one picked with the SEASON buttons; lookbook photos use the season they were worn in).
function evaluate(o, season = state.season) {
  const top = get(o.top), dress = top && top.cat === "dress", bottom = dress ? null : get(o.bottom);
  if (!top || (!dress && !bottom)) {
    return { complete: false, score: 0, tier: "INCOMPLETE", color: "var(--steel-lo)", notes: [{ text: "Pick a top and a bottom, or a dress.", s: 0 }] };
  }
  const notes = [];
  const add = (text, s) => notes.push({ text, s });
  let score = 64;

  const judged = wornItems(o).filter(it => it.cat !== "underwear");
  const clothes = judged.filter(it => ["top", "bottom", "dress", "jacket", "shoes", "scarves"].includes(it.cat));
  const extras = judged.filter(it => ["earrings", "bracelets", "hats", "sunnies"].includes(it.cat));

  // 1. COLOUR: mostly neutrals plus one or two accent colours
  const accents = [...new Set(clothes.map(it => it.color).filter(c => !isNeutral(c)))];
  if (accents.length === 0) {
    score += 5; add("All neutrals: easy and chic", 1);
    const pop = extras.find(it => !isNeutral(it.color));
    if (pop) { score += 6; add(`Pop of colour from the ${lower(pop)}`, 2); }
  } else if (accents.length === 1) {
    score += 8;
    const shared = clothes.filter(it => it.color === accents[0]);
    if (shared.length >= 2) { score += 5; add(`Tonal ${accents[0]} looks put together`, 2); }
    else add(`One accent colour (${accents[0]}) against neutrals`, 1);
  } else if (accents.length === 2) {
    const [a, b] = accents;
    if (pairIn(GOOD_PAIRS, a, b)) { score += 12; add(`${a} + ${b} is a great colour combo`, 3); }
    else if (pairIn(BAD_PAIRS, a, b)) { score -= 22; add(`${a} and ${b} clash`, -3); }
    else { score -= 4; add(`${a} and ${b} don't quite connect`, -1); }
  } else {
    score -= 18; add(`${accents.length} accent colours is too busy`, -3);
  }
  // small accessories in a clashing colour
  const clashEx = extras.find(ex => accents.some(c => pairIn(BAD_PAIRS, ex.color, c)));
  if (clashEx) { score -= 6; add(`The ${lower(clashEx)} fight the ${accents.find(c => pairIn(BAD_PAIRS, clashEx.color, c))}`, -1); }

  // 2. PATTERN: one statement print at a time
  const bold = clothes.filter(it => BOLD_PATTERNS.includes(it.pattern));
  if (bold.length === 1 && accents.length <= 1) { score += 5; add(`${bold[0].name} is the statement piece`, 1); }
  if (bold.length >= 2) { score -= 14; add(`Two prints compete: ${lower(bold[0])} and ${lower(bold[1])}`, -3); }

  // 3. SILHOUETTE: balance volume top and bottom
  if (bottom) {
    const t = top.shape, b = bottom.shape;
    if (t === "loose" && b === "wide") { score -= 12; add(`Loose top with ${lower(bottom)} is a lot of volume`, -2); }
    else if (t === "loose" && b === "fitted") { score += 9; add("Loose top balanced by a slim bottom", 2); }
    else if (t === "fitted" && b === "wide") { score += 9; add("Fitted top balances wide legs", 2); }
    else if (t === "fitted" && b === "flare") { score += 7; add("Fitted top shows off the flare", 2); }
    else if (t === "fitted" && b === "fitted") { score += 3; add("Sleek, streamlined shape", 1); }
    if (top.crop && (b === "wide" || b === "flare" || /midi/.test(bottom.id))) { score += 5; add("Cropped top hits the rule of thirds", 1); }
  }
  const jacket = get(o.jacket);
  if (jacket && dress && top.shape === "loose") { score -= 4; add("Boxy jacket hides the dress shape", -1); }

  // 4. DRESSINESS: don't mix very sporty with very dressy
  const levels = judged.filter(it => typeof it.dressy === "number");
  if (levels.length) {
    const lo = levels.reduce((m, it) => (it.dressy < m.dressy ? it : m));
    const hi = levels.reduce((m, it) => (it.dressy > m.dressy ? it : m));
    if (hi.dressy - lo.dressy >= 2) { score -= 12; add(`Sporty ${lower(lo)} with dressy ${lower(hi)}`, -2); }
    else if (hi.dressy - lo.dressy <= 1) { score += 4; add("Everything is on the same dress level", 1); }
  }

  // 5. SEASON: summer-only and winter-only pieces don't mix
  let seasonNoted = false;
  for (let i = 0; i < judged.length && !seasonNoted; i++) {
    for (let j = i + 1; j < judged.length; j++) {
      const a = judged[i], b = judged[j];
      if ((isSummery(a) && isWintry(b)) || (isWintry(a) && isSummery(b))) {
        const [s, w] = isSummery(a) ? [a, b] : [b, a];
        score -= 10; add(`Summer ${lower(s)} with winter ${lower(w)}`, -2); seasonNoted = true; break;
      }
    }
  }
  if (season !== "ALL") {
    const off = judged.filter(it => !inSeason(it, season));
    if (off.length) { score -= 4 * off.length; add(`${off[0].name} ${off.length > 1 ? `+ ${off.length - 1} more` : ""} out of season`, -1); }
  }

  // 6. FINISHING
  if (!get(o.shoes)) { score -= 10; add("No shoes picked yet", -1); }
  else if (extras.length || get(o.scarves)) { score += 3; add("Accessorised and finished", 1); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tiers = [
    [97, "FAIREST OF ALL", "var(--pink-deep)"],
    [88, "TOTAL MATCH!", "var(--pink-deep)"],
    [72, "SO CUTE!", "var(--pink)"],
    [55, "IT WORKS", "var(--peri-lo)"],
    [40, "HMM...", "var(--warn)"],
    [25, "MIRROR CRACKED", "var(--bad)"],
    [0, "CLASH ALERT", "var(--bad)"]
  ];
  const [, tier, color] = tiers.find(([min]) => score >= min);
  notes.sort((x, y) => Math.abs(y.s) - Math.abs(x.s) || y.s - x.s);
  return { complete: true, score, tier, color, notes: notes.slice(0, 5) };
}

/* ---------- rendering ---------- */
function renderChrome() {
  $("title").textContent = `${CONFIG.ownerName} WARDROBE`.toUpperCase();
  $("seasonTag").textContent = state.season === "ALL" ? "ALL SEASONS" : `${state.season} FASHIONS`;
  $("seasonChips").innerHTML = SEASONS.map(s =>
    `<button class="chip" type="button" data-act="season" data-arg="${s}" aria-pressed="${state.season === s}">${s}</button>`).join("");
  $("viewChips").innerHTML = VIEWS.map(([v, l]) =>
    `<button class="chip" type="button" data-act="view" data-arg="${v}" aria-pressed="${state.view === v}">${l}</button>`).join("");
  const inS = ITEMS.filter(it => inSeason(it)).length;
  $("stats").innerHTML = `<div><strong>${ITEMS.length}</strong>PIECES</div><div><strong>${inS}</strong>IN SEASON</div><div><strong>${state.saved.length}</strong>LOOKS</div>`;
  $("backupInfo").innerHTML = backupLine();
  const browsing = state.view === "browse";
  $("browseBtn").textContent = browsing ? "DOLL VIEW" : "BROWSE";
  $("browseBtn").dataset.arg = browsing ? "doll" : "browse";
  $("catbar").innerHTML = ACC.map(c => {
    const on = state.view === "catalog" ? state.catFilter === c : state.view === "browse" && state.accCat === c;
    return `<button type="button" data-act="cat" data-arg="${c}" aria-pressed="${on}">${CATS[c]}</button>`;
  }).join("") + `<button type="button" class="more" data-act="more" aria-pressed="${state.view === "catalog" && state.catFilter === "all"}">MORE</button>`;
}

// The friendly screen new visitors see while their closet is empty.
function welcomeHTML() {
  const iphoneTip = IS_IOS && !STANDALONE
    ? `<p class="tip"><b>ON AN IPHONE?</b> ADD THIS SITE TO YOUR HOME SCREEN FIRST (SHARE > ADD TO HOME SCREEN) AND OPEN IT FROM THERE. SAFARI CAN CLEAR WEBSITES YOU HAVEN'T VISITED FOR A WEEK, BUT NOT HOME SCREEN APPS.</p>`
    : "";
  return `<div class="stage-head"><span class="label">WELCOME</span><span>YOUR CLOSET IS EMPTY</span></div>
    <div class="welcome">
      <svg class="welcome-doll" viewBox="0 0 200 500" aria-hidden="true">${Doll.baseSVG()}</svg>
      <div class="welcome-text">
        <h3>HI! LET'S FILL YOUR CLOSET.</h3>
        <ol>
          <li>HANG UP OR LAY OUT ONE PIECE ON A PLAIN BACKGROUND.</li>
          <li>PRESS ADD PIECE AND SNAP A PHOTO. THE BACKGROUND GETS CUT OUT FOR YOU.</li>
          <li>TAG IT, DRESS THE DOLL, THEN PRESS JUDGE ME!</li>
        </ol>
        <button class="bigbtn pinkbtn" type="button" data-act="add">ADD YOUR<br>FIRST PIECE</button>
        <button class="smallbtn" type="button" data-act="restore">I HAVE A BACKUP FILE</button>
        <p class="privacy">♥ YOUR PHOTOS NEVER LEAVE YOUR DEVICE. NOTHING IS UPLOADED.</p>
        ${iphoneTip}
      </div>
    </div>`;
}

function renderStage() {
  const st = $("stage");
  if (state.loading) {
    st.innerHTML = `<div class="loading">OPENING CLOSET...</div>`;
  } else if (state.view === "doll" && !ITEMS.length) {
    st.innerHTML = welcomeHTML();
  } else if (state.view === "doll" && state.fitting) {
    // FIT PIECES: pick a piece, drag it to move, drag its corner to resize (see doll.js)
    const worn = wornItems(state.outfit);
    st.innerHTML = `<div class="stage-head"><span class="label">FIT PIECES</span><span>DRAG TO MOVE · DRAG THE PINK CORNER TO RESIZE</span></div>
      <div class="chips">${worn.map(it => `<button class="chip" type="button" data-act="fit-pick" data-arg="${esc(it.id)}" aria-pressed="${it.id === state.fitId}">${esc(it.name.toUpperCase())}</button>`).join("")}</div>
      <div class="doll-wrap">${dollSVG(state.outfit)}</div>
      <div class="row doll-tools">
        <button class="smallbtn" type="button" data-act="fit-smaller">SMALLER</button>
        <button class="smallbtn" type="button" data-act="fit-bigger">BIGGER</button>
        <button class="smallbtn" type="button" data-act="fit-reset">RESET</button>
        <button class="smallbtn pink" type="button" data-act="fit">DONE</button>
      </div>
      <p class="caption">EACH PIECE REMEMBERS ITS FIT, ON EVERY DOLL.</p>`;
  } else if (state.view === "doll") {
    st.innerHTML = `<div class="stage-head"><span class="label">DOLL</span><span>${wornItems(state.outfit).length} PIECES ON</span></div>
      <div class="doll-wrap">${dollSVG(state.outfit)}<div class="stamp" id="stamp"></div>${busy ? '<div class="scan">SCANNING CLOSET...</div>' : ""}</div>
      <div class="row doll-tools">
        <button class="smallbtn" type="button" data-act="fit">FIT PIECES</button>
        <button class="smallbtn" type="button" data-act="doll-menu">${Doll.hasPhoto ? "CHANGE DOLL" : "USE MY PHOTO"}</button>
      </div>
      <p class="caption">PAPER DOLL: FLAT PHOTOS LAYERED ON TOP, NOT A REAL TRY-ON.</p>`;
  } else if (state.view === "lookbook") {
    st.innerHTML = Lookbook.viewHTML();   // see lookbook.js
  } else if (state.view === "browse") {
    const top = get(state.outfit.top), dress = top && top.cat === "dress";
    st.innerHTML = `<div class="stage-head"><span class="label">BROWSE</span><span>FLICK THROUGH EACH ROW</span></div>
      <div class="panels">
        ${panel("top", "TOPS & DRESSES", top)}
        ${panel("bottom", "BOTTOMS", dress ? null : get(state.outfit.bottom), dress)}
        ${panel(state.accCat, CATS[state.accCat], get(state.outfit[state.accCat]), false, true)}
      </div>`;
  } else {
    const filters = ["all", ...Object.keys(CATS)];
    const items = ITEMS.filter(it => state.catFilter === "all" || it.cat === state.catFilter);
    const worn = new Set(wornItems(state.outfit).map(it => it.id));
    const editing = state.editing;
    st.innerHTML = `<div class="stage-head"><span class="label">CATALOG</span><span>${items.length} PIECES · ${editing ? "TAP ONE TO EDIT" : "TAP TO WEAR"}</span>
        <button class="chip" type="button" data-act="edit-mode" aria-pressed="${editing}">${editing ? "DONE EDITING" : "EDIT PIECES"}</button></div>
      <div class="chips">${filters.map(f => `<button class="chip" type="button" data-act="filter" data-arg="${f}" aria-pressed="${state.catFilter === f}">${f === "all" ? "ALL" : CATS[f]}</button>`).join("")}</div>
      ${items.length ? "" : `<p class="empty">NO PIECES HERE YET. <button class="linkbtn" type="button" data-act="add">ADD ONE?</button></p>`}
      <div class="catalog${editing ? " editing" : ""}">${items.map(it0 => {
        const it = byId[it0.id];
        return `<button class="card${worn.has(it.id) ? " on" : ""}" type="button" data-act="${editing ? "edit" : "equip"}" data-arg="${it.id}" ${editing ? `aria-label="Edit ${esc(it.name)}"` : `aria-pressed="${worn.has(it.id)}"`}>
          ${editing ? '<span class="on-badge edit-badge">EDIT</span>' : worn.has(it.id) ? '<span class="on-badge">ON</span>' : ""}
          <span class="thumb">${thumb(it)}</span>
          <span class="meta"><span class="idx">#${pad3(it.idx)} · ${CATS[it.cat]}</span><span>${esc(it.name)}</span>
          <span class="tags">${esc(it.color.toUpperCase())}${it.pattern !== "solid" ? " · " + esc(it.pattern.toUpperCase()) : ""} · ${it.seasons.length === 4 ? "ALL YEAR" : it.seasons.map(s => s.slice(0, 2).toUpperCase()).join(" ")}</span>
          ${Lookbook.count(it.id) ? `<span class="in-looks">♥ IN ${plural(Lookbook.count(it.id), "LOOKBOOK PHOTO")}</span>` : ""}</span>
        </button>`;
      }).join("")}</div>`;
  }
}

function panel(slot, label, it, disabled = false, acc = false) {
  const body = disabled ? `<div class="muted">DRESS ON.<br>NO BOTTOM NEEDED.</div>` : thumb(it);
  const name = disabled ? "—" : it ? `#${pad3(it.idx)} ${esc(it.name)}` : "NONE";
  const dis = disabled ? "disabled" : "";
  return `<div class="panel${acc ? " acc" : ""}">
    <div class="panel-label"><span class="cat">${label}</span><span>${name}</span></div>
    <div class="panel-img">${body}</div>
    <div class="panel-controls">
      <button class="smallbtn" type="button" data-act="step" data-arg="${slot}" data-dir="-1" aria-label="Previous ${label}" ${dis}>◀◀</button>
      <button class="smallbtn" type="button" data-act="rand" data-arg="${slot}" aria-label="Random ${label}" ${dis}>▶</button>
      <button class="smallbtn" type="button" data-act="step" data-arg="${slot}" data-dir="1" aria-label="Next ${label}" ${dis}>▶▶</button>
    </div></div>`;
}

function renderVerdict() {
  if (busy) {
    $("verdict").innerHTML = `<div class="tier" style="color:var(--peri-lo)">THINKING...</div>`;
    return;
  }
  $("verdict").innerHTML = verdictHTML(evaluate(state.outfit), wornItems(state.outfit));
}

// The verdict: tier, score meter, reasons, and what's being worn. (Also used by the lookbook.)
function verdictHTML(v, worn) {
  const lit = Math.round(v.score / 10);
  return `
    <div class="tier" style="color:${v.color}">${v.tier}</div>
    <div class="meter" style="color:${v.color}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < lit ? "lit" : ""}"></i>`).join("")}</div>
    <div class="score"><span>MATCH SCORE</span><span>${v.score}/100</span></div>
    <ul class="reasons">${v.notes.map(n => `<li><span class="${n.s < 0 ? "minus" : "plus"}">${n.s < 0 ? "✕" : n.s > 0 ? "♥" : "▸"}</span><span>${esc(n.text).toUpperCase()}</span></li>`).join("")}</ul>
    <div class="wearing">${worn.map(it => `<div><span>${CATS[it.cat]}</span> ${esc(it.name).toUpperCase()}</div>`).join("") || "NOTHING ON YET"}</div>`;
}

function renderSaved() {
  $("saved").innerHTML = state.saved.length
    ? state.saved.map(s => `<li><span class="nm">${esc(s.name)}</span><span class="sc">${s.score}</span>
        <button class="smallbtn" type="button" data-act="wear" data-arg="${s.id}">WEAR</button>
        <button class="smallbtn" type="button" data-act="del" data-arg="${s.id}" aria-label="Delete ${esc(s.name)}">✕</button></li>`).join("")
    : `<li><span class="nm">NO SAVED LOOKS YET. PRESS SAVE LOOK TO KEEP ONE.</span></li>`;
}

function renderAll() {
  renderChrome();
  renderStage();
  renderVerdict();
  renderSaved();
}

function stamp() {
  const el = $("stamp");
  if (!el) return;
  const v = evaluate(state.outfit);
  el.textContent = v.tier;
  el.style.color = v.color;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

/* ---------- pop-up box (used for backups, tips and, later, adding pieces) ---------- */
function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  if (!$("modal").open) $("modal").showModal();
}
function closeModal() {
  if ($("modal").open) $("modal").close();
}

/* ---------- BACKUP and RESTORE ---------- */
const sizeText = bytes => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
let pendingBackup = null;   // the backup file, made and waiting to be saved

async function makeBackup() {
  if (!ITEMS.length && !state.saved.length && !Lookbook.total()) { toast("NOTHING TO BACK UP YET. ADD A PIECE FIRST!"); return; }
  toast("PACKING YOUR CLOSET...");
  try {
    pendingBackup = await Backup.create();
  } catch (e) {
    toast("SORRY, THE BACKUP DIDN'T WORK. RELOAD THE PAGE AND TRY AGAIN.");
    return;
  }
  toast("");
  const { blob, name, pieces, looks, lookbook } = pendingBackup;
  openModal("BACKUP READY", `
    <p>YOUR BACKUP HAS <b>${plural(pieces, "PIECE")}</b>, <b>${plural(looks, "SAVED LOOK")}</b> AND <b>${plural(lookbook, "LOOKBOOK PHOTO")}</b> (${sizeText(blob.size)}).</p>
    <p>KEEP IT SOMEWHERE SAFE, LIKE EMAILING IT TO YOURSELF OR SAVING IT TO ICLOUD DRIVE OR GOOGLE DRIVE.</p>
    <div class="row modal-actions">
      <button class="bigbtn pinkbtn" type="button" data-act="backup-save">${IS_IOS ? "SAVE TO FILES" : "SAVE FILE"}</button>
    </div>
    ${IS_IOS ? `<p class="fine">IN THE LIST THAT POPS UP, CHOOSE <b>SAVE TO FILES</b>.</p>` : ""}
    <p class="fine">FILE NAME: ${esc(name)}<br>TO BRING YOUR CLOSET BACK, PRESS RESTORE ON ANY PHONE OR COMPUTER AND PICK THIS FILE.</p>`);
}

async function saveBackupFile() {
  if (!pendingBackup) return;
  const { blob, name } = pendingBackup;
  const file = new File([blob], name, { type: "application/octet-stream" });
  // iPhones/iPads: use the share sheet ("Save to Files"), which works even from the home screen.
  if (IS_IOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      backupSaved();
      return;
    } catch (e) {
      if (e.name === "AbortError") return;   // they closed the share sheet: nothing saved
      // anything else: fall back to a normal download below
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  backupSaved();
}

async function backupSaved() {
  backupInfo.last = Date.now();
  backupInfo.changes = 0;
  try { await DB.put("settings", backupInfo); } catch (e) { /* not important */ }
  closeModal();
  renderChrome();
  toast("BACKUP SAVED: " + pendingBackup.name);
}

async function restoreFrom(file) {
  let data;
  toast("OPENING BACKUP...");
  try {
    data = await Backup.read(file);
  } catch (e) {
    toast(e.message);
    return;
  }
  const pieces = data.items.length, looks = data.looks.length;
  if ((ITEMS.length || state.saved.length) &&
      !confirm(`Replace this closet (${plural(ITEMS.length, "piece")}, ${plural(state.saved.length, "look")}) with the backup (${plural(pieces, "piece")}, ${plural(looks, "look")})?`)) {
    toast("");
    return;
  }
  // Keep this device's own backup date; the closet now matches a backup, so no changes are waiting.
  data.settings = data.settings.filter(s => s.key !== "backupInfo")
    .concat({ key: "backupInfo", last: backupInfo.last, changes: 0 });
  try {
    await DB.replaceAll(data);
    await loadCloset();
  } catch (e) {
    storageError(e);
    return;
  }
  state.outfit = emptyOutfit();
  state.outfit.underwear = pickR(ITEMS.filter(it => it.cat === "underwear").map(it => it.id));
  state.view = "doll";
  renderAll();
  askToKeepData();
  toast(`RESTORED ${plural(pieces, "PIECE")}, ${plural(looks, "SAVED LOOK")} AND ${plural(data.lookbook.length, "LOOKBOOK PHOTO")}.`);
}

// "KEEP MY CLOSET SAFE?" explains where the closet lives and how not to lose it.
function safetyHTML() {
  const status = !storageOK
    ? `<p class="warn">THIS BROWSER WON'T LET THE SITE SAVE ANYTHING (MAYBE A PRIVATE WINDOW?). NOTHING YOU ADD WILL BE KEPT.</p>`
    : storageKept
      ? `<p class="good">✓ THIS BROWSER HAS PROMISED TO KEEP YOUR CLOSET.</p>`
      : `<p>THIS BROWSER MIGHT CLEAR YOUR CLOSET IF THE DEVICE RUNS LOW ON SPACE, SO KEEP A BACKUP.</p>`;
  return `
    <p>♥ YOUR CLOSET LIVES ONLY IN THIS BROWSER, ON THIS DEVICE. YOUR PHOTOS ARE NEVER UPLOADED ANYWHERE.</p>
    ${status}
    <p><b>BACKUP</b> SAVES YOUR WHOLE CLOSET (PIECES, TAGS, PHOTOS AND LOOKS) AS ONE FILE. DO IT NOW AND THEN, AND KEEP THE FILE SOMEWHERE SAFE.</p>
    <p><b>NEW PHONE OR COMPUTER?</b> PRESS BACKUP HERE, THEN RESTORE THERE.</p>
    <p><b>IPHONE / IPAD:</b> SAFARI CAN CLEAR WEBSITES YOU HAVEN'T VISITED FOR ABOUT A WEEK. ADD THIS SITE TO YOUR HOME SCREEN (SHARE > ADD TO HOME SCREEN) AND OPEN IT FROM THERE INSTEAD. THE HOME SCREEN APP HAS ITS OWN CLOSET, SO IF YOU ALREADY ADDED PIECES IN SAFARI: BACKUP IN SAFARI, THEN RESTORE IN THE APP.</p>
    <p><b>ANDROID:</b> CHROME'S MENU (THE 3 DOTS) > ADD TO HOME SCREEN (OR INSTALL APP).</p>
    <p><b>CAREFUL:</b> CLEARING YOUR BROWSER'S HISTORY OR SITE DATA ERASES YOUR CLOSET TOO.</p>`;
}

/* ---------- actions ---------- */
function randomOutfit() {
  const o = { top: pickR(pool("top")), underwear: state.outfit.underwear };
  const top = get(o.top);
  o.bottom = top && top.cat === "dress" ? state.outfit.bottom : pickR(pool("bottom"));
  o.shoes = pickR(pool("shoes"));
  const chance = { jacket: state.season === "WINTER" || state.season === "FALL" ? 0.6 : 0.25, earrings: 0.55, bracelets: 0.4, scarves: 0.2, hats: 0.15, sunnies: 0.2 };
  for (const [c, p] of Object.entries(chance)) o[c] = Math.random() < p ? pickR(pool(c)) : null;
  return o;
}

function autoDress() {
  if (busy) return;
  if (!ITEMS.length) { toast("ADD SOME PIECES FIRST, THEN I'LL DRESS YOU!"); return; }
  const cands = Array.from({ length: 900 }, randomOutfit).map(o => ({ o, s: evaluate(o).score }));
  cands.sort((a, b) => b.s - a.s);
  const pick = cands[Math.floor(Math.random() * Math.min(8, cands.length))].o;
  state.view = "doll";
  if (reduced) { state.outfit = pick; renderAll(); stamp(); return; }
  busy = true;
  $("autoBtn").disabled = true;
  renderAll();
  let t = 0;
  const iv = setInterval(() => {
    const doll = document.querySelector(".doll-wrap");
    if (doll) doll.firstElementChild.outerHTML = dollSVG(randomOutfit());
    if (++t > 14) {
      clearInterval(iv);
      busy = false;
      $("autoBtn").disabled = false;
      state.outfit = pick;
      renderAll();
      stamp();
    }
  }, 85);
}

function equip(id) {
  const it = get(id);
  if (!it) return;
  if (it.cat === "top" || it.cat === "dress") state.outfit.top = id;
  else if (it.cat === "bottom") {
    state.outfit.bottom = id;
    const top = get(state.outfit.top);
    if (top && top.cat === "dress") state.outfit.top = null;
  } else state.outfit[it.cat] = state.outfit[it.cat] === id ? null : id;
}

// A little message at the bottom of the screen. toast("") hides it.
function toast(msg) {
  $("toast").textContent = msg;
  clearTimeout(toast.t);
  if (msg) toast.t = setTimeout(() => { $("toast").textContent = ""; }, 3000 + msg.length * 40);
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || busy && b.dataset.act !== "view") return;
  const { act, arg } = b.dataset;
  switch (act) {
    case "season": state.season = arg; break;
    case "view": state.view = arg; break;
    case "step": step(arg, Number(b.dataset.dir)); break;
    case "rand": { const p = pool(arg); state.outfit[arg] = pickR(ACC.includes(arg) ? [null, ...p] : p); break; }
    case "cat":
      if (state.view === "catalog") state.catFilter = arg;
      else { state.accCat = arg; state.view = "browse"; }
      break;
    case "more": state.view = "catalog"; state.catFilter = "all"; break;
    case "filter": state.catFilter = arg; break;
    case "equip": equip(arg); break;
    case "auto": autoDress(); return;
    case "dressme": state.view = "doll"; renderAll(); stamp(); return;
    case "save": {
      const v = evaluate(state.outfit);
      if (!v.complete) { renderAll(); return; }
      const n = state.saved.reduce((m, s) => Math.max(m, s.n || 0), 0) + 1;
      const look = { id: String(Date.now()), n, name: `LOOK #${n}`, outfit: { ...state.outfit }, score: v.score };
      state.saved.unshift(look);
      saveRecord("looks", look);
      break;
    }
    case "wear": { const s = state.saved.find(x => x.id === arg); if (s) { state.outfit = { ...state.outfit, ...s.outfit }; state.view = "doll"; } break; }
    case "del": state.saved = state.saved.filter(x => x.id !== arg); deleteRecord("looks", arg); break;
    case "add": AddPiece.start(); return;          // see add-piece.js
    case "edit": AddPiece.edit(arg); return;
    case "edit-mode": state.editing = !state.editing; break;
    case "doll-menu": Doll.menu(); return;           // see doll.js
    case "fit": state.fitting = !state.fitting && Doll.startFit(); break;
    case "fit-pick": state.fitId = arg; break;
    case "fit-bigger": Doll.nudge("bigger"); return;
    case "fit-smaller": Doll.nudge("smaller"); return;
    case "fit-reset": Doll.nudge("reset"); return;
    case "backup": makeBackup(); return;
    case "backup-save": saveBackupFile(); return;
    case "restore": $("restoreFile").click(); return;
    case "safety": openModal("KEEP YOUR CLOSET SAFE", safetyHTML()); return;
    case "close": closeModal(); return;
    default: return;
  }
  renderAll();
});

// RESTORE: the hidden file picker in index.html
$("restoreFile").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";   // so picking the same file again still works
  if (file) restoreFrom(file);
});

// Clicking the dark area around a pop-up closes it.
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });

/* ---------- clock ---------- */
function tick() {
  const d = new Date();
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, "0");
  $("clock").innerHTML = `${h}<span class="colon${d.getSeconds() % 2 ? " off" : ""}">:</span>${m} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/* ---------- start ---------- */
// If the background picture is missing, say so instead of silently showing plain green.
(function checkBackground() {
  const test = new Image();
  test.onerror = () => {
    const box = document.createElement("div");
    box.className = "bg-warning";
    box.textContent = "CAN'T FIND images/background.jpg. KEEP THE images FOLDER NEXT TO index.html (AND EXTRACT THE ZIP BEFORE OPENING).";
    document.body.prepend(box);
  };
  test.src = "images/background.jpg";
})();

async function start() {
  if (CONFIG.sourceCode) { $("sourceLink").href = CONFIG.sourceCode; $("sourceLink").hidden = false; }
  renderAll();   // shows "OPENING CLOSET..." for a moment
  await Doll.init();   // use images/doll-silhouette.png as the default doll, if it's there
  try {
    await loadCloset();
  } catch (e) {
    // Some private/incognito windows block storage. The site still works, it just can't keep anything.
    storageOK = false;
    const box = document.createElement("div");
    box.className = "bg-warning";
    box.textContent = "THIS BROWSER WON'T LET THE SITE SAVE YOUR CLOSET (MAYBE A PRIVATE WINDOW?). YOU CAN LOOK AROUND, BUT NOTHING WILL BE KEPT.";
    document.body.prepend(box);
  }
  state.loading = false;
  state.outfit.underwear = pickR(ITEMS.filter(it => it.cat === "underwear").map(it => it.id));
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(kept => { storageKept = kept; }, () => {});
  }
  renderAll();
}

// Start once every script file has loaded (doll.js and add-piece.js come after this one).
document.addEventListener("DOMContentLoaded", () => {
  start();
  tick();
  setInterval(tick, 1000);
});
