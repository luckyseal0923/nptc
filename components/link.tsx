import type { ComponentProps } from 'react';
import { appPath } from '@/lib/routes';
export default function Link({ href, ...props }: ComponentProps<'a'>) {
  return (
    <a href={typeof href === 'string' ? appPath(href) : href} {...props} />
  );
}
