## T4c: 左文右图（左侧文字区域，右侧图片区域）

适合：有配图的详细说明

```javascript
async function createTextImageSlide(pres, C, data) {
  // data = { title, summary, textItems: [{ title, desc }], images: ["path1", "path2"] }
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

  const contentY = data.summary ? 1.45 : 1.0;

  // 左侧文字卡片
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: contentY, w: 4.5, h: 5.625 - contentY - 0.3,
    fill: { color: C.cardBg }, shadow: makeShadow()
  });

  const items = data.textItems || [];
  items.forEach((item, i) => {
    const iy = contentY + 0.2 + i * 1.0;
    // 色块标题背景
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: iy, w: 4.0, h: 0.35, fill: { color: C.primaryLight }
    });
    slide.addText(item.title, {
      x: 0.85, y: iy, w: 3.7, h: 0.35,
      fontSize: 12, fontFace: FONT, color: C.textDark, bold: true, align: "left", valign: "middle", margin: 0
    });
    slide.addText(item.desc, {
      x: 0.85, y: iy + 0.4, w: 3.7, h: 0.5,
      fontSize: 9, fontFace: FONT, color: C.textMid, align: "left", lineSpacingMultiple: 1.4, margin: 0
    });
  });

  // 右侧图片区域
  const images = data.images || [];
  if (images.length === 1) {
    await addScreenshot(slide, images[0], 5.3, contentY, 4.2, 5.625 - contentY - 0.3);
  } else if (images.length >= 2) {
    const imgW = 2.0;
    const imgH = 5.625 - contentY - 0.3;
    for (let j = 0; j < Math.min(images.length, 2); j++) {
      await addScreenshot(slide, images[j], 5.3 + j * 2.15, contentY, imgW, imgH);
    }
  }
}
```
