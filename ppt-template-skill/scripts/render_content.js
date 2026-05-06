/**
 * render_content.js — 内容页正文区排版引擎
 * 
 * 读取 content_manifest.json，为每张内容页正文区生成独立 PPTX 片段
 * 用法: node render_content.js content_manifest.json
 * 
 * 输出: 每张内容页对应一个 slide_{N}_body.pptx（单页），
 *       再由 merge_content.py 合并进框架。
 */

const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ===== 图标库（按语义选择）=====
const {
  FaRocket, FaUsers, FaChartLine, FaLightbulb, FaCheckCircle,
  FaCog, FaSearch, FaArrowRight, FaLayerGroup, FaBullhorn,
  FaStore, FaShoppingCart, FaCar, FaMobileAlt, FaCode,
  FaClipboardCheck, FaRoute, FaMapMarkerAlt, FaFlag, FaStar,
} = require('react-icons/fa');

const ICON_MAP = {
  rocket: FaRocket, users: FaUsers, chart: FaChartLine, idea: FaLightbulb,
  check: FaCheckCircle, setting: FaCog, search: FaSearch, arrow: FaArrowRight,
  layer: FaLayerGroup, marketing: FaBullhorn, store: FaStore,
  cart: FaShoppingCart, car: FaCar, mobile: FaMobileAlt, code: FaCode,
  task: FaClipboardCheck, route: FaRoute, location: FaMapMarkerAlt,
  flag: FaFlag, star: FaStar,
  default: FaArrowRight,
};

// ===== 工具函数 =====
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + pngBuffer.toString('base64');
}

const makeShadow = () => ({
  type: 'outer', blur: 6, offset: 2, angle: 135, color: '000000', opacity: 0.08
});

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const SAFE_MARGIN_X = 0.62;
const SAFE_MARGIN_BOTTOM = 0.48;

function clampZone(zone) {
  const x = Math.max(zone.x ?? SAFE_MARGIN_X, SAFE_MARGIN_X);
  const y = Math.max(zone.y ?? 1.25, 0.85);
  const maxW = SLIDE_W - x - SAFE_MARGIN_X;
  const maxH = SLIDE_H - y - SAFE_MARGIN_BOTTOM;
  return {
    x,
    y,
    w: Math.max(1, Math.min(zone.w ?? maxW, maxW)),
    h: Math.max(1, Math.min(zone.h ?? maxH, maxH)),
  };
}

/** 自动选择布局类型 */
function selectLayout(body) {
  if (body.layout && body.layout !== 'auto') return body.layout;
  const items = body.items || [];
  const n = items.length;
  const hasValue = items.some(it => it.value);
  if (body.steps) return 'timeline';
  if (body.table) return 'table';
  if (n === 1) return hasValue ? 'big_stat' : 'big_stat';
  if (n === 2) return hasValue ? 'kpi_card' : 'two_col';
  if (n === 3) return hasValue ? 'kpi_card' : 'three_col';
  if (n === 4) return hasValue ? 'kpi_card' : 'bullet_list';
  if (n <= 6) return 'bullet_list';
  return 'compact_list';
}

// ===== 布局函数 =====

/** KPI 数据卡片：2-4 条目，含大数字 */
async function layoutKpiCard(slide, pres, items, zone, tokens) {
  const cols = Math.min(items.length, 4);
  const gap = cols >= 4 ? 0.18 : 0.22;
  const cardW = (zone.w - gap * (cols - 1)) / cols;
  const cardH = Math.min(zone.h, 3.35);
  const primaryHex = `#${tokens.primary_color}`;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = zone.x + i * (cardW + gap);
    const y = zone.y;

    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: 'E8E8E8', width: 0.5 },
      shadow: makeShadow(),
    });
    // 顶部强调色条
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cardW, h: 0.05,
      fill: { color: tokens.primary_color },
    });
    // 大数字
    slide.addText(item.value || '', {
      x: x + 0.1, y: y + 0.12, w: cardW - 0.2, h: 0.72,
      fontSize: 32, bold: true, color: tokens.primary_color,
      align: 'center', valign: 'middle', margin: 0,
    });
    // 标签
    slide.addText(item.label || '', {
      x: x + 0.1, y: y + 0.88, w: cardW - 0.2, h: 0.32,
      fontSize: 11, bold: true, color: tokens.text_dark,
      align: 'center', margin: 0,
    });
    // 分隔线
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + cardW * 0.2, y: y + 1.25, w: cardW * 0.6, h: 0.02,
      fill: { color: tokens.primary_color, transparency: 70 },
    });
    // 描述
    if (item.desc) {
      slide.addText(item.desc, {
        x: x + 0.1, y: y + 1.32, w: cardW - 0.2, h: Math.max(0.45, cardH - 1.42),
        fontSize: 9.5, color: '666666',
        align: 'center', lineSpacingMultiple: 1.3, margin: 0,
      });
    }
  }
}

