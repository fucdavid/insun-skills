## T4a: 卡片式（2-4个并列卡片，每个卡片有白色背景+左侧色条）

适合：并列的几个要点，每个有标题和描述

```javascript
async function createCardSlide(pres, C, data) {
  // data = { pageLabel, title, summary, columns: [{ title, desc, images[] }] }
  const slide = pres.addSlide();
  slide.background = { color: C.bg };
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.05, fill: { color: C.primary } });

  // 标题区
  slide.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.25, w: 0.06, h: 0.45, fill: { color: C.primary } });
  slide.addText(data.title, {
    x: 0.75, y: 0.25, w: 8, h: 0.45,
    fontSize: 20, fontFace: FONT, color: C.textDark, bold: true, align: "left", valign: "middle", margin: 0
  });

  // 摘要条
  if (data.summary) {
    slide.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.4, fill: { color: C.primaryLight } });
    slide.addText(data.summary, {
      x: 0.7, y: 0.85, w: 8.6, h: 0.4,
      fontSize: 10, fontFace: FONT, color: C.textMid, align: "left", valign: "middle", margin: 0
    });
  }

  const cols = data.columns;
  const n = cols.length;
  const gap = 0.25;
  const totalW = 9.0;
  const cardW = (totalW - gap * (n - 1)) / n;
  const cardY = data.summary ? 1.45 : 1.0;
  const cardH = data.summary ? 3.9 : 4.3;

  for (let i = 0; i < n; i++) {
    const cx = 0.5 + i * (cardW + gap);
    // 卡片背景
    slide.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: cardY, w: cardW, h: cardH,
      fill: { color: C.cardBg }, shadow: makeShadow()
    });
    // 左侧色条
    slide.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: cardY, w: 0.06, h: cardH,
      fill: { color: C.primary }
    });
    // 卡片标题
    slide.addText(cols[i].title, {
      x: cx + 0.2, y: cardY + 0.15, w: cardW - 0.4, h: 0.35,
      fontSize: 13, fontFace: FONT, color: C.textDark, bold: true, align: "left", valign: "middle", margin: 0
    });
    // 描述
    slide.addText(cols[i].desc, {
      x: cx + 0.2, y: cardY + 0.55, w: cardW - 0.4, h: 0.8,
      fontSize: 9, fontFace: FONT, color: C.textMid, align: "left", lineSpacingMultiple: 1.5, margin: 0
    });
    // 截图
    if (cols[i].images && cols[i].images.length > 0) {
      const imgAreaW = cardW - 0.4;
      const imgGap = 0.08;
      const singleW = (imgAreaW - imgGap * (cols[i].images.length - 1)) / cols[i].images.length;
      const imgY = cardY + 1.4;
      const imgMaxH = cardH - 1.6;
      for (let j = 0; j < cols[i].images.length; j++) {
        await addScreenshot(slide, cols[i].images[j], cx + 0.2 + j * (singleW + imgGap), imgY, singleW, imgMaxH);
      }
    }
  }
}
```
