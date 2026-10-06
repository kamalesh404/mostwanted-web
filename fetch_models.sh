#!/bin/bash
# Scrape Poly Pizza for free GLB models and download them.
# Writes models to public/models and metadata to models_meta.csv
set -u
cd "$(dirname "$0")"
OUT="public/models"
META="models_meta.csv"
echo "file,search,title,license,url,bytes" > "$META"
mkdir -p "$OUT"

fetch_one() { # $1=search term $2=index $3=model id
  local term="$1" i="$2" id="$3"
  local page="/tmp/pp_$id.html"
  curl -s --max-time 20 "https://poly.pizza/m/$id" -o "$page" || return 1
  local glb title lic fname bytes
  glb=$(grep -o 'https://static\.poly\.pizza/[a-f0-9-]*\.glb' "$page" | head -1)
  [ -z "$glb" ] && return 1
  title=$(grep -o '<meta property="og:title" content="[^"]*"' "$page" | head -1 | sed 's/.*content="//;s/"$//')
  lic=$(grep -o '"Licence":"[^"]*"' "$page" | head -1 | sed 's/.*:"//;s/"$//')
  fname="${term}_${i}.glb"
  curl -s --max-time 60 -o "$OUT/$fname" "$glb" || return 1
  bytes=$(wc -c < "$OUT/$fname")
  if [ "$bytes" -lt 3000 ]; then rm -f "$OUT/$fname"; return 1; fi
  echo "$fname,$term,$title,$lic,$glb,$bytes" >> "$META"
  echo "OK $fname ($bytes bytes) $title"
}

for entry in "sports_car|1|sports car" "sports_car|2|supercar" "muscle_car|1|muscle car" \
             "sedan|1|sedan" "sedan|2|hatchback" "taxi|1|taxi" "police|1|police car" "police|2|police car" \
             "van|1|van" "bus|1|bus" "building|1|building" "building|2|building" "building|3|building" \
             "building|4|apartment building" "building|5|office building" "building|6|skyscraper" \
             "building|7|house" "building|8|shop" "streetlight|1|street light" "trafficlight|1|traffic light" \
             "tree|1|tree" "tree|2|tree"; do
  IFS='|' read -r term i query <<< "$entry"
  ids=$(curl -s --max-time 20 "https://poly.pizza/search/$(echo "$query" | sed 's/ /%20/g')" \
        | grep -o '"/m/[A-Za-z0-9_-]*"' | sed 's|^"/m/||;s|"$||' | sort -u | sed -n "1,${i}p" | tail -1)
  if [ -n "$ids" ]; then fetch_one "$term" "$i" "$ids"; else echo "MISS search $query"; fi
done
echo "=== summary ==="
du -sh "$OUT"; wc -l "$META"
