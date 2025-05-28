export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, email, censorship, address = '', phone = '' } = req.body;

  if (!name || !email || !censorship) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const line = `"${name}","${email}","${censorship.replace(/"/g, '""')}","${address}","${phone}","${new Date().toISOString()}"\n`;

  const repo = process.env.GH_REPO; // e.g., username/repo
  const path = process.env.GH_FILE_PATH; // e.g., submissions.csv
  const token = process.env.GH_TOKEN;

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'vercel-submission-handler',
    Accept: 'application/vnd.github.v3+json',
  };

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) throw new Error('Failed to fetch existing file');

    const { content, sha } = await response.json();
    const decoded = Buffer.from(content, 'base64').toString('utf-8');
    const updated = decoded + line;
    const base64 = Buffer.from(updated).toString('base64');

    const body = {
      message: `Add submission from ${email}`,
      content: base64,
      sha: sha,
    };

    const updateRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!updateRes.ok) {
      const error = await updateRes.text();
      return res.status(500).json({ error: 'GitHub update failed', details: error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}