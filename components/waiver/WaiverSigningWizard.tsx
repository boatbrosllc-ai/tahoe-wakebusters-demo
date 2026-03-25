"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Stepper, type StepperStep } from "./Stepper";
import { SignaturePad } from "./SignaturePad";
import { TermsAccept } from "./TermsAccept";
import type { WaiverValidateResponse } from "@/lib/waiver/types";
import { cn } from "@/lib/utils";

const STEPS: StepperStep[] = [
  { id: "info", label: "Your information" },
  { id: "terms", label: "Terms & agreement" },
  { id: "sign", label: "Sign" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaiverSigningWizardProps {
  data: WaiverValidateResponse;
  token?: string;
  onSuccess?: () => void;
}

export function WaiverSigningWizard({ data, token: tokenProp, onSuccess }: WaiverSigningWizardProps) {
  const [step, setStep] = useState(0);
  const [signer, setSigner] = useState({
    name: "",
    email: "",
    phone: "",
    dob: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Field-level errors for step 0 (info) */
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; phone?: string; dob?: string }>({});
  /** Step 1: terms validation (scroll + agree) */
  const [step1TermsError, setStep1TermsError] = useState<string | null>(null);
  /** Step 1: initials validation */
  const [step1InitialsError, setStep1InitialsError] = useState<string | null>(null);
  /** Step 2: signature/typed name validation message */
  const [step2Error, setStep2Error] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const dobRef = useRef<HTMLInputElement>(null);
  const firstInitialRef = useRef<HTMLInputElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);

  const { template, bookingSummary } = data;
  const clausesWithInitials = template.clauses.filter((c) => c.requiresInitials);
  const requirePhone = template.requiredFields.phone;
  const requireDob = template.requiredFields.dob;
  const sigMode = template.signature.mode;
  const requireTypedSig = template.signature.requireTypedName;
  /** Typed-name field shown for type-only, draw+typed, or both (optional typed when not required). */
  const showTypedField =
    sigMode === "type" || sigMode === "both" || (sigMode === "draw" && requireTypedSig);

  const canProceedFromInfo =
    signer.name.trim().length > 0 &&
    signer.email.trim().length > 0 &&
    EMAIL_REGEX.test(signer.email.trim()) &&
    (!requirePhone || signer.phone.trim().length > 0) &&
    (!requireDob || signer.dob.trim().length > 0);
  const canProceedFromTerms =
    termsAccepted &&
    (clausesWithInitials.length === 0 ||
      clausesWithInitials.every((c) => (initials[c.id] ?? "").trim().length > 0));
  const canProceedFromSign =
    sigMode === "type"
      ? typedName.trim().length > 0
      : !!signatureDataUrl && (!requireTypedSig || typedName.trim().length > 0);

  /** Disable Next until all required fields for the current step are valid; allow click on step 0/1 to show validation errors. */
  const nextDisabled =
    submitting ||
    (step === 0 && !canProceedFromInfo) ||
    (step === 1 && !canProceedFromTerms) ||
    (step === 2 && !canProceedFromSign);

  /** Validate step 0 and return first error field id for focus. */
  function validateStep0(): keyof typeof fieldErrors | null {
    const err: typeof fieldErrors = {};
    if (!signer.name.trim()) err.name = "Full name is required.";
    if (!signer.email.trim()) err.email = "Email is required.";
    else if (!EMAIL_REGEX.test(signer.email.trim())) err.email = "Please enter a valid email address.";
    if (requirePhone && !signer.phone.trim()) err.phone = "Phone number is required.";
    if (requireDob && !signer.dob.trim()) err.dob = "Date of birth is required.";
    setFieldErrors(err);
    if (err.name) return "name";
    if (err.email) return "email";
    if (err.phone) return "phone";
    if (err.dob) return "dob";
    return null;
  }

  const handleNext = useCallback(async () => {
    setError(null);
    setStep1TermsError(null);
    setStep1InitialsError(null);
    setStep2Error(null);

    if (step === 0) {
      const first = validateStep0();
      if (first) {
        const refMap = { name: nameRef, email: emailRef, phone: phoneRef, dob: dobRef } as const;
        refMap[first].current?.focus();
        stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      setFieldErrors({});
    }

    if (step === 1) {
      if (!termsAccepted) {
        setStep1TermsError("Please scroll to the bottom of the terms and check the box to agree.");
        stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      setStep1TermsError(null);
      const missingInitials = clausesWithInitials.filter((c) => !(initials[c.id] ?? "").trim());
      if (missingInitials.length > 0) {
        setStep1InitialsError(`Please initial ${missingInitials.length === 1 ? "this statement" : "all statements"} above.`);
        firstInitialRef.current?.focus();
        stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      setStep1InitialsError(null);
    }

    if (step === 2) {
      if (sigMode === "type") {
        if (!typedName.trim()) {
          setStep2Error("Please type your full name to sign.");
          stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      } else {
        if (!signatureDataUrl) {
          setStep2Error("Please sign in the box above before submitting.");
          stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (requireTypedSig && !typedName.trim()) {
          setStep2Error("Please type your full name to confirm your signature.");
          stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }

    const isLastStep = step === STEPS.length - 1;
    if (isLastStep) {
      setSubmitting(true);
      try {
        const token = tokenProp ?? "";
        const groupToken = data.isGroupSigning && data.groupToken ? data.groupToken : undefined;
        const submitSigner: {
          name: string;
          email: string;
          phone?: string;
          dob?: string;
        } = {
          name: signer.name.trim(),
          email: signer.email.trim(),
          ...(signer.phone.trim() ? { phone: signer.phone.trim() } : {}),
          ...(signer.dob.trim() ? { dob: signer.dob.trim() } : {}),
        };
        const submitBody: Record<string, unknown> = {
          ...(groupToken ? { groupToken } : { token }),
          signer: submitSigner,
          initials,
        };
        if (sigMode !== "type" && signatureDataUrl) {
          submitBody.signatureDataUrl = signatureDataUrl;
        }
        if (typedName.trim()) {
          submitBody.typedName = typedName.trim();
        }

        const res = await fetch("/api/waiver/signing/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitBody),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Something went wrong. Please try again.");
          setSubmitting(false);
          stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        onSuccess?.();
        window.location.href = "/waiver/sign/success";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error. Please check your connection and try again.");
        setSubmitting(false);
        stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [
    step,
    signer,
    termsAccepted,
    initials,
    clausesWithInitials,
    signatureDataUrl,
    typedName,
    sigMode,
    requireTypedSig,
    data.isGroupSigning,
    data.groupToken,
    tokenProp,
    onSuccess,
    requirePhone,
    requireDob,
  ]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
    setError(null);
    setStep1TermsError(null);
    setStep1InitialsError(null);
    setStep2Error(null);
    setFieldErrors({});
  }, []);

  const inputClass =
    "w-full rounded-xl border border-brand-dark/20 px-4 py-3 text-base text-brand-dark placeholder:text-brand-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[48px] touch-manipulation";
  const labelClass = "block text-sm font-medium text-brand-dark mb-1.5";

  return (
    <div className="max-w-lg mx-auto w-full min-w-0">
      <h1 className="text-lg sm:text-xl font-bold text-brand-dark mb-2 pr-1 leading-tight">{template.title}</h1>
      <Stepper
        steps={STEPS}
        currentStepIndex={step}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={step === STEPS.length - 1 ? (submitting ? "Submitting…" : "Submit") : "Continue"}
        nextDisabled={nextDisabled || submitting}
        nextLoading={submitting}
      >
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium" role="alert">
            {error}
          </div>
        )}

        {/* Step 0: Booking summary + Your information */}
        {step === 0 && (
          <div ref={stepContentRef} className="space-y-4 min-w-0 overflow-hidden">
            <div className="rounded-xl bg-brand-bg/50 border border-brand-dark/10 px-4 py-3 text-sm text-brand-dark">
              <p className="font-medium text-brand-dark">{bookingSummary.experienceName}</p>
              <p className="text-brand-muted">{bookingSummary.tripDate}{bookingSummary.startTime ? ` · ${[bookingSummary.startTime, bookingSummary.endTime].filter(Boolean).join(" – ")}` : ""}{bookingSummary.partySize != null ? ` · ${bookingSummary.partySize} guests` : ""}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="waiver-name" className={labelClass}>Full name <span className="text-red-600" aria-hidden>*</span></label>
                <input
                  ref={nameRef}
                  id="waiver-name"
                  type="text"
                  autoComplete="name"
                  value={signer.name}
                  onChange={(e) => { setSigner((s) => ({ ...s, name: e.target.value })); setFieldErrors((prev) => (prev.name ? { ...prev, name: undefined } : prev)); }}
                  onBlur={() => { if (!signer.name.trim()) setFieldErrors((prev) => ({ ...prev, name: "Full name is required." })); }}
                  className={cn(inputClass, fieldErrors.name && "border-red-500 focus:border-red-500 focus:ring-red-500/20")}
                  placeholder="Your full name"
                  aria-invalid={fieldErrors.name ? "true" : "false"}
                  aria-describedby={fieldErrors.name ? "waiver-name-error" : undefined}
                />
                {fieldErrors.name && <p id="waiver-name-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">{fieldErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="waiver-email" className={labelClass}>Email <span className="text-red-600" aria-hidden>*</span></label>
                <input
                  ref={emailRef}
                  id="waiver-email"
                  type="email"
                  autoComplete="email"
                  value={signer.email}
                  onChange={(e) => { setSigner((s) => ({ ...s, email: e.target.value })); setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev)); }}
                  onBlur={() => {
                    if (!signer.email.trim()) setFieldErrors((prev) => ({ ...prev, email: "Email is required." }));
                    else if (!EMAIL_REGEX.test(signer.email.trim())) setFieldErrors((prev) => ({ ...prev, email: "Please enter a valid email address." }));
                  }}
                  className={cn(inputClass, fieldErrors.email && "border-red-500 focus:border-red-500 focus:ring-red-500/20")}
                  placeholder="you@example.com"
                  aria-invalid={fieldErrors.email ? "true" : "false"}
                  aria-describedby={fieldErrors.email ? "waiver-email-error" : undefined}
                />
                {fieldErrors.email && <p id="waiver-email-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">{fieldErrors.email}</p>}
              </div>
              {requirePhone && (
                <div>
                  <label htmlFor="waiver-phone" className={labelClass}>
                    Phone <span className="text-red-600" aria-hidden>*</span>
                  </label>
                  <input
                    ref={phoneRef}
                    id="waiver-phone"
                    type="tel"
                    autoComplete="tel"
                    value={signer.phone}
                    onChange={(e) => { setSigner((s) => ({ ...s, phone: e.target.value })); setFieldErrors((prev) => (prev.phone ? { ...prev, phone: undefined } : prev)); }}
                    onBlur={() => { if (!signer.phone.trim()) setFieldErrors((prev) => ({ ...prev, phone: "Phone number is required." })); }}
                    className={cn(inputClass, fieldErrors.phone && "border-red-500 focus:border-red-500 focus:ring-red-500/20")}
                    placeholder="(555) 123-4567"
                    aria-invalid={fieldErrors.phone ? "true" : "false"}
                    aria-describedby={fieldErrors.phone ? "waiver-phone-error" : undefined}
                  />
                  {fieldErrors.phone && <p id="waiver-phone-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">{fieldErrors.phone}</p>}
                </div>
              )}
              {requireDob && (
                <div className="min-w-0 w-full">
                  <label htmlFor="waiver-dob" className={labelClass}>
                    Date of birth <span className="text-red-600" aria-hidden>*</span>
                  </label>
                  <input
                    ref={dobRef}
                    id="waiver-dob"
                    type="date"
                    value={signer.dob}
                    onChange={(e) => { setSigner((s) => ({ ...s, dob: e.target.value })); setFieldErrors((prev) => (prev.dob ? { ...prev, dob: undefined } : prev)); }}
                    onBlur={() => { if (!signer.dob.trim()) setFieldErrors((prev) => ({ ...prev, dob: "Date of birth is required." })); }}
                    className={cn(inputClass, "bg-white text-brand-dark [color-scheme:light] w-full max-w-full min-w-0 box-border", fieldErrors.dob && "border-red-500 focus:border-red-500 focus:ring-red-500/20")}
                    aria-label="Date of birth"
                    aria-invalid={fieldErrors.dob ? "true" : "false"}
                    aria-describedby={fieldErrors.dob ? "waiver-dob-error" : undefined}
                  />
                  {fieldErrors.dob && <p id="waiver-dob-error" className="mt-1 text-sm text-red-600 font-medium" role="alert">{fieldErrors.dob}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Terms + acknowledgements + single agreement checkbox */}
        {step === 1 && (
          <div ref={stepContentRef} className="space-y-4">
            {step1InitialsError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium" role="alert">
                {step1InitialsError}
              </div>
            )}
            <TermsAccept
              termsHtml={template.termsHtml}
              onAcceptChange={(accepted) => { setTermsAccepted(accepted); if (accepted) setStep1TermsError(null); }}
              requiredScrollToBottom
              error={step1TermsError}
              className="terms-step"
            />
            {clausesWithInitials.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-brand-dark/10">
                <p className="text-sm font-medium text-brand-dark">Initial each statement <span className="text-red-600" aria-hidden>*</span></p>
                {clausesWithInitials.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-3 flex-wrap">
                    <label htmlFor={`waiver-initials-${c.id}`} className="text-sm text-brand-dark flex-1 min-w-0">{c.label}</label>
                    <input
                      ref={idx === 0 ? firstInitialRef : undefined}
                      id={`waiver-initials-${c.id}`}
                      type="text"
                      value={initials[c.id] ?? ""}
                      onChange={(e) => {
                        setInitials((prev) => ({ ...prev, [c.id]: e.target.value.slice(0, 4) }));
                        if (step1InitialsError) setStep1InitialsError(null);
                      }}
                      className={cn(
                        "w-20 rounded-xl border px-3 py-2.5 text-sm uppercase min-h-[48px] touch-manipulation",
                        step1InitialsError && !(initials[c.id] ?? "").trim() ? "border-amber-500" : "border-brand-dark/20"
                      )}
                      placeholder="XX"
                      maxLength={4}
                      aria-invalid={step1InitialsError && !(initials[c.id] ?? "").trim() ? "true" : "false"}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Signature + submit (no separate confirm step) */}
        {step === 2 && (
          <div ref={stepContentRef} className="space-y-4">
            {step2Error && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium" role="alert">
                {step2Error}
              </div>
            )}
            <SignaturePad
              mode={sigMode}
              onDataUrlChange={
                sigMode !== "type"
                  ? (url) => {
                      setSignatureDataUrl(url);
                      if (url) setStep2Error(null);
                    }
                  : undefined
              }
              typedName={typedName}
              onTypedNameChange={
                showTypedField
                  ? (v) => {
                      setTypedName(v);
                      if (v.trim()) setStep2Error(null);
                    }
                  : undefined
              }
              requireTypedName={sigMode === "type" ? true : requireTypedSig}
              signatureError={
                step2Error && sigMode !== "type" && !signatureDataUrl
                  ? "Please sign in the box above before submitting."
                  : null
              }
              typedNameError={
                step2Error &&
                (sigMode === "type" || requireTypedSig) &&
                !typedName.trim()
                  ? sigMode === "type"
                    ? "Please type your full name to sign."
                    : "Please type your full name to confirm your signature."
                  : null
              }
            />
            <p className="text-sm text-brand-muted">
              Submitting as <strong className="text-brand-dark">{signer.name}</strong> ({signer.email}).
            </p>
          </div>
        )}
      </Stepper>
    </div>
  );
}
