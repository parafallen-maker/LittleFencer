#!/bin/bash
# 创建 iOS imageset Contents.json 文件

ASSETS=/Users/Ljc_1/Downloads/LittleFencer-iOS/LittleFencer/Resources/Assets.xcassets

create_contents_json() {
    local name=$1
    local filename=$2
    cat > "$ASSETS/${name}.imageset/Contents.json" << EOF
{
  "images" : [
    {
      "filename" : "${filename}.png",
      "idiom" : "universal",
      "scale" : "1x"
    },
    {
      "idiom" : "universal",
      "scale" : "2x"
    },
    {
      "idiom" : "universal",
      "scale" : "3x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
}

# 创建每个 imageset 的 Contents.json
create_contents_json "empty_gallery" "empty_gallery"
create_contents_json "empty_perfect" "empty_perfect"
create_contents_json "onboard_setup" "onboard_setup"
create_contents_json "onboard_engarde" "onboard_engarde"
create_contents_json "onboard_lunge" "onboard_lunge"
create_contents_json "badge_first_rep" "badge_first_rep"
create_contents_json "badge_combo_5" "badge_combo_5"
create_contents_json "badge_combo_10" "badge_combo_10"
create_contents_json "badge_perfect_10" "badge_perfect_10"

echo "✅ Contents.json files created"
