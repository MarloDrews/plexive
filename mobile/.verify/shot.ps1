# Screenshot helper for emulator verification: screencap -> pull -> downscale.
# Usage: .\shot.ps1 -Name feed
param([Parameter(Mandatory = $true)][string]$Name)

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$dir = "d:\Projects\Plexive\mobile\.verify"
$raw = Join-Path $dir "$Name-raw.png"
$out = Join-Path $dir "$Name.png"

& $adb shell screencap -p /sdcard/s.png
& $adb pull /sdcard/s.png $raw | Out-Null

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($raw)
$scale = 540 / $img.Width
$w = [int](540)
$h = [int]($img.Height * $scale)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = "HighQualityBicubic"
$g.DrawImage($img, 0, 0, $w, $h)
$g.Dispose()
$img.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Remove-Item $raw -Force
Write-Output "saved $out"
