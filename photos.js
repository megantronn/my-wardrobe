/* ======================================================================
   PHOTOS.JS — gets a photo ready for the closet. Everything happens on this
   device, using the browser's own drawing tool (a "canvas").

     await Photos.open(file, 1500)       the photo, shrunk so its longest side is 1500px
     Photos.trim(canvas)                 cropped to the clothes (tiny leftover specks removed)
     Photos.splitPair(canvas)            [left, right] for a pair (earrings, shoes), or null
     await Photos.save(canvas, 1200)     a small file: WebP (PNG or JPEG where WebP can't be made)
     Photos.mainColour(canvas, NEUTRALS) the closest colour name, e.g. "yellow"
     Photos.hasTransparency(canvas)      true if the photo has see-through parts (a cut-out)
     Photos.bodyMarks(canvas)            first guess at head/shoulders/waist/ankles in a cut-out person
   ====================================================================== */
const Photos = (() => {
  const HEIC_MESSAGE = "THIS PHOTO IS IN APPLE'S HEIC FORMAT, WHICH THIS BROWSER CAN'T OPEN. " +
    "ON YOUR IPHONE, ADD IT FROM SAFARI INSTEAD, OR SAVE IT AS A JPEG FIRST " +
    "(OR SET SETTINGS > CAMERA > FORMATS > MOST COMPATIBLE FOR NEW PHOTOS).";
  const MAX_PIXELS = 16000000;   // iPhones refuse canvases bigger than about 16 million pixels

  // Make a blank canvas and draw something onto it at a new size.
  function drawTo(source, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(source, 0, 0, w, h);
    return c;
  }
  // Let the browser free a canvas's memory straight away (helps phones with big photos).
  function forget(c) { if (c instanceof HTMLCanvasElement) { c.width = 0; c.height = 0; } }

  // Open a photo file and shrink it so its longest side is maxSide.
  async function open(file, maxSide) {
    const heic = /\.(heic|heif)$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      }).catch(() => { throw new Error(heic ? HEIC_MESSAGE : "THAT FILE ISN'T A PHOTO THIS BROWSER CAN OPEN. TRY A JPEG OR PNG."); });
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error(heic ? HEIC_MESSAGE : "THAT PHOTO LOOKS EMPTY. TRY ANOTHER ONE.");
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const tw = Math.round(w * scale), th = Math.round(h * scale);
      // Shrinking a lot in one go looks jaggy, so shrink by halves (never over MAX_PIXELS at once).
      let cur = img, cw = w, ch = h;
      while (cw / 2 > tw) {
        let nw = Math.round(cw / 2), nh = Math.round(ch / 2);
        const cap = Math.sqrt(MAX_PIXELS / (nw * nh));
        if (cap < 1) { nw = Math.floor(nw * cap); nh = Math.floor(nh * cap); }
        const next = drawTo(cur, nw, nh);
        forget(cur);
        cur = next; cw = nw; ch = nh;
      }
      const result = drawTo(cur, tw, th);
      forget(cur);
      return result;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // A tiny black-and-white map of where the clothes are (at most 256 squares across).
  // Each square is "on" if it's mostly not see-through.
  function mask(canvas) {
    const scale = Math.max(1, Math.max(canvas.width, canvas.height) / 256);
    const w = Math.max(1, Math.round(canvas.width / scale)), h = Math.max(1, Math.round(canvas.height / scale));
    const small = drawTo(canvas, w, h);
    const px = small.getContext("2d").getImageData(0, 0, w, h).data;
    const on = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) on[i] = px[i * 4 + 3] > 40 ? 1 : 0;
    return { w, h, on, sx: canvas.width / w, sy: canvas.height / h };
  }

  // Group the "on" squares into separate blobs (pieces that touch, even diagonally, are one blob).
  function blobs(m) {
    const label = new Int32Array(m.w * m.h).fill(-1);
    const list = [];
    for (let start = 0; start < m.on.length; start++) {
      if (!m.on[start] || label[start] !== -1) continue;
      const id = list.length, cells = [start];
      label[start] = id;
      for (let k = 0; k < cells.length; k++) {
        const x = cells[k] % m.w, y = (cells[k] - x) / m.w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const n = ny * m.w + nx;
          if (m.on[n] && label[n] === -1) { label[n] = id; cells.push(n); }
        }
      }
      list.push(cells);
    }
    return list;
  }

  // Crop a cut-out to the clothes. Little specks of leftover background are erased first.
  // Returns a new canvas, or null if there's nothing there.
  function trim(canvas) {
    const m = mask(canvas);
    const groups = blobs(m);
    if (!groups.length) return null;
    const biggest = Math.max(...groups.map(cells => cells.length));
    const work = drawTo(canvas, canvas.width, canvas.height);
    const g = work.getContext("2d");
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const cells of groups) {
      const keep = cells.length >= Math.max(3, biggest * 0.02);
      for (const c of cells) {
        const x = c % m.w, y = (c - x) / m.w;
        if (keep) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        else g.clearRect(Math.floor(x * m.sx), Math.floor(y * m.sy), Math.ceil(m.sx) + 1, Math.ceil(m.sy) + 1);
      }
    }
    // From the rough squares, find the exact edges of the clothes.
    const rx = Math.max(0, Math.floor((x0 - 1) * m.sx)), ry = Math.max(0, Math.floor((y0 - 1) * m.sy));
    const rw = Math.min(work.width, Math.ceil((x1 + 2) * m.sx)) - rx, rh = Math.min(work.height, Math.ceil((y1 + 2) * m.sy)) - ry;
    const a = g.getImageData(rx, ry, rw, rh).data;
    let ex0 = rw, ey0 = rh, ex1 = -1, ey1 = -1;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      if (a[(y * rw + x) * 4 + 3] > 16) {
        if (x < ex0) ex0 = x; if (x > ex1) ex1 = x;
        if (y < ey0) ey0 = y; if (y > ey1) ey1 = y;
      }
    }
    if (ex1 < 0) { forget(work); return null; }
    // A little breathing room around the edges.
    const pad = Math.round(Math.max(ex1 - ex0, ey1 - ey0) * 0.015);
    const cx = Math.max(0, rx + ex0 - pad), cy = Math.max(0, ry + ey0 - pad);
    const cw = Math.min(work.width, rx + ex1 + 1 + pad) - cx, ch = Math.min(work.height, ry + ey1 + 1 + pad) - cy;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    out.getContext("2d").drawImage(work, cx, cy, cw, ch, 0, 0, cw, ch);
    forget(work);
    return out;
  }

  // Find a clear gap that splits the picture into two similar-sized halves.
  // counts = how many "on" squares are in each column (or row). Returns the gap's middle, or -1.
  function findGap(counts) {
    const total = counts.reduce((s, n) => s + n, 0);
    let best = -1, bestWidth = 0, before = 0;
    for (let i = 0; i < counts.length; ) {
      if (counts[i] > 0) { before += counts[i]; i++; continue; }
      let j = i;
      while (j < counts.length && counts[j] === 0) j++;
      const after = total - before;
      if (before >= total * 0.25 && after >= total * 0.25 && j - i > bestWidth) { best = Math.floor((i + j) / 2); bestWidth = j - i; }
      i = j;
    }
    return best;
  }

  // For pairs (earrings, shoes): split one photo into two, left and right
  // (or top and bottom if they were photographed one above the other).
  function splitPair(canvas) {
    const m = mask(canvas);
    const cols = new Array(m.w).fill(0), rows = new Array(m.h).fill(0);
    for (let i = 0; i < m.on.length; i++) if (m.on[i]) { cols[i % m.w]++; rows[Math.floor(i / m.w)]++; }
    const crop = (x, y, w, h) => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
      return trim(c);
    };
    let cut = findGap(cols);
    if (cut >= 0) {
      const x = Math.round(cut * m.sx);
      const parts = [crop(0, 0, x, canvas.height), crop(x, 0, canvas.width - x, canvas.height)];
      return parts[0] && parts[1] ? parts : null;
    }
    cut = findGap(rows);
    if (cut >= 0) {
      const y = Math.round(cut * m.sy);
      const parts = [crop(0, 0, canvas.width, y), crop(0, y, canvas.width, canvas.height - y)];
      return parts[0] && parts[1] ? parts : null;
    }
    return null;
  }

  // First guess at where the body landmarks are in a cut-out of a standing person
  // (in the canvas's pixels). The person fine-tunes these by dragging the markers.
  //   head = top of the head, shoulders = where the arms start, waist = the narrowest part, ankles
  function bodyMarks(canvas) {
    const m = mask(canvas);
    // For every row, the stretches of "on" squares in it: [[start, end], ...]
    const rows = [];
    for (let y = 0; y < m.h; y++) {
      const runs = [];
      for (let x = 0; x < m.w; ) {
        if (!m.on[y * m.w + x]) { x++; continue; }
        const start = x;
        while (x < m.w && m.on[y * m.w + x]) x++;
        runs.push([start, x - 1]);
      }
      rows.push(runs);
    }
    const filled = rows.map((r, y) => (r.length ? y : -1)).filter(y => y >= 0);
    if (!filled.length) return null;
    const top = filled[0], H = filled[filled.length - 1] - top;
    // The middle of the body: the average position of everything in the top half.
    let sum = 0, count = 0;
    for (let y = top; y < top + H / 2; y++) for (const [a, b] of rows[y]) { sum += ((a + b) / 2) * (b - a + 1); count += b - a + 1; }
    const cx = count ? sum / count : m.w / 2;
    // The stretch in a row that's closest to the middle of the body, and its width.
    const bodyRun = y => {
      let best = null, gap = Infinity;
      for (const r of rows[Math.round(y)] || []) {
        const d = cx < r[0] ? r[0] - cx : cx > r[1] ? cx - r[1] : 0;
        if (d < gap) { gap = d; best = r; }
      }
      return best;
    };
    const width = y => { const r = bodyRun(y); return r ? r[1] - r[0] + 1 : 0; };
    // Neck = the narrowest row 8-22% of the way down. Shoulders = where it gets much wider.
    let neck = top + 0.12 * H, neckW = Infinity;
    for (let y = top + 0.08 * H; y <= top + 0.22 * H; y++) { const w = width(y); if (w && w < neckW) { neckW = w; neck = y; } }
    let shoulder = top + 0.16 * H;
    for (let y = neck; y <= top + 0.3 * H; y++) if (width(y) >= neckW * 2.2) { shoulder = y + 0.015 * H; break; }
    // Waist = the narrowest row 30-48% of the way down (stopping where the legs split apart,
    // so the top of one leg isn't mistaken for a tiny waist).
    let waist = top + 0.33 * H, waistW = Infinity;
    for (let y = top + 0.3 * H; y <= top + 0.48 * H; y++) {
      const r = bodyRun(y);
      if (!r || r[0] > cx || r[1] < cx) break;
      const w = r[1] - r[0] + 1;
      if (w < waistW) { waistW = w; waist = y; }
    }
    // Ankles = 95% of the way down; one marker on each leg.
    const ankle = top + 0.95 * H;
    const legs = (rows[Math.round(ankle)] || []).slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]);
    const mid = r => (r[0] + r[1]) / 2;
    const [ankleL, ankleR] = legs.length === 2 ? [mid(legs[0]), mid(legs[1])]
      : legs.length === 1 ? [legs[0][0] + (legs[0][1] - legs[0][0]) * 0.25, legs[0][0] + (legs[0][1] - legs[0][0]) * 0.75]
      : [cx - 0.05 * H, cx + 0.05 * H];
    const s = bodyRun(shoulder) || [cx - 0.1 * H, cx + 0.1 * H];
    let w = bodyRun(waist) || [cx - 0.07 * H, cx + 0.07 * H];
    // A waist much narrower than the shoulders is probably a bad guess (e.g. a patchy cut-out):
    // start the dots at a typical width instead, and let the person drag them.
    if (w[1] - w[0] < 0.45 * (s[1] - s[0])) w = [cx - 0.4 * (s[1] - s[0]), cx + 0.4 * (s[1] - s[0])];
    const P = (x, y) => [(x + 0.5) * m.sx, (y + 0.5) * m.sy];   // grid square -> canvas pixels
    return {
      head: P(cx, top), shoulderL: P(s[0], shoulder), shoulderR: P(s[1], shoulder),
      waistL: P(w[0], waist), waistR: P(w[1], waist), ankleL: P(ankleL, ankle), ankleR: P(ankleR, ankle)
    };
  }

  // Does the photo have see-through parts? (Checks every 4th pixel, which is plenty.)
  function hasTransparency(canvas) {
    const a = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < a.length; i += 16) if (a[i] < 250) return true;
    return false;
  }

  // Can this browser make WebP files? (Safari can show them but can't make them.)
  let webp = null;
  function canMakeWebP() {
    if (webp === null) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      webp = c.toDataURL("image/webp").startsWith("data:image/webp");
    }
    return webp;
  }
  const toBlob = (c, type, quality) => new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error("couldn't save the photo"))), type, quality));

  // Save a canvas as a small photo file (longest side at most maxSide).
  // WebP is usually 100-300 KB. Where WebP can't be made (Safari/iPhone) see-through photos
  // have to be PNG, which is much bigger, so those are shrunk until they're under about 700 KB.
  async function save(canvas, maxSide = 1200) {
    const seeThrough = hasTransparency(canvas);
    let side = maxSide;
    for (let tries = 0; ; tries++) {
      const scale = Math.min(1, side / Math.max(canvas.width, canvas.height));
      const c = scale < 1 ? drawTo(canvas, Math.round(canvas.width * scale), Math.round(canvas.height * scale)) : canvas;
      const blob = canMakeWebP() ? await toBlob(c, "image/webp", 0.86)
        : seeThrough ? await toBlob(c, "image/png")          // PNG keeps the see-through parts
        : await toBlob(c, "image/jpeg", 0.88);
      if (c !== canvas) forget(c);
      const budget = blob.type === "image/png" ? 700000 : 1500000;
      if (blob.size <= budget || tries >= 4) return blob;
      side = Math.round(Math.min(side, Math.max(canvas.width, canvas.height)) * 0.8);   // too big: a bit smaller
    }
  }

  // ---- main colour ----
  // Colours are compared in "Lab", a way of describing colour that matches how our eyes see differences.
  function toLab([r, g, b]) {
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Bright, clear colours, as they usually look in a photo. Used for colours the rules below
  // don't catch: the photo gets the name of the closest one (mostly by hue).
  const BRIGHT = {
    yellow: ["#F2D33D", "#F3E08A"], gold: ["#C9A43E"], orange: ["#EE8A2C", "#F2A55A"], coral: ["#F0796A"],
    pink: ["#F29CC0", "#E0619A"], red: ["#C92A35", "#9E1C27"], purple: ["#6F3A8E", "#4A2560"], lilac: ["#B9A3DA"],
    blue: ["#3F6FD1", "#7EA2E2"], green: ["#3E9A55", "#25683A", "#9ABF3A"], olive: ["#808040"], tan: ["#C2A27E"],
    brown: ["#7A563E"], cream: ["#EFE5CC"], denim: ["#5D78A2"], navy: ["#303A58"]
  };
  const BRIGHT_LCH = Object.entries(BRIGHT).flatMap(([name, hexes]) => hexes.map(h => [name, toLch(toLab(hexToRgb(h)))]));
  // Lab -> L (lightness 0-100), C (how strongly tinted, 0 = grey), h (hue angle in degrees)
  function toLch([L, a, b]) { return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; }

  // Give one colour a name from the colour list in script.js.
  // The numbers come from measuring real clothing photos.
  function nameColour(lab) {
    const [L, C, h] = toLch(lab);
    const warm = h >= 40 && h <= 115;    // reds-oranges-yellows: browns, tans, beiges and creams
    const bluish = h >= 220 && h <= 300;
    if (C < 5) return L < 22 ? "black" : L > 82 ? "white" : "grey";       // hardly any tint at all
    if (L > 84 && C < 15 && !warm) return "white";                         // a cool-tinted white
    if (warm && C < 26) return L > 65 ? "cream" : L > 40 ? "tan" : h > 75 ? "olive" : "brown";
    if (bluish && C < 20) return L < 25 ? "navy" : L < 45 ? "denim" : "blue";
    if (h > 290 && h < 350 && C < 30 && L > 45) return "lilac";            // pale purple
    // Anything else: the nearest bright colour, judged mostly by hue.
    const score = ([l2, c2, h2]) => {
      const dh = Math.abs(h - h2) > 180 ? 360 - Math.abs(h - h2) : Math.abs(h - h2);
      const hueGap = 2 * Math.sqrt(C * c2) * Math.sin((dh * Math.PI) / 360);
      return Math.hypot((L - l2) * 0.5, (C - c2) * 0.5, hueGap);
    };
    return BRIGHT_LCH.reduce((a, b) => (score(b[1]) < score(a[1]) ? b : a))[0];
  }

  // Guess the main colour of a photo as one of the colour names.
  // Pieces with two or more strong accent colours count as "multi".
  // neutrals = the list of neutral colour names (NEUTRALS in script.js).
  function mainColour(canvas, neutrals) {
    const small = drawTo(canvas, Math.max(1, Math.round(canvas.width / Math.max(1, Math.max(canvas.width, canvas.height) / 120))),
      Math.max(1, Math.round(canvas.height / Math.max(1, Math.max(canvas.width, canvas.height) / 120))));
    const px = small.getContext("2d").getImageData(0, 0, small.width, small.height).data;
    const seeThrough = hasTransparency(small);
    const samples = [];
    for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) {
      const i = (y * small.width + x) * 4;
      if (seeThrough ? px[i + 3] < 200 : (x < small.width * 0.25 || x > small.width * 0.75 || y < small.height * 0.25 || y > small.height * 0.75)) continue;
      samples.push(toLab([px[i], px[i + 1], px[i + 2]]));
    }
    if (!samples.length) return "multi";
    // Sort the photo's pixels into 5 groups of similar colour ("k-means").
    samples.sort((a, b) => a[0] - b[0]);
    let centres = [0.1, 0.3, 0.5, 0.7, 0.9].map(q => samples[Math.floor(q * (samples.length - 1))].slice());
    let groups = [];
    for (let round = 0; round < 8; round++) {
      groups = centres.map(() => []);
      for (const s of samples) {
        let best = 0;
        for (let k = 1; k < centres.length; k++) if (dist(s, centres[k]) < dist(s, centres[best])) best = k;
        groups[best].push(s);
      }
      centres = groups.map((grp, k) => grp.length ? [0, 1, 2].map(d => grp.reduce((sum, s) => sum + s[d], 0) / grp.length) : centres[k]);
    }
    // Several strong accent colours (e.g. a rainbow print): "multi".
    const share = {};
    groups.forEach((grp, k) => {
      if (grp.length) { const name = nameColour(centres[k]); share[name] = (share[name] || 0) + grp.length / samples.length; }
    });
    const ranked = Object.entries(share).sort((a, b) => b[1] - a[1]);
    const strongAccents = ranked.filter(([name, s]) => s >= 0.2 && !neutrals.includes(name));
    if (ranked[0][1] < 0.5 && strongAccents.length >= 2) return "multi";
    // Otherwise name the "typical" colour: the middle value of the photo's lightness and tint.
    const middle = d => samples.map(s => s[d]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    return nameColour([middle(0), middle(1), middle(2)]);
  }

  return { open, trim, splitPair, save, mainColour, hasTransparency, canMakeWebP, bodyMarks };
})();
