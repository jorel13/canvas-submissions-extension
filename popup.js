// Popup for "Canvas Submitted Work".
// All Canvas requests run inside the open Canvas tab (MAIN world), so they use
// the browser's existing login session. No cookies or tokens are stored here.

const $ = (id) => document.getElementById(id);
const DAY = 864e5;
// How far back to look for submissions. The submitted-work table filters by due
// date in the popup; the deadline check needs every recent submission.
const LOOKBACK_DAYS = 365;

let tabId = null;
let me = null;
let rows = [];
let courses = [];
let sort = { key: "submittedAt", dir: -1 };

// ---------- Saved settings (per browser, best effort) ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { /* ignore */ }
  },
};
let settings = store.get("deadlineSettings", { limit: 10, warn: 3, schoolDays: false });
let hidden = new Set(store.get("hiddenCourses", []));
let showHidden = false;

// ---------- Functions injected into the Canvas page ----------
// These must be self-contained: they are serialized and run in the page.

async function pageInit() {
  const getJson = async (url) => {
    const r = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
  };
  const self = await getJson("/api/v1/users/self");
  let observees = [];
  try {
    observees = await getJson("/api/v1/users/self/observees?per_page=100");
  } catch (_) { /* not an observer */ }

  // Canvas remembers the selected observed student in this cookie.
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)k5_observed_user_for_${self.id}=([^;]+)`));
  return {
    userId: String(self.id),
    userName: self.name,
    observees: observees.map((o) => ({ id: String(o.id), name: o.name })),
    observedId: m ? decodeURIComponent(m[1]) : null,
  };
}

async function pageFetchCourses(studentId) {
  const all = [];
  let url = "/api/v1/courses?enrollment_state=active&include[]=observed_users&include[]=term&per_page=100";
  for (let i = 0; url && i < 10; i++) {
    const r = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`Courses HTTP ${r.status}`);
    all.push(...(await r.json()));
    const next = (r.headers.get("link") || "").split(",").find((p) => /rel="next"/.test(p));
    url = next ? next.match(/<([^>]+)>/)[1] : null;
  }
  // Keep courses the chosen student is enrolled in (directly, or via an observer enrollment).
  return all
    .filter((c) => !c.access_restricted_by_date)
    .filter((c) =>
      (c.enrollments || []).some(
        (e) =>
          (e.type === "student" && String(e.user_id) === studentId) ||
          (e.type === "observer" && String(e.associated_user_id) === studentId)
      )
    )
    .map((c) => ({ id: String(c.id), name: c.name, startAt: c.start_at || c.term?.start_at || null }));
}

async function pageFetchSubmissions(vars) {
  const QUERY = `query GetUserCourseWork($userId: ID!, $first: Int, $after: String, $startDate: ISO8601DateTime, $endDate: ISO8601DateTime, $includeOverdue: Boolean, $includeNoDueDate: Boolean, $onlySubmitted: Boolean, $observedUserId: ID) {
  legacyNode(_id: $userId, type: User) {
    ... on User {
      _id
      courseWorkSubmissionsConnection(
        first: $first
        after: $after
        startDate: $startDate
        endDate: $endDate
        includeOverdue: $includeOverdue
        includeNoDueDate: $includeNoDueDate
        onlySubmitted: $onlySubmitted
        observedUserId: $observedUserId
      ) {
        nodes {
          _id
          cachedDueDate
          submittedAt
          late
          missing
          excused
          state
          score
          grade
          assignment {
            _id
            name
            dueAt
            pointsPossible
            htmlUrl
            submissionTypes
            course { _id name }
          }
        }
        pageInfo { hasNextPage endCursor totalCount }
      }
    }
  }
}`;
  const m = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
  const csrf = m ? decodeURIComponent(m[1]) : "";
  const all = [];
  let after = null;

  for (let page = 0; page < 50; page++) {
    const r = await fetch("/api/graphql", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/graphql-response+json, application/json",
        "x-csrf-token": csrf,
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify({
        operationName: "GetUserCourseWork",
        query: QUERY,
        variables: { ...vars, first: 60, after },
      }),
    });
    if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}`);
    const json = await r.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    const conn = json.data?.legacyNode?.courseWorkSubmissionsConnection;
    if (!conn) break;
    all.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return all;
}

