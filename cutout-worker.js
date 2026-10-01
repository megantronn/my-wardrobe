/* ======================================================================
   CUTOUT-WORKER.JS — runs the background-removal tool "in the background"
   (in a web worker), so the page doesn't freeze while it works.
   cutout.js starts this worker and sends it photos; you shouldn't need to edit it.

   The tool is @imgly/background-removal (free, AGPL licence, made by IMG.LY).
   It's loaded from the jsDelivr CDN, and its model files come from IMG.LY's own
   servers the first time, then the browser keeps a copy.
   The photo itself never leaves the device: only the tool is downloaded.
   To update the tool later, change the version number (1.7.0) in the line below.
   ====================================================================== */
import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

// A message arrives with a photo -> cut it out -> send the cut-out (a PNG Blob) back.
self.onmessage = async ({ data }) => {
  const { id, photo, device, model } = data;
  try {
    const cutout = await removeBackground(photo, {
      device,                          // "gpu" (graphics chip, fast) or "cpu" (works everywhere)
      model,                           // which size of model to use (see cutout.js)
      output: { format: "image/png" }, // PNG keeps the see-through background
      progress: (key, current, total) => self.postMessage({ id, progress: { key, current, total } })
    });
    self.postMessage({ id, cutout });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
