function ext(path: string) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

export function isImagePath(path: string) {
  const e = ext(path);
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico', 'heic', 'heif'].includes(e);
}

export function isVideoPath(path: string) {
  const e = ext(path);
  return ['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(e);
}

export function isAudioPath(path: string) {
  const e = ext(path);
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(e);
}

export function isMarkdownPath(path: string) {
  return ext(path) === 'md' || ext(path) === 'markdown';
}

export function isPdfPath(path: string) {
  return ext(path) === 'pdf';
}

export function imageMime(path: string) {
  const e = ext(path);
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'bmp') return 'image/bmp';
  if (e === 'svg') return 'image/svg+xml';
  if (e === 'ico') return 'image/x-icon';
  return 'application/octet-stream';
}

export function pdfMime(_path: string) {
  return 'application/pdf';
}

export function videoMime(path: string) {
  const e = ext(path);
  if (e === 'mp4') return 'video/mp4';
  if (e === 'webm') return 'video/webm';
  if (e === 'ogg') return 'video/ogg';
  if (e === 'mov') return 'video/quicktime';
  if (e === 'avi') return 'video/x-msvideo';
  return 'application/octet-stream';
}

export function audioMime(path: string) {
  const e = ext(path);
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg') return 'audio/ogg';
  if (e === 'flac') return 'audio/flac';
  if (e === 'aac') return 'audio/aac';
  if (e === 'm4a') return 'audio/mp4';
  return 'application/octet-stream';
}
