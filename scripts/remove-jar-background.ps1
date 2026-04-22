# Remove background from jar PNGs: edge flood-fill (pink / white / cream) + near-white halo peel.
# Processes assets/jam-jar-ui.png and assets/jam-app-icon.png (if present).
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/remove-jar-background.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$targets = @(
  (Join-Path $root "assets/jam-jar-ui.png"),
  (Join-Path $root "assets/home-jar-hero.png"),
  (Join-Path $root "assets/home-btn-add.png"),
  (Join-Path $root "assets/jam-app-icon.png"),
  (Join-Path $root "assets/jar-btn-add.png"),
  (Join-Path $root "assets/jar-btn-shake.png"),
  (Join-Path $root "assets/jar-btn-share.png"),
  (Join-Path $root "assets/jar-btn-clear.png")
)

function Get-RefColor {
  param($bmp)
  $w = $bmp.Width
  $h = $bmp.Height
  $sumR = 0L; $sumG = 0L; $sumB = 0L; $n = 0
  $hb = $h - 1
  $wb = $w - 1
  for ($i = 0; $i -lt $w; $i += [Math]::Max(1, [int]($w / 50))) {
    foreach ($yy in @(0, $hb)) {
      $c = $bmp.GetPixel($i, $yy)
      if ($c.A -gt 128) { $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++ }
    }
  }
  for ($j = 0; $j -lt $h; $j += [Math]::Max(1, [int]($h / 50))) {
    foreach ($xx in @(0, $wb)) {
      $c = $bmp.GetPixel($xx, $j)
      if ($c.A -gt 128) { $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++ }
    }
  }
  if ($n -eq 0) {
    return @{ R = 255; G = 248; B = 248 }
  }
  return @{
    R = [int]($sumR / $n)
    G = [int]($sumG / $n)
    B = [int]($sumB / $n)
  }
}

function DistSq([int]$r, [int]$g, [int]$b, $ref) {
  $dr = $r - $ref.R
  $dg = $g - $ref.G
  $db = $b - $ref.B
  return $dr * $dr + $dg * $dg + $db * $db
}

function IsNearWhite([int]$r, [int]$g, [int]$b) {
  return ($r -ge 245 -and $g -ge 245 -and $b -ge 245)
}

function IsLightFlat([int]$r, [int]$g, [int]$b) {
  $mx = [Math]::Max($r, [Math]::Max($g, $b))
  $mn = [Math]::Min($r, [Math]::Min($g, $b))
  return ($r -gt 225 -and $g -gt 222 -and $b -gt 222 -and ($mx - $mn) -lt 42)
}

function Test-SimilarBackground([System.Drawing.Color]$c, $ref, [int]$th) {
  if ($c.A -lt 35) { return $true }
  $ds = DistSq $c.R $c.G $c.B $ref
  if ($ds -le $th) { return $true }
  if (IsNearWhite $c.R $c.G $c.B) { return $true }
  if (IsLightFlat $c.R $c.G $c.B) { return $true }
  return $false
}

function Remove-BackgroundFromBitmap {
  param([System.Drawing.Bitmap]$src)

  $w = $src.Width
  $h = $src.Height
  $ref = Get-RefColor $src
  $edgeThresh = 6500
  $fillThresh = 5200

  $isBg = New-Object bool[] ($w * $h)
  $q = New-Object System.Collections.Queue

  function TryEnqueue {
    param([int]$x, [int]$y, [int]$th)
    if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
    $i = $y * $w + $x
    if ($isBg[$i]) { return }
    $c = $src.GetPixel($x, $y)
    if (Test-SimilarBackground $c $ref $th) {
      $isBg[$i] = $true
      [void]$q.Enqueue(@($x, $y))
    }
  }

  for ($x = 0; $x -lt $w; $x++) {
    TryEnqueue $x 0 $edgeThresh
    TryEnqueue $x ($h - 1) $edgeThresh
  }
  for ($y = 0; $y -lt $h; $y++) {
    TryEnqueue 0 $y $edgeThresh
    TryEnqueue ($w - 1) $y $edgeThresh
  }

  while ($q.Count -gt 0) {
    $p = $q.Dequeue()
    $cx = $p[0]; $cy = $p[1]
    foreach ($dir in @(@(0, -1), @(0, 1), @(-1, 0), @(1, 0))) {
      $nx = $cx + $dir[0]
      $ny = $cy + $dir[1]
      if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { continue }
      $ni = $ny * $w + $nx
      if ($isBg[$ni]) { continue }
      $c = $src.GetPixel($nx, $ny)
      if (Test-SimilarBackground $c $ref $fillThresh) {
        $isBg[$ni] = $true
        [void]$q.Enqueue(@($nx, $ny))
      }
    }
  }

  $fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  $out = New-Object System.Drawing.Bitmap ($w, $h, $fmt)

  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $i = $y * $w + $x
      $c = $src.GetPixel($x, $y)
      if ($isBg[$i]) {
        $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
      }
      else {
        $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
      }
    }
  }

  # Peel very light pixels that touch transparency (removes white anti-alias fringe)
  $haloIters = 6
  for ($iter = 0; $iter -lt $haloIters; $iter++) {
    $clear = @()
    for ($y = 0; $y -lt $h; $y++) {
      for ($x = 0; $x -lt $w; $x++) {
        $c = $out.GetPixel($x, $y)
        if ($c.A -lt 45) { continue }
        # Only strip near-white fringe pixels, not soft tints on the jar
        if ($c.R -lt 248 -or $c.G -lt 248 -or $c.B -lt 248) { continue }
        $touch = $false
        foreach ($dir in @(@(0, -1), @(0, 1), @(-1, 0), @(1, 0))) {
          $nx = $x + $dir[0]; $ny = $y + $dir[1]
          if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { $touch = $true; break }
          $nc = $out.GetPixel($nx, $ny)
          if ($nc.A -lt 55) { $touch = $true; break }
        }
        if ($touch) {
          $clear += ,@($x, $y)
        }
      }
    }
    if ($clear.Count -eq 0) { break }
    foreach ($p in $clear) {
      $out.SetPixel($p[0], $p[1], [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    }
  }

  return $out
}

foreach ($path in $targets) {
  if (-not (Test-Path $path)) {
    Write-Host "Skip (not found): $path"
    continue
  }

  $srcPath = Resolve-Path $path
  $srcFile = [System.Drawing.Bitmap]::FromFile($srcPath)
  $src = $null
  try {
    $src = New-Object System.Drawing.Bitmap $srcFile
  }
  finally {
    $srcFile.Dispose()
  }

  $out = $null
  try {
    $out = Remove-BackgroundFromBitmap $src
    $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Wrote transparent PNG: $path"
  }
  finally {
    if ($null -ne $src) { $src.Dispose() }
    if ($null -ne $out) { $out.Dispose() }
  }
}
