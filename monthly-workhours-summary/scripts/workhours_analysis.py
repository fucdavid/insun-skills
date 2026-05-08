"""
月度工时汇总分析脚本
功能：读取日报Excel，按目标名称统计工时和工作内容
"""
import pandas as pd
import sys

def analyze_monthly_workhours(excel_path):
    # 读取Excel，跳过第一行标题
    df = pd.read_excel(excel_path, header=1, skiprows=[1])
    df.columns = ['日报日期', '业务', '目标名称', '工作内容', '次日待做', '指标完成/量化指标', '时长', '日/月累计工时']
    
    # 过滤有效数据
    df_valid = df[df['时长'].notna()].copy()
    df_valid['时长_num'] = pd.to_numeric(df_valid['时长'], errors='coerce')
    df_valid = df_valid[df_valid['时长_num'].notna()]
    
    # 按目标名称分组统计
    result = df_valid.groupby('目标名称').agg({
        '时长_num': 'sum',
        '工作内容': lambda x: '\n'.join(x.dropna().astype(str))
    }).sort_values('时长_num', ascending=False)
    
    return result

def extract_key_work_contents(work_text_list, max_items=5):
    """从工作内容列表中提取关键主题（简化版：取前N条）"""
    if not work_text_list:
        return []
    
    items = []
    for text in work_text_list[:max_items * 4]:  # 预留足够内容
        # 清理换行符
        clean_text = str(text).replace('\n', ' ').strip()
        if clean_text and len(clean_text) > 5:
            items.append(clean_text)
        if len(items) >= max_items:
            break
    
    return items

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python workhours_analysis.py <excel_path>")
        sys.exit(1)
    
    result = analyze_monthly_workhours(sys.argv[1])
    print("=== 月度工时统计结果 ===")
    for idx, row in result.iterrows():
        print(f"\n目标名称: {idx}")
        print(f"总工时: {row['时长_num']} 小时")
        print(f"工作内容:\n{row['工作内容']}")
