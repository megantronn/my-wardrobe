/* ======================================================================
   CUTOUT.JS — removes the background from a photo, on this device.
   The real work happens in cutout-worker.js (in the background, so the page
   doesn't freeze). This file starts that worker, picks the fastest way to run
   it, and reports how the one-time download is going.

     const cutout = await Cutout.remove(photoBlob, p => { ... });   // a PNG Blob
       p = { stage: "download", loaded, total }   while the tool downloads (bytes)
       p = { stage: "cutting" }                   while it works on the photo
     Cutout.firstTime()    true if this browser hasn't downloaded the tool yet
     Cutout.release()      stop the worker and free its memory (when you're done adding pieces)
     Cutout.releaseIfIdle()   the same, but only if no photo is being cut out right now
   ====================================================================== */
const Cutout = (() => {
  // Which model to use. "isnet_quint8" is the smallest download (about 64 MB the first time,
  // including the engine) and is gentle on phones. "isnet_fp16" is about 111 MB; in tests
  // both cut out clothes equally well.
  const MODEL = "isnet_quint8";
  const DOWNLOAD_MB = 64;
  const DOWNLOADED_KEY = "cutout-tool-downloaded";   // remembered in this browser after the first success

  let worker = null;   // the background helper (made the first time it's needed)
  let device = null;   // "gpu" = graphics chip (about 5x faster), "cpu" = works everywhere
  let nextId = 1;
  const waiting = new Map();   // photos sent to the worker, waiting for an answer

  async function bestDevice() {
    try { if (navigator.gpu && await navigator.gpu.requestAdapter()) return "gpu"; } catch (e) { /* no graphics chip access */ }
    return "cpu";
  }

  function startWorker(dev) {
    device = dev;
    worker = new Worker("cutout-worker.js", { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      if (!job) return;
      if (data.progress) { job.onProgress(data.progress); return; }
      waiting.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.cutout);
    };
    // The worker itself couldn't start (usually: no internet to download the tool).
    worker.onerror = e => {
      e.preventDefault();
      const err = new Error("COULDN'T DOWNLOAD THE CUT-OUT TOOL. CHECK YOUR INTERNET CONNECTION AND TRY AGAIN.");
      for (const job of waiting.values()) job.reject(err);
      waiting.clear();
      release();
    };
  }

  function send(photo, onProgress) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, photo, device, model: MODEL });
    });
  }

  // Turn the library's progress messages into simple ones for the page.
  function progressReporter(onProgress) {
    const files = {};
    return ({ key, current, total }) => {
      if (key.startsWith("fetch:")) {
        files[key] = [current, total];
        const sum = i => Object.values(files).reduce((s, f) => s + f[i], 0);
        onProgress({ stage: "download", loaded: sum(0), total: sum(1) });
      } else if (key.startsWith("compute:")) {
        onProgress({ stage: "cutting" });
      }
    };
  }

  async function remove(photo, onProgress = () => {}) {
    if (!worker) startWorker(await bestDevice());
    let cutout;
    try {
      cutout = await send(photo, progressReporter(onProgress));
    } catch (err) {
      if (device !== "gpu" || !worker) throw err;
      // The graphics chip didn't work out on this device: start again with the normal processor.
      release();
      startWorker("cpu");
      cutout = await send(photo, progressReporter(onProgress));
    }
    try { localStorage.setItem(DOWNLOADED_KEY, "yes"); } catch (e) { /* not important */ }
    return cutout;
  }

  function firstTime() {
    try { return localStorage.getItem(DOWNLOADED_KEY) !== "yes"; } catch (e) { return true; }
  }

  function release() {
    if (worker) worker.terminate();
    worker = null;
    for (const job of waiting.values()) job.reject(new Error("stopped"));
    waiting.clear();
  }
  // Free the memory only if nothing is being cut out right now.
  function releaseIfIdle() {
    if (!waiting.size) release();
  }

  return { remove, firstTime, release, releaseIfIdle, DOWNLOAD_MB };
})();
