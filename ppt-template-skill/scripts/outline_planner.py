#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
CN_COLON = "\uff1a"


def read_docx_lines(path: Path) -> list[str]:
    with ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for paragraph in root.findall(".//w:body/w:p", NS):
        text = "".join((node.text or "") for node in paragraph.findall(".//w:t", NS)).strip()
        if text:
            lines.append(text)
    return lines


def parse_outline(lines: list[str]):
    page_re = re.compile(r"^\u7b2c(\d+)\u9875[\uff1a:](.*)$")
    part_re = re.compile(r"^[\u7b2c\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+\u90e8\u5206[\uff1a:](.*)$")
    pages = []
    current_part = None
    current = None
    for line in lines[5:]:
        if part_re.match(line):
            current_part = line
            continue
        page_match = page_re.match(line)
        if page_match:
            if current:
                pages.append(current)
            current = {
                "num": int(page_match.group(1)),
                "title": page_match.group(2).strip(),
                "part": current_part,
                "lines": [],
            }
            continue
        if current:
            current["lines"].append(line)
    if current:
        pages.append(current)
    return pages


def cover_meta(lines: list[str]):
    title = lines[0] if lines else ""
    subtitle = lines[1].lstrip("-\u2014").strip() if len(lines) > 1 else ""
    date = ""
    for line in lines[:8]:
        match = re.search(r"(20\d{2}\u5e74\d{1,2}\u6708)", line)
        if match:
            date = match.group(1)
            break
    return title, subtitle, date


def split_text(text: str, limit: int = 58) -> list[str]:
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    chunks = []
    while text:
        if len(text) <= limit:
            chunks.append(text)
            break
        cut = max(
            text.rfind("\uff0c", 0, limit),
            text.rfind("\uff1b", 0, limit),
            text.rfind("\u3002", 0, limit),
            text.rfind("\u3001", 0, limit),
            text.rfind(" ", 0, limit),
        )
        if cut < 24:
            cut = limit
        chunks.append(text[: cut + 1].strip())
        text = text[cut + 1 :].strip()
    return [chunk for chunk in chunks if chunk]


