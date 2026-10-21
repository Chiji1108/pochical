#!/bin/sh
# Lighthouse's default mobile profile (simulated slow 4G, 4x CPU), runs
# alternating between the two builds per page; JSON reports into $1.
# sh scripts/lighthouse.sh <out dir> <runs> <name>=<origin> <name>=<origin>
# THROTTLING=devtools applies the same profile for real instead of
# simulating it from an unthrottled load.
out=$1
runs=$2
shift 2
throttling=${THROTTLING:-simulate}
mkdir -p "$out"
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for path in / /privacy; do
  slug=$(echo "$path" | tr -d / | sed 's/^$/top/')
  i=1
  while [ "$i" -le "$runs" ]; do
    for target in "$@"; do
      name=${target%%=*}
      origin=${target#*=}
      npx -y lighthouse@13.5.0 "$origin$path" --quiet --only-categories=performance --throttling-method="$throttling" \
        --chrome-flags="--headless=new" --output=json \
        --output-path="$out/$name-$slug-$i.json" || exit 1
    done
    i=$((i + 1))
  done
done
