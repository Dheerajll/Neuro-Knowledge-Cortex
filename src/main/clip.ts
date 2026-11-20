import { tokenize } from './embed'

function escape(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
}

function toMarkdown(html: string, base: string): string {
  const absolutise = (src: string): string => {
    try {
      return new URL(src, base).toString()
    } catch {
      return src
    }
  }

  let out = html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${t.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${t.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${t.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\`\`\`\n${t.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => `\n![image](${absolutise(src)})\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, '').trim()}`)
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const label = text.replace(/<[^>]+>/g, '').trim()
      return label ? `[${label}](${absolutise(href)})` : ''
    })
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/[a-z0-9]+>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')

  return escape(out)
}

export async function clipUrl(url: string): Promise<{ title: string; markdown: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      accept: 'text/html,application/xhtml+xml'
    }
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const html = await res.text()

  const titleMatch =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 160) : new URL(url).hostname

  const body = strip(html)
  const article = body.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? body
  const markdown = toMarkdown(article, url)

  const words = tokenize(markdown)
  if (words.length < 20) throw new Error('Could not extract readable content from that page')

  return { title, markdown: `${markdown}\n\n---\nSource: ${url}` }
}