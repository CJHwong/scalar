<script setup lang="ts">
import { provideUseId } from '@headlessui/vue'
import { type SSRState, defaultStateFactory } from '@scalar/oas-utils'
import {
  ResetStyles,
  ScrollbarStyles,
  type ThemeId,
  ThemeStyles,
} from '@scalar/themes'
import { useDebounceFn, useMediaQuery, useResizeObserver } from '@vueuse/core'
import {
  computed,
  getCurrentInstance,
  onMounted,
  onServerPrefetch,
  provide,
  ref,
  useSSRContext,
} from 'vue'
import { toast } from 'vue-sonner'

import {
  GLOBAL_SECURITY_SYMBOL,
  downloadSpecBus,
  downloadSpecFile,
} from '../helpers'
import { useNavState, useSidebar } from '../hooks'
import { useToasts } from '../hooks/useToasts'
import type {
  ReferenceLayoutProps,
  ReferenceLayoutSlot,
  ReferenceSlotProps,
} from '../types'
import { default as ApiClientModal } from './ApiClientModal.vue'
import { Content } from './Content'
import CustomToaster from './CustomToaster.vue'
import GettingStarted from './GettingStarted.vue'
import { Sidebar } from './Sidebar'

const props = defineProps<Omit<ReferenceLayoutProps, 'isDark'>>()

defineEmits<{
  (e: 'changeTheme', value: ThemeId): void
  (e: 'updateContent', value: string): void
  (e: 'loadSwaggerFile'): void
  (e: 'linkSwaggerFile'): void
  (e: 'toggleDarkMode'): void
}>()

defineOptions({
  inheritAttrs: false,
})

// Configure Reference toasts to use vue-sonner
const { initializeToasts } = useToasts()
initializeToasts((message) => {
  toast(message)
})

defineSlots<{
  [x in ReferenceLayoutSlot]: (props: ReferenceSlotProps) => any
}>()

const isLargeScreen = useMediaQuery('(min-width: 1150px)')

// Track the container height to control the sidebar height
const elementHeight = ref('100dvh')
const documentEl = ref<HTMLElement | null>(null)
useResizeObserver(documentEl, (entries) => {
  elementHeight.value = entries[0].contentRect.height + 'px'
})

// Scroll to hash if exists
const {
  breadcrumb,
  collapsedSidebarItems,
  isSidebarOpen,
  setCollapsedSidebarItem,
  hideModels,
} = useSidebar()
const { enableHashListener, getSectionId, getTagId, hash } = useNavState()

enableHashListener()

onMounted(() => {
  if (!hash.value) {
    document.querySelector('#tippy')?.scrollTo({
      top: 0,
      left: 0,
    })
  }

  // Ensure section is open for SSG
  const firstTag = props.parsedSpec.tags?.[0]
  let sectionId: string | null = null

  if (hash.value) sectionId = getSectionId(hash.value)
  else if (firstTag) sectionId = getTagId(firstTag)

  if (sectionId) setCollapsedSidebarItem(sectionId, true)

  // Enable the spec download event bus
  downloadSpecBus.on(() => downloadSpecFile(props.rawSpec))
})

const showRenderedContent = computed(
  () => isLargeScreen.value || !props.configuration.isEditable,
)

// To clear hash when scrolled to the top
const debouncedScroll = useDebounceFn((value) => {
  const scrollDistance = value.target.scrollTop ?? 0
  if (scrollDistance < 50) {
    window.history.replaceState(
      {},
      '',
      window.location.pathname + window.location.search,
    )
    hash.value = ''
  }
})

/** This is passed into all of the slots so they have access to the references data */
const referenceSlotProps = computed<ReferenceSlotProps>(() => ({
  breadcrumb: breadcrumb.value,
  spec: props.parsedSpec,
}))

// Initialize the server state
onServerPrefetch(() => {
  const firstTag = props.parsedSpec.tags?.[0]
  if (firstTag) setCollapsedSidebarItem(getTagId(firstTag), true)

  const ctx = useSSRContext<SSRState>()
  if (!ctx) return

  ctx.scalarState ||= defaultStateFactory()
  ctx.scalarState['useSidebarContent-collapsedSidebarItems'] =
    collapsedSidebarItems
})

