// Helpers for API routes that set `bodyParser: false` (because they use
// formidable for multipart uploads) but also need to accept a small JSON body.
//
// When the body parser is disabled, Next.js does not populate `req.body`, so we
// read the raw request stream ourselves and parse it as JSON.

export function isJsonRequest(req) {
  const contentType = req.headers['content-type'] || '';
  return contentType.includes('application/json');
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}
