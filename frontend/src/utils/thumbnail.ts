// Only transform unsigned Cloudinary image uploads. Preserve signed URLs and other hosts.
export function thumbnail(value?: string, width = 384): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.search ||
      !/^\/[^/]+\/image\/upload\/(v\d+\/)?[^/]+/.test(url.pathname) || /\/s--/.test(url.pathname)) return value;
    const suffix = url.pathname.split('/image/upload/')[1];
    // Existing transformations may be signed or explicitly cropped: do not rewrite them.
    if (/^[^/]*[,]/.test(suffix) || /^(?:w_|h_|c_|f_|q_)/.test(suffix)) return value;
    url.pathname = url.pathname.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`);
    return url.toString();
  } catch { return value; }
}
