<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2 } from 'lucide-vue-next'
import { cva, type VariantProps } from 'class-variance-authority'

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        success: 'border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

interface Props {
  variant?: VariantProps<typeof alertVariants>['variant']
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

const icon = computed(() => {
  if (props.variant === 'destructive') return AlertCircle
  if (props.variant === 'success') return CheckCircle2
  return null
})
</script>

<template>
  <div :class="cn(alertVariants({ variant }), props.class)" role="alert">
    <component :is="icon" v-if="icon" />
    <div class="[&>svg+div]:pl-7">
      <slot />
    </div>
  </div>
</template>
