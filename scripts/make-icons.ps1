<#
  make-icons.ps1 - regenerates the app icon rasters from the SAME path data
  used in public/logo.svg and src/app/icon.svg. There is one source of truth
  for the artwork (a Québec-blue rounded square, a white speech bubble, a
  blue fleur-de-lys); this script just re-renders those SVG path strings
  with WPF instead of a browser.

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
# ---------------------------------------------------------------------------
$bubblePath = 'F1 M144,104 L368,104 A48,48 0 0 1 416,152 L416,296 A48,48 0 0 1 368,344 L144,344 A48,48 0 0 1 96,296 L96,152 A48,48 0 0 1 144,104 Z M150,318 L144,400 L238,318 Z'
$fleurPath = 'F1 M256,118 C296,152 306,190 292,240 L220,240 C206,190 216,152 256,118 Z M218,228 C188,206 154,194 126,192 C134,236 168,262 206,262 L214,244 Z M294,228 C324,206 358,194 386,192 C378,236 344,262 306,262 L298,244 Z M192,230 L320,230 L320,278 L192,278 Z M234,278 L278,278 L270,308 L242,308 Z'

# Québec blue - same value fills the background square and the fleur-de-lys.
$blueColor = [System.Windows.Media.Color]::FromRgb(0x1B, 0x3F, 0xAE)

function New-IconRenderTargetBitmap {
  param([int]$Size)

  $bubbleGeometry = [System.Windows.Media.Geometry]::Parse($bubblePath)
  $fleurGeometry = [System.Windows.Media.Geometry]::Parse($fleurPath)
  $blueBrush = New-Object System.Windows.Media.SolidColorBrush($blueColor)
  $whiteBrush = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Colors]::White)
  $blueBrush.Freeze()
  $whiteBrush.Freeze()

  $visual = New-Object System.Windows.Media.DrawingVisual
  $ctx = $visual.RenderOpen()
  try {
    $scale = $Size / 512.0
    $ctx.PushTransform((New-Object System.Windows.Media.ScaleTransform($scale, $scale)))

    # Québec-blue rounded-square background, edge to edge.
    $backgroundRect = New-Object System.Windows.Rect(0, 0, 512, 512)
    $ctx.DrawRoundedRectangle($blueBrush, $null, $backgroundRect, 110, 110)

    # White speech bubble (rounded body + tail).
    $ctx.DrawGeometry($whiteBrush, $null, $bubbleGeometry)

    # Blue fleur-de-lys centred in the bubble.
    $ctx.DrawGeometry($blueBrush, $null, $fleurGeometry)

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
