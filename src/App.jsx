import { useMemo, useState } from "react";
import "./App.css";

const initialProjects = [
  {
    id: 1,
    name: "Bedford Fiber Expansion",
    contractor: "ABC Construction",
    status: "In Review",
    version: "Rev 3",
    submitted: "June 23, 2026",
    due: "June 28, 2026",
    progress: 72,
    risk: "Due Soon",
    issues: [
      { id: 23, title: "Missing conduit depth", sheet: "Sheet 12", status: "Open", due: "June 26", priority: "High" },
      { id: 24, title: "Incorrect handhole location", sheet: "Sheet 18", status: "Ready for Review", due: "June 27", priority: "Medium" },
      { id: 25, title: "Missing stationing", sheet: "Sheet 7", status: "Closed", due: "June 25", priority: "Low" },
    ],
  },
  {
    id: 2,
    name: "Bloomington FTTH Build",
    contractor: "XYZ Telecom",
    status: "Open",
    version: "Rev 1",
    submitted: "June 21, 2026",
    due: "June 30, 2026",
    progress: 38,
    risk: "On Track",
    issues: [
      { id: 31, title: "Missing stationing", sheet: "Sheet 7", status: "Open", due: "June 29", priority: "Low" },
    ],
  },
];

export default function App() {
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState(1);
  const [selectedIssueId, setSelectedIssueId] = useState(23);
  const [search, setSearch] = useState("");

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedIssue = selectedProject?.issues.find((i) => i.id === selectedIssueId);
  const allIssues = projects.flatMap((p) => p.issues.map((i) => ({ ...i, project: p.name, projectId: p.id, contractor: p.contractor })));

  const stats = useMemo(() => ({
    projects: projects.length,
    open: allIssues.filter((i) => i.status === "Open").length,
    review: allIssues.filter((i) => i.status === "Ready for Review").length,
    closed: allIssues.filter((i) => i.status === "Closed").length,
  }), [projects]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.contractor.toLowerCase().includes(search.toLowerCase())
  );

  function openProject(id) {
    setSelectedProjectId(id);
    setView("project");
  }

  function openIssue(projectId, issueId) {
    setSelectedProjectId(projectId);
    setSelectedIssueId(issueId);
    setView("issue");
  }

  function updateIssueStatus(status) {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === selectedProjectId
          ? {
              ...project,
              issues: project.issues.map((issue) =>
                issue.id === selectedIssueId ? { ...issue, status } : issue
              ),
            }
          : project
      )
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">AsBuiltFlow</div>
        <span className="subbrand">OSP closeout workspace</span>

        <button className={view === "dashboard" ? "nav active" : "nav"} onClick={() => setView("dashboard")}>Projects</button>
        <button className={view === "issues" ? "nav active" : "nav"} onClick={() => setView("issues")}>All Issues</button>
        <button className={view === "contractor" ? "nav active" : "nav"} onClick={() => setView("contractor")}>Contractor View</button>
        <button className={view === "reports" ? "nav active" : "nav"} onClick={() => setView("reports")}>Reports</button>

        <div className="demo-box">
          <span>Demo Mode</span>
          <strong>No real customer data</strong>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && (
          <>
            <Header title="Project Dashboard" subtitle="Track as-built reviews, contractor corrections, revisions, and closeout status." />

            <div className="toolbar">
              <input placeholder="Search projects or contractors..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="primary">+ New Project</button>
            </div>

            <div className="stats">
              <Stat label="Active Projects" value={stats.projects} />
              <Stat label="Open Issues" value={stats.open} type="open" />
              <Stat label="Ready for Review" value={stats.review} type="review" />
              <Stat label="Closed Issues" value={stats.closed} type="closed" />
            </div>

            <section className="panel">
              <h2>Active Closeouts</h2>
              <p>Monitor packages from contractor upload through final approval.</p>

              {filteredProjects.map((project) => (
                <div className="project-row" key={project.id}>
                  <div className="company">
                    <div className="avatar">{project.contractor.slice(0, 3).toUpperCase()}</div>
                    <div>
                      <h3>{project.name}</h3>
                      <p>{project.contractor} • {project.version} • Due {project.due}</p>
                    </div>
                  </div>

                  <div>
                    <div className="progress-meta">
                      <span>{project.progress}% complete</span>
                      <span>{project.risk}</span>
                    </div>
                    <div className="progress-bar">
                      <div style={{ width: `${project.progress}%` }} />
                    </div>
                  </div>

                  <Badge text={project.status} />
                  <button onClick={() => openProject(project.id)}>Open</button>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "project" && selectedProject && (
          <>
            <button className="back" onClick={() => setView("dashboard")}>← Back to Dashboard</button>
            <Header title={selectedProject.name} subtitle={`${selectedProject.contractor} • ${selectedProject.version} • Submitted ${selectedProject.submitted}`} />

            <div className="workspace-grid">
              <section className="panel">
                <div className="panel-top">
                  <div>
                    <h2>As-Built Plan Review</h2>
                    <p>Sheet 12 — Fiber route plan with issue pins.</p>
                  </div>
                  <button className="primary">Upload Revision</button>
                </div>

                <div className="sheet-nav">
                  <button>← Previous</button>
                  <strong>Sheet 12 of 48</strong>
                  <button>Next →</button>
                </div>

                <div className="plan-sheet">
                  <strong>AS-BUILT PLAN • SHEET 12</strong>
                  <div className="route one" />
                  <div className="route two" />
                  <button className="pin red" onClick={() => openIssue(selectedProject.id, 23)}>23</button>
                  <button className="pin yellow" onClick={() => openIssue(selectedProject.id, 24)}>24</button>
                  <div className="hh hh1">HH-14</div>
                  <div className="hh hh2">HH-18</div>
                </div>
              </section>

              <section className="panel">
                <h2>Correction Queue</h2>

                {selectedProject.issues.map((issue) => (
                  <div className="issue-card" key={issue.id}>
                    <div>
                      <h3>#{issue.id} — {issue.title}</h3>
                      <p>{issue.sheet} • Due {issue.due}</p>
                    </div>
                    <Badge text={issue.status} />
                    <button onClick={() => openIssue(selectedProject.id, issue.id)}>View</button>
                  </div>
                ))}

                <h2>Revision History</h2>
                <div className="revision"><strong>Rev 1</strong><span>Rejected</span></div>
                <div className="revision"><strong>Rev 2</strong><span>Corrections Sent</span></div>
                <div className="revision"><strong>Rev 3</strong><span>In Review</span></div>
              </section>
            </div>
          </>
        )}

        {view === "issue" && selectedIssue && selectedProject && (
          <>
            <button className="back" onClick={() => setView("project")}>← Back to Project</button>
            <Header title={`Issue #${selectedIssue.id}`} subtitle={selectedIssue.title} />

            <div className="workspace-grid">
              <section className="panel">
                <h2>Issue Details</h2>
                <p><strong>Project:</strong> {selectedProject.name}</p>
                <p><strong>Sheet:</strong> {selectedIssue.sheet}</p>
                <p><strong>Priority:</strong> {selectedIssue.priority}</p>
                <p><strong>Due Date:</strong> {selectedIssue.due}</p>
                <p><strong>Status:</strong> <Badge text={selectedIssue.status} /></p>

                <div className="actions">
                  <button onClick={() => updateIssueStatus("Open")}>Mark Open</button>
                  <button onClick={() => updateIssueStatus("Ready for Review")}>Ready for Review</button>
                  <button className="primary" onClick={() => updateIssueStatus("Closed")}>Close Issue</button>
                </div>
              </section>

              <section className="panel">
                <h2>Comment Thread</h2>
                <div className="comment">
                  <strong>Inspector</strong>
                  <p>Missing conduit depth near HH-14. Please update before approval.</p>
                </div>
                <div className="comment contractor">
                  <strong>ABC Construction</strong>
                  <p>Received. We will update this on the next revision.</p>
                </div>
                <textarea placeholder="Add a response..." />
                <button className="primary">Post Comment</button>
              </section>
            </div>
          </>
        )}

        {view === "issues" && (
          <>
            <Header title="All Issues" subtitle="Every correction across active closeout packages." />
            <section className="panel">
              {allIssues.map((issue) => (
                <div className="issue-card" key={`${issue.project}-${issue.id}`}>
                  <div>
                    <h3>#{issue.id} — {issue.title}</h3>
                    <p>{issue.project} • {issue.sheet} • {issue.contractor}</p>
                  </div>
                  <Badge text={issue.status} />
                </div>
              ))}
            </section>
          </>
        )}

        {view === "contractor" && (
          <>
            <Header title="Contractor View" subtitle="Open corrections assigned to contractors." />
            <section className="panel">
              {allIssues.filter((i) => i.status !== "Closed").map((issue) => (
                <div className="issue-card" key={issue.id}>
                  <div>
                    <h3>{issue.contractor}</h3>
                    <p>#{issue.id} — {issue.title}</p>
                  </div>
                  <Badge text={issue.status} />
                  <button className="primary">Upload Revision</button>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "reports" && (
          <>
            <Header title="Reports" subtitle="Closeout visibility across active projects." />
            <div className="stats">
              <Stat label="Active Projects" value={stats.projects} />
              <Stat label="Total Issues" value={allIssues.length} />
              <Stat label="Closed Issues" value={stats.closed} type="closed" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Header({ title, subtitle }) {
  return (
    <div className="header">
      <div>
        <span>Telecom Closeout Management</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="updates-pill">🔔 3 Updates</div>
    </div>
  );
}

function Stat({ label, value, type = "" }) {
  return (
    <div className={`stat ${type}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({ text }) {
  const cls =
    text === "Open" ? "badge open" :
    text === "Ready for Review" || text === "In Review" ? "badge review" :
    "badge closed";

  return <span className={cls}>{text}</span>;
}