// ---------- Update check ----------

const REPO = "jorel13/canvas-submissions-extension";

function isNewer(latest, current) {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Checks GitHub for a newer release at most once a day and shows a notice.
async function checkForUpdate() {
  let latest = store.get("latestRelease", null);
  if (!latest || Date.now() - latest.checkedAt > DAY) {
    latest = { tag: null, url: null, checkedAt: Date.now() };
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { accept: "application/vnd.github+json" },
      });
      if (r.ok) {
        const j = await r.json();
        latest = { tag: j.tag_name, url: j.html_url, checkedAt: Date.now() };
      }
    } catch (_) { /* offline or rate-limited; try again tomorrow */ }
    store.set("latestRelease", latest);
  }
  const current = chrome.runtime.getManifest().version;
  if (!latest.tag || !isNewer(latest.tag.replace(/^v/, ""), current)) return;

  const banner = $("update");
  const link = document.createElement("a");
  link.href = `https://github.com/${REPO}/blob/main/INSTALL.md#updating`;
  link.target = "_blank";
  link.textContent = "How to update";
  banner.replaceChildren(`Version ${latest.tag.replace(/^v/, "")} is available (you have ${current}). `, link);
  banner.hidden = false;
}

// ---------- Popup helpers ----------

async function runInPage(func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  if (res?.error) throw new Error(res.error.message || String(res.error));
  return res?.result;
}

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").className = isError ? "error" : "muted";
}

const fmtDate = (s) =>
  s ? new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "—");

function statusOf(n) {
  if (n.excused) return { label: "Excused", cls: "other" };
  if (n.missing) return { label: "Missing", cls: "missing" };
  if (n.late) return { label: "Late", cls: "late" };
  if (n.state === "graded") return { label: "Graded", cls: "ok" };
  if (n.submittedAt) return { label: "Submitted", cls: "ok" };
  return { label: n.state || "—", cls: "other" };
}

function toRow(n) {
  const a = n.assignment || {};
  const st = statusOf(n);
  return {
    course: a.course?.name || "",
    courseId: a.course?._id || "",
    name: a.name || "(untitled)",
    url: a.htmlUrl || "",
    dueAt: a.dueAt || n.cachedDueDate || null,
    submittedAt: n.submittedAt || null,
    score: n.score,
    points: a.pointsPossible,
    grade: n.grade,
    status: st.label,
    statusCls: st.cls,
  };
}

function tag(text, cls) {
  const s = document.createElement("span");
  s.className = `tag ${cls}`;
  s.textContent = text;
  return s;
}

function addCell(tr, content, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  if (content instanceof Node) td.appendChild(content);
  else td.textContent = content;
  tr.appendChild(td);
  return td;
}

// ---------- Deadline watch ----------

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const isWeekday = (d) => d.getDay() !== 0 && d.getDay() !== 6;

// Days that have passed since `from`, counting only weekdays when schoolDays is on.
function daysSince(from, schoolDays) {
  const a = startOfDay(from);
  const b = startOfDay(new Date());
  if (b <= a) return 0;
  if (!schoolDays) return Math.round((b - a) / DAY);
  let n = 0;
  for (const d = new Date(a); d < b; ) {
    d.setDate(d.getDate() + 1);
    if (isWeekday(d)) n++;
  }
  return n;
}

function addDays(from, n, schoolDays) {
  const d = startOfDay(from);
  if (!schoolDays) {
    d.setDate(d.getDate() + n);
    return d;
  }
  for (let k = 0; k < n; ) {
    d.setDate(d.getDate() + 1);
    if (isWeekday(d)) k++;
  }
  return d;
}

