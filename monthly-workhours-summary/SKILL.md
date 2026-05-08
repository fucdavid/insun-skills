---
name: monthly-workhours-summary
description: 月度工时汇总分析技能。当用户需要分析月度工作日报Excel、统计各项目/目标的总工时、提取工作内容摘要时使用此技能。输出格式包含目标名称、工时数、占比，以及归纳为4-5条的主要工作内容。
agent_created: true
---

# 月度工时汇总分析

## 功能说明

分析月度工作日报Excel文件，按目标名称统计总工时，提取并归纳主要工作内容。

## 输入

- 日报Excel文件路径（如 `D:/Users/Desktop/日报.xlsx`）

## 输出格式

生成可复制的纯文本统计表，格式如下：

```
[目标名称1] [工时]h ([占比]%)
① [工作内容1]
② [工作内容2]
③ [工作内容3]
④ [工作内容4]
⑤ [工作内容5]

[目标名称2] [工时]h ([占比]%)
① [工作内容1]
...

合计：[总工时]h
```

## 分析步骤

1. **读取Excel数据**
   - 使用 `header=1` 跳过第一行（标题行）
   - 使用 `skiprows=[1]` 跳过列名行
   - 手动设置列名：`日报日期`, `业务`, `目标名称`, `工作内容`, `次日待做`, `指标完成/量化指标`, `时长`, `日/月累计工时`

2. **数据清洗**
   - 过滤 `时长` 非空行
   - 使用 `pd.to_numeric(df['时长'], errors='coerce')` 转换时长为数字
   - 过滤转换后为 NaN 的行

3. **按目标名称分组统计**
   ```python
   result = df_valid.groupby('目标名称')['时长_num'].sum().sort_values(ascending=False)
   ```

4. **提取工作内容**
   - 收集每个目标名称下的所有工作内容
   - 归纳为4-5条主要工作要点
   - 使用中文圈号序号（①②③④⑤）便于复制

5. **输出结果**
   - 保存为 `.txt` 文件到工作目录
   - 确保换行符正确（`\n`）
   - 使用圈号序号而非阿拉伯数字（避免渲染问题）

## 示例代码

```python
import pandas as pd

def analyze_workhours(excel_path):
    df = pd.read_excel(excel_path, header=1, skiprows=[1])
    df.columns = ['日报日期', '业务', '目标名称', '工作内容', '次日待做', '指标完成/量化指标', '时长', '日/月累计工时']
    
    df_valid = df[df['时长'].notna()].copy()
    df_valid['时长_num'] = pd.to_numeric(df_valid['时长'], errors='coerce')
    df_valid = df_valid[df_valid['时长_num'].notna()]
    
    result = df_valid.groupby('目标名称')['时长_num'].sum().sort_values(ascending=False)
    total = result.sum()
    
    for name, hours in result.items():
        pct = hours / total * 100
        print(f"{name} {hours}h ({pct:.1f}%)")
    
    return result
```

## 注意事项

- 时长列为 `object` 类型，需要先转换为数字
- 日报可能包含月末汇总行（如"4月月度执行(D)"），需确保过滤掉
- 工作内容需手动归纳为4-5条关键要点
- 输出保存为txt文件以便用户直接复制
