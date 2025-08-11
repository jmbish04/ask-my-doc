// src/handlers.ts
import { Hono } from 'hono'
import { Env, Input, Process, Output } from './types'
import { askFrontend, semanticFrontend, landingPage } from './html'
import puppeteer from '@cloudflare/puppeteer'
import { Toucan } from 'toucan-js'
import { extractTextFromPDF } from './pdf'

// Inline OpenAPI (served at /openapi.json)
const openApiSchema = {
  openapi: '3.1.0',
  info: {
    title: 'Gemini CLI Document Worker API',
    description:
      'An API for uploading, storing, and interacting with documents via Cloudflare services. Optimized for use with a custom GPT action.',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'https://ask-my-doc.SUBDOMAIN.workers.dev',
      description: 'Cloudflare Worker deployment',
    },
  ],
  paths: {
    '/': {
      post: {
        operationId: 'uploadDocument',
        summary: 'Upload a new document',
        description:
          'Uploads a document for processing, storing it in R2, D1, and Vectorize. Returns a unique URL for the document.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'The document file to upload.',
                  },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Document uploaded successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          400: { description: 'File not provided' },
          500: { description: 'Failed to upload and process file' },
        },
      },
    },
    '/{fileId}/ask': {
      post: {
        operationId: 'askDocument',
        summary: 'Ask a question about a specific document',
        description:
          "Takes a natural language query and uses a generative AI model to answer it based on the document's content.",
        parameters: [
          {
            name: 'fileId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The unique ID of the document.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: "The question to ask about the document.",
                  },
                },
                required: ['query'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Successfully retrieved answer',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    response: {
                      type: 'string',
                      description: "The AI's answer based on the document.",
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Query not provided' },
          404: { description: 'Document not found' },
          500: { description: 'Failed to process query' },
        },
      },
    },
    '/{fileId}/semantic': {
      post: {
        operationId: 'semanticSearch',
        summary: 'Perform a semantic search on a specific document',
        description:
          'Finds document chunks most semantically similar to the provided query using a vector database.',
        parameters: [
          {
            name: 'fileId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The unique ID of the document.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The semantic search query.',
                  },
                },
                required: ['query'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Successfully retrieved search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    chunks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { text: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Query not provided' },
          500: { description: 'Failed to perform semantic search' },
        },
      },
    },
  },
}





const app = new Hono<{ Bindings: Env }>()

// ---- Optional Sentry (won’t crash if DSN missing) ----
app.use('*', async (c, next) => {
  try {
    if (c.env.SENTRY_DSN) {
      const sentry = new Toucan({ dsn: c.env.SENTRY_DSN, context: c, request: c.req.raw })
      c.set('sentry', sentry)
    }
  } catch {}
  await next()
})

// ---- Static & health first (avoid /:fileId shadowing) ----
app.get('/openapi.json', (c) => c.json(openApiSchema))
app.get('/health', (c) => c.json({ ok: true }))

// ---- Landing page ----
app.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name FROM documents ORDER BY created_at DESC'
    ).all()
    const documents = results as { id: string; name: string }[]
    return c.html(landingPage(documents))
  } catch (err) {
    console.error('Failed to fetch documents:', err)
    return c.html(landingPage([]))
  }
})

// ---- Upload & process ----
app.post('/', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'File not provided' }, 400)

    const fileId = crypto.randomUUID()
    const r2Key = `${fileId}-${file.name}`

    // Read once
    const ab = await file.arrayBuffer()
    const blob = new Blob([ab], { type: file.type || 'application/octet-stream' })

    // Save original file to R2
    await c.env.R2.put(r2Key, ab, { httpMetadata: { contentType: file.type } })

    // Extract text via Workers AI Document-to-Markdown (array in, array out)
    const mdRes = await c.env.AI.toMarkdown([{ name: file.name, blob }])
    const markdown = mdRes[0]?.data ?? ''

    // Embed document (BGE base = 768 dims; ensure your Vectorize index matches)
    const { data: emb } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [markdown] })
    const embedding = emb[0]

    // Persist to D1
    await c.env.DB.prepare(
      'INSERT INTO documents (id, name, r2_key, extracted_text, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    )
      .bind(fileId, file.name, r2Key, markdown)
      .run()

    // Persist to Vectorize (metadata filter requires indexed property `fileId`)
    await c.env.VECTORIZE.insert([{ id: fileId, values: embedding, metadata: { fileId } }])

    // Return canonical URL
    const origin = new URL(c.req.url).origin
    return c.json({ message: 'File uploaded and processed successfully.', url: `${origin}/${fileId}` })
  } catch (err) {
    console.error('Upload failed:', err)
    const s = c.get('sentry') as Toucan | undefined
    s?.captureException(err)
    return c.json({ error: 'Failed to upload and process file' }, 500)
  }
})

