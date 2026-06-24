<script setup lang="ts">
import { onMounted } from 'vue'
import { Search } from 'lucide-vue-next'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { Button, Input, Alert, AlertDescription, Badge, ScrollArea, Tabs, TabsList, TabsTrigger } from '@/components/ui'
import { cn } from '@/lib/utils'
import ExtensionIcon from '@/components/extensions/ExtensionIcon.vue'
import { useExtensionMarketplace } from '@/composables/useExtensionMarketplace'

const {
  extensionKey,
  busy,
  error,
  query,
  results,
  searching,
  page,
  listTab,
  selectedMarketplaceKey,
  selectedInstalledId,
  iconDataUrls,
  iconFailed,
  iconLoading,
  list,
  isInstalledMarketplace,
  selectMarketplace,
  selectInstalled,
  installFromVsix,
  initExtensionMarketplace,
} = useExtensionMarketplace()

function onIconError(key: string) {
  iconFailed.value = { ...iconFailed.value, [key]: true }
}

onMounted(() => {
  initExtensionMarketplace()
})
</script>

<template>
  <PanelShell title="Extensions">
    <template #actions>
      <Button size="sm" variant="outline" :disabled="busy" @click="installFromVsix">
        Install from VSIX…
      </Button>
    </template>

    <template #toolbar>
      <div class="space-y-2 border-b border-border px-3 py-2">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input v-model="query" class="pl-8" placeholder="Search Extensions in Marketplace" />
        </div>
        <Tabs v-model="listTab" class="w-full">
          <TabsList class="grid h-8 w-full grid-cols-2">
            <TabsTrigger value="marketplace" class="text-xs">Marketplace</TabsTrigger>
            <TabsTrigger value="installed" class="text-xs">
              Installed
              <Badge v-if="list.length" variant="muted" class="ml-1.5 h-4 px-1.5 text-[10px]">
                {{ list.length }}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div v-if="listTab === 'marketplace'" class="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{{ searching ? 'Searching…' : `${results.length} results` }}</span>
          <div class="flex gap-1">
            <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" :disabled="page === 0" @click="page = Math.max(0, page - 1)">
              Prev
            </Button>
            <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" :disabled="results.length < 20" @click="page += 1">
              Next
            </Button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="error" #alert>
      <Alert variant="destructive">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
    </template>

    <ScrollArea class="h-full">
      <div v-if="listTab === 'marketplace'" class="p-1">
        <button
          v-for="r in results"
          :key="extensionKey(r)"
          type="button"
          :class="
            cn(
              'flex w-full gap-2 rounded-md p-2 text-left transition-colors hover:bg-accent/60',
              selectedMarketplaceKey === extensionKey(r) && 'bg-accent',
            )
          "
          @click="selectMarketplace(r)"
        >
          <ExtensionIcon
            :icon-key="extensionKey(r)"
            :label="r.displayName ?? extensionKey(r)"
            :icon-data-urls="iconDataUrls"
            :icon-failed="iconFailed"
            :icon-loading="iconLoading"
            size="md"
            @error="onIconError(extensionKey(r))"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-foreground">
              {{ r.displayName ?? extensionKey(r) }}
            </div>
            <div class="truncate text-[11px] text-muted-foreground">{{ extensionKey(r) }}</div>
            <div v-if="isInstalledMarketplace(r)" class="mt-1">
              <Badge variant="secondary" class="h-4 px-1.5 text-[10px]">Installed</Badge>
            </div>
          </div>
        </button>
        <div v-if="!searching && !results.length" class="p-3 text-xs text-muted-foreground">
          No extensions found.
        </div>
      </div>

      <div v-else class="p-1">
        <button
          v-for="e in list"
          :key="e.id"
          type="button"
          :class="
            cn(
              'flex w-full gap-2 rounded-md p-2 text-left transition-colors hover:bg-accent/60',
              selectedInstalledId === e.id && 'bg-accent',
            )
          "
          @click="selectInstalled(e.id)"
        >
          <ExtensionIcon
            :icon-key="e.id"
            :label="e.displayName"
            :icon-data-urls="iconDataUrls"
            :icon-failed="iconFailed"
            :icon-loading="iconLoading"
            size="md"
            fallback="package"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-foreground">{{ e.displayName }}</div>
            <div class="truncate text-[11px] text-muted-foreground">{{ e.id }}</div>
            <div class="text-[10px] text-muted-foreground">v{{ e.version }}</div>
          </div>
        </button>
        <div v-if="!list.length" class="p-3 text-xs text-muted-foreground">No extensions installed.</div>
      </div>
    </ScrollArea>
  </PanelShell>
</template>
