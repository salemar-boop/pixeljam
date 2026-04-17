# Generates PWA / iOS icons from the watercolor jar reference art.
# Source: assets/jar-icon-source.png (copy of the user's reference image).

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot "assets/jar-icon-source.png"
$iconsDir = Join-Path $repoRoot "icons"

if (!(Test-Path $sourcePath)) {
  Write-Error "Missing source image: $sourcePath"
}

if (!(Test-Path $iconsDir)) {
  New-Item -Path $iconsDir -ItemType Directory | Out-Null
}

function New-RoundedRectPath {
  param(
    [float]$x,
    [float]$y,
    [float]$w,
    [float]$h,
    [float]$r
  )
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Export-AppIcon {
  param(
    [int]$Size,
    [string]$OutFile,
    [string]$SourceFile
  )

  $src = [System.Drawing.Image]::FromFile($SourceFile)
  try {
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $bg = [System.Drawing.Color]::FromArgb(255, 251, 226, 225)
      $g.Clear($bg)

      $corner = [float]($Size * 0.2)
      $clip = New-RoundedRectPath 0 0 $Size $Size $corner
      $g.SetClip($clip)

      # Letterbox the reference art (full jar visible, same pink as illustration)
      $scale = [Math]::Min($Size / $src.Width, $Size / $src.Height)
      $nw = [float]($src.Width * $scale)
      $nh = [float]($src.Height * $scale)
      $nx = ($Size - $nw) / 2
      $ny = ($Size - $nh) / 2
      $g.DrawImage($src, $nx, $ny, $nw, $nh)

      $g.ResetClip()

      $edgeW = [Math]::Max(1.0, $Size * 0.008)
      $edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 120, 60, 62), $edgeW)
      $g.DrawPath($edge, $clip)
      $edge.Dispose()
      $clip.Dispose()

      $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $g.Dispose()
      $bmp.Dispose()
    }
  }
  finally {
    $src.Dispose()
  }
}

Export-AppIcon -Size 180 -OutFile (Join-Path $iconsDir "apple-touch-icon.png") -SourceFile $sourcePath
Export-AppIcon -Size 192 -OutFile (Join-Path $iconsDir "icon-192.png") -SourceFile $sourcePath
Export-AppIcon -Size 512 -OutFile (Join-Path $iconsDir "icon-512.png") -SourceFile $sourcePath

Write-Host "Wrote icons from: $sourcePath"
