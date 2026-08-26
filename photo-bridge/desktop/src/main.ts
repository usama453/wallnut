export {};

declare global {
  interface Window {
    __TAURI__: {
      core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any> };
      event: { listen: (evt: string, cb: (e: any) => void) => Promise<() => void> };
      dialog: { open: (opts?: Record<string, unknown>) => Promise<string | string[] | null> };
    };
  }
}

const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;
const dialog = window.__TAURI__.dialog;

type UiFileRow = {
  file_id: string;
  filename: string;
  kind: string;
  size: number;
  progress: number;
  status: string;
  sha256: string | null;
  attempts: number;
  last_error: string | null;
  verified_at: number | null;
  dedup_of: string | null;
};

type UiSessionRow = {
  session_id: string;
  device_id: string;
  status: string;
  files_total: number;
  bytes_total: number;
  files_done: number;
  bytes_done: number;
  started_at: number;
  finished_at: number | null;
};

type LogEntry = { ts: number; level: string; module: string; message: string; file_id?: string };

type StatusPayload = {
  receiver_name: string;
  storage_dir: string;
  storage_set: boolean;
  sessions: UiSessionRow[];
};

let sessions: UiSessionRow[] = [];
let selectedSession: string | null = null;
let currentFiles: UiFileRow[] = [];

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function fmtSpeed(bps: number): string {
  if (!bps) return "";
  return `${fmtBytes(bps)}/s`;
}

function fmtTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

async function refresh() {
  const status: StatusPayload = await invoke("get_status");
  $("receiver-name").textContent = status.receiver_name || "PhotoBridge Receiver";
  $("storage-dir").textContent = status.storage_set ? status.storage_dir : "Not set — choose a folder";
  sessions = status.sessions;
  renderSessionList();
  if (!selectedSession && sessions.length > 0) selectSession(sessions[0].session_id);
  else if (selectedSession) renderSessionList();
}

function renderSessionList() {
  const ul = $("session-list");
  ul.innerHTML = "";
  if (sessions.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No sessions yet";
    ul.appendChild(li);
    return;
  }
  for (const s of sessions) {
    const li = document.createElement("li");
    li.className = s.session_id === selectedSession ? "active" : "";
    li.innerHTML = `
      <strong>${s.device_id || "device"}</strong>
      <span class="muted small"> · ${s.status}</span><br/>
      <span class="muted small">${s.files_done}/${s.files_total} files · ${fmtBytes(s.bytes_done)} / ${fmtBytes(s.bytes_total)} · ${fmtTime(s.started_at)}</span>`;
    li.onclick = () => selectSession(s.session_id);
    ul.appendChild(li);
  }
}

async function selectSession(sessionId: string) {
  selectedSession = sessionId;
  renderSessionList();
  const files: UiFileRow[] = await invoke("get_files", { sessionId });
  currentFiles = files;
  renderFiles();
  const s = sessions.find((x) => x.session_id === sessionId);
  $("session-title").textContent = s ? `Session ${sessionId.slice(0, 8)}… · ${s.device_id || "device"}` : "Session";
  const badge = $("session-status");
  badge.textContent = s ? s.status : "—";
  badge.className = "badge " + (s?.status ?? "");
  const done = s?.bytes_done ?? 0;
  const total = s?.bytes_total ?? 0;
  $("progress-fill").style.width = total > 0 ? `${Math.min(100, (done / total) * 100)}%` : "0%";
  $("progress-text").textContent = `${s?.files_done ?? 0}/${s?.files_total ?? 0} files · ${fmtBytes(done)} / ${fmtBytes(total)}`;
  const remaining = (s?.files_total ?? 0) - (s?.files_done ?? 0);
  $("files-remaining").textContent = `${remaining} files remaining`;
}

