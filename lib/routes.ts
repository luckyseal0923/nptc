const base = import.meta.env.BASE_URL || '/';

export function appPath(path = '/') {
  if (!path.startsWith('/')) return path;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return path === '/' ? prefix : `${prefix}${path.slice(1)}`;
}

export function appUrl(path: string) {
  return new URL(appPath(path), location.origin).toString();
}
