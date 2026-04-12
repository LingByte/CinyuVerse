import axios, { AxiosHeaders, isAxiosError } from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { App, InjectionKey } from 'vue'
import { getApiBaseURL } from '@/config/apiConfig'

/** 在组件中配合 inject 使用 */
export const axiosInstanceKey: InjectionKey<AxiosInstance> = Symbol('axiosInstance')

let unauthorizedHandler: (() => void | Promise<void>) | null = null

/**
 * 在应用入口（如 main.ts）注册 401 行为，例如：
 * setHttpUnauthorizedHandler(() => router.push({ name: 'login' }))
 */
export function setHttpUnauthorizedHandler(handler: (() => void | Promise<void>) | null) {
  unauthorizedHandler = handler
}

/** 将 Axios 挂到 Vue：provide + globalProperties.$http */
export function installHttpClient(app: App) {
  app.config.globalProperties.$http = axiosInstance
  app.provide(axiosInstanceKey, axiosInstance)
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 100_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Vite 下每次请求拉最新 baseURL（.env 变更、HMR 时仍可用）
    config.baseURL = getApiBaseURL()

    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (config.data instanceof FormData) {
      if (config.headers instanceof AxiosHeaders) {
        config.headers.delete('Content-Type')
      } else {
        delete (config.headers as Record<string, unknown>)['Content-Type']
      }
    }

    if (config.params && typeof config.params === 'object') {
      ;(config.params as Record<string, unknown>)._t = Date.now()
    } else {
      config.params = { _t: Date.now() }
    }

    if (import.meta.env.DEV) {
      const base = config.baseURL ?? ''
      const path = config.url ?? ''
      console.debug('[http]', (config.method ?? 'get').toUpperCase(), base + path)
    }

    return config
  },
  (error: unknown) => Promise.reject(error),
)

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: unknown) => {
    if (import.meta.env.DEV) {
      console.error('[http] response error', error)
    }

    if (isAxiosError(error)) {
      const status = error.response?.status
      if (status === 401) {
        localStorage.removeItem('auth_token')
        const h = unauthorizedHandler
        if (h) {
          void Promise.resolve(h()).catch(() => {})
        }
      } else if (import.meta.env.DEV && status) {
        console.warn('[http] status', status, error.response?.data)
      }
    }

    return Promise.reject(error)
  },
)

export default axiosInstance
