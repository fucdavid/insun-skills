## T4b: 编号列表（左侧大编号圆圈 + 右侧标题和描述，竖向排列）

适合：3-5个顺序步骤或要点

```javascript
function createNumberedSlide(pres, C, data) {
  // data = { title, summary, items: [{ title, desc }] }
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

  const items = data.items;
  const startY = data.summary ? 1.5 : 1.0;
  const rowH = Math.min(1.0, (5.2 - startY) / items.length);

  items.forEach((item, i) => {
    const iy = startY + i * rowH;
    // 编号圆圈
    slide.addShape(pres.shapes.OVAL, {
      x: 0.7, y: iy + 0.05, w: 0.45, h: 0.45,
      fill: { color: C.primary }
    });
    slide.addText(String(i + 1), {
      x: 0.7, y: iy + 0.05, w: 0.45, h: 0.45,
      fontSize: 16, fontFace: FONT, color: "FFFFFF", bold: true, align: "center", valign: "middle", margin: 0
    });
    // 标题
    slide.addText(item.title, {
      x: 1.35, y: iy, w: 7.5, h: 0.35,
      fontSize: 13, fontFace: FONT, color: C.textDark, bold: true, align: "left", valign: "middle", margin: 0
    });
    // 描述
    slide.addText(item.desc, {
      x: 1.35, y: iy + 0.35, w: 7.5, h: rowH - 0.45,
      fontSize: 10, fontFace: FONT, color: C.textMid, align: "left", lineSpacingMultiple: 1.4, margin: 0
    });
    // 分隔线（非最后一个）
    if (i < items.length - 1) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: 1.35, y: iy + rowH - 0.08, w: 7.5, h: 0.01, fill: { color: C.border }
      });
    }
  });
}
```
