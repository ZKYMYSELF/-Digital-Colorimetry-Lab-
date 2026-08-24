# 数码比色实验室 / Digital Colorimetry Lab

一个完全在浏览器本地运行的数码比色工具。通过图片框选获取比色管的平均 RGB，以空白管进行校正，计算三个颜色通道的类吸光度，建立标准曲线并反算待测液浓度。

A browser-based digital colorimetry tool that measures average RGB values from selected image regions, applies blank-tube correction, calculates absorbance-like values for three color channels, builds calibration curves, and estimates unknown sample concentrations.

> GitHub repository: `ZKYMYSELF/-Digital-Colorimetry-Lab-`

## 在线使用 / Live Demo

发布 GitHub Pages 后，可通过以下地址访问：

After GitHub Pages is enabled, the application will be available at:

```text
https://zkymyself.github.io/-Digital-Colorimetry-Lab-/
```

---

## 中文说明

### 主要功能

- 导入 JPG、PNG、WebP 等实验图片。
- 自定义比色管数量和编号样式。
- 将条目设置为空白管、标准曲线管或待测管。
- 支持图片原始像素显示、触控板双指平移和捏合缩放。
- 在图片中框选区域，计算平均 RGB、HSL 平均饱和度和有效像素数。
- 使用空白管 RGB 计算 `A_R`、`A_G`、`A_B` 三个类吸光度指标。
- 分别建立三条线性标准曲线并计算 R²。
- 根据三个指标分别反算待测液浓度。
- 根据稀释倍数自动换算待测液原液浓度。
- 导出包含原始数据、类吸光度、预测方程和浓度结果的 CSV。
- 导出带标准点、折线和拟合线的 PNG 图表。

### 使用方法

1. 导入包含比色管或显色区域的实验图片。
2. 设置比色管数量和编号样式，生成条目。
3. 将一个条目设为“空白管”。一个项目只能使用一个空白管。
4. 将已知浓度样本设为“标准曲线管”，并填写标准浓度。
5. 将未知浓度样本设为“待测管”，并填写稀释倍数；未稀释时填写 `1`。
6. 依次选中条目，在图片中拖动框选对应的显色区域。
7. 完成空白管和至少两个不同浓度标准管的取色后，程序自动生成三条标准曲线。
8. 待测管完成取色后，程序分别给出 `A_R`、`A_G`、`A_B` 对应的稀释后浓度和原液浓度。
9. 使用“导出 CSV”和“导出图表 PNG”保存实验结果。

### 计算原理

设空白管的平均颜色值为 `R₀`、`G₀`、`B₀`，样本管的平均颜色值为 `R`、`G`、`B`。程序计算：

```text
A_R = -log10(R / R₀)
A_G = -log10(G / G₀)
A_B = -log10(B / B₀)
```

每个颜色通道分别使用标准管数据拟合：

```text
A = a × C + b
```

其中 `C` 为标准浓度，`a` 为斜率，`b` 为截距。待测液的稀释后浓度为：

```text
C = (A - b) / a
```

考虑稀释后，原液浓度为：

```text
原液浓度 = 稀释后浓度 × 稀释倍数
```

三个颜色通道独立拟合，因此每支待测管会得到三组浓度估计结果。

### 数据与隐私

所有图片读取、像素统计、线性拟合、图表生成和文件导出均在访问者自己的浏览器中完成。实验图片不会上传到 GitHub，也不会发送给任何服务器。刷新或关闭页面后，浏览器内存中的当前实验数据会被清除。

### 实验建议与限制

- 尽量固定光源、拍摄距离、曝光、白平衡和背景。
- 空白管、标准管和待测管应在相同条件下拍摄。
- 避免反光、高光溢出、阴影和液面边缘进入选区。
- 各通道 RGB 值必须大于 `0`，否则无法进行对数计算。
- 建议每个选区使用大小相近、位置一致的液体中心区域。
- 本工具计算的是基于数码图像 RGB 的“类吸光度”，不能替代经过校准的专业分光光度计。

### 本地运行

项目没有构建步骤，也不需要安装依赖。可以直接双击 `index.html`，或在项目目录启动静态文件服务器：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

---

## English

### Features

- Import experimental images in JPG, PNG, WebP, and other browser-supported formats.
- Configure tube count and common automatic numbering styles.
- Classify entries as a blank, calibration standard, or unknown sample.
- View the image at its original pixel resolution with trackpad panning and pinch-to-zoom.
- Select image regions and calculate average RGB, mean HSL saturation, and valid pixel count.
- Calculate absorbance-like `A_R`, `A_G`, and `A_B` values using a blank tube.
- Build three independent linear calibration curves and calculate R².
- Estimate unknown concentrations independently from all three channel models.
- Correct unknown results using a user-defined dilution factor.
- Export raw measurements, absorbance-like values, equations, R², and concentration estimates as CSV.
- Export a PNG chart containing calibration points, connecting lines, and fitted lines.

### Workflow

1. Import an experimental image containing the tubes or colored sample regions.
2. Configure the number of tubes and the numbering style.
3. Assign one entry as the blank tube. Only one blank is used per project.
4. Assign known samples as calibration standards and enter their concentrations.
5. Assign unknown samples as unknown tubes and enter their dilution factors. Use `1` for an undiluted sample.
6. Select each entry and drag a rectangle over its corresponding image region.
7. After measuring the blank and at least two standards with different concentrations, the three calibration models are generated automatically.
8. Once an unknown is measured, the application reports diluted and dilution-corrected concentration estimates from `A_R`, `A_G`, and `A_B`.
9. Export the results as CSV and save the chart as PNG.

### Calculation Method

Let the blank-tube averages be `R₀`, `G₀`, and `B₀`, and let the sample averages be `R`, `G`, and `B`:

```text
A_R = -log10(R / R₀)
A_G = -log10(G / G₀)
A_B = -log10(B / B₀)
```

Each channel is fitted independently using the calibration standards:

```text
A = a × C + b
```

Here, `C` is concentration, `a` is the slope, and `b` is the intercept. The diluted unknown concentration is calculated as:

```text
C = (A - b) / a
```

The original-sample concentration is then corrected for dilution:

```text
Original concentration = Diluted concentration × Dilution factor
```

Because the three channels are fitted independently, each unknown tube receives three concentration estimates.

### Privacy

Image loading, pixel analysis, regression, chart rendering, and file export all run locally in the visitor's browser. Experimental images are never uploaded to GitHub or sent to a server. Current project data is cleared when the page is refreshed or closed.

### Experimental Notes and Limitations

- Keep lighting, camera distance, exposure, white balance, and background consistent.
- Photograph blanks, standards, and unknowns under identical conditions.
- Keep reflections, clipped highlights, shadows, and liquid boundaries outside the selected regions.
- RGB channel values must be greater than `0` for the logarithmic calculation.
- Use similarly sized regions near the center of each liquid sample.
- This tool calculates image-based absorbance-like values and is not a replacement for a calibrated laboratory spectrophotometer.

### Run Locally

There is no build step and no dependency installation. Open `index.html` directly, or start a static server in the project directory:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## 项目结构 / Project Structure

```text
-Digital-Colorimetry-Lab-/
├── index.html    # 页面结构 / Application interface
├── styles.css    # 页面样式 / Styles
├── app.js        # 图像处理、拟合和导出 / Analysis, regression, and export
└── README.md     # 项目说明 / Documentation
```

## 技术栈 / Technology

原生 HTML、CSS 和 JavaScript，无框架、无后端、无第三方运行时依赖。

Vanilla HTML, CSS, and JavaScript. No framework, backend, build process, or third-party runtime dependency.
