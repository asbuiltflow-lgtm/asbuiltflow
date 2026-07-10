import { useCallback, useEffect, useState } from "react";

const FORM_ENDPOINT = "https://formspree.io/f/xgojgpjn";

export default function ContactForm({
  isOpen,
  onClose,
  formType = "demo",
}) {
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [submittedName, setSubmittedName] = useState("");

  const isDemoRequest = formType === "demo";

  const handleClose = useCallback(() => {
    setStatus("idle");
    setErrorMessage("");
    setSubmittedName("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && status !== "submitting") {
      handleClose();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();

    setSubmittedName(name);
    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        const formspreeMessage = data?.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join(" ");

        throw new Error(
          formspreeMessage ||
            "The form could not be submitted. Please try again.",
        );
      }

      form.reset();
      setStatus("success");
    } catch (error) {
      console.error("Form submission failed:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );

      setStatus("error");
    }
  }

  return (
    <div
      className="contactModalBackdrop"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="contactModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-form-title"
      >
        <button
          type="button"
          className="contactModalClose"
          onClick={handleClose}
          aria-label="Close form"
          disabled={status === "submitting"}
        >
          ×
        </button>

        {status === "success" ? (
          <div className="contactSuccess">
            <div className="contactSuccessIcon" aria-hidden="true">
              ✓
            </div>

            <p className="contactEyebrow">Message received</p>

            <h2>
              Thanks{submittedName ? `, ${submittedName}` : ""}.
            </h2>

            <p>
              Your message was sent successfully. I’ll review it and follow up
              with you as soon as possible.
            </p>

            <button
              type="button"
              className="contactPrimaryButton"
              onClick={handleClose}
            >
              Return to website
            </button>
          </div>
        ) : (
          <>
            <div className="contactFormHeader">
              <p className="contactEyebrow">
                {isDemoRequest
                  ? "Interactive prototype"
                  : "Contact AsBuiltFlow"}
              </p>

              <h2 id="contact-form-title">
                {isDemoRequest
                  ? "Request an AsBuiltFlow demo"
                  : "Tell me about your workflow"}
              </h2>

              <p>
                {isDemoRequest
                  ? "Share a few details about your current closeout process and what you would want from a production version of AsBuiltFlow."
                  : "Send feedback, questions, or information about the workflow your team currently uses."}
              </p>
            </div>

            <form className="contactForm" onSubmit={handleSubmit}>
              <input
                type="hidden"
                name="request_type"
                value={isDemoRequest ? "Demo request" : "General contact"}
              />

              <input
                type="hidden"
                name="_subject"
                value={
                  isDemoRequest
                    ? "New AsBuiltFlow Demo Request"
                    : "New AsBuiltFlow Website Message"
                }
              />

              <input
                type="hidden"
                name="page_url"
                value={window.location.href}
              />

              <div className="contactFormGrid">
                <label className="contactField">
                  <span>Name *</span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="contactField">
                  <span>Work email *</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    required
                  />
                </label>

                <label className="contactField">
                  <span>Company *</span>
                  <input
                    type="text"
                    name="company"
                    autoComplete="organization"
                    placeholder="Company name"
                    required
                  />
                </label>

                <label className="contactField">
                  <span>Role</span>
                  <input
                    type="text"
                    name="role"
                    autoComplete="organization-title"
                    placeholder="OSP manager, coordinator, contractor..."
                  />
                </label>

                <label className="contactField contactFieldFull">
                  <span>Organization type</span>

                  <select name="organization_type" defaultValue="">
                    <option value="" disabled>
                      Select one
                    </option>

                    <option value="Telecom contractor">
                      Telecom contractor
                    </option>

                    <option value="Internet service provider">
                      Internet service provider
                    </option>

                    <option value="Utility">Utility</option>

                    <option value="Engineering or design firm">
                      Engineering or design firm
                    </option>

                    <option value="Municipality">Municipality</option>

                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="contactField contactFieldFull">
                  <span>How do you currently manage as-built closeouts?</span>

                  <textarea
                    name="current_process"
                    placeholder="For example: email, PDFs, spreadsheets, Bluebeam, shared drives, or another platform."
                    rows="4"
                  />
                </label>

                <label className="contactField contactFieldFull">
                  <span>
                    What would you most want AsBuiltFlow to improve?
                  </span>

                  <textarea
                    name="desired_improvements"
                    placeholder="For example: revision tracking, submissions, issue management, notifications, approvals, reporting, photos, or GIS."
                    rows="4"
                  />
                </label>

                <label className="contactField contactFieldFull">
                  <span>Anything else?</span>

                  <textarea
                    name="message"
                    placeholder="Questions, feedback, preferred meeting times, or anything else you want me to know."
                    rows="4"
                  />
                </label>
              </div>

              {status === "error" && (
                <div className="contactError" role="alert">
                  {errorMessage}
                </div>
              )}

              <div className="contactFormFooter">
                <p>
                  AsBuiltFlow is currently an interactive prototype. Submitting
                  this form does not create an account or commit your company to
                  anything.
                </p>

                <button
                  type="submit"
                  className="contactPrimaryButton"
                  disabled={status === "submitting"}
                >
                  {status === "submitting"
                    ? "Sending..."
                    : isDemoRequest
                      ? "Request Demo"
                      : "Send Message"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}