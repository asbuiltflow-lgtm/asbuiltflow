import { useMemo, useState } from "react";
import "./App.css";

const initialProjects = [
  {
    id: 1,
    name: "Bedford Fiber Expansion",
    contractor: "ABC Construction",
    coordinator: "Morgan",
    inspector: "Gage",
    status: "Inspector Review",
    version: "Rev 3",
    submitted: "June 23, 2026",
    due: "June 28, 2026",
    progress: 72,
    issues: [
      {
        id: 23,
        title: "Missing conduit depth",
        sheet: "Sheet 12",
        status: "Open",
        priority: "High",
        assignedTo: "Contractor",
        comments: [
          { author: "Inspector", text: "Missing conduit depth near HH-14. Please update before approval." },
          { author: "ABC Construction", text: "Received. We will update this on the next revision." },
        ],
      },
      {
        id: 24,
        title: "Incorrect handhole location",
        sheet: "Sheet 18",
        status: "Ready for Review",
        priority: "Medium",
        assignedTo: "Inspector",
        comments: [
          { author: "Inspector", text: "HH location appears shifted from field placement." },
        ],
      },
    ],
    revisions: ["Rev 1 Submitted", "Rev 2 Needs Rework", "Rev 3 In Review"],
  },
  {
    id: 2,
    name: "Bloomington FTTH Build",
    contractor: "XYZ Telecom",
    coordinator: "Morgan",
    inspector: "Gage",
    status: "Coordinator Review",
    version: "Rev 1",
    submitted: "June 21, 2026",
    due: "June 30, 2026",
    progress: 38,
    issues: [
      {
        id: 31,
        title: "Missing stationing",
        sheet: "Sheet 7",
        status: "Open",
        priority: "Low",
        assignedTo: "Contractor",
        comments: [{ author: "Coordinator", text: "Stationing missing on Sheet 7." }],
      },
    ],
    revisions: ["Rev 1 Submitted"],
  },
];

