<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { Button, Badge, ScrollArea, Separator } from '@/components/ui'
import ExtensionIcon from '@/components/extensions/ExtensionIcon.vue'
import { useExtensionMarketplace } from '@/composables/useExtensionMarketplace'

const {
  extensionKey,
  listTab,
  selectedMarketplace,
  selectedInstalled,
  marketplaceDetail,
  detailLoading,
  readmeLoadingKey,
  selectedManifest,
  iconDataUrls,
  iconFailed,
  iconLoading,
  busy,
  installingId,
  isInstalledMarketplace,
  installFromStore,
} = useExtensionMarketplace()

function onIconError(key: string) {
  iconFailed.value = { ...iconFailed.value, [key]: true }
}
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <div v-if="listTab === 'marketplace' && selectedMarketplace && marketplaceDetail" class="flex min-h-0 flex-1 flex-col">
      <ScrollArea class="flex-1">
        <div class="mx-auto max-w-3xl p-6">
          <div class="flex gap-5">
            <ExtensionIcon
              :icon-key="extensionKey(selectedMarketplace)"
              :label="marketplaceDetail.displayName"
              :icon-data-urls="iconDataUrls"
              :icon-failed="iconFailed"
              :icon-loading="iconLoading"
              size="lg"
              @error="onIconError(extensionKey(selectedMarketplace))"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-semibold text-foreground">{{ marketplaceDetail.displayName }}</h1>
                <Badge v-if="detailLoading" variant="muted" class="text-[10px]">Updating…</Badge>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ marketplaceDetail.publishedBy || marketplaceDetail.namespace }}
                <span class="mx-1">·</span>
                v{{ marketplaceDetail.version }}
              </p>
              <p class="mt-0.5 font-mono text-xs text-muted-foreground">
                {{ extensionKey(selectedMarketplace) }}
              </p>
              <div class="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  :disabled="
                    busy ||
                    isInstalledMarketplace(selectedMarketplace) ||
                    installingId === extensionKey(selectedMarketplace)
                  "
                  @click="installFromStore(selectedMarketplace)"
                >
                  <Download class="h-4 w-4" />
                  {{
                    installingId === extensionKey(selectedMarketplace)
                      ? 'Installing…'
                      : isInstalledMarketplace(selectedMarketplace)
                        ? 'Installed'
                        : 'Install'
                  }}
                </Button>
                <Badge v-for="cat in marketplaceDetail.categories" :key="cat" variant="outline" class="text-[10px]">
                  {{ cat }}
                </Badge>
              </div>
            </div>
          </div>

          <Separator class="my-6" />

          <div v-if="marketplaceDetail.description" class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h2>
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {{ marketplaceDetail.description }}
            </p>
          </div>

          <div v-if="marketplaceDetail.downloadCount != null" class="mt-4 text-xs text-muted-foreground">
            {{ marketplaceDetail.downloadCount.toLocaleString() }} downloads
          </div>
          <div v-if="marketplaceDetail.repository" class="mt-2 text-xs">
            <span class="text-muted-foreground">Repository: </span>
            <a
              :href="marketplaceDetail.repository"
              class="text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {{ marketplaceDetail.repository }}
            </a>
          </div>
          <div v-if="marketplaceDetail.license" class="mt-1 text-xs text-muted-foreground">
            License: {{ marketplaceDetail.license }}
          </div>

          <div v-if="marketplaceDetail.readme || readmeLoadingKey === extensionKey(selectedMarketplace)" class="mt-8 space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">README</h2>
            <p v-if="readmeLoadingKey === extensionKey(selectedMarketplace) && !marketplaceDetail.readme" class="text-xs text-muted-foreground">
              Loading README…
            </p>
            <pre
              v-else-if="marketplaceDetail.readme"
              class="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground"
            >{{ marketplaceDetail.readme }}</pre>
          </div>
        </div>
      </ScrollArea>
    </div>

    <div v-else-if="listTab === 'installed' && selectedInstalled" class="flex min-h-0 flex-1 flex-col">
      <ScrollArea class="flex-1">
        <div class="mx-auto max-w-3xl p-6">
          <div class="flex gap-5">
            <ExtensionIcon
              :icon-key="selectedInstalled.id"
              :label="selectedInstalled.displayName"
              :icon-data-urls="iconDataUrls"
              :icon-failed="iconFailed"
              :icon-loading="iconLoading"
              size="lg"
              fallback="package"
            />
            <div class="min-w-0 flex-1">
              <h1 class="text-2xl font-semibold text-foreground">{{ selectedInstalled.displayName }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">{{ selectedInstalled.publisher }}</p>
              <p class="font-mono text-xs text-muted-foreground">
                {{ selectedInstalled.id }} · v{{ selectedInstalled.version }}
              </p>
              <Badge variant="secondary" class="mt-3">Installed</Badge>
            </div>
          </div>

          <Separator class="my-6" />

          <div v-if="selectedInstalled.description" class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h2>
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {{ selectedInstalled.description }}
            </p>
          </div>

          <div class="mt-4 grid gap-3 text-xs">
            <div>
              <div class="text-muted-foreground">Install directory</div>
              <div class="mt-0.5 break-all font-mono text-foreground">
                {{ selectedInstalled.installDir || '—' }}
              </div>
            </div>
            <div v-if="selectedInstalled.vsixPath">
              <div class="text-muted-foreground">VSIX path</div>
              <div class="mt-0.5 break-all font-mono text-foreground">{{ selectedInstalled.vsixPath }}</div>
            </div>
          </div>

          <div v-if="selectedManifest" class="mt-8 space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manifest</h2>
            <pre
              class="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-[11px] text-foreground"
            >{{ JSON.stringify(selectedManifest, null, 2) }}</pre>
          </div>
        </div>
      </ScrollArea>
    </div>

    <div v-else class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Select an extension to view details
    </div>
  </div>
</template>
