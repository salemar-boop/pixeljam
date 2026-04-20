# Remove flat background from assets/jam-jar-ui.png (transparency). Flood-fill from image edges.
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/remove-jar-background.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root "assets/jam-jar-ui.png"
if (-not (Test-Path $path)) {
  Write-Error "Missing $path"
}

function Get-RefColor {
  param($bmp)
  $w = $bmp.Width
  $h = $bmp.Height
  $sumR = 0L; $sumG = 0L; $sumB = 0L; $n = 0
  for ($i = 0; $i -lt $w; $i += [Math]::Max(1, [int]($w / 40))) {
    $c = $bmp.GetPixel($i, 0)
    $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++
    $c2 = $bmp.GetPixel($i, $h - 1)
    $sumR += $c2.R; $sumG += $c2.G; $sumB += $c2.B; $n++
  }
  for ($j = 0; $j -lt $h; $j += [Math]::Max(1, [int]($h / 40))) {
    $c = $bmp.GetPixel(0, $j)
    $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++
    $c2 = $bmp.GetPixel($w - 1, $j)
    $sumR += $c2.R; $sumG += $c2.G; $sumB += $c2.B; $n++
  }
  return @{
    R = [int]($sumR / $n)
    G = [int]($sumG / $n)
    B = [int]($sumB / $n)
  }
}

function DistSq {
  param($r, $g, $b, $ref)
  $dr = $r - $ref.R
  $dg = $g - $ref.G
  $db = $b - $ref.B
  return $dr * $dr + $dg * $dg + $db * $db
}

$srcPath = Resolve-Path $path
$srcFile = [System.Drawing.Bitmap]::FromFile($srcPath)
$src = $null
try {
  # Work on a clone so we can release the file lock before Save() overwrites the same path.
  $src = New-Object System.Drawing.Bitmap $srcFile
}
finally {
  $srcFile.Dispose()
}

$out = $null
try {
  $w = $src.Width
  $h = $src.Height
  $ref = Get-RefColor $src
  # Squared distance thresholds (tuned for pale pink bg vs jam)
  $edgeThresh = 3600   # ~60 in RGB units — border must look like bg to seed BFS
  $fillThresh = 2500   # ~50 — expand through similar tones

  $isBg = New-Object bool[] ($w * $h)
  $q = New-Object System.Collections.Queue

  function TryEnqueue {
    param([int]$x, [int]$y, [int]$th)
    if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
    $i = $y * $w + $x
    if ($isBg[$i]) { return }
    $c = $src.GetPixel($x, $y)
    $dsq = DistSq $c.R $c.G $c.B $ref
    if ($dsq -le $th) {
      $isBg[$i] = $true
      [void]$q.Enqueue(@($x, $y))
    }
  }

  # Seed: every border pixel that matches background
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
    $cx = $p[0]
    $cy = $p[1]
    foreach ($dir in @(@(0, -1), @(0, 1), @(-1, 0), @(1, 0))) {
      $nx = $cx + $dir[0]
      $ny = $cy + $dir[1]
      if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { continue }
      $ni = $ny * $w + $nx
      if ($isBg[$ni]) { continue }
      $c = $src.GetPixel($nx, $ny)
      $ds = DistSq $c.R $c.G $c.B $ref
      if ($ds -le $fillThresh) {
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

  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Wrote transparent PNG: $path"
}
finally {
  if ($null -ne $src) { $src.Dispose() }
  if ($null -ne $out) { $out.Dispose() }
}

