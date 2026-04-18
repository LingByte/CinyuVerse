import type { Component } from 'vue'
import { BookMarked, BrainCircuit } from 'lucide-vue-next'

/**
 * 工作台侧栏与顶栏共用一份配置，保证 key / routeName 与路由 name 一致，选中态同步。
 */
export interface WorkspaceNavItem {
  /** 与 route.name、菜单 key 保持一致 */
  key: string
  label: string
  routeName: string
  /** Lucide 图标（lucide-vue-next） */
  icon?: Component
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { key: 'home', label: '小说管理', routeName: 'home', icon: BookMarked },
  { key: 'style-learning', label: '风格学习', routeName: 'style-learning', icon: BrainCircuit },
]