/** 三栏图标卡片 */
async function layoutThreeCol(slide, pres, items, zone, tokens) {
  const iconKeys = ['rocket', 'users', 'chart', 'idea', 'check', 'marketing'];
  const gap = 0.2;
  const cardW = (zone.w - gap * 2) / 3;

  for (let i = 0; i < Math.min(items.length, 3); i++) {
    const item = items[i];
    const x = zone.x + i * (cardW + gap);
    const y = zone.y;

    const iconKey = item.icon || iconKeys[i % iconKeys.length];
    const IconComp = ICON_MAP[iconKey] || ICON_MAP.default;
    const iconData = await iconToBase64Png(IconComp, `#${tokens.primary_color}`, 256);

    // 图标背景圆
    slide.addShape(pres.shapes.OVAL, {
      x: x + cardW / 2 - 0.28, y: y + 0.08, w: 0.56, h: 0.56,
      fill: { color: tokens.primary_color, transparency: 88 },
      line: { color: tokens.primary_color, transparency: 60, width: 0.5 },
    });
    // 图标
    slide.addImage({
      data: iconData,
      x: x + cardW / 2 - 0.2, y: y + 0.14, w: 0.4, h: 0.4,
    });
    // 标题
    slide.addText(item.label || '', {
      x, y: y + 0.74, w: cardW, h: 0.36,
      fontSize: 12, bold: true, color: tokens.text_dark,
      align: 'center', margin: 0,
    });
    // 分隔线
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + cardW * 0.25, y: y + 1.15, w: cardW * 0.5, h: 0.025,
      fill: { color: tokens.primary_color },
    });
    // 描述
    slide.addText(item.desc || '', {
      x: x + 0.08, y: y + 1.25, w: cardW - 0.16, h: zone.h - 1.35,
      fontSize: 10, color: '555555',
      align: 'left', lineSpacingMultiple: 1.4, margin: 0,
    });
  }
}

/** 要点列表：4-6 条目 */
async function layoutBulletList(slide, pres, items, zone, tokens) {
  const iconKeys = ['check', 'arrow', 'flag', 'star', 'rocket', 'task'];
  const rowH = (zone.h - 0.05) / items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const y = zone.y + i * rowH;

    // 左侧强调色竖条
    slide.addShape(pres.shapes.RECTANGLE, {
      x: zone.x, y: y + rowH * 0.1, w: 0.05, h: rowH * 0.8,
      fill: { color: tokens.primary_color },
    });

    // 图标
    const IconComp = ICON_MAP[item.icon || iconKeys[i % iconKeys.length]];
    const iconData = await iconToBase64Png(IconComp, `#${tokens.primary_color}`, 256);
    slide.addImage({
      data: iconData,
      x: zone.x + 0.12, y: y + rowH * 0.5 - 0.14, w: 0.28, h: 0.28,
    });

    // 标签（粗体）
    slide.addText(item.label || '', {
      x: zone.x + 0.5, y, w: 2.5, h: rowH,
      fontSize: 11, bold: true, color: tokens.text_dark,
      align: 'left', valign: 'middle', margin: 0,
    });

    // 描述
    slide.addText(item.desc || '', {
      x: zone.x + 3.2, y: y + 0.05, w: zone.w - 3.3, h: rowH - 0.1,
      fontSize: 10, color: '555555',
      align: 'left', valign: 'middle', lineSpacingMultiple: 1.3, margin: 0,
    });

    // 底部分隔线
    if (i < items.length - 1) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: zone.x, y: y + rowH - 0.01, w: zone.w, h: 0.01,
        fill: { color: 'E0E0E0' },
      });
    }
  }
}

