#!/usr/bin/env python3
"""
parse_template.py — 模板解析器
用法: python parse_template.py 模板.pptx template_spec.json
"""
import sys, json, zipfile, re, os
from defusedxml.minidom import parseString

def safe_print(*args, **kwargs):
    """Print without crashing on legacy Windows console encodings."""
    text = ' '.join(str(a) for a in args)
    try:
        print(text, **kwargs)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, 'encoding', None) or 'utf-8'
        print(text.encode(enc, errors='replace').decode(enc), **kwargs)

def emu(v):
    return round(int(v) / 914400, 4)

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

def find_ns(elem, tag_local):
    for ns in NS.values():
        found = elem.getElementsByTagNameNS(ns, tag_local)
        if found.length > 0:
            return found
    return []

def get_shapes(slide_xml):
    """提取 slide 内所有 shape 的名称、位置、文字"""
    doc = parseString(slide_xml)
    shapes = []
    for sp in doc.getElementsByTagNameNS(NS['p'], 'sp'):
        cNvPr = sp.getElementsByTagNameNS(NS['p'], 'cNvPr')
        name = cNvPr.item(0).getAttribute('name') if cNvPr.length > 0 else ''

        xfrm = sp.getElementsByTagNameNS(NS['a'], 'xfrm')
        pos = {}
        if xfrm.length > 0:
            off = xfrm.item(0).getElementsByTagNameNS(NS['a'], 'off')
            ext = xfrm.item(0).getElementsByTagNameNS(NS['a'], 'ext')
            if off.length > 0 and ext.length > 0:
                pos = {
                    'x': emu(off.item(0).getAttribute('x')),
                    'y': emu(off.item(0).getAttribute('y')),
                    'w': emu(ext.item(0).getAttribute('cx')),
                    'h': emu(ext.item(0).getAttribute('cy')),
                }

        texts = []
        for t in sp.getElementsByTagNameNS(NS['a'], 't'):
            if t.firstChild and t.firstChild.nodeValue:
                texts.append(t.firstChild.nodeValue)

        # 提取第一个文字颜色
        first_color = None
        for rpr in sp.getElementsByTagNameNS(NS['a'], 'rPr'):
            clr = rpr.getElementsByTagNameNS(NS['a'], 'srgbClr')
            if clr.length > 0:
                first_color = clr.item(0).getAttribute('val')
                break

        shapes.append({'name': name, 'pos': pos, 'texts': texts, 'color': first_color})

    # 提取 pics（背景图）
    pics = []
    for pic in doc.getElementsByTagNameNS(NS['p'], 'pic'):
        cNvPr = pic.getElementsByTagNameNS(NS['p'], 'cNvPr')
        name = cNvPr.item(0).getAttribute('name') if cNvPr.length > 0 else ''
        blip = pic.getElementsByTagNameNS(NS['a'], 'blip')
        rId = blip.item(0).getAttribute('r:embed') if blip.length > 0 else ''
        xfrm = pic.getElementsByTagNameNS(NS['a'], 'xfrm')
        pos = {}
        if xfrm.length > 0:
            off = xfrm.item(0).getElementsByTagNameNS(NS['a'], 'off')
            ext = xfrm.item(0).getElementsByTagNameNS(NS['a'], 'ext')
            if off.length > 0 and ext.length > 0:
                pos = {
                    'x': emu(off.item(0).getAttribute('x')),
                    'y': emu(off.item(0).getAttribute('y')),
                    'w': emu(ext.item(0).getAttribute('cx')),
                    'h': emu(ext.item(0).getAttribute('cy')),
                }
        pics.append({'name': name, 'rId': rId, 'pos': pos})

    return shapes, pics