/**
 * Due to a bug in headless UI, we need to set an ID here that can be shared across server/client
 * TODO remove this once the bug is fixed
 *
 * @see https://github.com/tailwindlabs/headlessui/issues/2979
 */
provideUseId(() => {
  const instance = getCurrentInstance()
  const ATTR_KEY = 'scalar-instance-id'
  if (!instance) return ATTR_KEY
  let instanceId = instance.uid
  // SSR: grab the instance ID from vue and set it as an attribute
  if (typeof window === 'undefined') {
    instance.attrs ||= {}
    instance.attrs[ATTR_KEY] = instanceId
  }
  // Client: grab the instanceId from the attribute and return it to headless UI
  else if (instance.vnode.el?.getAttribute) {
    instanceId = instance.vnode.el.getAttribute(ATTR_KEY)
  }
  return `${ATTR_KEY}-${instanceId}`
})

// Provide global security
provide(GLOBAL_SECURITY_SYMBOL, () => props.parsedSpec.security)

hideModels.value = props.configuration.hideModels ?? false
</script>
<template>
  <ThemeStyles :id="configuration?.theme" />
  <ResetStyles v-slot="{ styles: reset }">
    <ScrollbarStyles v-slot="{ styles: scrollbars }">
      <div
        ref="documentEl"
        class="scalar-api-reference references-layout"
        :class="[
          {
            'references-editable': configuration.isEditable,
            'references-sidebar': configuration.showSidebar,
            'references-sidebar-mobile-open': isSidebarOpen,
            'references-classic': configuration.layout === 'classic',
          },
          reset,
          scrollbars,
          $attrs.class,
        ]"
        :style="{ '--full-height': elementHeight }"
        @scroll.passive="debouncedScroll">
        <!-- Header -->
        <div class="references-header">
          <slot
            v-bind="referenceSlotProps"
            name="header" />
        </div>
        <!-- Navigation (sidebar) wrapper -->
        <aside
          v-if="configuration.showSidebar"
          class="references-navigation t-doc__sidebar">
          <!-- Navigation tree / Table of Contents -->
          <div class="references-navigation-list">
            <Sidebar :parsedSpec="parsedSpec">
              <template #sidebar-start>
                <slot
                  v-bind="referenceSlotProps"
                  name="sidebar-start" />
              </template>
              <template #sidebar-end>
                <slot
                  v-bind="referenceSlotProps"
                  name="sidebar-end" />
              </template>
            </Sidebar>
          </div>
        </aside>
        <!-- Swagger file editing -->
        <div
          v-show="configuration.isEditable"
          class="references-editor">
          <div class="references-editor-textarea">
            <slot
              v-bind="referenceSlotProps"
              name="editor" />
          </div>
        </div>
        <!-- Rendered reference -->
        <template v-if="showRenderedContent">
          <div class="references-rendered">
            <Content
              :layout="
                configuration.layout === 'classic' ? 'accordion' : 'default'
              "
              :parsedSpec="parsedSpec">
              <template #start>
                <slot
                  v-bind="referenceSlotProps"
                  name="content-start" />
              </template>
              <template
                v-if="configuration?.isEditable"
                #empty-state>
                <GettingStarted
                  :theme="configuration?.theme || 'default'"
                  @changeTheme="$emit('changeTheme', $event)"
                  @linkSwaggerFile="$emit('linkSwaggerFile')"
                  @loadSwaggerFile="$emit('loadSwaggerFile')"
                  @updateContent="$emit('updateContent', $event)" />
              </template>
              <template #end>
                <slot
                  v-bind="referenceSlotProps"
                  name="content-end" />
              </template>
            </Content>
          </div>
          <div
            v-if="$slots.footer"
            class="references-footer">
            <slot
              v-bind="referenceSlotProps"
              name="footer" />
          </div>
        </template>
        <!-- REST API Client Overlay -->
        <ApiClientModal
          :parsedSpec="parsedSpec"
          :proxyUrl="configuration?.proxy">
          <template #sidebar-start>
            <slot
              v-bind="referenceSlotProps"
              name="sidebar-start" />
          </template>
          <template #sidebar-end>
            <slot
              v-bind="referenceSlotProps"
              name="sidebar-end" />
          </template>
        </ApiClientModal>
      </div>
    </ScrollbarStyles>
  </ResetStyles>
  <!-- Initialize the vue-sonner instance -->
  <CustomToaster />
