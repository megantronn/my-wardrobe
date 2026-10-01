/* ======================================================================
   ZIP.JS — packs several files into one zip file, and unpacks them again.
   BACKUP uses it to put closet.json and all the photos into one file.
   Photos are already compressed, so files are stored as-is (squashing them
   again wouldn't save space). You shouldn't need to edit this file.

     const blob  = await Zip.make([{ name: "a.txt", data: "hello" }, { name: "b.webp", data: someBlob }]);
     const files = await Zip.read(blob);    // a Map: file name -> Blob
   ====================================================================== */
const Zip = (() => {
  // A CRC32 is a "fingerprint" of each file that the zip format needs (it spots damaged files).
  const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Zip files store dates the old MS-DOS way.
  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  // files: [{ name, data }] where data is a Blob or a string  ->  one zip Blob
  async function make(files) {
    const utf8 = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const body = [], index = [];
    let offset = 0;
    for (const f of files) {
      const blob = typeof f.data === "string" ? new Blob([f.data]) : f.data;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const name = utf8.encode(f.name);
      const crc = crc32(bytes);

      // "Local header": a little label in front of each file
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);          // zip version needed
      local.setUint16(6, 0x0800, true);      // file names are UTF-8
      local.setUint16(8, 0, true);           // 0 = stored, not compressed
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, bytes.length, true);
      local.setUint32(22, bytes.length, true);
      local.setUint16(26, name.length, true);
      body.push(local.buffer, name, blob);

      // "Central directory": the table of contents at the end of the zip
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, 0, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, bytes.length, true);
      entry.setUint32(24, bytes.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);     // where this file's local header starts
      index.push(entry.buffer, name);

      offset += 30 + name.length + bytes.length;
    }
    const indexSize = index.reduce((n, part) => n + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, indexSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...body, ...index, end.buffer], { type: "application/zip" });
  }

  // zip Blob/File -> Map of file name -> Blob
  async function read(blob) {
    const view = async (start, end) => new DataView(await blob.slice(start, end).arrayBuffer());

    // 1. The table of contents is found from a small record at the very end of the file.
    const tailStart = Math.max(0, blob.size - 65557);
    const tail = await view(tailStart, blob.size);
    let end = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error("not a zip file");
    const count = tail.getUint16(end + 10, true);
    const indexSize = tail.getUint32(end + 12, true);
    const indexStart = tail.getUint32(end + 16, true);

    // 2. Read the table of contents, then cut each file out of the zip.
    const index = await view(indexStart, indexStart + indexSize);
    const utf8 = new TextDecoder();
    const files = new Map();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (index.getUint32(p, true) !== 0x02014b50) throw new Error("damaged zip file");
      const method = index.getUint16(p + 10, true);
      const size = index.getUint32(p + 20, true);
      const nameLen = index.getUint16(p + 28, true);
      const extraLen = index.getUint16(p + 30, true);
      const commentLen = index.getUint16(p + 32, true);
      const localStart = index.getUint32(p + 42, true);
      // (some Windows zip tools write folder\file instead of folder/file, so accept both)
      const name = utf8.decode(new Uint8Array(index.buffer, index.byteOffset + p + 46, nameLen)).replace(/\\/g, "/");
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith("/")) continue;   // a folder, not a file

      const local = await view(localStart, localStart + 30);
      const dataStart = localStart + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      let data = blob.slice(dataStart, dataStart + size);
      if (method === 8) data = await inflate(data);   // compressed (e.g. re-zipped on a computer)
      else if (method !== 0) throw new Error("unsupported zip file");
      files.set(name, data);
    }
    return files;
  }

  // Un-squash a compressed file (only needed if someone re-zipped a backup by hand).
  async function inflate(blob) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser can't open compressed zip files");
    return new Response(blob.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
  }

  return { make, read };
})();
