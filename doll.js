/* ======================================================================
   DOLL.JS — everything about the doll on the stage.

   - Which doll shows: the drawn mannequin, your silhouette (images/doll-silhouette.png,
     if that file exists), or a person's own photo (USE MY PHOTO).
   - Body markers (top of head, shoulders, waist, ankles). Every piece's position (its "box")
     is stored as if it were on the mannequin; on any other doll it's moved and resized to
     match that doll's markers. Pieces stay flat photos layered on top, paper-doll style:
     nothing is bent or warped to fit a body.
   - FIT PIECES: drag a piece to move it, drag its corner to resize it. The new fit is saved
     with the piece and used on every doll.
   - USE MY PHOTO: a full-length photo -> background cut out -> drag the markers into place.
   ====================================================================== */

const OUT = "#3E0F35";
const MANNEQUIN_FILL = "#EFE6F3";
const MANNEQUIN = `<g fill="${MANNEQUIN_FILL}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round">
  <path d="M64 94 Q52 100 50 130 L42 245 L52 247 L62 150 Z"/>
  <path d="M136 94 Q148 100 150 130 L158 245 L148 247 L138 150 Z"/>
  <path d="M73 203 L99 203 L97 450 L81 450 Z"/><path d="M101 203 L127 203 L119 450 L103 450 Z"/>
  <ellipse cx="88" cy="458" rx="12" ry="6"/><ellipse cx="112" cy="458" rx="12" ry="6"/>
  <rect x="92" y="70" width="16" height="22"/>
  <path d="M64 92 Q100 84 136 92 L132 150 Q126 175 128 205 L72 205 Q74 175 68 150 Z"/>
  <circle cx="46" cy="252" r="7"/><circle cx="154" cy="252" r="7"/>
  <ellipse cx="100" cy="48" rx="22" ry="26"/></g>`;

// Where the body landmarks are on the mannequin (the doll area is 200 wide and 500 tall).
// L = the left side of the picture, R = the right side.
const STD_MARKS = {
  head: [100, 22], shoulderL: [64, 92], shoulderR: [136, 92],
  waistL: [71, 170], waistR: [129, 170], ankleL: [89, 450], ankleR: [111, 450]
};
const HIP_Y = 205;   // the mannequin's hips (where trousers start)

// The markers people drag on USE MY PHOTO: [which landmark, label, colour]
const MARKERS = [
  ["head", "HEAD", "#F5B70A"],
  ["shoulderL", "SHOULDER", "#F2609B"], ["shoulderR", "SHOULDER", "#F2609B"],
  ["waistL", "WAIST", "#8E8EF2"], ["waistR", "WAIST", "#8E8EF2"],
  ["ankleL", "ANKLE", "#2E9E4F"], ["ankleR", "ANKLE", "#2E9E4F"]
];

// Makes a "translator" from mannequin positions to the same body positions on a doll with these markers.
//   map.y(y)       a height on the mannequin -> the same body height on this doll (e.g. waist -> waist)
//   map.unY(y)     the other way round
//   map.across(y)  at a mannequin height: { k: how many times wider this doll is there, c: where its middle is }
function bodyMap(marks) {
  const levels = m => [m.head[1], (m.shoulderL[1] + m.shoulderR[1]) / 2, (m.waistL[1] + m.waistR[1]) / 2, (m.ankleL[1] + m.ankleR[1]) / 2];
  const from = levels(STD_MARKS), to = levels(marks);
  // Straight lines between the landmark heights (carried on past the ends).
  const line = (a, b) => y => {
    const i = y < a[1] ? 0 : y < a[2] ? 1 : 2;
    return b[i] + ((y - a[i]) * (b[i + 1] - b[i])) / (a[i + 1] - a[i]);
  };
  const width = (m, side) => m[side + "R"][0] - m[side + "L"][0];
  const middle = (m, side) => (m[side + "L"][0] + m[side + "R"][0]) / 2;
  const kS = width(marks, "shoulder") / width(STD_MARKS, "shoulder");
  const kW = width(marks, "waist") / width(STD_MARKS, "waist");
  const kH = (kS + kW) / 2;   // hips: somewhere between the shoulder and waist width
  const cS = middle(marks, "shoulder"), cW = middle(marks, "waist"), cA = middle(marks, "ankle");
  const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  return {
    y: line(from, to),
    unY: line(to, from),
    across(y) {
      if (y <= from[1]) return { k: kS, c: cS };
      if (y <= from[2]) { const t = (y - from[1]) / (from[2] - from[1]); return { k: mix(kS, kW, t), c: mix(cS, cW, t) }; }
      return { k: mix(kW, kH, (y - from[2]) / (HIP_Y - from[2])), c: mix(cW, cA, (y - from[2]) / (from[3] - from[2])) };
    }
  };
}

