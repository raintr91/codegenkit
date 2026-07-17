<script setup lang="ts">
/**
 * portal-gen stub — replace or move to components/molecules/.
 * Wired from spec tag #needs-component.
 */
const props = defineProps<{
  value?: unknown
  managers?: Array<{ id: number; full_name?: string | null }>
  row?: Record<string, unknown>
  testId?: string
}>()

defineEmits<{
  (event: 'login-as', manager: { id: number; full_name?: string | null }): void
}>()

function managerLabel(manager: { id: number; full_name?: string | null }) {
  const name = manager.full_name?.trim()
  if (!name || name.toLowerCase() === 'mairy') return null
  return name
}

const visibleManagers = computed(() =>
  (props.managers ?? []).filter((manager) => managerLabel(manager) !== null)
)
</script>

<template>
  <span
    class="inline-flex flex-wrap items-center gap-1"
    :data-testid="props.testId"
  >
    <button
      v-for="manager in visibleManagers"
      :key="manager.id"
      type="button"
      class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800"
      :data-testid="props.testId ? `${props.testId}-login-as-${manager.id}` : undefined"
      @click="$emit('login-as', manager)"
    >
      <span v-text="managerLabel(manager) ?? manager.id" />
    </button>
  </span>
</template>
