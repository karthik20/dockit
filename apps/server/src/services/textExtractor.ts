export function extractTextFromHtml(html: string, maxLength: number = 50000): string {
  const withoutStyles = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '');

  const withoutTags = withoutStyles
    .replace(/<h1[^>]*>/gi, '\n\n## ')
    .replace(/<\/h1>/gi, '\n')
    .replace(/<h2[^>]*>/gi, '\n\n### ')
    .replace(/<\/h2>/gi, '\n')
    .replace(/<h3[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h3>/gi, '\n')
    .replace(/<h4[^>]*>/gi, '\n\n**')
    .replace(/<\/h4>/gi, '**\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/?p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<\/?pre[^>]*>/gi, '\n```\n')
    .replace(/<\/?code[^>]*>/gi, '`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, ' [$1] ')
    .replace(/<\/a>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

  const cleaned = withoutTags
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;

  const truncated = cleaned.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxLength * 0.8 ? lastNewline : truncated.lastIndexOf(' ');
  const final = cutPoint > maxLength * 0.8 ? truncated.slice(0, cutPoint) : truncated;

  return final + '\n\n[... content truncated ...]';
}
