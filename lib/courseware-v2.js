/**
 * Tongcheng Unified K12 Courseware Template Engine (v2.1).
 *
 * Bundles the official Tongcheng v2.1 CSS (`unified-courseware.css`) and the
 * official upright no-TM SVG logo (`tongcheng-logo-color-no-tm.svg`) so any
 * teacher using `tongcheng-tiku-weekly` can generate standalone, self-contained
 * student + teacher HTML courseware pairs across all 6 K12 subject presets
 * (including 新概念英语 2) and feed them straight into Step ② draft / OSS upload.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WeeklyError } from './http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(HERE, '..', 'assets', 'courseware-v2');
const TEACHER_MAX_BYTES = 3 * 1024 * 1024;

let cachedCss = null;
let cachedLogoDataUri = null;

function loadCss() {
  if (!cachedCss) {
    cachedCss = readFileSync(join(ASSET_DIR, 'unified-courseware.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
  }
  return cachedCss;
}

function loadLogoDataUri() {
  if (!cachedLogoDataUri) {
    const svg = readFileSync(join(ASSET_DIR, 'tongcheng-logo-color-no-tm.svg'));
    cachedLogoDataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  }
  return cachedLogoDataUri;
}

/**
 * 6 official v2.1 subject presets aligned with Desktop/童澄统一课件模板-v2.
 */
export const COURSEWARE_PRESETS = {
  nce: {
    key: 'nce',
    aliases: ['nce2', '新概念', '新概念2', '新概念英语', '新概念英语2'],
    subject: 'nce',
    name: '新概念英语 2',
    subjLabel: '新概念英语 2',
    category: '英语',
    components: ['课文听读', '分页词卡朗读', '逐句精读', '语法专题', 'L0-L3 渐隐背诵', '用证据写摘要', '随堂自检'],
    sampleSpec: {
      preset: 'nce',
      title: 'Lesson 84 · On strike',
      headerTitle: '新概念英语 2 · Lesson 84 On strike',
      badgeList: ['新概念英语 2', 'Lesson 84'],
      coverGoal: '掌握核心词汇与一般将来时表达，完成逐句精读、L0-L3 阶梯背诵与课文摘要输出。',
      words: [
        { emoji: '🚌', en: 'strike', ph: '/straɪk/', cn: 'n. 罢工 · go on strike' },
        { emoji: '📣', en: 'state', ph: '/steɪt/', cn: 'v. 正式宣布 · state that...' },
        { emoji: '🤝', en: 'relieve', ph: '/rɪˈliːv/', cn: 'v. 减轻，缓解 · relieve pressure' },
        { emoji: '🚗', en: 'offer', ph: '/ˈɒfə(r)/', cn: 'v. 主动提出 · offer to do' },
      ],
      wordTip: '重点搭配：<b>go on strike</b>（举行罢工）；<b>offer to do sth.</b>（主动提出做某事）。',
      reciteLines: [
        {
          full: 'Busmen have decided to go on strike next week.',
          cn: '公共汽车司机们已决定下周举行罢工。',
          blanks1: ['decided', 'strike', 'next week'],
          blanks2: ['have decided to', 'go on strike', 'next week'],
          lead: 'Busmen have decided ...',
        },
        {
          full: 'The strike is due to begin on Tuesday.',
          cn: '罢工定于星期二开始。',
          blanks1: ['due', 'begin', 'Tuesday'],
          blanks2: ['is due to begin', 'on Tuesday'],
          lead: 'The strike is due ...',
        },
      ],
      quickCheck: {
        title: '语境自检：be due to 与将来时态',
        question: 'The busmen have decided to go on strike and the strike ______ begin on Tuesday.',
        options: [
          { key: 'A', text: 'is due to' },
          { key: 'B', text: 'was due to' },
          { key: 'C', text: 'due to' },
          { key: 'D', text: 'are due to' },
        ],
        answer: 'A',
        explain: {
          hint: '主语 the strike 是单数，且罢工定于下周二开始。',
          steps: 'be due to do sth. 表示「定于/预计做某事」，主语 the strike 为单数，故填 is due to。',
          pitfall: '不要漏掉 be 动词误选 C（due to 作介词短语意为「由于」）。',
        },
      },
      entranceExam: {
        title: '进门考复盘：上一课核心词与句型',
        prompt: '回顾上一课重点句型与高频词，检查前置知识掌握情况。',
        keyPoints: ['核对高频词搭配与语态区别。', '引出本课核心语法与课文主题。'],
        teacherNote: '建议用时 5 分钟，讲评课前错题后自然过渡到新课。',
      },
      exitExam: {
        title: '出门清核验：句型仿写与细节理解',
        prompt: '围绕本课核心事件，抽查 2 句重点句型口头输出与细节问答。',
        keyPoints: ['核对重点短语与时态准确性。', '引导学生进入课后巩固练习。'],
        teacherNote: '建议用时 8 分钟，收口确认学生掌握本课核心结论。',
      },
    },
  },

  math: {
    key: 'math',
    aliases: ['数学', '初中数学', '小学数学'],
    subject: 'math',
    name: '数学',
    subjLabel: '数学',
    category: '数学',
    components: ['核心公式', '分步例题', '易错避坑', '随堂自检', '动态抛物线实验'],
    sampleSpec: {
      preset: 'math',
      title: '分式方程的解法与增根检验',
      headerTitle: '七年级数学 · 分式方程与增根检验',
      badgeList: ['七年级数学', '专题精讲'],
      coverGoal: '掌握去分母化整式方程的四步标准流程，做到「乘遍每一项、解完必代检」。',
      formula: '$$\\text{分式方程} \\xrightarrow{\\text{同乘最简公分母}} \\text{整式方程} \\xrightarrow{\\text{求根}} x = x_0 \\xrightarrow{\\text{代入检验}} \\text{公分母} \\neq 0$$',
      points: [
        '<b>找</b>：因式分解各分母，确定最简公分母。',
        '<b>去</b>：两边每一项（含常数项）同乘最简公分母。',
        '<b>解</b>：解所得整式方程。',
        '<b>检</b>：代入最简公分母检验是否为增根。',
      ],
      pitfall: '<b>高频易错：</b>去分母时漏乘常数项；解出 $x$ 后忘记写「经检验」。',
      tip: '口诀：<b>乘遍每一项，解完必代检。</b>',
      example: {
        title: '例 1：解分式方程并判断增根',
        problem: '解方程：$\\dfrac{x-3}{x-2} + 1 = \\dfrac{3}{2-x}$',
        steps: [
          { label: '变形', text: '把右边改写为 $-\\dfrac{3}{x-2}$，最简公分母为 $(x-2)$。' },
          { label: '去分母', text: '两边同乘 $(x-2)$ 得 $(x-3) + (x-2) = -3$。' },
          { label: '解整式', text: '合并同类项得 $2x - 5 = -3$，解得 $x = 1$。' },
          { label: '检验', text: '代入 $x - 2 = -1 \\neq 0$，故 $x = 1$ 是原方程的解。' },
        ],
      },
      includeMathSandbox: true,
    },
  },

  chem: {
    key: 'chem',
    aliases: ['chemistry', '化学', '九年级化学'],
    subject: 'chem',
    name: '化学',
    subjLabel: '化学',
    category: '化学',
    components: ['核心方程式', '物质转化流程链', '分步实验推导', '烧杯反应动画'],
    sampleSpec: {
      preset: 'chem',
      title: '物质的鉴别、除杂与分离',
      headerTitle: '九年级化学 · 鉴别、除杂与分离',
      badgeList: ['九年级化学', '专题精讲'],
      coverGoal: '掌握「不增、不减、易分」除杂三原则，准确选择试剂与过滤/蒸发步骤。',
      chain: [
        { text: '混合物\n$\\mathrm{NaCl}$ (含 $\\mathrm{Na_2CO_3}$)', accent: false },
        { arrow: '加适量稀 $\\mathrm{HCl}$' },
        { text: '反应转化\n$\\mathrm{Na_2CO_3 + 2HCl = 2NaCl + CO_2\\uparrow + H_2O}$', accent: true },
        { arrow: '蒸发结晶' },
        { text: '纯净物\n$\\mathrm{NaCl}$ 固体', accent: false },
      ],
      points: [
        '<b>不增</b>：不引入新的可溶性杂质离子。',
        '<b>不减</b>：不与被提纯的主物质反应。',
        '<b>易分</b>：产物为气体、水或沉淀，便于分离。',
      ],
      pitfall: '<b>高频易错：</b>过滤后务必先确认目标物在「滤液」还是「滤渣」。',
      includeChemSim: true,
    },
  },

  eng: {
    key: 'eng',
    aliases: ['english', '英语', '小学英语', '初中英语'],
    subject: 'eng',
    name: '英语',
    subjLabel: '英语',
    category: '英语',
    components: ['翻面词卡朗读', '句型逐句朗读', '随堂自检'],
    sampleSpec: {
      preset: 'eng',
      title: 'Unit 3 · Animals and their homes',
      headerTitle: '四年级英语 · U3 Animals and their homes',
      badgeList: ['四年级英语', 'Unit 3'],
      coverGoal: '会读会拼核心词汇，熟练运用 Where do/does ... live? 问答。',
      words: [
        { emoji: '🦅', en: 'eagle', ph: '/ˈiːɡl/', cn: '老鹰 · in a big nest' },
        { emoji: '🐝', en: 'hive', ph: '/haɪv/', cn: '蜂巢 · bees live in a hive' },
        { emoji: '🦉', en: 'tree hole', ph: '/triː həʊl/', cn: '树洞 · owls live in tree holes' },
        { emoji: '🐿️', en: 'nest', ph: '/nest/', cn: '鸟巢 · birds make nests' },
      ],
      sentences: [
        { en: 'Where do honeybees live? — They live in a hive.', cn: '蜜蜂住在哪里？—— 它们住在蜂巢里。', note: '复数主语配 do + 动词原形 live。' },
        { en: 'Where does an owl live? — It lives in a tree hole.', cn: '猫头鹰住在哪里？—— 它住在树洞里。', note: '单数主语配 does + 答句三单 lives。' },
      ],
    },
  },

  chn: {
    key: 'chn',
    aliases: ['chinese', '语文', '文言文', '语文精读'],
    subject: 'chn',
    name: '语文精读',
    subjLabel: '语文',
    category: '语文',
    components: ['点词精注', '实词辨析自检'],
    sampleSpec: {
      preset: 'chn',
      title: '《陋室铭》· 点词精注与阶梯背诵',
      headerTitle: '语文精读 · 《陋室铭》',
      badgeList: ['语文精读', '文言文'],
      coverGoal: '掌握核心文言实词与词类活用，理解托物言志写法。',
      segments: [
        { text: '山不在高，有仙则' },
        { word: '名', pinyin: 'míng', meaning: '动词，出名、闻名（名词活用作动词）', note: '高频词类活用考点。' },
        { text: '。水不在深，有龙则' },
        { word: '灵', pinyin: 'líng', meaning: '显得灵验、神奇', note: '与前句「名」互文对仗。' },
        { text: '。斯是陋室，惟吾' },
        { word: '德馨', pinyin: 'dé xīn', meaning: '德行美好', note: '全篇核心主旨句。' },
        { text: '。' },
      ],
    },
  },

  phys: {
    key: 'phys',
    aliases: ['physics', '物理', '初中物理', '高中物理'],
    subject: 'phys',
    name: '物理',
    subjLabel: '物理',
    category: '物理',
    components: ['核心公式与定律', '分步受力/电路例题', '易错避坑', '随堂自检'],
    sampleSpec: {
      preset: 'phys',
      title: '欧姆定律与串并联电路分析',
      headerTitle: '初中物理 · 欧姆定律与电路分析',
      badgeList: ['初中物理', '专题精讲'],
      coverGoal: '掌握 I = U/R 及其变形，能结合串并联特点分析动态电路变化。',
      formula: '$$I = \\dfrac{U}{R} \\quad \\Longrightarrow \\quad U = IR,\\; R = \\dfrac{U}{I}$$',
      points: [
        '<b>同体性</b>：$I$、$U$、$R$ 必须对应同一段导体或同一用电器。',
        '<b>同时性</b>：必须是电路处于同一状态时的对应物理量。',
        '<b>决定式区分</b>：电阻 $R$ 由导体材料、长度、横截面积和温度决定，与 $U$、$I$ 无关。',
      ],
      pitfall: '<b>高频易错：</b>不能由 $R = U/I$ 得出“电阻与电压成正比、与电流成反比”的错误结论。',
      tip: '<b>本课口诀：</b>先看连接方式，再找电表测量对象，最后用欧姆定律算变化。',
      example: {
        title: '例 1：滑动变阻器动态电路判断',
        problem: '定值电阻 $R_1$ 与滑动变阻器 $R_2$ 串联接在恒定电源两端，滑片 $P$ 向右移使 $R_2$ 变大，判断电流表与 $R_2$ 两端电压表示数变化。',
        steps: [
          { label: '看总电阻', text: '$R_2$ 变大 $\\Rightarrow$ 串联总电阻 $R_{\\text{总}} = R_1 + R_2$ 变大。' },
          { label: '看总电流', text: '电源电压 $U$ 不变，由 $I = U / R_{\\text{总}}$ 得电流表示数变小。' },
          { label: '看分压', text: '$U_1 = I R_1$ 变小，故 $U_2 = U - U_1$ 变大。' },
        ],
      },
    },
  },

  python: {
    key: 'python',
    aliases: ['py', '信息科技', '编程', '信息学'],
    subject: 'python',
    name: 'Python 创造课',
    subjLabel: 'Python',
    category: '信息科技',
    components: ['代码预测', '动手实操', 'AI 协作规范'],
    sampleSpec: {
      preset: 'python',
      title: '第 1 课 · 小乌龟的神笔',
      headerTitle: 'Python 创造课 · 第 1 课 小乌龟的神笔',
      badgeList: ['Python 创造课', '第 1 课'],
      coverGoal: '先预测 turtle 画笔轨迹，再动手运行并改写程序。',
      code: 'import turtle\nt = turtle.Turtle()\nt.color("#FF790B")\nfor i in range(4):\n    t.forward(120)\n    t.right(90)',
      predictAnswer: '运行结果：顺时针画出一个边长 120 像素的正方形。',
      labMeta: { taskSlug: 'lesson-01', runtime: 'turtle-browser', title: '打开编程沙盒实战', desc: '在浏览器中直接运行代码并自动保存。' },
      aiRule: '<b>AI 协作规范：</b>🟢 让 AI 解释报错；🟡 卡壳时要思路提示；🔴 不直接让 AI 代写整段作业代码。',
    },
  },
};

