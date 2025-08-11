export const askFrontend = `
<!DOCTYPE html>
<html>
<head>
  <title>Ask My Doc</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; margin: 2em; }
    #response { border: 1px solid #ccc; padding: 1em; margin-top: 1em; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Ask a question about the document</h1>
  <form id="ask-form">
    <input type="text" id="query" style="width: 80%;" required>
    <button type="submit">Ask</button>
  </form>
  <div id="response"></div>
  <script>
    document.getElementById('ask-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('query').value;
      const responseDiv = document.getElementById('response');
      responseDiv.textContent = 'Thinking...';
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      responseDiv.textContent = json.response;
    });
  </script>
</body>
</html>
`;

export const semanticFrontend = `
<!DOCTYPE html>
<html>
<head>
  <title>Semantic Search</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; margin: 2em; }
    #response { border: 1px solid #ccc; padding: 1em; margin-top: 1em; }
    .chunk { border-bottom: 1px solid #eee; padding-bottom: 1em; margin-bottom: 1em; }
  </style>
</head>
<body>
  <h1>Semantic Search</h1>
  <form id="semantic-form">
    <input type="text" id="query" style="width: 80%;" required>
    <button type="submit">Search</button>
  </form>
  <div id="response"></div>
  <script>
    document.getElementById('semantic-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('query').value;
      const responseDiv = document.getElementById('response');
      responseDiv.innerHTML = 'Searching...';
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      let html = '';
      for (const chunk of json.chunks) {
        html += '<div class="chunk">' + chunk.text + '</div>';
      }
      responseDiv.innerHTML = html;
    });
  </script>
</body>
</html>
`;

export const landingPage = (documents: { id: string; name: string }[]) => `
<!DOCTYPE html>
<html>
<head>
  <title>Ask My Doc</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; margin: 2em; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 0.5em; text-align: left; }
    .upload-form { margin-bottom: 2em; }
  </style>
</head>
<body>
  <h1>Ask My Doc</h1>
  <div class="upload-form">
    <h2>Upload a new document</h2>
    <form action="/" method="post" enctype="multipart/form-data">
      <input type="file" name="file" required>
      <button type="submit">Upload</button>
    </form>
  </div>
  <h2>Uploaded Documents</h2>
  <table>
    <thead>
      <tr>
        <th>Document Name</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${documents
        .map(
          (doc) => `
        <tr>
          <td>${doc.name}</td>
          <td>
            <a href="/${doc.id}/ask" target="_blank">Ask</a> |
            <a href="/${doc.id}/semantic" target="_blank">Semantic Search</a> |
            <a href="/${doc.id}" target="_blank">View Text</a> |
            <a href="/${doc.id}/embeddings" target="_blank">View Embeddings</a>
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>
`;