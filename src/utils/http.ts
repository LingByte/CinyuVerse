import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}

export interface HttpError extends Error {
  status?: number
  data?: unknown
}

const DEFAULT_TIMEOUT = 30_000

function createHttpClient(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL ?? import.meta.env.VITE_API_BASE_URL ?? '',
    timeout: DEFAULT_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => config,
    (error) => Promise.reject(error),
  )

  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error) => {
      const httpError: HttpError = new Error(
        error.response?.data?.message ?? error.message ?? '请求失败',
      )
      httpError.status = error.response?.status
      httpError.data = error.response?.data
      return Promise.reject(httpError)
    },
  )

  return instance
}

export const http = createHttpClient()

export function createApiClient(baseURL: string) {
  return createHttpClient(baseURL)
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<T>(url, config)
  return res.data
}

export async function post<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<T>(url, data, config)
  return res.data
}

export async function put<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.put<T>(url, data, config)
  return res.data
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.delete<T>(url, config)
  return res.data
}

export function setAuthToken(token: string | null) {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete http.defaults.headers.common.Authorization
  }
}

export default http
