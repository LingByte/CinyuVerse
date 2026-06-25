import type { Component } from 'vue'

export type ActivityBarItem = {
  id: string
  label: string
  icon?: Component
  disabled?: boolean
  active?: boolean
  onSelect?: () => void
}
