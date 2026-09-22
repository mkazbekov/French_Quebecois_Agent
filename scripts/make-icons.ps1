<#
  make-icons.ps1 - regenerates the app icon rasters from the SAME path data
  used in public/logo.svg and src/app/icon.svg. There is one source of truth
  for the artwork (a Québec-blue rounded square and a paper-white speech
  bubble with an accent aigu punched out of it); this script just re-renders
  those SVG path strings with WPF instead of a browser.

  Produces:
    assets/icon-16.png, icon-32.png, icon-48.png, icon-64.png, icon-128.png,
    icon-256.png
    assets/tutor-1024.png   (source for the macOS .icns, built at install time)
    assets/tutor.ico        (multi-size ICO for the Windows shortcut)

  Usage:  pwsh -File scripts/make-icons.ps1
  Idempotent: re-running just overwrites the same files with the same
  pixels. WPF's rendering types (DrawingVisual, RenderTargetBitmap) need an
  STA thread, so this script relaunches itself with -STA if it isn't
  already running on one.
#>

param()

$ErrorActionPreference = 'Stop'

if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') {
  Write-Host "Relaunching on an STA thread (WPF rendering needs one)..."
  $psExe = (Get-Process -Id $PID).Path
  & $psExe -sta -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @args
  exit $LASTEXITCODE
}

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot 'assets'
if (-not (Test-Path -LiteralPath $assetsDir)) {
  New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Same path data as public/logo.svg and src/app/icon.svg (viewBox 0 0 512 512).
# Keep these three copies identical when the artwork changes.
#
# The 'F0' prefix on the bubble is WPF's even-odd fill rule (SVG's
# fill-rule="evenodd"): the second subpath is the accent aigu, and even-odd
# is what punches it out of the bubble instead of painting over it.
# ---------------------------------------------------------------------------
$squarePath = 'F1 M110,0 L402,0 A110,110 0 0 1 512,110 L512,402 A110,110 0 0 1 402,512 L110,512 A110,110 0 0 1 0,402 L0,110 A110,110 0 0 1 110,0 Z'
$accentPath = 'F0 M156,96 L356,96 A64,64 0 0 1 420,160 L420,304 A64,64 0 0 1 356,368 L268,368 L172,438 L196,368 L156,368 A64,64 0 0 1 92,304 L92,160 A64,64 0 0 1 156,96 Z M210,286 L328,208 L308,178 L190,256 Z'

# Québec blue for the square; paper white for the bubble.
$blueColor = [System.Windows.Media.Color]::FromRgb(0x1B, 0x3F, 0xAE)
$paperColor = [System.Windows.Media.Color]::FromRgb(0xFD, 0xFB, 0xF7)

function New-IconRenderTargetBitmap {
  param([int]$Size)

  $squareGeometry = [System.Windows.Media.Geometry]::Parse($squarePath)
  $accentGeometry = [System.Windows.Media.Geometry]::Parse($accentPath)
  $blueBrush = New-Object System.Windows.Media.SolidColorBrush($blueColor)
  $paperBrush = New-Object System.Windows.Media.SolidColorBrush($paperColor)
  $blueBrush.Freeze()
  $paperBrush.Freeze()

  $visual = New-Object System.Windows.Media.DrawingVisual
  $ctx = $visual.RenderOpen()
  try {
    $scale = $Size / 512.0
    $ctx.PushTransform((New-Object System.Windows.Media.ScaleTransform($scale, $scale)))

    # Québec-blue rounded-square background, edge to edge.
    $ctx.DrawGeometry($blueBrush, $null, $squareGeometry)

    # Paper-white speech bubble with the accent aigu knocked out of it.
    $ctx.DrawGeometry($paperBrush, $null, $accentGeometry)

    $ctx.Pop()
  } finally {
    $ctx.Close()
  }

  $rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(
    $Size, $Size, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
  $rtb.Render($visual)
  $rtb.Freeze()
  return $rtb
}

function Get-PngBytes {
  param($Bitmap)
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $frame = [System.Windows.Media.Imaging.BitmapFrame]::Create($Bitmap)
  $encoder.Frames.Add($frame)
  $ms = New-Object System.IO.MemoryStream
  $encoder.Save($ms)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return $bytes
}

function Save-PngFile {
  param([byte[]]$Bytes, [string]$Path)
  [System.IO.File]::WriteAllBytes($Path, $Bytes)
  Write-Host ("  wrote {0} ({1} bytes)" -f $Path, $Bytes.Length)
}

# ---------------------------------------------------------------------------
# PNG rasters
# ---------------------------------------------------------------------------
Write-Host "Rendering PNG icons into $assetsDir ..."
$sizes = @(16, 32, 48, 64, 128, 256)
$pngBytesBySize = @{}
foreach ($size in $sizes) {
  $bmp = New-IconRenderTargetBitmap -Size $size
  $bytes = Get-PngBytes -Bitmap $bmp
  $pngBytesBySize[$size] = $bytes
  Save-PngFile -Bytes $bytes -Path (Join-Path $assetsDir "icon-$size.png")
}

$bmp1024 = New-IconRenderTargetBitmap -Size 1024
$bytes1024 = Get-PngBytes -Bitmap $bmp1024
Save-PngFile -Bytes $bytes1024 -Path (Join-Path $assetsDir 'tutor-1024.png')

# ---------------------------------------------------------------------------
# tutor.ico - a real multi-size ICO, PNG-compressed per Windows Vista+
# (ICONDIR + one ICONDIRENTRY per image, then the PNG bytes back to back).
# ---------------------------------------------------------------------------
$icoPath = Join-Path $assetsDir 'tutor.ico'
Write-Host "Writing $icoPath ..."

$icoSizes = @(16, 32, 48, 64, 128, 256)
$imageCount = $icoSizes.Count
$headerSize = 6
$entrySize = 16
$dataOffset = $headerSize + ($entrySize * $imageCount)

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICONDIR: reserved(2)=0, type(2)=1 (icon), count(2)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$imageCount)

$offset = $dataOffset
foreach ($size in $icoSizes) {
  $bytes = $pngBytesBySize[$size]
  $widthByte = if ($size -ge 256) { 0 } else { [byte]$size }
  $heightByte = if ($size -ge 256) { 0 } else { [byte]$size }
  $bw.Write([byte]$widthByte)      # width, 0 means 256
  $bw.Write([byte]$heightByte)     # height, 0 means 256
  $bw.Write([byte]0)               # color count, 0 = no palette
  $bw.Write([byte]0)               # reserved
  $bw.Write([UInt16]1)             # color planes
  $bw.Write([UInt16]32)            # bits per pixel
  $bw.Write([UInt32]$bytes.Length) # size of image data
  $bw.Write([UInt32]$offset)       # offset of image data from start of file
  $offset += $bytes.Length
}

$bw.Flush()
# Write the raw PNG payloads straight to the MemoryStream (not via
# BinaryWriter.Write(byte[]) - PowerShell's method-overload resolution picks
# the wrong overload for that call and silently writes one byte per array).
foreach ($size in $icoSizes) {
  $dataBytes = $pngBytesBySize[$size]
  $ms.Write($dataBytes, 0, $dataBytes.Length)
}
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()
Write-Host ("  wrote {0} ({1} bytes, {2} images)" -f $icoPath, (Get-Item -LiteralPath $icoPath).Length, $imageCount)

Write-Host "Done."
