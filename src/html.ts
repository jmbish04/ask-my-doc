const flowbiteHeader = `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" rel="stylesheet" />
`;

const flowbiteBodyScript = `<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>`;

const navBar = `
  <nav class="bg-white border-gray-200 dark:bg-gray-900 shadow-md">
    <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
      <a href="/" class="flex items-center space-x-3 rtl:space-x-reverse">
        <span class="self-center text-2xl font-semibold whitespace-nowrap dark:text-white">Ask My Doc</span>
      </a>
    </div>
  </nav>
`;

export const landingPage = (documents: { id: string; name: string }[]) => `
<!DOCTYPE html>
<html>
<head>
  ${flowbiteHeader}
  <title>Ask My Doc</title>
</head>
<body class="bg-gray-100 dark:bg-gray-900">
  ${navBar}

  <div class="container mx-auto p-4">
    <div class="max-w-2xl mx-auto mb-8">
      <div class="p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
        <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Upload a new document</h2>
        <form action="/" method="post" enctype="multipart/form-data">
          <div class="mb-4">
            <label for="file-upload" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Choose file</label>
            <input type="file" name="file" id="file-upload" class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400" required>
          </div>
          <button type="submit" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">Upload</button>
        </form>
      </div>
    </div>

    <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
      <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" class="px-6 py-3">Document Name</th>
            <th scope="col" class="px-6 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${documents
            .map(
              (doc) => `
            <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
              <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">${doc.name}</th>
              <td class="px-6 py-4">
                <a href="/${doc.id}/ask" target="_blank" class="font-medium text-blue-600 dark:text-blue-500 hover:underline">Ask</a> |
                <a href="/${doc.id}/semantic" target="_blank" class="font-medium text-blue-600 dark:text-blue-500 hover:underline">Semantic Search</a> |
                <a href="/${doc.id}" target="_blank" class="font-medium text-blue-600 dark:text-blue-500 hover:underline">View Text</a> |
                <a href="/${doc.id}/embeddings" target="_blank" class="font-medium text-blue-600 dark:text-blue-500 hover:underline">View Embeddings</a>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>
  ${flowbiteBodyScript}
</body>
</html>
`;

export const askFrontend = `
<!DOCTYPE html>
<html>
<head>
  ${flowbiteHeader}
  <title>Ask My Doc</title>
</head>
<body class="bg-gray-100 dark:bg-gray-900">
  ${navBar}
  <div class="container mx-auto p-4">
    <h1 class="text-4xl font-bold text-center text-gray-900 dark:text-white mb-8">Ask a question</h1>
    <div class="max-w-2xl mx-auto">
      <form id="ask-form">
        <div class="mb-4">
          <label for="query" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your question</label>
          <input type="text" id="query" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" required>
        </div>
        <button type="submit" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">Ask</button>
      </form>
      <div id="response" class="mt-8 p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white"></div>
    </div>
  </div>
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
  ${flowbiteBodyScript}
</body>
</html>
`;

export const semanticFrontend = `
<!DOCTYPE html>
<html>
<head>
  ${flowbiteHeader}
  <title>Semantic Search</title>
</head>
<body class="bg-gray-100 dark:bg-gray-900">
  ${navBar}
  <div class="container mx-auto p-4">
    <h1 class="text-4xl font-bold text-center text-gray-900 dark:text-white mb-8">Semantic Search</h1>
    <div class="max-w-2xl mx-auto">
      <form id="semantic-form">
        <div class="mb-4">
          <label for="query" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Search query</label>
          <input type="text" id="query" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" required>
        </div>
        <button type="submit" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">Search</button>
      </form>
      <div id="response" class="mt-8"></div>
    </div>
  </div>
  <script>
    document.getElementById('semantic-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('query').value;
      const responseDiv = document.getElementById('response');
      responseDiv.innerHTML = '<div class="text-center text-gray-900 dark:text-white">Searching...</div>';
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      let html = '';
      for (const chunk of json.chunks) {
        html += '<div class="p-6 mb-4 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white">' + chunk.text + '</div>';
      }
      responseDiv.innerHTML = html;
    });
  </script>
  ${flowbiteBodyScript}
</body>
</html>
`;