// ---- Process (R2 | local | url with optional Browser Rendering) ----
app.post('/process', async (c) => {
  const { input, process, output }: { input: Input; process?: Process; output?: Output } =
    await c.req.json()
  let text = ''

  try {
    if (input.type === 'r2') {
      const obj = await c.env.R2.get(input.key)
      if (!obj) return c.json({ error: 'Object not found' }, 404)
      const buf = await obj.arrayBuffer()
      const ct = obj.httpMetadata?.contentType || ''
      text = ct.includes('application/pdf') ? await extractTextFromPDF(buf) : new TextDecoder().decode(buf)
    } else if (input.type === 'local') {
      const bytes = Uint8Array.from(atob(input.content), (ch) => ch.charCodeAt(0))
      text = input.filename.toLowerCase().endsWith('.pdf')
        ? await extractTextFromPDF(bytes.buffer)
        : new TextDecoder().decode(bytes)
    } else if (input.type === 'url') {
      if (input.browser) {
        // Browser Rendering via Puppeteer
        const browser = await puppeteer.launch(c.env.MYBROWSER)
        const page = await browser.newPage()
        await page.goto(input.url, { waitUntil: 'networkidle0' })
        const html = await page.content()
        await browser.close()
        text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                   .replace(/<[^>]+>/g, ' ')
      } else {
        const resp = await fetch(input.url)
        const ct = resp.headers.get('content-type') || ''
        if (ct.includes('application/pdf')) {
          const buf = await resp.arrayBuffer()
          text = await extractTextFromPDF(buf)
        } else {
          const html = await resp.text()
          text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                     .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                     .replace(/<[^>]+>/g, ' ')
        }
      }
    } else {
      return c.json({ error: 'Invalid input.type' }, 400)
    }

    const result: any = { extracted_text: text }

    if (process?.embeddings) {
      const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] })
      result.embedding = data[0]
    }
    if (process?.rag_format) {
      result.rag =
        process.rag_format === 'json'
          ? JSON.stringify({ text })
          : process.rag_format === 'markdown'
          ? `# Extracted Text\n\n${text}`
          : undefined
    }
    if (process?.summary) {
      const { response: summary } = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'Summarize the following text concisely for a technical reader.' },
          { role: 'user', content: text.slice(0, 200_000) },
        ],
      })
      result.summary = summary
    }

    const prefix = output?.key || 'output'
    await c.env.R2.put(`${prefix}.txt`, text)
    if (result.rag) {
      const ext = process?.rag_format === 'json' ? 'json' : 'md'
      await c.env.R2.put(`${prefix}.rag.${ext}`, result.rag)
    }
    if (result.summary) await c.env.R2.put(`${prefix}.summary.txt`, result.summary)
    if (result.embedding) await c.env.R2.put(`${prefix}.embedding.json`, JSON.stringify(result.embedding))

    return c.json(result)
  } catch (err: any) {
    console.error('Process failed:', err)
    const s = c.get('sentry') as Toucan | undefined
    s?.captureException(err)
    return c.json({ error: err?.message || 'Failed to process document' }, 500)
  }
})

// ---- UUID-constrained routes (prevents /openapi.json shadowing) ----
const UUID = '{[0-9a-fA-F-]{36}}'

app.get(`/:fileId${UUID}`, async (c) => {
  const { fileId } = c.req.param()
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT extracted_text FROM documents WHERE id = ?'
    ).bind(fileId).all()
    if (!results.length) return c.text('Document not found', 404)
    return c.text(results[0].extracted_text as string)
  } catch (err) {
    console.error('Failed to fetch document:', err)
    return c.text('Failed to fetch document', 500)
  }
})

app.get(`/:fileId${UUID}/embeddings`, async (c) => {
  const { fileId } = c.req.param()
  try {
    const vectors = await c.env.VECTORIZE.getByIds([fileId])
    if (!vectors || vectors.length === 0) return c.json({ error: 'Embeddings not found' }, 404)
    return c.json(vectors[0])
  } catch (err) {
    console.error('Failed to fetch embeddings:', err)
    return c.json({ error: 'Failed to fetch embeddings' }, 500)
  }
})

app.get(`/:fileId${UUID}/ask`, (c) => c.html(askFrontend()))
app.post(`/:fileId${UUID}/ask`, async (c) => {
  const { fileId } = c.req.param()
  const body = await c.req.json().catch(() => ({} as any))
  const query = (body as any)?.query
  if (!query) return c.json({ error: 'Query not provided' }, 400)

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT extracted_text FROM documents WHERE id = ?'
    ).bind(fileId).all()
    if (!results.length) return c.json({ error: 'Document not found' }, 404)

    const context = results[0].extracted_text as string
    const { response } = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'Use the document context to answer accurately and concisely.' },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
      ],
    })
    return c.json({ response })
  } catch (err) {
    console.error('Failed to process query:', err)
    return c.json({ error: 'Failed to process query' }, 500)
  }
})

app.get(`/:fileId${UUID}/semantic`, (c) => c.html(semanticFrontend()))
app.post(`/:fileId${UUID}/semantic`, async (c) => {
  const { fileId } = c.req.param()
  const body = await c.req.json().catch(() => ({} as any))
  const query = (body as any)?.query
  if (!query) return c.json({ error: 'Query not provided' }, 400)

  try {
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] })
    const queryEmbedding = data[0]

    const similar = await c.env.VECTORIZE.query(queryEmbedding, { topK: 5, filter: { fileId } })
    const matches = similar?.matches ?? []
    const chunks = await Promise.all(
      matches.map(async (m) => {
        const { results } = await c.env.DB.prepare(
          'SELECT extracted_text FROM documents WHERE id = ?'
        ).bind(m.id).all()
        return { text: (results[0]?.extracted_text as string) ?? 'not found' }
      })
    )
    return c.json({ chunks })
  } catch (err) {
    console.error('Failed to perform semantic search:', err)
    return c.json({ error: 'Failed to perform semantic search' }, 500)
  }
})

export default app
