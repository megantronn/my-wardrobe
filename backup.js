/* ======================================================================
   BACKUP.JS — turns the whole closet into ONE file, and back again.

   A backup file is really a zip file containing:
     closet.json        every piece's tags, your saved looks, lookbook and settings
     photos/...         every photo (clothes, your doll photo and lookbook photos)
   It ends in ".closet" instead of ".zip" so Mac Safari doesn't unzip it by itself.
   (Want to peek inside? Copy it, rename the copy to .zip and open it.)

   Any photo saved in the cabinet (db.js) is included automatically, so new
   features that save photos don't need any changes here.

     const backup = await Backup.create();    // { blob, name, pieces, looks, lookbook }
     const data   = await Backup.read(file);  // { items, looks, settings } ready for DB.replaceAll
   ====================================================================== */
const Backup = (() => {
  const APP = "my-wardrobe";
  const FORMAT = 1;                              // goes up if the file layout ever changes
  const STORES = ["items", "looks", "settings", "lookbook"];  // which drawers go into the file
  const LOCAL_ONLY = ["backupInfo"];             // settings that belong to this device only
  const KEY = { items: "id", looks: "id", settings: "key", lookbook: "id" };
  const EXT = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

  const two = n => String(n).padStart(2, "0");
  const safeName = s => String(s).replace(/[^a-z0-9_-]/gi, "_");

  async function create() {
    const data = { app: APP, format: FORMAT, exported: new Date().toISOString() };
    const files = [];
    for (const store of STORES) {
      const records = (await DB.getAll(store))
        .filter(rec => !(store === "settings" && LOCAL_ONLY.includes(rec.key)));
      // Photos can't go inside closet.json, so each one becomes its own file,
      // and closet.json just says where to find it: { "$photo": "photos/...", "type": "image/webp" }
      data[store] = records.map(rec => {
        const copy = {};
        for (const [field, value] of Object.entries(rec)) {
          if (value instanceof Blob) {
            const path = `photos/${store}/${safeName(rec[KEY[store]])}-${field}.${EXT[value.type] || "bin"}`;
            files.push({ name: path, data: value });
            copy[field] = { $photo: path, type: value.type };
          } else {
            copy[field] = value;
          }
        }
        return copy;
      });
    }
    files.unshift({ name: "closet.json", data: JSON.stringify(data, null, 1) });

    const d = new Date();
    return {
      blob: await Zip.make(files),
      name: `my-closet-backup-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.closet`,
      pieces: data.items.length,
      looks: data.looks.length,
      lookbook: data.lookbook.length
    };
  }

  // Errors thrown here are written to be shown straight to the person.
  async function read(file) {
    let files;
    try { files = await Zip.read(file); }
    catch (e) { throw new Error("THAT FILE ISN'T A CLOSET BACKUP. PICK THE FILE THAT ENDS IN .closet"); }

    // Find closet.json (it may be inside a folder if the backup was re-zipped by hand).
    const jsonName = [...files.keys()].find(n => !n.startsWith("__MACOSX") && (n === "closet.json" || n.endsWith("/closet.json")));
    if (!jsonName) throw new Error("THAT FILE ISN'T A CLOSET BACKUP. PICK THE FILE THAT ENDS IN .closet");
    const folder = jsonName.slice(0, -"closet.json".length);

    let data;
    try { data = JSON.parse(await files.get(jsonName).text()); }
    catch (e) { throw new Error("THAT BACKUP FILE IS DAMAGED. TRY AN OLDER BACKUP."); }
    if (!data || data.app !== APP) throw new Error("THAT FILE ISN'T A CLOSET BACKUP.");
    if (data.format > FORMAT) throw new Error("THAT BACKUP IS FROM A NEWER VERSION OF THE SITE. RELOAD THE PAGE AND TRY AGAIN.");

    const out = {};
    for (const store of STORES) {
      out[store] = [];
      for (const rec of Array.isArray(data[store]) ? data[store] : []) {
        if (!rec || typeof rec[KEY[store]] !== "string") continue;   // skip anything without an id
        const copy = {};
        for (const [field, value] of Object.entries(rec)) {
          if (value && typeof value === "object" && typeof value.$photo === "string") {
            const photo = files.get(folder + value.$photo);
            if (!photo) continue;   // photo missing from the file: leave it out
            // Copy the photo into memory first: some browsers (Safari) won't save a
            // piece of a file straight into the cabinet.
            copy[field] = new Blob([await photo.arrayBuffer()], { type: value.type || "" });
          } else {
            copy[field] = value;
          }
        }
        out[store].push(copy);
      }
    }
    return out;
  }

  return { create, read };
})();
