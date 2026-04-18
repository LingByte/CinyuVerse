import axios, { AxiosHeaders, type AxiosInstance, type AxiosResponse } from 'axios'
import type { ApiEnvelope } from '@/types/api'
import { ApiBizError } from '@/types/api'
import { getApiBase } from '@/utils/apiBase'

const baseURL = getApiBase()

function isApiEnvelope(v: unknown): v is ApiEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    typeof (v as ApiEnvelope).code === 'number' &&
    'msg' in v &&
    typeof (v as ApiEnvelope).msg === 'string'
  )
}

/**
 * 将后端统一封装的 JSON 解包为 data；非 envelope 时原样返回。
 */
export function unwrapData<T>(payload: unknown): T {
  if (isApiEnvelope(payload)) {
    if (payload.code !== 200) {
      throw new ApiBizError(payload.code, payload.msg || '请求失败', payload.data)
    }
    return payload.data as T
  }
  return payload as T
}

const request: AxiosInstance = axios.create({
  baseURL,
  timeout: 120_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    if (config.headers instanceof AxiosHeaders) {
      config.headers.delete('Content-Type')
    } else {
      delete (config.headers as Record<string, unknown>)['Content-Type']
      delete (config.headers as Record<string, unknown>)['content-type']
    }
  }
  return config
})

request.interceptors.response.use(
  (response: AxiosResponse) => {
    const raw = response.data
    if (isApiEnvelope(raw)) {
      if (raw.code !== 200) {
        return Promise.reject(new ApiBizError(raw.code, raw.msg || '请求失败', raw.data))
      }
      response.data = raw.data
    }
    return response
  },
  (error) => {
    const msg =
      error?.response?.data?.msg ||
      error?.message ||
      '网络错误'
    if (error?.response?.data?.code) {
      const d = error.response.data
      return Promise.reject(new ApiBizError(d.code, msg, d.data))
    }
    return Promise.reject(error)
  },
)

export default request
