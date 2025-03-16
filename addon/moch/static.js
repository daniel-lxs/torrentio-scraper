const staticVideoUrls = {
  DOWNLOADING: '/static/videos/downloading_v2.mp4',
  FAILED_DOWNLOAD: '/static/videos/download_failed_v2.mp4',
  FAILED_ACCESS: '/static/videos/failed_access_v2.mp4',
  FAILED_RAR: '/static/videos/failed_rar_v2.mp4',
  FAILED_TOO_BIG: '/static/videos/failed_too_big_v1.mp4',
  FAILED_OPENING: '/static/videos/failed_opening_v2.mp4',
  FAILED_UNEXPECTED: '/static/videos/failed_unexpected_v2.mp4',
  FAILED_INFRINGEMENT: '/static/videos/failed_infringement_v2.mp4',
  LIMITS_EXCEEDED: '/static/videos/limits_exceeded_v1.mp4',
  BLOCKED_ACCESS: '/static/videos/blocked_access_v1.mp4',
};


export function isStaticUrl(url) {
  return Object.values(staticVideoUrls).some(videoUrl => url?.endsWith(videoUrl));
}

export default staticVideoUrls;
