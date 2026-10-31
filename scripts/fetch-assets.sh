#!/usr/bin/env bash
# Fetches the generated source media and builds the optimised assets the site uses.
# Runs in GitHub Actions (ubuntu-latest ships ffmpeg + ImageMagick). Idempotent.
set -euo pipefail

B="https://d8j0ntlcm91z4.cloudfront.net/user_3F4Ns8pjXt5O6qgWvgvJTMe5jq5"
mkdir -p tmp assets

dl() { [ -s "tmp/$1" ] || curl -fsSL --retry 3 -o "tmp/$1" "$B/$2"; }

dl hero-wide.png      hf_20261031_131117_339d16f1-6134-4264-a80c-6253e894feb2.png
dl hero-tall.png      hf_20261031_131117_9e22e2a4-fecf-45a7-93e2-f6ad702f8179.png
dl liftoff.png        hf_20261031_131117_95838ba2-d3ce-4338-94df-05d2215921bc.png
dl meadow.png         hf_20261031_131117_1fdecc6d-d9fa-4f04-bf81-65421607912d.png
dl bee-cut.png        hf_20261031_131526_db422852-c036-44b7-aa0f-477074d41578.png
dl bee2-cut.png       hf_20261031_131527_d01ae083-5399-4a63-9adf-dfadb9e00316.png
dl lavender-cut.png   hf_20261031_131528_56abfc95-9085-4d72-8507-ad6d197e005b.png
dl cornflower-cut.png hf_20261031_131530_31851c24-5715-427a-89df-6572fa0e4f7b.png
dl daisy-cut.png      hf_20261031_131641_b2bd270e-40ea-413b-a137-df5afaa334f0.png
dl intro.mp4          hf_20261031_131542_3fd8f092-704e-46db-8f6f-2045e265997a.mp4
dl finale.mp4         hf_20261031_131534_e763960c-9023-47b8-917e-0772df7ed947.mp4

# ── Photos ─────────────────────────────────────────────
photo() { convert "tmp/$1" -resize "$3" -strip -interlace Plane -sampling-factor 4:2:0 -quality "$4" "assets/$2"; }
photo hero-wide.png hero-wide.jpg 2560x 84
photo hero-tall.png hero-tall.jpg 1440x 84
photo liftoff.png   liftoff.jpg   2560x 82
photo meadow.png    meadow.jpg    2560x 80

# ── Cutouts (transparent WebP) ─────────────────────────
cut() { convert "tmp/$1" -trim +repage -resize "$3" -strip -quality 86 -define webp:alpha-quality=92 -define webp:method=6 "assets/$2"; }
cut bee-cut.png        bee.webp               900x900
cut bee2-cut.png       bee-2.webp             900x900
cut lavender-cut.png   flower-lavender.webp   700x700
cut cornflower-cut.png flower-cornflower.webp 700x700
cut daisy-cut.png      flower-daisy.webp      700x700

# ── Intro loop: seamless (tail crossfades into head), silent ──
ffmpeg -y -v error -i tmp/intro.mp4 -filter_complex \
  "[0:v]trim=1:8,setpts=PTS-STARTPTS[a];[0:v]trim=0:1,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=1:offset=6,scale=1920:-2,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 21 -movflags +faststart assets/intro.mp4

# ── Finale: as rendered, silent, faststart ─────────────
ffmpeg -y -v error -i tmp/finale.mp4 -an -c:v libx264 -preset slow -crf 20 -vf "scale=1920:-2,format=yuv420p" -movflags +faststart assets/finale.mp4

# ── Ambience: both clips' field audio, joined and made to loop ──
ffmpeg -y -v error -i tmp/intro.mp4 -i tmp/finale.mp4 -filter_complex \
  "[0:a][1:a]acrossfade=d=1.5:c1=tri:c2=tri[j];[j]asplit[j1][j2];[j1]atrim=1.5,asetpts=PTS-STARTPTS[x];[j2]atrim=0:1.5,asetpts=PTS-STARTPTS[y];[x][y]acrossfade=d=1.5:c1=tri:c2=tri,highpass=f=80,lowpass=f=9000,loudnorm=I=-24:TP=-3[a]" \
  -map "[a]" -c:a libmp3lame -q:a 4 assets/ambience.mp3

ls -la assets