/** 横向时间线：3-5 步骤 */
async function layoutTimeline(slide, pres, items, zone, tokens) {
  const stepW = zone.w / items.length;
  const lineY = zone.y + zone.h * 0.52;

  // 连接线
  slide.addShape(pres.shapes.RECTANGLE, {
    x: zone.x + stepW * 0.5, y: lineY - 0.015,
    w: zone.w - stepW, h: 0.03,
    fill: { color: tokens.primary_color, transparency: 50 },
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cx = zone.x + stepW * i + stepW * 0.5;

    // 节点圆
    slide.addShape(pres.shapes.OVAL, {
      x: cx - 0.24, y: lineY - 0.24, w: 0.48, h: 0.48,
      fill: { color: tokens.primary_color },
      line: { color: 'FFFFFF', width: 2 },
    });
    // 步骤编号
    slide.addText(String(i + 1), {
      x: cx - 0.24, y: lineY - 0.24, w: 0.48, h: 0.48,
      fontSize: 13, bold: true, color: 'FFFFFF',
      align: 'center', valign: 'middle', margin: 0,
    });
    // 标题（节点上方）
    slide.addText(item.label || '', {
      x: cx - stepW * 0.44, y: zone.y + 0.05, w: stepW * 0.88, h: 0.4,
      fontSize: 12, bold: true, color: tokens.text_dark,
      align: 'center', margin: 0,
    });
    // 描述（节点下方）
    slide.addText(item.desc || '', {
      x: cx - stepW * 0.44, y: lineY + 0.32, w: stepW * 0.88, h: zone.y + zone.h - lineY - 0.42,
      fontSize: 9.5, color: '666666',
      align: 'center', lineSpacingMultiple: 1.3, margin: 0,
    });
  }
}

/** 大字金句 / 单条目 */
async function layoutBigStat(slide, pres, item, zone, tokens) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: zone.x, y: zone.y + 0.3, w: 0.08, h: zone.h - 0.6,
    fill: { color: tokens.primary_color },
  });

  if (item.value) {
    slide.addText(item.value, {
      x: zone.x + 0.25, y: zone.y + 0.1, w: zone.w - 0.3, h: 1.3,
      fontSize: 64, bold: true, color: tokens.primary_color,
      align: 'left', valign: 'middle', margin: 0,
    });
    slide.addText(item.label || '', {
      x: zone.x + 0.25, y: zone.y + 1.5, w: zone.w - 0.3, h: 0.45,
      fontSize: 18, bold: true, color: tokens.text_dark,
      align: 'left', margin: 0,
    });
    if (item.desc) {
      slide.addText(item.desc, {
        x: zone.x + 0.25, y: zone.y + 2.05, w: zone.w - 0.3, h: zone.h - 2.15,
        fontSize: 11, color: '666666',
        align: 'left', lineSpacingMultiple: 1.5, margin: 0,
      });
    }
  } else {
    slide.addText(item.label || item.desc || '', {
      x: zone.x + 0.25, y: zone.y + 0.2, w: zone.w - 0.3, h: zone.h - 0.4,
      fontSize: 22, color: tokens.text_dark,
      align: 'left', valign: 'middle', lineSpacingMultiple: 1.7, margin: 0,
    });
  }
}

