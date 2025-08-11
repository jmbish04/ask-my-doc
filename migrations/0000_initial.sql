-- Migration number: 0000 	 2025-08-10T17:56:01.223Z
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  extracted_text TEXT NOT NULL
);
