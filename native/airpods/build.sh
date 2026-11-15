#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
bin_dir=$(swift build -c release --show-bin-path)
app_dir="$PWD/dist/Kaam Ki Baat AirPods.app"
mkdir -p "$app_dir/Contents/MacOS"
cp "$bin_dir/KaamKiBaatAirPods" "$app_dir/Contents/MacOS/KaamKiBaatAirPods"
cp Info.plist "$app_dir/Contents/Info.plist"
plutil -lint "$app_dir/Contents/Info.plist"
codesign --force --sign - "$app_dir"
codesign --verify --strict "$app_dir"
echo "Built: $app_dir"
