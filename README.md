# Neuron

A private knowledge graph for notes on your own disk.

Notes are **neurons**. Notes that share vocabulary wire together into **clusters**, and clusters group into **domains** — a two-tier map of what you actually know. Ask a question and it walks the graph to find the note you wrote, instead of guessing at one.

Everything is local. No account, no sync, no telemetry. Notes are plain JSON files you can read, grep, and back up with `cp`.

<!-- Drop screenshots in docs/ and reference them here, e.g.
![Graph view](docs/graph.png)
-->

---

## What it does

**Writes notes in Markdown.** Live rendered preview with KaTeX for equations, GFM tables, and images via drag, paste, or file picker. Split view, or preview-only for reading.

**Builds the graph for you.** Every save re-embeds the note and recomputes the graph. Notes above a similarity threshold link; label propagation turns links into clusters; each cluster is named from the terms that dominate its members, weighted so titles count most. Clusters that score against a domain lexicon join that domain — AI, Backend, Data, Foundations. Anything that doesn't clear the threshold lands in **Uncharted** rather than being force-fitted into a category it doesn't belong to.

**Answers from your own notes.** Hybrid BM25 + cosine retrieval with a graph-neighbour bonus, so a strong hit pulls its cluster-mates up with it. By default it returns the matching notes with their most on-topic sentence. Point it at an OpenAI-compatible endpoint and it synthesises an answer with `[n]` citations, refusing to answer past what the notes contain.

**Stays out of the way.** Keyboard-first, ⌘K for recall, no sidebar you can't collapse, no onboarding wizard.

## Screens

| | |
|---|---|
| **Graph** | Force-directed canvas. Clusters sit together, domains read as colour families, labels appear on dense clusters. Drag to arrange, click to open. |
| **Editor** | Markdown source and rendered preview. Toolbar inserts bold, headings, lists, tables, equations, links. Images drop in and are copied to the attachments folder. |
| **Recall (⌘K)** | Search and ask. Results are ranked and cited; ask returns either the notes themselves or a synthesised answer depending on your settings. |
| **Settings** | Link threshold, embedding source, optional model endpoint, reveal-data-folder. |

## How it works

```
note saved
   │
   ├─ tokenise → canonicalise (plurals, synonyms, phrase mapping)
   ├─ embed      → 384-dim signed hash, offline and deterministic
   ├─ BM25 index → inverted term frequencies
   └─ graph      → cosine edges → label propagation → clusters → domain scoring
                     │
                     └─ cached in main process, invalidated on write
```

**Embeddings** default to local signed hashing over canonicalised terms — no model download, no network, no API key, and identical output for identical input. It keys on vocabulary rather than meaning, which is the trade for being fully offline. Setting an embeddings endpoint replaces it with real vectors; existing notes re-embed on their next save.

**Clustering** is label propagation over a cosine-thresholded graph, capped at five edges per node so a hub can't swallow everything. Cluster names come from aggregated weighted terms: titles ×3, tags ×2, body ×1, with the runner-up term appended when it reaches 42% of the top term's weight. Names therefore describe the cluster's subject, not an incidental word.

**Retrieval** fuses lexical and vector scores, then boosts graph neighbours of the top three hits. Ask without a model is extractive — real sentences from real notes, never invented prose.

**Storage** is one JSON file per note under the app's data directory, written atomically (temp file, then rename). Embeddings live in a separate `vectors.json` so note files stay human-readable.

## Install

Requires macOS on Apple Silicon, Node 20+ (22 LTS recommended).

```bash
git clone <your-repo-url> neuron
cd neuron
npm install
npm run dev
```

### Build a real app

```bash
npm run dist
cp -R "dist/mac-arm64/Neuron.app" /Applications/
xattr -dr com.apple.quarantine /Applications/Neuron.app
```

The build is ad-hoc signed, not notarised. First launch after installing needs **System Settings → Privacy & Security → Open Anyway**. You only do it once per build.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Compile only |
| `npm run dist` | Compile and package to `dist/mac-arm64/Neuron.app` |
| `npm run dmg` | Compile and package a `.dmg` |

## Data

| Path | Contents |
|---|---|
| `~/Library/Application Support/Neuron/neuron/notes/` | One JSON file per note |
| `~/Library/Application Support/Neuron/neuron/attachments/` | Image files |
| `~/Library/Application Support/Neuron/neuron/vectors.json` | Embedding cache, rebuildable |
| `~/Library/Application Support/Neuron/settings.json` | Preferences |

Back up the whole `Neuron` folder. Delete `vectors.json` any time to force a re-embed. **Settings → Reveal data folder** opens it in Finder.

Nothing leaves the machine unless you enable a model or embeddings endpoint, in which case note text is sent to whichever endpoint you configured.

## Keyboard

| Key | Action |
|---|---|
| `⌘K` | Recall — search or ask |
| `⌘N` | New note |
| `⌘↵` | Save |
| `⌘S` | Save |
| `Esc` | Close panel, clear search, back to graph |
| `Tab` | Indent in editor |

## Configuration

Settings are stored locally and editable in-app.

- **Link threshold** — lower links more notes together, higher keeps clusters tight. Default `0.34`.
- **Embeddings** — `local` (default) or an OpenAI-compatible `/embeddings` endpoint.
- **Answers** — off by default. When on, requires a base URL, model, and key for any `/chat/completions` provider.

## Project layout

```
src/
  main/         Electron main — storage, indexing, clustering, retrieval, IPC
    store.ts      atomic note I/O, attachment writes
    embed.ts      tokenising, canonicalisation, local + remote embedding
    lexicon.ts    domain lexicons, phrase map, synonym map
    cluster.ts    edge building, label propagation, naming, domain scoring
    search.ts     BM25, cosine fusion, neighbour expansion
    ipc.ts        validated IPC surface
  preload/      contextBridge API, context isolation on
  renderer/     React UI — graph canvas, editor, recall, settings
```

Renderer runs with `nodeIntegration: false` and `contextIsolation: true`. Attachments are served over a custom `neuron://` protocol with a path-traversal check.

## Known limitations

- **Local embeddings are lexical, not neural.** "Optimiser" and "training loop" may not link. Use an embeddings endpoint if that matters.
- **Ask sends whole notes as context.** Fine into the low thousands; paragraph-level chunking is the next step for larger libraries.
- **No sync.** Single machine by design. Move the data folder to move the library.
- **No encryption at rest.** Notes sit in plain JSON under your user directory.
- **Graph caps rendering at 600 nodes.** Beyond that the canvas thins out rather than slowing to a crawl.
- **Unsigned build.** Not notarised, so Gatekeeper needs the one-time override.

## Roadmap

- Paragraph-level chunking for retrieval
- Wikilinks and manual edges that override similarity
- Local ONNX embeddings as an alternative to the hashing default
- Tag-based saved views
- Signed and notarised release builds

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. Run `npm run dev` before opening a PR and keep the diff scoped; the main process is the interesting part and small changes there have wide effects.