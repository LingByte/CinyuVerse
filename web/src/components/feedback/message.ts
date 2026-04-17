export const message = {
  info(text: string) {
    console.info(`[message] ${text}`)
  },
  success(text: string) {
    console.info(`[message:success] ${text}`)
  },
  warning(text: string) {
    console.warn(`[message:warning] ${text}`)
  },
  error(text: string) {
    console.error(`[message:error] ${text}`)
  },
}
