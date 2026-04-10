import type { App, InjectionKey } from 'vue'
import { computed, inject, ref } from 'vue'

export type Locale = 'zh' | 'en' | 'ja' | 'ru'

type Messages = Record<string, string>

const messages: Record<Locale, Messages> = {
  zh: {
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.ru': 'Русский',

    'app.title': '自定义组件展示页',
    'app.subtitle': '你现在可以基于 Button、Badge、Select 快速构建自己的组件体系。默认主题为淡紫色，并且支持一键切换主题色。',

    'section.button2': 'Button2 Playground',
    'section.layout': 'Layout Playground',
    'section.card': 'Card Playground',
    'section.icon': 'Icon Playground',

    'common.copy': '复制代码',
    'common.preview': '代码预览（可收起/展开）',
    'common.example_component': '示例组件（复制即可用）',
    'common.entry_styles': '入口需引入样式（包含动画）',

    'icon.subtitle': '字体图标组件库（Iconfont Symbol）',
    'common.language': '语言',

    'section.button2.hint': '在浏览器内选择你喜欢的样式（实时预览）',
    'section.layout.hint': '布局容器组件库（实时预览 + 可复制用法）',
    'section.card.hint': '卡片组件库（实时预览 + 可复制用法）',
    'section.icon.hint': '字体图标组件库（Iconfont Symbol）',

    'field.variant': '样式',
    'field.size': '尺寸',
    'field.color': '颜色',
    'field.custom_color': '自定义颜色',
    'field.radius': '圆角',
    'field.width': '宽度',
    'field.height': '高度',
    'field.padding': '内边距',
    'field.font_size': '字体大小',
    'field.label': '文案',

    'layout.field.surface': '容器质感',
    'layout.field.preset': '布局样式',
    'layout.field.max_width': '最大宽度',
    'layout.field.border': '边框',
    'layout.field.stack_gap': 'Stack 间距',
    'layout.field.flex_gap': 'Flex 间距',
    'layout.field.grid_min': '侧栏宽度',
    'layout.field.grid_gap': '网格间距',

    'layout.preset.aside': '侧栏布局',
    'layout.preset.stacked': '上下布局',
    'layout.preset.cards': '卡片网格',

    'card.field.edit': '编辑卡片',
    'card.action.add': '新增卡片',
    'card.action.remove': '删除当前',
    'card.field.surface': 'Surface',
    'card.field.shadow': 'Shadow',
    'card.field.interactive': 'Interactive',
    'card.field.border': 'Border',
    'card.field.title': 'Title',
    'card.field.subtitle': 'Subtitle',
    'card.field.body': 'Body',
    'card.placeholder.padding': '为空则使用 Header/Body/Footer 的 padding',

    'icon.field.script_url': '脚本地址',
    'icon.field.name': '图标名称',
    'icon.field.size': '大小',
    'icon.field.color': '颜色',
    'icon.field.rotate': '旋转',
    'icon.field.spin': '旋转动画',
    'icon.label.github': 'GitHub',
    'icon.label.bilibili': 'Bilibili',
    'icon.label.music': '音乐',
    'icon.label.blog': '博客',
  },
  en: {
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.ru': 'Русский',

    'app.title': 'Custom Components Showcase',
    'app.subtitle': 'Build your own component system quickly with Button, Badge and Select. Default theme is lavender and you can switch theme colors.',

    'section.button2': 'Button2 Playground',
    'section.layout': 'Layout Playground',
    'section.card': 'Card Playground',
    'section.icon': 'Icon Playground',

    'common.copy': 'Copy Code',
    'common.preview': 'Code Preview (toggle)',
    'common.example_component': 'Example (copy & use)',
    'common.entry_styles': 'Entry: import styles (includes animations)',

    'icon.subtitle': 'Iconfont Symbol Icon Library',
    'common.language': 'Language',

    'section.button2.hint': 'Choose your preferred styles in the browser (live preview).',
    'section.layout.hint': 'Layout component library (live preview + copy usage).',
    'section.card.hint': 'Card component library (live preview + copy usage).',
    'section.icon.hint': 'Iconfont Symbol icon library.',

    'field.variant': 'Variant',
    'field.size': 'Size',
    'field.color': 'Color',
    'field.custom_color': 'Custom Color',
    'field.radius': 'Radius',
    'field.width': 'Width',
    'field.height': 'Height',
    'field.padding': 'Padding',
    'field.font_size': 'Font Size',
    'field.label': 'Label',

    'layout.field.surface': 'Surface',
    'layout.field.preset': 'Preset',
    'layout.field.max_width': 'Max Width',
    'layout.field.border': 'Border',
    'layout.field.stack_gap': 'Stack Gap',
    'layout.field.flex_gap': 'Flex Gap',
    'layout.field.grid_min': 'Aside Width',
    'layout.field.grid_gap': 'Grid Gap',

    'layout.preset.aside': 'Aside',
    'layout.preset.stacked': 'Stacked',
    'layout.preset.cards': 'Cards',

    'card.field.edit': 'Edit Card',
    'card.action.add': 'Add',
    'card.action.remove': 'Remove',
    'card.field.surface': 'Surface',
    'card.field.shadow': 'Shadow',
    'card.field.interactive': 'Interactive',
    'card.field.border': 'Border',
    'card.field.title': 'Title',
    'card.field.subtitle': 'Subtitle',
    'card.field.body': 'Body',
    'card.placeholder.padding': 'Leave empty to use header/body padding',

    'icon.field.script_url': 'Script URL',
    'icon.field.name': 'Name',
    'icon.field.size': 'Size',
    'icon.field.color': 'Color',
    'icon.field.rotate': 'Rotate',
    'icon.field.spin': 'Spin',
    'icon.label.github': 'GitHub',
    'icon.label.bilibili': 'Bilibili',
    'icon.label.music': 'Music',
    'icon.label.blog': 'Blog',
  },
  ja: {
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.ru': 'Русский',

    'app.title': 'カスタムコンポーネント表示ページ',
    'app.subtitle': 'Button・Badge・Select を使ってコンポーネント体系を素早く構築できます。デフォルトはラベンダーテーマで、テーマ色の切替にも対応します。',

    'section.button2': 'Button2 Playground',
    'section.layout': 'Layout Playground',
    'section.card': 'Card Playground',
    'section.icon': 'Icon Playground',

    'common.copy': 'コードをコピー',
    'common.preview': 'コードプレビュー（開閉）',
    'common.example_component': 'サンプル（コピーして使用）',
    'common.entry_styles': 'エントリ：スタイルを読み込み（アニメ含む）',

    'icon.subtitle': 'Iconfont Symbol アイコンライブラリ',
    'common.language': '言語',

    'section.button2.hint': 'ブラウザで好みのスタイルを選択（ライブプレビュー）。',
    'section.layout.hint': 'レイアウトコンポーネント（ライブプレビュー + 使用例コピー）。',
    'section.card.hint': 'カードコンポーネント（ライブプレビュー + 使用例コピー）。',
    'section.icon.hint': 'Iconfont Symbol アイコンライブラリ。',

    'field.variant': 'バリアント',
    'field.size': 'サイズ',
    'field.color': 'カラー',
    'field.custom_color': 'カスタムカラー',
    'field.radius': '角丸',
    'field.width': '幅',
    'field.height': '高さ',
    'field.padding': 'パディング',
    'field.font_size': 'フォントサイズ',
    'field.label': 'ラベル',

    'layout.field.surface': '質感',
    'layout.field.preset': 'レイアウト',
    'layout.field.max_width': '最大幅',
    'layout.field.border': 'ボーダー',
    'layout.field.stack_gap': 'Stack 間隔',
    'layout.field.flex_gap': 'Flex 間隔',
    'layout.field.grid_min': 'サイド幅',
    'layout.field.grid_gap': 'グリッド間隔',

    'layout.preset.aside': 'サイドバー',
    'layout.preset.stacked': '上下',
    'layout.preset.cards': 'カードグリッド',

    'card.field.edit': '編集カード',
    'card.action.add': '追加',
    'card.action.remove': '削除',
    'card.field.surface': 'Surface',
    'card.field.shadow': 'Shadow',
    'card.field.interactive': 'Interactive',
    'card.field.border': 'Border',
    'card.field.title': 'Title',
    'card.field.subtitle': 'Subtitle',
    'card.field.body': 'Body',
    'card.placeholder.padding': '空の場合はヘッダー/本文の padding を使用',

    'icon.field.script_url': 'スクリプトURL',
    'icon.field.name': '名前',
    'icon.field.size': 'サイズ',
    'icon.field.color': '色',
    'icon.field.rotate': '回転',
    'icon.field.spin': '回転アニメ',
    'icon.label.github': 'GitHub',
    'icon.label.bilibili': 'Bilibili',
    'icon.label.music': '音楽',
    'icon.label.blog': 'ブログ',
  },
  ru: {
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.ru': 'Русский',

    'app.title': 'Витрина пользовательских компонентов',
    'app.subtitle': 'Быстро создавайте свою систему компонентов на основе Button, Badge и Select. Тема по умолчанию — лавандовая, поддерживается смена цветовой темы.',

    'section.button2': 'Button2 Playground',
    'section.layout': 'Layout Playground',
    'section.card': 'Card Playground',
    'section.icon': 'Icon Playground',

    'common.copy': 'Копировать код',
    'common.preview': 'Предпросмотр кода (переключить)',
    'common.example_component': 'Пример (скопировать и использовать)',
    'common.entry_styles': 'Вход: импорт стилей (с анимациями)',

    'icon.subtitle': 'Библиотека иконок Iconfont Symbol',
    'common.language': 'Язык',

    'section.button2.hint': 'Выберите стили в браузере (живой предпросмотр).',
    'section.layout.hint': 'Библиотека layout-компонентов (предпросмотр + копирование).',
    'section.card.hint': 'Библиотека карточек (предпросмотр + копирование).',
    'section.icon.hint': 'Библиотека иконок Iconfont Symbol.',

    'field.variant': 'Вариант',
    'field.size': 'Размер',
    'field.color': 'Цвет',
    'field.custom_color': 'Свoй цвет',
    'field.radius': 'Скругление',
    'field.width': 'Ширина',
    'field.height': 'Высота',
    'field.padding': 'Отступы',
    'field.font_size': 'Размер шрифта',
    'field.label': 'Текст',

    'layout.field.surface': 'Фон',
    'layout.field.preset': 'Шаблон',
    'layout.field.max_width': 'Макс. ширина',
    'layout.field.border': 'Граница',
    'layout.field.stack_gap': 'Stack отступ',
    'layout.field.flex_gap': 'Flex отступ',
    'layout.field.grid_min': 'Ширина aside',
    'layout.field.grid_gap': 'Grid отступ',

    'layout.preset.aside': 'Сайдбар',
    'layout.preset.stacked': 'Вертикально',
    'layout.preset.cards': 'Карточки',

    'card.field.edit': 'Редактировать',
    'card.action.add': 'Добавить',
    'card.action.remove': 'Удалить',
    'card.field.surface': 'Surface',
    'card.field.shadow': 'Shadow',
    'card.field.interactive': 'Interactive',
    'card.field.border': 'Border',
    'card.field.title': 'Title',
    'card.field.subtitle': 'Subtitle',
    'card.field.body': 'Body',
    'card.placeholder.padding': 'Оставьте пустым, чтобы использовать padding секций',

    'icon.field.script_url': 'URL скрипта',
    'icon.field.name': 'Имя',
    'icon.field.size': 'Размер',
    'icon.field.color': 'Цвет',
    'icon.field.rotate': 'Поворот',
    'icon.field.spin': 'Вращение',
    'icon.label.github': 'GitHub',
    'icon.label.bilibili': 'Bilibili',
    'icon.label.music': 'Музыка',
    'icon.label.blog': 'Блог',
  },
}