def guess_slide_type(idx, shapes, pics):
    """根据 slide 内容猜测页面类型"""
    texts = [t for s in shapes for t in s['texts']]
    text_str = ' '.join(texts).lower()

    has_full_bleed_image = any(
        p['pos'].get('w', 0) > 9 and p['pos'].get('h', 0) > 4.5
        for p in pics
    )

    if idx == 0:
        return 'cover'

    if any(kw in text_str for kw in ['目录', 'contents', 'content', 'agenda']):
        return 'toc'
    chapter_like = sum(1 for t in texts if re.search(r'(^|\s)(0[1-9]|[1-9][.)、])(\s|$)', t))
    if idx <= 2 and chapter_like >= 3:
        return 'toc'

    # 尾页：THANKS / 谢谢 / 感谢
    if any(kw in text_str for kw in ['thanks', '谢谢', '感谢', 'thank you']):
        return 'end'

    # 过渡页：文字少（< 3个shape），有大标题
    content_shapes = [s for s in shapes if s['texts'] and s['pos'].get('y', 0) > 1.0]
    if len([s for s in shapes if s['texts']]) <= 3 and has_full_bleed_image:
        return 'transition'

    if len([s for s in shapes if s['texts']]) <= 3 and not has_full_bleed_image:
        return 'transition'

    # 内容页：有明显的标题栏 + 正文区域
    return 'content'


def find_body_zone(shapes, slide_h_inch=5.625):
    """推算内容页正文区的可用空间（title 以下的区域）"""
    title_shapes = [s for s in shapes if 'y' in s.get('pos', {}) and 'h' in s.get('pos', {}) and s['pos'].get('y', 0) < 1.0 and s['texts']]
    if not title_shapes:
        return {'x': 0.42, 'y': 1.3, 'w': 12.3, 'h': slide_h_inch - 1.5}

    title_bottom = max(s['pos']['y'] + s['pos']['h'] for s in title_shapes)
    margin = 0.15
    return {
        'x': 0.42,
        'y': round(title_bottom + margin, 3),
        'w': 12.3,
        'h': round(slide_h_inch - title_bottom - margin - 0.3, 3)
    }


def extract_design_tokens(all_shapes_by_slide):
    """从所有 slide 中提取主色、文字色"""
    colors = []
    for shapes in all_shapes_by_slide:
        for s in shapes:
            if s['color'] and len(s['color']) == 6:
                colors.append(s['color'].upper())

    # 去掉黑白和常见中性色
    neutral = {'FFFFFF', 'FAFAFA', 'F5F5F5', '000000', '1D1D1A', '1D1C1A', '333333'}
    brand_colors = [c for c in colors if c not in neutral and not c.startswith('F') and not c.startswith('E')]

    primary = brand_colors[0] if brand_colors else '0066CC'

    return {
        'primary_color': primary,
        'text_dark': '1D1D1A',
        'text_mid': '555555',
        'bg_light': 'F5F2EE',
    }


