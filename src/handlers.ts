import { Hono } from 'hono';
import { Env } from './types';
import { askFrontend, semanticFrontend, landingPage } from './html';

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
  }
};

const app = new Hono<{ Bindings: Env }>();

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

    // Extract text from the file
    const markdown = await c.env.AI.toMarkdown(await file.arrayBuffer(), {
        prompt: 'Please extract all text content from this document, preserving the original structure as much as possible. Include text from headers, footers, tables, and all body content. Do not summarize or analyze the content, only extract it.'
    });

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
    await c.env.VECTORIZE.insert([
      {
        id: fileId,
        values: embeddings,
        metadata: { fileId: fileId },
      },
    ]);

    return c.json({
      message: 'File uploaded and processed successfully.',
      url: `${c.req.url}${fileId}`,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return c.json({ error: 'Failed to upload and process file' }, 500);
  }
});

// GET /<fileId> - Return extracted text
app.get('/:fileId', async (c) => {
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

// GET /<fileId>/embeddings - Return embeddings
app.get('/:fileId/embeddings', async (c) => {
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

// GET /<fileId>/ask - Serve chat frontend
app.get('/:fileId/ask', (c) => {
  return c.html(askFrontend);
});

// POST /<fileId>/ask - Handle chat queries
app.post('/:fileId/ask', async (c) => {
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

// GET /<fileId>/semantic - Serve semantic search frontend
app.get('/:fileId/semantic', (c) => {
  return c.html(semanticFrontend);
});

// POST /<fileId>/semantic - Handle semantic search queries
app.post('/:fileId/semantic', async (c) => {
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

// Add a new route to serve the OpenAPI schema directly from the code
app.get('/openapi.json', (c) => {
  return c.json(openApiSchema);
});

export default app;