export function resolvePreset(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return COURSEWARE_PRESETS.nce;
  if (COURSEWARE_PRESETS[raw]) return COURSEWARE_PRESETS[raw];
  for (const preset of Object.values(COURSEWARE_PRESETS)) {
    if (preset.aliases.some((a) => a.toLowerCase() === raw || raw.includes(a.toLowerCase()))) {
      return preset;
    }
  }
  throw new WeeklyError(`未识别的课件模板「${input}」，可选：nce（新概念2）、eng、chn、math、phys、chem、python`, {
    code: 'UNKNOWN_PRESET',
    status: 400,
  });
}

export function listCoursewarePresets() {
  return {
    version: 'v2.1',
    brand: {
      primaryOrange: '#FF790B',
      accentYellow: '#FFD110',
      inkOrange: '#B84E06',
      logo: 'official-upright-no-tm-svg (inlined)',
    },
    isolationRule: '学生版（默认）隐藏三珠进度条与重复进/出门考，仅留自学内容并在末页回流 class_lesson_tasks；老师私有版保留三珠（进门考→课程学习→出门清）与教师讲授备注。',
    presets: Object.values(COURSEWARE_PRESETS).map((p) => ({
      key: p.key,
      name: p.name,
      category: p.category,
      components: p.components,
    })),
  };
}

