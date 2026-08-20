"use strict";

const $ = (selector) => document.querySelector(selector);
const state = {
  image: null,
  imageName: "",
  tubes: [],
  selectedIndex: -1,
  selection: null,
  dragStart: null,
  dragging: false,
  imageDrawRect: null,
  regressions: null,
  zoom: 1,
};

const imageCanvas = $("#imageCanvas");
const imageCtx = imageCanvas.getContext("2d", { willReadFrequently: true });
const chartCanvas = $("#chartCanvas");
const chartCtx = chartCanvas.getContext("2d");

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function safeName(name) {
  return (name || "数码比色结果").replace(/[\\/:*?"<>|]+/g, "_").trim() || "数码比色结果";
}

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toString();
}

function tubeLabel(index, style) {
  if (style === "zero") return String(index);
  if (style === "letter") {
    let value = index + 1;
    let label = "";
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }
  if (style === "padded") return String(index + 1).padStart(2, "0");
  if (style === "tube") return `管${index + 1}`;
  if (style === "sample") return `S${index + 1}`;
  return String(index + 1);
}

function setWorkflow(step) {
  document.querySelectorAll(".step").forEach((el, index) => {
    el.classList.toggle("active", index < step);
  });
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择有效的图片文件");
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (state.image?.objectUrl) URL.revokeObjectURL(state.image.objectUrl);
    image.objectUrl = url;
    state.image = image;
    state.imageName = file.name;
    state.selection = null;
    state.zoom = 1;
    $("#uploadTitle").textContent = file.name;
    $("#uploadMeta").textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    $("#createTubesBtn").disabled = false;
    $("#canvasEmpty").classList.add("hidden");
    initializeImageCanvas();
    setWorkflow(1);
    showToast("图片已导入，请设置比色管数量和编号");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("图片读取失败，请换一张图片重试");
  };
  image.src = url;
}

