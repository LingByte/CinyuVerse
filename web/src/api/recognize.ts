import request from '@/utils/request'
import type { RecognizeResult } from '@/types/recognize'

/** POST /api/recognize — multipart 字段名 file */
export function postRecognizeDocument(file: File) {
  const body = new FormData()
  body.append('file', file)
  return request
    .post<RecognizeResult>('/recognize', body, {
      timeout: 180_000,
    })
    .then((res) => res.data)
}
