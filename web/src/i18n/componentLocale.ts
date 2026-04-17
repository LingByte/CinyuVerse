import { computed } from 'vue'
import { useI18n } from '@/i18n'

type LocaleTable = Record<string, Record<string, string>>

const componentMessages: LocaleTable = {
  zh: {
    'table.empty': '暂无数据',
    'pagination.prev': '上一页',
    'pagination.next': '下一页',
  },
  en: {
    'table.empty': 'No data',
    'pagination.prev': 'Prev',
    'pagination.next': 'Next',
  },
  ja: {
    'table.empty': 'データがありません',
    'pagination.prev': '前へ',
    'pagination.next': '次へ',
  },
  ru: {
    'table.empty': 'Нет данных',
    'pagination.prev': 'Назад',
    'pagination.next': 'Далее',
  },
}

export const useComponentLocale = () => {
  const { locale } = useI18n()
  const table = computed(() => componentMessages[locale.value as keyof LocaleTable] ?? componentMessages.zh)
  const tc = (key: string, fallback = key) => table.value[key] ?? fallback
  return { tc }
}
