/**
 * Progressive PPTX content layout renderer.
 *
 * Flow:
 * 1. content.json / outline_planner selects a semantic T variant.
 * 2. This renderer reads only layouts/t_variants.json as the index.
 * 3. For each content slide, it loads the needed layouts/references/t*.md file,
 *    extracts its JavaScript code block, evaluates the template function, and
 *    runs it through a body-zone coordinate adapter.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pptxgen = require('pptxgenjs');

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const REF_W = 10;
const REF_H = 5.625;
const REF_BODY_TOP = 0.75;
const SAFE_MARGIN_X = 0.62;
const SAFE_MARGIN_BOTTOM = 0.48;
const SKILL_DIR = path.resolve(__dirname, '..');
const VARIANT_INDEX = path.join(SKILL_DIR, 'layouts', 't_variants.json');
const REFERENCE_DIR = path.join(SKILL_DIR, 'layouts', 'references');

function cleanHex(value) {
  return String(value || '').replace(/^#/, '').toUpperCase().slice(0, 6) || '000000';
}

function clampZone(zone) {
  const x = Math.max(zone?.x ?? SAFE_MARGIN_X, SAFE_MARGIN_X);
  const y = Math.max(zone?.y ?? 1.25, 0.85);
  const maxW = SLIDE_W - x - SAFE_MARGIN_X;
  const maxH = SLIDE_H - y - SAFE_MARGIN_BOTTOM;
  return {
    x,
    y,
    w: Math.max(1, Math.min(zone?.w ?? maxW, maxW)),
    h: Math.max(1, Math.min(zone?.h ?? maxH, maxH)),
  };
}

function normalizeTokens(tokens = {}) {
  const primary = cleanHex(tokens.primary_color || '0B5F68');
  const light = cleanHex(tokens.bg_light || 'F4F7F7');
  return {
    primary,
    primaryLight: light,
    accent: cleanHex(tokens.accent_color || tokens.secondary_color || primary),
    textDark: cleanHex(tokens.text_dark || '111111'),
    textMid: cleanHex(tokens.text_mid || tokens.text_muted || '555555'),
    textLight: cleanHex(tokens.text_light || 'D9D9D9'),
    bg: 'FFFFFF',
    cardBg: 'FFFFFF',
    border: cleanHex(tokens.border || 'D6DFE9'),
    dark: cleanHex(tokens.dark || '111111'),
    fontTitle: tokens.font_title || tokens.font_body || 'Microsoft YaHei',
    fontBody: tokens.font_body || tokens.font_title || 'Microsoft YaHei',
  };
}

function makeShadow() {
  return { type: 'outer', color: '000000', opacity: 0.12, blur: 1, angle: 45, distance: 1 };
}

async function addScreenshot(slide, imagePath, x, y, w, h) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    slide.addShape(slide.__pres.ShapeType.rect, {
      x, y, w, h,
      fill: { color: 'EDF2F7' },
      line: { color: 'CBD5E1', width: 0.5 },
    });
    return;
  }
  slide.addImage({ path: path.resolve(imagePath), x, y, w, h });
}

function loadVariantIndex() {
  const data = JSON.parse(fs.readFileSync(VARIANT_INDEX, 'utf-8'));
  const map = new Map();
  for (const item of data.variants || []) {
    map.set(item.id, item);
  }
  return map;
}

function extractJavaScript(mdText, sourcePath) {
  const blocks = [...mdText.matchAll(/```(?:javascript|js)\s*([\s\S]*?)```/gi)];
  if (!blocks.length) return mdText;
  return blocks.map(match => match[1]).join('\n\n');
}

function loadTemplateFunction(variantSpec) {
  const refFile = variantSpec.reference_file;
  const fnName = variantSpec.function;
  if (!refFile || !fnName) {
    throw new Error(`Variant ${variantSpec.id} must define reference_file and function`);
  }
  const refPath = path.resolve(REFERENCE_DIR, refFile);
  if (!refPath.startsWith(REFERENCE_DIR)) {
    throw new Error(`Invalid reference_file for ${variantSpec.id}: ${refFile}`);
  }
  const md = fs.readFileSync(refPath, 'utf-8');
  const code = extractJavaScript(md, refPath);
  const safeRequire = (name) => {
    if (name === 'path') return require('path');
    throw new Error(`Module not allowed in layout reference: ${name}`);
  };
  const context = {
    console,
    require: safeRequire,
    FONT: variantSpec.font || 'Microsoft YaHei',
    makeShadow,
    addScreenshot,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: refPath, timeout: 1000 });
  if (typeof context[fnName] !== 'function') {
    throw new Error(`Function ${fnName} not found in ${refPath}`);
  }
  return context[fnName];
}

function scaleFontSize(value, scale) {
  if (typeof value !== 'number') return value;
  return Math.max(5.5, Math.round(value * scale * 10) / 10);
}

function cloneAndScaleOptions(opts, scale) {
  if (!opts || typeof opts !== 'object') return opts;
  const out = sanitizeOptions({ ...opts });
  if (out.fontSize) out.fontSize = scaleFontSize(out.fontSize, scale);
  if (out.fontFace) out.fontFace = out.fontFace;
  if (Array.isArray(out.colW)) out.colW = out.colW.map(v => (typeof v === 'number' ? v * scale : v));
  if (Array.isArray(out.rowH)) out.rowH = out.rowH.map(v => (typeof v === 'number' ? v * scale : v));
  return out;
}

function sanitizeOptions(value) {
  if (Array.isArray(value)) return value.map(sanitizeOptions);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'color') {
      out[key] = cleanHex(val || '000000');
    } else {
      out[key] = sanitizeOptions(val);
    }
  }
  return out;
}

function scaleRichText(text, scale) {
  if (!Array.isArray(text)) return text;
  return text.map(part => ({
    ...part,
    options: cloneAndScaleOptions(part.options || {}, scale),
  }));
}

function createMappedBoxMapper(zone, skipTitleArea) {
  const sourceTop = skipTitleArea ? REF_BODY_TOP : 0;
  const sourceH = REF_H - sourceTop;
  const scaleX = zone.w / REF_W;
  const scaleY = zone.h / sourceH;
  const fontScale = Math.min(scaleX, scaleY);

  function mapOptions(opts = {}) {
    const y = Number.isFinite(Number(opts.y)) ? Number(opts.y) : 0;
    const h = Number.isFinite(Number(opts.h)) ? Number(opts.h) : 0;
    if (skipTitleArea && y + h <= REF_BODY_TOP) return null;

    const mapped = cloneAndScaleOptions(opts, fontScale) || {};
    const x = Number.isFinite(Number(opts.x)) ? Number(opts.x) : 0;
    const w = Number.isFinite(Number(opts.w)) ? Number(opts.w) : 0.01;
    if ('x' in opts) mapped.x = zone.x + (x / REF_W) * zone.w;
    if ('y' in opts) mapped.y = zone.y + ((Math.max(y, sourceTop) - sourceTop) / sourceH) * zone.h;
    if ('w' in opts) mapped.w = Math.max(0.01, (w / REF_W) * zone.w);
    if ('h' in opts) {
      const visibleH = skipTitleArea && y < sourceTop ? Math.max(0, h - (sourceTop - y)) : h;
      mapped.h = (visibleH / sourceH) * zone.h;
    }
    if (Array.isArray(opts.colW)) mapped.colW = opts.colW.map(v => (typeof v === 'number' ? v * scaleX : v));
    if (Array.isArray(opts.rowH)) mapped.rowH = opts.rowH.map(v => (typeof v === 'number' ? v * scaleY : v));
    return mapped;
  }

  return { mapOptions, fontScale };
}

function createMappedSlide(realSlide, realPres, zone, skipTitleArea) {
  const { mapOptions, fontScale } = createMappedBoxMapper(zone, skipTitleArea);
  const mapped = {
    __pres: realPres,
    set background(value) {
      realSlide.background = value;
    },
    get background() {
      return realSlide.background;
    },
    addShape(shapeType, opts = {}) {
      const mappedOpts = mapOptions(opts);
      if (!mappedOpts) return null;
      const safeShape = shapeType || realPres.ShapeType.rect;
      return realSlide.addShape(safeShape, mappedOpts);
    },
    addText(text, opts = {}) {
      if ((text === undefined || text === null || text === '') && !Array.isArray(text)) return null;
      const mappedOpts = mapOptions(opts);
      if (!mappedOpts) return null;
      return realSlide.addText(scaleRichText(text, fontScale), mappedOpts);
    },
    addImage(opts = {}) {
      const mappedOpts = mapOptions(opts);
      if (!mappedOpts) return null;
      return realSlide.addImage({ ...opts, ...mappedOpts });
    },
    addTable(rows, opts = {}) {
      const mappedOpts = mapOptions(opts);
      if (!mappedOpts) return null;
      const scaledRows = (rows || []).map(row => row.map(cell => {
        if (!cell || typeof cell !== 'object') return cell;
        return {
          ...cell,
          options: cloneAndScaleOptions(cell.options || {}, fontScale),
        };
      }));
      return realSlide.addTable(scaledRows, mappedOpts);
    },
  };
  return mapped;
}

function createMappedPresentation(realPres, zone, skipTitleArea) {
  realPres.shapes = {
    RECTANGLE: realPres.ShapeType.rect,
    ROUNDED_RECTANGLE: realPres.ShapeType.roundRect,
    OVAL: realPres.ShapeType.ellipse,
    ELLIPSE: realPres.ShapeType.ellipse,
    LINE: realPres.ShapeType.line,
    CHEVRON: realPres.ShapeType.chevron,
  };
  return new Proxy(realPres, {
    get(target, prop) {
      if (prop === 'addSlide') {
        return () => createMappedSlide(target.addSlide(), target, zone, skipTitleArea);
      }
      if (prop === 'shapes') return target.shapes;
      return target[prop];
    },
  });
}

function itemLabel(item, fallback) {
  return typeof item === 'object' && item ? (item.label || item.title || item.phase || item.period || fallback) : fallback;
}

function itemText(item) {
  if (typeof item !== 'object' || item === null) return String(item || '');
  return item.desc || item.text || item.detail || item.goal || item.result || item.event || '';
}

function normalizeList(items, max, fallbackPrefix = 'Item') {
  return (items || []).slice(0, max).map((item, idx) => ({
    title: itemLabel(item, `${fallbackPrefix} ${idx + 1}`),
    label: item?.label || item?.phase || String(idx + 1),
    desc: itemText(item),
    images: item?.images || [],
  }));
}

function toTemplateData(variant, slideInfo, body) {
  const title = slideInfo.page_title || body.title || '';
  const baseItems = normalizeList(body.items || body.columns || body.stages || body.metrics || [], 8);
  const metrics = (body.metrics || body.items || []).slice(0, 6).map((item, idx) => ({
    number: item.value || item.number || item.metric || '',
    value: item.value || item.number || item.metric || '',
    label: item.label || item.title || `Metric ${idx + 1}`,
    title: item.label || item.title || `Metric ${idx + 1}`,
    desc: item.desc || item.text || item.detail || '',
  }));
  const columns = (body.columns || body.items || []).slice(0, 6).map((item, idx) => ({
    title: item.title || item.label || `Column ${idx + 1}`,
    label: item.label || item.title || `Column ${idx + 1}`,
    keyword: item.keyword || item.value || '',
    desc: item.desc || item.text || item.detail || '',
    items: item.items || item.points || [item.desc || item.text || item.detail || ''].filter(Boolean),
    points: item.points || item.items || [item.desc || item.text || item.detail || ''].filter(Boolean),
    images: item.images || [],
  }));
  const stages = (body.stages || body.items || []).slice(0, 6).map((item, idx) => ({
    label: item.label || item.period || item.month || String(idx + 1),
    title: item.title || item.phase || item.label || `Stage ${idx + 1}`,
    desc: item.desc || item.text || item.detail || '',
    items: item.items || item.points || [item.desc || item.text || item.detail || ''].filter(Boolean),
  }));
  const headers = (body.headers || ['Category', 'Content']).slice(0, 5);
  const rows = (body.rows || []).slice(0, 8);
  const tableValueRow = rows[0]
    ? (Array.isArray(rows[0]) ? rows[0] : headers.map(h => rows[0][h] || ''))
    : headers.map((h, i) => (metrics[i] ? metrics[i].value || metrics[i].label : ''));
  const detailRows = rows.slice(1).map(row => (Array.isArray(row) ? row.slice(0, 2) : headers.slice(0, 2).map(h => row[h] || '')));
  const common = {
    ...body,
    title,
    pageTitle: title,
    pageLabel: body.pageLabel || '',
    subtitle: body.subtitle || body.subTitle || body.summary || '',
    subTitle: body.subTitle || body.subtitle || body.summary || '',
    summary: body.summary || '',
    description: body.description || body.summary || '',
    sourceNote: body.sourceNote || body.source || '',
    bottomNote: body.bottomNote || body.quote || body.conclusion || '',
    bottomText: body.bottomText || body.quote || body.conclusion || '',
    quote: body.quote || body.conclusion || '',
    mainText: body.statement || body.mainText || title,
    topText: body.topText || body.summary || '',
    leadText: body.leadText || body.summary || '',
    items: baseItems,
    columns,
    cards: columns,
    pillars: columns,
    brands: columns,
    keyPoints: baseItems,
    highlights: baseItems,
    stages,
    steps: stages,
    milestones: stages,
    stats: metrics,
    metrics,
    coreMetrics: metrics,
    headerRow: headers,
    valueRow: tableValueRow,
    detailTables: detailRows.length ? [{ title: body.summary || 'Details', rows: detailRows }] : [],
    months: body.months || stages.map(s => s.label),
    lanes: body.lanes || columns,
    tiers: body.tiers || columns,
    regions: body.regions || columns,
    orgFlow: body.orgFlow || stages,
    profiles: body.profiles || columns,
    grid: body.grid || metrics,
    cells: body.cells || rows,
    rowLabels: body.rowLabels || rows.map((_, i) => `Row ${i + 1}`),
    colHeaders: body.colHeaders || headers,
    left: body.left || columns[0] || { label: 'A', items: [] },
    right: body.right || columns[1] || { label: 'B', items: [] },
    leftGoal: body.leftGoal || columns[0] || { title: 'Goal A', desc: '' },
    rightGoal: body.rightGoal || columns[1] || { title: 'Goal B', desc: '' },
    slogan: body.slogan || body.statement || title,
    sloganSub: body.sloganSub || body.quote || '',
    centerLabel: body.centerLabel || body.statement || title,
    innerNodes: body.innerNodes || baseItems.slice(0, 6),
    outerLabels: body.outerLabels || baseItems.slice(0, 3).map(x => x.title),
    hub: body.hub || { title, desc: body.summary || '' },
    corners: body.corners || columns.slice(0, 3),
    legend: body.legend || baseItems.slice(0, 3),
    topCards: body.topCards || columns.slice(0, 4),
    bottomCards: body.bottomCards || columns.slice(0, 4),
    topLabel: body.topLabel || 'Top',
    bottomLabel: body.bottomLabel || 'Bottom',
    foundation: body.foundation || body.conclusion || body.quote || '',
    brand: body.brand || '',
    section: body.section || '',
    titleParts: body.titleParts || [{ text: title }],
    fontFace: body.fontFace || undefined,
  };
  const stringItems = baseItems.map(item => item.title || item.label || item.desc || '').filter(Boolean);
  if (variant.startsWith('T1_') || variant.startsWith('T9_')) {
    return { ...common, title, subtitle: common.subtitle || body.summary || '', author: body.author || '' };
  }
  if (variant.startsWith('T2_') || variant.startsWith('T10_')) {
    return { ...common, items: stringItems.length ? stringItems : ['Part 1', 'Part 2', 'Part 3'], activeIndex: body.activeIndex || 0 };
  }
  if (variant.startsWith('T3_')) {
    return { ...common, topText: common.topText, mainText: common.mainText, bottomText: common.bottomText };
  }
  if (variant.startsWith('T8_')) {
    return { ...common, mainText: body.mainText || body.statement || 'THANK YOU', subtitle: common.subtitle || body.quote || '' };
  }
  if (variant.startsWith('T11_')) {
    return { ...common, milestones: stages, bottomText: common.bottomText };
  }
  if (variant.startsWith('T12_')) {
    return { ...common, centerLabel: common.centerLabel, innerNodes: stringItems.slice(0, 6), outerLabels: stringItems.slice(0, 3) };
  }
  if (variant.startsWith('T14_')) {
    return { ...common, pillars: columns.slice(0, 4), foundation: common.foundation || body.summary || '' };
  }
  if (variant.startsWith('T15_')) {
    return { ...common, keyPoints: stringItems.slice(0, 5), highlights: columns.slice(0, 3), tagline: body.tagline || body.quote || '' };
  }
  if (variant.startsWith('T16_')) {
    return { ...common, brands: columns.slice(0, 6) };
  }
  if (variant.startsWith('T17_')) {
    return { ...common, months: common.months.length ? common.months : ['Jan', 'Feb', 'Mar', 'Apr'], lanes: columns.slice(0, 4) };
  }
  if (variant.startsWith('T18_') || variant.startsWith('T21_')) {
    return { ...common, tiers: columns.slice(0, 4) };
  }
  if (variant.startsWith('T19_')) {
    return { ...common, doneItems: stringItems.slice(0, 4), todoItems: stringItems.slice(0, 4), intro: body.summary || '' };
  }
  if (variant.startsWith('T20_')) {
    return { ...common, left: common.left, right: common.right, bottomChannels: stringItems.slice(0, 4) };
  }
  if (variant.startsWith('T22_')) {
    return { ...common, regions: columns.slice(0, 4), orgFlow: stages };
  }
  if (variant.startsWith('T23_')) {
    return { ...common, months: stages.length ? stages : columns.slice(0, 6), cities: stringItems.slice(0, 5) };
  }
  if (variant.startsWith('T24_')) {
    return { ...common, stages };
  }
  if (variant.startsWith('T25_')) {
    return { ...common, corners: columns.slice(0, 3), legend: stringItems.slice(0, 4) };
  }
  if (variant.startsWith('T26_')) {
    return { ...common, topCards: columns.slice(0, 4), bottomCards: columns.slice(0, 4) };
  }
  if (variant.startsWith('T27_')) {
    return { ...common, brand: body.brand || title, columns: columns.slice(0, 4), description: common.description };
  }
  if (variant.startsWith('T28_')) {
    return { ...common, profiles: columns.slice(0, 2), grid: metrics.slice(0, 4), profileTitle: body.profileTitle || 'Profile' };
  }
  if (variant.startsWith('T29_')) {
    return { ...common, columns: columns.slice(0, 5) };
  }
  if (variant.startsWith('T30_')) {
    return { ...common, slogan: common.slogan, sloganSub: common.sloganSub, leftGoal: common.leftGoal, rightGoal: common.rightGoal };
  }
  if (variant.startsWith('T31_')) {
    return { ...common, rowLabels: common.rowLabels, colHeaders: common.colHeaders, cells: common.cells, bottomBar: body.conclusion || body.quote || '' };
  }
  if (variant.startsWith('T54_')) {
    return {
      ...common,
      pageTitle: title,
      columns: stringItems.slice(0, 4).length ? stringItems.slice(0, 4) : ['Group A', 'Group B', 'Group C', 'Group D'],
      predictions: stringItems.slice(0, 4),
      strategies: stringItems.slice(0, 4),
      actions: stringItems.slice(0, 4),
      monitorTitle: body.monitorTitle || 'Monitor',
      monitorText: body.monitorText || body.summary || '',
    };
  }
  if (variant === 'T4a_cards') {
    return { ...common, columns: normalizeList(body.columns || body.items || body.cards, 4) };
  }
  if (variant === 'T4b_numbered_list') {
    return { ...common, items: normalizeList(body.items || body.steps, 5) };
  }
  if (variant === 'T4d_metrics') {
    return { ...common, stats: metrics.slice(0, 4) };
  }
  if (variant === 'T4e_timeline') {
    return { ...common, steps: stages.slice(0, 6) };
  }
  if (variant === 'T5_comparison') {
    const columns = body.columns || body.items || [];
    const left = columns[0] || { label: 'A', items: [] };
    const right = columns[1] || { label: 'B', items: [] };
    return {
      ...common,
      title,
      left: {
        label: left.label || left.title || 'A',
        items: (left.items || left.points || [itemText(left)]).filter(Boolean).slice(0, 6),
      },
      right: {
        label: right.label || right.title || 'B',
        items: (right.items || right.points || [itemText(right)]).filter(Boolean).slice(0, 6),
      },
      conclusion: body.conclusion || body.summary || '',
    };
  }
  if (variant === 'T7_table') {
    return {
      ...common,
      title,
      subtitle: body.summary || '',
      headerRow: headers,
      valueRow: tableValueRow,
      detailTables: detailRows.length ? [{ title: body.summary || 'Details', rows: detailRows }] : [],
    };
  }
  if (variant === 'T13_statement') {
    return {
      ...common,
      topText: body.topText || body.summary || '',
      mainText: body.statement || body.mainText || title,
      bottomText: body.quote || body.action || (Array.isArray(body.supporting_lines) ? body.supporting_lines.join('\n') : body.supporting_text || ''),
      bgImage: body.bgImage,
    };
  }
  return common;
}

async function renderVariantBody(realPres, slideInfo, body, zone, tokens, variantIndex) {
  const variant = body.variant || 'T4a_cards';
  const spec = variantIndex.get(variant) || variantIndex.get('T4a_cards');
  const fn = loadTemplateFunction(spec);
  const skipTitleArea = variant !== 'T13_statement';
  const proxyPres = createMappedPresentation(realPres, zone, skipTitleArea);
  const C = {
    primary: tokens.primary,
    primaryLight: tokens.primaryLight,
    textDark: tokens.textDark,
    textMid: tokens.textMid,
    textLight: tokens.textLight,
    bg: tokens.bg,
    cardBg: tokens.cardBg,
    border: tokens.border,
    dark: tokens.dark,
  };
  const data = toTemplateData(variant, slideInfo, body);
  await fn(proxyPres, C, data);
  return spec;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: node render_content.js content_manifest.json');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const tokens = normalizeTokens(manifest.design_tokens || {});
  const outputDir = manifest.output_dir;
  const variantIndex = loadVariantIndex();
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Rendering ${manifest.content_slides.length} content slides with progressive md-loaded T variants...`);
  for (const slideInfo of manifest.content_slides) {
    const body = slideInfo.body || {};
    if (body.layout !== 't_variant') {
      console.log(`  [${slideInfo.idx}] skipped: body.layout is not t_variant`);
      continue;
    }
    const zone = clampZone(slideInfo.body_zone || { x: 0.62, y: 1.3, w: 12.0, h: 4.8 });
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'ppt-template-skill';
    pres.subject = 'content-body';
    pres.title = slideInfo.page_title || '';

    const spec = await renderVariantBody(pres, slideInfo, body, zone, tokens, variantIndex);
    const outPath = path.join(outputDir, `slide_${slideInfo.idx}_body.pptx`);
    await pres.writeFile({ fileName: outPath });
    console.log(`  [${slideInfo.idx}] ${slideInfo.page_title || ''} -> ${body.variant || 'T4a_cards'} (${spec.reference_file})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
