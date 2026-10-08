<#
  Mengunduh model 3D (CC0, Kenney) yang dipakai game — versi Windows (PowerShell).

  Jalankan sekali dari root repo setelah git clone / git pull:
      powershell -ExecutionPolicy Bypass -File scripts\fetch-models.ps1

  (Di Git Bash / WSL / Linux / macOS pakai: ./scripts/fetch-models.sh)
#>
$ErrorActionPreference = "Stop"

$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptsDir
$dest = Join-Path $root "client\public\models"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("kebun-models-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
    $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    function Get-KenneyZip([string]$slug, [string]$outFile) {
        Write-Host "-> Kenney $slug ..."
        $page = Invoke-WebRequest -Uri "https://kenney.nl/assets/$slug" -UserAgent $ua -UseBasicParsing
        $m = [regex]::Match($page.Content, "https://kenney\.nl/media/pages/assets/$slug/[^\`"]*\.zip")
        if (-not $m.Success) { throw "Tidak menemukan link unduhan untuk $slug (mungkin kenney.nl berubah)" }
        Invoke-WebRequest -Uri $m.Value -UserAgent $ua -OutFile $outFile
    }

    function Expand-Selected([string]$zipPath, [string[]]$entries, [string]$destDir, [string]$subDir = "") {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
        try {
            foreach ($e in $entries) {
                $entry = $zip.Entries | Where-Object { $_.FullName -eq $e } | Select-Object -First 1
                if (-not $entry) { throw "Tidak ketemu di zip: $e" }
                $targetDir = if ($subDir) { Join-Path $destDir $subDir } else { $destDir }
                $target = Join-Path $targetDir ([IO.Path]::GetFileName($e))
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
            }
        }
        finally { $zip.Dispose() }
    }

    Get-KenneyZip "nature-kit" "$tmp\nature.zip"
    Get-KenneyZip "cube-pets" "$tmp\cubepets.zip"
    Get-KenneyZip "blocky-characters" "$tmp\blocky.zip"

    New-Item -ItemType Directory -Path (Join-Path $dest "Textures") -Force | Out-Null

    Expand-Selected "$tmp\nature.zip" @(
        "Models/GLTF format/crops_dirtSingle.glb",
        "Models/GLTF format/crops_wheatStageA.glb",
        "Models/GLTF format/crops_wheatStageB.glb",
        "Models/GLTF format/crops_leafsStageA.glb",
        "Models/GLTF format/crops_leafsStageB.glb",
        "Models/GLTF format/crops_cornStageB.glb",
        "Models/GLTF format/crops_cornStageD.glb",
        "Models/GLTF format/fence_simple.glb"
    ) $dest

    Expand-Selected "$tmp\cubepets.zip" @(
        "Models/GLB format/animal-cow.glb",
        "Models/GLB format/animal-chick.glb"
    ) $dest
    Expand-Selected "$tmp\cubepets.zip" @(
        "Models/GLB format/Textures/colormap.png"
    ) $dest "Textures"

    Expand-Selected "$tmp\blocky.zip" @(
        "Models/GLB format/character-a.glb"
    ) $dest
    Expand-Selected "$tmp\blocky.zip" @(
        "Models/GLB format/Textures/texture-a.png"
    ) $dest "Textures"

    Write-Host "OK -> $dest"
    Get-ChildItem $dest | Format-Table Name -HideTableHeaders
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
