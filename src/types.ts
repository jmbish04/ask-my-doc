export interface Env {
  R2: R2Bucket;
  ASSETS: { fetch: (request: Request) => Promise<Response> }; // Use ASSETS here
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}
