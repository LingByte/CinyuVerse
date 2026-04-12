import type { AxiosInstance } from 'axios'

declare module 'vue' {
  interface ComponentCustomProperties {
    /** 由 installHttpClient 注册的 Axios 实例 */
    $http: AxiosInstance
  }
}

export {}
