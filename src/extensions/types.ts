import type { Component } from 'vue';
import type { ActivityBarItem } from '@/types/activity-bar';

export type SidebarPanelRenderProps = {
  rootPath: string;
  onOpenFile: (path: string) => void;
};

export type SidebarPanelContribution = {
  id: string;
  title: string;
  component: Component;
  props?: (ctx: SidebarPanelRenderProps) => Record<string, unknown>;
};

export type ExtensionContributions = {
  activityBarItems: ActivityBarItem[];
  sidebarPanels: SidebarPanelContribution[];
};
