import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import InspirationLayout from '@/layouts/InspirationLayout.vue'
import HomeView from '@/views/HomeView.vue'
import NovelVolumesView from '@/views/NovelVolumesView.vue'
import NovelCharactersView from '@/views/NovelCharactersView.vue'
import NovelStorylinesView from '@/views/NovelStorylinesView.vue'
import StyleLearningView from '@/views/StyleLearningView.vue'
import ChapterCreateView from '@/views/ChapterCreateView.vue'
import ChapterEditView from '@/views/ChapterEditView.vue'
import InspirationChatView from '@/views/inspiration/InspirationChatView.vue'
import InspirationGateView from '@/views/inspiration/InspirationGateView.vue'

const historyBase =
  import.meta.env.BASE_URL === './' || import.meta.env.BASE_URL === '' ? '/' : import.meta.env.BASE_URL

const router = createRouter({
  history: createWebHistory(historyBase),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: HomeView,
          meta: { title: '小说管理' },
        },
        {
          path: 'novels/:id',
          name: 'novel-detail',
          component: NovelVolumesView,
          meta: { title: '卷管理' },
          beforeEnter: (to) => {
            const id = to.params.id
            const s = Array.isArray(id) ? id[0] : id
            if (!s || !/^\d+$/.test(String(s))) {
              return { name: 'home' }
            }
          },
        },
        {
          path: 'novels/:id/characters',
          name: 'novel-characters',
          component: NovelCharactersView,
          meta: { title: '角色管理' },
          beforeEnter: (to) => {
            const id = to.params.id
            const s = Array.isArray(id) ? id[0] : id
            if (!s || !/^\d+$/.test(String(s))) {
              return { name: 'home' }
            }
          },
        },
        {
          path: 'novels/:id/storylines',
          name: 'novel-storylines',
          component: NovelStorylinesView,
          meta: { title: '故事线管理' },
          beforeEnter: (to) => {
            const id = to.params.id
            const s = Array.isArray(id) ? id[0] : id
            if (!s || !/^\d+$/.test(String(s))) {
              return { name: 'home' }
            }
          },
        },
        {
          path: 'style-learning',
          name: 'style-learning',
          component: StyleLearningView,
          meta: { title: '风格学习' },
        },
        {
          path: 'novels/:id/volumes/:volumeId/chapters/new',
          name: 'chapter-create',
          component: ChapterCreateView,
          meta: { title: '新增章节' },
          beforeEnter: (to) => {
            const nid = Array.isArray(to.params.id) ? to.params.id[0] : to.params.id
            const vid = Array.isArray(to.params.volumeId) ? to.params.volumeId[0] : to.params.volumeId
            if (!nid || !vid || !/^\d+$/.test(String(nid)) || !/^\d+$/.test(String(vid))) {
              return { name: 'home' }
            }
          },
        },
        {
          path: 'novels/:id/volumes/:volumeId/chapters/:chapterId',
          name: 'chapter-edit',
          component: ChapterEditView,
          meta: { title: '编辑章节' },
          beforeEnter: (to) => {
            const nid = Array.isArray(to.params.id) ? to.params.id[0] : to.params.id
            const vid = Array.isArray(to.params.volumeId) ? to.params.volumeId[0] : to.params.volumeId
            const cid = Array.isArray(to.params.chapterId) ? to.params.chapterId[0] : to.params.chapterId
            if (!nid || !vid || !cid || !/^\d+$/.test(String(nid)) || !/^\d+$/.test(String(vid)) || !/^\d+$/.test(String(cid))) {
              return { name: 'home' }
            }
          },
        },
      ],
    },
    {
      path: '/inspiration',
      component: InspirationLayout,
      children: [
        {
          path: '',
          name: 'inspiration-root',
          component: InspirationGateView,
          meta: { title: '灵感中心' },
        },
        {
          path: ':sessionId',
          name: 'inspiration-session',
          component: InspirationChatView,
          meta: { title: '灵感中心' },
          beforeEnter: (to) => {
            const id = to.params.sessionId
            const s = Array.isArray(id) ? id[0] : id
            if (!s || !/^\d+$/.test(String(s))) {
              return { name: 'inspiration-root' }
            }
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/',
    },
  ],
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'CinyuVerse'
  document.title = `${title} · CinyuVerse`
})

export default router
