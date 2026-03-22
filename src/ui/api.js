import {
  clearSession,
  getTenant as readTenant,
  getToken as readToken,
} from "../lib/auth.js";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

function normalizePath(path = "") {
  return path.startsWith("/") ? path : `/${path}`;
}

export function joinApi(path = "") {
  const normalized = normalizePath(path);
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

export function headers({
  token,
  org,
  json = true,
  extra = {},
} = {}) {
  const hdrs = {
    ...extra,
  };

  if (json && !("Content-Type" in hdrs)) {
    hdrs["Content-Type"] = "application/json";
  }

  const authToken = token ?? readToken();
  const tenant = org ?? readTenant();

  if (authToken) hdrs["Authorization"] = `Bearer ${authToken}`;
  if (tenant) hdrs["X-Org-Slug"] = tenant;

  return hdrs;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function apiFetch(path, options = {}) {
  const url = joinApi(path);

  const {
    method = "GET",
    headers: extraHeaders = {},
    body,
    token,
    org,
    json = true,
    credentials = "include",
  } = options;

  const config = {
    method,
    headers: headers({ token, org, json, extra: extraHeaders }),
    credentials,
  };

  if (body !== undefined && body !== null) {
    if (json && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
      config.body = JSON.stringify(body);
    } else {
      config.body = body;
      if (body instanceof FormData && config.headers["Content-Type"]) {
        delete config.headers["Content-Type"];
      }
    }
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    const onAuthPage =
      typeof window !== "undefined" && window.location.pathname.startsWith("/auth");
    if (!onAuthPage) {
      clearSession();
      window.location.href = "/auth?session_expired=1";
    }
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await parseResponse(response);
  return { data };
}

async function apiData(path, options = {}) {
  const res = await apiFetch(path, options);
  return res?.data;
}

export const getMe = () => apiFetch("/api/me");

export const submitOnboarding = (payload) =>
  apiFetch("/api/user/onboarding", {
    method: "POST",
    body: payload,
  });

export const getAdminUsers = () => apiFetch("/api/admin/users");

export const approveUser = (userId) =>
  apiFetch(`/api/admin/users/${userId}/approve`, {
    method: "POST",
  });

export const rejectUser = (userId) =>
  apiFetch(`/api/admin/users/${userId}/reject`, {
    method: "POST",
  });

export const deleteUser = (userId) =>
  apiFetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });

export const uploadFile = (
  file,
  { token, org, agentId = null, threadId = null, intent = null, institutionalRequest = false } = {}
) => {
  const form = new FormData();
  form.append("file", file);
  if (agentId) form.append("agent_id", agentId);
  if (threadId) form.append("thread_id", threadId);
  if (intent) form.append("intent", intent);
  if (institutionalRequest) form.append("institutional_request", "true");
  return apiFetch("/api/files/upload", {
    method: "POST",
    body: form,
    token,
    org,
    json: false,
  });
};

export const chat = ({ token, org, ...payload } = {}) =>
  apiFetch("/api/chat", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const publicChat = async (payload = {}) => {
  const data = await apiData("/api/public/chat", {
    method: "POST",
    body: payload,
  });
  return data || {};
};

export async function chatStream({ token, org, onChunk, onDone, onStatus, ...payload } = {}) {
  const response = await fetch(joinApi("/api/chat/stream"), {
    method: "POST",
    headers: headers({ token, org, json: true }),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitEvent = (raw) => {
    const lines = raw.split("\n");
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    const rawData = dataLines.join("\n");
    let payloadData = rawData;
    try {
      payloadData = JSON.parse(rawData);
    } catch {}
    if (event === "chunk") onChunk?.(payloadData);
    else if (event === "status") onStatus?.(payloadData);
    else if (event === "done") onDone?.(payloadData);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (part.trim()) emitEvent(part);
    }
    if (done) break;
  }

  if (buffer.trim()) emitEvent(buffer);
  return true;
}

export const transcribeAudio = async (
  blob,
  { token, org, trace_id = null, language = null } = {}
) => {
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  if (trace_id) form.append("trace_id", trace_id);
  if (language) form.append("language", language);
  const data = await apiData("/api/audio/transcriptions", {
    method: "POST",
    body: form,
    token,
    org,
    json: false,
  });
  return data || {};
};

export const forgotPassword = ({ tenant, email, org } = {}) =>
  apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: { tenant, email },
    org,
  });

export const resetPassword = ({ token: reset_token, password, tenant, org } = {}) =>
  apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: { token: reset_token, password, tenant },
    org,
  });