function deadlineRows() {
  const { limit, warn, schoolDays } = settings;
  const last = new Map();
  for (const r of rows) {
    if (r.submittedAt && (!last.has(r.courseId) || r.submittedAt > last.get(r.courseId))) {
      last.set(r.courseId, r.submittedAt);
    }
  }
  return courses
    .map((c) => {
      const lastAt = last.get(c.id) || null;
      // With no submission yet, count from the course (or term) start date.
      const base = lastAt || c.startAt;
      const left = base ? limit - daysSince(base, schoolDays) : null;
      let level, label;
      if (left == null) [level, label] = ["late", "No submissions"];
      else if (left <= 0) [level, label] = ["missing", left === 0 ? "Deadline today" : `${-left} day${left === -1 ? "" : "s"} past`];
      else if (left <= warn) [level, label] = ["late", `${left} day${left === 1 ? "" : "s"} left`];
      else [level, label] = ["ok", `${left} days left`];
      return { ...c, lastAt, left, deadline: base ? addDays(base, limit, schoolDays) : null, level, label };
    })
    .sort((a, b) => (a.left ?? -Infinity) - (b.left ?? -Infinity) || a.name.localeCompare(b.name));
}

function renderDeadlines() {
  const all = deadlineRows();
  const list = all.filter((c) => showHidden || !hidden.has(c.id));
  const tbody = document.querySelector("#deadlines tbody");
  tbody.replaceChildren();

  for (const c of list) {
    const tr = document.createElement("tr");
    if (hidden.has(c.id)) tr.className = "dim";
    addCell(tr, c.name);
    addCell(tr, c.lastAt ? fmtDate(c.lastAt) : "None yet", "nowrap");
    addCell(tr, fmtDay(c.deadline), "nowrap");
    addCell(tr, tag(c.label, c.level), "nowrap");
    const btn = document.createElement("button");
    btn.className = "link";
    btn.textContent = hidden.has(c.id) ? "Show" : "Hide";
    btn.title = "Hide courses with no assignments (homeroom, clubs, etc.)";
    btn.addEventListener("click", () => {
      hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id);
      store.set("hiddenCourses", [...hidden]);
      renderDeadlines();
    });
    addCell(tr, btn);
    tbody.appendChild(tr);
  }

  const visible = all.filter((c) => !hidden.has(c.id));
  const due = visible.filter((c) => c.level !== "ok").length;
  const hiddenCount = all.length - visible.length;
  $("deadlineSummary").textContent = !all.length
    ? "No active courses found."
    : due
      ? `${due} course${due === 1 ? "" : "s"} at or near the ${settings.limit}-day limit`
      : `No courses near the ${settings.limit}-day limit`;
  $("deadlineSummary").className = due ? "warn" : "muted";
  $("toggleHidden").hidden = hiddenCount === 0;
  $("toggleHidden").textContent = showHidden ? "Hide hidden courses" : `Show ${hiddenCount} hidden`;
  $("deadlines").hidden = list.length === 0;
}

// ---------- Submitted work table ----------