export default function Demo() {
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState("dashboard");
  const [role, setRole] = useState("Inspector");
  const [selectedProjectId, setSelectedProjectId] = useState(1);
  const [selectedIssueId, setSelectedIssueId] = useState(23);
  const [notice, setNotice] = useState("Welcome to the AsBuiltFlow interactive demo.");

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedIssue = selectedProject?.issues.find((i) => i.id === selectedIssueId);

  const allIssues = projects.flatMap((p) =>
    p.issues.map((i) => ({
      ...i,
      project: p.name,
      projectId: p.id,
      contractor: p.contractor,
    }))
  );

  const stats = useMemo(() => ({
    active: projects.length,
    open: allIssues.filter((i) => i.status !== "Closed").length,
    review: projects.filter((p) => p.status.includes("Review")).length,
    approved: allIssues.filter((i) => i.status === "Closed").length,
  }), [projects, allIssues]);

  function openProject(id) {
    setSelectedProjectId(id);
    setView("project");
    setNotice("Project opened.");
  }

  function openIssue(projectId, issueId) {
    setSelectedProjectId(projectId);
    setSelectedIssueId(issueId);
    setView("issue");
    setNotice("Issue details opened.");
  }

  function updateProjectStatus(status) {
    setProjects((prev) =>
      prev.map((p) => p.id === selectedProjectId ? { ...p, status } : p)
    );
    setNotice(`Project marked as ${status}.`);
  }

  function updateIssueStatus(status) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              issues: p.issues.map((i) =>
                i.id === selectedIssueId ? { ...i, status } : i
              ),
            }
          : p
      )
    );
    setNotice(`Issue marked as ${status}.`);
  }

  function uploadRevision() {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              version: `Rev ${p.revisions.length + 1}`,
              status: "Revision Submitted",
              revisions: [...p.revisions, `Rev ${p.revisions.length + 1} Submitted`],
              progress: Math.min(100, p.progress + 18),
            }
          : p
      )
    );
    setNotice("Revision uploaded. Coordinator and inspector notified.");
  }

  function postComment() {
    if (!selectedIssue) return;

    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              issues: p.issues.map((i) =>
                i.id === selectedIssueId
                  ? {
                      ...i,
                      comments: [
                        ...i.comments,
                        { author: role, text: "Demo response added to this issue thread." },
                      ],
                    }
                  : i
              ),
            }
          : p
      )
    );
    setNotice("Comment added to the issue conversation.");
  }

  return (
    <div className="demoApp">
      <aside className="sidebar">
        <a className="backHome" href="/">← Back to Website</a>
        <div className="brand">AsBuiltFlow</div>
        <span className="subbrand">Interactive Workflow Demo</span>

        <label className="roleLabel">View demo as</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option>Inspector</option>
          <option>Coordinator</option>
          <option>Contractor</option>
          <option>Admin</option>
        </select>

        <button className={view === "dashboard" ? "nav active" : "nav"} onClick={() => setView("dashboard")}>Dashboard</button>
        <button className={view === "workflow" ? "nav active" : "nav"} onClick={() => setView("workflow")}>Workflow</button>
        <button className={view === "issues" ? "nav active" : "nav"} onClick={() => setView("issues")}>All Issues</button>
        <button className={view === "contractor" ? "nav active" : "nav"} onClick={() => setView("contractor")}>Contractor View</button>
        <button className={view === "reports" ? "nav active" : "nav"} onClick={() => setView("reports")}>Reports</button>

        <div className="demoBox">
          <strong>Prototype</strong>
          <span>No login required</span>
        </div>
      </aside>

      <main className="main">
        <div className="notice">🔔 {notice}</div>

        {view === "dashboard" && (
          <>
            <Header title="Project Dashboard" subtitle={`Viewing as ${role}. Manage closeout packages from upload to approval.`} />

            <div className="stats">
              <Stat label="Active Closeouts" value={stats.active} />
              <Stat label="Open Issues" value={stats.open} />
              <Stat label="In Review" value={stats.review} />
              <Stat label="Approved Items" value={stats.approved} />
            </div>

            <section className="panel">
              <div className="panelTop">
                <div>
                  <h2>Active Closeouts</h2>
                  <p>Monitor contractor submissions, review status, revisions, and open issues.</p>
                </div>
                <button className="primary" onClick={() => setNotice("New closeout creation would open here.")}>+ New Closeout</button>
              </div>

              {projects.map((project) => (
                <div className="projectRow" key={project.id}>
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.contractor} • {project.version} • Due {project.due}</p>
                  </div>

                  <div className="progressWrap">
                    <span>{project.progress}% complete</span>
                    <div className="progressBar"><div style={{ width: `${project.progress}%` }} /></div>
                  </div>

                  <Badge text={project.status} />
                  <button onClick={() => openProject(project.id)}>Open</button>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "workflow" && (
          <>
            <Header title="Workflow Overview" subtitle="The common OSP closeout path from contractor upload to final approval." />
            <section className="workflowPanel">
              {["Submitted", "Coordinator Review", "Ready for Inspection", "Inspector Review", "Needs Rework", "Revision Submitted", "Approved"].map((step) => (
                <div className="workflowStep" key={step}>{step}</div>
              ))}
            </section>
          </>
        )}

        {view === "project" && selectedProject && (
          <>
            <button className="back" onClick={() => setView("dashboard")}>← Back</button>
            <Header title={selectedProject.name} subtitle={`${selectedProject.contractor} • ${selectedProject.status} • ${selectedProject.version}`} />

            <div className="workspaceGrid">
              <section className="panel">
                <div className="panelTop">
                  <div>
                    <h2>Plan Review</h2>
                    <p>Click issue pins to review corrections tied to this sheet.</p>
                  </div>
                  <button className="primary" onClick={uploadRevision}>Upload Revision</button>
                </div>

                <div className="sheetToolbar">
                  <button onClick={() => setNotice("Previous sheet opened.")}>← Previous</button>
                  <strong>Sheet 12 of 48</strong>
                  <button onClick={() => setNotice("Next sheet opened.")}>Next →</button>
                </div>

                <div className="planSheet">
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
                <h2>Project Actions</h2>
                <div className="actions">
                  <button onClick={() => updateProjectStatus("Coordinator Review")}>Coordinator Review</button>
                  <button onClick={() => updateProjectStatus("Ready for Inspection")}>Ready for Inspection</button>
                  <button onClick={() => updateProjectStatus("Needs Rework")}>Needs Rework</button>
                  <button className="primary" onClick={() => updateProjectStatus("Approved")}>Approve</button>
                </div>

                <h2>Issue Queue</h2>
                {selectedProject.issues.map((issue) => (
                  <div className="issueCard" key={issue.id}>
                    <div>
                      <h3>#{issue.id} — {issue.title}</h3>
                      <p>{issue.sheet} • Assigned to {issue.assignedTo}</p>
                    </div>
                    <Badge text={issue.status} />
                    <button onClick={() => openIssue(selectedProject.id, issue.id)}>View</button>
                  </div>
                ))}

                <h2>Revision History</h2>
                {selectedProject.revisions.map((rev) => (
                  <div className="revision" key={rev}>{rev}</div>
                ))}
              </section>
            </div>
          </>
        )}

        {view === "issue" && selectedIssue && selectedProject && (
          <>
            <button className="back" onClick={() => setView("project")}>← Back to Project</button>
            <Header title={`Issue #${selectedIssue.id}`} subtitle={selectedIssue.title} />

            <div className="workspaceGrid">
              <section className="panel">
                <h2>Issue Details</h2>
                <Info label="Project" value={selectedProject.name} />
                <Info label="Sheet" value={selectedIssue.sheet} />
                <Info label="Priority" value={selectedIssue.priority} />
                <Info label="Assigned To" value={selectedIssue.assignedTo} />
                <Info label="Status" value={selectedIssue.status} />

                <div className="actions">
                  <button onClick={() => updateIssueStatus("Open")}>Mark Open</button>
                  <button onClick={() => updateIssueStatus("Ready for Review")}>Ready for Review</button>
                  <button className="primary" onClick={() => updateIssueStatus("Closed")}>Close Issue</button>
                </div>
              </section>

              <section className="panel">
                <h2>Issue Conversation</h2>
                {selectedIssue.comments.map((comment, index) => (
                  <div className="comment" key={index}>
                    <strong>{comment.author}</strong>
                    <p>{comment.text}</p>
                  </div>
                ))}
                <textarea placeholder="Type a response..." />
                <button className="primary" onClick={postComment}>Post Comment</button>
              </section>
            </div>
          </>
        )}

        {view === "issues" && (
          <>
            <Header title="All Issues" subtitle="Every correction across active closeout packages." />
            <section className="panel">
              {allIssues.map((issue) => (
                <div className="issueCard" key={`${issue.project}-${issue.id}`}>
                  <div>
                    <h3>#{issue.id} — {issue.title}</h3>
                    <p>{issue.project} • {issue.sheet} • {issue.contractor}</p>
                  </div>
                  <Badge text={issue.status} />
                  <button onClick={() => openIssue(issue.projectId, issue.id)}>Open</button>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "contractor" && (
          <>
            <Header title="Contractor View" subtitle="Contractors can see assigned corrections and upload revisions." />
            <section className="panel">
              {allIssues.filter((i) => i.status !== "Closed").map((issue) => (
                <div className="issueCard" key={issue.id}>
                  <div>
                    <h3>{issue.contractor}</h3>
                    <p>#{issue.id} — {issue.title}</p>
                  </div>
                  <Badge text={issue.status} />
                  <button className="primary" onClick={() => {
                    setSelectedProjectId(issue.projectId);
                    uploadRevision();
                  }}>Upload Revision</button>
                </div>
              ))}
            </section>
          </>
        )}

        {view === "reports" && (
          <>
            <Header title="Reports" subtitle="Closeout visibility across active projects." />
            <div className="stats">
              <Stat label="Active Projects" value={stats.active} />
              <Stat label="Total Issues" value={allIssues.length} />
              <Stat label="Open Issues" value={stats.open} />
              <Stat label="Closed Issues" value={stats.approved} />
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
      <span className="kicker">Telecom As-Built Workflow</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({ text }) {
  return <span className={`badge ${text.toLowerCase().replaceAll(" ", "-")}`}>{text}</span>;
}

function Info({ label, value }) {
  return <p><strong>{label}:</strong> {value}</p>;
}