def section_map(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current = "body"
    for line in lines:
        stripped = line.strip()
        if stripped.endswith((CN_COLON, ":")) and len(stripped) <= 30:
            current = stripped[:-1]
            sections.setdefault(current, [])
            continue
        positions = [pos for pos in (stripped.find(CN_COLON), stripped.find(":")) if pos > 0]
        if positions:
            pos = min(positions)
            key = stripped[:pos].strip()
            value = stripped[pos + 1 :].strip()
            if 1 <= len(key) <= 18 and value:
                current = key
                sections.setdefault(current, []).append(value)
                continue
        sections.setdefault(current, []).append(stripped)
    return sections


def first_text(sections: dict[str, list[str]], *names: str) -> str:
    for name in names:
        values = sections.get(name) or []
        if values:
            return values[0]
    return ""


def section_items(sections: dict[str, list[str]], *names: str) -> list[str]:
    out: list[str] = []
    for name in names:
        out.extend(sections.get(name) or [])
    return out


def compact_label(label: str) -> str:
    label = label.strip() or "Point"
    return label if len(label) <= 18 else "Point"


def grid_slides(page: dict, chunk_size: int = 5) -> list[dict]:
    items = []
    current_label = "Point"
    for line in page["lines"]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.endswith((CN_COLON, ":")) and len(stripped) <= 30:
            current_label = compact_label(stripped[:-1])
            continue
        label = current_label
        desc = stripped
        positions = [pos for pos in (stripped.find(CN_COLON), stripped.find(":")) if pos > 0]
        if positions:
            pos = min(positions)
            prefix = stripped[:pos].strip()
            rest = stripped[pos + 1 :].strip()
            if 1 <= len(prefix) <= 18 and rest:
                label = compact_label(prefix)
                desc = rest
        for idx, chunk in enumerate(split_text(desc, 58)):
            suffix = "" if idx == 0 else f" cont.{idx}"
            items.append({"label": f"{label}{suffix}", "desc": chunk})

    if not items:
        items = [{"label": "Point", "desc": page["title"]}]
    chunks = [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]
    slides = []
    for idx, chunk in enumerate(chunks, 1):
        page_title = page["title"] if len(chunks) == 1 else f"{page['title']} ({idx}/{len(chunks)})"
        slides.append({
            "type": "content",
            "page_title": page_title,
            "body": {"layout": "t_variant", "variant": "T4a_cards", "items": chunk},
        })
    return slides


def statement_slide(page: dict, sections: dict[str, list[str]]) -> dict | None:
    statement = first_text(sections, "\u6838\u5fc3\u89c2\u70b9", "核心观点")
    quote = first_text(sections, "\u91d1\u53e5", "金句")
    if not statement or not quote:
        return None
    non_header_lines = [
        line for line in page["lines"]
        if not (line.endswith((CN_COLON, ":")) and len(line) <= 30)
    ]
    # Strict-preserve mode: statement layout is only used when it can carry the
    # page's main content without turning the rest into an implicit summary.
    # Dense pages stay in grid/detail layouts so the original outline remains
    # the primary presentation, not a rewritten executive summary.
    if len(non_header_lines) > 3:
        return None
    emphasis = statement
    if "\u2014\u2014" in statement:
        emphasis = statement.split("\u2014\u2014")[-1].strip()
    elif "\u3002" in statement:
        emphasis = statement.split("\u3002")[0].strip()
    action = quote.strip("\u201c\u201d\"")
    return {
        "type": "content",
        "page_title": page["title"],
        "body": {
            "layout": "statement_action_bar",
            "render_mode": "adaptive",
            "statement": statement,
            "emphasis": emphasis,
            "action": action,
            "action_highlight": action[: min(18, len(action))],
        },
    }


def strategic_timeline_slide(page: dict, sections: dict[str, list[str]]) -> dict | None:
    title = page["title"]
    joined = "\n".join(page["lines"])
    if not any(token in joined for token in ["\u4e09\u5927\u6218\u5f79", "\u65f6\u95f4\u8f74", "\u6218\u5f79\u4e00", "\u6218\u5f79\u4e8c", "\u6218\u5f79\u4e09"]):
        return None
    core = first_text(sections, "\u6838\u5fc3\u89c2\u70b9", "核心观点")
    goals = section_items(sections, "\u4e09\u5927\u6218\u5f79\u6838\u5fc3\u76ee\u6807", "三大战役核心目标")
    if len(goals) < 3:
        return None
    stages = []
    for idx, goal in enumerate(goals[:3], 1):
        if CN_COLON in goal:
            theme, desc = goal.split(CN_COLON, 1)
        elif ":" in goal:
            theme, desc = goal.split(":", 1)
        else:
            theme, desc = f"战役{idx}", goal
        stages.append({"period": f"战役{idx}", "theme": theme.strip(), "goal": desc.strip()})
    return {
        "type": "content",
        "page_title": title,
        "body": {
            "layout": "style2_overall_strategy_timeline",
            "render_mode": "adaptive",
            "title": title,
            "summary": core,
            "strategy_title": "三大战役核心目标",
            "core_point_label": "核心观点",
            "core_point": core,
            "explanation": first_text(sections, "\u91d1\u53e5", "金句"),
            "stages": stages,
        },
    }


def phase_plan_slide(page: dict, sections: dict[str, list[str]]) -> dict | None:
    title = page["title"]
    joined = "\n".join(page["lines"])
    if not any(token in title + joined for token in ["\u6218\u5f79\u4e00", "\u6218\u5f79\u4e8c", "\u6218\u5f79\u4e09"]):
        return None
    goal = first_text(sections, "\u6838\u5fc3\u76ee\u6807", "核心目标") or first_text(sections, "\u6838\u5fc3\u89c2\u70b9", "核心观点")
    rhythm = section_items(sections, "\u6267\u884c\u8282\u594f", "执行节奏")
    data = section_items(sections, "\u6570\u636e\u76ee\u6807", "数据目标")
    if len(rhythm) < 3 or len(data) < 2:
        return None
    stage_rows = []
    for idx in range(3):
        event = rhythm[idx] if idx < len(rhythm) else ""
        metric = data[idx] if idx < len(data) else ""
        stage_rows.append({
            "phase": f"{idx + 1}",
            "date": event.split(CN_COLON, 1)[0] if CN_COLON in event else "",
            "event": event,
            "keyword": metric,
            "strategy": goal,
            "detail": metric or event,
        })
    return {
        "type": "content",
        "page_title": title,
        "body": {
            "layout": "sample3_ota_timeline",
            "render_mode": "adaptive",
            "title": title,
            "summary": goal,
            "dimensions": [
                {"title": "核心目标", "desc": goal},
                {"title": "数据目标", "desc": "；".join(data[:2])},
            ],
            "theme": "执行节奏",
            "stages": stage_rows,
            "fee": "关键数据：" + "；".join(data[:3]),
        },
    }


def risk_matrix_slide(page: dict, sections: dict[str, list[str]]) -> dict | None:
    title = page["title"]
    joined = "\n".join(page["lines"])
    risk_signals = [
        "\u98ce\u9669",
        "\u8b66\u793a",
        "\u4fe1\u4efb\u5d29\u584c",
        "\u6df1\u5c42\u539f\u56e0\u5206\u6790",
        "\u5e94\u5bf9",
        "\u53cd\u9762\u6848\u4f8b\u6df1\u6f5c",
    ]
    if not any(token in title + joined for token in risk_signals):
        return None
    causes = section_items(sections, "\u6df1\u5c42\u539f\u56e0\u5206\u6790", "深层原因分析")[:4]
    if len(causes) < 3:
        return None
    while len(causes) < 4:
        causes.append("")
    return {
        "type": "content",
        "page_title": title,
        "body": {
            "layout": "style2_risk_response_matrix",
            "render_mode": "adaptive",
            "title": title,
            "summary": first_text(sections, "\u6838\u5fc3\u89c2\u70b9", "核心观点"),
            "risk_subject_label": "风险主题",
            "column_labels": ["风险预判", "应对策略", "行动抓手", "监测机制"],
            "risk_subjects": ["迭代节奏", "承诺变更", "沟通机制", "用户反馈"],
            "risk_forecasts": causes,
            "response_strategies": ["", "", "", ""],
            "actions": ["", "", "", ""],
            "monitoring_guidance": ["", ""],
        },
    }


def koc_summary_slide(page: dict, sections: dict[str, list[str]]) -> dict | None:
    title = page["title"]
    joined = "\n".join(page["lines"])
    metric_signals = ["KPI", "\u5e74\u5ea6KPI", "\u6570\u636e\u76ee\u6807", "\u79ef\u5206", "\u9884\u7b97"]
    if not any(token in title for token in metric_signals):
        return None
    metrics = []
    for line in page["lines"]:
        if re.search(r"\d", line):
            if CN_COLON in line:
                label, value = line.split(CN_COLON, 1)
            elif ":" in line:
                label, value = line.split(":", 1)
            else:
                label, value = "指标", line
            metrics.append({"label": label.strip()[:10], "value": value.strip()[:18]})
        if len(metrics) >= 3:
            break
    if len(metrics) < 3:
        return None
    return {
        "type": "content",
        "page_title": title,
        "body": {
            "layout": "sample3_koc_monthly_summary",
            "render_mode": "adaptive",
            "title": title,
            "summary": first_text(sections, "\u6838\u5fc3\u89c2\u70b9", "核心观点") or "关键指标与运营目标汇总",
            "metrics": metrics,
            "topics": [
                {"title": "核心动作", "events": [{"date": "Action", "result": text} for text in page["lines"][:4]]},
                {"title": "保障机制", "events": [{"date": "Plan", "result": text} for text in page["lines"][4:8]]},
                {"title": "结果承诺", "events": page["lines"][8:11]},
            ],
            "issue": first_text(sections, "\u91d1\u53e5", "金句"),
        },
    }


def line_items(page: dict, chunk_limit: int = 80) -> list[dict]:
    items = []
    current_label = "要点"
    for line in page["lines"]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.endswith((CN_COLON, ":")) and len(stripped) <= 30:
            current_label = compact_label(stripped[:-1])
            continue
        label = current_label
        desc = stripped
        positions = [pos for pos in (stripped.find(CN_COLON), stripped.find(":")) if pos > 0]
        if positions:
            pos = min(positions)
            prefix = stripped[:pos].strip()
            rest = stripped[pos + 1 :].strip()
            if 1 <= len(prefix) <= 18 and rest:
                label = compact_label(prefix)
                desc = rest
        for idx, chunk in enumerate(split_text(desc, chunk_limit)):
            items.append({"label": label if idx == 0 else f"{label}续", "desc": chunk})
    return items or [{"label": "要点", "desc": page["title"]}]


def metric_items(page: dict) -> list[dict]:
    metrics = []
    metric_signal = re.compile(r"(%|％|NPS|净推荐值|利润率|预算|收入|营收|销量|交付|评分|得分|万元|亿元|万辆|万|亿|\d+(?:\.\d+)?\s*分)")
    for line in page["lines"]:
        if not re.search(r"\d", line) or not metric_signal.search(line):
            continue
        if re.search(r"营销\s*\d+(?:\.\d+)?", line):
            continue
        label, value = "指标", line.strip()
        if CN_COLON in line:
            label, value = line.split(CN_COLON, 1)
        elif ":" in line:
            label, value = line.split(":", 1)
        metrics.append({"label": label.strip()[:14], "value": value.strip()[:24], "desc": line.strip()})
        if len(metrics) >= 5:
            break
    return metrics


def t_variant_slide(page: dict, variant: str, **body) -> dict:
    payload = {"layout": "t_variant", "variant": variant}
    payload.update(body)
    return {"type": "content", "page_title": page["title"], "body": payload}


def semantic_slides_for_page(page: dict) -> list[dict]:
    sections = section_map(page["lines"])
    joined = "\n".join(page["lines"])
    title_joined = page["title"] + "\n" + joined
    items = line_items(page)

    def has_any(*tokens: str) -> bool:
        return any(token in title_joined for token in tokens)

    def chunked_variant(variant: str, chunk_size: int = 6, field: str = "items", **extra) -> list[dict]:
        chunks = [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)] or [[]]
        result = []
        for idx, chunk in enumerate(chunks):
            page_title = page["title"] if len(chunks) == 1 else f"{page['title']} ({idx + 1}/{len(chunks)})"
            payload = dict(extra)
            payload[field] = chunk
            result.append(t_variant_slide({**page, "title": page_title}, variant, **payload))
        return result

    # Prefer the full pptx T library before falling back to the generic seven variants.
    if has_any("直播", "视频线", "直播线", "马拉松", "赛事"):
        return chunked_variant("T32_wuhan_marathon_live_plan", 4, "cards", summary=first_text(sections, "核心观点") or "")

    if has_any("OTA", "新媒体", "传播节奏", "内容节奏"):
        return chunked_variant("T33_ota_new_media", 5, "stages", summary=first_text(sections, "核心观点") or "")

    if has_any("KOC", "种草", "达人", "口碑项目", "口碑"):
        if has_any("总结", "复盘", "4月", "四月"):
            return chunked_variant("T35_koc_april_summary", 5, "sections", summary=first_text(sections, "核心观点") or "")
        if has_any("5月", "五月", "规划", "计划"):
            return chunked_variant("T34_hyptec_koc_may_plan", 3, "columns", summary=first_text(sections, "核心观点") or "")

    if has_any("银河M9", "M9"):
        if has_any("负面", "处理", "应对"):
            return chunked_variant("T36_m9_negative_handling", 4, "cards", summary=first_text(sections, "核心观点") or "")
        if has_any("评论区", "修复"):
            return chunked_variant("T37_m9_comment_repair", 4, "cards", summary=first_text(sections, "核心观点") or "")
        if has_any("风险", "攻击", "研判"):
            return [t_variant_slide(page, "T38_m9_risk_statement", statement=first_text(sections, "核心观点") or page["title"], supporting_lines=[i["desc"] for i in items[:6]], quote=first_text(sections, "金句") or "")]
        if has_any("现状", "速览", "销情", "舆情"):
            return chunked_variant("T39_m9_sentiment_status", 4, "metrics", summary=first_text(sections, "核心观点") or "")
        if has_any("质量", "策略"):
            return chunked_variant("T40_m9_quality_strategy", 4, "columns", summary=first_text(sections, "核心观点") or "")
        if has_any("数量", "动作"):
            return chunked_variant("T41_m9_quantity_action", 4, "items", summary=first_text(sections, "核心观点") or "")
        if has_any("价值", "传播"):
            return chunked_variant("T42_m9_value_communication", 4, "columns", summary=first_text(sections, "核心观点") or "")
        if has_any("正向", "加码"):
            return chunked_variant("T43_m9_positive_boost", 4, "columns", summary=first_text(sections, "核心观点") or "")
        if has_any("监测", "双栏"):
            return chunked_variant("T44_m9_monitor_split", 4, "columns", summary=first_text(sections, "核心观点") or "")

    if has_any("比亚迪", "BYD", "秦L", "王朝"):
        if has_any("核心优势", "优势洞察"):
            return chunked_variant("T45_byd_core_value_insight", 3, "columns", summary=first_text(sections, "核心观点") or "")
        if has_any("挑战", "问题"):
            return chunked_variant("T46_byd_challenge_insight", 3, "columns", summary=first_text(sections, "核心观点") or "")
        if has_any("总纲", "整体策略"):
            return chunked_variant("T47_byd_overall_strategy", 4, "phases", summary=first_text(sections, "核心观点") or "")
        if has_any("预热"):
            return chunked_variant("T48_byd_warmup_plan_table", 4, "sections", summary=first_text(sections, "核心观点") or "")
        if has_any("爆发"):
            return chunked_variant("T50_byd_burst_plan_table", 4, "sections", summary=first_text(sections, "核心观点") or "")
        if has_any("长尾"):
            return chunked_variant("T51_byd_long_tail_plan_table", 4, "sections", summary=first_text(sections, "核心观点") or "")
        if has_any("样例", "内容样例"):
            return chunked_variant("T49_byd_preheat_sample_cards", 3, "cards", summary=first_text(sections, "核心观点") or "")
        if has_any("舆情", "风险", "应对"):
            return chunked_variant("T54_byd_risk_response_matrix", 4, "items", summary=first_text(sections, "核心观点") or "")

    if has_any("泳道", "甘特", "MAP", "总控"):
        return chunked_variant("T17_swimlane_map", 6, "lanes", summary=first_text(sections, "核心观点") or "")

    if has_any("日历", "月度", "月份"):
        return chunked_variant("T23_monthly_calendar", 6, "months", summary=first_text(sections, "核心观点") or "")

    if has_any("活动分类", "三级活动"):
        return chunked_variant("T18_activity_calendar", 6, "tiers", summary=first_text(sections, "核心观点") or "")

    if has_any("组织", "架构", "区域"):
        return chunked_variant("T22_regional_org", 5, "regions", summary=first_text(sections, "核心观点") or "")

    if has_any("金字塔", "分级", "等级", "权益"):
        return chunked_variant("T21_pyramid_tier", 5, "tiers", summary=first_text(sections, "核心观点") or "")

    if has_any("生态", "辐射", "中心"):
        return chunked_variant("T12_ecosystem", 6, "items", summary=first_text(sections, "核心观点") or "")

    if has_any("案例", "Case", "亮点"):
        return chunked_variant("T15_case_study", 5, "items", summary=first_text(sections, "核心观点") or "")

    if has_any("品牌对标", "对标调研"):
        return chunked_variant("T27_brand_benchmark", 4, "columns", summary=first_text(sections, "核心观点") or "")

    if has_any("多品牌", "标杆案例"):
        return chunked_variant("T16_brand_comparison", 6, "brands", summary=first_text(sections, "核心观点") or "")

    if has_any("仪表板", "数据看板", "洞察数据", "画像"):
        return chunked_variant("T28_user_insight" if has_any("画像", "洞察") else "T29_data_dashboard", 4, "metrics", summary=first_text(sections, "核心观点") or "")

    if has_any("策略框架", "框架"):
        return chunked_variant("T14_strategy_framework", 4, "pillars", summary=first_text(sections, "核心观点") or "")

    if has_any("策略宣言", "Slogan", "口号", "双目标"):
        return [t_variant_slide(page, "T30_strategy_slogan", statement=first_text(sections, "核心观点") or page["title"], supporting_lines=[i["desc"] for i in items[:4]], quote=first_text(sections, "金句") or "")]

    if has_any("执行矩阵", "协同矩阵", "矩阵"):
        rows = [[item["label"], item["desc"]] for item in items[:12]]
        return [t_variant_slide(page, "T31_strategy_matrix", headers=["维度", "内容"], rows=rows, summary=first_text(sections, "核心观点") or "")]

    statement = first_text(sections, "核心观点")
    quote = first_text(sections, "金句")
    if statement and len(items) <= 7:
        return [t_variant_slide(
            page,
            "T13_statement",
            statement=statement,
            supporting_lines=[item["desc"] for item in items if item["desc"] != statement][:6],
            quote=quote,
        )]

    metrics = metric_items(page)
    if len(metrics) >= 3 and any(token in page["title"] + joined for token in ["KPI", "指标", "数据", "利润率", "NPS", "预算", "增长"]):
        return [t_variant_slide(
            page,
            "T4d_metrics",
            summary=first_text(sections, "核心观点") or "",
            metrics=metrics,
            details=items,
        )]

    if any(token in page["title"] + joined for token in ["阶段", "路径", "演进", "时间线", "节奏", "战役", "计划"]):
        chunks = [items[i : i + 6] for i in range(0, len(items), 6)]
        return [
            t_variant_slide(
                {**page, "title": page["title"] if len(chunks) == 1 else f"{page['title']} ({idx + 1}/{len(chunks)})"},
                "T4e_timeline",
                summary=first_text(sections, "核心观点") or "",
                stages=chunk,
            )
            for idx, chunk in enumerate(chunks)
        ]

    if any(token in page["title"] + joined for token in ["对比", "比较", "竞品", "风险", "应对", "矩阵", "过去", "现在"]):
        columns = []
        for name, values in sections.items():
            if name == "body" or not values:
                continue
            columns.append({"title": name, "items": values[:6]})
            if len(columns) >= 4:
                break
        if len(columns) < 2:
            split = max(1, (len(items) + 1) // 2)
            columns = [
                {"title": "维度一", "items": [item["desc"] for item in items[:split]]},
                {"title": "维度二", "items": [item["desc"] for item in items[split:]]},
            ]
        return [t_variant_slide(page, "T5_comparison", summary=first_text(sections, "核心观点") or "", columns=columns)]

    if any(token in page["title"] + joined for token in ["表", "清单", "任务", "分工", "资源", "排期", "预算"]):
        rows = [[item["label"], item["desc"]] for item in items[:7]]
        return [t_variant_slide(page, "T7_table", headers=["类别", "内容"], rows=rows)]

    variant = "T4b_numbered_list" if len(items) > 5 else "T4a_cards"
    chunks = [items[i : i + (7 if variant == "T4b_numbered_list" else 6)] for i in range(0, len(items), 7 if variant == "T4b_numbered_list" else 6)]
    return [
        t_variant_slide(
            {**page, "title": page["title"] if len(chunks) == 1 else f"{page['title']} ({idx + 1}/{len(chunks)})"},
            variant,
            items=chunk,
        )
        for idx, chunk in enumerate(chunks)
    ]


def build_content(docx_path: Path) -> dict:
    lines = read_docx_lines(docx_path)
    title, subtitle, date = cover_meta(lines)
    pages = parse_outline(lines)
    parts = []
    for page in pages:
        if page["part"] and page["part"] not in parts:
            parts.append(page["part"])

    slides = [{"type": "cover", "title": title, "subtitle": subtitle, "date": date}]
    slides.append({"type": "toc", "title": "Agenda", "items": [part.split(CN_COLON, 1)[-1] for part in parts]})
    last_part = None
    for page in pages:
        if page["part"] != last_part:
            idx = parts.index(page["part"]) + 1 if page["part"] in parts else 0
            part_title = page["part"].split(CN_COLON, 1)[-1] if page["part"] and CN_COLON in page["part"] else page["part"] or ""
            slides.append({"type": "transition", "chapter": f"{idx:02d}", "title": part_title})
            last_part = page["part"]
        slides.extend(semantic_slides_for_page(page))
    slides.append({"type": "end"})
    return {
        "title": title,
        "subtitle": subtitle,
        "date": date,
        "source": "Source: outline docx",
        "style_selection": "rotate",
        "slides": slides,
    }


def main():
    parser = argparse.ArgumentParser(description="Convert a docx outline to semantic ppt-template-skill content.json.")
    parser.add_argument("docx", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    content = build_content(args.docx)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    layouts = {}
    for slide in content["slides"]:
        if slide.get("type") == "content":
            layout = (slide.get("body") or {}).get("layout", "")
            layouts[layout] = layouts.get(layout, 0) + 1
    print(args.output)
    print(json.dumps({"slides": len(content["slides"]), "layouts": layouts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
