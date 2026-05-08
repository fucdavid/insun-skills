## T4e: 时间线/步骤（水平排列，圆圈+连线+标签）

适合：按时间/阶段推进的内容

```javascript
function createTimelineSlide(pres, C, data) {
  // data = { title, summary, steps: [{ label: "第一阶段", title: "调研", desc: "..." }] }
  const slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.05, fill: { color: C.primary } });

  slide.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.25, w: 0.06, h: 0.45, fill: { color: C.primary } });
  slide.addText(data.title, {
    x: 0.75, y: 0.25, w: 8, h: 0.45,
    fontSize: 20, fontFace: FONT, color: C.textDark, bold: true, align: "left", valign: "middle", margin: 0
  });

  if (data.summary) {
    slide.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.4, fill: { color: C.primaryLight } });
    slide.addText(data.summary, {
      x: 0.7, y: 0.85, w: 8.6, h: 0.4,
      fontSize: 10, fontFace: FONT, color: C.textMid, align: "left", valign: "middle", margin: 0
    });
  }

  const steps = data.steps;
  const n = steps.length;
  const lineY = 2.2;
  const gap = 9.0 / n;
  const startX = 0.5;

  // 横线
  slide.addShape(pres.shapes.RECTANGLE, {
    x: startX + gap * 0.5, y: lineY + 0.2, w: gap * (n - 1), h: 0.025, fill: { color: C.primary }
  });

  steps.forEach((step, i) => {
    const cx = startX + gap * (i + 0.5);

    // 圆圈
    slide.addShape(pres.shapes.OVAL, {
      x: cx - 0.22, y: lineY, w: 0.44, h: 0.44, fill: { color: C.primary }
    });
    slide.addText(step.label || String(i + 1), {
      x: cx - 0.22, y: lineY, w: 0.44, h: 0.44,
      fontSize: 9, fontFace: FONT, color: "FFFFFF", bold: true, align: "center", valign: "middle", margin: 0
    });

    // 标题（圆圈下方）
    slide.addText(step.title, {
      x: cx - gap * 0.45, y: lineY + 0.6, w: gap * 0.9, h: 0.35,
      fontSize: 12, fontFace: FONT, color: C.textDark, bold: true, align: "center", valign: "middle", margin: 0
    });

    // 描述卡片
    slide.addShape(pres.shapes.RECTANGLE, {
      x: cx - gap * 0.45, y: lineY + 1.05, w: gap * 0.9, h: 1.8,
      fill: { color: C.cardBg }, shadow: makeShadow()
    });
    slide.addText(step.desc || "", {
      x: cx - gap * 0.4, y: lineY + 1.15, w: gap * 0.8, h: 1.5,
      fontSize: 9, fontFace: FONT, color: C.textMid, align: "left", lineSpacingMultiple: 1.4, margin: 0
    });
  });
}
```