function buildTubes() {
  if (!state.image) return showToast("请先导入图片");
  const count = Math.max(1, Math.min(200, Number.parseInt($("#tubeCount").value, 10) || 1));
  $("#tubeCount").value = count;
  const style = $("#numberStyle").value;
  state.tubes = Array.from({ length: count }, (_, index) => ({
    label: tubeLabel(index, style), type: "standard", concentration: "", dilution: "1", note: "", result: null,
  }));
  state.selectedIndex = 0;
  state.selection = null;
  state.regressions = null;
  $("#workspace").classList.remove("hidden");
  $("#analysisSection").classList.remove("hidden");
  $("#exportCsvBtn").disabled = false;
  renderTubeTable();
  updateSelectionBadge();
  updateAnalysis();
  drawImageCanvas();
  setWorkflow(3);
  setTimeout(() => $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function renderTubeTable() {
  const tbody = $("#tubeTableBody");
  tbody.innerHTML = "";
  state.tubes.forEach((tube, index) => {
    const row = document.createElement("tr");
    row.dataset.index = index;
    row.classList.toggle("selected", index === state.selectedIndex);
    const resultHtml = tube.result
      ? `<div class="color-result"><span class="result-swatch" style="background:rgb(${tube.result.r},${tube.result.g},${tube.result.b})"></span><span class="result-values"><b>${tube.result.r}, ${tube.result.g}, ${tube.result.b}</b><br>S ${tube.result.saturation.toFixed(2)}%<span class="absorbance-values" data-absorbance-index="${index}">${absorbanceHtml(tube)}</span><div class="predictions" data-prediction-index="${index}">${predictionHtml(tube)}</div></span></div>`
      : `<span class="pending">点击行后框选</span>`;
    const secondaryField = tube.type === "standard"
      ? `<div class="tube-secondary-field"><small>标准浓度</small><input class="concentration-input" inputmode="decimal" aria-label="${escapeHtml(tube.label)} 标准浓度" value="${escapeHtml(tube.concentration)}" placeholder="数值" /></div>`
      : tube.type === "unknown"
        ? `<div class="tube-secondary-field"><small>稀释倍数</small><input class="dilution-input" inputmode="decimal" aria-label="${escapeHtml(tube.label)} 稀释倍数" value="${escapeHtml(tube.dilution)}" placeholder="例如 10" /></div>`
        : `<div class="tube-secondary-field"><small>空白基准</small><span class="blank-reference">无需填写浓度</span></div>`;
    row.innerHTML = `
      <td><div class="tube-id-cell"><span class="tube-label">${escapeHtml(tube.label)}</span><select class="tube-type" aria-label="${escapeHtml(tube.label)} 类型"><option value="blank" ${tube.type === "blank" ? "selected" : ""}>空白管</option><option value="standard" ${tube.type === "standard" ? "selected" : ""}>标准曲线管</option><option value="unknown" ${tube.type === "unknown" ? "selected" : ""}>待测管</option></select></div></td>
      <td>${secondaryField}</td>
      <td><input class="note-input" aria-label="${escapeHtml(tube.label)} 备注" value="${escapeHtml(tube.note)}" placeholder="样本备注" /></td>
      <td>${resultHtml}</td>`;
    row.addEventListener("click", () => selectTube(index));
    row.querySelector(".tube-type").addEventListener("change", (event) => {
      const nextType = event.target.value;
      if (nextType === "blank") {
        const previousBlank = state.tubes.findIndex((item, itemIndex) => itemIndex !== index && item.type === "blank");
        if (previousBlank >= 0) {
          state.tubes[previousBlank].type = "standard";
          showToast(`空白管已从 ${state.tubes[previousBlank].label} 切换为 ${state.tubes[index].label}`);
        }
      }
      state.tubes[index].type = nextType;
      renderTubeTable(); selectTube(index); updateAnalysis();
    });
    row.querySelector(".concentration-input")?.addEventListener("input", (event) => {
      state.tubes[index].concentration = event.target.value; updateAnalysis();
    });
    row.querySelector(".dilution-input")?.addEventListener("input", (event) => {
      state.tubes[index].dilution = event.target.value; updatePredictionDisplays();
    });
    row.querySelector(".note-input").addEventListener("input", (event) => {
      state.tubes[index].note = event.target.value;
    });
    tbody.appendChild(row);
  });
  updateProgress();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function selectTube(index) {
  state.selectedIndex = index;
  document.querySelectorAll("#tubeTableBody tr").forEach((row, rowIndex) => row.classList.toggle("selected", rowIndex === index));
  updateSelectionBadge();
}

function updateSelectionBadge() {
  const tube = state.tubes[state.selectedIndex];
  $("#selectedTubeBadge").textContent = tube ? `当前：${tube.label}` : "未选择比色管";
}

function updateProgress() {
  const completed = state.tubes.filter((tube) => tube.result).length;
  $("#progressBadge").textContent = `${completed} / ${state.tubes.length} 已取色`;
  if (state.tubes.length && completed === state.tubes.length) setWorkflow(4);
}

function initializeImageCanvas() {
  if (!state.image) return;
  imageCanvas.width = state.image.naturalWidth;
  imageCanvas.height = state.image.naturalHeight;
  state.imageDrawRect = { x: 0, y: 0, width: imageCanvas.width, height: imageCanvas.height, scale: 1 };
  setZoom(1);
  drawImageCanvas();
}

function drawImageCanvas() {
  if (!state.image) return;
  imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  imageCtx.drawImage(state.image, 0, 0, imageCanvas.width, imageCanvas.height);
  if (state.selection) drawSelection(state.selection);
}

function setZoom(value, anchorEvent = null) {
  if (!state.image) return;
  const oldZoom = state.zoom || 1;
  const newZoom = Math.max(0.05, Math.min(8, value));
  const wrap = $("#canvasWrap");
  let sourceX = state.image.naturalWidth / 2, sourceY = state.image.naturalHeight / 2;
  let viewportX = wrap.clientWidth / 2, viewportY = wrap.clientHeight / 2;
  if (anchorEvent) {
    const canvasRect = imageCanvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    sourceX = (anchorEvent.clientX - canvasRect.left) / oldZoom;
    sourceY = (anchorEvent.clientY - canvasRect.top) / oldZoom;
    viewportX = anchorEvent.clientX - wrapRect.left;
    viewportY = anchorEvent.clientY - wrapRect.top;
  } else if (oldZoom) {
    sourceX = (wrap.scrollLeft + viewportX) / oldZoom;
    sourceY = (wrap.scrollTop + viewportY) / oldZoom;
  }
  state.zoom = newZoom;
  imageCanvas.style.width = `${state.image.naturalWidth * newZoom}px`;
  imageCanvas.style.height = `${state.image.naturalHeight * newZoom}px`;
  $("#zoomResetBtn").textContent = `${Math.round(newZoom * 100)}%`;
  requestAnimationFrame(() => {
    const canvasRect = imageCanvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    wrap.scrollLeft += canvasRect.left + sourceX * newZoom - wrapRect.left - viewportX;
    wrap.scrollTop += canvasRect.top + sourceY * newZoom - wrapRect.top - viewportY;
  });
}

function fitImageToWindow() {
  if (!state.image) return;
  const wrap = $("#canvasWrap");
  const fit = Math.min((wrap.clientWidth - 16) / state.image.naturalWidth, (wrap.clientHeight - 16) / state.image.naturalHeight);
  setZoom(Math.min(1, fit));
}

function drawSelection(rect) {
  imageCtx.save();
  imageCtx.fillStyle = "rgba(19, 124, 107, .14)";
  imageCtx.strokeStyle = "#15a68c";
  imageCtx.lineWidth = 2 / state.zoom;
  imageCtx.setLineDash([7 / state.zoom, 4 / state.zoom]);
  imageCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
  imageCtx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2));
  imageCtx.restore();
}

function pointerPosition(event) {
  const bounds = imageCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(imageCanvas.width, (event.clientX - bounds.left) * imageCanvas.width / bounds.width)),
    y: Math.max(0, Math.min(imageCanvas.height, (event.clientY - bounds.top) * imageCanvas.height / bounds.height)),
  };
}

function normalizedRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function beginSelection(event) {
  if (!state.image || state.selectedIndex < 0) return showToast("请先选择一个比色管条目");
  event.preventDefault();
  imageCanvas.setPointerCapture(event.pointerId);
  state.dragging = true;
  state.dragStart = pointerPosition(event);
  state.selection = null;
}

function moveSelection(event) {
  if (!state.dragging) return;
  const current = pointerPosition(event);
  state.selection = normalizedRect(state.dragStart, current);
  imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  imageCtx.drawImage(state.image, 0, 0, imageCanvas.width, imageCanvas.height);
  drawSelection(state.selection);
  $("#selectionSize").textContent = `选区 ${Math.round(state.selection.width)} × ${Math.round(state.selection.height)} px（预览）`;
}

function endSelection(event) {
  if (!state.dragging) return;
  state.dragging = false;
  if (imageCanvas.hasPointerCapture(event.pointerId)) imageCanvas.releasePointerCapture(event.pointerId);
  if (!state.selection || state.selection.width < 2 || state.selection.height < 2) {
    state.selection = null;
    drawImageCanvas();
    showToast("选区太小，请拖出一个矩形区域");
    return;
  }
  analyzeSelection(state.selection);
}

function analyzeSelection(displayRect) {
  const scaleX = state.image.naturalWidth / imageCanvas.width;
  const scaleY = state.image.naturalHeight / imageCanvas.height;
  const source = {
    x: Math.max(0, Math.floor(displayRect.x * scaleX)),
    y: Math.max(0, Math.floor(displayRect.y * scaleY)),
    width: Math.max(1, Math.min(state.image.naturalWidth, Math.ceil(displayRect.width * scaleX))),
    height: Math.max(1, Math.min(state.image.naturalHeight, Math.ceil(displayRect.height * scaleY))),
  };
  source.width = Math.min(source.width, state.image.naturalWidth - source.x);
  source.height = Math.min(source.height, state.image.naturalHeight - source.y);

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = source.width;
  sampleCanvas.height = source.height;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(state.image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
  const pixels = sampleCtx.getImageData(0, 0, source.width, source.height).data;
  let r = 0, g = 0, b = 0, saturation = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2];
    saturation += rgbToHslSaturation(pixels[i], pixels[i + 1], pixels[i + 2]);
    count += 1;
  }
  if (!count) return showToast("选区内没有可读取的像素");
  const result = {
    r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count),
    saturation: saturation / count, pixelCount: count,
    x: source.x, y: source.y, width: source.width, height: source.height,
  };
  state.tubes[state.selectedIndex].result = result;
  $("#liveSwatch").style.background = `rgb(${result.r},${result.g},${result.b})`;
  $("#liveRgb").textContent = `RGB ${result.r}, ${result.g}, ${result.b}`;
  $("#liveSaturation").textContent = `HSL 平均饱和度 ${result.saturation.toFixed(2)}%`;
  $("#selectionSize").textContent = `原图选区 ${source.width} × ${source.height} px`;
  renderTubeTable();
  selectTube(state.selectedIndex);
  updateAnalysis();
  showToast(`已将颜色结果写入 ${state.tubes[state.selectedIndex].label}`);
}

