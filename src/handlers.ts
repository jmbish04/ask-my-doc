import { Hono } from 'hono';
import { Env, Input, Process, Output } from './types';
import { askFrontend, semanticFrontend, landingPage } from './html';
import puppeteer from '@cloudflare/puppeteer';
import { Ai } from '@cloudflare/ai';
import { Toucan } from 'toucan-js';
import { extractTextFromPDF } from './pdf';

// The OpenAPI schema is defined here as a constant.
const openApiSchema = {
  "openapi": "3.1.0",
  "info": {
    "title": "Gemini CLI Document Worker API",
    "description": "An API for uploading, storing, and interacting with documents via Cloudflare services. Optimized for use with a custom GPT action.",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://ask-my-doc.SUBDOMAIN.workers.dev",
      "description": "Cloudflare Worker deployment"
    }
  ],
  "paths": {
    "/": {
      "post": {
        "operationId": "uploadDocument",
        "summary": "Upload a new document",
        "description": "Uploads a document for processing, storing it in R2, D1, and Vectorize. Returns a unique URL for the document.",
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "file": {
                    "type": "string",
                    "format": "binary",
                    "description": "The document file to upload."
                  }
                },
                "required": [
                  "file"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Document uploaded successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "url": {
                      "type": "string",
                      "format": "uri"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "File not provided"
          },
          "500": {
            "description": "Failed to upload and process file"
          }
        }
      }
    },
    "/process": {
      "post": {
        "operationId": "processDocument",
        "summary": "Process a document from various sources",
        "description": "Processes a document from R2, a local file, or a URL, and returns extracted text, embeddings, RAG format, and a summary.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ProcessRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Document processed successfully",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ProcessResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "500": {
            "description": "Failed to process document"
          }
        }
      }
    },
    "/{fileId}/ask": {
      "post": {
        "operationId": "askDocument",
        "summary": "Ask a question about a specific document",
        "description": "Takes a natural language query and uses a generative AI model to answer it based on the document's content.",
        "parameters": [
          {
            "name": "fileId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "The unique ID of the document."
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "query": {
                    "type": "string",
                    "description": "The question to ask about the document."
                  }
                },
                "required": [
                  "query"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successfully retrieved answer",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "response": {
                      "type": "string",
                      "description": "The AI's answer based on the document."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Query not provided"
          },
          "404": {
            "description": "Document not found"
          },
          "500": {
            "description": "Failed to process query"
          }
        }
      }
    },
    "/{fileId}/semantic": {
      "post": {
        "operationId": "semanticSearch",
        "summary": "Perform a semantic search on a specific document",
        "description": "Finds document chunks most semantically similar to the provided query using a vector database.",
        "parameters": [
          {
            "name": "fileId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "The unique ID of the document."
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "query": {
                    "type": "string",
                    "description": "The semantic search query."
                  }
                },
                "required": [
                  "query"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successfully retrieved search results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "chunks": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "text": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Query not provided"
          },
          "500": {
            "description": "Failed to perform semantic search"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "ProcessRequest": {
        "type": "object",
        "properties": {
          "input": {
            "$ref": "#/components/schemas/Input"
          },
          "process": {
            "$ref": "#/components/schemas/Process"
          },
          "output": {
            "$ref": "#/components/schemas/Output"
          }
        }
      },
      "Input": {
        "oneOf": [
          {
            "$ref": "#/components/schemas/InputR2"
          },
          {
            "$ref": "#/components/schemas/InputLocal"
          },
          {
            "$ref": "#/components/schemas/InputURL"
          }
        ]
      },
      "InputR2": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["r2"]
          },
          "bucket": {
            "type": "string"
          },
          "key": {
            "type": "string"
          }
        },
        "required": ["type", "bucket", "key"]
      },
      "InputLocal": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["local"]
          },
          "filename": {
            "type": "string"
          },
          "content": {
            "type": "string",
            "format": "byte"
          }
        },
        "required": ["type", "filename", "content"]
      },
      "InputURL": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["url"]
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "browser": {
            "type": "boolean"
          }
        },
        "required": ["type", "url"]
      },
      "Process": {
        "type": "object",
        "properties": {
          "embeddings": {
            "type": "boolean"
          },
          "rag_format": {
            "type": "string",
            "enum": ["none", "json", "markdown"]
          },
          "summary": {
            "type": "boolean"
          }
        }
      },
      "Output": {
        "type": "object",
        "properties": {
          "bucket": {
            "type": "string"
          },
          "key": {
            "type": "string"
          },
          "local": {
            "type": "boolean"
          }
        }
      },
      "ProcessResponse": {
        "type": "object",
        "properties": {
          "extracted_text": {
            "type": "string"
          },
          "embedding": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "rag": {
            "type": "string"
          },
          "summary": {
            "type": "string"
          }
        }
      }
    }
  }
};