const Doll = (() => {
  const mannequin = { kind: "mannequin", marks: STD_MARKS };
  let current = { ...mannequin, map: bodyMap(STD_MARKS) };   // the doll showing right now
  let silhouette = null;   // your silhouette, if images/doll-silhouette.png exists
  let mine = null;         // this person's own photo doll (saved in the browser), or null
  let mineURL = null;
  const ratios = new Map();   // photo address -> width ÷ height (needed to outline pieces in FIT mode)

  // A photo standing on the stage floor, as tall as the mannequin: [left, top, width, height]
  function frameRect(ratio, maxW = 196, maxH = 450, floor = 472) {
    let h = maxH, w = h * ratio;
    if (w > maxW) { w = maxW; h = w / ratio; }
    return [100 - w / 2, floor - h, w, h];
  }
  // Markers found in a photo's pixels -> doll units, given where the photo sits.
  function toFrame(px, rect, pw, ph) {
    const out = {};
    for (const key of Object.keys(px)) out[key] = [rect[0] + (px[key][0] * rect[2]) / pw, rect[1] + (px[key][1] * rect[3]) / ph];
    return out;
  }

  function choose() {
    const d = mine && mine.active !== false ? { kind: "photo", href: mineURL, rect: mine.rect, marks: mine.marks }
      : silhouette || mannequin;
    current = { ...d, map: bodyMap(d.marks) };
  }

  // Look for images/doll-silhouette.png. If it's there, it becomes the default doll.
  async function init() {
    if (!CONFIG.silhouette) return;
    const img = new Image();
    const found = await new Promise(resolve => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = CONFIG.silhouette; });
    if (!found) return;
    const rect = frameRect(img.naturalWidth / img.naturalHeight, 200, 500, 500);
    let marks = CONFIG.silhouetteMarks;
    if (!marks) {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      const px = Photos.bodyMarks(c);
      marks = px ? toFrame(px, rect, c.width, c.height) : STD_MARKS;
    }
    silhouette = { kind: "silhouette", href: CONFIG.silhouette, rect, marks };
    choose();
  }

  // Called by loadCloset (script.js) with this person's saved photo doll, or null.
  function setMine(record) {
    if (mineURL) URL.revokeObjectURL(mineURL);
    mine = record && record.image instanceof Blob && record.marks && record.rect ? record : null;
    mineURL = mine ? URL.createObjectURL(mine.image) : null;
    choose();
  }

  /* ---------- drawing ---------- */
  function baseSVG() {
    if (current.kind === "mannequin") return MANNEQUIN;
    const [x, y, w, h] = current.rect;
    return `<image href="${esc(current.href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  }

  // Where a piece's photo(s) go on the current doll: a list of { href, x, y, w, h, align, mirror }
  function pieceRects(it) {
    const m = current.map, b = it.box;
    if (it.cat === "shoes") {
      // box = [width, nudge right, nudge down]
      const { k } = m.across(450);
      const w = b[0] * k, h = 60 * k, dx = (b[1] || 0) * k, bottom = m.y(472) + (b[2] || 0) * k;
      const aL = current.marks.ankleL[0] + dx, aR = current.marks.ankleR[0] + dx;
      if (it.imgL && it.imgR) {
        // A photo of the pair, split in two: one shoe on each foot.
        return [{ href: it.imgL, x: aL - w / 2, y: bottom - h, w, h, align: "xMidYMax meet" },
                { href: it.imgR, x: aR - w / 2, y: bottom - h, w, h, align: "xMidYMax meet" }];
      }
      // One side-view photo: right foot as-is (toe pointing out), left foot mirrored.
      const mid = (aL + aR) / 2;
      return [{ href: it.img, x: mid, y: bottom - h, w, h, align: "xMinYMax meet" },
              { href: it.img, x: mid - w, y: bottom - h, w, h, align: "xMinYMax meet", mirror: true }];
    }
    if (it.cat === "earrings") {
      // box = [height, nudge right, nudge down]. One photo per ear if we have them, otherwise the pair's photo at each ear.
      const { k, c } = m.across(56);
      const h = b[0] * k, w = 14 * k, dx = (b[1] || 0) * k, y = m.y(56) + (b[2] || 0) * k;
      return [{ href: it.imgL || it.img, x: c - 30 * k + dx, y, w, h, align: "xMidYMin meet" },
              { href: it.imgR || it.img, x: c + 16 * k + dx, y, w, h, align: "xMidYMin meet" }];
    }
    // Everything else: box = [left, top, width, height] on the mannequin.
    const [x, y, w, h] = b;
    const { k, c } = m.across(y);
    const nx = c + (x - 100) * k, ny = m.y(y), nw = w * k;
    if (it.stretch) return [{ href: it.img, x: nx, y: ny, w: nw, h: m.y(y + h) - ny, align: "none" }];
    return [{ href: it.img, x: nx, y: ny, w: nw, h: h ? m.y(y + h) - ny : 300 * k, align: "xMidYMin meet" }];
  }

  // How each photo is placed on the doll
  function pieceSVG(it) {
    const images = pieceRects(it).map(r => {
      const img = `<image href="${esc(r.href)}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" preserveAspectRatio="${r.align}"/>`;
      return r.mirror ? `<g transform="translate(${2 * r.x + r.w} 0) scale(-1 1)">${img}</g>` : img;
    });
    return `<g data-item="${esc(it.id)}">${images.join("")}</g>`;
  }

  /* ---------- FIT PIECES: drag to move, drag the corner to resize ---------- */
  // The box around what you actually see of a piece (needs each photo's shape).
  function outlineRect(it) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of pieceRects(it)) {
      let { x, y, w, h } = r;
      const ratio = ratios.get(r.href);
      if (r.align !== "none" && ratio) {
        const dw = Math.min(w, h * ratio), dh = dw / ratio;
        x += r.align.startsWith("xMid") ? (w - dw) / 2 : r.align.startsWith("xMax") ? w - dw : 0;
        y += r.align.includes("YMax") ? h - dh : 0;
        w = dw; h = dh;
      } else if (!ratio) {
        const img = new Image();   // shape not known yet: measure it, then draw again
        img.onload = () => { ratios.set(r.href, img.naturalWidth / img.naturalHeight); if (state.fitting) renderStage(); };
        img.src = r.href;
        if (r.align !== "none") h = Math.min(h, w);
      }
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function fitOutlineSVG() {
    const it = get(state.fitId);
    if (!it) return "";
    const [x, y, w, h] = outlineRect(it);
    return `<g class="fit-outline">
      <rect class="fit-box" x="${x}" y="${y}" width="${w}" height="${h}"/>
      <rect class="fit-handle-hit fit-handle" x="${x + w - 14}" y="${y + h - 14}" width="28" height="28"/>
      <rect class="fit-handle fit-handle-dot" x="${x + w - 6}" y="${y + h - 6}" width="12" height="12"/>
    </g>`;
  }

  // Pick a sensible piece to fit when FIT PIECES starts (the top, or whatever is on).
  function startFit() {
    const worn = wornItems(state.outfit);
    if (!worn.length) { toast("PUT SOMETHING ON THE DOLL FIRST, THEN FIT IT."); return false; }
    if (!worn.some(it => it.id === state.fitId)) state.fitId = worn[0].id;
    return true;
  }

  // Bake a move (dx, dy), and/or a resize (scale s around the point ax, ay), into the piece's box.
  function refit(id, dx, dy, s, ax, ay) {
    const it = get(id);
    if (!it) return;
    const m = current.map, b = it.box;
    let box;
    if (it.cat === "shoes" || it.cat === "earrings") {
      const { k } = m.across(it.cat === "shoes" ? 450 : 56);
      box = [b[0] * s, (b[1] || 0) + dx / k, (b[2] || 0) + dy / k];
    } else {
      const r = pieceRects(it)[0];
      const x = ax + (r.x + dx - ax) * s, y = ay + (r.y + dy - ay) * s, w = r.w * s, h = r.h * s;
      const top = m.unY(y), { k, c } = m.across(top);
      box = [100 + (x - c) / k, top, w / k];
      if (b.length > 3) box.push(m.unY(y + h) - top);
    }
    saveBox(id, box.map(v => Math.round(v * 10) / 10));
  }

  // Save a piece's new fit. box0 remembers where it started, so RESET can put it back.
  async function saveBox(id, box, reset = false) {
    const rec = await DB.get("items", id);
    if (!rec) return;
    if (reset) { rec.box = rec.box0 || rec.box; delete rec.box0; }
    else { if (!rec.box0) rec.box0 = rec.box; rec.box = box; }
    for (const it of [byId[id], ITEMS.find(x => x.id === id)]) {
      if (!it) continue;
      it.box = rec.box;
      if (rec.box0) it.box0 = rec.box0; else delete it.box0;
    }
    renderStage();
    saveRecord("items", rec);
  }

  function nudge(how) {
    const it = get(state.fitId);
    if (!it) return;
    if (how === "reset") {
      if (it.box0) saveBox(it.id, null, true);
      else toast("THAT'S ALREADY WHERE IT STARTED.");
      return;
    }
    const [x, y, w, h] = outlineRect(it);
    refit(it.id, 0, 0, how === "bigger" ? 1.08 : 1 / 1.08, x + w / 2, y + h / 2);
  }

  // Dragging on the doll
  let drag = null;
  const svgPoint = (svg, e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  };
  function pointerDown(e) {
    if (!state.fitting) return;
    const svg = e.target.closest(".doll-svg");
    if (!svg) return;
    const hit = e.target.closest("[data-item]");
    if (hit && hit.dataset.item !== state.fitId && !e.target.closest(".fit-handle")) {
      state.fitId = hit.dataset.item;   // tapped a different piece: pick it
      renderStage();
      return;
    }
    const it = get(state.fitId);
    if (!it) return;
    e.preventDefault();
    drag = {
      svg, id: it.id, box: outlineRect(it), start: svgPoint(svg, e), dx: 0, dy: 0, s: 1,
      mode: e.target.closest(".fit-handle") ? "resize" : "move",
      group: svg.querySelector(`[data-item="${CSS.escape(it.id)}"]`), outline: svg.querySelector(".fit-outline")
    };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* fine: moves are watched on the whole page anyway */ }
  }
  function pointerMove(e) {
    if (!drag) return;
    const [x, y] = svgPoint(drag.svg, e);
    const [bx, by, bw, bh] = drag.box;
    let t;
    if (drag.mode === "move") {
      drag.dx = x - drag.start[0];
      drag.dy = y - drag.start[1];
      t = `translate(${drag.dx} ${drag.dy})`;
    } else {
      drag.s = Math.max(0.2, Math.min(4, Math.max((x - bx) / bw, (y - by) / bh)));
      t = `translate(${bx} ${by}) scale(${drag.s}) translate(${-bx} ${-by})`;
    }
    // While dragging, just slide the picture; the real position is saved when you let go.
    if (drag.group) drag.group.setAttribute("transform", t);
    if (drag.outline) drag.outline.setAttribute("transform", t);
  }
  function pointerUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === "move" ? Math.hypot(d.dx, d.dy) < 0.5 : Math.abs(d.s - 1) < 0.01) return;   // just a tap
    refit(d.id, d.dx, d.dy, d.s, d.box[0], d.box[1]);
  }

  /* ---------- USE MY PHOTO ---------- */
  let flow = null;   // the photo doll being made or adjusted (null when the pop-up is closed)
  const isPhone = () => window.matchMedia("(pointer: coarse)").matches;
  const wanted = token => flow && flow.token === token;
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));

  function newFlow(extra = {}) {
    if (flow) flow.urls.forEach(u => URL.revokeObjectURL(u));
    flow = { token: {}, urls: [], ...extra };
  }
  function urlFor(blob) {
    const u = URL.createObjectURL(blob);
    flow.urls.push(u);
    return u;
  }

  // The doll button: start USE MY PHOTO, or (if there's already a photo doll) show the doll options.
  function menu() {
    if (!mine) { startPhoto(); return; }
    const active = current.kind === "photo";
    newFlow();
    openModal("YOUR DOLL", `
      <img class="preview checker" src="${mineURL}" alt="Your doll photo">
      <p>${active ? "YOU'RE USING YOUR OWN PHOTO AS THE DOLL." : "YOU'RE USING THE DEFAULT DOLL. YOUR PHOTO IS SAVED FOR LATER."}</p>
      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="dl-toggle">${active ? "USE THE<br>DEFAULT DOLL" : "USE MY<br>PHOTO DOLL"}</button>
      </div>
      <div class="row">
        <button class="smallbtn" type="button" data-act="dl-markers">MOVE THE MARKERS</button>
        <button class="smallbtn" type="button" data-act="dl-new">NEW PHOTO</button>
        <button class="smallbtn" type="button" data-act="dl-delete">DELETE MY PHOTO</button>
      </div>`);
  }

  function startPhoto(note = "") {
    newFlow();
    const phone = isPhone();
    openModal("USE MY PHOTO", `${note}
      <p><b>PUT YOURSELF ON THE DOLL!</b> FOR THE BEST RESULT:</p>
      <ul class="tips">
        <li>STAND STRAIGHT, FACING THE CAMERA, FEET A LITTLE APART.</li>
        <li>ARMS SLIGHTLY OUT FROM YOUR SIDES, SO THERE'S A GAP AT YOUR WAIST.</li>
        <li>A PLAIN WALL BEHIND YOU, AND GOOD LIGHT.</li>
        <li>FITTED, PLAIN CLOTHES IN A NEUTRAL COLOUR (LIKE LEGGINGS AND A TEE).</li>
        <li>YOUR WHOLE BODY IN THE PHOTO, HEAD TO FEET. ASK A FRIEND, OR USE A TIMER.</li>
      </ul>
      <p class="tip"><b>PAPER-DOLL STYLE:</b> FLAT PHOTOS OF YOUR CLOTHES ARE LAYERED ON TOP OF YOUR PHOTO. IT'S FOR PLANNING OUTFITS, NOT A REALISTIC TRY-ON.</p>
      <div class="row modal-actions">
        ${phone ? `<button class="bigbtn pinkbtn" type="button" data-act="dl-camera">TAKE A<br>PHOTO</button>` : ""}
        <button class="bigbtn${phone ? "" : " pinkbtn"}" type="button" data-act="dl-pick">CHOOSE A<br>PHOTO</button>
      </div>
      <p class="fine">♥ YOUR PHOTO STAYS ON THIS DEVICE. THE BACKGROUND IS REMOVED RIGHT HERE, NOT ONLINE.</p>`);
  }

  async function gotFile(file) {
    if (!flow) newFlow();
    const token = flow.token;
    openModal("USE MY PHOTO", `<div class="busy"><p class="blinky">OPENING YOUR PHOTO...</p></div>`);
    let photo;
    try {
      photo = await Photos.open(file, 1500);
    } catch (e) {
      if (wanted(token)) startPhoto(`<p class="warn">${esc(e.message)}</p>`);
      return;
    }
    if (!wanted(token)) return;
    if (Photos.hasTransparency(photo) && Photos.trim(photo)) { keep(Photos.trim(photo)); return; }   // already a cut-out
    flow.photoBlob = await toBlob(photo, "image/jpeg", 0.92);
    flow.photoURL = urlFor(flow.photoBlob);
    if (Cutout.firstTime()) {
      openModal("USE MY PHOTO", AddPiece.downloadNoticeHTML(flow.photoURL, `
        <button class="bigbtn pinkbtn" type="button" data-act="dl-cut">CUT ME<br>OUT</button>
        <button class="smallbtn" type="button" data-act="dl-another">TRY ANOTHER PHOTO</button>`));
    } else {
      cut();
    }
  }

  async function cut() {
    if (!flow || !flow.photoBlob) return;
    const token = flow.token;
    let error = null;
    try {
      flow.cutout = await AddPiece.cutWithProgress("USE MY PHOTO", flow.photoURL, flow.photoBlob, () => wanted(token));
      flow.cutoutURL = urlFor(await toBlob(flow.cutout, "image/png"));
    } catch (e) {
      if (e.message === "stopped") return;
      error = e.message;
    }
    if (!wanted(token)) return;
    openModal("USE MY PHOTO", `
      <div class="compare">
        <figure><img src="${flow.photoURL}" alt="Your photo"><figcaption>BEFORE</figcaption></figure>
        <figure>${error ? `<div class="failed">✕</div>` : `<img class="checker" src="${flow.cutoutURL}" alt="Cut-out">`}<figcaption>AFTER</figcaption></figure>
      </div>
      ${error
        ? `<p class="warn">THE CUT-OUT DIDN'T WORK. ${/^[A-Z ,.'!?-]+$/.test(error) ? esc(error) : ""}</p>
           <div class="row modal-actions">
             <button class="bigbtn pinkbtn" type="button" data-act="dl-cut">TRY<br>AGAIN</button>
             <button class="smallbtn" type="button" data-act="dl-another">TRY ANOTHER PHOTO</button>
           </div>`
        : `<p>HOW DOES IT LOOK? NEXT YOU'LL MARK WHERE YOUR SHOULDERS, WAIST AND ANKLES ARE.</p>
           <div class="row modal-actions">
             <button class="bigbtn pinkbtn" type="button" data-act="dl-keep">LOOKS<br>GOOD!</button>
             <button class="smallbtn" type="button" data-act="dl-another">TRY ANOTHER PHOTO</button>
           </div>`}`);
  }

  // Place the cut-out on the stage, guess the markers, and show the marker screen.
  async function keep(canvas) {
    canvas = canvas || flow.cutout;
    flow.cutout = canvas;
    flow.imageURL = flow.cutoutURL || urlFor(await toBlob(canvas, "image/png"));
    flow.rect = frameRect(canvas.width / canvas.height);
    const px = Photos.bodyMarks(canvas);
    flow.guess = px ? toFrame(px, flow.rect, canvas.width, canvas.height) : JSON.parse(JSON.stringify(STD_MARKS));
    flow.marks = JSON.parse(JSON.stringify(flow.guess));
    showMarkers();
  }

  // Adjust the markers on the photo doll that's already saved.
  function adjustMarkers() {
    newFlow({ existing: true, imageURL: mineURL, rect: mine.rect.slice() });
    flow.guess = JSON.parse(JSON.stringify(mine.marks));
    flow.marks = JSON.parse(JSON.stringify(mine.marks));
    showMarkers();
  }

  function markersSVG() {
    const m = flow.marks;
    const line = (a, b) => `<line class="calib-line" x1="${m[a][0]}" y1="${m[a][1]}" x2="${m[b][0]}" y2="${m[b][1]}"/>`;
    const dots = MARKERS.map(([key, label, colour]) => {
      const left = key.endsWith("L");
      return `<g class="marker" data-mark="${key}" transform="translate(${m[key][0]} ${m[key][1]})">
        <circle r="11" fill="transparent"/>
        <circle r="4.5" fill="${colour}" stroke="${OUT}" stroke-width="1.2"/>
        <text x="${left ? -7 : 7}" y="2.5" text-anchor="${left ? "end" : "start"}">${label}</text></g>`;
    }).join("");
    return line("shoulderL", "shoulderR") + line("waistL", "waistR") + line("ankleL", "ankleR") + dots;
  }

  function showMarkers() {
    const [x, y, w, h] = flow.rect;
    openModal("MARK YOUR BODY", `
      <p>DRAG EACH DOT ONTO YOUR PHOTO, SO YOUR CLOTHES LAND IN THE RIGHT PLACE:</p>
      <p class="fine"><b>HEAD</b> = THE TOP OF YOUR HEAD · <b>SHOULDERS</b> = WHERE YOUR ARMS START · <b>WAIST</b> = THE NARROWEST PART · <b>ANKLES</b></p>
      <svg class="calib checker" id="calib" viewBox="0 0 200 500" aria-label="Your photo with body markers">
        <image href="${flow.imageURL}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>
        <g id="calibMarks">${markersSVG()}</g>
      </svg>
      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="dl-save">SAVE MY<br>DOLL</button>
        <button class="smallbtn" type="button" data-act="dl-reguess">PUT THE DOTS BACK</button>
      </div>`);
  }

  // Dragging the markers
  let markDrag = null;
  function markDown(e) {
    const dot = e.target.closest("#calib .marker");
    if (!dot || !flow) return;
    e.preventDefault();
    markDrag = { key: dot.dataset.mark, svg: dot.ownerSVGElement };
    try { markDrag.svg.setPointerCapture(e.pointerId); } catch (err) { /* fine: moves are watched on the whole page anyway */ }
  }
  function markMove(e) {
    if (!markDrag) return;
    const [x, y] = svgPoint(markDrag.svg, e);
    flow.marks[markDrag.key] = [Math.max(0, Math.min(200, x)), Math.max(0, Math.min(500, y))];
    $("calibMarks").innerHTML = markersSVG();
  }
  function markUp() { markDrag = null; }

  async function saveDoll() {
    const m = {};
    for (const [key, [x, y]] of Object.entries(flow.marks)) m[key] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    // Keep left on the left, and check the dots are in head-to-toe order.
    for (const side of ["shoulder", "waist", "ankle"]) {
      if (m[side + "L"][0] > m[side + "R"][0]) [m[side + "L"], m[side + "R"]] = [m[side + "R"], m[side + "L"]];
    }
    const lvl = s => (m[s + "L"][1] + m[s + "R"][1]) / 2;
    if (!(m.head[1] + 8 < lvl("shoulder") && lvl("shoulder") + 8 < lvl("waist") && lvl("waist") + 30 < lvl("ankle")) ||
        m.shoulderR[0] - m.shoulderL[0] < 8 || m.waistR[0] - m.waistL[0] < 5) {
      toast("THE DOTS LOOK MIXED UP. FROM THE TOP: HEAD, THEN SHOULDERS, WAIST, ANKLES.");
      return;
    }
    const token = flow.token, existing = flow.existing;
    let record;
    if (existing) {
      record = { ...mine, marks: m, active: true };
    } else {
      openModal("USE MY PHOTO", `<div class="busy"><p class="blinky">SAVING YOUR DOLL...</p></div>`);
      record = { key: "doll", image: await Photos.save(flow.cutout, 1200), rect: flow.rect, marks: m, active: true, created: Date.now() };
    }
    if (!wanted(token)) return;
    await saveRecord("settings", record);
    setMine(record);
    state.view = "doll";
    closeModal();
    renderAll();
    toast(existing ? "MARKERS SAVED ♥" : "♥ YOU'RE THE DOLL NOW! TAP FIT PIECES TO NUDGE ANYTHING THAT SITS WRONG.");
  }

  async function toggle() {
    mine.active = current.kind !== "photo";
    await saveRecord("settings", mine);
    choose();
    closeModal();
    renderAll();
  }

  async function remove() {
    if (!confirm("Delete your doll photo from this device? (Your clothes stay.)")) return;
    await deleteRecord("settings", "doll");
    setMine(null);
    closeModal();
    renderAll();
    toast("DOLL PHOTO DELETED.");
  }

  /* ---------- buttons, pickers and dragging ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act^='dl-']");
    if (!b) return;
    switch (b.dataset.act) {
      case "dl-camera": $("dollCamera").click(); break;
      case "dl-pick": $("dollPick").click(); break;
      case "dl-cut": cut(); break;
      case "dl-keep": keep(); break;
      case "dl-another": startPhoto(); break;
      case "dl-reguess": flow.marks = JSON.parse(JSON.stringify(flow.guess)); $("calibMarks").innerHTML = markersSVG(); break;
      case "dl-save": saveDoll(); break;
      case "dl-toggle": toggle(); break;
      case "dl-markers": adjustMarkers(); break;
      case "dl-new": startPhoto(); break;
      case "dl-delete": remove(); break;
    }
  });
  for (const id of ["dollCamera", "dollPick"]) {
    $(id).addEventListener("change", e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) gotFile(file);
    });
  }
  $("stage").addEventListener("pointerdown", pointerDown);
  $("modal").addEventListener("pointerdown", markDown);
  document.addEventListener("pointermove", e => { pointerMove(e); markMove(e); });
  document.addEventListener("pointerup", () => { pointerUp(); markUp(); });
  document.addEventListener("pointercancel", () => { drag = null; markDrag = null; });
  $("modal").addEventListener("close", () => {
    if (flow) flow.urls.forEach(u => URL.revokeObjectURL(u));
    flow = null;
  });

  return {
    init, setMine, baseSVG, pieceSVG, fitOutlineSVG, startFit, nudge, menu,
    get hasPhoto() { return !!mine; },
    get kind() { return current.kind; }
  };
})();

/* ---------- drawing the doll with clothes on (used all over script.js) ---------- */
function placeOnDoll(it) {
  return Doll.pieceSVG(it);
}

function dollSVG(o) {
  const top = get(o.top), dress = top && top.cat === "dress";
  let s = Doll.baseSVG();
  for (const layer of ["underwear", "shoes", "bottom", "top", "jacket", "scarves", "bracelets", "earrings", "sunnies", "hats"]) {
    const it = layer === "bottom" ? (dress ? null : get(o.bottom)) : get(o[layer]);
    if (it) s += placeOnDoll(it);
  }
  if (state.fitting && o === state.outfit) s += Doll.fitOutlineSVG();
  const names = wornItems(o).map(it => it.name).join(", ") || "nothing";
  return `<svg class="doll-svg${state.fitting ? " fitting" : ""}" viewBox="0 0 200 500" role="img" aria-label="Doll wearing ${esc(names)}">
    <ellipse cx="100" cy="473" rx="48" ry="7" fill="${OUT}" opacity=".14"/>${s}</svg>`;
}
