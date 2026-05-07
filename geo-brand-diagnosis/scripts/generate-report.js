const fs = require('fs');
const path = require('path');

/**
 * GEO 品牌诊断报告生成器（2026-05 重构版）
 *
 * 报告结构：
 * 1. 核心结论
 * 2. 总体指标表现
 * 3. 各AI平台指标表现
 * 4. 多维度具体分析图表（含竞品分析）
 * 5. AI对话摘要
 * 6. 信源渠道分析
 * 7. 优化建议
 *
 * 用法：
 *   node scripts/generate-report.js --brand "品牌名"
 *   node scripts/generate-report.js --brand "品牌名" --competitors "竞品1,竞品2"
 *   node scripts/generate-report.js --brand "映盛中国" --results results/ --output report.html
 */

// ── 命令行参数 ──────────────────────────────────────────
const args = process.argv.slice(2);
let BRAND = '';
let resultsDir = 'results';
let outputFile = 'geo-report.html';
let competitorsInput = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--brand') BRAND = args[i + 1];
  if (args[i] === '--results') resultsDir = args[i + 1];
  if (args[i] === '--output') outputFile = args[i + 1];
  if (args[i] === '--competitors') competitorsInput = args[i + 1];
}

// ── 基础配置 ────────────────────────────────────────────
function getBrandKeywords(brand) {
  if (!brand) return [];
  const base = brand.replace(/[\s/]+/g, '');
  const parts = brand.split(/[\s/]+/).filter(w => w.length > 1);
  const kwSet = new Set([brand, base, ...parts]);
  // 提取品牌名中的英文/数字部分（如"本田CRV"中的"CRV"，"宋PLUS"中的"PLUS"）
  const engParts = base.match(/[A-Za-z0-9][A-Za-z0-9\-]+/g) || [];
  for (const ep of engParts) {
    const cleaned = ep.replace(/-/g, '');
    kwSet.add(cleaned);
    // 字母+数字组合: CX5 → CX-5
    const withHyphen = cleaned.replace(/([A-Za-z]+)(\d+)/, '$1-$2');
    if (withHyphen !== cleaned) kwSet.add(withHyphen);
    // 纯字母部分: 生成所有可能的 C-X-V 中间插入连字符的变体（最多2个连字符）
    if (/^[A-Za-z]+$/.test(cleaned) && cleaned.length <= 6) {
      const all = [cleaned + '-'];  // CRV-
      for (let i = 1; i < cleaned.length; i++) {
        all.push(cleaned.slice(0, i) + '-' + cleaned.slice(i)); // C-RV, CR-V
        for (let j = i + 1; j < cleaned.length; j++) {
          all.push(cleaned.slice(0, i) + '-' + cleaned.slice(i, j) + '-' + cleaned.slice(j)); // C-R-V
        }
      }
      all.forEach(v => kwSet.add(v));
    }
  }
  // 对原始 parts 也做同样处理
  for (const part of parts) {
    if (/^[A-Za-z]/.test(part)) {
      const withHyphen = part.replace(/([A-Za-z]+)(\d+)/, '$1-$2');
      if (withHyphen !== part) kwSet.add(withHyphen);
      const noHyphen = part.replace(/-/g, '');
      if (noHyphen !== part && noHyphen.length > 1) kwSet.add(noHyphen);
    }
  }
  return [...kwSet];
}
const BRAND_KEYWORDS = getBrandKeywords(BRAND);

const qconf = fs.existsSync('assets/questions.json')
  ? JSON.parse(fs.readFileSync('assets/questions.json', 'utf8'))
  : { questions: [] };
const QUESTIONS = qconf.questions || [];

// 竞品列表
let COMPETITORS = qconf.competitors || [];
if (competitorsInput) {
  COMPETITORS = competitorsInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

const PLATFORMS = ['deepseek', 'kimi', 'doubao'];
const PLATFORM_NAMES = { deepseek: 'DeepSeek', kimi: 'Kimi', doubao: '豆包' };
const PLATFORM_COLORS = { deepseek: '#4D6BFE', kimi: '#FF6B35', doubao: '#1CC7C1' };
const CHART_COLORS = ['#4D6BFE','#FF6B35','#1CC7C1','#8b5cf6','#f59e0b','#ef4444','#22c55e','#64748b'];

// ── 读取结果文件 ─────────────────────────────────────────
const results = {};
for (const platform of PLATFORMS) {
  results[platform] = {};
  for (const q of QUESTIONS) {
    const file = path.join(resultsDir, `${platform}-q${q.id}.md`);
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      // 分离回答正文和参考信源段落
      const afterHeader = (content.split('## AI 完整回答')[1] || '').trim();
      const refSplit = afterHeader.split('## 参考信源');
      const answerText = refSplit[0].trim();
      const refSection = (refSplit[1] || '').trim();
      // 提取链接（正文 + 参考信源）
      const links = [];
      const linkRe = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
      let m;
      // 从正文中提取
      while ((m = linkRe.exec(answerText)) !== null) {
        links.push({ text: m[1], url: m[2] });
      }
      const bareLinkRe = /(?<!\]\()https?:\/\/[^\s\)<>]+/g;
      while ((m = bareLinkRe.exec(answerText)) !== null) {
        links.push({ text: '', url: m[0] });
      }
      // 从参考信源段落中提取
      if (refSection) {
        const refLinkRe = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
        while ((m = refLinkRe.exec(refSection)) !== null) {
          links.push({ text: m[1], url: m[2] });
        }
        const refBareRe = /(?<!\]\()https?:\/\/[^\s\)<>]+/g;
        while ((m = refBareRe.exec(refSection)) !== null) {
          links.push({ text: '', url: m[0] });
        }
      }
      results[platform][q.id] = { text: answerText, links };
    } else {
      results[platform][q.id] = { text: '', links: [] };
    }
  }
}

// ── 分析函数 ─────────────────────────────────────────────
function hasBrandMention(text) {
  if (!BRAND || BRAND_KEYWORDS.length === 0) return false;
  return BRAND_KEYWORDS.some(kw => text.includes(kw));
}

function getBrandContexts(text) {
  const lines = text.split('\n');
  const contexts = [];
  for (let i = 0; i < lines.length; i++) {
    if (BRAND_KEYWORDS.some(kw => lines[i].includes(kw))) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 2);
      const ctx = lines.slice(start, end).join(' ').trim();
      if (ctx.length > 10) contexts.push(ctx.substring(0, 250));
    }
  }
  return contexts;
}

