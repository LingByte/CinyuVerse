/** POST /api/recognize 解包后的 data，与 internal/handlers/recognize.go 对齐 */
export interface RecognizeResult {
  text: string
  fileType: string
  fileName: string
  parsedAt: string
}