const app = new Hono<{ Bindings: Env }>();

// Fix 1: Place static routes before dynamic routes to prevent masking.
// This route now serves the inlined OpenAPI schema directly.
app.get('/openapi.json', (c) => {
  return c.json(openApiSchema);
});

// GET / - Landing page with document list and upload form
app.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name FROM documents ORDER BY created_at DESC'
    ).all();
    const documents = results as { id: string; name: string }[];
    return c.html(landingPage(documents));
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return c.html(landingPage([]));
  }
});

// POST / - Handle file uploads
app.post('/', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return c.json({ error: 'File not provided' }, 400);
    }

    const fileId = crypto.randomUUID();
    const r2Key = `${fileId}-${file.name}`;

    // Store the raw file in R2
    await c.env.R2.put(r2Key, await file.arrayBuffer());

    // Fix 2: Correct the toMarkdown API call to match the documented shape.
    const mdResponse = await c.env.AI.toMarkdown([
      {
        name: file.name,
        blob: new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' }),
      },
    ]);
    const markdown = mdResponse[0]?.data ?? '';
    
    // Generate embeddings
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [markdown],
    });
    const embeddings = data[0];

    // Store metadata in D1
    await c.env.DB.prepare(
      'INSERT INTO documents (id, name, r2_key, extracted_text, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    )
      .bind(fileId, file.name, r2Key, markdown)
      .run();

    // Store embeddings in Vectorize
    // Note: Vectorize filtering requires a metadata index.
    // To enable this, run `npx wrangler vectorize create-metadata-index <your-index-name> --property-name=fileId --type=string`
    await c.env.VECTORIZE.insert([
      {
        id: fileId,
        values: embeddings,
        metadata: { fileId: fileId },
      },
    ]);

    // Fix 5: Return a proper origin in the URL
    const url = new URL(c.req.url);
    url.pathname = `/${fileId}`;

    return c.json({
      message: 'File uploaded and processed successfully.',
      url: url.toString(),
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return c.json({ error: 'Failed to upload and process file' }, 500);
  }
});

app.post('/process', async (c) => {
  const { input, process, output }: { input: Input; process: Process; output: Output } = await c.req.json();
	let text = '';

	try {
		if (input.type === 'r2') {
			const obj = await c.env.R2.get(input.key);
			if (!obj) return new Response('Object not found', { status: 404 });
			const arrayBuffer = await obj.arrayBuffer();
			if (obj.httpMetadata?.contentType === 'application/pdf') {
				text = await extractTextFromPDF(arrayBuffer);
			} else {
				text = new TextDecoder().decode(arrayBuffer);
			}
		} else if (input.type === 'local') {
			const bytes = Uint8Array.from(atob(input.content), (c) => c.charCodeAt(0));
			if (input.filename.endsWith('.pdf')) {
				text = await extractTextFromPDF(bytes.buffer);
			} else {
				text = new TextDecoder().decode(bytes);
			}
		} else if (input.type === 'url') {
			if (input.browser) {
				const browser = await puppeteer.launch(c.env.MYBROWSER);
				const page = await browser.newPage();
				await page.goto(input.url);
				text = await page.evaluate(() => document.body.innerText);
				await browser.close();
			} else {
				const resp = await fetch(input.url);
				const contentType = resp.headers.get('content-type') || '';
				if (contentType.includes('application/pdf')) {
					const arrayBuffer = await resp.arrayBuffer();
					text = await extractTextFromPDF(arrayBuffer);
				} else {
					const html = await resp.text();
					text = html.replace(/<[^>]+>/g, ' ');
				}
			}
		}

		const result: any = { extracted_text: text };
		const ai = new Ai(c.env.AI);

		if (process?.embeddings) {
			const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
			result.embedding = data[0];
		}
		if (process?.rag_format) {
			if (process.rag_format === 'json') {
				result.rag = JSON.stringify({ text });
			} else if (process.rag_format === 'markdown') {
				result.rag = `# Extracted Text\n\n${text}`;
			}
		}
		if (process?.summary) {
			const response = await ai.run('@cf/facebook/bart-large-cnn', {
				input_text: text,
				max_length: 1024,
			});
			result.summary = response.summary;
		}

		const prefix = output.key || 'output';
		await c.env.R2.put(`${prefix}.txt`, text);
		if (result.rag) {
			const ext = process.rag_format === 'json' ? 'json' : 'md';
			await c.env.R2.put(`${prefix}.rag.${ext}`, result.rag);
		}
		if (result.summary) {
			await c.env.R2.put(`${prefix}.summary.txt`, result.summary);
		}
		if (result.embedding) {
			await c.env.R2.put(`${prefix}.embedding.json`, JSON.stringify(result.embedding));
		}

		return c.json(result);
	} catch (e: any) {
		const sentry = c.get('sentry');
		sentry.captureException(e);
		return c.json({ error: e.message }, 500);
	}
});

