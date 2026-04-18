/** 与后端 lingoroutine response 约定对齐 */
export interface ApiEnvelope<T = unknown> {
  code: number
  data: T
  msg: string
}

export class ApiBizError extends Error {
  readonly code: number
  /** 业务错误时后端 envelope 的 data（如 AI 校验失败返回 raw、validationErrors） */
  readonly data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiBizError'
    this.code = code
    this.data = data
  }
}
