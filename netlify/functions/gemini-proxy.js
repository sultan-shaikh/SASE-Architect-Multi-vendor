// netlify/functions/gemini-proxy.js
//
// Server-side proxy for all Gemini API calls made by the SASE Architect tool.
// The API key lives ONLY in Netlify's environment variables (GEMINI_API_KEY)
// and is never sent to, or stored in, the browser.
//
// The frontend calls this function instead of generativelanguage.googleapis.com
// directly. It forwards the request to Gemini, appends the key server-side,
// and returns Gemini's response unchanged so existing frontend response-
// handling code (extractJSON, candidate parsing, etc.) doesn't need to change.

exports.handler = async function (event) {
  // CORS / method guard
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: { message: 'Method not allowed. Use POST.' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(500, { error: { message: 'Server is missing GEMINI_API_KEY. Set it in Netlify Site settings > Environment variables.' } });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { error: { message: 'Invalid JSON body sent to proxy.' } });
  }

  // payload.endpoint: 'models'          -> GET  .../v1beta/models
  //                   'generateContent' -> POST .../v1beta/models/{model}:generateContent
  const { endpoint, model, body } = payload;

  let url;
  let fetchOptions;

  if (endpoint === 'models') {
    url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    fetchOptions = { method: 'GET' };
  } else if (endpoint === 'generateContent') {
    if (!model) return respond(400, { error: { message: 'Missing "model" for generateContent.' } });
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    };
  } else {
    return respond(400, { error: { message: 'Unknown endpoint. Expected "models" or "generateContent".' } });
  }

  try {
    const upstream = await fetch(url, fetchOptions);
    const text = await upstream.text(); // pass through raw so we don't lose Gemini's exact error shape
    return {
      statusCode: upstream.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: text
    };
  } catch (err) {
    return respond(502, { error: { message: 'Upstream request to Gemini failed: ' + err.message } });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function respond(statusCode, obj) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
