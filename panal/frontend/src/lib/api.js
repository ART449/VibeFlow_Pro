const defaultHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

async function requestJson(path, options = {}, token) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? defaultHeaders(token) : {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchDevToken() {
  const response = await fetch('/api/v1/dev-token');
  const data = await response.json();
  return data.token;
}

export function fetchHosts(token) {
  return requestJson('/api/v1/hosts', {}, token);
}

export function resolveIntent(token, payload) {
  return requestJson(
    '/api/v1/intents/resolve',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export function approvePlaybook(token, playbookId, payload) {
  return requestJson(
    `/api/v1/playbooks/${playbookId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export function executeEnvelope(token, payload) {
  return requestJson(
    '/api/v1/executions',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export function fetchExecution(token, executionId) {
  return requestJson(`/api/v1/executions/${executionId}`, {}, token);
}

export function fetchIncident(token, incidentId) {
  return requestJson(`/api/v1/incidents/${incidentId}`, {}, token);
}

export function openEventSocket(token, onEvent) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
  socket.addEventListener('message', (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch (error) {
      console.error('Failed to parse Panal event', error);
    }
  });
  return socket;
}

