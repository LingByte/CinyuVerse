/** 与 `web/.env` 中 VITE_API_BASE 一致，供 axios / fetch 共用 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return String(raw).replace(/\/+$/, '')
  }
  return '/api'
}
