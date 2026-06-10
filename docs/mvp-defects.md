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

## 2. 第二轮修复（2026-06-10，P0+P1 全部完成）✅

### 🔴 P0（3/3 已修）

| # | 功能 | 缺陷 | 修复方式 |
|---|------|------|---------|
| D1 | 主循环 | `handlePoseResults` 无 try-catch，单帧异常表现为画面卡死无反馈 | 两个页面均加帧级 try-catch：首次异常提示用户并继续；连续 90 帧（~3s）异常则停止会话并提示刷新 |
| D2 | 检测仲裁 | 7 检测器顺序遍历无优先级/互斥，复合动作被拆报 | 复合检测器优先排序 + 命中后 `resetAll()` 清空所有在途状态 + 600ms 全局冷却（`config.ArbitrationConfig`） |
| D3 | 基线漂移 | 4 个检测器 baseline 只取首帧，移动后失真 | IDLE 态以 EMA（α=0.05，~1s 收敛）持续刷新基线（`config.BaselineConfig`） |

### 🟡 P1（9/9 已修）

| # | 功能 | 修复方式 |
|---|------|---------|
| D4 | 几何计算 | `calculateAngle`/`calculateDistance` 对缺失/NaN/重合点返回 NaN（阈值比较 fail-closed） |
| D5 | DTW | bodyScale 防 NaN（`isFinite` 校验）；confidence 边界钳零行为确认为设计预期，保留 |
| D6 | 质量评分双体系 | 按技术路线 R3 落地：**DTW 不再独立播报**（之前规则与 DTW 双通路各自报动作，是实测"检测混乱"直接来源），改为仅记录到 `engine.lastDTWMatch` 供校准 |
| D7 | localStorage | 新增 `utils.safeJsonParse`；修复 ui.js / app.js 两处真实未防护点（其余 4 处复核后确认已有 try-catch，见误报清单） |
| D8 | 双页一致性 | app.js `toggleSound` 改为主静音语义（两通道同值），不再与 training 页独立开关矛盾；双页合并仍按 R9 留待 MVP 后 |
| D9 | 生命周期 | `init()` 加重入保护；camera `stop()` 清空 `onloadedmetadata`/`onerror`（"回调堆积"经复核为误报：均为单次赋值） |
| D10 | 录制 | MediaRecorder 不支持时优雅降级（返回 false、不抛错、UI 不进入录制态）；录制中加 `beforeunload` 离开提醒 |
| D11 | 标注安全 | 导入骨骼 JSON 增加结构校验（必须含 `skeleton_sequence` 数组）；列表渲染处数值强转 + 动作名白名单兜底 |
| D12 | 存储并发 | `updateVideo`/`toggleStar` 改为单事务内读-改-写，支持函数式更新 |

### 本轮额外发现并修复

| # | 功能 | 缺陷 | 修复方式 |
|---|------|------|---------|
| D19 | 检测播报 | 引擎同动作去抖窗口 2000ms 过长：快速连续步法（验收项 3.6 的连续 3 个前进步）会被吞掉 → 漏报 | 降至 800ms（manager 已有 600ms 全局冷却兜底） |

## 3. 待修缺陷

### 🟢 P2 — 打磨项

| # | 功能 | 缺陷 | 位置 |
|---|------|------|------|
| D13 | 可见性门控 | `totalVisibility` 累计后未参与判定（死代码）；可见性分数仅按点数比例 | engine.js ≈行 275-303 |
| D14 | 过滤管线 | OneEuro 首帧后导数突变可产生 spike；OutlierRejector 用双肩距离做尺度但不校验双肩置信度 | filters.js |
| D15 | 检测器 | AdvanceLungeDetector 定义了 LUNGING/COMPLETE 相位但从未进入（死代码，实际靠内嵌 LungeDetector + 总超时） | detectors/index.js |
| D16 | 反馈 | TTS 队列只限长度不限时效，卡顿后会连播过期纠正；音量不可调（仅开关） | feedback.js |
| D17 | 平台检测 | Apple Silicon Mac 触屏判定可能误判为 iOS | platform.js |
| D18 | 存储 | DB_VERSION=1 无未来迁移路径；缩略图生成失败静默无提示 | storage.js |

## 4. 审查中已排除的误报 ❌

记录在案以免重复排查：

- ~~sw.js 缺 training.css / annotator.css~~ — 实际清单中已有（v8 即包含）
- ~~sw.js 非 GET 请求会挂起~~ — fetch 事件裸 `return` 是标准做法，浏览器走默认网络
- ~~全身检测仅单帧、无 10 帧确认~~ — `fullBodyFrameCount >= requiredFullBodyFrames(10)` 存在于 engine.js:349-356
- ~~DTW 模板库为空~~ — 实为程序合成的占位模板（lunge/advance/retreat 等），非空；真实问题是"合成模板未经真人数据校准"，属内容任务（录制工具已具备）
- ~~training-mode.js / templateRecorder.js / annotator.js 的 JSON.parse 无保护~~ — 复核确认均已有 try-catch，仅 ui.js:50 与 app.js loadSettings 两处真实存在
- ~~engine 回调反复 start/stop 会堆积重复触发~~ — 回调为单次属性赋值（`engine.onXxx = fn`），不会堆积

## 5. 验证缺口（固有限制）

所有检测逻辑的修复**未经真人摄像头实测**（需按 [acceptance_checklist.md](acceptance_checklist.md) 实地验收）。本清单中"已修复"指代码逻辑修复且通过语法/引用完整性检查与无头浏览器冒烟；检测效果类改动（F3/F4、D2/D3/D6/D19）需实测确认无回归。