function detectCompetitorMentions(text) {
  const found = [];
  for (const comp of COMPETITORS) {
    if (text.includes(comp)) found.push(comp);
  }
  return found;
}

function categorizeSource(url) {
  if (!url) return '其他';
  try {
    let hostname = new URL(url).hostname.replace(/^www\./, '');
    // 细分渠道归并
    if (/autohome\.com\.cn/i.test(hostname)) return '汽车之家';
    if (/dongchedi\.com/i.test(hostname)) return '懂车帝';
    if (/toutiao\.com/i.test(hostname)) return '今日头条';
    if (/pcauto\.com\.cn/i.test(hostname)) return '太平洋汽车';
    if (/iesdouyin\.com/i.test(hostname)) return '抖音';
    if (/sina\.cn|sina\.com/i.test(hostname)) return '新浪';
    if (/yiche\.com/i.test(hostname)) return '易车';
    if (/zol\.com\.cn/i.test(hostname)) return '中关村在线';
    if (/xcar\.com\.cn/i.test(hostname)) return '爱卡汽车';
    if (/smzdm\.com/i.test(hostname)) return '什么值得买';
    if (/bdstatic\.com|baidu\.com/i.test(hostname)) return '百度';
    if (/mpcauto\.pcvideo\.com\.cn/i.test(hostname)) return '太平洋视频';
    if (/bjd\.com\.cn/i.test(hostname)) return '北京日报';
    if (/yzwb\.net/i.test(hostname)) return '扬子晚报';
    if (/zhihu\.com/i.test(hostname)) return '知乎';
    if (/mp\.weixin\.qq\.com/i.test(hostname)) return '微信公众号';
    if (/weibo\.com/i.test(hostname)) return '微博';
    if (/gov\.|edu\.|org\//i.test(hostname)) return '政府/教育/非盈利';
    return '其他';
  } catch(e) {
    return '其他';
  }
}

// ── 统计 ─────────────────────────────────────────────────
const stats = {
  byPlatform: {},
  byQuestion: {},
  overall: { total: 0, mentions: 0 },
  competitorMentions: {},
  sourceChannels: {},
  intentStats: {},    // { intent: { total, mentions } }
};

for (const comp of COMPETITORS) stats.competitorMentions[comp] = {};

// 初始化 intentStats
for (const q of QUESTIONS) {
  if (!stats.intentStats[q.intent]) stats.intentStats[q.intent] = { total: 0, mentions: 0 };
}

for (const platform of PLATFORMS) {
  stats.byPlatform[platform] = {
    total: QUESTIONS.length, mentions: 0, questions: {}, competitorMentions: {}
  };
  for (const comp of COMPETITORS) stats.byPlatform[platform].competitorMentions[comp] = 0;

  for (const q of QUESTIONS) {
    const { text, links } = results[platform][q.id];
    const mentioned = hasBrandMention(text) && text.length > 50;
    const contexts = mentioned ? getBrandContexts(text) : [];
    const compMentions = detectCompetitorMentions(text);

    stats.byPlatform[platform].questions[q.id] = { mentioned, textLen: text.length, contexts, compMentions, links };
    if (mentioned) {
      stats.byPlatform[platform].mentions++;
    }

    // intent 统计
    if (mentioned) {
      stats.intentStats[q.intent].mentions++;
    }
    stats.intentStats[q.intent].total++;

    // 竞品统计
    for (const comp of compMentions) {
      stats.byPlatform[platform].competitorMentions[comp]++;
      if (!stats.competitorMentions[comp]) stats.competitorMentions[comp] = {};
      stats.competitorMentions[comp][platform] = (stats.competitorMentions[comp][platform] || 0) + 1;
    }

    // 信源统计
    for (const link of links) {
      const channel = categorizeSource(link.url);
      stats.sourceChannels[channel] = (stats.sourceChannels[channel] || 0) + 1;
    }
  }
  stats.overall.total += stats.byPlatform[platform].total;
  stats.overall.mentions += stats.byPlatform[platform].mentions;
}

for (const q of QUESTIONS) {
  stats.byQuestion[q.id] = { total: PLATFORMS.length, mentions: 0, platforms: {} };
  for (const platform of PLATFORMS) {
    const mentioned = stats.byPlatform[platform].questions[q.id].mentioned;
    stats.byQuestion[q.id].platforms[platform] = mentioned;
    if (mentioned) stats.byQuestion[q.id].mentions++;
  }
}

const overallRate = stats.overall.total > 0
  ? (stats.overall.mentions / stats.overall.total * 100).toFixed(1)
  : '0.0';

function getRating(rate) {
  if (rate >= 50) return { label: '强势存在', color: '#22c55e', bg: '#f0fdf4', icon: '🏆' };
  if (rate >= 30) return { label: '有所存在', color: '#f59e0b', bg: '#fffbeb', icon: '📊' };
  if (rate >= 15) return { label: '存在感弱', color: '#f97316', bg: '#fff7ed', icon: '⚠️' };
  return { label: '几乎不可见', color: '#ef4444', bg: '#fef2f2', icon: '🚨' };
}
const rating = getRating(parseFloat(overallRate));

// ── 竞品对比数据（用于图表和表格，含品牌自身，按提及次数降序）──
const competitorTable = [
  ...COMPETITORS.map(comp => {
    const compTotal = PLATFORMS.reduce((s, p) => s + (stats.competitorMentions[comp]?.[p] || 0), 0);
    return { name: comp, mentions: compTotal, isSelf: false };
  }),
  { name: BRAND, mentions: stats.overall.mentions, isSelf: true }
].sort((a, b) => b.mentions - a.mentions);

// ── 为 Chart.js 准备数据（在 Node.js 侧计算好）─────────
const chartData = {
  // 平台提及率
  platformLabels: PLATFORMS.map(p => PLATFORM_NAMES[p]),
  platformRates: PLATFORMS.map(p =>
    stats.byPlatform[p].total > 0 ? Math.round(stats.byPlatform[p].mentions / stats.byPlatform[p].total * 100) : 0
  ),
  platformColors: PLATFORMS.map(p => PLATFORM_COLORS[p]),

  // 意图维度雷达图
  intentLabels: Object.keys(stats.intentStats),
  intentRates: Object.keys(stats.intentStats).map(intent =>
    stats.intentStats[intent].total > 0
      ? Math.round(stats.intentStats[intent].mentions / stats.intentStats[intent].total * 100)
      : 0
  ),

  // 信源渠道 - 由模板内JS动态生成（window.__sourceChartData）
};

// ── 构建对话摘要卡片（按平台分 tab）──
function buildQuotesHtmlByTab() {
  const kwRegexStr = BRAND_KEYWORDS.length > 0
    ? BRAND_KEYWORDS.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : '';
  const kwRegex = kwRegexStr ? new RegExp(kwRegexStr, 'g') : null;
  const result = {};
  for (const platform of PLATFORMS) {
    const cards = [];
    const baseIdx = PLATFORMS.indexOf(platform) * QUESTIONS.length;
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      const globalIdx = baseIdx + i;
      const qdata = stats.byPlatform[platform].questions[q.id];
      const answerText = results[platform][q.id].text || '';
      const preview = answerText.length > 120 ? answerText.substring(0, 120) + '...' : answerText;
      let highlightedPreview = escapeHtml(preview);
      if (kwRegex) highlightedPreview = highlightedPreview.replace(kwRegex, '<span class="highlight">$&</span>');
      const brandTag = qdata.mentioned
        ? '<span class="quote-brand-hit">✓ 品牌提及</span>'
        : '<span class="quote-brand-miss">✗ 未提及</span>';
      const compTag = qdata.compMentions.length > 0
        ? '<span class="quote-competitor">竞品：' + escapeHtml(qdata.compMentions.join('、')) + '</span>'
        : '';
      const collapsedClass = i >= 3 ? ' collapsed' : '';
      cards.push(
        '<div class="quote-card' + collapsedClass + '" onclick="openDetail(' + globalIdx + ')">' +
        '  <div class="quote-meta">' +
        '    <span class="quote-platform" style="background:' + PLATFORM_COLORS[platform] + '">' + PLATFORM_NAMES[platform] + '</span>' +
        '    <span style="font-size:12px;color:#64748b">Q' + q.id + '</span>' +
        '    ' + brandTag +
        '    ' + compTag +
        '  </div>' +
        '  <div class="quote-q">' + escapeHtml(q.question) + '</div>' +
        '  <div class="quote-preview">' + highlightedPreview + '</div>' +
        '</div>'
      );
    }
    let html = '<div class="quotes-grid">\n' + cards.join('\n') + '\n</div>';
    if (QUESTIONS.length > 3) {
      html += '\n<div class="expand-btn" onclick="toggleExpand(this)">展开全部 ▾</div>';
    }
    result[platform] = html;
  }
  return result;
}