/** Build the unified slides array from high-level teacher/LLM spec (or pass-through custom slides). */
export function buildCourseSpec(input = {}) {
  const preset = resolvePreset(input.preset || input.subject || 'nce');
  const sample = preset.sampleSpec;
  const title = String(input.title || sample.title).trim();
  const headerTitle = String(input.headerTitle || `${preset.name} · ${title}`).trim();
  const coverGoal = String(input.coverGoal || input.goal || sample.coverGoal || '').trim();
  const badgeList = Array.isArray(input.badgeList) && input.badgeList.length
    ? input.badgeList
    : [preset.name, ...(input.lessonLabel ? [input.lessonLabel] : [])];

  if (Array.isArray(input.slides) && input.slides.length > 0) {
    return {
      preset,
      course: {
        id: preset.key,
        subject: preset.subject,
        subjLabel: input.subjLabel || preset.subjLabel,
        headerTitle,
        badgeList,
        coverTitle: title,
        coverGoal,
        classMinutes: Number(input.classMinutes) || 90,
        slides: input.slides,
      },
    };
  }

  const slides = [];
  const classMinutes = Number(input.classMinutes) || 90;
  const teacherFlow = input.teacherFlow || [
    { num: '1', title: '进门考诊断（约 10 分钟）', desc: '讲评课前诊断错题，快速衔接本课主题。' },
    { num: '2', title: `${title} 精讲与互动（约 ${Math.max(25, classMinutes - 20)} 分钟）`, desc: coverGoal || '按词汇、精读、语法与背诵节奏逐页推进，可随时自由跳页。' },
    { num: '3', title: '出门清核验（约 10 分钟）', desc: '复述本课核心结论，完成堂清验收与课后巩固衔接。' },
  ];
  const studentFlow = input.studentFlow || [
    { num: '1', title: '听读与核心词汇', desc: coverGoal || '先听懂主线，再翻卡跟读核心词与搭配。' },
    { num: '2', title: '精讲、语法与背诵', desc: '逐句理解结构与语法要点，阶梯巩固背诵。' },
    { num: '3', title: '随堂自检与总结', desc: '做几道不计分快检核对理解，带着本课结论去做练习。' },
  ];

  slides.push({
    id: 'cover',
    stage: 'study',
    audience: 'both',
    type: 'cover',
    seg: '本课导览',
    teacherFlow,
    studentFlow,
  });

  // Teacher-only entrance exam review slide
  const entrance = input.entranceExam || sample.entranceExam || {
    title: `进门考诊断：${title} 前置知识`,
    prompt: '回顾上一讲核心知识，讲评课前诊断中错误率最高的 1–2 个要点。',
    keyPoints: ['确认前置知识无盲区，再进入本节新课。', '可直接口答或投屏讲评，不占用过多课堂时间。'],
    teacherNote: '建议用时 5–10 分钟，可根据班级节奏随时跳到下一页。',
  };
  slides.push({
    id: 'entrance',
    stage: 'entrance',
    audience: 'teacher',
    type: 'teacher-exam',
    seg: '进门考',
    tag: '进门考讲评',
    tagClass: 'exam',
    source: '建议用时：约 5–10 分钟',
    ...entrance,
  });

  // Full-text listening & bilingual reading slide (works with real audioUrl OR built-in en-GB TTS)
  const passageParagraphs = Array.isArray(input.passageParagraphs) && input.passageParagraphs.length
    ? input.passageParagraphs
    : (typeof input.passage === 'string' && input.passage.trim()
      ? input.passage.trim().split(/\n+/).map((en) => ({ en: en.trim(), cn: '' })).filter((p) => p.en)
      : []);
  if (passageParagraphs.length > 0) {
    slides.push({
      id: 'text-listen',
      stage: 'study',
      audience: 'both',
      type: 'text-listen',
      seg: '课文听读',
      tag: '课文听读',
      title: `完整课文听读：${title}`,
      source: '第一遍可先隐藏译文抓主线，第二遍逐句跟读',
      audioUrl: input.audioUrl || null,
      paragraphs: passageParagraphs,
      teacherNote: input.passageTeacherNote || '建议用时 8 分钟：先盲听抓人物和事件，再对照英文跟读。',
    });
  }

  // Subject-specific study slides (auto-paginated word cards: 6 per slide)
  const words = input.words || input.vocabCards || sample.words;
  if (Array.isArray(words) && words.length > 0) {
    const chunkSize = 6;
    const totalPages = Math.ceil(words.length / chunkSize);
    for (let p = 0; p < totalPages; p += 1) {
      const slice = words.slice(p * chunkSize, (p + 1) * chunkSize);
      slides.push({
        id: totalPages === 1 ? 'words' : `words-${p + 1}`,
        stage: 'study',
        audience: 'both',
        type: 'word-cards',
        seg: totalPages === 1 ? '核心词汇' : `核心词汇 (${p + 1}/${totalPages})`,
        tag: '核心词汇',
        title: totalPages === 1 ? `核心词汇：${title}` : `核心词汇（第 ${p + 1}/${totalPages} 组）：${title}`,
        source: '点击卡片翻看释义，点击「朗读」跟读发音',
        words: slice,
        tip: input.wordTip || sample.wordTip || '点击每张词卡跟读 2 遍，重点记住词性与固定搭配。',
        teacherNote: input.wordsTeacherNote || '先带读英文，再翻面抽查中文释义与搭配。',
      });
    }
  }

  // Close reading (3 sentences per slide: original + structure breakdown + toggleable Chinese + read-aloud)
  const closeReading = Array.isArray(input.closeReading) ? input.closeReading : [];
  if (closeReading.length > 0) {
    const chunkSize = 3;
    const totalPages = Math.ceil(closeReading.length / chunkSize);
    for (let p = 0; p < totalPages; p += 1) {
      const slice = closeReading.slice(p * chunkSize, (p + 1) * chunkSize);
      slides.push({
        id: totalPages === 1 ? 'close-reading' : `close-reading-${p + 1}`,
        stage: 'study',
        audience: 'both',
        type: 'close-reading',
        seg: totalPages === 1 ? '逐句精读' : `逐句精读 (${p + 1}/${totalPages})`,
        tag: '逐句精读',
        title: totalPages === 1 ? `逐句精读：${title}` : `逐句精读（第 ${p + 1}/${totalPages} 组）：${title}`,
        source: '先听读原句、拆解主干与结构，再核对中文翻译',
        items: slice,
        startIndex: p * chunkSize + 1,
        teacherNote: '逐句定位主干、时态与连接关系，可一键遮住译文提问学生。',
      });
    }
  }

  // Dedicated grammar / sentence analysis slides
  const grammarSlides = Array.isArray(input.grammarSlides) ? input.grammarSlides : [];
  grammarSlides.forEach((g, idx) => {
    slides.push({
      id: `grammar-${idx + 1}`,
      stage: 'study',
      audience: 'both',
      type: 'kp-pitfall',
      seg: g.seg || `语法精讲 ${idx + 1}`,
      tag: g.tag || '核心语法',
      title: g.title || `${title} · 核心语法 ${idx + 1}`,
      source: g.source || '结合课文原句理解用法与易错对比',
      formula: g.formula || '',
      points: Array.isArray(g.points) ? g.points : (g.body ? [g.body] : []),
      pitfall: g.pitfall || '<b>易错提醒：</b>注意时态、语态与主谓一致。',
      tip: g.tip || g.conclusion || '<b>本页小结：</b>用本页句型仿写 1 个句子。',
      teacherNote: g.teacherNote || '结合课文例句讲清规则，再请学生口头仿写。',
    });
  });

  // Auto-paginated L0-L3 fade recitation (4 lines per slide)
  const reciteLines = input.reciteLines || input.reciteParagraphs || sample.reciteLines;
  if (Array.isArray(reciteLines) && reciteLines.length > 0) {
    const chunkSize = 4;
    const totalPages = Math.ceil(reciteLines.length / chunkSize);
    for (let p = 0; p < totalPages; p += 1) {
      const slice = reciteLines.slice(p * chunkSize, (p + 1) * chunkSize);
      slides.push({
        id: totalPages === 1 ? 'recite' : `recite-${p + 1}`,
        stage: 'study',
        audience: 'both',
        type: 'nce-recite',
        seg: totalPages === 1 ? '阶梯背诵' : `阶梯背诵 (${p + 1}/${totalPages})`,
        tag: '四级渐隐背诵',
        title: totalPages === 1
          ? `阶梯背诵：${title}`
          : `阶梯背诵（第 ${p + 1}/${totalPages} 段）：${title}`,
        source: '自由切换 L0–L3 难度，点击遮挡处可单独查看原词',
        lines: slice,
        teacherNote: input.reciteTeacherNote || '建议按 L0 带读 → L1 齐背 → L2 抽背推进，不强制逐级锁定。',
      });
    }
  }

  const sentences = input.sentences || sample.sentences;
  if (Array.isArray(sentences) && sentences.length > 0) {
    slides.push({
      id: 'sentences',
      stage: 'study',
      audience: 'both',
      type: 'sentences',
      seg: '句型精读',
      tag: '核心句型',
      title: `Sentence Patterns：${title}`,
      source: '点击每句右侧「朗读」跟读语调',
      sentences,
      teacherNote: input.sentencesTeacherNote || '【语法点拨】带读句型并点出主谓一致/时态关键点。',
    });
  }

  const segments = input.segments || input.annotations || sample.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    slides.push({
      id: 'chn-anno',
      stage: 'study',
      audience: 'both',
      type: 'chn-anno',
      seg: '点词精注',
      tag: '语文精读 · 点词精注',
      title: `${title}：点击虚线词查看释义与考点`,
      source: '点击带橙色虚线的实词即可切换读音、释义与考点提示',
      segments,
      teacherNote: input.chnTeacherNote || '【课堂互动】先让学生口头翻译再点击虚线词核对。',
    });
  }

  const chain = input.chain || sample.chain;
  if (Array.isArray(chain) && chain.length > 0) {
    slides.push({
      id: 'chem-chain',
      stage: 'study',
      audience: 'both',
      type: 'chem-chain',
      seg: '核心流程',
      tag: '化学转化流程链',
      title: `${title} · 转化流程与三原则`,
      source: input.source || '结合转化链理解除杂三原则',
      chain,
      points: input.points || sample.points || [],
      pitfall: input.pitfall || sample.pitfall || '',
      teacherNote: input.kpTeacherNote || '结合流程图强调不增、不减、易分三原则。',
    });
  } else if (input.formula || input.points || sample.formula) {
    slides.push({
      id: 'kp',
      stage: 'study',
      audience: 'both',
      type: 'kp-pitfall',
      seg: '核心概念',
      tag: '核心概念',
      title: `${title} · 核心概念与易错点`,
      source: input.source || '结合公式与例题掌握核心步骤',
      formula: input.formula || sample.formula || '',
      points: input.points || sample.points || [],
      pitfall: input.pitfall || sample.pitfall || '<b>高频易错：</b>注意边界条件与检验步骤。',
      tip: input.tip || sample.tip || '做完先代回原式检验一遍。',
      teacherNote: input.kpTeacherNote || '放慢节奏确认学生理解每一步转化条件。',
    });
  }

  const example = input.example || sample.example;
  if (example && example.problem && Array.isArray(example.steps)) {
    slides.push({
      id: 'example',
      stage: 'study',
      audience: 'both',
      type: 'worked-example',
      seg: '典型例题',
      tag: '例题精讲 · 分步板书',
      title: example.title || `例 1：${title}`,
      source: example.source || '分步展开标准书写',
      problem: example.problem,
      steps: example.steps,
      teacherNote: example.teacherNote || '逐行点击「展开下一步」，每步先提问学生。',
    });
  }

  if (input.code || sample.code) {
    slides.push({
      id: 'python-lab',
      stage: 'study',
      audience: 'both',
      type: 'python-lab',
      seg: '预测与实操',
      tag: '代码预测 → Lab 运行',
      title: `先猜结果，再进 Python Lab 动手运行`,
      source: 'PRIMM 教学法：Predict → Run → Investigate → Modify',
      code: input.code || sample.code,
      predictAnswer: input.predictAnswer || sample.predictAnswer || '揭晓运行结果后进入 Python Lab 修改参数验证。',
      labMeta: input.labMeta || sample.labMeta || { taskSlug: 'lesson-01', runtime: 'python-browser', title: '打开 Python Lab', desc: '浏览器直接运行并自动保存代码。' },
      aiRule: input.aiRule || sample.aiRule || '🟢 绿灯解释报错；🟡 黄灯要思路提示；🔴 红灯不代写整段作业。',
      teacherNote: input.codeTeacherNote || '先让学生猜 10 秒再点揭晓。',
    });
  }

  if (input.includeMathSandbox ?? sample.includeMathSandbox) {
    slides.push({
      id: 'math-lab',
      stage: 'study',
      audience: 'both',
      type: 'math-interactive',
      seg: '动态公式实验',
      tag: '互动实验 · 二次函数图像',
      title: '互动实验：改参数自动生成图像与解析式',
      source: '支持滑块/数值改参与动画演示',
      teacherNote: '可拖动滑块演示开口方向与顶点平移。',
    });
  }

  if (input.includeChemSim ?? sample.includeChemSim) {
    slides.push({
      id: 'chem-sim',
      stage: 'study',
      audience: 'both',
      type: 'chem-sim',
      seg: '反应动画实验',
      tag: '互动实验 · 化学除杂实验',
      title: '互动实验：切换滴加试剂观察烧杯动态现象',
      source: '切换试剂即可对照气泡/沉淀与离子池判定',
      teacherNote: '先演示引入新杂质的错误试剂，再切回正确试剂对比。',
    });
  }

  // Extra custom knowledge sections if passed
  if (Array.isArray(input.sections)) {
    input.sections.forEach((sec, idx) => {
      slides.push({
        id: `sec-${idx + 1}`,
        stage: 'study',
        audience: sec.audience || 'both',
        type: 'kp-pitfall',
        seg: sec.seg || `知识点 ${idx + 1}`,
        tag: sec.tag || '核心精讲',
        title: sec.title || `核心精讲 ${idx + 1}`,
        source: sec.source || '',
        formula: sec.formula || '',
        points: Array.isArray(sec.points) ? sec.points : (sec.body ? [sec.body] : []),
        pitfall: sec.pitfall || '<b>注意：</b>结合例题核对易错点。',
        tip: sec.tip || '做完可结合笔记复述一遍。',
        teacherNote: sec.teacherNote || '',
      });
    });
  }

  // Support multiple quick-check slides (`quickChecks[]`) as well as single `quickCheck`
  const qcList = Array.isArray(input.quickChecks) && input.quickChecks.length
    ? input.quickChecks
    : (input.quickCheck ? [input.quickCheck] : (sample.quickCheck ? [sample.quickCheck] : []));
  qcList.forEach((qc, idx) => {
    if (!qc || !qc.question || !Array.isArray(qc.options)) return;
    slides.push({
      id: qcList.length === 1 ? 'quick-check' : `quick-check-${idx + 1}`,
      stage: 'study',
      audience: 'both',
      type: 'quick-check',
      seg: qcList.length === 1 ? '随堂自检' : `随堂自检 (${idx + 1}/${qcList.length})`,
      tag: '随堂即时自检（不计分）',
      tagClass: 'check',
      title: qc.title || `随堂即时自检 ${idx + 1}`,
      source: '仅用于学习中即时核对理解，正式做题请前往课次任务',
      question: qc.question,
      options: qc.options,
      answer: qc.answer,
      explain: qc.explain || { hint: '结合本节核心知识点分析。', steps: '核对题干条件与选项。', pitfall: '注意审题细节。' },
      teacherNote: qc.teacherNote || '【教师提醒】本题仅作随堂自检，不写入考试成绩。',
    });
  });

  // Optional summary-writing slide (用证据写摘要)
  if (input.summaryWriting && (input.summaryWriting.prompt || input.summaryWriting.modelAnswer)) {
    const sw = input.summaryWriting;
    slides.push({
      id: 'summary-writing',
      stage: 'study',
      audience: 'both',
      type: 'summary-writing',
      seg: '用证据写摘要',
      tag: '输出训练',
      title: sw.title || `用证据写摘要：${title}`,
      source: '先用下方关键词线索口头串联，再对照参考范文检查',
      prompt: sw.prompt || '请结合课文中的关键事件，用 3–4 句英文写出本课摘要。',
      keywords: Array.isArray(sw.keywords) ? sw.keywords : [],
      modelAnswer: sw.modelAnswer || '',
      checklist: Array.isArray(sw.checklist) ? sw.checklist : ['包含起因、转折与结果', '核心时态与搭配准确'],
      teacherNote: '先给学生 2 分钟构思或口述，再点击展开参考范文核对。',
    });
  }

  // Per-lesson conclusions (mandatory takeaway block across every subject)
  const conclusions = Array.isArray(input.conclusions) && input.conclusions.length
    ? input.conclusions
    : (typeof input.conclusion === 'string' && input.conclusion.trim()
      ? [input.conclusion.trim()]
      : (Array.isArray(input.summary) && input.summary.length
        ? input.summary
        : [
            coverGoal || `围绕「${title}」掌握核心知识、典型解法与高频易错点。`,
            '带着本课结论完成对应练习与巩固检测。',
          ]));

  // Teacher-only exit exam slide (includes lesson conclusions)
  const exit = input.exitExam || sample.exitExam || {
    title: `出门清核验与本课结论：${title}`,
    prompt: '回看本节核心结论，确认学生能独立完成典型变式题。',
    keyPoints: ['请学生完成本节出门清与课后巩固练习。'],
    teacherNote: '建议用时 8–10 分钟，带全班复述本课核心结论后结束本讲。',
  };
  slides.push({
    id: 'exit',
    stage: 'exit',
    audience: 'teacher',
    type: 'teacher-exam',
    seg: '出门清与结论',
    tag: '出门清与本课结论',
    tagClass: 'exam',
    source: '建议用时：约 8–10 分钟',
    conclusions,
    ...exit,
  });

  // Student-only handoff slide (includes lesson conclusions, clean student copy)
  slides.push({
    id: 'handoff',
    stage: 'study',
    audience: 'student',
    type: 'student-handoff',
    seg: '本课结论',
    tag: '本课核心结论',
    title: `${title} · 本课结论与下一步练习`,
    summary: conclusions,
    nextTasks: Array.isArray(input.nextTasks) && input.nextTasks.length
      ? input.nextTasks
      : [
          { name: `课堂练习 · ${title}`, type: '巩固练习' },
          { name: `出门清 · ${title}`, type: '过关检测' },
        ],
  });

  return {
    preset,
    course: {
      id: preset.key,
      subject: preset.subject,
      subjLabel: input.subjLabel || preset.subjLabel,
      headerTitle,
      badgeList,
      coverTitle: title,
      coverGoal,
      classMinutes,
      slides,
    },
  };
}