// Fix 1: Constrain the fileId parameter with a UUID regex to prevent masking
// other routes like /openapi.json.
app.get('/:fileId{[0-9a-fA-F-]{36}}', async (c) => {
  const { fileId } = c.req.param();
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT extracted_text FROM documents WHERE id = ?'
    )
      .bind(fileId)
      .all();

    if (results.length === 0) {
      return c.text('Document not found', 404);
    }

    return c.text(results[0].extracted_text as string);
  } catch (error) {
    console.error('Failed to fetch document:', error);
    return c.text('Failed to fetch document', 500);
  }
});

app.get('/:fileId{[0-9a-fA-F-]{36}}/embeddings', async (c) => {
    const { fileId } = c.req.param();
    try {
        const vectors = await c.env.VECTORIZE.getByIds([fileId]);
        if (!vectors || vectors.length === 0) {
            return c.json({ error: 'Embeddings not found' }, 404);
        }
        return c.json(vectors[0]);
    } catch (error) {
        console.error('Failed to fetch embeddings:', error);
        return c.json({ error: 'Failed to fetch embeddings' }, 500);
    }
});

// Fix 5: Call the askFrontend function.
app.get('/:fileId{[0-9a-fA-F-]{36}}/ask', (c) => {
  return c.html(askFrontend());
});

app.post('/:fileId{[0-9a-fA-F-]{36}}/ask', async (c) => {
  const { fileId } = c.req.param();
  const { query } = await c.req.json();

  if (!query) {
    return c.json({ error: 'Query not provided' }, 400);
  }

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT extracted_text FROM documents WHERE id = ?'
    )
      .bind(fileId)
      .all();

    if (results.length === 0) {
      return c.json({ error: 'Document not found' }, 404);
    }

    const context = results[0].extracted_text as string;

    const { response } = await c.env.AI.run(
      '@cf/meta/llama-3.1-8b-instruct',
      {
        messages: [
          { role: 'system', content: `You are a helpful assistant. Use the following document context to answer the user's question. Context: ${context}` },
          { role: 'user', content: query },
        ],
      }
    );

    return c.json({ response });
  } catch (error) {
    console.error('Failed to process query:', error);
    return c.json({ error: 'Failed to process query' }, 500);
  }
});

// Fix 5: Call the semanticFrontend function.
app.get('/:fileId{[0-9a-fA-F-]{36}}/semantic', (c) => {
  return c.html(semanticFrontend());
});

app.post('/:fileId{[0-9a-fA-F-]{36}}/semantic', async (c) => {
  const { fileId } = c.req.param();
  const { query } = await c.req.json();

  if (!query) {
    return c.json({ error: 'Query not provided' }, 400);
  }

  try {
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    });
    const queryEmbedding = data[0];

    const similarVectors = await c.env.VECTORIZE.query(queryEmbedding, {
      topK: 5,
      filter: { fileId: fileId },
    });

    // This part is simplified. In a real-world scenario, you'd chunk the document
    // and store embeddings for each chunk. Here, we're just returning the whole document
    // if it's a match.
    const chunks = await Promise.all(similarVectors.matches.map(async (match) => {
        const { results } = await c.env.DB.prepare(
            'SELECT extracted_text FROM documents WHERE id = ?'
        ).bind(match.id).all();
        return { text: results[0]?.extracted_text || "not found" };
    }));


    return c.json({ chunks });
  } catch (error) {
    console.error('Failed to perform semantic search:', error);
    return c.json({ error: 'Failed to perform semantic search' }, 500);
  }
});

export default app;