</template>
<style scoped>
/* Configurable Layout Variables */
.scalar-api-reference {
  --refs-sidebar-width: var(--theme-sidebar-width, 0px);
  --refs-header-height: var(--theme-header-height, 0px);
  --refs-content-max-width: var(--theme-content-max-width, 1540px);
}

.scalar-api-reference.references-classic {
  /* Classic layout is wider */
  --refs-content-max-width: var(--theme-content-max-width, 1420px);
  min-height: 100dvh;
}

/* ----------------------------------------------------- */
/* References Layout */
.references-layout {
  /* Try to fill the container */
  height: 100dvh;
  max-height: 100%;
  width: 100dvw;
  max-width: 100%;
  flex: 1;

  /* Scroll vertically */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;

  /*
  Calculated by a resize observer and set in the style attribute
  Falls back to the viewport height
  */
  --full-height: 100dvh;

  /* Grid layout */
  display: grid;
  grid-template-rows: var(--refs-header-height) repeat(2, auto);
  grid-template-columns: var(--refs-sidebar-width) 1fr;
  grid-template-areas:
    'header header'
    'navigation rendered'
    'footer footer';

  background: var(--theme-background-1, var(--default-theme-background-1));
}

.references-header {
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: 10;

  height: var(--refs-header-height);
}

.references-editor {
  grid-area: editor;
  display: flex;
  min-width: 0;
  background: var(--theme-background-1, var(--default-theme-background-1));
  z-index: 1;
}

.references-navigation {
  grid-area: navigation;
}

.references-rendered {
  position: relative;
  grid-area: rendered;
  min-width: 0;
  background: var(--theme-background-1, var(--default-theme-background-1));
}
.scalar-api-reference.references-classic,
.references-classic .references-rendered {
  --full-height: fit-content !important;
  height: initial !important;
  max-height: initial !important;
}
.references-navigation-list {
  position: sticky;
  top: var(--refs-header-height);
  height: calc(var(--full-height) - var(--refs-header-height));
  background: var(
    --sidebar-background-1,
    var(
      --default-sidebar-background-1,
      var(--theme-background-1, var(--default-theme-background-1))
    )
  );
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Fix the editor in the middle while allowing the rest of the view to scroll */
.references-editor-textarea {
  position: sticky;
  top: var(--refs-header-height);
  height: calc(var(--full-height) - var(--refs-header-height));
  display: flex;
  min-width: 0;
  flex: 1;
}

.references-editable {
  grid-template-columns: var(--refs-sidebar-width) 1fr 1fr;

  grid-template-areas:
    'header header header'
    'navigation editor rendered'
    'footer footer footer';
}

.references-sidebar {
  /* Set a default width if references are enabled */
  --refs-sidebar-width: var(--theme-sidebar-width, 280px);
}

/* Footer */
.references-footer {
  grid-area: footer;
}
/* ----------------------------------------------------- */
/* Responsive / Mobile Layout */

@media (max-width: 1150px) {
  /* Hide rendered view for tablets */
  .references-layout {
    grid-template-columns: var(--refs-sidebar-width) 1fr 0px;
  }
}

@media (max-width: 1000px) {
  /* Stack view on mobile */
  .references-layout {
    grid-template-columns: auto;
    grid-template-rows: var(--refs-header-height) 0px auto auto;

    grid-template-areas:
      'header'
      'navigation'
      'rendered'
      'footer';
  }
  .references-sidebar.references-sidebar-mobile-open {
    overflow-y: hidden;
  }
  .references-editable {
    grid-template-areas:
      'header'
      'navigation'
      'editor';
  }

  .references-navigation,
  .references-rendered {
    max-height: unset;
  }

  .references-rendered {
    position: static;
  }

  .references-navigation {
    display: none;
    position: sticky;
    top: var(--refs-header-height);
    height: 0px;
    z-index: 10;
  }

  .references-sidebar-mobile-open .references-navigation {
    display: block;
  }

  .references-navigation-list {
    position: absolute;

    /* Offset by 1px to avoid gap */
    top: -1px;

    /* Add a pixel to cover the bottom of the viewport */
    height: calc(var(--full-height) - var(--refs-header-height) + 1px);
    width: 100%;

    border-top: 1px solid
      var(--theme-border-color, var(--default-theme-border-color));
    display: flex;
    flex-direction: column;
  }
}
</style>
