## T4d: 大数据+描述（突出2-4个大数字，下方有解释文字）

适合：需要突出数字/比例/百分比的页面

```javascript
function createStatSlide(pres, C, data) {
  // data = { title, summary, stats: [{ number: "65%", label: "用户满意度", desc: "较去年提升15%" }] }
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

  const stats = data.stats;
  const n = stats.length;
  const gap = 0.3;
  const totalW = 9.0;
  const blockW = (totalW - gap * (n - 1)) / n;
  const blockY = data.summary ? 1.6 : 1.2;

  stats.forEach((st, i) => {
    const bx = 0.5 + i * (blockW + gap);

    // 卡片背景
    slide.addShape(pres.shapes.RECTANGLE, {
      x: bx, y: blockY, w: blockW, h: 3.4,
      fill: { color: C.cardBg }, shadow: makeShadow()
    });

    // 大数字
    slide.addText(st.number, {
      x: bx, y: blockY + 0.3, w: blockW, h: 1.2,
      fontSize: 48, fontFace: FONT, color: C.primary, bold: true, align: "center", valign: "middle", margin: 0
    });

    // 标签
    slide.addText(st.label, {
      x: bx, y: blockY + 1.5, w: blockW, h: 0.5,
      fontSize: 14, fontFace: FONT, color: C.textDark, bold: true, align: "center", valign: "middle", margin: 0
    });

    // 分隔线
    slide.addShape(pres.shapes.RECTANGLE, {
      x: bx + blockW * 0.2, y: blockY + 2.1, w: blockW * 0.6, h: 0.015, fill: { color: C.border }
    });

    // 描述
    slide.addText(st.desc || "", {
      x: bx + 0.15, y: blockY + 2.2, w: blockW - 0.3, h: 0.9,
      fontSize: 10, fontFace: FONT, color: C.textMid, align: "center", lineSpacingMultiple: 1.4, margin: 0
    });
  });
}
```
