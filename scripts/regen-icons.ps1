# Generate PWA / Apple touch icons from the reference jam jar artwork (assets/jam-app-icon.png).
# Run from repo root: pwsh -File scripts/regen-icons.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "assets/jam-app-icon.png"
if (-not (Test-Path $srcPath)) {
  Write-Error "Missing source image: $srcPath"
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))

function Export-AppIcon {
  param([int]$size, [string]$outRel)

  $outPath = Join-Path $root $outRel
  $dir = Split-Path -Parent $outPath
  if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory | Out-Null }

  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # Letterbox / cover to square (preserve aspect ratio, center crop)
  $sw = [float]$src.Width
  $sh = [float]$src.Height
  $scale = [Math]::Max($size / $sw, $size / $sh)
  $dw = $sw * $scale
  $dh = $sh * $scale
  $dx = ($size - $dw) / 2.0
  $dy = ($size - $dh) / 2.0

  $bg = [System.Drawing.Color]::FromArgb(255, 255, 229, 229)
  $g.Clear($bg)
  $g.DrawImage($src, $dx, $dy, $dw, $dh)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Wrote $outPath"
}

try {
  Export-AppIcon 180 "icons/apple-touch-icon.png"
  Export-AppIcon 192 "icons/icon-192.png"
  Export-AppIcon 512 "icons/icon-512.png"
}
finally {
  $src.Dispose()
}
