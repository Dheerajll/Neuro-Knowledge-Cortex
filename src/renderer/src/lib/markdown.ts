import MarkdownIt from 'markdown-it'
import katex from 'katex'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false })

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src') ?? ''
  if (!/^(https?:|data:|blob:|neuron:)/.test(src)) {
    token.attrSet('src', `neuron://attach/${src.replace(/^\.?\//, '')}`)
  }
  token.attrSet('loading', 'lazy')
  return self.renderToken(tokens, idx, options)
}

const cache = new Map<string, string>()

export function renderMarkdown(source: string): string {
  const hit = cache.get(source)
  if (hit) return hit

  const math: string[] = []
  const stash = (html: string): string => {
    math.push(html)
    return `xmath${math.length - 1}x`
  }

  let text = source
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false, output: 'html' }))
  )
  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex.trim(), { throwOnError: false, output: 'html' }))
  )

  let html = md.render(text)
  html = html.replace(/xmath(\d+)x/g, (_, i: string) => math[Number(i)] ?? '')

  if (cache.size > 400) cache.clear()
  cache.set(source, html)
  return html
}