#!/usr/bin/env python3
"""
replace_text.py — 精确替换 slide XML 中的文字，保留字体/颜色/特效标签
"""
import re

def replace_text_in_shape(xml_str: str, shape_name: str, new_text: str) -> str:
    """
    在 XML 中找到名为 shape_name 的 <p:sp>，将其中的文字替换为 new_text。
    策略：
    1. 只替换 <a:t> 内的文字内容
    2. 保留第一个 <a:r> 及其 <a:rPr>（字体/颜色/阴影等）
    3. 删除多余的 <a:r>（多 run 情况）
    """

    # 找到对应 shape 的 <p:sp> 块
    # 使用非贪婪匹配，基于 name 属性定位
    escaped_name = re.escape(shape_name)
    pattern = r'(<p:sp>(?:(?!</p:sp>).)*?' + escaped_name + r'(?:(?!</p:sp>).)*?</p:sp>)'
    match = re.search(pattern, xml_str, re.DOTALL)
    if not match:
        # 尝试无 name 属性的宽松匹配（兼容部分模板）
        print(f"  ⚠️  未找到 shape: {shape_name}")
        return xml_str

    sp_block = match.group(1)
    original_sp = sp_block

    # 找到所有 <a:p> 段落
    paragraphs = re.findall(r'<a:p>.*?</a:p>', sp_block, re.DOTALL)
    if not paragraphs:
        return xml_str

    # 取第一个 <a:p> 作为模板段落
    first_para = paragraphs[0]

    # 从第一个段落提取第一个 <a:r>（run，包含格式）
    first_run = re.search(r'<a:r>.*?</a:r>', first_para, re.DOTALL)
    if not first_run:
        return xml_str

    run_block = first_run.group(0)

    # 只替换 <a:t> 内的文字，保留 <a:rPr>
    new_run = re.sub(r'<a:t>.*?</a:t>', f'<a:t>{escape_xml(new_text)}</a:t>', run_block, flags=re.DOTALL)

    # 提取段落属性 <a:pPr>
    pPr_match = re.search(r'<a:pPr.*?(?:/>|>.*?</a:pPr>)', first_para, re.DOTALL)
    pPr = pPr_match.group(0) if pPr_match else ''

    # 构建新的单段落内容
    new_para = f'<a:p>{pPr}{new_run}</a:p>'

    # 删除所有旧 <a:p>，替换为新段落
    new_sp = re.sub(r'<a:p>.*?</a:p>', '', sp_block, flags=re.DOTALL)
    # 在 </p:txBody> 前插入新段落
    new_sp = new_sp.replace('</p:txBody>', f'{new_para}</p:txBody>')

    return xml_str.replace(original_sp, new_sp)


def escape_xml(text: str) -> str:
    """转义 XML 特殊字符"""
    return (
        text
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&apos;')
    )


def replace_multiple(xml_str: str, replacements: dict) -> str:
    """
    批量替换，replacements = { shape_name: new_text, ... }
    """
    for shape_name, new_text in replacements.items():
        xml_str = replace_text_in_shape(xml_str, shape_name, new_text)
    return xml_str


if __name__ == '__main__':
    # 测试
    test_xml = '''<p:sp>
  <p:nvSpPr><p:cNvPr id="3" name="标题 2"/>...</p:nvSpPr>
  <p:txBody>
    <a:bodyPr/>
    <a:p>
      <a:pPr algn="l"/>
      <a:r><a:rPr lang="zh-CN" sz="3200" b="1"><a:solidFill><a:srgbClr val="1D1D1A"/></a:solidFill></a:rPr><a:t>奕境汽车用户运营年度策略规划</a:t></a:r>
    </a:p>
  </p:txBody>
</p:sp>'''

    result = replace_text_in_shape(test_xml, '标题 2', '2026年用户增长全年规划')
    print(result)
