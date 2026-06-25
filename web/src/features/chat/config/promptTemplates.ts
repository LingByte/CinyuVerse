export interface PromptTemplate {
  id: string
  name: string
  category: string
  content: string
  builtin?: boolean
}

export const BUILTIN_PROMPTS: PromptTemplate[] = [
  {
    id: 'web-novel',
    name: '网文快节奏',
    category: '网文',
    content: '节奏明快，每段必有冲突或悬念，对话简洁有力，避免大段说明。',
    builtin: true,
  },
  {
    id: 'literary',
    name: '出版文学',
    category: '出版',
    content: '注重文学性与心理描写，语言精炼，意象丰富，节奏舒缓有张力。',
    builtin: true,
  },
  {
    id: 'mystery',
    name: '悬疑推理',
    category: '悬疑',
    content: '线索埋设自然，反转合理，保持信息差，读者与主角同步推理。',
    builtin: true,
  },
  {
    id: 'ancient',
    name: '古风言情',
    category: '古风',
    content: '半文半白，称谓礼仪准确，场景诗意，情感含蓄而浓烈。',
    builtin: true,
  },
  {
    id: 'scifi',
    name: '科幻硬设定',
    category: '科幻',
    content: '技术设定自洽，通过行动展示世界观，避免百科式说明。',
    builtin: true,
  },
]
