/**
 * Offline detection evaluation harness
 *
 * Plays an annotated video through the full detection pipeline
 * (MediaPipe → filters → FencingStateEngine → detectors) and aligns the
 * detected action sequence against human annotations, producing
 * per-action precision/recall plus a false-positive/negative listing.
 *
 * Detector state machines use wall-clock time, so the video MUST play at
 * 1x — playbackRate is forced and frames are processed live, exactly as
 * the camera path does.
 */

import { FencingStateEngine } from './engine.js';
import { ActionDisplayNames } from './detectors/index.js';
import {
    DetectorConfig, DetectionGate, ArbitrationConfig, BaselineConfig
} from './config.js';

// ---------------------------------------------------------------------------
// Pure logic (exported for headless testing)
// ---------------------------------------------------------------------------

/**
 * Normalize an annotator.html export into [{action, start_s, end_s}].
 * Prefers start_time_ms/end_time_ms, falls back to frame/fps.
 */
export function normalizeAnnotations(data) {
    if (!data || !Array.isArray(data.annotations)) {
        throw new Error('标注 JSON 缺少 annotations 数组');
    }
    const fps = Number(data.fps) || 30;
    return data.annotations.map(a => ({
        action: String(a.action),
        start_s: a.start_time_ms !== undefined
            ? Number(a.start_time_ms) / 1000
            : Number(a.start_frame) / fps,
        end_s: a.end_time_ms !== undefined
            ? Number(a.end_time_ms) / 1000
            : Number(a.end_frame) / fps
    })).filter(a => isFinite(a.start_s) && isFinite(a.end_s));
}

/**
 * Greedy alignment of detections against annotated intervals.
 *
 * A detection {action, t} matches an unmatched annotation of the SAME
 * action when t ∈ [start_s - tol, end_s + tol]; among candidates the
 * closest interval wins. Detectors report at action completion, so the
 * window is symmetric around the whole interval rather than its start.
 *
 * @returns {{perAction, totals, falsePositives, falseNegatives, matches}}
 */
export function matchDetections(detections, annotations, toleranceS = 0.8) {
    const matchedAnn = new Set();
    const matches = [];
    const falsePositives = [];

    const sorted = [...detections].sort((a, b) => a.t - b.t);

    for (const det of sorted) {
        let best = -1;
        let bestDist = Infinity;
        annotations.forEach((ann, i) => {
            if (matchedAnn.has(i) || ann.action !== det.action) return;
            if (det.t < ann.start_s - toleranceS || det.t > ann.end_s + toleranceS) return;
            // Distance 0 inside the interval, else gap to nearest edge
            const dist = det.t < ann.start_s ? ann.start_s - det.t
                : det.t > ann.end_s ? det.t - ann.end_s : 0;
            if (dist < bestDist) { bestDist = dist; best = i; }
        });

        if (best >= 0) {
            matchedAnn.add(best);
            matches.push({ detection: det, annotation: annotations[best] });
        } else {
            falsePositives.push(det);
        }
    }

    const falseNegatives = annotations.filter((_, i) => !matchedAnn.has(i));

    // Per-action tallies over the union of seen actions
    const actions = new Set([
        ...annotations.map(a => a.action),
        ...detections.map(d => d.action)
    ]);
    const perAction = {};
    for (const action of actions) {
        const tp = matches.filter(m => m.annotation.action === action).length;
        const fp = falsePositives.filter(d => d.action === action).length;
        const fn = falseNegatives.filter(a => a.action === action).length;
        perAction[action] = { tp, fp, fn, ...rates(tp, fp, fn) };
    }

    const tp = matches.length;
    const fp = falsePositives.length;
    const fn = falseNegatives.length;
    const totals = { tp, fp, fn, ...rates(tp, fp, fn) };

    return { perAction, totals, falsePositives, falseNegatives, matches };
}

function rates(tp, fp, fn) {
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0
        ? 2 * precision * recall / (precision + recall) : null;
    return { precision, recall, f1 };
}

/**
 * Deep-merge overrides into the live config objects. Property assignment
 * only (never replacing object references) — detectors hold references to
 * the nested config objects, so replacing them would silently disconnect
 * the override from the running pipeline.
 */
