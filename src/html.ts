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
