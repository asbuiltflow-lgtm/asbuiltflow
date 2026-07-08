import "./Home.css";

export function Privacy() {
  return (
    <div className="legalPage">
      <h1>Privacy Policy</h1>
      <p>Last updated: July 2026</p>

      <p>
        AsBuiltFlow is an early-stage telecom as-built review and closeout platform.
        We only collect information users voluntarily provide, such as name, email,
        company, role, and demo request details.
      </p>

      <p>
        We do not sell personal information. Information submitted through demo
        requests or email is used only to respond, provide product information,
        improve AsBuiltFlow, and communicate about the platform.
      </p>

      <p>
        For questions, contact <strong>hello@asbuiltflow.com</strong>.
      </p>

      <a href="/">← Back to AsBuiltFlow</a>
    </div>
  );
}

export function Terms() {
  return (
    <div className="legalPage">
      <h1>Terms of Service</h1>
      <p>Last updated: July 2026</p>

      <p>
        AsBuiltFlow is currently an interactive prototype and early-stage product.
        The demo is provided for evaluation and feedback purposes only.
      </p>

      <p>
        Do not upload confidential, proprietary, or production project documents
        into any demo environment unless a separate agreement is in place.
      </p>

      <p>
        Features shown in the prototype may change as the platform develops.
        Use of AsBuiltFlow for paid services will require separate customer terms
        or agreement.
      </p>

      <p>
        For questions, contact <strong>hello@asbuiltflow.com</strong>.
      </p>

      <a href="/">← Back to AsBuiltFlow</a>
    </div>
  );
}