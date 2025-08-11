export interface Env {
  R2: R2Bucket;
  STATIC_ASSETS: R2Bucket; // Add this line
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}
