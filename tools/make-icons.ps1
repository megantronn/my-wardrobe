<#
  MAKE ICONS
  Draws the little pixel-art app icon (the one phones show on the home screen)
  and saves it in all the sizes the site needs, into the icons/ folder.

  To change the drawing: edit the $art picture below (16 x 16 squares, one letter per square),
  then run:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
#>

# One letter = one pixel.  . = background   P = pink   D = dark pink   G = gold   L = lime   W = white
$art = @(
  "................",
  "..L..........W..",
  ".LLL.P....P.WWW.",
  "..L..P....P..W..",
  "....PWPPPPPP....",
  "....PPPPPPPD....",
  ".....PPPPPD.....",
  ".....GGGGGG.....",
  "....PPPPPPPD....",
  "....PPPPPPPD....",
  "...PPPPPPPPPD...",
  "...PPPPPPPPPD...",
  "..PPPPPPPPPPPD..",
  "..DDDDDDDDDDDD..",
  "................",
  "................"
)
$colours = @{ "." = "#3E0F35"; "P" = "#F2609B"; "D" = "#B8175E"; "G" = "#F5B70A"; "L" = "#D9EE84"; "W" = "#FFFFFF" }

Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force $out | Out-Null

# size = picture size in pixels; fill = how much of it the drawing covers (the rest is background)
function Save-Icon([string]$name, [int]$size, [double]$fill) {
  $cell = [Math]::Floor($size * $fill / 16)
  $offset = [Math]::Floor(($size - $cell * 16) / 2)
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($colours["."]))
  for ($y = 0; $y -lt 16; $y++) {
    for ($x = 0; $x -lt 16; $x++) {
      $ch = [string]$art[$y][$x]
      if ($ch -eq ".") { continue }
      $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($colours[$ch]))
      $g.FillRectangle($brush, $offset + $x * $cell, $offset + $y * $cell, $cell, $cell)
      $brush.Dispose()
    }
  }
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "made icons/$name"
}

Save-Icon "icon-192.png" 192 1.0
Save-Icon "icon-512.png" 512 1.0
Save-Icon "icon-maskable-512.png" 512 0.65   # Android may cut this one into a circle, so keep a margin
Save-Icon "apple-touch-icon.png" 180 0.9
Save-Icon "favicon-32.png" 32 1.0

# The browser-tab icon as an SVG (stays sharp at any size)
$rects = foreach ($y in 0..15) { foreach ($x in 0..15) {
  $ch = [string]$art[$y][$x]
  if ($ch -ne ".") { "<rect x=`"$x`" y=`"$y`" width=`"1`" height=`"1`" fill=`"$($colours[$ch])`"/>" }
} }
$svg = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 16 16`" shape-rendering=`"crispEdges`"><rect width=`"16`" height=`"16`" fill=`"$($colours["."])`"/>" + ($rects -join "") + "</svg>"
[IO.File]::WriteAllText((Join-Path $out "favicon.svg"), $svg)
Write-Host "made icons/favicon.svg"
