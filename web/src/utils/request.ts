import axiosInstance from '@/utils/axios'
import { isAxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

/** 与 request 中 throw 的对象形状一致，便于在 Vue 组件里类型收窄 */
export interface ApiRequestFailure {
  code: number
  msg: string
  data: unknown
  error?: unknown
}

function toFailure(code: number, msg: string, data: unknown, error?: unknown): ApiRequestFailure {
  return { code, msg, data, error }
}

const request = async <T = unknown>(
  url: string,
  options: Partial<InternalAxiosRequestConfig> = {},
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await axiosInstance({
      url,
      ...options,
    })
    return response.data
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      const errorData = err.response.data as Record<string, unknown>
      if (typeof errorData.code === 'number' || typeof errorData.code === 'string') {
        const code = Number(errorData.code)
        const msg =
          (typeof errorData.msg === 'string' && errorData.msg) ||
          (typeof errorData.message === 'string' && errorData.message) ||
          (typeof errorData.error === 'string' && errorData.error) ||
          '请求失败'
        throw toFailure(Number.isFinite(code) ? code : err.response.status || 500, msg, errorData.data ?? null, errorData.error)
      }
      if (typeof errorData.error === 'string') {
        throw toFailure(err.response.status || 500, errorData.error, null)
      }
      const msg =
        (typeof errorData.message === 'string' && errorData.message) ||
        (typeof errorData.msg === 'string' && errorData.msg) ||
        '请求失败'
      throw toFailure(err.response.status || 500, msg, null)
    }

    let errorMessage = '网络请求失败'
    if (isAxiosError(err)) {
      const code = err.code
      if (code === 'ERR_CONNECTION_REFUSED') {
        errorMessage = '无法连接到服务器，请检查后端服务是否已启动'
      } else if (code === 'ECONNABORTED') {
        errorMessage = '请求超时，请稍后重试'
      } else if (typeof err.message === 'string' && err.message) {
        errorMessage = err.message
      }
    } else if (err instanceof Error && err.message) {
      errorMessage = err.message
    }

    throw toFailure(-1, errorMessage, null)
  }
}

export const get = <T = unknown>(
  url: string,
  config?: Partial<InternalAxiosRequestConfig>,
): Promise<ApiResponse<T>> => {
  return request<T>(url, { ...config, method: 'GET' })
}

export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config?: Partial<InternalAxiosRequestConfig>,
): Promise<ApiResponse<T>> => {
  return request<T>(url, {
    ...config,
    method: 'POST',
    data,
  })
}

export const put = <T = unknown>(
  url: string,
  data?: unknown,
  config?: Partial<InternalAxiosRequestConfig>,
): Promise<ApiResponse<T>> => {
  return request<T>(url, {
    ...config,
    method: 'PUT',
    data,
  })
}

export const del = <T = unknown>(
  url: string,
  config?: Partial<InternalAxiosRequestConfig>,
): Promise<ApiResponse<T>> => {
  return request<T>(url, { ...config, method: 'DELETE' })
}

export const patch = <T = unknown>(
  url: string,
  data?: unknown,
  config?: Partial<InternalAxiosRequestConfig>,
): Promise<ApiResponse<T>> => {
  return request<T>(url, {
    ...config,
    method: 'PATCH',
    data,
  })
}

export { request }
export default request