def parse(pptx_path, out_path):
    z = zipfile.ZipFile(pptx_path)

    # 获取 slide 列表顺序
    pres_xml = z.read('ppt/presentation.xml').decode('utf-8')
    slide_ids = re.findall(r'<p:sldId\b[^/]*/>', pres_xml)
    safe_print(f"共 {len(slide_ids)} 张 slide")

    slides_info = sorted([
        f for f in z.namelist()
        if re.match(r'^ppt/slides/slide\d+\.xml$', f)
    ], key=lambda x: int(re.search(r'\d+', x).group()))

    all_shapes = []
    slide_specs = {}
    type_counts = {}

    for idx, slide_path in enumerate(slides_info):
        slide_name = os.path.basename(slide_path).replace('.xml', '')
        xml = z.read(slide_path).decode('utf-8')
        shapes, pics = get_shapes(xml)
        all_shapes.append(shapes)

        slide_type = guess_slide_type(idx, shapes, pics)

        # 处理同类型多个（如多个 content 页）
        type_counts[slide_type] = type_counts.get(slide_type, 0) + 1
        spec_key = slide_type if type_counts[slide_type] == 1 else f"{slide_type}_{type_counts[slide_type]}"

        # 占位符（有文字的 shape）
        placeholders = {}
        toc_items = []
        for s in shapes:
            if s['texts']:
                ph_texts = ' '.join(s['texts'])
                if any(kw in ph_texts for kw in ['XXXX', 'xxx', 'XXX', 'TODO', '标题', '日期', '副标题']):
                    key_guess = 'title' if '标题' in s['name'] or 'title' in s['name'].lower() else \
                                'date' if '日期' in s['name'] or '时间' in ph_texts else \
                                'subtitle' if '副标题' in s['name'] or 'subtitle' in s['name'].lower() else \
                                s['name'].replace(' ', '_').lower()
                    placeholders[key_guess] = s['name']
                elif idx == 0 and s['texts'][0] not in ('', ' '):
                    # 封面页：把所有有内容的 shape 都登记为 placeholder
                    key_guess = 'title' if s['pos'].get('y', 5) < 3 else 'date'
                    placeholders[key_guess] = s['name']
                elif slide_type == 'toc':
                    if any(kw in ph_texts.lower() for kw in ['目录', 'contents', 'agenda']):
                        placeholders.setdefault('title', s['name'])
                    elif len(toc_items) < 12:
                        toc_items.append(s['name'])

        slide_info = {
            'slide_file': os.path.basename(slide_path),
            'slide_type_guess': slide_type,
            'placeholders': placeholders,
            'has_background_image': len(pics) > 0,
        }

        if slide_type == 'content':
            # 推算正文区
            slide_h = 5.625  # 默认 16:9
            pres_data = parseString(z.read('ppt/presentation.xml').decode('utf-8'))
            sldSz = pres_data.getElementsByTagNameNS(
                'http://schemas.openxmlformats.org/presentationml/2006/main', 'sldSz'
            )
            if sldSz.length > 0:
                slide_h = emu(sldSz.item(0).getAttribute('cy'))

            slide_info['body_zone'] = find_body_zone(shapes, slide_h)
        elif slide_type == 'toc' and toc_items:
            placeholders['items'] = toc_items
            slide_info['placeholders'] = placeholders

        slide_specs[spec_key] = slide_info
        safe_print(f"  [{idx+1}] {slide_name} → {spec_key} | shapes={len(shapes)} pics={len(pics)} | placeholders={list(placeholders.keys())}")

    # Common 4-page brand templates often parse as cover + transition + transition_2
    # + transition_3 because the content placeholder page has very little text.
    # Normalize that shape into the workflow's expected roles.
    if 'cover' in slide_specs and 'transition' in slide_specs and 'content' not in slide_specs:
        transition_like = [k for k in slide_specs if k.startswith('transition_')]
        if transition_like:
            content_key = transition_like[0]
            slide_specs['content'] = slide_specs.pop(content_key)
            slide_specs['content']['slide_type_guess'] = 'content'
            if 'body_zone' not in slide_specs['content']:
                slide_idx = int(re.search(r'\d+', slide_specs['content']['slide_file']).group()) - 1
                slide_h = 5.625
                pres_data = parseString(z.read('ppt/presentation.xml').decode('utf-8'))
                sldSz = pres_data.getElementsByTagNameNS(
                    'http://schemas.openxmlformats.org/presentationml/2006/main', 'sldSz'
                )
                if sldSz.length > 0:
                    slide_h = emu(sldSz.item(0).getAttribute('cy'))
                slide_specs['content']['body_zone'] = find_body_zone(all_shapes[slide_idx], slide_h)

        remaining_transition_like = [k for k in slide_specs if k.startswith('transition_')]
        if remaining_transition_like and 'end' not in slide_specs:
            end_key = remaining_transition_like[-1]
            slide_specs['end'] = slide_specs.pop(end_key)
            slide_specs['end']['slide_type_guess'] = 'end'

    tokens = extract_design_tokens(all_shapes)

    spec = {
        'template_file': os.path.basename(pptx_path),
        'design_tokens': tokens,
        'slide_types': slide_specs,
        '_note': '请人工确认 slide_type_guess，如有误可手动修改键名'
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)

    safe_print(f"\nOK 已写入 {out_path}")
    safe_print(f"   主色: #{tokens['primary_color']}")
    safe_print(f"   页面类型: {list(slide_specs.keys())}")
    safe_print(f"\n注意: 请打开 {out_path} 确认每个 slide_type_guess 是否正确，如有误请手动修改。")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("用法: python parse_template.py 模板.pptx template_spec.json")
        sys.exit(1)
    parse(sys.argv[1], sys.argv[2])