function rgbToHslSaturation(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  const chroma = max - min;
  return (chroma / (1 - Math.abs(2 * lightness - 1))) * 100;
}

function getBlankTube() {
  return state.tubes.find((tube) => tube.type === "blank") || null;
}

function absorbanceFor(tube, key) {
  const blank = getBlankTube();
  const value = tube?.result?.[key];
  const reference = blank?.result?.[key];
  if (!Number.isFinite(value) || !Number.isFinite(reference) || value <= 0 || reference <= 0) return null;
  return -Math.log10(value / reference);
}

function absorbanceHtml(tube) {
  if (!tube.result) return "";
  if (tube.type === "blank") return `空白基准 R₀ ${tube.result.r} · G₀ ${tube.result.g} · B₀ ${tube.result.b}`;
  const values = metrics.map((metric) => absorbanceFor(tube, metric.key));
  if (values.every((value) => value === null)) return getBlankTube()?.result ? "RGB 为 0，无法计算类吸光度" : "等待空白管取色";
  return metrics.map((metric, index) => `A${metric.name} ${values[index] === null ? "—" : formatNumber(values[index], 6)}`).join(" · ");
}

function validAnalysisRows(key) {
  return state.tubes
    .map((tube, index) => ({ ...tube, index, x: Number(tube.concentration), y: absorbanceFor(tube, key) }))
    .filter((tube) => tube.type === "standard" && tube.result && tube.concentration.trim() !== "" && Number.isFinite(tube.x) && Number.isFinite(tube.y));
}

function analysisSeries() {
  return Object.fromEntries(metrics.map((metric) => [metric.key, validAnalysisRows(metric.key).sort((a, b) => a.x - b.x)]));
}

function linearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return { slope: NaN, intercept: NaN, r2: NaN };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
  const ssResidual = points.reduce((sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTotal < 1e-12 ? (ssResidual < 1e-12 ? 1 : 0) : 1 - ssResidual / ssTotal;
  return { slope, intercept, r2 };
}

const metrics = [
  { key: "r", name: "R", color: "#d85555" },
  { key: "g", name: "G", color: "#218b72" },
  { key: "b", name: "B", color: "#3478c6" },
];

function predictTube(tube, key) {
  const fit = state.regressions?.[key];
  const dilution = Number(tube.dilution);
  if (tube.type !== "unknown" || !tube.result || !fit || !Number.isFinite(fit.slope) || Math.abs(fit.slope) < 1e-12 || !Number.isFinite(dilution) || dilution <= 0) return null;
  const absorbance = absorbanceFor(tube, key);
  if (!Number.isFinite(absorbance)) return null;
  const measured = (absorbance - fit.intercept) / fit.slope;
  return { absorbance, measured, corrected: measured * dilution, dilution };
}

function predictionHtml(tube) {
  if (tube.type !== "unknown") return "";
  if (!state.regressions) return "待标准曲线拟合后计算浓度";
  const values = metrics.map((metric) => ({ metric, value: predictTube(tube, metric.key) }));
  if (values.every(({ value }) => !value)) return "请输入有效稀释倍数";
  return values.map(({ metric, value }) => value
    ? `A${metric.name} 推算：<b>${formatNumber(value.corrected, 6)}</b> <span title="稀释后浓度 × 稀释倍数">（${formatNumber(value.measured, 6)} × ${formatNumber(value.dilution, 4)}）</span>`
    : `A${metric.name} 推算：—`).join("<br>");
}

function updatePredictionDisplays() {
  document.querySelectorAll("[data-absorbance-index]").forEach((element) => {
    const tube = state.tubes[Number(element.dataset.absorbanceIndex)];
    element.innerHTML = tube ? absorbanceHtml(tube) : "";
  });
  document.querySelectorAll("[data-prediction-index]").forEach((element) => {
    const tube = state.tubes[Number(element.dataset.predictionIndex)];
    element.innerHTML = tube ? predictionHtml(tube) : "";
  });
}

function updateAnalysis() {
  const notice = $("#analysisNotice");
  const blank = getBlankTube();
  if (!blank?.result) {
    state.regressions = null;
    notice.className = "notice";
    notice.textContent = blank ? "请先选中空白管并完成取色，以获得 R₀、G₀、B₀。" : "请先将一个条目设为空白管并完成取色。";
    $("#equationList").innerHTML = "";
    drawEmptyChart();
    updatePredictionDisplays();
    return;
  }
  const series = analysisSeries();
  state.regressions = Object.fromEntries(metrics.map((metric) => {
    const points = series[metric.key];
    const uniqueX = new Set(points.map((point) => point.x));
    return [metric.key, points.length >= 2 && uniqueX.size >= 2 ? { ...linearRegression(points), pointCount: points.length } : null];
  }));
  const validFits = metrics.filter((metric) => state.regressions[metric.key]);
  if (!validFits.length) {
    state.regressions = null;
    notice.className = "notice";
    notice.textContent = "空白管已就绪；还需要至少 2 个浓度不同、已完成取色的标准管。RGB 通道值必须大于 0。";
    $("#equationList").innerHTML = "";
    drawEmptyChart(); updatePredictionDisplays(); return;
  }
  notice.className = "notice success";
  const unknownCount = state.tubes.filter((tube) => tube.type === "unknown" && tube.result).length;
  notice.textContent = `空白基准 R₀/G₀/B₀ = ${blank.result.r}/${blank.result.g}/${blank.result.b}。拟合使用 x = 标准浓度、y = A通道；${unknownCount} 个已取色待测管正在反算浓度。`;
  $("#equationList").innerHTML = metrics.map((metric) => {
    const fit = state.regressions[metric.key];
    if (!fit) return `<article class="equation-card"><header><b>A${metric.name} 指标</b><span class="metric-dot" style="background:${metric.color}"></span></header><code>数据不足</code><p>需要至少两个有效标准点</p></article>`;
    const sign = fit.intercept >= 0 ? "+" : "−";
    return `<article class="equation-card"><header><b>A${metric.name} 指标</b><span class="metric-dot" style="background:${metric.color}"></span></header><code>A${metric.name} = ${formatNumber(fit.slope)}x ${sign} ${formatNumber(Math.abs(fit.intercept))}</code><p>R² = <b>${formatNumber(fit.r2, 6)}</b> · ${fit.pointCount} 点</p></article>`;
  }).join("");
  drawChart(series, state.regressions);
  updatePredictionDisplays();
}

function prepareChartCanvas() {
  const rect = chartCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(520, Math.round(rect.width || 800));
  const height = Math.max(340, Math.round(rect.height || 360));
  chartCanvas.width = width * dpr;
  chartCanvas.height = height * dpr;
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function drawEmptyChart() {
  if ($("#analysisSection").classList.contains("hidden")) return;
  const { width, height } = prepareChartCanvas();
  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = "#fafcfb"; chartCtx.fillRect(0, 0, width, height);
  chartCtx.fillStyle = "#87938f"; chartCtx.font = "14px Segoe UI, Microsoft YaHei"; chartCtx.textAlign = "center";
  chartCtx.fillText("完成空白管和至少两个标准管的取色后生成图表", width / 2, height / 2);
}

function drawChart(series, regressions) {
  const { width, height } = prepareChartCanvas();
  const pad = { left: 62, right: 22, top: 45, bottom: 55 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const allPoints = metrics.flatMap((metric) => series[metric.key]);
  let minX = Math.min(...allPoints.map((p) => p.x)), maxX = Math.max(...allPoints.map((p) => p.x));
  const xMargin = Math.max((maxX - minX) * .06, .01);
  minX -= xMargin; maxX += xMargin;
  const yValues = allPoints.map((p) => p.y);
  let minY = Math.min(...yValues), maxY = Math.max(...yValues);
  const yMargin = Math.max((maxY - minY) * .12, .02);
  minY -= yMargin; maxY += yMargin;
  if (maxY - minY < .04) maxY = minY + .04;
  const px = (x) => pad.left + (x - minX) / (maxX - minX) * plotW;
  const py = (y) => pad.top + (maxY - y) / (maxY - minY) * plotH;

  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = "#fff"; chartCtx.fillRect(0, 0, width, height);
  chartCtx.font = "11px Segoe UI, Microsoft YaHei";
  chartCtx.textAlign = "right"; chartCtx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const value = minY + (maxY - minY) * i / 5;
    const y = py(value);
    chartCtx.strokeStyle = "#e8eeec"; chartCtx.lineWidth = 1; chartCtx.setLineDash([]);
    chartCtx.beginPath(); chartCtx.moveTo(pad.left, y); chartCtx.lineTo(width - pad.right, y); chartCtx.stroke();
    chartCtx.fillStyle = "#71807c"; chartCtx.fillText(formatNumber(value, 4), pad.left - 9, y);
  }
  chartCtx.textAlign = "center"; chartCtx.textBaseline = "top";
  for (let i = 0; i <= 5; i++) {
    const value = minX + (maxX - minX) * i / 5;
    const x = px(value);
    chartCtx.fillStyle = "#71807c"; chartCtx.fillText(formatNumber(value, 3), x, height - pad.bottom + 10);
  }
  chartCtx.fillStyle = "#34423f"; chartCtx.font = "bold 12px Segoe UI, Microsoft YaHei";
  chartCtx.fillText("标准浓度", pad.left + plotW / 2, height - 19);
  chartCtx.save(); chartCtx.translate(17, pad.top + plotH / 2); chartCtx.rotate(-Math.PI / 2); chartCtx.fillText("类吸光度 A", 0, 0); chartCtx.restore();

  metrics.forEach((metric, metricIndex) => {
    const points = series[metric.key];
    const fit = regressions[metric.key];
    if (!fit || !points.length) return;
    chartCtx.strokeStyle = metric.color; chartCtx.fillStyle = metric.color; chartCtx.lineWidth = 2; chartCtx.setLineDash([]);
    chartCtx.beginPath();
    points.forEach((point, index) => { const x = px(point.x), y = py(point.y); index ? chartCtx.lineTo(x, y) : chartCtx.moveTo(x, y); });
    chartCtx.stroke();
    points.forEach((point) => {
      const x = px(point.x), y = py(point.y);
      chartCtx.beginPath(); chartCtx.arc(x, y, 4.2, 0, Math.PI * 2); chartCtx.fill();
      chartCtx.strokeStyle = "white"; chartCtx.lineWidth = 1.5; chartCtx.stroke(); chartCtx.strokeStyle = metric.color;
    });
    chartCtx.strokeStyle = metric.color; chartCtx.globalAlpha = .7; chartCtx.lineWidth = 1.5; chartCtx.setLineDash([7, 5]);
    chartCtx.beginPath(); chartCtx.moveTo(px(minX), py(fit.slope * minX + fit.intercept)); chartCtx.lineTo(px(maxX), py(fit.slope * maxX + fit.intercept)); chartCtx.stroke();
    chartCtx.globalAlpha = 1; chartCtx.setLineDash([]);
    const legendX = pad.left + metricIndex * 94;
    chartCtx.fillStyle = metric.color; chartCtx.fillRect(legendX, 17, 18, 3);
    chartCtx.fillStyle = "#34423f"; chartCtx.font = "12px Segoe UI, Microsoft YaHei"; chartCtx.textAlign = "left"; chartCtx.textBaseline = "middle"; chartCtx.fillText(`A${metric.name} 数据`, legendX + 25, 18);
  });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  if (!state.tubes.length) return showToast("当前没有可导出的比色管数据");
  updateAnalysis();
  const rows = [
    ["项目名称", $("#projectName").value],
    ["图片文件", state.imageName],
    ["导出时间", new Date().toLocaleString("zh-CN")],
    ["计算方法", "A通道 = -log10(样本通道值 / 空白管通道值)；仅标准管的 A通道 参与线性拟合"],
    [],
    ["原始数据"],
    ["编号", "类型", "标准浓度", "稀释倍数", "备注", "平均R", "平均G", "平均B", "HSL平均饱和度(%)", "A_R", "A_G", "A_B", "A_R推算稀释后浓度", "A_R推算原液浓度", "A_G推算稀释后浓度", "A_G推算原液浓度", "A_B推算稀释后浓度", "A_B推算原液浓度", "有效像素数", "选区X(px)", "选区Y(px)", "选区宽(px)", "选区高(px)"],
  ];
  state.tubes.forEach((tube) => {
    const predictions = Object.fromEntries(metrics.map((metric) => [metric.key, predictTube(tube, metric.key)]));
    const absorbances = Object.fromEntries(metrics.map((metric) => [metric.key, absorbanceFor(tube, metric.key)]));
    const typeName = tube.type === "blank" ? "空白管" : tube.type === "standard" ? "标准曲线管" : "待测管";
    rows.push([
      tube.label, typeName, tube.type === "standard" ? tube.concentration : "", tube.type === "unknown" ? tube.dilution : "", tube.note,
      tube.result?.r ?? "", tube.result?.g ?? "", tube.result?.b ?? "", tube.result ? tube.result.saturation.toFixed(4) : "",
      absorbances.r !== null ? absorbances.r.toFixed(8) : "", absorbances.g !== null ? absorbances.g.toFixed(8) : "", absorbances.b !== null ? absorbances.b.toFixed(8) : "",
      predictions.r ? predictions.r.measured.toFixed(8) : "", predictions.r ? predictions.r.corrected.toFixed(8) : "",
      predictions.g ? predictions.g.measured.toFixed(8) : "", predictions.g ? predictions.g.corrected.toFixed(8) : "",
      predictions.b ? predictions.b.measured.toFixed(8) : "", predictions.b ? predictions.b.corrected.toFixed(8) : "",
      tube.result?.pixelCount ?? "", tube.result?.x ?? "", tube.result?.y ?? "", tube.result?.width ?? "", tube.result?.height ?? "",
    ]);
  });
  rows.push([], ["空白校正类吸光度线性预测方程（x=标准浓度，y=A通道；空白管和待测管不参与拟合）"], ["指标", "斜率", "截距", "预测方程", "反算公式", "R²", "有效标准管数"]);
  metrics.forEach((metric) => {
    const fit = state.regressions?.[metric.key];
    const pointCount = validAnalysisRows(metric.key).length;
    if (fit) rows.push([`A_${metric.name}`, fit.slope.toFixed(8), fit.intercept.toFixed(8), `A_${metric.name} = ${fit.slope.toFixed(8)}x ${fit.intercept >= 0 ? "+" : "-"} ${Math.abs(fit.intercept).toFixed(8)}`, `x = (A_${metric.name} - ${fit.intercept.toFixed(8)}) / ${fit.slope.toFixed(8)}`, fit.r2.toFixed(8), pointCount]);
    else rows.push([`A_${metric.name}`, "", "", "数据不足，无法拟合", "", "", pointCount]);
  });
  rows.push([], ["图表说明", "带数据点的折线图显示在应用中，可使用“导出图表 PNG”单独保存。CSV 格式本身无法嵌入图表。"]);
  const csv = "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeName($("#projectName").value)}_${dateStamp()}.csv`);
  showToast("CSV 已导出");
}

function exportChart() {
  const series = analysisSeries();
  if (!state.regressions || !metrics.some((metric) => state.regressions[metric.key])) return showToast("有效数据不足，暂时不能导出图表");
  drawChart(series, state.regressions);
  chartCanvas.toBlob((blob) => {
    if (!blob) return showToast("图表生成失败");
    downloadBlob(blob, `${safeName($("#projectName").value)}_标准曲线_${dateStamp()}.png`);
    showToast("图表 PNG 已导出");
  }, "image/png");
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetProject() {
  if (state.tubes.some((tube) => tube.result) && !window.confirm("新建项目会清除当前未导出的数据，确定继续吗？")) return;
  if (state.image?.objectUrl) URL.revokeObjectURL(state.image.objectUrl);
  Object.assign(state, { image: null, imageName: "", tubes: [], selectedIndex: -1, selection: null, dragStart: null, dragging: false, imageDrawRect: null, regressions: null, zoom: 1 });
  $("#imageInput").value = ""; $("#uploadTitle").textContent = "点击或拖入实验图片"; $("#uploadMeta").textContent = "支持 JPG、PNG、WebP";
  $("#createTubesBtn").disabled = true; $("#exportCsvBtn").disabled = true;
  $("#workspace").classList.add("hidden"); $("#analysisSection").classList.add("hidden"); $("#canvasEmpty").classList.remove("hidden");
  imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height); setWorkflow(1);
}

$("#imageInput").addEventListener("change", (event) => loadImageFile(event.target.files[0]));
$("#uploadZone").addEventListener("dragover", (event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); });
$("#uploadZone").addEventListener("dragleave", (event) => event.currentTarget.classList.remove("dragging"));
$("#uploadZone").addEventListener("drop", (event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); loadImageFile(event.dataTransfer.files[0]); });
$("#createTubesBtn").addEventListener("click", buildTubes);
$("#newProjectBtn").addEventListener("click", resetProject);
$("#exportCsvBtn").addEventListener("click", exportCsv);
$("#exportChartBtn").addEventListener("click", exportChart);
$("#refreshAnalysisBtn").addEventListener("click", () => { updateAnalysis(); showToast("分析结果已更新"); });
$("#clearSelectionBtn").addEventListener("click", () => { state.selection = null; drawImageCanvas(); $("#selectionSize").textContent = "选区 —"; });
$("#zoomOutBtn").addEventListener("click", () => setZoom(state.zoom / 1.25));
$("#zoomInBtn").addEventListener("click", () => setZoom(state.zoom * 1.25));
$("#zoomResetBtn").addEventListener("click", () => setZoom(1));
$("#zoomFitBtn").addEventListener("click", fitImageToWindow);
$("#canvasWrap").addEventListener("wheel", (event) => {
  if (!state.image || !event.ctrlKey) return;
  event.preventDefault();
  setZoom(state.zoom * Math.exp(-event.deltaY * 0.008), event);
}, { passive: false });
imageCanvas.addEventListener("pointerdown", beginSelection);
imageCanvas.addEventListener("pointermove", moveSelection);
imageCanvas.addEventListener("pointerup", endSelection);
imageCanvas.addEventListener("pointercancel", endSelection);
window.addEventListener("resize", () => { if (!$("#analysisSection").classList.contains("hidden")) updateAnalysis(); });

