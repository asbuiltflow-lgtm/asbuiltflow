import { useState } from "react";
import ContactForm from "../components/ContactForm";
import "./Home.css";

export default function Home() {
  const [contactForm, setContactForm] = useState(null);

  function openDemoForm() {
    setContactForm("demo");
  }

  function openContactForm() {
    setContactForm("contact");
  }

  function closeContactForm() {
    setContactForm(null);
  }

  return (
    <div className="site">
      <nav className="navBar">
        <a className="logo" href="/">
          AsBuiltFlow
        </a>

        <div className="navLinks">
          <a href="#problem">Problem</a>
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
          <a href="#founding">Founding Customers</a>

          <button
            type="button"
            className="contactNavButton"
            onClick={openContactForm}
          >
            Contact
          </button>

          <a className="navSignIn" href="/app">Sign In</a>
          <a className="navButton" href="/demo">Explore Demo</a>
        </div>
      </nav>

      <section className="hero">
        <div className="heroText">
          <span className="eyebrow">Telecom Closeout Software</span>

          <h1>
            Manage Telecom As-Built Reviews from Submission to Final Approval
          </h1>

          <p>
            Replace scattered emails, PDFs, and spreadsheets with one
            centralized platform for contractor submissions, reviews,
            revisions, issue tracking, and closeout approval.
          </p>

          <p className="audience">
            Designed specifically for telecom contractors, coordinators, and
            inspectors.
          </p>

          <div className="heroButtons">
            <button
              type="button"
              className="primaryBtn"
              onClick={openDemoForm}
            >
              Schedule a Demo
            </button>

            <a className="secondaryBtn" href="/demo">Explore Interactive Demo</a>
            <a className="workspaceLink" href="/app">Sign In to Workspace</a>
          </div>
        </div>

        <div className="heroCard">
          <div className="cardTop">
            <span>Project Dashboard</span>
            <strong>Live Preview</strong>
          </div>

          <div className="metricGrid">
            <div>
              <strong>12</strong>
              <span>Active Closeouts</span>
            </div>

            <div>
              <strong>34</strong>
              <span>Open Issues</span>
            </div>

            <div>
              <strong>8</strong>
              <span>Ready for Review</span>
            </div>

            <div>
              <strong>21</strong>
              <span>Approved</span>
            </div>
          </div>

          <div className="miniList">
            <p>
              <b>Bedford Fiber Expansion</b>
              <span>In Review</span>
            </p>

            <p>
              <b>Bloomington FTTH Build</b>
              <span>Needs Rework</span>
            </p>

            <p>
              <b>Lawrence County Route</b>
              <span>Ready</span>
            </p>
          </div>
        </div>
      </section>

      <section className="problem" id="problem">
        <span className="sectionLabel">The Problem</span>

        <h2>As-built closeout gets messy fast.</h2>

        <p>
          Telecom closeout teams often rely on email chains, PDF attachments,
          phone calls, and spreadsheets to manage corrections and approvals.
          That creates delays, confusion, and lost context.
        </p>

        <div className="problemGrid">
          <div>Lost comments</div>
          <div>Confusing PDF versions</div>
          <div>No project visibility</div>
          <div>Slow approvals</div>
        </div>
      </section>

      <section className="workflow" id="workflow">
        <span className="sectionLabel">Workflow</span>

        <h2>One shared process from contractor upload to approval.</h2>

        <div className="workflowSteps">
          <div>Contractor Uploads</div>
          <div>Coordinator Review</div>
          <div>Ready for Inspection</div>
          <div>Inspector Review</div>
          <div>Needs Rework</div>
          <div>Resubmitted</div>
          <div>Approved</div>
        </div>
      </section>

      <section className="features" id="features">
        <span className="sectionLabel">Features</span>

        <h2>Built around real OSP review workflows.</h2>

        <div className="featureGrid">
          <Feature
            title="Project Dashboard"
            text="See every closeout package, status, contractor, revision, and open correction in one place."
          />

          <Feature
            title="PDF Markup"
            text="Review drawings, mark sheets, create issues, and keep corrections tied to the right plan page."
          />

          <Feature
            title="Role-Based Workflows"
            text="Separate contractor, coordinator, and inspector views for cleaner handoffs and approvals."
          />

          <Feature
            title="Issue Conversations"
            text="Keep questions and answers attached to the exact issue instead of buried in email."
          />

          <Feature
            title="Revision History"
            text="Track every upload, correction, status change, and approval from start to finish."
          />

          <Feature
            title="Reports"
            text="Give managers visibility into open issues, review status, turnaround time, and closeout progress."
          />
        </div>
      </section>

      <section className="demoSection">
        <div>
          <span className="sectionLabel">Interactive Prototype</span>

          <h2>See the workflow in action.</h2>

          <p>
            Explore the current AsBuiltFlow prototype with sample projects,
            issues, revision history, contractor views, and reports.
          </p>
        </div>

        <a className="primaryBtn" href="/demo">
          Launch Interactive Demo
        </a>
      </section>

      <section className="founding" id="founding">
        <div>
          <span className="sectionLabel">Founding Customer Program</span>

          <h2>Help shape AsBuiltFlow before the full release.</h2>

          <p>
            We’re looking for our first 10 telecom companies to test the
            platform, provide feedback, and help guide the roadmap.
          </p>
        </div>

        <div className="foundingBox">
          <p>Founding customers receive:</p>

          <ul>
            <li>Discounted early pricing</li>
            <li>Direct input on new features</li>
            <li>Priority support</li>
            <li>Optional website testimonial after value is proven</li>
          </ul>

          <button
            type="button"
            className="primaryBtn"
            onClick={openContactForm}
          >
            Apply for Founding Program
          </button>
        </div>
      </section>

      <section className="contactSection">
        <span className="sectionLabel">Contact</span>

        <h2>Want to improve your as-built review process?</h2>

        <p>
          Schedule a quick demo or send feedback on what your team needs most.
        </p>

        <div className="heroButtons center">
          <button
            type="button"
            className="primaryBtn"
            onClick={openDemoForm}
          >
            Schedule a Demo
          </button>

          <button
            type="button"
            className="secondaryBtn"
            onClick={openContactForm}
          >
            Contact AsBuiltFlow
          </button>
        </div>
      </section>

      <footer>
        <div>
          <strong>AsBuiltFlow</strong>
          <p>Telecom As-Built Review &amp; Closeout Platform</p>
        </div>

        <div className="footerLinks">
          <a href="/demo">Explore Demo</a>
          <a href="/app">Sign In</a>

          <button
            type="button"
            className="footerContactButton"
            onClick={openContactForm}
          >
            Contact
          </button>

          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </footer>

      <ContactForm
        isOpen={contactForm !== null}
        formType={contactForm || "demo"}
        onClose={closeContactForm}
      />
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div className="featureCard">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}