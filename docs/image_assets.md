# 🎨 LittleFencer 图片资源清单

## 统一设计风格

**风格关键词**: 
- **主题**: 青少年击剑运动、活力、科技感
- **色调**: 深色背景 (#121212) + 霓虹绿 (#00FF00) + 金色高亮 (#FFD700)
- **风格**: 扁平化、圆角、简洁线条、微光效果
- **氛围**: 专业运动 + 游戏化 + 儿童友好

---

## 1️⃣ App 图标 (Launcher Icons) - P0 必须

### ic_launcher.png
- **尺寸**: 512x512
- **用途**: 应用图标
- **文件路径**: `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- **Prompt**:
```
App icon for a youth fencing training app called "LittleFencer". Design: A stylized saber sword blade forming the letter "L", with neon green (#00FF00) glow effect on dark background. Modern flat design with subtle gradient, rounded corners. Kid-friendly yet sporty. High contrast, clean lines, no text.
```

### ic_launcher_round.png
- **尺寸**: 512x512
- **用途**: 圆形图标
- **文件路径**: `app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- **Prompt**:
```
App icon for a youth fencing training app called "LittleFencer". Design: A stylized saber sword blade forming the letter "L", with neon green (#00FF00) glow effect on dark background. Modern flat design with subtle gradient. Kid-friendly yet sporty. High contrast, clean lines, no text. Optimized for circular mask, sword centered in composition.
```

### ic_launcher_foreground.png
- **尺寸**: 512x512
- **用途**: 自适应图标前景层
- **文件路径**: `app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- **Prompt**:
```
Foreground layer for Android adaptive icon: A neon green (#00FF00) saber sword icon with subtle glow effect, centered composition, transparent background. The sword should be styled as letter "L". Clean lines, modern flat design. Designed for Android adaptive icon safe zone (keep content within center 66% area).
```

---

## 2️⃣ 宣传图 (Marketing) - P0/P1

### banner.png
- **尺寸**: 1200x630
- **用途**: README / 社交媒体 Banner
- **文件路径**: `docs/banner.png`
- **Prompt**:
```
Wide banner for "LittleFencer" fencing training app. Left side: silhouette of young fencer in lunge position with neon green skeleton overlay lines showing AI pose detection. Right side: app name "LittleFencer" with crossed swords icon. Dark background (#121212), neon green (#00FF00) accents, golden sparks (#FFD700). Futuristic sports tech vibe, kid-friendly. Aspect ratio 1200x630.
```

### feature_graphic.png
- **尺寸**: 1024x500
- **用途**: Google Play 特色图
- **文件路径**: `docs/feature_graphic.png`
- **Prompt**:
```
Feature graphic for Google Play Store. Young fencer silhouette mid-lunge action with AI pose detection overlay (green skeleton lines connecting joints). Text "AI Fencing Coach" in modern font. Dark tech background (#121212) with neon green (#00FF00) and gold (#FFD700) highlights. Professional yet playful for youth sports training app. Size 1024x500.
```

### screenshot_training.png
- **尺寸**: 1080x1920 (9:16)
- **用途**: 应用截图 - 训练界面
- **文件路径**: `docs/screenshots/screenshot_training.png`
- **Prompt**:
```
App screenshot mockup showing training interface: Phone screen with camera view of young fencer with green skeleton overlay on body joints, large rep counter "12" in top right corner with white bold text, golden "5x COMBO!" badge in top left, status text "En Garde! ⚔️ Ready..." at bottom center. Dark immersive UI, fullscreen landscape orientation displayed in portrait phone frame.
```

### screenshot_gallery.png
- **尺寸**: 1080x1920 (9:16)
- **用途**: 应用截图 - 视频库
- **文件路径**: `docs/screenshots/screenshot_gallery.png`
- **Prompt**:
```
App screenshot mockup showing video gallery interface: Dark theme (#121212), toolbar with "我的训练视频" title and back arrow, three tabs "全部 (24) / ⭐ 精彩 (8) / 📝 待改进 (16)" with green indicator on first tab, 2-column grid of video thumbnails with play button overlay, star badges on some videos, duration labels like "0:12". Clean Material Design style.
```

---

## 3️⃣ 应用内图标 (In-App Icons) - ✅ 已完成

以下图标已使用 XML 矢量图实现，无需生成：

| 文件名 | 尺寸 | 用途 | 状态 |
|--------|------|------|------|
| `ic_share.xml` | 24dp | 分享按钮 | ✅ 已有 |
| `ic_star.xml` | 24dp | 精彩徽章 | ✅ 已有 |
| `ic_video_library.xml` | 24dp | 视频库入口 | ✅ 已有 |
| `ic_play_circle.xml` | 48dp | 视频播放按钮 | ✅ 已有 |
| `ic_back.xml` | 24dp | 返回导航 | ✅ 已有 |
| `ic_delete.xml` | 24dp | 删除操作 | ✅ 已有 |

---

## 4️⃣ 空状态插图 (Empty States) - P2 可选

### empty_gallery.png
- **尺寸**: 200x200
- **用途**: 视频库空状态
- **文件路径**: `app/src/main/res/drawable-xxhdpi/empty_gallery.png`
- **Prompt**:
```
Minimal line illustration for empty state: A film reel combined with a fencing saber sword, single-line stroke style in gray (#888888) on transparent background. Simple, soft, friendly design. Conveys "no training videos yet". 200x200 pixels.
```

### empty_perfect.png
- **尺寸**: 200x200
- **用途**: 精彩集锦空状态
- **文件路径**: `app/src/main/res/drawable-xxhdpi/empty_perfect.png`
- **Prompt**:
```
Minimal line illustration for empty state: A five-pointed star with a saber sword crossing through it, outlined stroke style in gold (#FFD700) with soft glow on transparent background. Conveys "no perfect moves yet, keep practicing!". 200x200 pixels.
```

---

## 5️⃣ 引导页插图 (Onboarding) - P2 可选

### onboard_1_setup.png
- **尺寸**: 400x400
- **用途**: 引导步骤1 - 设置手机位置
- **文件路径**: `app/src/main/res/drawable-xxhdpi/onboard_1_setup.png`
- **Prompt**:
```
Flat illustration for app onboarding: A smartphone mounted on a small tripod, facing a cartoon young fencer figure standing 2-3 meters away. Dotted line showing distance. Neon green (#00FF00) accents on dark background (#1E1E1E). Friendly instructional style, simple shapes, no text. 400x400 pixels.
```

### onboard_2_engarde.png
- **尺寸**: 400x400
- **用途**: 引导步骤2 - En Garde 姿势
- **文件路径**: `app/src/main/res/drawable-xxhdpi/onboard_2_engarde.png`
- **Prompt**:
```
Flat illustration for app onboarding: Young fencer in En Garde ready stance with bent front knee, shown with green skeleton overlay lines on joints, a green checkmark above indicating correct posture. Dark background, neon green highlights. Encouraging instructional style. 400x400 pixels.
```

### onboard_3_lunge.png
- **尺寸**: 400x400
- **用途**: 引导步骤3 - Lunge 弓步动作
- **文件路径**: `app/src/main/res/drawable-xxhdpi/onboard_3_lunge.png`
- **Prompt**:
```
Flat illustration for app onboarding: Young fencer performing dynamic lunge attack with extended arm, motion speed lines behind, golden sparkles (#FFD700) at sword tip. Green skeleton overlay on body. Dark background, energetic and dynamic composition. 400x400 pixels.
```

---

## 6️⃣ 成就徽章 (Achievements) - P3 后期扩展

### badge_first_rep.png
- **尺寸**: 128x128
- **用途**: 成就 - 完成首次动作
- **文件路径**: `app/src/main/res/drawable-xxhdpi/badge_first_rep.png`
- **Prompt**:
```
Game achievement badge: Shield shape with number "1" in center and a small saber sword icon, bronze/copper metallic tones with subtle shine and bevel effect. Dark border, clean game UI style. 128x128 pixels, transparent background.
```

### badge_combo_5.png
- **尺寸**: 128x128
- **用途**: 成就 - 5连击
- **文件路径**: `app/src/main/res/drawable-xxhdpi/badge_combo_5.png`
- **Prompt**:
```
Game achievement badge: Hexagonal shape with "5x" text and "COMBO" below, silver metallic texture with neon green (#00FF00) glow effect around edges. Gaming achievement style, clean design. 128x128 pixels, transparent background.
```

### badge_combo_10.png
- **尺寸**: 128x128
- **用途**: 成就 - 10连击
- **文件路径**: `app/src/main/res/drawable-xxhdpi/badge_combo_10.png`
- **Prompt**:
```
Game achievement badge: Hexagonal shape with "10x" text, golden metallic texture with orange fire/flame effect around edges. Premium epic achievement look. "COMBO" text below number. 128x128 pixels, transparent background.
```

### badge_perfect_10.png
- **尺寸**: 128x128
- **用途**: 成就 - 累计10次完美动作
- **文件路径**: `app/src/main/res/drawable-xxhdpi/badge_perfect_10.png`
- **Prompt**:
```
Game achievement badge: Star-shaped medal with "10" in center and small star icon, surrounded by laurel wreath. Gold metallic with sparkle effects. Champion/master achievement look. 128x128 pixels, transparent background.
```

---

## 📋 生成优先级

| 优先级 | 图片 | 数量 | 原因 |
|--------|------|------|------|
| **P0 必须** | App 图标 (ic_launcher 系列) | 3 | 无图标无法发布应用 |
| **P0 必须** | banner.png | 1 | GitHub README 展示需要 |
| **P1 推荐** | feature_graphic.png, 截图 | 3 | Google Play Store 上架需要 |
| **P2 可选** | 空状态插图、引导页 | 5 | 提升用户体验 |
| **P3 后期** | 成就徽章 | 4 | 游戏化扩展功能 |

**总计**: 16 张图片

---

## 🎯 生成后文件放置

```
LittleFencer/
├── docs/
│   ├── banner.png                    # README 横幅
│   ├── feature_graphic.png           # Play Store 特色图
│   └── screenshots/
│       ├── screenshot_training.png
│       └── screenshot_gallery.png
└── app/src/main/res/
    ├── mipmap-xxxhdpi/
    │   ├── ic_launcher.png
    │   ├── ic_launcher_round.png
    │   └── ic_launcher_foreground.png
    └── drawable-xxhdpi/
        ├── empty_gallery.png
        ├── empty_perfect.png
        ├── onboard_1_setup.png
        ├── onboard_2_engarde.png
        ├── onboard_3_lunge.png
        ├── badge_first_rep.png
        ├── badge_combo_5.png
        ├── badge_combo_10.png
        └── badge_perfect_10.png
```

---

*文档更新时间: 2026-01-31*
