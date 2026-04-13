Add-Type -AssemblyName System.Drawing

function New-RRect {
  param(
    [float]$x,
    [float]$y,
    [float]$w,
    [float]$h,
    [float]$r
  )
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  if ($d -gt $w) { $d = $w }
  if ($d -gt $h) { $d = $h }
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon {
  param([int]$s, [string]$path)

  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(7, 13, 34))

  $corner = [float]($s * 0.22)
  $iconPath = New-RRect 0 0 $s $s $corner
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.RectangleF]::new(0, 0, $s, $s)
  ), (
    [System.Drawing.Color]::FromArgb(10, 15, 36)
  ), (
    [System.Drawing.Color]::FromArgb(27, 24, 74)
  ), 35
  $g.FillPath($bgBrush, $iconPath)
  $edgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(32, 50, 95), [Math]::Max(2, $s * 0.012))
  $g.DrawPath($edgePen, $iconPath)

  $orb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(48, 84, 150))
  $g.FillEllipse($orb, [int]($s * 0.1), [int]($s * 0.1), [int]($s * 0.8), [int]($s * 0.8))

  $jarX = [float]($s * 0.19)
  $jarY = [float]($s * 0.22)
  $jarW = [float]($s * 0.62)
  $jarH = [float]($s * 0.62)
  $strokeW = [float][Math]::Max(2, $s * 0.012)
  $jarPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(31, 66, 112), $strokeW)

  $lidBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(118, 138, 167))
  $lidPath = New-RRect ($jarX + $jarW * 0.14) ($jarY - $jarH * 0.15) ($jarW * 0.72) ($jarH * 0.16) ($jarW * 0.05)
  $g.FillPath($lidBrush, $lidPath)
  $g.DrawPath($jarPen, $lidPath)

  $bodyPath = New-RRect $jarX $jarY $jarW $jarH ($jarW * 0.11)
  $steps = [int]$jarH
  for ($i = 0; $i -lt $steps; $i++) {
    $t = $i / [Math]::Max(1, $steps - 1)
    if ($t -lt 0.45) {
      $tt = $t / 0.45
      $r = [int](34 + (167 - 34) * $tt)
      $gr = [int](211 + (139 - 211) * $tt)
      $bl = [int](238 + (250 - 238) * $tt)
    } else {
      $tt = ($t - 0.45) / 0.55
      $r = [int](167 + (124 - 167) * $tt)
      $gr = [int](139 + (58 - 139) * $tt)
      $bl = [int](250 + (237 - 250) * $tt)
    }
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($r, $gr, $bl))
    $yy = $jarY + $i
    $g.DrawLine($linePen, $jarX, $yy, $jarX + $jarW, $yy)
    $linePen.Dispose()
  }
  $g.DrawPath($jarPen, $bodyPath)

  $shinePath = New-RRect ($jarX + $jarW * 0.12) ($jarY + $jarH * 0.12) ($jarW * 0.15) ($jarH * 0.62) ($jarW * 0.03)
  $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(65, 255, 255, 255))
  $g.FillPath($shine, $shinePath)

  $star1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(236, 255, 243, 199))
  $ps = [float][Math]::Max(2, $s * 0.018)
  $sx = $jarX + $jarW * 0.73
  $sy = $jarY + $jarH * 0.34
  $g.FillRectangle($star1, $sx, $sy - 2 * $ps, $ps, 4 * $ps)
  $g.FillRectangle($star1, $sx - 2 * $ps, $sy, 5 * $ps, $ps)

  $star2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(182, 165, 243, 252))
  $sx2 = $jarX + $jarW * 0.28
  $sy2 = $jarY + $jarH * 0.72
  $g.FillRectangle($star2, $sx2, $sy2 - 2 * $ps, $ps, 4 * $ps)
  $g.FillRectangle($star2, $sx2 - 2 * $ps, $sy2, 5 * $ps, $ps)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

if (!(Test-Path "icons")) {
  New-Item -Path "icons" -ItemType Directory | Out-Null
}

New-Icon 180 "icons/apple-touch-icon.png"
New-Icon 192 "icons/icon-192.png"
New-Icon 512 "icons/icon-512.png"
