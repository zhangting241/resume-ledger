"""
简历解析模块 - 支持 PDF 和 DOCX 格式
提取：姓名、年龄（从出生日期推算）、学历、工作经历（起止时间+公司+岗位）
"""
import re
import os
from datetime import datetime
from collections import OrderedDict


def parse_resume(filepath: str) -> dict:
    """解析简历文件，返回结构化数据"""
    ext = os.path.splitext(filepath)[1].lower()
    text = ""
    try:
        if ext == ".pdf":
            text = _extract_text_from_pdf(filepath)
        elif ext in (".docx", ".doc"):
            text = _extract_text_from_docx(filepath)
        else:
            text = _extract_text_from_txt(filepath)
    except Exception as e:
        print(f"[ERROR] 无法读取文件 {filepath}: {e}")
        return None

    if not text or len(text.strip()) < 20:
        return None

    # 清理文本
    text = _clean_text(text)

    result = {}
    result["name"] = _extract_name(text)
    result["age"] = _extract_age(text)
    result["education"] = _extract_education(text)
    result["work_experiences"] = _extract_work_experiences(text)
    result["phone"] = _extract_phone(text)
    result["email"] = _extract_email(text)
    result["filename"] = os.path.basename(filepath)

    return result


def _extract_text_from_pdf(filepath: str) -> str:
    import pdfplumber
    text = ""
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def _extract_text_from_docx(filepath: str) -> str:
    from docx import Document
    doc = Document(filepath)
    lines = []
    for para in doc.paragraphs:
        lines.append(para.text)
    # 也读取表格
    for table in doc.tables:
        for row in table.rows:
            row_text = "  ".join(cell.text for cell in row.cells)
            lines.append(row_text)
    return "\n".join(lines)


