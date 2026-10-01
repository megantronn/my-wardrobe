/* ======================================================================
   LOOKBOOK.JS — photos of outfits you actually wore.

   - ADD OUTFIT PHOTO: a mirror selfie or full-length photo -> cut yourself out
     (optional, so you stand on the Y2K wallpaper like a magazine cut-out) ->
     tap the closet pieces you're wearing -> JUDGE & SAVE. The verdict comes from the
     same matching rules as the doll, judged for the season the look was worn in,
     and is stamped on the photo.
   - The LOOKBOOK view: every look by date, with a season filter.
   - A look can be PUT ON THE DOLL, and the doll's outfit can be saved TO LOOKBOOK
     to photograph later.
   - Each closet piece shows which lookbook photos it's in.
   Looks are saved in this browser (the "lookbook" drawer, see db.js) and go into backups.
   (The pieces in a look are tapped by hand: recognising clothes in a photo
   automatically would need a paid AI service.)
   ====================================================================== */
const Lookbook = (() => {
  let entries = [];          // every look, newest first: { id, created, date, season, outfit, photo, cutout, url }
  let byItem = new Map();    // closet piece id -> the looks it's in
  let flow = null;           // the look being added or changed in the pop-up (null when it's closed)
  const TAG_CATS = ["top", "dress", "bottom", "jacket", "shoes", "earrings", "bracelets", "scarves", "hats", "sunnies"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const two = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
  const parseDate = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y || 2000, (m || 1) - 1, d || 1); };
  const niceDate = s => { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const isPhone = () => window.matchMedia("(pointer: coarse)").matches;
  const wanted = token => flow && flow.token === token;
  // Only the clothes count (no underwear in lookbook photos).
  const cleanOutfit = o => {
    const out = emptyOutfit();
    for (const slot of Object.keys(out)) if (o && o[slot] && slot !== "underwear") out[slot] = o[slot];
    return out;
  };
  const verdictFor = e => evaluate(e.outfit, e.season || "ALL");

  /* ---------- loading ---------- */
  async function load() {
    for (const e of entries) if (e.url) URL.revokeObjectURL(e.url);
    const rows = await DB.getAll("lookbook");
    entries = rows.filter(r => r && typeof r.id === "string" && r.outfit)
      .map(r => ({ ...r, url: r.photo instanceof Blob ? URL.createObjectURL(r.photo) : null }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.created - a.created);
    byItem = new Map();
    for (const e of entries) {
      for (const id of Object.values(e.outfit)) if (id) { if (!byItem.has(id)) byItem.set(id, []); byItem.get(id).push(e); }
    }
  }
  const count = id => (byItem.get(id) || []).length;
  const total = () => entries.length;

  /* ---------- the LOOKBOOK view (the gallery) ---------- */
  function picHTML(e) {
    if (e.url) return `<img src="${e.url}" alt="Outfit photo from ${niceDate(e.date)}">`;
    return `<span class="lb-doll">${dollSVG(e.outfit)}<span class="to-shoot">TO PHOTOGRAPH</span></span>`;
  }

  function cardHTML(e) {
    const v = verdictFor(e);
    return `<button class="look-card" type="button" data-act="lb-open" data-arg="${esc(e.id)}">
      <span class="look-pic${e.cutout ? " y2k" : ""}">${picHTML(e)}<span class="stamp still" style="color:${v.color}">${v.tier}</span></span>
      <span class="look-meta"><span>${niceDate(e.date)}</span><span>${esc((e.season || "").toUpperCase())}${v.complete ? ` · ${v.score}` : ""}</span></span>
    </button>`;
  }

  function viewHTML() {
    const season = state.lookSeason;
    const shown = entries.filter(e => season === "ALL" || (e.season || "").toUpperCase() === season);
    return `<div class="stage-head"><span class="label">LOOKBOOK</span><span>${plural(shown.length, "LOOK")}</span>
        <button class="chip" type="button" data-act="lb-add">+ ADD OUTFIT PHOTO</button></div>
      <div class="chips">${SEASONS.map(s => `<button class="chip" type="button" data-act="lb-season" data-arg="${s}" aria-pressed="${season === s}">${s}</button>`).join("")}</div>
      ${shown.length ? `<div class="lookbook">${shown.map(cardHTML).join("")}</div>` : `
        <div class="lb-empty">
          <p><b>${entries.length ? "NO LOOKS FROM THIS SEASON YET." : "YOUR LOOKBOOK IS EMPTY!"}</b></p>
          <p>SNAP A MIRROR SELFIE OF WHAT YOU'RE WEARING, TAP THE PIECES IN IT, AND THE COMPUTER WILL JUDGE IT.</p>
          <button class="bigbtn pinkbtn" type="button" data-act="lb-add">ADD OUTFIT<br>PHOTO</button>
          <p class="fine">OR DRESS THE DOLL AND PRESS <b>TO LOOKBOOK</b> TO SAVE A LOOK TO PHOTOGRAPH LATER.</p>
        </div>`}`;
  }

  // A row of little photos, for a closet piece's EDIT PIECE screen.
  function stripHTML(itemId) {
    const list = byItem.get(itemId) || [];
    if (!list.length) return "";
    return `<div class="field">IN YOUR LOOKBOOK<div class="look-strip">${list.map(e =>
      `<button class="mini-look${e.cutout ? " y2k" : ""}" type="button" data-act="lb-open" data-arg="${esc(e.id)}" aria-label="Look from ${niceDate(e.date)}">${e.url ? `<img src="${e.url}" alt="">` : "TO SHOOT"}</button>`).join("")}</div></div>`;
  }

  /* ---------- one look, big ---------- */
  function open(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    const v = verdictFor(e);
    openModal(`LOOK · ${niceDate(e.date)}`, `
      <div class="look-big${e.cutout ? " y2k" : ""}">${picHTML(e)}<div class="stamp stay" style="color:${v.color}">${v.tier}</div></div>
      <p class="fine">WORN ${niceDate(e.date)} · JUDGED FOR ${esc((e.season || "ALL").toUpperCase())}${e.url ? "" : " · PLANNED ON THE DOLL, NOT PHOTOGRAPHED YET"}</p>
      <div class="look-verdict">${verdictHTML(v, wornItems(e.outfit))}</div>
      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="lb-wear" data-arg="${esc(e.id)}">PUT ON<br>THE DOLL</button>
        ${e.url ? "" : `<button class="smallbtn pink" type="button" data-act="lb-photo" data-arg="${esc(e.id)}">ADD THE PHOTO</button>`}
        <button class="smallbtn" type="button" data-act="lb-pieces" data-arg="${esc(e.id)}">CHANGE PIECES</button>
        <button class="smallbtn" type="button" data-act="lb-delete" data-arg="${esc(e.id)}">DELETE</button>
      </div>`);
  }

  function wear(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    state.outfit = { ...emptyOutfit(), ...cleanOutfit(e.outfit), underwear: state.outfit.underwear };
    state.view = "doll";
    closeModal();
    renderAll();
    toast("THIS LOOK IS ON THE DOLL ♥");
  }

  async function remove(id) {
    if (!confirm("Delete this look from your lookbook? (The clothes stay in your closet.)")) return;
    await deleteRecord("lookbook", id);
    await load();
    closeModal();
    renderAll();
    toast("LOOK DELETED.");
  }

  // TO LOOKBOOK: save the doll's outfit as a look to photograph later.
  async function planFromDoll() {
    const outfit = cleanOutfit(state.outfit);
    if (!wornItems(outfit).length) { toast("DRESS THE DOLL FIRST, THEN SAVE IT TO YOUR LOOKBOOK."); return; }
    const date = today();
    await saveRecord("lookbook", {
      id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      created: Date.now(), date, season: seasonOf(parseDate(date)), outfit, photo: null, cutout: false
    });
    await load();
    renderAll();
    toast("SAVED TO YOUR LOOKBOOK, READY TO PHOTOGRAPH ♥ (SEE THE LOOKBOOK VIEW)");
  }

  /* ---------- adding an outfit photo ---------- */
  function newFlow(extra = {}) {
    if (flow) flow.urls.forEach(u => URL.revokeObjectURL(u));
    flow = { token: {}, urls: [], cat: "all", ...extra };
  }
  function urlFor(blob) {
    const u = URL.createObjectURL(blob);
    flow.urls.push(u);
    return u;
  }

  // planId: a planned look (from TO LOOKBOOK) that's getting its photo now.
  function start(planId = null, note = "") {
    newFlow({ planId });
    const phone = isPhone();
    openModal("ADD OUTFIT PHOTO", `${note}
      <p><b>SHOW OFF WHAT YOU'RE WEARING!</b></p>
      <ul class="tips">
        <li>A MIRROR SELFIE OR A FULL-LENGTH PHOTO, WITH THE WHOLE OUTFIT IN THE SHOT.</li>
        <li>GOOD LIGHT HELPS (AND A PLAIN BACKGROUND, IF YOU WANT TO CUT YOURSELF OUT).</li>
        <li>NEXT YOU'LL TAP THE PIECES YOU'RE WEARING, AND THE COMPUTER WILL JUDGE THE LOOK.</li>
      </ul>
      <div class="row modal-actions">
        ${phone ? `<button class="bigbtn pinkbtn" type="button" data-act="lb-camera">TAKE A<br>PHOTO</button>` : ""}
        <button class="bigbtn${phone ? "" : " pinkbtn"}" type="button" data-act="lb-pick">CHOOSE A<br>PHOTO</button>
      </div>
      <p class="fine">♥ YOUR PHOTO STAYS ON THIS DEVICE.</p>`);
  }

  async function gotFile(file) {
    if (!flow) newFlow();
    const token = flow.token;
    openModal("ADD OUTFIT PHOTO", `<div class="busy"><p class="blinky">OPENING YOUR PHOTO...</p></div>`);
    let photo;
    try {
      photo = await Photos.open(file, 1500);
    } catch (e) {
      if (wanted(token)) start(flow.planId, `<p class="warn">${esc(e.message)}</p>`);
      return;
    }
    if (!wanted(token)) return;
    flow.photo = photo;
    // Already a cut-out? Use it as it is.
    if (Photos.hasTransparency(photo)) { const t = Photos.trim(photo); if (t) { choose(t, true); return; } }
    flow.photoBlob = await toBlob(photo, "image/jpeg", 0.92);
    flow.photoURL = urlFor(flow.photoBlob);
    openModal("ADD OUTFIT PHOTO", `
      <img class="preview" src="${flow.photoURL}" alt="Your outfit photo">
      <p><b>CUT YOURSELF OUT, MAGAZINE STYLE?</b> THE BACKGROUND IS REMOVED SO YOU STAND ON THE Y2K SCREEN.</p>
      ${Cutout.firstTime() ? `<p class="fine">FIRST TIME ONLY: THIS DOWNLOADS THE CUT-OUT TOOL (ABOUT ${Cutout.DOWNLOAD_MB} MB, WI-FI RECOMMENDED). YOUR PHOTO NEVER LEAVES THIS DEVICE.</p>` : ""}
      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="lb-cut">CUT ME<br>OUT</button>
        <button class="smallbtn" type="button" data-act="lb-original">KEEP THE PHOTO AS IT IS</button>
      </div>`);
  }

  async function cut() {
    if (!flow || !flow.photoBlob) return;
    const token = flow.token;
    let error = null;
    try {
      flow.cutout = await AddPiece.cutWithProgress("ADD OUTFIT PHOTO", flow.photoURL, flow.photoBlob, () => wanted(token));
      flow.cutoutURL = urlFor(await toBlob(flow.cutout, "image/png"));
    } catch (e) {
      if (e.message === "stopped") return;
      error = e.message;
    }
    if (!wanted(token)) return;
    openModal("ADD OUTFIT PHOTO", `
      <div class="compare">
        <figure><img src="${flow.photoURL}" alt="Your photo"><figcaption>BEFORE</figcaption></figure>
        <figure>${error ? `<div class="failed">✕</div>` : `<img class="y2k" src="${flow.cutoutURL}" alt="Cut-out">`}<figcaption>AFTER</figcaption></figure>
      </div>
      ${error ? `<p class="warn">THE CUT-OUT DIDN'T WORK. ${/^[A-Z ,.'!?-]+$/.test(error) ? esc(error) : ""}</p>` : "<p>HOW DOES IT LOOK?</p>"}
      <div class="row modal-actions">
        ${error ? `<button class="bigbtn pinkbtn" type="button" data-act="lb-cut">TRY<br>AGAIN</button>`
                : `<button class="bigbtn pinkbtn" type="button" data-act="lb-keep">KEEP THE<br>CUT-OUT</button>`}
        <button class="smallbtn" type="button" data-act="lb-original">USE THE ORIGINAL PHOTO</button>
      </div>`);
  }

  // The picture is chosen (cut-out or original): now tap the pieces.
  async function choose(canvas, isCutout) {
    flow.chosen = canvas;
    flow.isCutout = isCutout;
    flow.previewURL = urlFor(await toBlob(canvas, isCutout ? "image/png" : "image/jpeg", 0.9));
    const plan = flow.planId && entries.find(x => x.id === flow.planId);
    flow.outfit = plan ? cleanOutfit(plan.outfit) : emptyOutfit();
    flow.date = today();
    flow.season = seasonOf(new Date());
    showTagging();
  }

  // CHANGE PIECES on a saved look (the photo stays the same).
  function changePieces(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    newFlow({ editId: id, outfit: cleanOutfit(e.outfit), date: e.date, season: e.season || seasonOf(parseDate(e.date)), previewURL: e.url, isCutout: e.cutout });
    showTagging();
  }

  /* ---------- tapping the pieces you're wearing ---------- */
  function tagHTML() {
    const o = flow.outfit, v = evaluate(o, flow.season);
    const on = new Set(Object.values(o).filter(Boolean));
    // The pieces already picked come first, so you can see them without scrolling.
    const items = ITEMS.filter(it => it.cat !== "underwear" && (flow.cat === "all" || it.cat === flow.cat))
      .sort((a, b) => on.has(b.id) - on.has(a.id));
    const cats = ["all", ...TAG_CATS.filter(c => ITEMS.some(it => it.cat === c))];
    return `
      ${flow.previewURL ? `<img class="preview${flow.isCutout ? " y2k" : ""}" src="${flow.previewURL}" alt="Your outfit photo">` : ""}
      <p><b>TAP EVERY PIECE YOU'RE WEARING.</b> ${ITEMS.length ? "" : "YOUR CLOSET IS EMPTY, SO ADD SOME PIECES FIRST TO GET A VERDICT."}</p>
      <div class="lb-live" style="color:${v.color}">${v.complete ? `${v.tier} · ${v.score}/100` : "PICK A TOP AND A BOTTOM, OR A DRESS"}</div>
      <div class="chips">${cats.map(c => `<button class="chip" type="button" data-act="lb-cat" data-arg="${c}" aria-pressed="${flow.cat === c}">${c === "all" ? "ALL" : CATS[c]}</button>`).join("")}</div>
      <div class="pick-grid">${items.map(it => `
        <button class="pick${on.has(it.id) ? " on" : ""}" type="button" data-act="lb-tag" data-arg="${esc(it.id)}" aria-pressed="${on.has(it.id)}">
          ${on.has(it.id) ? '<span class="on-badge">ON</span>' : ""}<img src="${esc(it.img)}" alt="" loading="lazy"><span>${esc(it.name)}</span>
        </button>`).join("")}</div>
      <label class="field">DATE WORN <input id="lookDate" type="date" value="${flow.date}" max="${today()}"></label>
      <div class="field">JUDGE IT FOR<div class="chips">${SEASONS.slice(1).map(s => `<button class="chip" type="button" data-act="lb-lseason" data-arg="${s}" aria-pressed="${flow.season === s}">${s}</button>`).join("")}</div></div>
      <div class="row modal-actions"><button class="bigbtn pinkbtn" type="button" data-act="lb-save">JUDGE &amp;<br>SAVE</button></div>`;
  }

  function showTagging() {
    const body = $("modalBody");
    const scroll = $("modal").open && body ? body.scrollTop : 0;
    openModal(flow.editId ? "CHANGE PIECES" : "WHAT ARE YOU WEARING?", tagHTML());
    $("modalBody").scrollTop = scroll;
  }

  // Tap a piece: put it on (replacing whatever was in that slot), or take it off.
  function toggle(id) {
    const it = get(id);
    if (!it) return;
    const o = flow.outfit;
    const slot = it.cat === "dress" ? "top" : it.cat;
    if (o[slot] === id) { o[slot] = null; showTagging(); return; }
    o[slot] = id;
    if (it.cat === "dress") o.bottom = null;                        // a dress needs no bottom
    if (it.cat === "bottom" && get(o.top) && get(o.top).cat === "dress") o.top = null;
    showTagging();
  }

  async function save() {
    const token = flow.token;
    openModal("JUDGING...", `<div class="busy"><p class="blinky">THE COMPUTER IS JUDGING YOUR LOOK...</p></div>`);
    try {
      const old = entries.find(x => x.id === (flow.editId || flow.planId));
      const rec = old ? { ...old } : { id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now() };
      delete rec.url;   // (only used while the page is open)
      rec.outfit = cleanOutfit(flow.outfit);
      rec.date = flow.date || today();
      rec.season = flow.season;
      if (flow.chosen) {
        rec.photo = await Photos.save(flow.chosen, 1200);
        rec.cutout = !!flow.isCutout;
      }
      await saveRecord("lookbook", rec);
      await load();
      if (!wanted(token)) return;
      state.view = "lookbook";
      renderAll();
      open(rec.id);   // show it with its verdict stamp
    } catch (e) {
      if (wanted(token)) { showTagging(); toast("SORRY, THAT DIDN'T SAVE. TRY AGAIN."); }
    }
  }

  /* ---------- buttons, pickers and inputs ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act^='lb-']");
    if (!b) return;
    const arg = b.dataset.arg;
    switch (b.dataset.act) {
      case "lb-add": start(); break;
      case "lb-season": state.lookSeason = arg; renderStage(); break;
      case "lb-open": open(arg); break;
      case "lb-wear": wear(arg); break;
      case "lb-delete": remove(arg); break;
      case "lb-plan": planFromDoll(); break;
      case "lb-photo": start(arg); break;
      case "lb-pieces": changePieces(arg); break;
      case "lb-camera": $("lookCamera").click(); break;
      case "lb-pick": $("lookPick").click(); break;
      case "lb-cut": cut(); break;
      case "lb-keep": if (flow) choose(flow.cutout, true); break;
      case "lb-original": if (flow) choose(flow.photo, false); break;
      case "lb-cat": if (flow) { flow.cat = arg; showTagging(); } break;
      case "lb-tag": if (flow) toggle(arg); break;
      case "lb-lseason": if (flow) { flow.season = arg; showTagging(); } break;
      case "lb-save": if (flow) save(); break;
    }
  });
  // The date picker: changing the date also picks the season for that date.
  document.addEventListener("change", e => {
    if (e.target.id !== "lookDate" || !flow || !e.target.value) return;
    flow.date = e.target.value;
    flow.season = seasonOf(parseDate(flow.date));
    showTagging();
  });
  for (const id of ["lookCamera", "lookPick"]) {
    $(id).addEventListener("change", e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) gotFile(file);
    });
  }
  $("modal").addEventListener("close", () => {
    if (flow) flow.urls.forEach(u => URL.revokeObjectURL(u));
    flow = null;
  });

  return { load, viewHTML, stripHTML, count, total, open };
})();