function visibleRows() {
  const course = $("course").value;
  const q = $("search").value.trim().toLowerCase();
  const start = $("start").value ? new Date($("start").value + "T00:00:00") : null;
  const end = $("end").value ? new Date($("end").value + "T23:59:59") : null;
  return rows
    .filter((r) => (!course || r.courseId === course) && (!q || r.name.toLowerCase().includes(q)))
    .filter((r) => {
      if (!r.dueAt) return true; // keep items with no due date, like Canvas does
      const due = new Date(r.dueAt);
      return (!start || due >= start) && (!end || due <= end);
    })
    .sort((a, b) => {
      const x = a[sort.key] ?? "";
      const y = b[sort.key] ?? "";
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
}

function render() {
  const tbody = document.querySelector("#results tbody");
  tbody.replaceChildren();
  const list = visibleRows();
  for (const r of list) {
    const tr = document.createElement("tr");
    addCell(tr, r.course);
    if (r.url) {
      const link = document.createElement("a");
      link.href = r.url;
      link.target = "_blank";
      link.textContent = r.name;
      addCell(tr, link);
    } else addCell(tr, r.name);
    addCell(tr, fmtDate(r.dueAt), "nowrap");
    addCell(tr, fmtDate(r.submittedAt), "nowrap");
    addCell(tr, r.score != null ? `${r.score}${r.points != null ? " / " + r.points : ""}` : r.points != null ? `– / ${r.points}` : "—", "nowrap");
    addCell(tr, tag(r.status, r.statusCls));
    tbody.appendChild(tr);
  }
  document.querySelectorAll("#results th[data-sort]").forEach((th) => {
    th.classList.toggle("asc", th.dataset.sort === sort.key && sort.dir === 1);
    th.classList.toggle("desc", th.dataset.sort === sort.key && sort.dir === -1);
  });
  $("results").hidden = list.length === 0;
  $("csv").disabled = list.length === 0;
  setStatus(rows.length ? `${list.length} of ${rows.length} submissions shown` : "No submitted assignments found.");
}

function fillCourses() {
  const sel = $("course");
  const seen = new Map(rows.map((r) => [r.courseId, r.course]));
  sel.replaceChildren(new Option("All courses", ""));
  [...seen].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => sel.add(new Option(name, id)));
}

function exportCsv() {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Course", "Assignment", "Due", "Submitted", "Score", "Points", "Status", "URL"].map(esc).join(",")];
  for (const r of visibleRows()) {
    lines.push([r.course, r.name, r.dueAt, r.submittedAt, r.score, r.points, r.status, r.url].map(esc).join(","));
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `canvas-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function load() {
  $("load").disabled = true;
  setStatus("Loading…");
  try {
    const studentId = $("student").value;
    const vars = {
      userId: me.userId,
      startDate: new Date(Date.now() - LOOKBACK_DAYS * DAY).toISOString(),
      includeOverdue: true,
      includeNoDueDate: true,
      onlySubmitted: true,
    };
    if (studentId !== me.userId) vars.observedUserId = studentId;

    const [nodes, courseList] = await Promise.all([
      runInPage(pageFetchSubmissions, [vars]),
      runInPage(pageFetchCourses, [studentId]),
    ]);
    rows = nodes.map(toRow);
    courses = courseList;
    fillCourses();
    renderDeadlines();
    render();
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $("load").disabled = false;
  }
}

function readSettings() {
  settings = {
    limit: Math.max(1, parseInt($("limit").value, 10) || 10),
    warn: Math.max(0, parseInt($("warn").value, 10) || 0),
    schoolDays: $("schoolDays").checked,
  };
  store.set("deadlineSettings", settings);
  renderDeadlines();
}

async function init() {
  $("limit").value = settings.limit;
  $("warn").value = settings.warn;
  $("schoolDays").checked = settings.schoolDays;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/[^/]+\.instructure\.com\//.test(tab.url)) {
    setStatus("Open a Canvas (*.instructure.com) tab while logged in, then click this icon again.", true);
    $("load").disabled = true;
    return;
  }
  tabId = tab.id;

  const d = new Date();
  d.setDate(d.getDate() - 30);
  $("start").value = d.toISOString().slice(0, 10);

  try {
    me = await runInPage(pageInit);
  } catch (e) {
    setStatus(`Could not read Canvas session: ${e.message}`, true);
    $("load").disabled = true;
    return;
  }
  $("who").textContent = `Signed in as ${me.userName}`;

  const sel = $("student");
  if (me.observees.length) {
    me.observees.forEach((o) => sel.add(new Option(o.name, o.id)));
    sel.add(new Option(`${me.userName} (me)`, me.userId));
    sel.value = me.observedId && me.observees.some((o) => o.id === me.observedId) ? me.observedId : me.observees[0].id;
  } else {
    sel.add(new Option(me.userName, me.userId));
  }

  load();
}

$("load").addEventListener("click", load);
$("student").addEventListener("change", load);
["course", "start", "end"].forEach((id) => $(id).addEventListener("change", render));
$("search").addEventListener("input", render);
$("csv").addEventListener("click", exportCsv);
["limit", "warn", "schoolDays"].forEach((id) => $(id).addEventListener("change", readSettings));
$("toggleHidden").addEventListener("click", () => {
  showHidden = !showHidden;
  renderDeadlines();
});
document.querySelectorAll("#results th[data-sort]").forEach((th) =>
  th.addEventListener("click", () => {
    sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort ? -sort.dir : 1 };
    render();
  })
);

checkForUpdate();
init();
