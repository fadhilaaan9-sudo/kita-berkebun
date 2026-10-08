#!/usr/bin/env bash
# Mengunduh model 3D (CC0, Kenney) yang dipakai game.
# Model .glb tidak di-commit ke git (binary); jalankan script ini sekali
# setelah git clone / git pull yang membawa perubahan aset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/client/public/models"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"

echo "-> Kenney Nature Kit ..."
curl -sSL -A "$UA" "https://kenney.nl/assets/nature-kit" -o "$TMP/nk.html"
NK_ZIP="$(grep -o 'https://kenney.nl/media/pages/assets/nature-kit/[^"]*\.zip' "$TMP/nk.html" | head -1)"
curl -sSL -A "$UA" "$NK_ZIP" -o "$TMP/nature.zip"

echo "-> Kenney Cube Pets ..."
curl -sSL -A "$UA" "https://kenney.nl/assets/cube-pets" -o "$TMP/cp.html"
CP_ZIP="$(grep -o 'https://kenney.nl/media/pages/assets/cube-pets/[^"]*\.zip' "$TMP/cp.html" | head -1)"
curl -sSL -A "$UA" "$CP_ZIP" -o "$TMP/cubepets.zip"

mkdir -p "$DEST/Textures"

unzip -o -j "$TMP/nature.zip" \
  "Models/GLTF format/crops_dirtSingle.glb" \
  "Models/GLTF format/crops_wheatStageA.glb" \
  "Models/GLTF format/crops_wheatStageB.glb" \
  "Models/GLTF format/crops_leafsStageA.glb" \
  "Models/GLTF format/crops_leafsStageB.glb" \
  "Models/GLTF format/crops_cornStageB.glb" \
  "Models/GLTF format/crops_cornStageD.glb" \
  "Models/GLTF format/fence_simple.glb" \
  -d "$DEST" > /dev/null

unzip -o -j "$TMP/cubepets.zip" \
  "Models/GLB format/animal-cow.glb" \
  "Models/GLB format/animal-chick.glb" \
  "Models/GLB format/Textures/colormap.png" \
  -d "$TMP/cp" > /dev/null
cp "$TMP/cp/animal-cow.glb" "$TMP/cp/animal-chick.glb" "$DEST/"
cp "$TMP/cp/colormap.png" "$DEST/Textures/"

echo "OK -> $DEST"
ls "$DEST"
