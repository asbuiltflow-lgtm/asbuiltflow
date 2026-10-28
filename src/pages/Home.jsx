import { useState } from "react";
import ContactForm from "../components/ContactForm";
import "./Home.css";
import "./PublicHome.css";

const workflow = [
  ["01", "Release the package", "Keep the current construction revision clear while earlier revisions remain available for reference."],
  ["02", "Collect field changes", "Record walkout changes and keep the reason for a package revision with the project history."],
  ["03", "Submit closeout evidence", "Give contractors a project-specific checklist for required files, photos, and invoice documents."],
  ["04", "Review and accept", "Request corrections, preserve resubmissions, route work for inspection, and freeze accepted closeout."],
];

const capabilities = [
  "Construction package and revision control",
  "Contractor-specific project access",
  "Required deliverables and completeness tracking",
  "Evidence upload, review, correction, and history",
  "Field changes, structured assets, and CSV import",
  "Issues and punch-list tracking",
  "Invoice documents with configurable NTP / PO approval gates",
  "Final accepted closeout ZIP export",
];

const roles = [
  ["Owners & coordinators", "See project readiness, route reviews, manage authorizations, and keep closeout moving."],
  ["Telecom contractors", "Access assigned projects, follow the current package, and submit required closeout documents."],
  ["Inspectors", "Review submitted work, record issues, and complete the final acceptance handoff."],
  ["Read-only stakeholders", "Follow project status and approved records without editing project data."],
];

