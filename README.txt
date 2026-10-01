MY WARDROBE

What it is
  A Y2K wardrobe computer. Everyone who opens the site gets their own private closet,
  saved inside their own browser. Nothing is uploaded: photos never leave the device.

Files
  index.html             the page layout (boxes, buttons, panels)
  style.css              colours, fonts, sizes, spacing
  script.js              settings, the matching rules, the doll, and what every button does
  db.js                  saves each person's closet inside their browser (IndexedDB)
  zip.js                 packs and unpacks backup files
  backup.js              what BACKUP saves, and how RESTORE reads it back
  add-piece.js           the ADD PIECE screens (photo > cut-out > tags > save), and editing/deleting pieces
  doll.js                the doll: mannequin / silhouette / own photo, body markers, FIT PIECES, USE MY PHOTO
  lookbook.js            the LOOKBOOK: outfit photos, tapping the pieces worn, verdict stamps, the gallery
  photos.js              shrinks photos, crops cut-outs, splits pairs, saves small files, guesses colours
  cutout.js              runs the background remover (picks the fastest way, shows the download)
  cutout-worker.js       the background remover itself, running "in the background" so the page doesn't freeze
  manifest.webmanifest   the name and icons phones use for "Add to Home Screen"
  icons/                 the app icons (drawn by tools/make-icons.ps1)
  images/background.jpg  the wallpaper
  tools/serve.ps1        runs the site on your computer at http://localhost:8080
  tools/make-icons.ps1   redraws the app icons

Private: stays on this computer, never uploaded (listed in .gitignore)
  images/clothes/        your original clothing photos
  private/               anything else you want kept off the internet

Open it on your computer
  In VS Code: right-click index.html and choose "Open with Live Server".
  Or: right-click tools/serve.ps1, choose "Run with PowerShell", then open http://localhost:8080
  (Double-clicking index.html isn't enough: browsers limit what a page opened from a file can save.)

Quick edits
  Your name in the title ............ CONFIG.ownerName (script.js)
  How often to nudge about backups .. CONFIG.backupReminderDays (script.js)
  What counts as matching ........... NEUTRALS, GOOD_PAIRS, BAD_PAIRS, and the evaluate() section (script.js)
  Verdict words ..................... the tiers list inside evaluate() (script.js)
  App icon .......................... the pixel picture at the top of tools/make-icons.ps1
  Colour names and swatches ......... COLORS (script.js)
  How colours are guessed ........... nameColour() and BRIGHT (photos.js)
  Where new pieces first sit ........ DEFAULT_BOX and defaultBox() (script.js)
  Background remover model .......... MODEL in cutout.js ("isnet_quint8" = smaller download)
  Background remover version ........ the version number in the first line of code in cutout-worker.js

The default doll (your silhouette)
  Put a picture called doll-silhouette.png in the images folder and it replaces the drawn mannequin
  for everyone. Without it, the mannequin is used. The picture should be:
    - 800 x 2000 pixels (2:5, portrait), PNG with a see-through (transparent) background
    - one solid colour, standing straight, facing forward, feet a little apart,
      arms hanging slightly away from the body (a gap at the waist)
    - centred left to right; top of the head about 88px from the top; soles of the feet about 1888px from the top
  Its head, shoulders, waist and ankles are measured automatically. If clothes sit oddly, the measured
  spots can be typed into CONFIG.silhouetteMarks in script.js (in doll units: 200 wide, 500 tall).

How pieces sit on the doll
  Each piece's position is stored as if it were on the mannequin. On another doll (silhouette or photo)
  it's moved and resized to match that doll's head/shoulders/waist/ankles markers. It's paper-doll
  layering: flat photos on top, nothing is bent to fit a body. FIT PIECES lets you drag/resize a piece;
  that fit is saved with the piece (RESET puts it back).

Lookbook
  LOOKBOOK (in VIEW) shows photos of outfits actually worn. ADD OUTFIT PHOTO: take/pick a photo,
  optionally cut yourself out (you then stand on the wallpaper), tap the pieces you're wearing,
  then JUDGE & SAVE. Looks are judged with the same rules as the doll, for the season they were worn in.
  TO LOOKBOOK (under SAVED LOOKS) saves the doll's outfit as a look to photograph later.
  Lookbook photos are saved in the browser and included in BACKUP.

Background removal
  Done on the person's own device by @imgly/background-removal (https://github.com/imgly/background-removal-js),
  which is free under the AGPL licence. That licence means this site's code must be public too.
  The tool (about 64 MB) downloads the first time someone adds a piece, then the browser keeps it.
  Photos are never uploaded: only the tool is downloaded.

Backups
  BACKUP saves the whole closet (pieces, tags, photos and saved looks) as one ".closet" file.
  RESTORE on any phone or computer brings it all back.
  A .closet file is really a zip file: rename a copy to .zip if you want to look inside.
