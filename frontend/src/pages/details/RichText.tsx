import type { ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/providers/TranslationProvider.tsx';
import { safeHref } from '../../lib/fileRules.ts';

// Descriptions are written by plugin authors: images don't send the panel as referrer, and only http(s) links stay links.
const components: Components = {
  ...markdownComponents,
  img: ({ node: _node, ...props }: ComponentProps<'img'> & { node?: unknown }) => (
    <img {...props} referrerPolicy='no-referrer' loading='lazy' />
  ),
  a: ({ node: _node, href, children, ...props }: ComponentProps<'a'> & { node?: unknown }) => {
    const safe = safeHref(href);
    return safe ? (
      <a {...props} href={safe} target='_blank' rel='noopener noreferrer'>
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
};

/**
 * Renders Modrinth/Hangar Markdown or CurseForge HTML through a sanitizing Markdown renderer.
 * Indentation is stripped from HTML so nested tags are not mistaken for Markdown code blocks.
 */
export default function RichText({ content, format }: { content: string; format: 'markdown' | 'html' }) {
  const source = format === 'html' ? content.replace(/^[ \t]+/gm, '') : content;

  return (
    <div className='mcpi-rich-text'>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {source}
      </Markdown>
    </div>
  );
}
