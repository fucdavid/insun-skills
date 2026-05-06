#!/usr/bin/env python3
"""
merge_content.py — 将内容页正文（pptxgenjs 生成的单页 PPTX）
                   合并进骨架目录，然后打包为最终 PPTX

用法: python merge_content.py output_dir/ final_output.pptx 原始模板.pptx
"""
import sys, os, zipfile, json, re, shutil
from defusedxml.minidom import parseString

NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'


def extract_body_shapes(body_pptx_path):
    """从 body PPTX 中提取正文 shape 列表的 XML 字符串"""
    z = zipfile.ZipFile(body_pptx_path)
    slide_files = sorted([f for f in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml', f)])
    if not slide_files:
        return '', {}

    xml = z.read(slide_files[0]).decode('utf-8')

    # 提取 spTree 内所有非 nvGrpSpPr/grpSpPr 的子元素
    doc = parseString(xml)
    spTrees = doc.getElementsByTagNameNS(NS_P, 'spTree')
    if not spTrees.length:
        return '', {}

    spTree = spTrees.item(0)
    body_shapes_xml = []

    for child in spTree.childNodes:
        if child.nodeType != child.ELEMENT_NODE:
            continue
        local = child.localName
        if local in ('nvGrpSpPr', 'grpSpPr'):
            continue
        body_shapes_xml.append(child.toxml())

    # 提取 rels 中正文图片引用。pptxgenjs 的图标会以 rIdN
    # 出现在正文 XML 中，必须重映射到目标 slide 的 .rels。
    image_rels = []
    rels_files = [f for f in z.namelist() if re.match(r'ppt/slides/_rels/slide\d+\.xml\.rels', f)]
    if rels_files:
        rels_xml = z.read(rels_files[0]).decode('utf-8')
        image_rels = re.findall(
            r'<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="[^"]+/image"[^>]*Target="\.\./media/([^"]+)"[^>]*/>',
            rels_xml
        )

    media = {}
    for _, media_name in image_rels:
        media_path = f'ppt/media/{media_name}'
        if media_path in z.namelist():
            media[media_name] = z.read(media_path)

    return '\n'.join(body_shapes_xml), media, image_rels


def inject_body_into_slide(slide_xml, body_shapes_xml):
    """将 body shapes XML 注入到 slide 的 spTree 中"""
    if not body_shapes_xml.strip():
        return slide_xml

    # 在 </p:spTree> 前插入
    return slide_xml.replace('</p:spTree>', f'{body_shapes_xml}\n</p:spTree>')

def strip_notes_slide_rels(rels_xml):
    return re.sub(
        r'<Relationship\b[^>]*Type="[^"]+/notesSlide"[^>]*/>',
        '',
        rels_xml
    )

def next_rel_id(rels_xml):
    nums = [int(x) for x in re.findall(r'Id="rId(\d+)"', rels_xml)]
    return max(nums or [0]) + 1

def merge_body_relationships(output_dir, slide_idx, body_shapes_xml, media_files, image_rels):
    """Copy body media to package and remap body rIds to target slide rIds."""
    if not image_rels:
        return body_shapes_xml

    rels_path = os.path.join(output_dir, 'ppt', 'slides', '_rels', f'slide{slide_idx}.xml.rels')
    if os.path.exists(rels_path):
        with open(rels_path, encoding='utf-8') as f:
            rels_xml = strip_notes_slide_rels(f.read())
    else:
        rels_xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{REL_NS}"></Relationships>'

    media_dir = os.path.join(output_dir, 'ppt', 'media')
    os.makedirs(media_dir, exist_ok=True)
    rid_next = next_rel_id(rels_xml)
    additions = []

    for old_rid, media_name in image_rels:
        if f'r:embed="{old_rid}"' not in body_shapes_xml:
            continue
        data = media_files.get(media_name)
        if data is None:
            continue

        new_rid = f'rId{rid_next}'
        rid_next += 1
        base, ext = os.path.splitext(media_name)
        new_media_name = f'slide{slide_idx}_{base}{ext}'
        media_path = os.path.join(media_dir, new_media_name)
        suffix = 1
        while os.path.exists(media_path):
            new_media_name = f'slide{slide_idx}_{base}_{suffix}{ext}'
            media_path = os.path.join(media_dir, new_media_name)
            suffix += 1

        with open(media_path, 'wb') as f:
            f.write(data)

        body_shapes_xml = body_shapes_xml.replace(f'r:embed="{old_rid}"', f'r:embed="{new_rid}"')
        additions.append(
            f'<Relationship Id="{new_rid}" Type="{IMAGE_REL}" Target="../media/{new_media_name}"/>'
        )

    if additions:
        rels_xml = rels_xml.replace('</Relationships>', ''.join(additions) + '</Relationships>')
    with open(rels_path, 'w', encoding='utf-8') as f:
        f.write(rels_xml)

    return body_shapes_xml


def merge(output_dir, final_pptx, original_template=None):
    manifest_path = os.path.join(output_dir, 'content_manifest.json')
    if not os.path.exists(manifest_path):
        print("⚠️  未找到 content_manifest.json，跳过合并步骤")
    else:
        manifest = json.load(open(manifest_path, encoding='utf-8'))
        content_slides = manifest.get('content_slides', [])

        for slide_info in content_slides:
            idx = slide_info['idx']
            body_pptx = os.path.join(output_dir, f'slide_{idx}_body.pptx')
            if not os.path.exists(body_pptx):
                print(f"  ⚠️  未找到 {body_pptx}，跳过")
                continue

            slide_path = os.path.join(output_dir, 'ppt', 'slides', f'slide{idx}.xml')
            if not os.path.exists(slide_path):
                print(f"  ⚠️  未找到 {slide_path}，跳过")
                continue

            result = extract_body_shapes(body_pptx)
            if len(result) == 3:
                body_shapes_xml, media_files, image_rels = result
            else:
                body_shapes_xml, media_files = result[0], {}
                image_rels = []

            # 注入 shapes
            slide_xml = open(slide_path, encoding='utf-8').read()
            body_shapes_xml = merge_body_relationships(
                output_dir, idx, body_shapes_xml, media_files, image_rels
            )
            new_xml = inject_body_into_slide(slide_xml, body_shapes_xml)
            with open(slide_path, 'w', encoding='utf-8') as f:
                f.write(new_xml)

            print(f"  [slide{idx}] ✅ 正文注入完成")

    cleanup_intermediate_files(output_dir)

    # 打包成 PPTX
    pack_pptx(output_dir, final_pptx, original_template)


def cleanup_intermediate_files(output_dir):
    """Remove files that are useful during generation but invalid inside the package tree."""
    manifest = os.path.join(output_dir, 'content_manifest.json')
    if os.path.exists(manifest):
        os.remove(manifest)

    for fname in os.listdir(output_dir):
        if re.match(r'slide_\d+_body\.pptx$', fname):
            os.remove(os.path.join(output_dir, fname))

    notes_slides = os.path.join(output_dir, 'ppt', 'notesSlides')
    if os.path.isdir(notes_slides):
        shutil.rmtree(notes_slides)


def pack_pptx(unpacked_dir, output_path, original_template=None):
    """将目录重新打包为 PPTX"""
    # 先尝试使用 skill 自带的 pack.py
    pack_script = os.path.join(os.path.dirname(__file__), 'office', 'pack.py')
    if os.path.exists(pack_script) and original_template:
        import subprocess
        result = subprocess.run(
            ['python', pack_script, unpacked_dir, output_path, '--original', original_template],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"\n✅ 已打包到 {output_path}")
            return
        else:
            print(f"  pack.py 失败，回退到手动打包: {result.stderr}")

    # 手动打包
    if os.path.exists(output_path):
        os.remove(output_path)

    skip_names = {'content_manifest.json'}
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for root, dirs, files in os.walk(unpacked_dir):
            for file in files:
                if file in skip_names or file.endswith('_body.pptx'):
                    continue
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, unpacked_dir)
                zout.write(filepath, arcname)

    print(f"\n✅ 已打包到 {output_path}")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("用法: python merge_content.py output_dir/ final_output.pptx [原始模板.pptx]")
        sys.exit(1)
    original = sys.argv[3] if len(sys.argv) > 3 else None
    merge(sys.argv[1], sys.argv[2], original)