export default function Home() {
  const [contactForm, setContactForm] = useState(null);
  const requestDemo = () => setContactForm("demo");

  return (
    <main className="marketingSite">
      <a className="marketingSkipLink" href="#main-content">Skip to content</a>
      <header className="marketingHeader">
        <a className="marketingBrand" href="/" aria-label="AsBuiltFlow home">
          <img src="/brand/asbuiltflow-logo.jpg" width="1280" height="426" alt="AsBuiltFlow" />
        </a>
        <nav className="marketingNav" aria-label="Main navigation">
          <a href="#benefits">Benefits</a>
          <a href="#workflow">How it works</a>
          <a href="#roles">Who it’s for</a>
          <a className="marketingDemoNav" href="/demo">Interactive demo</a>
          <a className="marketingSignIn" href="/app">Sign In</a>
          <button className="marketingButton marketingButtonSmall" type="button" onClick={requestDemo}>Request a Demo</button>
        </nav>
        <a className="marketingMobileSignIn" href="/app">Sign In</a>
      </header>

      <div id="main-content">
        <section className="marketingHero" aria-labelledby="hero-title">
          <div className="marketingHeroCopy">
            <p className="marketingEyebrow"><span aria-hidden="true" /> Telecom construction closeout</p>
            <h1 id="hero-title">Telecom construction closeout without the email chains.</h1>
            <p className="marketingLead">Manage construction revisions, contractor evidence, review, corrections, invoices, and final acceptance in one workflow.</p>
            <div className="marketingActions">
              <button className="marketingButton" type="button" onClick={requestDemo}>Request a Demo</button>
              <a className="marketingButtonSecondary" href="/app">Sign In</a>
            </div>
            <a className="marketingDemoLink" href="/demo">Explore the interactive demo <span aria-hidden="true">→</span></a>
            <p className="marketingNote">A shared workspace for the documents and decisions around telecom construction closeout.</p>
          </div>

          <aside className="workflowPreview" aria-label="AsBuiltFlow closeout workflow overview">
            <div className="previewHeader"><span>PROJECT WORKFLOW</span><span className="previewStatus"><i /> Connected handoffs</span></div>
            <ol className="previewSteps">
              <li><span className="previewStepIcon">01</span><span><strong>Construction package</strong><small>Current revision identified</small></span><b aria-hidden="true">✓</b></li>
              <li><span className="previewStepIcon">02</span><span><strong>Contractor submission</strong><small>Required evidence collected</small></span><b aria-hidden="true">✓</b></li>
              <li><span className="previewStepIcon">03</span><span><strong>Review and corrections</strong><small>History stays with the item</small></span><b aria-hidden="true">↻</b></li>
              <li><span className="previewStepIcon">04</span><span><strong>Final acceptance</strong><small>Approved closeout is frozen</small></span><b aria-hidden="true">□</b></li>
            </ol>
            <p className="previewFootnote">The workflow overview is illustrative. Sign in to see the live project workspace.</p>
          </aside>
        </section>

        <section className="marketingSection benefitsSection" id="benefits" aria-labelledby="benefits-title">
          <div className="sectionIntro">
            <p className="marketingEyebrow">One project record</p>
            <h2 id="benefits-title">Keep the closeout context with the work.</h2>
            <p>Package revisions, submissions, decisions, and final records stay connected to their project instead of scattered across inboxes and shared folders.</p>
          </div>
          <div className="benefitList">
            <article><span>01</span><div><h3>Know which package is current</h3><p>Identify the released construction revision and retain earlier versions for reference.</p></div></article>
            <article><span>02</span><div><h3>Make requirements visible</h3><p>Track required closeout deliverables and see what is missing, awaiting review, or accepted.</p></div></article>
            <article><span>03</span><div><h3>Keep review decisions traceable</h3><p>Request corrections, accept submissions, and preserve the evidence revision history.</p></div></article>
          </div>
        </section>

        <section className="marketingWorkflowSection" id="workflow" aria-labelledby="workflow-title">
          <div className="sectionIntro sectionIntroWide">
            <p className="marketingEyebrow">How it works</p>
            <h2 id="workflow-title">A clear path from release to accepted closeout.</h2>
          </div>
          <ol className="marketingWorkflowGrid">
            {workflow.map(([number, title, text]) => <li key={number}>
              <span className="workflowNumber">{number}</span><h3>{title}</h3><p>{text}</p>
            </li>)}
          </ol>
          <div className="workflowSequence" aria-label="Workflow stages">
            <span>Package revisions</span><b aria-hidden="true">→</b><span>Construction</span><b aria-hidden="true">→</b><span>As-built / closeout</span><b aria-hidden="true">→</b><span>Review / rework</span><b aria-hidden="true">→</b><span>Final acceptance</span>
          </div>
        </section>

        <section className="marketingDemoSection" aria-labelledby="demo-section-title">
          <div>
            <p className="marketingEyebrow">Interactive product tour</p>
            <h2 id="demo-section-title">Explore a sample workspace.</h2>
            <p>Open a guided simulation with fictional projects and sample records. It is separate from the live application: demo actions do not authenticate users, upload files, or change customer workspaces.</p>
          </div>
          <a className="marketingButton" href="/demo">Open the interactive demo <span aria-hidden="true">→</span></a>
        </section>

        <section className="marketingSection productSection" id="product" aria-labelledby="product-title">
          <div className="sectionIntro">
            <p className="marketingEyebrow">Inside the workspace</p>
            <h2 id="product-title">Project status and closeout records in one view.</h2>
            <p>AsBuiltFlow is the workflow around construction documents—not a PDF editor. Teams work with their existing files and keep decisions organized by project.</p>
          </div>
          <div className="productDetails">
            <div className="productDetailHeading"><span className="detailIcon" aria-hidden="true">↗</span><div><strong>From current package to final handoff</strong><p>Project workspace capabilities</p></div></div>
            <ul>{capabilities.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
            <div className="productLinks">
              <a className="textLink" href="/app">Sign in to the live workspace <span aria-hidden="true">→</span></a>
              <a className="textLink" href="/demo">Explore the simulated demo <span aria-hidden="true">→</span></a>
            </div>
          </div>
          <p className="productCaption">Product capabilities shown here reflect the current AsBuiltFlow workspace; availability can depend on project setup and user role.</p>
        </section>

        <section className="marketingAudience" id="roles" aria-labelledby="roles-title">
          <div className="sectionIntro">
            <p className="marketingEyebrow">Built for the closeout team</p>
            <h2 id="roles-title">The right view for each project role.</h2>
          </div>
          <div className="roleGrid">{roles.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
          <p className="roleFootnote">Role-based access includes Admin, Coordinator, Inspector, Contractor, and Viewer roles.</p>
        </section>

        <section className="marketingPilotSection" id="pilot" aria-labelledby="pilot-title">
          <div className="sectionIntro">
            <p className="marketingEyebrow">Pilot onboarding</p>
            <h2 id="pilot-title">Start with the closeout workflow your team already runs.</h2>
            <p>A pilot conversation can map the people, project documents, deliverables, and review handoffs involved. Scope is discussed with each organization; no fixed price or timeline is implied here.</p>
          </div>
          <ol className="pilotSteps">
            <li><span>01</span><div><strong>Map the project team</strong><p>Identify internal roles and the contractor company that needs project access.</p></div></li>
            <li><span>02</span><div><strong>Identify package and deliverables</strong><p>Confirm the current construction revision and the closeout items to track.</p></div></li>
            <li><span>03</span><div><strong>Set up project access</strong><p>Use role-based access to give participants the project view they need.</p></div></li>
            <li><span>04</span><div><strong>Walk through a handoff</strong><p>Review how contractor submissions move through correction and acceptance.</p></div></li>
          </ol>
          <div className="pilotContact">
            <button className="textLink" type="button" onClick={requestDemo}>Discuss a pilot <span aria-hidden="true">→</span></button>
            <span>Prefer email? <a href="mailto:hello@asbuiltflow.com">hello@asbuiltflow.com</a></span>
          </div>
        </section>

        <section className="marketingFinalCta" aria-labelledby="final-cta-title">
          <div><p className="marketingEyebrow">See the workflow</p><h2 id="final-cta-title">Bring your closeout process into one place.</h2><p>Request a walkthrough of AsBuiltFlow using a project workflow relevant to your team.</p></div>
          <div className="marketingActions"><button className="marketingButton marketingButtonLight" type="button" onClick={requestDemo}>Request a Demo</button><a className="marketingButtonOutlineLight" href="/app">Sign In</a></div>
        </section>
      </div>

      <footer className="marketingFooter">
        <div className="footerBrandBlock"><img src="/brand/asbuiltflow-icon.jpg" width="1254" height="1254" alt="" /><div><strong>AsBuiltFlow™</strong><span>Telecom construction closeout</span></div></div>
        <nav aria-label="Footer navigation"><a href="/demo">Interactive demo</a><a href="/app">Sign In</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:hello@asbuiltflow.com">hello@asbuiltflow.com</a></nav>
        <small>© {new Date().getFullYear()} AsBuiltFlow. All rights reserved.</small>
      </footer>

      <ContactForm isOpen={contactForm !== null} formType={contactForm || "demo"} onClose={() => setContactForm(null)} />
    </main>
  );
}
