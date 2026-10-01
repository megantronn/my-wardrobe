/* ======================================================================
   DB.JS — saves the closet inside this browser (using "IndexedDB").
   Think of IndexedDB as a private filing cabinet the browser gives each website.
   Nothing in it is ever sent anywhere: it stays on this device only.

   Drawers ("stores") in the cabinet:
     items     one record per piece of clothing (its tags + its photo)
     looks     saved looks (which piece is in each slot)
     settings  small extras, e.g. when you last made a backup, and the photo doll
     lookbook  outfit photos, with the pieces worn in each (added in version 2)

   How other files use it (every call returns a promise, so use "await"):
     await DB.getAll("items")          every record in a drawer
     await DB.get("settings", "x")     one record, by its id/key
     await DB.put("items", record)     add or replace a record
     await DB.remove("items", id)      delete a record
     await DB.replaceAll({...})        swap whole drawers in one go (used by RESTORE)
   ====================================================================== */
const DB = (() => {
  const NAME = "my-wardrobe";   // don't rename this: a new name means a new, empty cabinet
  const VERSION = 2;            // add 1 whenever you add a new drawer in upgrade() below

  // Runs when the cabinet is first made, or when VERSION goes up. Existing drawers
  // (and everything in them) are kept; only missing ones are added.
  function upgrade(db) {
    if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
    if (!db.objectStoreNames.contains("looks")) db.createObjectStore("looks", { keyPath: "id" });
    if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    if (!db.objectStoreNames.contains("lookbook")) db.createObjectStore("lookbook", { keyPath: "id" });
  }

  let opening = null;
  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error("This browser can't save data."));
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => upgrade(req.result);
        req.onsuccess = () => {
          const db = req.result;
          // A newer version of the site was opened in another tab and needs to upgrade the
          // cabinet: reload this tab so it gets the new version too.
          db.onversionchange = () => { db.close(); location.reload(); };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
      opening.catch(() => { opening = null; });   // let a later call try again
    }
    return opening;
  }

  // Open a drawer, do one thing, and wait until the browser has really saved it.
  async function run(store, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Empty some drawers and refill them, all at once: if anything goes wrong, nothing changes.
  // data looks like { items: [...], looks: [...], settings: [...] }
  async function replaceAll(data) {
    const db = await open();
    const stores = Object.keys(data);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      for (const name of stores) {
        const drawer = tx.objectStore(name);
        drawer.clear();
        for (const record of data[name]) drawer.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    getAll: store => run(store, "readonly", s => s.getAll()),
    get: (store, key) => run(store, "readonly", s => s.get(key)),
    put: (store, record) => run(store, "readwrite", s => s.put(record)),
    remove: (store, key) => run(store, "readwrite", s => s.delete(key)),
    replaceAll
  };
})();