export interface I18nContext {
  locale: ReturnType<typeof ref<Locale>>
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

export const I18N_KEY: InjectionKey<I18nContext> = Symbol('I18N')

export const createI18n = (initialLocale?: Locale) => {
  const stored = (typeof window !== 'undefined' ? window.localStorage.getItem('cv_locale') : null) as Locale | null
  const locale = ref<Locale>(stored || initialLocale || 'zh')

  const setLocale = (next: Locale) => {
    locale.value = next
    try {
      window.localStorage.setItem('cv_locale', next)
    } catch {
      return
    }
  }

  const t = (key: string) => {
    const table = messages[locale.value]
    return table?.[key] ?? messages.zh[key] ?? key
  }

  const ctx: I18nContext = {
    locale,
    setLocale,
    t,
  }

  return ctx
}

export const i18nPlugin = (initialLocale?: Locale) => {
  const ctx = createI18n(initialLocale)

  return {
    install(app: App) {
      app.provide(I18N_KEY, ctx)
      app.config.globalProperties.$t = ctx.t
      app.config.globalProperties.$locale = ctx.locale
      app.config.globalProperties.$setLocale = ctx.setLocale
    },
  }
}

export const useI18n = () => {
  const ctx = inject(I18N_KEY)
  if (!ctx) {
    throw new Error('I18n context is not provided. Make sure to install i18nPlugin in main.ts.')
  }

  const locale = computed(() => ctx.locale.value)

  return {
    t: ctx.t,
    locale,
    setLocale: ctx.setLocale,
  }
}
