# LittleFencer ⚔️

**青少年佩剑训练助手** - AI-Powered Fencing Training Assistant for Youth

<p align="center">
  <img src="docs/banner.png" alt="LittleFencer Banner" width="600">
</p>

[![Web](https://img.shields.io/badge/Web-PWA-purple.svg)](/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📖 简介

LittleFencer 是一款基于 AI 姿态识别的青少年佩剑（Saber）训练辅助应用（Web PWA）。通过设备摄像头实时分析训练者的动作姿态，提供即时的语音和视觉反馈，帮助青少年击剑爱好者在家中进行科学、有效的基础动作训练。

- **零安装** — 浏览器打开即用，支持添加到主屏幕、离线使用
- **零云端** — 所有数据（视频、成绩）存储在本地 IndexedDB，无隐私风险

> 历史版本曾包含 Android / iOS / 微信小程序实现，现已归档（见 `归档.zip` 及 git 历史），当前仅维护 Web 版。

### ✨ 核心特性

- **🪞 智能数字镜子** - 实时骨骼叠加层，绿色表示正确姿势，红色提示需要纠正
- **🎯 AI 姿态分析** - MediaPipe Pose 33 关键点 + 3 级信号过滤管线
- **⚔️ 7 种动作识别** - 前进步、后退步、弓步、前进弓步、跳步弓步、飞弓步、格挡反攻
- **🧠 DTW 模板匹配** - 动态时间规整对比标准动作模板，关键帧触发优化性能
- **🗣️ 语音教练** - 中文 TTS 即时纠正，如"手臂先动！"、"后腿伸直！"
- **📹 训练回放** - MediaRecorder 录制 + IndexedDB 本地视频库
- **🔥 连击与成就** - Combo 计数器 + 4 枚成就徽章激励持续标准动作

## 🚀 快速开始

```bash
cd LittleFencer-Web

# 启动本地服务器
./serve.sh
# 或
python3 -m http.server 8080

# 浏览器访问
open http://localhost:8080
```

手机使用：确保手机与电脑在同一 WiFi，访问终端显示的局域网地址，点击"添加到主屏幕"即可像 App 一样使用。

> 💡 详细开发说明（HTTPS 配置、调试日志等）见 [LittleFencer-Web/README.md](LittleFencer-Web/README.md)

## 📱 使用指南

1. **站位** - 将设备放置在身前 2-3 米处，横屏，确保全身入镜
2. **准备** - 系统检测到全身（9 关键点 × 连续 10 帧）后，摆出 En Garde 预备姿势
3. **训练** - 执行弓步等动作，系统自动检测、评分（完美/良好/可接受/需改进）
4. **回看** - 训练视频保存在本地视频库，可回放和分享

## 📸 截图

<p align="center">
  <img src="docs/screenshots/screenshot_training.png" alt="训练界面" width="45%">
  <img src="docs/screenshots/screenshot_gallery.png" alt="视频库" width="45%">
</p>

## 🎯 检测指标（FIE 标准）

| 指标 | 标准范围 | 语音反馈 |
|------|----------|------|
| 前膝角度（弓步） | 85° - 100° | "前膝再弯！" |
| 后腿伸直 | > 160° | "后腿伸直！" |
| 手臂先于腿 | 伸展 ≥ 90% | "手臂先动！" |
| 躯干前倾（En Garde） | ≤ 12° | "保持直立！" |
| 步距 | 0.9 - 1.3× 肩宽 | "步距调整！" |

## 📚 相关文档

- [产品需求文档（PRD）](docs/prd.md)
- [架构与实现（含固化技术路线）](docs/architecture.md)
- [MVP 缺陷与漏洞清单](docs/mvp-defects.md)
- [功能路线图](docs/roadmap.md)
- [验收测试清单](docs/acceptance_checklist.md)
- [Web 项目说明](LittleFencer-Web/README.md)

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [MediaPipe](https://developers.google.com/mediapipe) - Google 的跨平台 ML 框架
- 所有击剑教练和青少年运动员的反馈

---

<p align="center">
  Made with ❤️ for young fencers
</p>
