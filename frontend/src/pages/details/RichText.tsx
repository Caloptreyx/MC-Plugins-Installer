import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/providers/TranslationProvider.tsx';

/**
 * Renders Modrinth Markdown or CurseForge HTML through a sanitizing Markdown renderer.
 * Indentation is stripped from HTML so nested tags are not mistaken for Markdown code blocks.
 */
export default function RichText({ content, format }: { content: string; format: 'markdown' | 'html' }) {
  const source = format === 'html' ? content.replace(/^[ \t]+/gm, '') : content;

  return (
    <div className='mcpi-rich-text'>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {source}
      </Markdown>
    </div>
  );
}