export function applyConfigOverrides(overrides) {
    if (!overrides || typeof overrides !== 'object') return;
    const targets = {
        detectors: DetectorConfig,
        gate: DetectionGate,
        arbitration: ArbitrationConfig,
        baseline: BaselineConfig
    };
    for (const [section, target] of Object.entries(targets)) {
        if (overrides[section]) deepAssign(target, overrides[section]);
    }
}

function deepAssign(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value) &&
            target[key] && typeof target[key] === 'object') {
            deepAssign(target[key], value);
        } else {
            target[key] = value;
        }
    }
}

export function snapshotConfig() {
    return JSON.parse(JSON.stringify({
        detectors: DetectorConfig,
        gate: DetectionGate,
        arbitration: ArbitrationConfig,
        baseline: BaselineConfig
    }));
}

// ---------------------------------------------------------------------------
// Browser harness (skipped when imported headlessly for testing)
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined' && document.getElementById('btn-run')) {
    const ui = {
        videoFile: document.getElementById('video-file'),
        annotationFile: document.getElementById('annotation-file'),
        tolerance: document.getElementById('tolerance'),
        overrides: document.getElementById('config-overrides'),
        btnRun: document.getElementById('btn-run'),
        btnDownload: document.getElementById('btn-download'),
        status: document.getElementById('status'),
        log: document.getElementById('live-log'),
        video: document.getElementById('video'),
        resultsPanel: document.getElementById('results-panel'),
        resultsSummary: document.getElementById('results-summary'),
        resultsTable: document.getElementById('results-table'),
        fpList: document.getElementById('fp-list'),
        fnList: document.getElementById('fn-list')
    };

    let annotationData = null;
    let lastReport = null;

    function log(msg) {
        ui.log.textContent += msg + '\n';
        ui.log.scrollTop = ui.log.scrollHeight;
    }

    function setStatus(msg) { ui.status.textContent = msg; }

    function updateRunnable() {
        ui.btnRun.disabled = !(ui.videoFile.files[0] && annotationData);
    }

    ui.videoFile.addEventListener('change', () => {
        const file = ui.videoFile.files[0];
        if (file) {
            ui.video.src = URL.createObjectURL(file);
            log(`📹 视频: ${file.name}`);
        }
        updateRunnable();
    });

    ui.annotationFile.addEventListener('change', async () => {
        annotationData = null;
        const file = ui.annotationFile.files[0];
        if (file) {
            try {
                annotationData = JSON.parse(await file.text());
                const n = normalizeAnnotations(annotationData).length;
                log(`📋 标注: ${file.name}（${n} 个动作区间）`);
            } catch (e) {
                log(`❌ 标注解析失败: ${e.message}`);
                alert('标注 JSON 解析失败: ' + e.message);
            }
        }
        updateRunnable();
    });

    ui.btnRun.addEventListener('click', () => runEvaluation().catch(e => {
        console.error(e);
        setStatus('❌ ' + e.message);
        ui.btnRun.disabled = false;
    }));

    ui.btnDownload.addEventListener('click', () => {
        if (!lastReport) return;
        const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `eval_${(ui.videoFile.files[0]?.name || 'video').replace(/\.[^.]+$/, '')}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    async function runEvaluation() {
        ui.btnRun.disabled = true;
        ui.btnDownload.disabled = true;
        ui.log.textContent = '';

        // 1. Apply config overrides (live objects — affects the pipeline)
        let overrides = null;
        const overrideText = ui.overrides.value.trim();
        if (overrideText) {
            overrides = JSON.parse(overrideText);
            applyConfigOverrides(overrides);
            log('⚙️ 参数覆盖已应用: ' + JSON.stringify(overrides));
        }

        const annotations = normalizeAnnotations(annotationData);
        const toleranceS = Number(ui.tolerance.value) || 0.8;

        // 2. Build the real pipeline
        setStatus('加载 MediaPipe 模型…');
        const pose = new Pose({
            locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
        });
        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        const engine = new FencingStateEngine();
        engine.skipFullBodyCheck = true; // recorded footage rarely keeps full body in frame

        const detections = [];
        engine.onActionDetected = (action, quality) => {
            const t = ui.video.currentTime;
            detections.push({ action, quality, t: Math.round(t * 1000) / 1000 });
            log(`  ⚔️ ${t.toFixed(2)}s  ${ActionDisplayNames[action] || action} (${quality})`);
        };

        pose.onResults((results) => {
            try {
                if (results.poseLandmarks) {
                    engine.processPose(results.poseLandmarks, results.poseWorldLandmarks);
                } else {
                    engine.handleNoPose();
                }
            } catch (e) {
                console.error('[Eval] frame error:', e);
            }
            processingFrame = false;
        });

        await pose.initialize();
        log('✓ MediaPipe 就绪');

        // 3. Play the video at 1x and stream frames through the pipeline
        const video = ui.video;
        video.playbackRate = 1; // wall-clock state machines require real-time
        video.loop = false;
        video.currentTime = 0;

        let processingFrame = false;
        let running = true;

        const ended = new Promise(resolve => {
            video.onended = () => { running = false; resolve(); };
        });

        function pump() {
            if (!running) return;
            if (!processingFrame && video.readyState >= 2 && !video.paused) {
                processingFrame = true;
                pose.send({ image: video }).catch(() => { processingFrame = false; });
            }
            setStatus(`评测中… ${video.currentTime.toFixed(1)} / ${video.duration.toFixed(1)}s（已检出 ${detections.length}）`);
            requestAnimationFrame(pump);
        }

        await video.play();
        pump();
        await ended;

        // 4. Align & report
        const result = matchDetections(detections, annotations, toleranceS);
        lastReport = {
            generated_at: new Date().toISOString(),
            video: ui.videoFile.files[0]?.name || null,
            annotation_file: ui.annotationFile.files[0]?.name || null,
            annotation_count: annotations.length,
            tolerance_s: toleranceS,
            config_overrides: overrides,
            effective_config: snapshotConfig(),
            totals: result.totals,
            per_action: result.perAction,
            false_positives: result.falsePositives,
            false_negatives: result.falseNegatives,
            detections
        };

        renderResults(result, annotations.length);
        setStatus(`✅ 完成：P=${fmt(result.totals.precision)} R=${fmt(result.totals.recall)} F1=${fmt(result.totals.f1)}`);
        ui.btnRun.disabled = false;
        ui.btnDownload.disabled = false;
    }

    function fmt(v) { return v === null ? '—' : (v * 100).toFixed(1) + '%'; }

    function renderResults(result, annCount) {
        ui.resultsPanel.style.display = '';
        const t = result.totals;
        ui.resultsSummary.innerHTML =
            `共 ${annCount} 个标注区间 · TP=${t.tp} FP=${t.fp} FN=${t.fn} · ` +
            `查准 <b>${fmt(t.precision)}</b> · 查全 <b>${fmt(t.recall)}</b> · F1 <b>${fmt(t.f1)}</b>`;

        const rows = Object.entries(result.perAction).map(([action, s]) => `
            <tr>
                <td>${ActionDisplayNames[action] || action}</td>
                <td>${s.tp}</td><td class="${s.fp ? 'bad' : ''}">${s.fp}</td>
                <td class="${s.fn ? 'bad' : ''}">${s.fn}</td>
                <td>${fmt(s.precision)}</td><td>${fmt(s.recall)}</td><td>${fmt(s.f1)}</td>
            </tr>`).join('');
        ui.resultsTable.innerHTML = `
            <table>
                <tr><th>动作</th><th>TP</th><th>FP</th><th>FN</th><th>查准</th><th>查全</th><th>F1</th></tr>
                ${rows}
            </table>`;

        ui.fpList.textContent = result.falsePositives.length
            ? result.falsePositives.map(d =>
                `${d.t.toFixed(2)}s  ${ActionDisplayNames[d.action] || d.action} (${d.quality})`).join('\n')
            : '无';
        ui.fnList.textContent = result.falseNegatives.length
            ? result.falseNegatives.map(a =>
                `${a.start_s.toFixed(2)}–${a.end_s.toFixed(2)}s  ${ActionDisplayNames[a.action] || a.action}`).join('\n')
            : '无';
    }
}
