export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Accept JSON or x-www-form-urlencoded
  let body = req.body;
  if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    body = Object.fromEntries(new URLSearchParams(raw));
  }

  // Anti-spam honeypot
  if (body._gotcha) {
    return res.status(200).json({ success: true }); // silently drop bots
  }

  // Anti-human challenge
  if (body.securityCheck?.trim() !== '8') {
    return res.status(400).json({ error: 'Failed human verification.' });
  }

  const { name, email, censorship, address = '', phone = '' } = body;

  if (!name || !email || !censorship) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const line = `"${name}","${email}","${censorship.replace(/"/g, '""')}","${address}","${phone}","${new Date().toISOString()}"\n`;

  const repo = process.env.GH_REPO;
  const path = process.env.GH_FILE_PATH;
  const token = process.env.GH_TOKEN;

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'vercel-submission-handler',
    Accept: 'application/vnd.github.v3+json',
  };

  try {
    const response = await fetch(apiUrl, { headers });
    const data = await response.json();

    if (!response.ok || !data.sha || !data.content) {
      console.error('GitHub file read error:', data);
      return res.status(500).json({ error: 'Unable to read CSV file from GitHub.', details: data });
    }

    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    const updated = decoded + line;
    const base64 = Buffer.from(updated).toString('base64');

    const commit = {
      message: `New signup from ${email}`,
      content: base64,
      sha: data.sha,
    };

    const updateRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commit),
    });

    if (!updateRes.ok) {
      const errorDetails = await updateRes.text();
      console.error('GitHub write error:', errorDetails);
      return res.status(500).json({ error: 'Failed to update CSV on GitHub.', details: errorDetails });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected server error:', err);
    return res.status(500).json({ error: err.message || 'Unknown server error.' });
  }
}
