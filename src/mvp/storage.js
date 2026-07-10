import { DEMO_USERS, SAMPLE_NOTIFICATIONS, SAMPLE_PROJECTS } from "./data";

const KEY = "asbuiltflow-mvp-v2";

function makeChecklist() {
  return [
    { id: `ck-${Math.random().toString(36).slice(2,8)}`, label: "As-built PDF uploaded", done: false },
    { id: `ck-${Math.random().toString(36).slice(2,8)}`, label: "Required field photos uploaded", done: false },
    { id: `ck-${Math.random().toString(36).slice(2,8)}`, label: "Fiber counts and stationing verified", done: false },
    { id: `ck-${Math.random().toString(36).slice(2,8)}`, label: "All open issues resolved", done: false },
    { id: `ck-${Math.random().toString(36).slice(2,8)}`, label: "Final package approved", done: false },
  ];
}

function normalizeProjects(projects) {
  return projects.map((p) => ({ ...p, checklist: p.checklist?.length ? p.checklist : makeChecklist() }));
}

export function createInitialState() {
  return {
    currentUser: null,
    users: DEMO_USERS,
    projects: normalizeProjects(structuredClone(SAMPLE_PROJECTS)),
    notifications: structuredClone(SAMPLE_NOTIFICATIONS),
    organization: { id: "org-1", name: "Heartland Fiber", plan: "Pilot", logo: "AB" },
  };
}

export function loadState() {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return createInitialState();
    const parsed = JSON.parse(value);
    return { ...createInitialState(), ...parsed, projects: normalizeProjects(parsed.projects || []) };
  } catch {
    return createInitialState();
  }
}

export function saveState(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function resetState() { localStorage.removeItem(KEY); return createInitialState(); }
export function uid(prefix = "id") { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
