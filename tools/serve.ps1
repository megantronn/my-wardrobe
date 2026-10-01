<#
  LOCAL TEST SERVER
  Shows this website at http://localhost:8080 so you can test it on your own computer.
  (Saving to the browser and background removal don't work if you just double-click index.html.)

  How to run it:  right-click this file > "Run with PowerShell"
             or:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
  How to stop it: close the window, or press Ctrl+C.

  You can still use VS Code's "Open with Live Server" instead; both do the same job.
#>
param([int]$Port = 8080)

# The website folder is the one above this "tools" folder.
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Tells the browser what kind of file it's getting, based on the file ending.
$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8"
  ".json" = "application/json"; ".webmanifest" = "application/manifest+json"
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"
  ".gif" = "image/gif"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
  ".woff2" = "font/woff2"; ".wasm" = "application/wasm"; ".zip" = "application/zip"
  ".txt" = "text/plain; charset=utf-8"; ".toml" = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root"
Write-Host "Open http://localhost:$Port in your browser. Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      # Work out which file was asked for ("/" means index.html).
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith("/")) { $path += "index.html" }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart("/")))

      # Only hand out files that are inside the website folder.
      if (-not $file.StartsWith($root + "\") -or -not (Test-Path $file -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("Not found: $path")
      } else {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes($file)
      }
      # Always send the newest version while testing (no caching).
      $res.Headers.Add("Cache-Control", "no-store")
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne "HEAD") { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      Write-Host "$($res.StatusCode) $path"
    } catch {
      Write-Host "Error: $_"
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
