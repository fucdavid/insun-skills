#!/usr/bin/env python3
"""
build_skeleton.py — 按 content.json 克隆模板页，生成框架目录
用法: python build_skeleton.py template_spec.json content.json output_dir/ 模板.pptx
"""
import sys, json, zipfile, os, shutil, re
from replace_text import replace_multiple

REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'

def load_spec(spec_path):
    with open(spec_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_content(content_path):
    with open(content_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_template_slide_xml(z, slide_file):
    path = f'ppt/slides/{slide_file}'
    return z.read(path).decode('utf-8')

def get_slide_rels(z, slide_file):
    rels_path = f'ppt/slides/_rels/{slide_file}.rels'
    try:
        return z.read(rels_path).decode('utf-8')
    except KeyError:
        return None

def strip_notes_slide_rels(rels_xml):
    """Cloned slides must not all point at the same notesSlide."""
    if not rels_xml:
        return rels_xml
    return re.sub(
        r'<Relationship\b[^>]*Type="[^"]+/notesSlide"[^>]*/>',
        '',
        rels_xml
    )

def clear_unreplaced_placeholders(slide_xml):
    """Remove tiny template placeholders that otherwise leak into text checks."""
    return re.sub(
        r'<a:t>(?:X{2,}|x{2,}|TODO|\[insert[^\]]*\])</a:t>',
        '<a:t></a:t>',
        slide_xml,
        flags=re.IGNORECASE
    )

def replace_toc_placeholders(slide_xml, placeholders, slide_item):
    replacements = {}
    if 'title' in placeholders and slide_item.get('title'):
        replacements[placeholders['title']] = slide_item['title']

    item_shapes = placeholders.get('items') or []
    items = slide_item.get('items') or []
    if isinstance(items, list):
        for idx, shape_name in enumerate(item_shapes):
            replacements[shape_name] = items[idx] if idx < len(items) else ''

    if replacements:
        slide_xml = replace_multiple(slide_xml, replacements)
    return slide_xml

def rel_id_num(rel_xml):
    m = re.search(r'Id="rId(\d+)"', rel_xml)
    return int(m.group(1)) if m else 0

def update_content_types(output_dir, slide_count):
    ct_path = os.path.join(output_dir, '[Content_Types].xml')
    if not os.path.exists(ct_path):
        return
    with open(ct_path, encoding='utf-8') as f:
        ct_xml = f.read()

    ct_xml = re.sub(
        r'<Override PartName="/ppt/slides/slide\d+\.xml"[^>]*/>',
        '',
        ct_xml
    )
    slide_overrides = ''.join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" '
        f'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, slide_count + 1)
    )
    ct_xml = ct_xml.replace('</Types>', slide_overrides + '</Types>')
    with open(ct_path, 'w', encoding='utf-8') as f:
        f.write(ct_xml)

def build_skeleton(spec_path, content_path, output_dir, template_pptx):
    spec = load_spec(spec_path)
    content = load_content(content_path)
    z = zipfile.ZipFile(template_pptx)

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    slides_dir = os.path.join(output_dir, 'ppt', 'slides')
    media_dir = os.path.join(output_dir, 'ppt', 'media')
    rels_dir = os.path.join(slides_dir, '_rels')
    os.makedirs(slides_dir, exist_ok=True)
    os.makedirs(media_dir, exist_ok=True)
    os.makedirs(rels_dir, exist_ok=True)

    # 复制所有 media 文件（背景图等）
    for name in z.namelist():
        if name.startswith('ppt/media/') and not name.endswith('/'):
            target = os.path.join(output_dir, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as f:
                f.write(z.read(name))
    print(f"  ✅ 已复制 media 文件")

    # 复制其他 PPTX 结构文件（布局、主题、字体等）
    for name in z.namelist():
        if name.endswith('/'):
            continue
        if name.startswith('ppt/slides/'):
            continue  # slides 我们自己处理
        if name.startswith('ppt/notesSlides/'):
            continue  # generated slides strip notesSlide rels to avoid duplicate references
        target = os.path.join(output_dir, name)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(z.read(name))

    # 按 content.json 生成 slides
    slide_id_list = []
    output_slide_idx = 1

    for slide_item in content['slides']:
        slide_type = slide_item['type']

        # 找到对应的模板 slide
        type_spec = spec['slide_types'].get(slide_type)
        if not type_spec:
            print(f"  ⚠️  未找到类型 '{slide_type}' 的模板，跳过")
            continue

        # 读取模板 slide XML
        template_xml = get_template_slide_xml(z, type_spec['slide_file'])

        # 构建替换映射
        replacements = {}
        phs = type_spec.get('placeholders', {})

        if slide_type == 'cover':
            if 'title' in phs and 'title' in slide_item:
                replacements[phs['title']] = slide_item['title']
            if 'date' in phs and 'date' in slide_item:
                replacements[phs['date']] = slide_item['date']

        elif slide_type == 'transition':
            if 'chapter' in phs and 'chapter' in slide_item:
                replacements[phs['chapter']] = slide_item.get('chapter', '')
            if 'title' in phs and 'title' in slide_item:
                replacements[phs['title']] = slide_item['title']
            # 兼容只有 title 的过渡页
            if 'title' not in phs and 'chapter' not in phs and phs:
                first_ph = list(phs.values())[0]
                replacements[first_ph] = slide_item.get('title', slide_item.get('chapter', ''))

        elif slide_type == 'content':
            if 'page_title' in phs and 'page_title' in slide_item:
                replacements[phs['page_title']] = slide_item['page_title']
            elif 'title' in phs and 'page_title' in slide_item:
                replacements[phs['title']] = slide_item['page_title']

        elif slide_type == 'toc':
            pass

        elif slide_type == 'end':
            pass  # 尾页通常不需要替换

        # 执行替换
        if slide_type == 'toc':
            new_xml = replace_toc_placeholders(template_xml, phs, slide_item)
        elif replacements:
            new_xml = replace_multiple(template_xml, replacements)
        else:
            new_xml = template_xml
        if slide_type == 'content':
            new_xml = clear_unreplaced_placeholders(new_xml)

        # 写入输出 slide
        out_slide_name = f'slide{output_slide_idx}.xml'
        out_slide_path = os.path.join(slides_dir, out_slide_name)
        with open(out_slide_path, 'w', encoding='utf-8') as f:
            f.write(new_xml)

        # 复制对应的 rels 文件
        rels_xml = get_slide_rels(z, type_spec['slide_file'])
        if rels_xml:
            rels_xml = strip_notes_slide_rels(rels_xml)
            rels_out = os.path.join(rels_dir, f'{out_slide_name}.rels')
            with open(rels_out, 'w', encoding='utf-8') as f:
                f.write(rels_xml)

        slide_id_list.append({
            'idx': output_slide_idx,
            'type': slide_type,
            'is_content': slide_type == 'content',
            'is_toc': slide_type == 'toc',
            'body_zone': type_spec.get('body_zone'),
            'page_title': slide_item.get('page_title', slide_item.get('title', '')),
            'body': slide_item.get('body'),
        })

        print(f"  [{output_slide_idx}] {slide_type}: {slide_item.get('title', slide_item.get('page_title', ''))[:40]}")
        output_slide_idx += 1

    # 更新 presentation.xml 的 sldIdLst
    pres_xml = z.read('ppt/presentation.xml').decode('utf-8')
    pres_out = os.path.join(output_dir, 'ppt/presentation.xml')

    # 更新 ppt/_rels/presentation.xml.rels while preserving theme/master/etc.
    rels_template = z.read('ppt/_rels/presentation.xml.rels').decode('utf-8')
    all_rels = re.findall(r'<Relationship\b[^>]*/>', rels_template)
    non_slide_rels = [r for r in all_rels if f'Type="{SLIDE_REL}"' not in r]
    next_rid = max([rel_id_num(r) for r in non_slide_rels] or [0]) + 1

    for slide_info in slide_id_list:
        slide_info['r_id'] = f'rId{next_rid}'
        next_rid += 1

    # 重建 sldIdLst
    new_sld_ids = '\n'.join(
        f'    <p:sldId id="{256 + i["idx"]}" r:id="{i["r_id"]}"/>'
        for i in slide_id_list
    )
    pres_xml = re.sub(
        r'<p:sldIdLst>.*?</p:sldIdLst>',
        f'<p:sldIdLst>\n{new_sld_ids}\n  </p:sldIdLst>',
        pres_xml, flags=re.DOTALL
    )
    with open(pres_out, 'w', encoding='utf-8') as f:
        f.write(pres_xml)

    new_slide_rels = '\n'.join(
        f'  <Relationship Id="{i["r_id"]}" Type="{SLIDE_REL}" Target="slides/slide{i["idx"]}.xml"/>'
        for i in slide_id_list
    )

    new_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<Relationships xmlns="{REL_NS}">\n'
        f'{chr(10).join(non_slide_rels)}\n{new_slide_rels}\n</Relationships>'
    )
    pres_rels_out = os.path.join(output_dir, 'ppt/_rels/presentation.xml.rels')
    os.makedirs(os.path.dirname(pres_rels_out), exist_ok=True)
    with open(pres_rels_out, 'w', encoding='utf-8') as f:
        f.write(new_rels)

    update_content_types(output_dir, len(slide_id_list))

    # 写入 content_slides_manifest.json（供 render_content.js 读取）
    manifest = {
        'output_dir': output_dir,
        'design_tokens': spec['design_tokens'],
        'content_slides': [s for s in slide_id_list if s['is_content']]
    }
    manifest_path = os.path.join(output_dir, 'content_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 框架已生成到 {output_dir}/")
    print(f"   共 {len(slide_id_list)} 张 slide，其中 {len([s for s in slide_id_list if s['is_content']])} 张需要正文排版")
    print(f"   下一步: node scripts/render_content.js {manifest_path}")


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print("用法: python build_skeleton.py template_spec.json content.json output_dir/ 模板.pptx")
        sys.exit(1)
    build_skeleton(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