def _extract_text_from_txt(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def _clean_text(text: str) -> str:
    """清理多余空白"""
    text = re.sub(r'\n\s*\n', '\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def _extract_name(text: str) -> str:
    """
    提取姓名：查找"姓名"关键词，或在文件开头找2-4个汉字
    """
    # 方式1: "姓名：XXX" 或 "姓名: XXX"
    patterns = [
        r'姓名[：:\s]*([^\s,，。；;]{2,4})',
        r'[Nn]ame[：:\s]*([^\s,，。；;]{2,20})',
        r'姓\s*名[：:\s]*([^\s,，。；;]{2,4})',
    ]
    for p in patterns:
        m = re.search(p, text[:800])
        if m:
            name = m.group(1).strip()
            # 过滤非姓名内容
            if re.match(r'^[\u4e00-\u9fff·]{2,4}$', name):
                return name

    # 方式2: 取文件开头的前几个中文字符作为姓名
    lines = text.strip().split('\n')
    for line in lines[:15]:
        line = line.strip()
        # 跳过含关键字的行
        if re.search(r'(简历|个人|应聘|求职|联系|电话|邮箱|地址|性别|民族|政治)', line):
            continue
        # 取2-4个连续汉字
        m = re.search(r'^([\u4e00-\u9fff·]{2,4})$', line)
        if m:
            return m.group(1)

    return "未知"


def _extract_age(text: str) -> str:
    """
    从出生日期推算年龄
    """
    # 生日模式
    birth_patterns = [
        r'(?:出生|生日)[日期年月]?[：:\s]*(\d{4})[年/\-.](\d{1,2})[月/\-.]?(\d{1,2})?',
        r'(\d{4})[年/\-.](\d{1,2})[月/.\-](\d{1,2})[日出]?生',
        r'出生[于在]?[：:\s]*(\d{4})[年/\-.](\d{1,2})[月/.\-]?(\d{1,2})?',
        r'年龄[：:\s]*(\d{2})[岁]?',
        r'(\d{2})\s*岁',
    ]

    # 先尝试直接匹配年龄
    for p in [r'年龄[：:\s]*(\d{1,2})\s*岁?', r'(\d{1,2})\s*岁']:
        m = re.search(p, text[:500])
        if m:
            age = int(m.group(1))
            if 18 <= age <= 70:
                return str(age)

    # 从出生日期推算
    for p in birth_patterns[:3]:
        m = re.search(p, text[:500])
        if m:
            year = int(m.group(1))
            month = int(m.group(2)) if m.lastindex >= 2 else 6
            day = int(m.group(3)) if m.lastindex >= 3 and m.group(3) else 15
            try:
                birth = datetime(year, month, day)
                today = datetime.now()
                age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
                if 18 <= age <= 70:
                    return str(age)
            except:
                pass

    return "未知"


def _extract_education(text: str) -> str:
    """提取最高学历"""
    # 按优先级匹配
    edu_map = OrderedDict([
        ("博士研究生", ["博士研究生", "博士"]),
        ("硕士研究生", ["硕士研究生", "硕士"]),
        ("本科", ["本科", "学士", "大学本科"]),
        ("大专", ["大专", "专科"]),
        ("高中/中专", ["高中", "中专", "中技", "职高"]),
    ])

    # 先搜索"学历："关键词
    m = re.search(r'学历[：:\s]*([^\s,，。；;]{2,20})', text[:600])
    if m:
        edu_text = m.group(1).strip()
        for level, keywords in edu_map.items():
            for kw in keywords:
                if kw in edu_text:
                    return level

    # 全文搜索
    text_upper = text[:1500]
    for level, keywords in edu_map.items():
        for kw in keywords:
            if kw in text_upper:
                return level

    return "未知"


def _extract_phone(text: str) -> str:
    """提取手机号"""
    m = re.search(r'1[3-9]\d{9}', text[:500])
    return m.group(0) if m else ""


def _extract_email(text: str) -> str:
    """提取邮箱"""
    m = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text[:500])
    return m.group(0) if m else ""


def _extract_work_experiences(text: str) -> list:
    """
    提取工作经历：每条经历包含 起止时间、公司、岗位
    支持智联/Boss等常见简历格式（公司+岗位在第一行，时间在第二行）
    """
    experiences = []

    work_section = _find_work_section(text)
    if not work_section:
        work_section = text

    lines = [l.strip() for l in work_section.split('\n') if l.strip()]
    time_range_pattern = r'(\d{4}[年./\-]\d{1,2})\s*[-~—至到]\s*(\d{4}[年./\-]\d{1,2}|至今|现在|目前)'

    i = 0
    while i < len(lines):
        line = lines[i]
        if len(line) < 10:
            i += 1
            continue

        m = re.search(time_range_pattern, line)
        if not m:
            i += 1
            continue

        start_time = m.group(1)
        end_time = m.group(2)
        # 提取该行时间后的剩余文本
        rest = line[m.end():].strip()
        rest = _clean_work_rest(rest)
        # 去掉薪资前缀：6001 - 8000 元/月
        rest = re.sub(r'^\s*\d{4,5}\s*[-~—至到]\s*\d{4,5}\s*元\s*/\s*月\s*', '', rest)
        rest = rest.strip()

        company = ""
        position = ""

        # 策略1：当前行剩余文本含公司+岗位
        if rest and len(rest) >= 3:
            company, position = _split_company_position(rest)

        # 策略2：当前行只有时间，往前看上一行（智联典型格式：公司 岗位）
        if not company and i > 0:
            prev = lines[i - 1].strip()
            if prev and not _is_section_title(prev) and len(prev) >= 3:
                # 跳过纯薪资行
                if not re.match(r'^\d{4,5}\s*[-~—至到]\s*\d{4,5}', prev):
                    company, position = _split_company_position(prev)

        # 策略3：往前两行（偶尔有额外空行或描述行）
        if not company and i > 2:
            prev2 = lines[i - 2].strip()
            if prev2 and not _is_section_title(prev2) and len(prev2) >= 3:
                if not re.match(r'^\d{4,5}\s*[-~—至到]\s*\d{4,5}', prev2):
                    company, position = _split_company_position(prev2)

        if company and len(company) > 1:
            experiences.append({
                "period": f"{start_time}-{end_time}",
                "company": company,
                "position": position if position else "未识别"
            })

        i += 1

    return experiences


def _clean_work_rest(text: str) -> str:
    """清理工作经历剩余文本"""
    # 去掉序号前缀
    text = re.sub(r'^\s*(?:[\d一二三四五六七八九十]+[、\.。,，\)\]）])\s*', '', text)
    text = re.sub(r'^\s*(?:[\(（]\d+[\)）])\s*', '', text)
    text = re.sub(r'^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩])\s*', '', text)
    # 去掉开头括号内容（时长）
    text = re.sub(r'^\s*[\(（][^\)）]*[\)）]\s*', '', text)
    return text.strip()


def _is_section_title(text: str) -> bool:
    """判断是否为段落标题（不应被当作公司名）"""
    keywords = ['工作描述', '工作详情', '项目经历', '教育经历', '自我评价',
                '所获证书', '技能证书', '培训经历', '项目描述', '工作经历',
                '求职意向', '个人优势', '基本信息']
    return any(kw in text for kw in keywords)


def _find_work_section(text: str) -> str:
    """找到工作经历相关段落"""
    # 搜索标志性标题
    patterns = [
        r'(工\s*作\s*经\s*历|工\s*作\s*经\s*验|职\s*业\s*经\s*历|从\s*业\s*经\s*历)',
        r'(Work\s*Experience|Professional\s*Experience)',
    ]

    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            # 从标题开始取后续内容（约2000字符）
            start = m.start()
            section = text[start:start + 3000]

            # 检查是否有下一个大标题（项目经历、教育背景等），截断
            stop_patterns = [
                r'\n\s*(项\s*目\s*经\s*历|教\s*育\s*背\s*景|教\s*育\s*经\s*历|自\s*我\s*评\s*价|技\s*能\s*证\s*书|培\s*训\s*经\s*历)',
                r'\n\s*(Project|Education|Skills|Certification|Self-evaluation)',
            ]
            for sp in stop_patterns:
                sm = re.search(sp, section[20:], re.IGNORECASE)
                if sm:
                    section = section[:20 + sm.start()]
                    break

            return section

    return ""


def _split_company_position(text: str) -> tuple:
    """将工作经历描述拆分为 公司名 + 岗位"""
    text = text.strip()
    if not text:
        return "", ""

    # ===== 策略1: 识别常见句式 =====
    # 模式A: 就职于[公司]担任[岗位]
    m = re.search(r'(?:就职于|曾在|于|在|入职|加入)\s*([^\s,，。；;，]{2,30})(?:担任|任|做|为|做|任)\s*([^\s,，。；;]{2,15})', text)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # 模式B: [公司]担任[岗位]一职
    m = re.search(r'([^\s,，。；;]{3,30})(?:担任|任)\s*([^\s,，。；;]{2,15})(?:一职|岗位|工作|职务|职位)', text)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # 模式C: [公司]-[岗位]
    m = re.search(r'([^\s,，。；;]{3,30})\s*-\s*([^\s,，。；;]{2,15})', text)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # 模式D: [公司]|[岗位]
    m = re.search(r'([^\s,，。；;]{3,30})\s*[｜|]\s*([^\s,，。；;]{2,15})', text)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # 模式E: [岗位]于[公司]
    m = re.search(r'([^\s,，。；;]{2,15})(?:于|在)\s*([^\s,，。；;]{3,30})', text)
    if m:
        return m.group(2).strip(), m.group(1).strip()

    # 模式F: 曾在[公司]和[公司]担任[岗位]
    m = re.search(r'(?:曾在|在|于)\s*([^\s,，。；;]{3,30})(?:和|及|与|、)?[^\s,，。；;]*(?:担任|任)\s*([^\s,，。；;]{2,15})', text)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # ===== 策略2: 单个空格分隔（智联简历典型格式：公司 岗位） =====
    # 例：润加物业服务(深圳)有限公司 物业经理
    if ' ' in text and not re.search(r'\s{2,}', text):
        idx = text.rfind(' ')
        if idx > 2:
            left = text[:idx].strip()
            right = text[idx+1:].strip()
            # 右边看起来像岗位（有岗位关键词 或 较短）
            if len(left) >= 3 and len(right) >= 2:
                position_keywords = [
                    '工程师', '经理', '主管', '总监', '专员', '助理', '顾问',
                    '架构师', '程序员', '开发者', '运营', '产品', '设计师',
                    '会计', '出纳', '行政', '人事', 'HR', '销售', '市场',
                    '实习', '管培生', 'VP', 'CEO', 'CTO', 'COO', 'CFO',
                    'Manager', 'Engineer', 'Director', 'Lead',
                    '开发', '测试', '前端', '后端', '全栈', '运维',
                    '总裁', '副总裁', '主任', '科长', '处长', '局长',
                    '教授', '讲师', '研究员', '分析师', '策划', '编辑',
                    '店长', '副店长', '店员', '客服', '品质', '安全',
                    '管理', '物业', '招商', '保安', '保洁', '绿化工',
                    '项目经理', '客服经理', '工程主管', '工程经理',
                    '副经理', '区域经理', '城市经理', '业务经理',
                    '安装工程师', '土建工程师', '电气工程师',
                    '技术支持', '技术经理', '技术主管',
                    '维修', '技工', '电工', '水暖工', '木工',
                    '消防', '监控', '秩序', '巡逻',
                    '管家', '楼栋', '客服前台',
                    '中控', '中控员', '安全员', '施工员',
                ]
                has_kw = any(kw in right for kw in position_keywords)
                if has_kw or len(right) <= 25:
                    return left[:40], right[:20]

    # ===== 策略3: 常见分隔符（多空格） =====
    separators = ['  ', '   ', '\t', ' | ', '｜', ' - ', ' – ', ' — ']
    for sep in separators:
        if sep in text:
            parts = text.split(sep, 1)
            if len(parts) == 2:
                return parts[0].strip(), parts[1].strip()

    # ===== 策略4: 岗位关键词反向匹配 =====
    position_keywords = [
        '工程师', '经理', '主管', '总监', '专员', '助理', '顾问',
        '架构师', '程序员', '开发者', '运营', '产品', '设计师',
        '会计', '出纳', '行政', '人事', 'HR', '销售', '市场',
        '实习', '管培生', 'VP', 'CEO', 'CTO', 'COO', 'CFO',
        'Manager', 'Engineer', 'Director', 'Lead',
        '开发', '测试', '前端', '后端', '全栈', '运维',
        '总裁', '副总裁', '主任', '科长', '处长', '局长',
        '教授', '讲师', '研究员', '分析师', '策划', '编辑',
        '店长', '副店长', '店员', '客服', '品质', '安全',
        '管理', '物业', '招商', '保安', '保洁', '绿化工',
        '项目经理', '客服经理', '工程主管', '工程经理',
        '副经理', '区域经理', '城市经理', '业务经理',
        '安装工程师', '土建工程师', '电气工程师',
        '技术支持', '技术经理', '技术主管',
        '维修', '技工', '电工', '水暖工', '木工',
        '消防', '监控', '秩序', '巡逻',
        '管家', '楼栋', '客服前台',
        '中控', '中控员', '安全员', '施工员',
    ]

    for kw in position_keywords:
        idx = text.rfind(kw)
        if idx > 0 and idx >= 4:
            company = text[:idx].strip().rstrip('，,。.担任任就职于在加入和及与、')
            position = text[idx:].strip().lstrip('，,。.')
            if len(company) >= 2 and len(position) >= 2:
                return company[:40], position[:20]

    # ===== 策略5: 最短文本尝试 =====
    if 4 <= len(text) <= 25:
        m = re.match(r'([\u4e00-\u9fff（）()a-zA-Z·&\u3000]{3,20})([\u4e00-\u9fff]{2,15})$', text)
        if m:
            return m.group(1), m.group(2)

    # ===== 策略6: 含"担任"但未命中前面模式 =====
    if '担任' in text:
        idx = text.index('担任')
        if idx > 2:
            return text[:idx].strip()[:40], text[idx+2:].strip()[:20]

    return text[:50], "未识别"


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        result = parse_resume(sys.argv[1])
        import json
        print(json.dumps(result, ensure_ascii=False, indent=2))