function renderFiles() {
  const tb = $("file-body");
  tb.innerHTML = "";
  if (currentFiles.length === 0) {
    tb.innerHTML = `<tr><td colspan="7" class="muted">No files yet — connect your iPhone.</td></tr>`;
    return;
  }
  for (const f of currentFiles) {
    const pct = f.size > 0 ? Math.min(100, (f.progress / f.size) * 100) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td title="${f.file_id}">${f.filename}</td>
      <td class="muted">${f.kind}</td>
      <td>${fmtBytes(f.size)}</td>
      <td><div class="mini-track"><div class="mini-fill" style="width:${pct}%"></div></div>
          <span class="muted small">${fmtBytes(f.progress)} / ${fmtBytes(f.size)}</span></td>
      <td class="st-${f.status}">${f.status}${f.status === "dedup" && f.dedup_of ? " → " + f.dedup_of.slice(0, 10) : ""}</td>
      <td class="hash">${f.sha256 ? f.sha256.slice(0, 16) + "…" : "—"}</td>
      <td class="muted small">${f.last_error ?? (f.attempts > 0 ? `${f.attempts} retries` : "")}</td>`;
    tb.appendChild(tr);
  }
}

function appendLog(entry: LogEntry) {
  const view = $("log-view");
  const line = document.createElement("div");
  line.className = "lv-" + entry.level;
  const ts = new Date(entry.ts).toLocaleTimeString();
  line.textContent = `${ts} [${entry.level}] ${entry.module}: ${entry.message}`;
  view.appendChild(line);
  view.scrollTop = view.scrollHeight;
  if (view.childNodes.length > 500) view.removeChild(view.firstChild!);
}

async function loadRecentLogs() {
  const logs: LogEntry[] = await invoke("get_logs", { n: 200 });
  for (const l of logs) appendLog(l);
}

async function pickDir() {
  const dir = await dialog.open({ directory: true });
  if (typeof dir === "string") {
    await invoke("set_storage_dir", { dir });
    $("storage-dir").textContent = dir;
  }
}

function applySessionEvent(ev: { session_id: string; status: string; files_total: number; bytes_total: number; files_done: number; bytes_done: number; speed_bps: number }) {
  $("session-title").textContent = `Active session ${ev.session_id.slice(0, 8)}…`;
  const badge = $("session-status");
  badge.textContent = ev.status;
  badge.className = "badge " + (ev.status === "active" ? "active" : ev.status);
  const pct = ev.bytes_total > 0 ? Math.min(100, (ev.bytes_done / ev.bytes_total) * 100) : 0;
  $("progress-fill").style.width = `${pct}%`;
  const remaining = ev.files_total - ev.files_done;
  $("progress-text").textContent = `${ev.files_done}/${ev.files_total} files · ${fmtBytes(ev.bytes_done)} / ${fmtBytes(ev.bytes_total)}`;
  $("speed-text").textContent = fmtSpeed(ev.speed_bps);
  $("files-remaining").textContent = `${remaining} files remaining`;
}

function applyFileEvent(ev: { file_id: string; status: string; progress: number; size: number; filename: string }) {
  const f = currentFiles.find((x) => x.file_id === ev.file_id);
  if (f) {
    f.progress = ev.progress;
    f.status = ev.status;
  } else {
    currentFiles.push({ file_id: ev.file_id, filename: ev.filename, kind: "", size: ev.size, progress: ev.progress, status: ev.status, sha256: null, attempts: 0, last_error: null, verified_at: null, dedup_of: null });
  }
  renderFiles();
}

function init() {
  $("refresh-btn").onclick = refresh;
  $("pick-dir-btn").onclick = pickDir;
  $("copy-log-btn").onclick = async () => {
    const text = Array.from($("log-view").childNodes).map((n) => n.textContent).join("\n");
    await window.__TAURI__.core.invoke("plugin:clipboard|write_text", { data: text }).catch(() => {});
  };

  listen("pb://session", (e: any) => applySessionEvent(e.payload));
  listen("pb://file", (e: any) => applyFileEvent(e.payload));
  listen("pb://log", (e: any) => appendLog(e.payload));
  listen("pb://pin", (e: any) => {
    $("pin-code").textContent = e.payload.pin;
    $("pin-card").hidden = false;
    setTimeout(() => { $("pin-card").hidden = true; }, 10 * 60 * 1000);
  });

  refresh().then(loadRecentLogs);
}

init();