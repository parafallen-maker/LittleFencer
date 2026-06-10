# LittleFencer Web — MVP 缺陷与漏洞清单

> **更新日期：** 2026-06-10
> **来源：** 按原子功能逐行审查（核心检测管线 + 应用层/存储/安全），人工核实关键结论
> **状态标记：** ✅ 已修复（2026-06-10 技术债清理轮）｜🔴 P0 待修｜🟡 P1 待修｜🟢 P2 待修

## 1. 本轮已修复 ✅

| # | 功能 | 缺陷 | 修复方式 |
|---|------|------|---------|
| F1 | PWA 离线 | sw.js 缓存清单缺 `keyframeDetector.js`、`templateRecorder.js`，离线时模块加载失败 | 补全清单，CACHE_NAME 升级 v9 |
| F2 | PWA 更新 | 缓存优先策略导致文件更新永不生效，必须手动 bump 版本号 | 同源资源改为 stale-while-revalidate，版本号仅在清单增删时需要 bump（sw.js 顶部有说明） |
| F3 | 前进/后退检测 | **未考虑面向方向**：面向左侧时前进被判为后退、后退被判为前进（弓步检测器有 facing 处理，步法检测器没有） | 按肩部判定 forwardDir，动作开始时锁定方向（detectors/index.js） |
| F4 | 全部检测器 | 不校验关键点置信度，遮挡/模糊的手臂脚踝照常进入状态机 → 误报主因 | ActionDetectorManager 入口统一门控：12 个相关关节 visibility ≥ 0.5（config.js `DetectionGate`） |
| F5 | 全部检测器 | 阈值硬编码散落各构造函数，无法集中调优 | 新建 `js/config.js`，全部阈值集中（含单位注释） |
| F6 | 视频存储 | IndexedDB 无容量管理，长期使用必然触发配额超限 | 上限 50 条（收藏不删），超限自动删最旧；QuotaExceededError 时清 5 条重试一次（storage.js） |
| F7 | DTW | 模板库为空时静默跳过、无诊断 | 加一次性 console.warn（dtw.js） |
| F8 | 资产 | 12.7MB 未引用图片 + 4.3MB 未引用 banner + 18 个占位图标 | 已删除 |
| F9 | 资产 | 图片未压缩：内容图共 ~62MB PNG | 转 WebP（1024px/q80）共 312KB；图标缩至 512px；引用同步更新（ui.js / index.html / sw.js） |
| F10 | PWA manifest | 图标声明 512×512 实际 1024/2048；截图声明 1080×1920（竖版）实际 2816×1536（横版） | 图标缩至 512 与声明一致；截图缩至 1408×768 并修正声明 |
| F11 | 仓库卫生 | `test/` 下 32MB 测试视频未被代码引用 | 移至 `datasets/test_videos/`（datasets 为未跟踪实验区） |

## 2. 待修缺陷（按优先级）

### 🔴 P0 — 影响核心体验或会中断应用

| # | 功能 | 缺陷 | 位置 | 说明 |
|---|------|------|------|------|
| D1 | 主循环 | `handlePoseResults` 无 try-catch：engine/skeleton 单帧异常会反复抛错、表现为画面卡死无反馈 | app.js `handlePoseResults`（≈行 305） | training-mode.js 的对应路径仅 console.warn，同样不通知用户 |
| D2 | 检测仲裁 | 7 个检测器顺序遍历返回第一个命中，无优先级/互斥：复合动作（前进弓步）易被拆成两个单动作上报 | detectors/index.js `ActionDetectorManager.detect` | 建议：复合检测器优先 + 命中后短冷却抑制子动作 |
| D3 | 基线漂移 | Balestra/Flunge/ParryRiposte 的 baseline（髋部 Y、手腕 Y、手臂伸展）只在首帧取一次，人移动后基线失真 → 误报/漏报 | detectors/index.js 各 `baselineXxx` | 建议：IDLE 状态下用滑动平均持续刷新基线 |

### 🟡 P1 — 正确性/健壮性