function escapeHtmlText(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

function sanitizeFileSlug(title) {
  const cleaned = String(title || 'courseware')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || 'courseware';
}

/** Render one standalone HTML (either 'student' or 'teacher') strictly isolated. */
function renderSingleRoleHtml(course, role) {
  const isTeacher = role === 'teacher';
  const filteredSlides = isTeacher
    ? course.slides.filter((s) => s.audience !== 'student')
    : course.slides.filter((s) => s.stage === 'study' && s.audience !== 'teacher').map((s) => {
        const copy = { ...s };
        delete copy.teacherNote;
        return copy;
      });

  const payloadCourse = { ...course, slides: filteredSlides };
  const css = loadCss();
  const logoUri = loadLogoDataUri();
  const pageTitle = `${course.headerTitle}（${isTeacher ? '教师讲课版' : '学生自学版'}）`;

  const timerHtml = isTeacher
    ? `<div id="cwTimerWrap" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border:1px solid var(--tc-orange-line);border-radius:999px;background:#fff;font-size:12px;">
            <span id="cwTimerText" style="font-weight:700;color:var(--tc-orange-ink);font-variant-numeric:tabular-nums;">${String(course.classMinutes || 90).padStart(2, '0')}:00</span>
            <button type="button" id="btnTimerToggle" class="cw-tool-btn" style="height:22px;padding:0 6px;font-size:11px;">开始</button>
            <button type="button" id="btnTimerPreset" class="cw-tool-btn" style="height:22px;padding:0 6px;font-size:11px;" title="切换 45 / 90 / 120 分钟">换时长</button>
          </div>`
    : '';

  const threeDotsHtml = isTeacher
    ? `${timerHtml}<nav class="cw-three-dots" id="threeDots" aria-label="课堂三阶段">
            <button class="stage-bead" data-stage="entrance"><span class="dot"></span>进门考</button>
            <span class="stage-line"></span>
            <button class="stage-bead" data-stage="study"><span class="dot"></span>课程学习</button>
            <span class="stage-line"></span>
            <button class="stage-bead" data-stage="exit"><span class="dot"></span>出门清</button>
          </nav>`
    : `<div class="cw-student-seg" id="studentSeg"><span class="seg-chip" id="studentSegText">本课导览</span></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlText(pageTitle)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
  <style>
${css}
body { margin: 0; background: #F7F4F0; }
.cw-viewport { padding: 0; min-height: 100vh; display: flex; align-items: stretch; justify-content: center; }
.cw-shell { width: 100%; max-width: 1280px; min-height: 100vh; border-radius: 0; }
.cw-logo { transform: none !important; }
  </style>
</head>
<body data-subject="${escapeHtmlText(course.subject)}" data-role="${role}">
  <div class="cw-viewport">
    <div class="cw-shell" id="cwShell">
      <header class="cw-header">
        <div class="cw-brand">
          <img class="cw-logo" src="${logoUri}" alt="童澄">
          <span class="cw-divider"></span>
          <span class="cw-course-name" id="headerCourseName">${escapeHtmlText(course.headerTitle)}</span>
          <span class="cw-subj-dot" id="headerSubjPill">${escapeHtmlText(course.subjLabel)}</span>
          <span class="cw-role-pill ${role}" id="headerRolePill">${isTeacher ? '老师讲课版' : '学生自学版'}</span>
        </div>
        <div class="cw-header-r">
          ${threeDotsHtml}
          <button class="cw-tool-btn" id="btnToc">目录</button>
        </div>
      </header>
      <main class="cw-main" id="slideMain"></main>
      <footer class="cw-footer">
        <button class="nav-btn" id="btnPrev">← 上一页</button>
        <div class="cw-prog-wrap">
          <div class="cw-prog-track"><div class="cw-prog-fill" id="progFill" style="width:0%;"></div></div>
          <span class="cw-page-num" id="pageNum">1 / ${filteredSlides.length}</span>
        </div>
        <button class="nav-btn primary" id="btnNext">下一页 →</button>
      </footer>
      <div class="toc-mask" id="tocMask">
        <div class="toc-drawer">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <b style="font-size:16px;color:var(--tc-orange-ink);">本课页面目录</b>
            <button class="cw-tool-btn" id="btnCloseToc">关闭</button>
          </div>
          <div id="tocList" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </div>
    </div>
  </div>
<script>
(function () {
  "use strict";
  const COURSE = ${safeJsonForScript(payloadCourse)};
  const ROLE = ${JSON.stringify(role)};
  let slideIndex = 0;

  const $ = (id) => document.getElementById(id);
  const slideMain = $("slideMain");

  function typesetMath(el) {
    if (!window.renderMathInElement || !el) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false,
      });
    } catch (_) {}
  }

  let activeAudio = null;
  function stopAllAudio() {
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (_) {}
      activeAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function speakText(text) {
    stopAllAudio();
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  }

  function playAudioOrSpeak(audioUrl, text) {
    stopAllAudio();
    if (audioUrl) {
      const a = new Audio(audioUrl);
      activeAudio = a;
      a.onerror = () => { if (activeAudio === a) activeAudio = null; speakText(text); };
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => { if (activeAudio === a) activeAudio = null; speakText(text); });
      }
      return;
    }
    speakText(text);
  }

  function renderSlide(slide) {
    const teacherNoteHtml = (ROLE === "teacher" && slide.teacherNote) ? '<div class="teacher-only-note">' + slide.teacherNote + '</div>' : '';
    if (slide.type === "cover") {
      const flow = ROLE === "teacher" ? (slide.teacherFlow || []) : (slide.studentFlow || []);
      const cardTitle = ROLE === "teacher" ? "本课教学节奏" : "本课自学步骤";
      return '<div class="cover-grid"><div>'
        + '<div class="cover-badges">' + (COURSE.badgeList || []).map((b, i) => '<span class="cover-badge ' + (i === 0 ? 'subj' : '') + '">' + b + '</span>').join('') + '</div>'
        + '<h1 class="cover-h1">' + COURSE.coverTitle + '</h1>'
        + '<p class="cover-goal">' + (COURSE.coverGoal || '') + '</p>'
        + '<div class="cover-actions"><button class="btn-primary" id="btnStartLesson">' + (ROLE === "teacher" ? "开始课堂讲授 →" : "开始本课自学 →") + '</button>'
        + '<button class="btn-secondary" id="btnOpenTocInline">查看全部页面</button></div></div>'
        + '<div class="cover-card"><h3>' + cardTitle + '</h3><div class="flow-list">'
        + flow.map((f) => '<div class="flow-item"><span class="flow-dot">' + f.num + '</span><div><b>' + f.title + '</b><span>' + f.desc + '</span></div></div>').join('')
        + '</div></div></div>';
    }

    const head = '<div class="slide-head"><div class="slide-meta-row"><span class="slide-tag ' + (slide.tagClass || '') + '">' + (slide.tag || '') + '</span>'
      + '<span class="slide-section-pos">' + (slide.seg || '') + '</span></div>'
      + '<h2 class="slide-title">' + (slide.title || '') + '</h2>'
      + (slide.source ? '<div class="slide-source">' + slide.source + '</div>' : '') + '</div>';

    if (slide.type === "teacher-exam") {
      const conclHtml = Array.isArray(slide.conclusions) && slide.conclusions.length
        ? '<div class="self-check-tip" style="margin-top:12px;"><b>本课核心结论：</b><ul class="kp-list" style="margin:6px 0 0;">'
          + slide.conclusions.map((c) => '<li>' + c + '</li>').join('') + '</ul></div>'
        : '';
      return head + '<div class="slide-body"><div class="panel-white"><h3>课堂投屏题干 / 诊断点</h3>'
        + '<p style="font-size:17px;font-weight:600;margin:0 0 12px;">' + (slide.prompt || '') + '</p>'
        + '<ul class="kp-list">' + (slide.keyPoints || []).map((k) => '<li>' + k + '</li>').join('') + '</ul></div>' + conclHtml + teacherNoteHtml + '</div>';
    }
    if (slide.type === "text-listen") {
      const audioHtml = slide.audioUrl
        ? '<div class="panel" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><b>原版音频：</b><audio controls preload="none" src="' + slide.audioUrl + '" style="flex:1;min-width:220px;"></audio></div>'
        : '<div class="panel" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          + '<button class="btn-primary" id="btnReadAll" style="height:34px;font-size:13px;">▶ 英音朗读全文</button>'
          + '<button class="btn-secondary" id="btnReadSlow" style="height:34px;font-size:13px;">🐢 慢速 0.8x</button>'
          + '<button class="btn-secondary" id="btnReadStop" style="height:34px;font-size:13px;">⏹ 停止</button>'
          + '<button class="btn-secondary" id="btnToggleCn" style="height:34px;font-size:13px;margin-left:auto;">隐藏中文译文</button></div>';
      const toggleBtn = slide.audioUrl
        ? '<div style="display:flex;justify-content:flex-end;margin-top:6px;"><button class="btn-secondary" id="btnToggleCn" style="height:32px;font-size:12.5px;">隐藏中文译文</button></div>'
        : '';
      return head + '<div class="slide-body">' + audioHtml + toggleBtn
        + '<div class="sentence-list" id="passageList">'
        + (slide.paragraphs || []).map((p, idx) => '<div class="sent-row"><div style="flex:1;">'
          + '<div class="sent-en"><b>' + (idx + 1) + '.</b> ' + (p.en || '') + '</div>'
          + (p.cn ? '<div class="sent-cn passage-cn">' + p.cn + '</div>' : '')
          + '</div><button class="speak-btn" data-audio="' + String(p.audioUrl || p.audio || '').replace(/"/g, '') + '" data-speak="' + String(p.en || '').replace(/"/g, '') + '">🔊 朗读</button></div>').join('')
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "math-interactive") {
      return head + '<div class="slide-body"><div class="math-lab-grid">'
        + '<div class="slider-card">'
        + '<div class="fbox" id="quadFormula" style="margin:0;font-size:17.5px;">$y = a(x - h)^2 + k$</div>'
        + '<div class="slider-row"><span>开口 $a$</span><input type="range" id="slA" min="-2" max="2" step="0.25" value="1"><input class="slider-num" id="numA" type="number" step="0.25" min="-3" max="3" value="1"></div>'
        + '<div class="slider-row"><span>横移 $h$</span><input type="range" id="slH" min="-3" max="3" step="0.5" value="1"><input class="slider-num" id="numH" type="number" step="0.5" min="-4" max="4" value="1"></div>'
        + '<div class="slider-row"><span>纵移 $k$</span><input type="range" id="slK" min="-3" max="3" step="0.5" value="-1"><input class="slider-num" id="numK" type="number" step="0.5" min="-4" max="4" value="-1"></div>'
        + '<div class="sim-anim-bar"><button class="sim-btn" id="btnAnimA">▶ 动画：开口翻转 $a$</button><button class="sim-btn" id="btnAnimHK">▶ 动画：平移轨迹 $(h,k)$</button><button class="sim-btn" id="btnAnimReset">重置</button></div>'
        + '<div id="quadProps" style="font-size:13.5px;line-height:1.65;color:var(--tc-ink-2);background:#fff;border:1px solid var(--tc-orange-line);border-radius:8px;padding:9px 12px;"></div>'
        + '</div><div class="svg-stage"><svg id="quadSvg" viewBox="0 0 360 250" width="100%" style="max-width:400px;"></svg>'
        + '<div style="font-size:12px;color:var(--tc-muted);margin-top:4px;">支持滑块/输入改参或一键播放动画，自动标出顶点、对称轴与坐标轴交点</div></div>'
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "chem-sim") {
      return head + '<div class="slide-body"><div class="math-lab-grid">'
        + '<div class="slider-card">'
        + '<div style="font-weight:700;color:var(--tc-orange-ink);font-size:14.5px;">选择滴加试剂（目标：除去 $\\mathrm{NaCl}$ 中的 $\\mathrm{Na_2CO_3}$）</div>'
        + '<div class="sim-anim-bar" id="chemReagents"><button class="sim-btn active" data-reagent="hcl">① 适量稀 HCl</button><button class="sim-btn" data-reagent="h2so4">② 稀 H₂SO₄</button><button class="sim-btn" data-reagent="bacl2">③ 适量 BaCl₂</button></div>'
        + '<div class="fbox" id="chemEqBox" style="margin:0;font-size:15.5px;"></div>'
        + '<div id="chemJudgeBox" style="font-size:14px;line-height:1.65;background:#fff;border:1px solid var(--tc-orange-line);border-radius:8px;padding:10px 12px;"></div>'
        + '</div><div class="svg-stage"><svg id="chemSvg" viewBox="0 0 320 220" width="100%" style="max-width:340px;"></svg>'
        + '<div id="chemStageHint" style="font-size:12.5px;color:var(--tc-muted);margin-top:4px;">点击左侧试剂即可播放烧杯反应动态现象</div></div>'
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "kp-pitfall") {
      return head + '<div class="slide-body">' + (slide.formula ? '<div class="fbox">' + slide.formula + '</div>' : '')
        + '<div class="two-col"><div class="panel-white"><h3>核心步骤与要点</h3><ul class="kp-list">'
        + (slide.points || []).map((p) => '<li>' + p + '</li>').join('') + '</ul></div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;">'
        + (slide.pitfall ? '<div class="pitfall-card">' + slide.pitfall + '</div>' : '')
        + (slide.tip ? '<div class="self-check-tip">' + slide.tip + '</div>' : '')
        + '</div></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "chem-chain") {
      return head + '<div class="slide-body"><div class="panel-white"><h3>转化流程链</h3><div class="chem-chain">'
        + (slide.chain || []).map((item) => item.arrow
          ? '<div class="chain-arrow"><span>' + item.arrow + '</span><span>───▶</span></div>'
          : '<div class="chain-node ' + (item.accent ? 'accent' : '') + '">' + String(item.text || '').replace(/\\n/g, '<br>') + '</div>').join('')
        + '</div></div><div class="two-col"><div class="panel"><h3>除杂原则</h3><ul class="kp-list">'
        + (slide.points || []).map((p) => '<li>' + p + '</li>').join('') + '</ul></div>'
        + '<div class="pitfall-card">' + (slide.pitfall || '') + '</div></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "worked-example") {
      return head + '<div class="slide-body"><div class="panel"><b style="font-size:16.5px;color:var(--tc-orange-ink);">题目：</b><span style="font-size:16.5px;">' + (slide.problem || '') + '</span></div>'
        + '<div class="step-derivation" id="derivBox">'
        + (slide.steps || []).map((st, idx) => '<div class="deriv-row ' + (idx === 0 ? 'shown' : '') + '"><span class="deriv-label">第 ' + (idx + 1) + ' 步 · ' + st.label + '</span>' + st.text + '</div>').join('')
        + '</div><div class="deriv-controls"><button class="btn-primary" id="btnStepNext" style="height:36px;font-size:13.5px;">展开下一步</button>'
        + '<button class="btn-secondary" id="btnStepAll" style="height:36px;font-size:13.5px;">展开全部</button>'
        + '<button class="btn-secondary" id="btnStepReset" style="height:36px;font-size:13.5px;">重置步骤</button></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "word-cards") {
      return head + '<div class="slide-body"><div class="word-grid">'
        + (slide.words || []).map((w, i) => '<div class="word-card" data-widx="' + i + '"><div class="w-emoji">' + (w.emoji || '📘') + '</div>'
          + '<div class="w-en">' + w.en + '</div><div class="w-ph">' + (w.ph || w.phonetic || '') + '</div><div class="w-cn">' + (w.cn || '') + '</div>'
          + '<button class="speak-btn" data-audio="' + String(w.audioUrl || w.audio || '').replace(/"/g, '') + '" data-speak="' + String(w.en || '').replace(/"/g, '') + '">🔊 朗读</button></div>').join('')
        + '</div>' + (slide.tip ? '<div class="self-check-tip">' + slide.tip + '</div>' : '') + teacherNoteHtml + '</div>';
    }
    if (slide.type === "sentences") {
      return head + '<div class="slide-body"><div class="sentence-list">'
        + (slide.sentences || []).map((s) => '<div class="sent-row"><div style="flex:1;"><div class="sent-en">' + s.en + '</div>'
          + '<div class="sent-cn">' + (s.cn || '') + '</div>' + (s.note ? '<div class="sent-note">💡 ' + s.note + '</div>' : '')
          + '</div><button class="speak-btn" data-audio="' + String(s.audioUrl || s.audio || '').replace(/"/g, '') + '" data-speak="' + String(s.en || '').replace(/"/g, '') + '">🔊 朗读</button></div>').join('')
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "nce-recite") {
      return head + '<div class="slide-body"><div style="display:flex;gap:8px;flex-wrap:wrap;" id="reciteLevels">'
        + '<button class="explain-tab active" data-lvl="0">L0 完整原文</button>'
        + '<button class="explain-tab" data-lvl="1">L1 挖核心实词</button>'
        + '<button class="explain-tab" data-lvl="2">L2 挖重点短语</button>'
        + '<button class="explain-tab" data-lvl="3">L3 仅留句首复述</button></div>'
        + '<div class="sentence-list" id="reciteList"></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "chn-anno") {
      let wIdx = 0;
      const passage = (slide.segments || []).map((seg) => seg.word ? '<span class="anno-word ' + (wIdx === 0 ? 'active' : '') + '" data-aidx="' + (wIdx++) + '">' + seg.word + '</span>' : seg.text).join('');
      const first = (slide.segments || []).find((s) => s.word) || { word: '', pinyin: '', meaning: '', note: '' };
      return head + '<div class="slide-body"><div class="chn-passage" id="chnPassage">' + passage + '</div>'
        + '<div class="anno-box" id="annoBox"><b style="font-size:17px;color:var(--tc-orange-ink);">' + first.word + '</b>'
        + '<span style="color:var(--tc-muted);margin-left:8px;">' + (first.pinyin || '') + '</span>'
        + '<div style="margin-top:6px;"><b>释义：</b>' + (first.meaning || '') + '</div>'
        + '<div style="margin-top:4px;color:var(--tc-ink-2);"><b>考点提示：</b>' + (first.note || '') + '</div></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "python-lab") {
      return head + '<div class="slide-body"><div class="two-col"><div><pre class="code-box">' + (slide.code || '') + '</pre>'
        + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;"><button class="btn-primary" id="btnRevealPredict" style="height:36px;font-size:13.5px;">揭晓运行预测</button></div>'
        + '<div class="self-check-tip" id="predictBox" style="display:none;margin-top:10px;">' + (slide.predictAnswer || '') + '</div></div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;"><div class="py-lab-banner"><div><b>' + ((slide.labMeta || {}).title || 'Python Lab') + '</b>'
        + '<span>' + ((slide.labMeta || {}).desc || '') + '</span></div></div>'
        + '<div class="panel-white" style="font-size:14.5px;line-height:1.7;">' + (slide.aiRule || '') + '</div></div></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "quick-check") {
      return head + '<div class="slide-body"><div class="panel-white"><div style="font-size:17px;font-weight:600;line-height:1.65;">' + slide.question + '</div>'
        + '<div class="quiz-opts" id="quizOpts">' + (slide.options || []).map((o) => '<button class="q-opt" data-key="' + o.key + '"><span class="q-key">' + o.key + '</span><span>' + o.text + '</span></button>').join('') + '</div>'
        + '<div id="quizFeedback" style="margin-top:10px;font-size:14px;font-weight:700;"></div>'
        + '<div class="explain-drawer" id="explainDrawer"><div class="explain-tabs">'
        + '<button class="explain-tab active" data-tier="hint">1. 思路提示</button>'
        + '<button class="explain-tab" data-tier="steps">2. 分步解析</button>'
        + '<button class="explain-tab" data-tier="pitfall">3. 易错避坑</button></div>'
        + '<div id="explainBody" style="font-size:14.5px;line-height:1.65;">' + ((slide.explain || {}).hint || '') + '</div></div></div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "close-reading") {
      const start = slide.startIndex || 1;
      return head + '<div class="slide-body">'
        + '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;"><button class="btn-secondary" id="btnToggleCrCn" style="height:32px;font-size:12.5px;">隐藏中文译文</button></div>'
        + '<div class="sentence-list" id="closeReadingList">'
        + (slide.items || []).map((it, idx) => '<div class="sent-row"><div style="flex:1;">'
          + '<div class="sent-en"><b>' + (start + idx) + '.</b> ' + (it.en || '') + '</div>'
          + (it.structure ? '<div class="sent-note">🧩 结构拆解：' + it.structure + '</div>' : '')
          + (it.cn ? '<div class="sent-cn cr-cn">' + it.cn + '</div>' : '')
          + '</div><button class="speak-btn" data-audio="' + String(it.audioUrl || it.audio || '').replace(/"/g, '') + '" data-speak="' + String(it.en || '').replace(/"/g, '') + '">🔊 朗读</button></div>').join('')
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "summary-writing") {
      return head + '<div class="slide-body"><div class="panel-white"><h3>摘要写作任务</h3>'
        + '<p style="font-size:16px;font-weight:600;margin:0 0 10px;">' + (slide.prompt || '') + '</p>'
        + ((slide.keywords || []).length
          ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' + slide.keywords.map((k) => '<span class="cover-badge subj">' + k + '</span>').join('') + '</div>'
          : '')
        + ((slide.checklist || []).length
          ? '<ul class="kp-list" style="margin-bottom:12px;">' + slide.checklist.map((c) => '<li>' + c + '</li>').join('') + '</ul>'
          : '')
        + '<button class="btn-primary" id="btnRevealSummary" style="height:36px;font-size:13.5px;">展开参考范文</button>'
        + '<div class="self-check-tip" id="summaryModelBox" style="display:none;margin-top:12px;"><b>参考范文：</b><div style="margin-top:6px;">' + (slide.modelAnswer || '') + '</div></div>'
        + '</div>' + teacherNoteHtml + '</div>';
    }
    if (slide.type === "student-handoff") {
      return head + '<div class="slide-body"><div class="panel-white"><h3>本课核心结论回顾</h3><ul class="kp-list">'
        + (slide.summary || []).map((s) => '<li>' + s + '</li>').join('') + '</ul></div>'
        + '<div class="handoff-box"><div><b style="font-size:16px;display:block;margin-bottom:6px;color:var(--tc-orange-ink);">下一步：完成本课巩固练习</b>'
        + '<div style="font-size:13.5px;color:var(--tc-ink-2);display:flex;gap:14px;flex-wrap:wrap;">'
        + (slide.nextTasks || []).map((t) => '<span>• <b>' + t.name + '</b>（' + t.type + '）</span>').join('') + '</div></div></div></div>';
    }
    return head + '<div class="slide-body"><div class="panel-white">' + (slide.title || '') + '</div>' + teacherNoteHtml + '</div>';
  }

  function bindSlide(slide) {
    if (window._activeSimTimer) { cancelAnimationFrame(window._activeSimTimer); window._activeSimTimer = null; }
    if ($("btnStartLesson")) $("btnStartLesson").onclick = () => go(slideIndex + 1);
    if ($("btnOpenTocInline")) $("btnOpenTocInline").onclick = () => $("tocMask").classList.add("open");
    document.querySelectorAll(".speak-btn").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); playAudioOrSpeak(b.dataset.audio || "", b.dataset.speak || ""); };
    });
    document.querySelectorAll(".word-card").forEach((c) => { c.onclick = (e) => { if (!e.target.closest(".speak-btn")) c.classList.toggle("flipped"); }; });

    if (slide.type === "text-listen") {
      const fullText = (slide.paragraphs || []).map((p) => p.en || "").join(". ");
      const readAll = (rate) => {
        stopAllAudio();
        if (!("speechSynthesis" in window)) return;
        const u = new SpeechSynthesisUtterance(fullText);
        u.lang = "en-GB";
        u.rate = rate;
        window.speechSynthesis.speak(u);
      };
      if ($("btnReadAll")) $("btnReadAll").onclick = () => readAll(0.95);
      if ($("btnReadSlow")) $("btnReadSlow").onclick = () => readAll(0.78);
      if ($("btnReadStop")) $("btnReadStop").onclick = () => stopAllAudio();
      if ($("btnToggleCn")) {
        let hidden = false;
        $("btnToggleCn").onclick = () => {
          hidden = !hidden;
          document.querySelectorAll("#passageList .passage-cn").forEach((el) => { el.style.display = hidden ? "none" : ""; });
          $("btnToggleCn").textContent = hidden ? "显示中文译文" : "隐藏中文译文";
        };
      }
    }

    if (slide.type === "math-interactive") {
      const slA = $("slA"), numA = $("numA"), slH = $("slH"), numH = $("numH"), slK = $("slK"), numK = $("numK");
      const fBox = $("quadFormula"), pBox = $("quadProps"), svg = $("quadSvg");
      const btnAnimA = $("btnAnimA"), btnAnimHK = $("btnAnimHK"), btnAnimReset = $("btnAnimReset");
      let animMode = null, animT = 0;
      const fmt = (n) => Number(n.toFixed(2));
      const stopAnim = () => {
        if (window._activeSimTimer) { cancelAnimationFrame(window._activeSimTimer); window._activeSimTimer = null; }
        animMode = null; btnAnimA.classList.remove("active"); btnAnimHK.classList.remove("active");
      };
      const updateQuad = (aIn, hIn, kIn) => {
        let a = aIn !== undefined ? aIn : parseFloat(slA.value);
        if (Math.abs(a) < 0.15) a = a >= 0 ? 0.25 : -0.25;
        const h = hIn !== undefined ? hIn : parseFloat(slH.value);
        const k = kIn !== undefined ? kIn : parseFloat(slK.value);
        slA.value = a; numA.value = fmt(a); slH.value = h; numH.value = fmt(h); slK.value = k; numK.value = fmt(k);
        const aStr = a === 1 ? "" : (a === -1 ? "-" : fmt(a));
        const hStr = h === 0 ? "x^2" : (h > 0 ? "(x - " + fmt(h) + ")^2" : "(x + " + fmt(Math.abs(h)) + ")^2");
        const kStr = k === 0 ? "" : (k > 0 ? " + " + fmt(k) : " - " + fmt(Math.abs(k)));
        const b = fmt(-2 * a * h), c = fmt(a * h * h + k);
        const bTerm = b === 0 ? "" : (b > 0 ? " + " + b + "x" : " - " + Math.abs(b) + "x");
        const cTerm = c === 0 ? "" : (c > 0 ? " + " + c : " - " + Math.abs(c));
        fBox.innerHTML = "<div>$y = " + aStr + hStr + kStr + "$</div><div style='font-size:13.5px;color:var(--tc-ink-2);margin-top:3px;'>一般式：$y = " + aStr + "x^2" + bTerm + cTerm + "$</div>";
        const rhs = -k / a;
        let rootText = "无实数交点（$\\\\Delta < 0$）", roots = [];
        if (Math.abs(rhs) < 1e-6) { roots = [h]; rootText = "唯一交点 $(" + fmt(h) + ",\\\\,0)$"; }
        else if (rhs > 0) { const r1 = fmt(h - Math.sqrt(rhs)), r2 = fmt(h + Math.sqrt(rhs)); roots = [r1, r2]; rootText = "$(" + r1 + ",\\\\,0)$ 与 $(" + r2 + ",\\\\,0)$"; }
        pBox.innerHTML = "<div>• <b>开口与对称轴：</b>" + (a > 0 ? "向上" : "向下") + " | $x = " + fmt(h) + "$ | 顶点 $(" + fmt(h) + ",\\\\," + fmt(k) + ")$</div>"
          + "<div>• <b>与 $y$ 轴交点：</b>$(0,\\\\," + c + ")$ | <b>与 $x$ 轴交点：</b>" + rootText + "</div>";
        typesetMath(fBox); typesetMath(pBox);
        const ox = 180, oy = 128, sc = 26;
        let grid = "";
        for (let gx = -6; gx <= 6; gx++) { const x = ox + gx * sc; grid += '<line x1="' + x + '" y1="14" x2="' + x + '" y2="238" stroke="#EFE7DF" stroke-width="1"/>'; }
        for (let gy = -4; gy <= 4; gy++) { const y = oy - gy * sc; grid += '<line x1="18" y1="' + y + '" x2="342" y2="' + y + '" stroke="#EFE7DF" stroke-width="1"/>'; }
        const pts = [];
        for (let x = -6.2; x <= 6.2; x += 0.1) { const y = a * (x - h) * (x - h) + k; const px = ox + x * sc, py = oy - y * sc; if (py >= -30 && py <= 280) pts.push(px.toFixed(1) + "," + py.toFixed(1)); }
        const vx = ox + h * sc, vy = oy - k * sc;
        const rootDots = roots.map((r) => '<circle cx="' + (ox + r * sc).toFixed(1) + '" cy="' + oy + '" r="3.6" fill="#1A7340"/>').join("");
        svg.innerHTML = '<rect x="0" y="0" width="360" height="250" fill="#FFFBF7" rx="8"/>' + grid
          + '<line x1="18" y1="' + oy + '" x2="342" y2="' + oy + '" stroke="#555D6E" stroke-width="1.5"/>'
          + '<line x1="' + ox + '" y1="14" x2="' + ox + '" y2="238" stroke="#555D6E" stroke-width="1.5"/>'
          + '<line x1="' + vx + '" y1="14" x2="' + vx + '" y2="238" stroke="#B84E06" stroke-width="1.2" stroke-dasharray="4 3"/>'
          + '<polyline fill="none" stroke="#FF790B" stroke-width="2.8" points="' + pts.join(" ") + '"/>' + rootDots
          + '<circle cx="' + vx + '" cy="' + vy + '" r="4.8" fill="#B84E06" stroke="#FFD110" stroke-width="2"/>'
          + '<text x="' + Math.min(275, Math.max(22, vx + 8)) + '" y="' + Math.min(232, Math.max(26, vy - 8)) + '" font-size="12" font-weight="700" fill="#B84E06">(' + fmt(h) + ', ' + fmt(k) + ')</text>';
      };
      const tickAnim = () => {
        animT += 0.035;
        if (animMode === "a") { let av = Math.sin(animT) * 1.8; if (Math.abs(av) < 0.25) av = av >= 0 ? 0.25 : -0.25; updateQuad(av, parseFloat(slH.value), parseFloat(slK.value)); }
        else if (animMode === "hk") { updateQuad(parseFloat(slA.value), Math.sin(animT) * 2.5, Math.cos(animT * 0.8) * 2.0); }
        if (animMode) window._activeSimTimer = requestAnimationFrame(tickAnim);
      };
      slA.oninput = slH.oninput = slK.oninput = () => { stopAnim(); updateQuad(parseFloat(slA.value), parseFloat(slH.value), parseFloat(slK.value)); };
      numA.onchange = numH.onchange = numK.onchange = () => { stopAnim(); updateQuad(parseFloat(numA.value) || 1, parseFloat(numH.value) || 0, parseFloat(numK.value) || 0); };
      btnAnimA.onclick = () => { if (animMode === "a") { stopAnim(); return; } stopAnim(); animMode = "a"; btnAnimA.classList.add("active"); tickAnim(); };
      btnAnimHK.onclick = () => { if (animMode === "hk") { stopAnim(); return; } stopAnim(); animMode = "hk"; btnAnimHK.classList.add("active"); tickAnim(); };
      btnAnimReset.onclick = () => { stopAnim(); updateQuad(1, 1, -1); };
      updateQuad(1, 1, -1);
    }

    if (slide.type === "chem-sim") {
      const presets = {
        hcl: { eq: "$\\\\mathrm{Na_2CO_3 + 2HCl = 2NaCl + CO_2\\\\uparrow + H_2O}$", judge: "<b style='color:var(--tc-ok);'>✓ 方案正确（符合不增、不减、易分）</b><br>剩余离子：Na⁺、Cl⁻，CO₂ 逸出无新杂。", hint: "烧杯动态现象：持续产生大量无色气泡（CO₂ 气体逸出）", effect: "bubbles" },
        h2so4: { eq: "$\\\\mathrm{Na_2CO_3 + H_2SO_4 = Na_2SO_4 + CO_2\\\\uparrow + H_2O}$", judge: "<b style='color:var(--tc-err);'>✕ 违反「不增」原则</b><br>溶液中引入了新的可溶性杂质离子 SO₄²⁻！", hint: "烧杯动态现象：有气泡逸出，但溶液残留新杂质 SO₄²⁻", effect: "bubbles-bad" },
        bacl2: { eq: "$\\\\mathrm{Na_2CO_3 + BaCl_2 = BaCO_3\\\\downarrow + 2NaCl}$", judge: "<b style='color:var(--tc-ok);'>✓ 可行（需配合过滤操作）</b><br>生成白色沉淀 BaCO₃↓，过滤后滤液仅含 NaCl。", hint: "烧杯动态现象：烧杯底部生成白色 BaCO₃ 沉淀，过滤即可分离", effect: "precip" },
      };
      const renderChem = (key) => {
        const p = presets[key];
        $("chemEqBox").innerHTML = p.eq; $("chemJudgeBox").innerHTML = p.judge; $("chemStageHint").textContent = p.hint;
        typesetMath($("chemEqBox")); typesetMath($("chemJudgeBox"));
        const liq = p.effect === "bubbles-bad" ? "#FEE2E2" : "#FFF4E8";
        const bubbles = (p.effect === "bubbles" || p.effect === "bubbles-bad")
          ? '<circle class="chem-bubble" cx="135" cy="168" r="4.5" fill="#fff" stroke="#FF790B" stroke-width="1.5"/><circle class="chem-bubble" style="animation-delay:.35s" cx="160" cy="175" r="5.5" fill="#fff" stroke="#FF790B" stroke-width="1.5"/><text x="218" y="100" font-size="12" font-weight="700" fill="#B84E06">CO₂ ↑</text>' : '';
        const precip = p.effect === "precip"
          ? '<g class="chem-precip"><ellipse cx="160" cy="184" rx="48" ry="9" fill="#FFFFFF" stroke="#B84E06" stroke-width="1.5"/><text x="125" y="188" font-size="11" font-weight="700" fill="#B84E06">BaCO₃ 白色沉淀</text></g>' : '';
        $("chemSvg").innerHTML = '<rect x="0" y="0" width="320" height="220" fill="#FFFBF7" rx="8"/>'
          + '<rect x="102" y="118" width="116" height="78" rx="8" fill="' + liq + '"/>'
          + '<path d="M98,84 L98,188 Q98,198 108,198 L212,198 Q222,198 222,188 L222,84" fill="none" stroke="#1E2330" stroke-width="2.5"/>'
          + '<line x1="100" y1="118" x2="220" y2="118" stroke="#FF790B" stroke-width="1.8" stroke-dasharray="5 3"/>'
          + bubbles + precip + '<text x="116" y="142" font-size="12" font-weight="700" fill="#1E2330">Na⁺  Cl⁻</text>'
          + (p.effect === "bubbles-bad" ? '<text x="176" y="158" font-size="12" font-weight="700" fill="#C2362C">SO₄²⁻(新杂)</text>' : '');
      };
      document.querySelectorAll("#chemReagents .sim-btn").forEach((btn) => {
        btn.onclick = () => { document.querySelectorAll("#chemReagents .sim-btn").forEach((b) => b.classList.remove("active")); btn.classList.add("active"); renderChem(btn.dataset.reagent); };
      });
      renderChem("hcl");
    }

    if (slide.type === "worked-example") {
      const rows = Array.from(document.querySelectorAll("#derivBox .deriv-row"));
      let shown = 1;
      $("btnStepNext").onclick = () => { if (shown < rows.length) { rows[shown++].classList.add("shown"); } };
      $("btnStepAll").onclick = () => { rows.forEach((r) => r.classList.add("shown")); shown = rows.length; };
      $("btnStepReset").onclick = () => { rows.forEach((r, i) => r.classList.toggle("shown", i === 0)); shown = 1; };
    }
    if (slide.type === "nce-recite") {
      const listEl = $("reciteList");
      const draw = (lvl) => {
        listEl.innerHTML = (slide.lines || []).map((line) => {
          let html = line.full;
          if (lvl === 1) (line.blanks1 || []).forEach((w) => { html = html.replace(w, '<span class="fade-blank" title="点击显示">' + w + '</span>'); });
          else if (lvl === 2) (line.blanks2 || []).forEach((w) => { html = html.replace(w, '<span class="fade-blank" title="点击显示">' + w + '</span>'); });
          else if (lvl === 3) html = '<b>' + (line.lead || '') + '</b> <span class="fade-blank" title="点击显示整句">' + line.full + '</span>';
          return '<div class="sent-row"><div style="flex:1;"><div class="sent-en">' + html + '</div><div class="sent-cn">' + (line.cn || '') + '</div></div>'
            + '<button class="speak-btn" data-audio="' + String(line.audioUrl || line.audio || '').replace(/"/g, '') + '" data-speak="' + String(line.full || '').replace(/"/g, '') + '">🔊 朗读</button></div>';
        }).join('');
        listEl.querySelectorAll(".fade-blank").forEach((b) => { b.onclick = () => b.classList.toggle("revealed"); });
        listEl.querySelectorAll(".speak-btn").forEach((b) => { b.onclick = () => playAudioOrSpeak(b.dataset.audio || "", b.dataset.speak || ""); });
      };
      draw(0);
      document.querySelectorAll("#reciteLevels .explain-tab").forEach((tab) => {
        tab.onclick = () => {
          document.querySelectorAll("#reciteLevels .explain-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          draw(Number(tab.dataset.lvl));
        };
      });
    }
    if (slide.type === "chn-anno") {
      const words = (slide.segments || []).filter((s) => s.word);
      document.querySelectorAll("#chnPassage .anno-word").forEach((el) => {
        el.onclick = () => {
          document.querySelectorAll("#chnPassage .anno-word").forEach((x) => x.classList.remove("active"));
          el.classList.add("active");
          const item = words[Number(el.dataset.aidx)] || {};
          $("annoBox").innerHTML = '<b style="font-size:17px;color:var(--tc-orange-ink);">' + (item.word || '') + '</b>'
            + '<span style="color:var(--tc-muted);margin-left:8px;">' + (item.pinyin || '') + '</span>'
            + '<div style="margin-top:6px;"><b>释义：</b>' + (item.meaning || '') + '</div>'
            + '<div style="margin-top:4px;color:var(--tc-ink-2);"><b>考点提示：</b>' + (item.note || '') + '</div>';
        };
      });
    }
    if (slide.type === "close-reading" && $("btnToggleCrCn")) {
      let hidden = false;
      $("btnToggleCrCn").onclick = () => {
        hidden = !hidden;
        document.querySelectorAll("#closeReadingList .cr-cn").forEach((el) => { el.style.display = hidden ? "none" : ""; });
        $("btnToggleCrCn").textContent = hidden ? "显示中文译文" : "隐藏中文译文";
      };
    }
    if (slide.type === "summary-writing" && $("btnRevealSummary")) {
      $("btnRevealSummary").onclick = () => {
        const box = $("summaryModelBox");
        const open = box.style.display === "none";
        box.style.display = open ? "block" : "none";
        $("btnRevealSummary").textContent = open ? "收起参考范文" : "展开参考范文";
      };
    }
    if (slide.type === "python-lab" && $("btnRevealPredict")) {
      $("btnRevealPredict").onclick = () => { $("predictBox").style.display = "block"; };
    }
    if (slide.type === "quick-check") {
      const opts = Array.from(document.querySelectorAll("#quizOpts .q-opt"));
      opts.forEach((btn) => {
        btn.onclick = () => {
          opts.forEach((o) => o.classList.remove("correct", "wrong"));
          if (btn.dataset.key === slide.answer) {
            btn.classList.add("correct");
            $("quizFeedback").style.color = "var(--tc-ok)";
            $("quizFeedback").textContent = "✓ 回答正确！（本自检不计入考试成绩）";
          } else {
            btn.classList.add("wrong");
            const right = opts.find((o) => o.dataset.key === slide.answer);
            if (right) right.classList.add("correct");
            $("quizFeedback").style.color = "var(--tc-err)";
            $("quizFeedback").textContent = "✕ 正确答案是 " + slide.answer + "，已展开三级讲解。";
          }
          $("explainDrawer").classList.add("open");
          typesetMath($("explainDrawer"));
        };
      });
      document.querySelectorAll("#explainDrawer .explain-tab").forEach((tab) => {
        tab.onclick = () => {
          document.querySelectorAll("#explainDrawer .explain-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          $("explainBody").innerHTML = (slide.explain || {})[tab.dataset.tier] || "";
          typesetMath($("explainBody"));
        };
      });
    }
  }

  function render() {
    const slides = COURSE.slides || [];
    if (!slides.length) return;
    slideIndex = Math.max(0, Math.min(slides.length - 1, slideIndex));
    const current = slides[slideIndex];
    if ($("studentSegText")) $("studentSegText").textContent = current.seg || "";
    if ($("threeDots")) {
      const order = ["entrance", "study", "exit"];
      const cur = order.indexOf(current.stage);
      $("threeDots").querySelectorAll(".stage-bead").forEach((btn) => {
        const s = btn.dataset.stage;
        btn.classList.toggle("is-active", s === current.stage);
        btn.classList.toggle("is-done", order.indexOf(s) < cur);
        btn.onclick = () => { const t = slides.findIndex((x) => x.stage === s); if (t !== -1) go(t); };
      });
    }
    slideMain.innerHTML = renderSlide(current);
    bindSlide(current);
    typesetMath(slideMain);
    $("progFill").style.width = Math.round(((slideIndex + 1) / slides.length) * 100) + "%";
    $("pageNum").textContent = (slideIndex + 1) + " / " + slides.length;
    $("btnPrev").disabled = slideIndex === 0;
    $("btnNext").disabled = slideIndex === slides.length - 1;
    $("tocList").innerHTML = slides.map((s, idx) => '<button class="toc-item ' + (idx === slideIndex ? 'active' : '') + '" data-idx="' + idx + '">'
      + '<span style="opacity:.65">' + String(idx + 1).padStart(2, '0') + '</span><span>' + (s.title || COURSE.coverTitle) + '</span></button>').join('');
    $("tocList").querySelectorAll(".toc-item").forEach((b) => { b.onclick = () => { $("tocMask").classList.remove("open"); go(Number(b.dataset.idx)); }; });
  }

  function go(i) { stopAllAudio(); slideIndex = i; render(); }
  $("btnPrev").onclick = () => go(slideIndex - 1);
  $("btnNext").onclick = () => go(slideIndex + 1);
  $("btnToc").onclick = () => $("tocMask").classList.add("open");
  $("btnCloseToc").onclick = () => $("tocMask").classList.remove("open");
  $("tocMask").onclick = (e) => { if (e.target === $("tocMask")) $("tocMask").classList.remove("open"); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(slideIndex + 1);
    if (e.key === "ArrowLeft") go(slideIndex - 1);
    if (e.key === "Escape") $("tocMask").classList.remove("open");
  });
  if ($("btnTimerToggle") && $("cwTimerText")) {
    const presets = [45, 90, 120];
    let pIdx = Math.max(0, presets.indexOf(Number(COURSE.classMinutes) || 90));
    let rem = (Number(COURSE.classMinutes) || 90) * 60;
    let tick = null;
    const fmtTime = () => String(Math.floor(rem / 60)).padStart(2, "0") + ":" + String(rem % 60).padStart(2, "0");
    $("cwTimerText").textContent = fmtTime();
    $("btnTimerToggle").onclick = () => {
      if (tick) { clearInterval(tick); tick = null; $("btnTimerToggle").textContent = "继续"; return; }
      $("btnTimerToggle").textContent = "暂停";
      tick = setInterval(() => {
        if (rem > 0) rem -= 1;
        $("cwTimerText").textContent = fmtTime();
        if (rem === 0) { clearInterval(tick); tick = null; $("btnTimerToggle").textContent = "已结束"; }
      }, 1000);
    };
    $("btnTimerPreset").onclick = () => {
      if (tick) { clearInterval(tick); tick = null; }
      pIdx = (pIdx + 1) % presets.length;
      rem = presets[pIdx] * 60;
      $("cwTimerText").textContent = fmtTime();
      $("btnTimerToggle").textContent = "开始";
    };
  }
  document.addEventListener("DOMContentLoaded", render);
})();
</script>
</body>
</html>`;
}

/**
 * Generate a compliant v2.1 student + teacher HTML courseware pair.
 */
export function renderCoursewarePair(input = {}) {
  const { preset, course } = buildCourseSpec(input);
  const studentHtml = renderSingleRoleHtml(course, 'student');
  const teacherHtml = renderSingleRoleHtml(course, 'teacher');

  const studentBytes = Buffer.from(studentHtml, 'utf8');
  const teacherBytes = Buffer.from(teacherHtml, 'utf8');
  if (teacherBytes.length > TEACHER_MAX_BYTES) {
    throw new WeeklyError(`生成的教师私有版 HTML 超过 3MB 上限（当前 ${(teacherBytes.length / 1024 / 1024).toFixed(2)}MB）`, {
      code: 'TEACHER_HTML_TOO_LARGE',
      status: 400,
    });
  }

  const missingPhonetics = [];
  if (preset.key === 'nce' || preset.key === 'eng') {
    for (const s of course.slides) {
      if (s.type === 'word-cards' && Array.isArray(s.words)) {
        for (const w of s.words) {
          const ph = String(w?.ph || w?.phonetic || '').trim();
          if (!ph && w?.en) missingPhonetics.push(String(w.en));
        }
      }
    }
  }
  const warnings = missingPhonetics.length
    ? [`以下词汇缺少 IPA 音标（ph），建议补齐后再发布：${missingPhonetics.join('、')}`]
    : [];

  const slug = sanitizeFileSlug(`${preset.key}-${course.coverTitle}`);
  return {
    version: 'v2.1',
    preset: preset.key,
    presetName: preset.name,
    category: input.category || preset.category,
    topicName: input.topicName || course.headerTitle,
    studentFileName: `${slug}-student.html`,
    teacherFileName: `${slug}-teacher.html`,
    studentHtml,
    teacherHtml,
    studentSize: studentBytes.length,
    teacherSize: teacherBytes.length,
    studentBase64: studentBytes.toString('base64'),
    teacherBase64: teacherBytes.toString('base64'),
    studentSlideCount: course.slides.filter((s) => s.stage === 'study' && s.audience !== 'teacher').length,
    teacherSlideCount: course.slides.filter((s) => s.audience !== 'student').length,
    missingPhonetics,
    warnings,
  };
}