// 构建弹框的 JS 数据（写入独立 .js 文件，避免 HTML 解析问题）
function buildAllDialogsJs(outputDir) {
  const arr = [];
  for (const platform of PLATFORMS) {
    for (const q of QUESTIONS) {
      const qdata = stats.byPlatform[platform].questions[q.id];
      arr.push({
        platformName: PLATFORM_NAMES[platform],
        platformColor: PLATFORM_COLORS[platform],
        qid: q.id,
        question: q.question,
        answer: results[platform][q.id].text || '',
        links: results[platform][q.id].links || [],
        mentioned: qdata.mentioned,
        compMentions: qdata.compMentions || [],
      });
    }
  }
  const jsPath = path.join(outputDir, 'dialogs.js');
  fs.writeFileSync(jsPath, 'var allDialogs = ' + JSON.stringify(arr, null, 2) + ';\n', 'utf8');
  return 'dialogs.js';
}

const QUOTES_BY_TAB = buildQuotesHtmlByTab();

// ── HTML 模板 ────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GEO品牌诊断报告 - ${escapeHtml(BRAND || '未指定品牌')}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f0f2f5; color: #1e293b; line-height: 1.6; }

  /* ── 头部 ─────────────────────────────────────────── */
  .header {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%);
    color: white; padding: 50px 40px 50px; text-align: center; position: relative; overflow: hidden;
  }
  .header::before {
    content: ''; position: absolute; top: -60%; left: -20%; width: 140%; height: 200%;
    background: radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.04) 0%, transparent 60%);
    pointer-events: none;
  }
  .header::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 40px;
    background: #f0f2f5; border-radius: 20px 20px 0 0;
  }
  .header .badge {
    display: inline-block; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25);
    border-radius: 20px; padding: 4px 16px; font-size: 12px; letter-spacing: 1px; margin-bottom: 16px;
  }
  .header h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; position: relative; }
  .header h2 { font-size: 16px; font-weight: 400; opacity: 0.7; }
  .header .meta { font-size: 12px; opacity: 0.5; margin-top: 10px; }

  .container { max-width: 1200px; margin: 0 auto; padding: 0 24px 60px; position: relative; z-index: 1; }

  /* ── 核心结论 ─────────────────────────────────────── */
  .conclusion-section { margin-top: -20px; margin-bottom: 40px; }
  .conclusion-card {
    background: white; border-radius: 20px; padding: 40px; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    display: grid; grid-template-columns: auto 1fr; gap: 40px; align-items: center;
  }
  .conclusion-score { text-align: center; min-width: 180px; }
  .conclusion-score .big-num {
    font-size: 72px; font-weight: 900; line-height: 1;
    background: linear-gradient(135deg, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .conclusion-score .big-unit { font-size: 18px; color: #64748b; margin-top: 4px; }
  .conclusion-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: ${rating.bg}; border: 2px solid ${rating.color}33; border-radius: 12px;
    padding: 8px 20px; font-size: 18px; font-weight: 700; color: ${rating.color};
    margin-bottom: 16px;
  }
  .conclusion-text { font-size: 15px; color: #475569; line-height: 1.9; }
  .conclusion-highlights { display: flex; gap: 16px; margin-top: 20px; flex-wrap: wrap; }
  .conclusion-hl { background: #f8fafc; border-radius: 10px; padding: 12px 20px; text-align: center; min-width: 110px; }
  .conclusion-hl .hl-num { font-size: 24px; font-weight: 800; color: #1e293b; }
  .conclusion-hl .hl-label { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  /* ── 通用 section ─────────────────────────────────── */
  .section { margin-bottom: 40px; }
  .section-title {
    font-size: 22px; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 10px;
  }
  .section-title::before {
    content: ''; display: inline-block; width: 5px; height: 24px;
    background: linear-gradient(to bottom, #2563eb, #7c3aed); border-radius: 3px;
  }

  /* ── 指标卡片 ─────────────────────────────────────── */
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .metric-card {
    background: white; border-radius: 16px; padding: 24px; text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06); position: relative; overflow: hidden;
  }
  .metric-card::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #2563eb, #7c3aed);
  }
  .metric-num { font-size: 40px; font-weight: 900; color: #1e293b; }
  .metric-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  .metric-sub { font-size: 11px; color: #64748b; margin-top: 8px; }

  /* ── 平台卡片 ─────────────────────────────────────── */
  .platform-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .platform-card {
    background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .platform-card-header {
    padding: 24px 24px 16px; border-bottom: 1px solid #f1f5f9;
    display: flex; align-items: center; justify-content: space-between;
  }
  .platform-card-name { font-size: 18px; font-weight: 700; }
  .platform-card-rate { font-size: 32px; font-weight: 900; }
  .platform-card-body { padding: 20px 24px 24px; }
  .platform-q-dots { display: flex; gap: 6px; flex-wrap: wrap; }
  .platform-q-dot {
    width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center;
    justify-content: center; font-size: 11px; font-weight: 700; cursor: default; transition: transform 0.15s;
  }
  .platform-q-dot.hit { color: white; }
  .platform-q-dot.miss { background: #f1f5f9; color: #94a3b8; }
  .platform-q-dot:hover { transform: scale(1.15); }

  /* ── 图表区 ───────────────────────────────────────── */
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .chart-card {
    background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .chart-card-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #334155; }
  .chart-canvas-wrap { position: relative; height: 280px; }

  /* ── 竞品对比表 ───────────────────────────────────── */
  .comp-table-wrap {
    background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .comp-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .comp-table th {
    background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 13px;
    color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;
  }
  .comp-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
  .comp-table tr:hover { background: #f8fafc; }
  .comp-bar-bg { height: 8px; background: #f1f5f9; border-radius: 4px; min-width: 80px; }
  .comp-bar { height: 8px; border-radius: 4px; background: linear-gradient(90deg, #2563eb, #7c3aed); }
  .brand-row { background: #f0f5ff !important; font-weight: 700; }

  /* ── AI对话摘要 ───────────────────────────────────── */
  .quotes-grid { display: grid; gap: 16px; }
  .quote-card {
    background: white; border-radius: 14px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    cursor: pointer; transition: box-shadow 0.2s, transform 0.15s;
  }
  .quote-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); transform: translateY(-1px); }
  .quote-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .quote-platform { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; color: white; }
  .quote-intent { font-size: 11px; background: #f0f0ff; color: #6366f1; padding: 2px 8px; border-radius: 20px; }
  .quote-competitor {
    font-size: 11px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 20px;
  }
  .quote-brand-hit { font-size: 11px; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
  .quote-brand-miss { font-size: 11px; background: #fef2f2; color: #991b1b; padding: 2px 8px; border-radius: 20px; }
  .quote-q { font-size: 13px; color: #64748b; margin-bottom: 8px; }
  .quote-preview {
    font-size: 13px; color: #94a3b8; line-height: 1.6;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .highlight { background: #fef08a; padding: 0 3px; border-radius: 2px; font-weight: 600; }

  /* ── Tab 切换 ──────────────────────────────────── */
  .tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .tab-btn {
    padding: 8px 20px; border-radius: 20px; font-size: 13px; font-weight: 600;
    border: 2px solid #e2e8f0; background: white; color: #64748b;
    cursor: pointer; transition: all 0.2s;
  }
  .tab-btn:hover { border-color: #93c5fd; color: #2563eb; }
  .tab-btn.active { background: #2563eb; color: white; border-color: #2563eb; }
  .tab-pane { display: none; }
  .tab-pane.active { display: block; }
  .tab-pane.expanded .quote-card.collapsed { display: block; }
  .quotes-grid { display: grid; gap: 16px; }
  .quote-card.collapsed { display: none; }
  .expand-btn {
    display: block; margin: 16px auto 0; padding: 8px 24px; border-radius: 20px;
    font-size: 13px; font-weight: 600; color: #2563eb; background: #eff6ff;
    border: 1px solid #bfdbfe; cursor: pointer; transition: all 0.2s;
  }
  .expand-btn:hover { background: #dbeafe; }

  /* ── 弹框 ─────────────────────────────────────────── */
  .modal-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 1000; align-items: center; justify-content: center; padding: 20px;
  }
  .modal-overlay.active { display: flex; }
  .modal-box {
    background: white; border-radius: 20px; width: 100%; max-width: 800px;
    max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: modalIn 0.25s ease-out;
  }
  @keyframes modalIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .modal-header {
    padding: 24px 28px 16px; border-bottom: 1px solid #f1f5f9;
    display: flex; align-items: center; justify-content: space-between;
  }
  .modal-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .modal-title { font-size: 18px; font-weight: 800; color: #1e293b; }
  .modal-close {
    width: 36px; height: 36px; border-radius: 50%; border: none; background: #f1f5f9;
    font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: #64748b; transition: background 0.15s;
  }
  .modal-close:hover { background: #e2e8f0; }
  .modal-body { padding: 20px 28px 28px; overflow-y: auto; flex: 1; }
  .modal-question { font-size: 14px; color: #475569; background: #f8fafc; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
  .modal-answer {
    font-size: 14px; color: #334155; line-height: 1.9; word-break: break-all;
    background: #fafafa; padding: 20px; border-radius: 12px; border: 1px solid #f1f5f9;
  }
  .modal-answer h1,.modal-answer h2,.modal-answer h3,.modal-answer h4,
  .modal-answer h5,.modal-answer h6 { margin: 16px 0 8px; font-weight: 700; color: #1e293b; }
  .modal-answer h1 { font-size: 20px; } .modal-answer h2 { font-size: 18px; } .modal-answer h3 { font-size: 16px; }
  .modal-answer p { margin: 8px 0; }
  .modal-answer ul,.modal-answer ol { margin: 8px 0; padding-left: 24px; }
  .modal-answer li { margin: 4px 0; }
  .modal-answer blockquote { border-left: 4px solid #e2e8f0; padding: 8px 16px; margin: 8px 0; color: #64748b; background: #f8fafc; border-radius: 0 8px 8px 0; }
  .modal-answer code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #e11d48; font-family: 'Cascadia Code','Fira Code',Consolas,monospace; }
  .modal-answer pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; margin: 12px 0; }
  .modal-answer pre code { background: none; color: inherit; padding: 0; font-size: 13px; }
  .modal-answer table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  .modal-answer th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid #e2e8f0; }
  .modal-answer td { padding: 8px 12px; border: 1px solid #e2e8f0; }
  .modal-answer a { color: #2563eb; text-decoration: none; }
  .modal-answer a:hover { text-decoration: underline; }
  .modal-answer hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
  .modal-answer img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
  .modal-sources { margin-top: 16px; }
  .modal-sources h4 { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
  .modal-sources ul { list-style: none; padding: 0; }
  .modal-sources li { padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .modal-sources li:last-child { border-bottom: none; }
  .modal-sources a { color: #2563eb; text-decoration: none; }
  .modal-sources a:hover { text-decoration: underline; }

  /* ── 信源分析 ─────────────────────────────────────── */
  .source-layout { display: flex; align-items: center; gap: 40px; flex-wrap: wrap; justify-content: center; }
  .source-chart-wrap { width: 380px; height: 380px; position: relative; flex-shrink: 0; }
  .source-center {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; pointer-events: none;
  }
  .source-center .num { font-size: 36px; font-weight: 900; color: #1e293b; line-height: 1; }
  .source-center .lbl { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .source-legend { display: flex; flex-direction: column; gap: 8px; max-width: 300px; flex: 1; min-width: 240px; }
  .source-legend-item {
    display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px;
  }
  .source-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .source-legend-name { flex: 1; color: #475569; }
  .source-legend-cnt { color: #94a3b8; min-width: 36px; text-align: right; }
  .source-legend-pct { font-weight: 700; color: #1e293b; min-width: 50px; text-align: right; }
  .source-legend-divider { width: 100%; height: 1px; background: #f1f5f9; margin: 2px 0; }

  /* ── 优化建议 ─────────────────────────────────────── */
  .advice-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .advice-card {
    background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .advice-card h4 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #1e293b; }
  .advice-card ul { list-style: none; padding: 0; }
  .advice-card li {
    font-size: 13px; color: #475569; line-height: 1.8; padding: 6px 0 6px 16px;
    border-bottom: 1px dashed #f1f5f9; position: relative;
  }
  .advice-card li::before { content: '→'; position: absolute; left: 0; color: #2563eb; font-weight: 700; }

  .footer { text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 12px; }
</style>
</head>
<body>

<!-- ════════════════════════════════════════════════════
     1. 头部
     ════════════════════════════════════════════════════ -->
<div class="header">
  <div class="badge">GEO 生成引擎优化 · 品牌诊断报告</div>
  <h1>${escapeHtml(BRAND || '未指定品牌')}</h1>
  <h2>AI平台品牌认知度综合分析</h2>
  <div class="meta">${new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric'})} · ${PLATFORMS.length} 个AI平台 · ${QUESTIONS.length} 道测试问题 · ${stats.overall.total} 次测试</div>
</div>

<div class="container">

<!-- ════════════════════════════════════════════════════
     2. 核心结论
     ════════════════════════════════════════════════════ -->
<div class="conclusion-section">
  <div class="conclusion-card">
    <div class="conclusion-score">
      <div class="big-num">${overallRate}</div>
      <div class="big-unit">% 综合提及率</div>
    </div>
    <div>
      <div class="conclusion-badge">${rating.icon} ${rating.label}</div>
      <div class="conclusion-text">
        ${parseFloat(overallRate) >= 50
          ? '<b style="color:#16a34a">品牌在AI平台认知度较高。</b>在 ' + stats.overall.mentions + '/' + stats.overall.total + ' 次测试中被提及，用户在询问相关问题时，AI有较高概率引用该品牌信息。建议持续维护各平台内容曝光，巩固优势地位。'
          : parseFloat(overallRate) >= 30
          ? '<b style="color:#d97706">品牌在AI平台有一定存在感，但提升空间较大。</b>当前提及率为 ' + overallRate + '%，有 ' + stats.overall.mentions + ' 次提及。建议针对性加强内容布局，提升在关键问题上的品牌曝光。'
          : parseFloat(overallRate) >= 15
          ? '<b style="color:#ea580c">品牌在AI平台曝光度偏低。</b>仅 ' + overallRate + '% 的测试提及了品牌，在AI生成内容中几乎处于"隐形"状态。需要系统性的GEO优化策略，重点提升在各平台的可见度。'
          : '<b style="color:#dc2626">品牌在AI平台几乎不可见。</b>本次测试未检测到有效品牌提及，说明AI训练数据中缺乏该品牌的相关内容。建议立即启动系统性GEO优化，从内容发布到平台对接全方位布局。'
        }
      </div>
      <div class="conclusion-highlights">
        <div class="conclusion-hl">
          <div class="hl-num" style="color:${PLATFORM_COLORS.deepseek}">${stats.byPlatform.deepseek.mentions}/${stats.byPlatform.deepseek.total}</div>
          <div class="hl-label">DeepSeek 提及</div>
        </div>
        <div class="conclusion-hl">
          <div class="hl-num" style="color:${PLATFORM_COLORS.kimi}">${stats.byPlatform.kimi.mentions}/${stats.byPlatform.kimi.total}</div>
          <div class="hl-label">Kimi 提及</div>
        </div>
        <div class="conclusion-hl">
          <div class="hl-num" style="color:${PLATFORM_COLORS.doubao}">${stats.byPlatform.doubao.mentions}/${stats.byPlatform.doubao.total}</div>
          <div class="hl-label">豆包 提及</div>
        </div>
        ${COMPETITORS.length > 0 ? `<div class="conclusion-hl">
          <div class="hl-num" style="color:#8b5cf6">${COMPETITORS.length}</div>
          <div class="hl-label">竞品已分析</div>
        </div>` : ''}
      </div>
    </div>
  </div>
</div>

<!-- ════════════════════════════════════════════════════
     3. 总体指标表现
     ════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">总体指标表现</div>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-num">${overallRate}<span style="font-size:20px;color:#94a3b8">%</span></div>
      <div class="metric-label">综合提及率</div>
      <div class="metric-sub">${stats.overall.mentions} 次提及 / ${stats.overall.total} 次</div>
    </div>
    <div class="metric-card">
      <div class="metric-num" style="color:${PLATFORM_COLORS.deepseek}">${stats.byPlatform.deepseek.total > 0 ? Math.round(stats.byPlatform.deepseek.mentions/stats.byPlatform.deepseek.total*100) : 0}<span style="font-size:20px;color:#94a3b8">%</span></div>
      <div class="metric-label">DeepSeek 提及率</div>
      <div class="metric-sub">${stats.byPlatform.deepseek.mentions}/${stats.byPlatform.deepseek.total} 题</div>
    </div>
    <div class="metric-card">
      <div class="metric-num" style="color:${PLATFORM_COLORS.kimi}">${stats.byPlatform.kimi.total > 0 ? Math.round(stats.byPlatform.kimi.mentions/stats.byPlatform.kimi.total*100) : 0}<span style="font-size:20px;color:#94a3b8">%</span></div>
      <div class="metric-label">Kimi 提及率</div>
      <div class="metric-sub">${stats.byPlatform.kimi.mentions}/${stats.byPlatform.kimi.total} 题</div>
    </div>
    <div class="metric-card">
      <div class="metric-num" style="color:${PLATFORM_COLORS.doubao}">${stats.byPlatform.doubao.total > 0 ? Math.round(stats.byPlatform.doubao.mentions/stats.byPlatform.doubao.total*100) : 0}<span style="font-size:20px;color:#94a3b8">%</span></div>
      <div class="metric-label">豆包 提及率</div>
      <div class="metric-sub">${stats.byPlatform.doubao.mentions}/${stats.byPlatform.doubao.total} 题</div>
    </div>
  </div>
</div>

<!-- ════════════════════════════════════════════════════
     4. 各AI平台指标表现
     ════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">各AI平台指标表现</div>
  <div class="platform-grid">
    ${PLATFORMS.map(p => {
      const rate = stats.byPlatform[p].total > 0 ? Math.round(stats.byPlatform[p].mentions / stats.byPlatform[p].total * 100) : 0;
      const compMentionsStr = Object.entries(stats.byPlatform[p].competitorMentions || {}).filter(([,v])=>v>0).map(([c,v])=>c+'('+v+')').join('、');
      return `<div class="platform-card">
        <div class="platform-card-header">
          <div class="platform-card-name" style="color:${PLATFORM_COLORS[p]}">${PLATFORM_NAMES[p]}</div>
          <div class="platform-card-rate" style="color:${PLATFORM_COLORS[p]}">${rate}%</div>
        </div>
        <div class="platform-card-body">
          <div style="font-size:13px;color:#64748b;margin-bottom:14px">${stats.byPlatform[p].mentions} 题提及 · ${stats.byPlatform[p].total - stats.byPlatform[p].mentions} 题未提及</div>
          <div class="platform-q-dots">
            ${QUESTIONS.map(q => {
              const hit = stats.byPlatform[p].questions[q.id].mentioned;
              return `<div class="platform-q-dot ${hit ? 'hit' : 'miss'}" style="${hit ? 'background:' + PLATFORM_COLORS[p] : ''}" title="Q${q.id}: ${escapeHtml(q.question)}">Q${q.id}</div>`;
            }).join('')}
          </div>
          ${compMentionsStr ? `<div style="margin-top:14px;font-size:12px;color:#94a3b8">竞品提及：${escapeHtml(compMentionsStr)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
</div>

<!-- ════════════════════════════════════════════════════
     5. 多维度具体分析图表（含竞品分析）
     ════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">多维度具体分析</div>

  <!-- 图表行 -->
  <div class="charts-grid">
    <div class="chart-card">
      <div class="chart-card-title">各平台提及率对比</div>
      <div class="chart-canvas-wrap"><canvas id="chart-platform"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-title">问题意图提及分布（雷达图）</div>
      <div class="chart-canvas-wrap"><canvas id="chart-intent"></canvas></div>
    </div>
  </div>

  <!-- 竞品分析表格 -->
  ${COMPETITORS.length > 0 ? `
  <div class="comp-table-wrap">
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px">
      <span style="display:inline-block;width:5px;height:24px;background:linear-gradient(to bottom,#2563eb,#7c3aed);border-radius:3px"></span>
      AI平台竞品提及对比
    </div>
    <table class="comp-table">
      <thead>
        <tr>
          <th>品牌名称</th>
          <th>总提及次数</th>
          <th>提及分布</th>
          ${PLATFORMS.map(p => `<th>${PLATFORM_NAMES[p]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${competitorTable.map(c => {
          const maxMentions = Math.max(...competitorTable.map(x => x.mentions));
          const barW = maxMentions > 0 ? (c.mentions / maxMentions * 100) : 0;
          const isSelf = c.isSelf;
          const rowClass = isSelf ? ' class="brand-row"' : '';
          const nameStyle = isSelf ? ` style="color:${PLATFORM_COLORS.deepseek}"` : ' style="font-weight:600"';
          const nameSuffix = isSelf ? '（自身）' : '';
          const tdName = isSelf
            ? `<td${nameStyle}>${escapeHtml(c.name)}${nameSuffix}</td>`
            : `<td${nameStyle}>${escapeHtml(c.name)}</td>`;
          const bTag = isSelf ? '<b>' : '';
          const bTagEnd = isSelf ? '</b>' : '';
          return `<tr${rowClass}>
            ${tdName}
            <td>${bTag}${c.mentions}${bTagEnd} 次</td>
            <td><div class="comp-bar-bg"><div class="comp-bar" style="width:${barW}%"></div></div></td>
            ${isSelf
              ? PLATFORMS.map(p => `<td>${bTag}${stats.byPlatform[p].mentions}${bTagEnd} 次</td>`).join('')
              : PLATFORMS.map(p => `<td>${stats.competitorMentions[c.name]?.[p] || 0} 次</td>`).join('')
            }
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : ''}
</div>

<!-- ════════════════════════════════════════════════════
     6. AI对话摘要（全部展示 + 弹框查看详情）
     ════════════════════════════════════════════════════ -->
<!-- 弹框交互脚本 + 弹框HTML（必须在卡片HTML之前加载） -->
<script src="dialogs.js"></script>
<script>
function openDetail(idx) {
  var d = allDialogs[idx];
  document.getElementById('modalPlatform').textContent = d.platformName;
  document.getElementById('modalPlatform').style.background = d.platformColor;
  document.getElementById('modalQid').textContent = 'Q' + d.qid;
  var brandTag = document.getElementById('modalBrandTag');
  brandTag.textContent = d.mentioned ? '\u2713 品牌提及' : '\u2717 未提及';
  brandTag.className = d.mentioned ? 'quote-brand-hit' : 'quote-brand-miss';
  var compTag = document.getElementById('modalCompTag');
  if (d.compMentions.length > 0) { compTag.textContent = '\u7ADE\u54C1\uFF1A' + d.compMentions.join('\u3001'); compTag.style.display = ''; }
  else { compTag.style.display = 'none'; }
  document.getElementById('modalQuestion').textContent = '\u300C' + d.question + '\u300D';
  var rawAns = d.answer || '';
  var safeAns = rawAns.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  document.getElementById('modalAnswer').innerHTML = typeof marked !== 'undefined' ? marked.parse(safeAns) : safeAns.replace(new RegExp(String.fromCharCode(10),'g'),'<br>');
  var sourcesEl = document.getElementById('modalSources');
  var sourceList = document.getElementById('modalSourceList');
  if (d.links && d.links.length > 0) {
    sourcesEl.style.display = '';
    sourceList.innerHTML = d.links.map(function(l) { return '<li><a href="' + l.url + '" target="_blank">[' + (l.text || l.url) + '](' + l.url + ')</a></li>'; }).join('');
  } else {
    sourcesEl.style.display = 'none';
  }
  document.getElementById('detailModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  document.getElementById('detailModal').classList.remove('active');
  document.body.style.overflow = '';
}

function switchTab(platform, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('tab-' + platform).classList.add('active');
}

function toggleExpand(btn) {
  var pane = btn.parentElement;
  pane.classList.toggle('expanded');
  btn.textContent = pane.classList.contains('expanded') ? '\u6536\u8D77\u5168\u90E8 \u25B4' : '\u5C55\u5F00\u5168\u90E8 \u25BE';
}

document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDetail(); });
<\/script>

<!-- 弹框 -->
<div class="modal-overlay" id="detailModal" onclick="if(event.target===this)closeDetail()">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-header-left">
        <span id="modalPlatform" class="quote-platform" style="background:#4D6BFE">DeepSeek</span>
        <span id="modalQid" style="font-size:13px;color:#64748b">Q1</span>
        <span id="modalBrandTag" class="quote-brand-hit">✓ 品牌提及</span>
        <span id="modalCompTag" class="quote-competitor"></span>
      </div>
      <button class="modal-close" onclick="closeDetail()">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-question" id="modalQuestion"></div>
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px">AI 完整回答</div>
      <div class="modal-answer" id="modalAnswer"></div>
      <div class="modal-sources" id="modalSources" style="display:none">
        <h4>参考信源</h4>
        <ul id="modalSourceList"></ul>
      </div>
    </div>
  </div>
</div>

<div class="section">
<!-- ══════════════════════════════════════════════
     6. AI对话摘要（tab 分平台 + 展开）
     ══════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">AI对话摘要</div>
  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('deepseek', this)">DeepSeek</button>
    <button class="tab-btn" onclick="switchTab('kimi', this)">Kimi</button>
    <button class="tab-btn" onclick="switchTab('doubao', this)">豆包</button>
  </div>
  <div id="tab-deepseek" class="tab-pane active">
    ${QUOTES_BY_TAB.deepseek}
  </div>
  <div id="tab-kimi" class="tab-pane">
    ${QUOTES_BY_TAB.kimi}
  </div>
  <div id="tab-doubao" class="tab-pane">
    ${QUOTES_BY_TAB.doubao}
  </div>
</div>

<!-- ════════════════════════════════════════════════════
     7. 信源渠道分析
     ════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">信源渠道分析</div>
  ${Object.keys(stats.sourceChannels).length === 0
    ? '<div style="background:white;border-radius:16px;padding:32px;text-align:center;color:#94a3b8;box-shadow:0 1px 4px rgba(0,0,0,0.06)">AI回答中未检测到引用链接，无法分析信源渠道。建议检查原始回答数据。</div>'
    : (() => {
        const sorted = Object.entries(stats.sourceChannels).sort((a,b) => b[1]-a[1]);
        const top15 = sorted.slice(0, 15);
        const othersCnt = sorted.slice(15).reduce((s,[,c]) => s+c, 0);
        if (othersCnt > 0) top15.push(['其他', othersCnt]);
        const sourceTotal = top15.reduce((s,[,c]) => s+c, 0);
        const colors = ['#2563eb','#3b82f6','#60a5fa','#93c5fd','#f59e0b','#f97316','#ef4444','#ec4899','#8b5cf6','#6366f1','#14b8a6','#22c55e','#84cc16','#eab308','#cbd5e1','#a1a1aa'];
        const legendHtml = top15.map(([ch, cnt], i) => {
          const pct = ((cnt / sourceTotal) * 100).toFixed(1);
          return '<div class="source-legend-item">' +
            '<span class="source-legend-dot" style="background:' + colors[i] + '"></span>' +
            '<span class="source-legend-name">' + escapeHtml(ch) + '</span>' +
            '<span class="source-legend-cnt">' + cnt + '条</span>' +
            '<span class="source-legend-pct">' + pct + '%</span>' +
            '</div>' +
            (i === 7 ? '<div class="source-legend-divider"></div>' : '');
        }).join('');
        // 将数据写入chartData对象，序列化后供环形图使用
        chartData.sourceLabels = top15.map(([n])=>n);
        chartData.sourceData = top15.map(([,c])=>c);
        chartData.sourceColors = colors.slice(0, top15.length);
        return '<div class="source-layout">' +
          '<div class="source-chart-wrap">' +
            '<canvas id="chart-source"></canvas>' +
            '<div class="source-center">' +
              '<div class="num">' + sourceTotal + '</div>' +
              '<div class="lbl">信源总量</div>' +
            '</div>' +
          '</div>' +
          '<div class="source-legend" id="sourceLegend">' +
            legendHtml +
          '</div>' +
        '</div>';
      })()
  }
</div>

<!-- ════════════════════════════════════════════════════
     8. 优化建议
     ════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">优化建议</div>
  <div class="advice-grid">
    <div class="advice-card">
      <h4>🎯 高优先级行动</h4>
      <ul>
        ${stats.byPlatform['kimi'].mentions < Math.ceil(QUESTIONS.length/2) ? '<li>Kimi提及率偏低（仅 ' + stats.byPlatform['kimi'].mentions + '/' + QUESTIONS.length + '），建议向月之暗面提交品牌资料</li>' : ''}
        ${stats.byPlatform['deepseek'].mentions < Math.ceil(QUESTIONS.length/2) ? '<li>DeepSeek提及率偏低，加强在知乎/行业媒体的品牌内容布局</li>' : ''}
        ${stats.byPlatform['doubao'].mentions < Math.ceil(QUESTIONS.length/2) ? '<li>豆包提及率偏低，建议在头条/抖音等内容平台增加品牌曝光</li>' : ''}
        ${COMPETITORS.length > 0 && competitorTable.filter(c => c.mentions > stats.overall.mentions).length > 0
          ? '<li>竞品 <b>' + competitorTable.filter(c => c.mentions > stats.overall.mentions).map(c=>escapeHtml(c.name)).join('、') + '</b> 提及次数高于品牌，需重点研究其内容策略</li>'
          : ''}
        <li>发布详细的服务案例和客户证言，增加AI可引用内容</li>
      </ul>
    </div>
    <div class="advice-card">
      <h4>📝 内容策略建议</h4>
      <ul>
        <li>围绕核心业务词创作深度内容，提升被AI引用的概率</li>
        <li>发布结构化品牌介绍文章，覆盖客户案例和效果数据</li>
        <li>在知乎、微信公众号等AI训练来源媒体持续发布专业内容</li>
        <li>申请/完善百度百科、维基词条等结构化知识库收录</li>
      </ul>
    </div>
    <div class="advice-card">
      <h4>💡 低提及场景重点攻克</h4>
      <ul>
        ${QUESTIONS.filter(q => stats.byQuestion[q.id].mentions === 0).map(q =>
          '<li>Q' + q.id + '. ' + escapeHtml(q.question) + '</li>'
        ).join('') || '<li>所有问题均有品牌提及，表现良好 ✅</li>'}
      </ul>
    </div>
    <div class="advice-card">
      <h4>📈 监测与跟踪</h4>
      <ul>
        <li>建议每季度重测这些问题，跟踪提及率变化趋势</li>
        <li>扩展测试问题到20题，覆盖更多用户搜索意图场景</li>
        ${COMPETITORS.length > 0 ? '<li>持续监测竞品（' + COMPETITORS.map(c=>escapeHtml(c)).join('、') + '）在AI平台的提及变化</li>' : '<li>同步监测竞品在AI平台的提及情况做对比分析</li>'}
        <li>结合传统SEO数据，构建GEO+SEO双维度品牌曝光体系</li>
      </ul>
    </div>
  </div>
</div>

</div><!-- /container -->

<div class="footer">
  <p>报告由 GEO 品牌诊断工具自动生成 · 测试时间：${new Date().toLocaleString('zh-CN')} · 数据来源：DeepSeek / Kimi / 豆包 AI平台真实回答</p>
</div>

<!-- ════════════════════════════════════════════════════
     Chart.js 图表脚本（所有数据已由服务端注入）
     ════════════════════════════════════════════════════ -->
<script>
(function() {
  const CD = ${JSON.stringify(chartData)};

  // 图表1：各平台提及率对比（柱状图）
  const ctx1 = document.getElementById('chart-platform');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: CD.platformLabels,
        datasets: [{
          label: '提及率 (%)',
          data: CD.platformRates,
          backgroundColor: CD.platformColors,
          borderRadius: 8,
          barPercentage: 0.5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: function(v) { return v + '%'; } } }
        }
      }
    });
  }

  // 图表2：问题意图提及分布（雷达图）
  const ctx2 = document.getElementById('chart-intent');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'radar',
      data: {
        labels: CD.intentLabels,
        datasets: [{
          label: '提及率 (%)',
          data: CD.intentRates,
          backgroundColor: 'rgba(37,99,235,0.12)',
          borderColor: '#2563eb',
          borderWidth: 2,
          pointBackgroundColor: '#2563eb',
          pointRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: { beginAtZero: true, max: 100, ticks: { callback: function(v) { return v + '%'; } } }
        }
      }
    });
  }

  // 图表3：信源渠道分布（环形图 - TOP 15）
  var scd = CD;
  const ctx3 = document.getElementById('chart-source');
  if (ctx3 && CD.sourceLabels && CD.sourceLabels.length > 0) {
    var sourceTotal = CD.sourceData.reduce(function(s, v) { return s + v; }, 0);
    new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: CD.sourceLabels,
        datasets: [{
          data: CD.sourceData,
          backgroundColor: CD.sourceColors,
          borderWidth: 2, borderColor: '#fff',
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        cutout: '56%',
        layout: { padding: 8 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b', titleFont: { size: 13, weight: '600' }, bodyFont: { size: 12 },
            padding: 10, cornerRadius: 8,
            callbacks: {
              label: function(ctx) {
                var pct = ((ctx.raw / sourceTotal) * 100).toFixed(1);
                return ' ' + ctx.raw + ' 条 (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }
})();
<\/script>

</body>
</html>`;


// 生成 dialogs.js（弹框数据独立文件）
buildAllDialogsJs(path.dirname(outputFile) || ".");
// ── 写入文件 ─────────────────────────────────────────────
fs.writeFileSync(outputFile, HTML, 'utf8');
console.log('✅ 报告已生成：' + outputFile);
console.log(`📊 综合品牌提及率：${overallRate}%`);
for (const p of PLATFORMS) {
  console.log(`   ${PLATFORM_NAMES[p]}：${stats.byPlatform[p].mentions}/${stats.byPlatform[p].total} 题提及`);
}
if (COMPETITORS.length > 0) {
  console.log(`\n🏆 竞品分析：`);
  competitorTable.forEach(c => console.log(`   ${c.name}：${c.mentions} 次提及`));
}
