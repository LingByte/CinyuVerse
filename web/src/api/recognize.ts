import { post } from '@/utils/request'

export interface RecognizeResponse {
  text: string
  fileType: string
  fileName: string
  parsedAt: string
}

export const recognizeApi = {
  recognize(file: File, params?: { fileType?: string; includeTables?: boolean }) {
    const form = new FormData()
    form.append('file', file)

    const query: Record<string, unknown> = {}
    if (params?.fileType) query.fileType = params.fileType
    if (typeof params?.includeTables === 'boolean') query.includeTables = params.includeTables ? 'true' : 'false'

    return post<RecognizeResponse>('/recognize', form, {
      params: query,
    })
  },
}

export default recognizeApi