export const validateInvestorAccessCode = ({ code, email, tenant, org } = {}) =>
  apiFetch(
    `/api/auth/validate-access-code?code=${encodeURIComponent(code || "")}&email=${encodeURIComponent(email || "")}&tenant=${encodeURIComponent(tenant || "")}`,
    {
      method: "GET",
      org,
    }
  );

export const requestFounderHandoff = ({ token, org, ...payload } = {}) =>
  apiFetch("/api/founder/handoff", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const getFounderEscalations = ({ token, org } = {}) =>
  apiFetch("/api/admin/founder-escalations", { token, org });

export const getFounderEscalation = ({ escalation_id, token, org } = {}) =>
  apiFetch(`/api/admin/founder-escalations/${encodeURIComponent(escalation_id)}`, {
    token,
    org,
  });

export const setFounderEscalationAction = ({ escalation_id, action_type, token, org } = {}) =>
  apiFetch(`/api/admin/founder-escalations/${encodeURIComponent(escalation_id)}/action`, {
    method: "POST",
    body: { action_type },
    token,
    org,
  });

export const getRealtimeClientSecret = ({ token, org, ...payload } = {}) =>
  apiFetch("/api/realtime/client-secret", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const startRealtimeSession = ({ token, org, ...payload } = {}) =>
  apiData("/api/realtime/start", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const startSummitSession = ({ token, org, ...payload } = {}) =>
  apiData("/api/summit/sessions/start", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const postRealtimeEventsBatch = ({ token, org, ...payload } = {}) =>
  apiData("/api/realtime/events:batch", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const endRealtimeSession = ({ token, org, session_id, ...payload } = {}) =>
  apiData(`/api/realtime/sessions/${encodeURIComponent(session_id)}/end`, {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const getRealtimeSession = ({ token, org, session_id, finals_only = false } = {}) =>
  apiData(
    `/api/realtime/sessions/${encodeURIComponent(session_id)}?finals_only=${
      finals_only ? "true" : "false"
    }`,
    {
      token,
      org,
    }
  );

export const getSummitSessionScore = ({ token, org, session_id } = {}) =>
  apiFetch(`/api/summit/sessions/${encodeURIComponent(session_id)}/score`, {
    token,
    org,
  });

export const submitSummitSessionReview = ({ token, org, session_id, ...payload } = {}) =>
  apiFetch(`/api/summit/sessions/${encodeURIComponent(session_id)}/review`, {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const downloadRealtimeAta = async ({ token, org, session_id } = {}) => {
  const response = await fetch(
    joinApi(`/api/realtime/sessions/${encodeURIComponent(session_id)}/ata.txt`),
    {
      method: "GET",
      headers: headers({ token, org, json: false }),
      credentials: "include",
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return await response.blob();
};

export const guardRealtimeTranscript = ({ token, org, ...payload } = {}) =>
  apiFetch("/api/realtime/guard", {
    method: "POST",
    body: payload,
    token,
    org,
  });

export const startRealtime = () =>
  apiFetch("/api/realtime/start", {
    method: "POST",
  });

export const sendRealtimeBatch = (payload) =>
  apiFetch("/api/realtime/events:batch", {
    method: "POST",
    body: payload,
  });

export const downloadRealtimeAtaFile = (sessionId) =>
  `${joinApi(`/api/realtime/sessions/${sessionId}/ata.txt`)}`;