/** 两栏布局 */
async function layoutTwoCol(slide, pres, items, zone, tokens) {
  const colW = (zone.w - 0.25) / 2;
  for (let i = 0; i < Math.min(items.length, 2); i++) {
    const item = items[i];
    const x = zone.x + i * (colW + 0.25);

    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: zone.y, w: colW, h: zone.h,
      fill: { color: 'FFFFFF' },
      line: { color: 'EBEBEB', width: 0.5 },
      shadow: makeShadow(),
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: zone.y, w: colW, h: 0.05,
      fill: { color: tokens.primary_color },
    });
    slide.addText(item.label || '', {
      x: x + 0.15, y: zone.y + 0.12, w: colW - 0.3, h: 0.45,
      fontSize: 14, bold: true, color: tokens.text_dark,
      align: 'left', margin: 0,
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.15, y: zone.y + 0.62, w: colW - 0.3, h: 0.02,
      fill: { color: tokens.primary_color, transparency: 60 },
    });
    slide.addText(item.desc || '', {
      x: x + 0.15, y: zone.y + 0.72, w: colW - 0.3, h: zone.h - 0.82,
      fontSize: 10, color: '555555',
      align: 'left', lineSpacingMultiple: 1.4, margin: 0,
    });
  }
}

/** 紧凑双栏列表（7+条目） */
async function layoutCompactList(slide, pres, items, zone, tokens) {
  const half = Math.ceil(items.length / 2);
  const colW = (zone.w - 0.3) / 2;
  const rowH = zone.h / half;

  for (let i = 0; i < items.length; i++) {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = zone.x + col * (colW + 0.3);
    const y = zone.y + row * rowH;
    const item = items[i];

    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: y + rowH * 0.1, w: 0.04, h: rowH * 0.7,
      fill: { color: tokens.primary_color },
    });
    slide.addText(`${item.label || ''}`, {
      x: x + 0.12, y, w: colW - 0.12, h: rowH * 0.45,
      fontSize: 10, bold: true, color: tokens.text_dark,
      align: 'left', valign: 'bottom', margin: 0,
    });
    slide.addText(item.desc || '', {
      x: x + 0.12, y: y + rowH * 0.45, w: colW - 0.12, h: rowH * 0.55,
      fontSize: 9, color: '666666',
      align: 'left', valign: 'top', margin: 0,
    });
  }
}

// ===== 主流程 =====
async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('用法: node render_content.js content_manifest.json');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const tokens = manifest.design_tokens;
  const outputDir = manifest.output_dir;

  console.log(`处理 ${manifest.content_slides.length} 张内容页...`);

  for (const slideInfo of manifest.content_slides) {
    const body = slideInfo.body;
    if (!body || !body.items) {
      console.log(`  [${slideInfo.idx}] 跳过（无 body.items）`);
      continue;
    }

    const layout = selectLayout(body);
    const zone = clampZone(slideInfo.body_zone || { x: 0.62, y: 1.3, w: 12.0, h: 3.9 });

    console.log(`  [${slideInfo.idx}] "${slideInfo.page_title}" → 布局: ${layout} (${body.items.length} 条目)`);

    // 创建单页 PPTX
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE';  // 13.3" × 7.5" 匹配奕境模板尺寸，如为标准16:9请改为 LAYOUT_16x9
    const slide = pres.addSlide();
    slide.background = { color: 'F5F2EE' };  // 使用模板背景色

    switch (layout) {
      case 'kpi_card':
        await layoutKpiCard(slide, pres, body.items, zone, tokens);
        break;
      case 'three_col':
        await layoutThreeCol(slide, pres, body.items, zone, tokens);
        break;
      case 'two_col':
        await layoutTwoCol(slide, pres, body.items, zone, tokens);
        break;
      case 'bullet_list':
        await layoutBulletList(slide, pres, body.items, zone, tokens);
        break;
      case 'timeline':
        await layoutTimeline(slide, pres, body.steps || body.items, zone, tokens);
        break;
      case 'compact_list':
        await layoutCompactList(slide, pres, body.items, zone, tokens);
        break;
      case 'big_stat':
      default:
        await layoutBigStat(slide, pres, body.items[0], zone, tokens);
        break;
    }

    const outPath = path.join(outputDir, `slide_${slideInfo.idx}_body.pptx`);
    await pres.writeFile({ fileName: outPath });
    console.log(`    ✅ 已写入 ${outPath}`);
  }

  console.log('\n✅ 所有内容页正文排版完成');
  console.log(`   下一步: python scripts/merge_content.py ${outputDir} ${outputDir}/final.pptx`);
}

main().catch(err => { console.error(err); process.exit(1); });