| # | 功能 | 缺陷 | 位置 |
|---|------|------|------|
| D4 | 几何计算 | `calculateAngle` 关键点重合时 atan2(0,0) 返回不稳定结果；`calculateDistance` 不防 NaN，NaN 会沿管线传播 | utils.js |
| D5 | DTW | 特征提取 `bodyScale === 0` 仅防零不防 NaN；distance 略超阈值时 confidence 被钳到 0，边界动作一律被拒 | dtw.js 特征提取与匹配段 |
| D6 | 质量评分 | FIE 单帧评分（engine `getCurrentQuality`）与 DTW 序列置信度两套体系独立运行，可能给出矛盾结论（如 DTW "PERFECT" 但前膝超 FIE 范围） | engine.js |
| D7 | localStorage | 9 处 `JSON.parse` 无 try-catch（badges/settings/history/templates 等），存储被污染会让页面初始化直接崩溃 | ui.js:50、app.js:704、training-mode.js:142,173、templateRecorder.js:318 等 |
| D8 | 双页一致性 | index.html 与 training.html 各自实现一套训练逻辑：音效开关行为不一致、自动录制仅 index 有；同一逻辑两处维护必然漂移 | app.js vs training-mode.js |
| D9 | 生命周期 | `init()` 无重入保护；engine 回调在 stop 后不解绑，反复 start/stop 会重复触发；camera `stop()` 不清 `onloadedmetadata` | app.js、camera.js |
| D10 | 录制 | MediaRecorder 不支持时硬抛错无 UI 降级；录制中刷新页面 chunks 全丢且无 beforeunload 提醒 | recorder.js |
| D11 | 安全 | annotator 导入 JSON 仅 `JSON.parse` 无结构校验，恶意 action 字段可经 innerHTML 模板注入（当前唯一用户可控字符串进 innerHTML 的路径） | annotator.js 导入与列表渲染段 |
| D12 | 存储 | `updateVideo` 读-改-写无事务包裹，多标签页并发会互相覆盖（如同时 toggleStar） | storage.js |

### 🟢 P2 — 打磨项

| # | 功能 | 缺陷 | 位置 |
|---|------|------|------|
| D13 | 可见性门控 | `totalVisibility` 累计后未参与判定（死代码）；可见性分数仅按点数比例 | engine.js ≈行 275-303 |
| D14 | 过滤管线 | OneEuro 首帧后导数突变可产生 spike；OutlierRejector 用双肩距离做尺度但不校验双肩置信度 | filters.js |
| D15 | 检测器 | AdvanceLungeDetector 定义了 LUNGING/COMPLETE 相位但从未进入（死代码，实际靠内嵌 LungeDetector + 总超时） | detectors/index.js |
| D16 | 反馈 | TTS 队列只限长度不限时效，卡顿后会连播过期纠正；音量不可调（仅开关） | feedback.js |
| D17 | 平台检测 | Apple Silicon Mac 触屏判定可能误判为 iOS | platform.js |
| D18 | 存储 | DB_VERSION=1 无未来迁移路径；缩略图生成失败静默无提示 | storage.js |

## 3. 审查中已排除的误报 ❌

记录在案以免重复排查：

- ~~sw.js 缺 training.css / annotator.css~~ — 实际清单中已有（v8 即包含）
- ~~sw.js 非 GET 请求会挂起~~ — fetch 事件裸 `return` 是标准做法，浏览器走默认网络
- ~~全身检测仅单帧、无 10 帧确认~~ — `fullBodyFrameCount >= requiredFullBodyFrames(10)` 存在于 engine.js:349-356
- ~~DTW 模板库为空~~ — 实为程序合成的占位模板（lunge/advance/retreat 等），非空；真实问题是"合成模板未经真人数据校准"，属内容任务（录制工具已具备）

## 4. 验证缺口（固有限制）

所有检测逻辑的修复**未经真人摄像头实测**（需按 [acceptance_checklist.md](acceptance_checklist.md) 实地验收）。本清单中"已修复"指代码逻辑修复且通过语法/引用完整性检查；检测效果类改动（F3/F4）需实测确认无回归。
