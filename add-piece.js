/* ======================================================================
   ADD-PIECE.JS — the ADD PIECE button, and editing or deleting pieces later.

   Adding a piece goes through these steps (each one is a screen in the pop-up box):
     1. pick a photo, or take one with the phone camera
     2. shrink it (big phone photos would be slow and can crash phones)
     3. cut out the background (cutout.js), showing the one-time download
     4. before/after: keep the cut-out, try another photo, or keep the original
     5. tag it: name, category, colour (guessed from the photo), pattern, shape...
     6. save it to the closet, and put it on the doll

   It uses Photos (photos.js) and Cutout (cutout.js), plus these from script.js:
   openModal, closeModal, toast, esc, $, get, CATS, COLORS, defaultBox, equip,
   saveRecord, deleteRecord, loadCloset, renderAll, state.
   ====================================================================== */
const AddPiece = (() => {
  const PHOTO_SIDE = 1500;   // photos are shrunk to this (longest side, in pixels) before cutting out
  const SAVE_SIDE = 1200;    // the biggest size a piece is saved at
  const PAIR_SIDE = 700;     // each half of a pair (earrings, shoes)

  // Words used on the tagging form
  const CAT_WORD = { top: "Top", bottom: "Bottoms", dress: "Dress", jacket: "Jacket", shoes: "Shoes", earrings: "Earrings",
    bracelets: "Bracelet", scarves: "Scarf", hats: "Hat", sunnies: "Sunnies", underwear: "Underwear Set" };
  const SHAPES = { top: ["fitted", "loose"], dress: ["fitted", "loose"], jacket: ["fitted", "loose"], bottom: ["fitted", "wide", "flare"] };
  const PATTERNS = ["solid", "print", "plaid", "floral", "dots", "stripes"];
  const DRESSY_WORDS = ["SPORTY", "CASUAL", "EVERYDAY", "GOING OUT"];
  const PAIRS = ["earrings", "shoes"];   // categories where we try to split a pair into left and right

  let job = null;   // the piece being added or edited right now (null when the pop-up is closed)

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const busyHTML = msg => `<div class="busy"><p class="blinky">${msg}</p></div>`;
  const isPhone = () => window.matchMedia("(pointer: coarse)").matches;
  const stillMine = token => job && job.token === token;   // false if the person closed or restarted

  function dressyWord(v) {
    const lo = Math.floor(v), hi = Math.ceil(v);
    return lo === hi ? DRESSY_WORDS[lo] : `${DRESSY_WORDS[lo]} / ${DRESSY_WORDS[hi]}`;
  }

  // Throw away the current job and free its memory.
  function forget() {
    if (job) (job.urls || []).forEach(u => URL.revokeObjectURL(u));
    job = null;
  }
  function newJob(extra) {
    forget();
    job = { token: {}, urls: [], ...extra };
    return job;
  }
  function urlFor(blob) {
    const u = URL.createObjectURL(blob);
    job.urls.push(u);
    return u;
  }

  /* ---------- step 1: pick a photo ---------- */
  function start(note = "") {
    newJob({ mode: "add" });
    openModal("ADD PIECE", pickHTML(note));
  }

  function pickHTML(note) {
    const phone = isPhone();
    return `${note}
      <p><b>TIPS FOR A GREAT CUT-OUT</b></p>
      <ul class="tips">
        <li>ONE PIECE AT A TIME, LAID FLAT OR ON A HANGER.</li>
        <li>A PLAIN BACKGROUND IN A DIFFERENT COLOUR TO THE CLOTHES (A BED, FLOOR OR WALL).</li>
        <li>GOOD LIGHT, AND FILL THE PHOTO WITH THE PIECE.</li>
        <li>EARRINGS AND SHOES: PUT THE PAIR SIDE BY SIDE WITH A GAP BETWEEN THEM.</li>
      </ul>
      <div class="row modal-actions">
        ${phone ? `<button class="bigbtn pinkbtn" type="button" data-act="ap-camera">TAKE A<br>PHOTO</button>` : ""}
        <button class="bigbtn${phone ? "" : " pinkbtn"}" type="button" data-act="ap-pick">CHOOSE A<br>PHOTO</button>
      </div>
      <p class="fine">♥ YOUR PHOTO STAYS ON THIS DEVICE. THE BACKGROUND IS REMOVED RIGHT HERE, NOT ONLINE.</p>`;
  }

  /* ---------- step 2: open and shrink the photo ---------- */
  async function gotFile(file) {
    if (!job || job.mode !== "add") start();
    const token = job.token;
    openModal("ADD PIECE", busyHTML("OPENING YOUR PHOTO..."));
    let photo;
    try {
      photo = await Photos.open(file, PHOTO_SIDE);
    } catch (e) {
      if (stillMine(token)) openModal("ADD PIECE", pickHTML(`<p class="warn">${esc(e.message)}</p>`));
      return;
    }
    if (!stillMine(token)) return;
    job.photo = photo;
    // Already a cut-out (a PNG/WebP with a see-through background)? Skip straight to tagging.
    if (Photos.hasTransparency(photo)) {
      const trimmed = Photos.trim(photo);
      if (trimmed) { choose(trimmed, true); return; }
    }
    job.photoBlob = await toBlob(photo, "image/jpeg", 0.92);
    job.photoURL = urlFor(job.photoBlob);
    if (Cutout.firstTime()) showDownloadNotice();
    else runCutout();
  }

  // The first time only: warn about the download before starting it.
  // (Also used by USE MY PHOTO in doll.js, with its own buttons.)
  function downloadNoticeHTML(photoURL, buttons) {
    return `
      <img class="preview" src="${photoURL}" alt="Your photo">
      <p><b>FIRST TIME ONLY:</b> TO CUT OUT THE BACKGROUND, YOUR BROWSER NEEDS TO DOWNLOAD THE CUT-OUT TOOL (ABOUT ${Cutout.DOWNLOAD_MB} MB). USE WI-FI IF YOU CAN. AFTER THAT IT'S SAVED, SO NEXT TIME IS QUICK.</p>
      <p>♥ ONLY THE TOOL IS DOWNLOADED. YOUR PHOTO NEVER LEAVES THIS DEVICE.</p>
      <div class="row modal-actions">${buttons}</div>`;
  }
  function showDownloadNotice() {
    openModal("ADD PIECE", downloadNoticeHTML(job.photoURL, `
      <button class="bigbtn pinkbtn" type="button" data-act="ap-cut">CUT IT<br>OUT</button>
      <button class="smallbtn" type="button" data-act="ap-original">SKIP: KEEP MY PHOTO AS IT IS</button>`));
  }

  /* ---------- step 3: cut out the background ---------- */
  // Shows the "cutting out" screen (with the one-time download progress) while the
  // background is removed, then returns the cut-out as a canvas, cropped to its contents.
  // isWanted() says whether the person is still on this screen. (Also used by doll.js.)
  async function cutWithProgress(title, photoURL, photoBlob, isWanted) {
    openModal(title, `
      <div class="working"><img class="preview" src="${photoURL}" alt="Your photo"><div class="scanline"></div></div>
      <p class="blinky" id="cutStatus">STARTING THE CUT-OUT TOOL...</p>
      <div class="progress" id="cutBar" hidden><i id="cutFill"></i></div>
      <p class="fine">THIS CAN TAKE UP TO A MINUTE ON OLDER PHONES. KEEP THIS SCREEN OPEN.</p>`);
    // After the first time, the browser loads its saved copy of the tool instead of downloading it.
    const loading = Cutout.firstTime() ? "DOWNLOADING THE CUT-OUT TOOL (ONE TIME ONLY)" : "LOADING THE CUT-OUT TOOL";
    const blob = await Cutout.remove(photoBlob, p => {
      if (!isWanted() || !$("cutStatus")) return;
      if (p.stage === "download" && p.total) {
        // The tool is a few files, found one at a time, so use the expected total until the real one is bigger.
        const total = Math.max(p.total, Cutout.DOWNLOAD_MB * 1048576);
        const mb = n => Math.round(n / 1048576);
        $("cutStatus").textContent = `${loading}: ${mb(p.loaded)} / ${mb(total)} MB`;
        $("cutBar").hidden = false;
        $("cutFill").style.width = `${Math.round((p.loaded / total) * 100)}%`;
      } else if (p.stage === "cutting") {
        $("cutStatus").textContent = "CUTTING OUT THE BACKGROUND...";
        $("cutBar").hidden = true;
      }
    });
    const bitmap = await createImageBitmap(blob);
    const full = document.createElement("canvas");
    full.width = bitmap.width;
    full.height = bitmap.height;
    full.getContext("2d").drawImage(bitmap, 0, 0);
    const trimmed = Photos.trim(full);
    if (!trimmed) throw new Error("COULDN'T FIND ANYTHING TO CUT OUT IN THAT PHOTO.");
    return trimmed;
  }

  async function runCutout() {
    if (!job || !job.photoBlob) return;
    const token = job.token;
    try {
      const trimmed = await cutWithProgress("ADD PIECE", job.photoURL, job.photoBlob, () => stillMine(token));
      if (!stillMine(token)) return;
      job.cutout = trimmed;
      job.cutoutURL = urlFor(await toBlob(trimmed, "image/png"));
      showCompare();
    } catch (e) {
      if (!stillMine(token) || e.message === "stopped") return;
      showCompare(e.message);
    }
  }

  /* ---------- step 4: before and after ---------- */
  function showCompare(error) {
    const after = error
      ? `<figure><div class="failed">✕</div><figcaption>AFTER</figcaption></figure>`
      : `<figure><img class="checker" src="${job.cutoutURL}" alt="Cut-out"><figcaption>AFTER</figcaption></figure>`;
    openModal("ADD PIECE", `
      <div class="compare">
        <figure><img src="${job.photoURL}" alt="Your photo"><figcaption>BEFORE</figcaption></figure>
        ${after}
      </div>
      ${error
        ? `<p class="warn">THE CUT-OUT DIDN'T WORK. ${/^[A-Z ,.'!?-]+$/.test(error) ? esc(error) : ""}</p>
           <div class="row modal-actions">
             <button class="bigbtn pinkbtn" type="button" data-act="ap-cut">TRY<br>AGAIN</button>
             <button class="smallbtn" type="button" data-act="ap-another">TRY ANOTHER PHOTO</button>
             <button class="smallbtn" type="button" data-act="ap-original">KEEP THE ORIGINAL</button>
           </div>`
        : `<p>HOW DOES IT LOOK?</p>
           <div class="row modal-actions">
             <button class="bigbtn pinkbtn" type="button" data-act="ap-keep">KEEP IT!</button>
             <button class="smallbtn" type="button" data-act="ap-another">TRY ANOTHER PHOTO</button>
             <button class="smallbtn" type="button" data-act="ap-original">KEEP THE ORIGINAL</button>
           </div>`}
      <p class="fine">"KEEP THE ORIGINAL" SAVES YOUR PHOTO WITH ITS BACKGROUND.</p>`);
  }

  // Pick which picture to save (the cut-out, or the original photo), then show the tag form.
  async function choose(canvas, isCutout) {
    job.chosen = canvas;
    job.isCutout = isCutout;
    job.previewURL = urlFor(await toBlob(canvas, isCutout ? "image/png" : "image/jpeg", 0.9));
    const suggested = Photos.mainColour(canvas, NEUTRALS);
    job.suggested = suggested;
    job.draft = { name: "", cat: "top", color: suggested, pattern: "solid", shape: "fitted", crop: false, dressy: 2, seasons: [...SEASON_LIST] };
    job.nameTouched = false;
    showForm();
  }

  /* ---------- step 5: the tag form (also used to edit a piece later) ---------- */
  function autoName() {
    return `${cap(job.draft.color === "multi" ? "multicolour" : job.draft.color)} ${CAT_WORD[job.draft.cat]}`;
  }

  function chips(field, values, label = v => v.toUpperCase()) {
    return values.map(v => `<button class="chip" type="button" data-act="ap-tag" data-field="${field}" data-value="${v}" aria-pressed="${job.draft[field] === v}">${label(v)}</button>`).join("");
  }

  function formHTML() {
    const d = job.draft;
    if (!job.nameTouched) d.name = autoName();
    const swatch = name => COLORS[name]
      ? `<span class="swatch" style="background:${COLORS[name]}"></span>`
      : `<span class="swatch multi"></span>`;
    const allYear = d.seasons.length === 4;
    return `
      <img class="preview${job.isCutout || job.mode === "edit" ? " checker" : ""}" src="${job.previewURL}" alt="">
      <label class="field">NAME <input id="pieceName" type="text" maxlength="40" value="${esc(d.name)}" autocomplete="off"></label>

      <div class="field">CATEGORY<div class="chips">${chips("cat", Object.keys(CATS), v => CATS[v])}</div></div>

      <div class="field">COLOUR
        ${job.suggested && job.mode === "add" ? `<span class="hint">GUESSED FROM YOUR PHOTO: ${job.suggested.toUpperCase()}. TAP ANOTHER IF IT'S WRONG.</span>` : ""}
        <div class="chips">${Object.keys(COLORS).map(c => `<button class="chip" type="button" data-act="ap-tag" data-field="color" data-value="${c}" aria-pressed="${d.color === c}">${swatch(c)}${c.toUpperCase()}</button>`).join("")}</div>
      </div>

      <div class="field">PATTERN <span class="hint">(LACE AND KNIT COUNT AS SOLID)</span><div class="chips">${chips("pattern", PATTERNS)}</div></div>

      ${SHAPES[d.cat] ? `<div class="field">SHAPE<div class="chips">${chips("shape", SHAPES[d.cat])}</div></div>` : ""}

      ${d.cat === "top" ? `<div class="field">CROPPED?<div class="chips">
        <button class="chip" type="button" data-act="ap-tag" data-field="crop" data-value="yes" aria-pressed="${d.crop}">YES, IT'S CROPPED</button></div></div>` : ""}

      ${d.cat !== "underwear" ? `<label class="field">DRESSINESS: <span id="dressyWord">${dressyWord(d.dressy)}</span>
        <input id="pieceDressy" type="range" min="0" max="3" step="0.5" value="${d.dressy}">
        <span class="scale"><span>SPORTY</span><span>GOING OUT</span></span></label>` : ""}

      <div class="field">SEASONS<div class="chips">
        <button class="chip" type="button" data-act="ap-tag" data-field="seasons" data-value="all" aria-pressed="${allYear}">ALL YEAR</button>
        ${SEASON_LIST.map(s => `<button class="chip" type="button" data-act="ap-tag" data-field="seasons" data-value="${s}" aria-pressed="${!allYear && d.seasons.includes(s)}">${s.toUpperCase()}</button>`).join("")}
      </div></div>

      ${job.mode === "edit" ? Lookbook.stripHTML(job.editId) : ""}

      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="ap-save">${job.mode === "edit" ? "SAVE<br>CHANGES" : "ADD TO<br>CLOSET"}</button>
        ${job.mode === "edit" ? `<button class="smallbtn" type="button" data-act="ap-delete">DELETE THIS PIECE</button>` : ""}
      </div>`;
  }

  function showForm() {
    const body = $("modalBody");
    const scroll = body ? body.scrollTop : 0;
    openModal(job.mode === "edit" ? "EDIT PIECE" : "TAG YOUR PIECE", formHTML());
    $("modalBody").scrollTop = scroll;   // stay where you were after tapping a chip
  }

  // A chip on the form was tapped.
  function tag(field, value) {
    const d = job.draft;
    if (field === "seasons") {
      if (value === "all") d.seasons = [...SEASON_LIST];
      else if (d.seasons.length === 4) d.seasons = [value];          // from "all year" to just this one
      else if (d.seasons.includes(value)) d.seasons = d.seasons.length > 1 ? d.seasons.filter(s => s !== value) : d.seasons;
      else d.seasons = SEASON_LIST.filter(s => s === value || d.seasons.includes(s));
    } else if (field === "crop") {
      d.crop = !d.crop;
    } else {
      d[field] = value;
      if (field === "cat" && SHAPES[value] && !SHAPES[value].includes(d.shape)) d.shape = "fitted";
    }
    showForm();
  }

  /* ---------- step 6: save ---------- */
  // Turn the form into the tags that get saved (only the ones that matter for the category).
  function tagsFromDraft() {
    const d = job.draft;
    const tags = { name: (d.name || "").trim() || autoName(), cat: d.cat, color: d.color, pattern: d.pattern, seasons: d.seasons.slice() };
    if (SHAPES[d.cat]) tags.shape = d.shape;
    if (d.cat === "top" && d.crop) tags.crop = true;
    if (d.cat !== "underwear") tags.dressy = d.dressy;
    return tags;
  }

  // Try to split a pair (earrings, shoes) into two photos, one per ear / foot.
  async function pairPhotos(canvas) {
    const parts = Photos.splitPair(canvas);
    if (!parts) return {};
    return { imageL: await Photos.save(parts[0], PAIR_SIDE), imageR: await Photos.save(parts[1], PAIR_SIDE) };
  }

  async function save() {
    const token = job.token;
    const tags = tagsFromDraft();
    openModal(job.mode === "edit" ? "EDIT PIECE" : "ADD PIECE", busyHTML("SAVING TO YOUR CLOSET..."));
    try {
      let record;
      if (job.mode === "add") {
        const canvas = job.chosen;
        record = {
          id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          created: Date.now(),
          ...tags,
          image: await Photos.save(canvas, SAVE_SIDE),
          ...(job.isCutout && PAIRS.includes(tags.cat) ? await pairPhotos(canvas) : {})
        };
        record.box = defaultBox(tags.cat, tags.shape, canvas.width / canvas.height, !!record.imageL);
      } else {
        const old = await DB.get("items", job.editId);
        if (!old) throw new Error("gone");
        record = { ...old, ...tags };
        delete record.shape; delete record.crop; delete record.dressy;   // only keep the tags that fit the new category
        Object.assign(record, tags);
        if (old.cat !== tags.cat) {
          // New category: move it to that category's spot on the doll, and split pairs if needed.
          const bitmap = await createImageBitmap(old.image);
          const c = document.createElement("canvas");
          c.width = bitmap.width; c.height = bitmap.height;
          c.getContext("2d").drawImage(bitmap, 0, 0);
          delete record.imageL; delete record.imageR;
          if (PAIRS.includes(tags.cat) && Photos.hasTransparency(c)) Object.assign(record, await pairPhotos(c));
          record.box = defaultBox(tags.cat, tags.shape, c.width / c.height, !!record.imageL);
        }
      }
      await saveRecord("items", record);
      await loadCloset();
      if (!stillMine(token)) return;
      if (job.mode === "add") {
        equip(record.id);
        state.view = "doll";
        renderAll();
        showAdded(record);
      } else {
        renderAll();
        closeModal();
        toast("SAVED ♥");
      }
    } catch (e) {
      if (stillMine(token)) { showForm(); toast("SORRY, THAT DIDN'T SAVE. TRY AGAIN."); }
    }
  }

  function showAdded(record) {
    const it = get(record.id);
    openModal("ADDED!", `
      <img class="preview checker" src="${esc(it.img)}" alt="">
      <p>♥ <b>${esc(it.name.toUpperCase())}</b> IS IN YOUR CLOSET, AND ON THE DOLL.</p>
      <div class="row modal-actions">
        <button class="bigbtn pinkbtn" type="button" data-act="ap-again">ADD<br>ANOTHER</button>
        <button class="smallbtn" type="button" data-act="close">DONE</button>
      </div>`);
  }

  /* ---------- editing and deleting ---------- */
  function edit(id) {
    const it = get(id);
    if (!it) return;
    newJob({ mode: "edit", editId: id, previewURL: it.img, nameTouched: true });
    job.draft = {
      name: it.name, cat: it.cat, color: it.color, pattern: it.pattern, shape: it.shape || "fitted",
      crop: !!it.crop, dressy: typeof it.dressy === "number" ? it.dressy : 2, seasons: it.seasons.slice()
    };
    showForm();
  }

  async function remove() {
    const it = get(job.editId);
    if (!it || !confirm(`Delete "${it.name}" from your closet? This can't be undone (unless you have a backup).`)) return;
    for (const slot of Object.keys(state.outfit)) if (state.outfit[slot] === it.id) state.outfit[slot] = null;
    await deleteRecord("items", it.id);
    await loadCloset();
    closeModal();
    renderAll();
    toast("DELETED.");
  }

  /* ---------- buttons and inputs that belong to these screens ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act^='ap-']");
    if (!b || !job) return;
    switch (b.dataset.act) {
      case "ap-camera": $("photoCamera").click(); break;
      case "ap-pick": $("photoPick").click(); break;
      case "ap-cut": runCutout(); break;
      case "ap-keep": choose(job.cutout, true); break;
      case "ap-original": choose(job.photo, false); break;
      case "ap-another": start(); break;
      case "ap-tag": tag(b.dataset.field, b.dataset.value); break;
      case "ap-save": save(); break;
      case "ap-delete": remove(); break;
      case "ap-again": start(); break;
    }
  });
  // Typing a name, or sliding the dressiness slider
  document.addEventListener("input", e => {
    if (!job || !job.draft) return;
    if (e.target.id === "pieceName") { job.draft.name = e.target.value; job.nameTouched = true; }
    if (e.target.id === "pieceDressy") { job.draft.dressy = Number(e.target.value); $("dressyWord").textContent = dressyWord(job.draft.dressy); }
  });
  // The hidden photo pickers in index.html
  for (const id of ["photoCamera", "photoPick"]) {
    $(id).addEventListener("change", e => {
      const file = e.target.files[0];
      e.target.value = "";   // so choosing the same photo again still works
      if (file) gotFile(file);
    });
  }
  // When the pop-up closes, forget the half-finished piece. The cut-out tool is kept
  // for a couple of minutes in case another piece is added, then its memory is freed.
  let releaseTimer = null;
  $("modal").addEventListener("close", () => {
    forget();
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (!job) Cutout.releaseIfIdle(); }, 120000);
  });

  return { start, edit, gotFile, cutWithProgress, downloadNoticeHTML };
})();
