import {
  createElement,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

export default function Link({
  children,
  href,
  ...properties
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: ReactNode;
  href: string;
}) {
  return createElement('a', { ...properties, href }, children);
}
