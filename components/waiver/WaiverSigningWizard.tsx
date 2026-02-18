"use client";

import React, { useState, useCallback } from "react";
import { Stepper, type StepperStep } from "./Stepper";
import { SignaturePad } from "./SignaturePad";
import { TermsAccept } from "./TermsAccept";
import type { WaiverValidateResponse } from "@/lib/waiver/types";

const STEPS: StepperStep[] = [
  { id: "info", label: "Your information" },
  { id: "terms", label: "Terms & agreement" },
  { id: "sign", label: "Sign" },
];

interface WaiverSigningWizardProps {
  data: WaiverValidateResponse;
  onSuccess?: () => void;
}

export function WaiverSigningWizard({ data, onSuccess }: WaiverSigningWizardProps) {
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

  const { template, bookingSummary } = data;
  const clausesWithInitials = template.clauses.filter((c) => c.requiresInitials);

  const canProceedFromInfo =
    signer.name.trim() && signer.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer.email);
  const canProceedFromTerms =
    termsAccepted &&
    (clausesWithInitials.length === 0 ||
      clausesWithInitials.every((c) => (initials[c.id] ?? "").trim().length > 0));
  const requireTyped = template.signature.requireTypedName;
  const canProceedFromSign =
    signatureDataUrl && (!requireTyped || typedName.trim().length > 0);

  const nextDisabled =
    (step === 0 && !canProceedFromInfo) ||
    (step === 1 && !canProceedFromTerms) ||
    (step === 2 && !canProceedFromSign);

  const handleNext = useCallback(async () => {
    const isLastStep = step === STEPS.length - 1;
    if (isLastStep) {
      setError(null);
      setSubmitting(true);
      try {
        const url = typeof window !== "undefined" ? window.location.href : "";
        const params = typeof window !== "undefined" ? new URL(url).searchParams : null;
        const token = params?.get("token") ?? "";
        const groupToken = data.isGroupSigning && data.groupToken ? data.groupToken : undefined;
        const res = await fetch("/api/waiver/signing/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(groupToken ? { groupToken } : { token }),
            signer: {
              name: signer.name.trim(),
              email: signer.email.trim(),
              phone: signer.phone.trim() || undefined,
              dob: signer.dob.trim() || undefined,
            },
            initials,
            signatureDataUrl: signatureDataUrl ?? "",
            typedName: typedName.trim() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Something went wrong");
          setSubmitting(false);
          return;
        }
        onSuccess?.();
        window.location.href = "/waiver/sign/success";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setSubmitting(false);
      }
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setError(null);
  }, [
    step,
    signer,
    initials,
    signatureDataUrl,
    typedName,
    data.isGroupSigning,
    data.groupToken,
    onSuccess,
  ]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
    setError(null);
  }, []);

  const inputClass =
    "w-full rounded-xl border border-brand-dark/20 px-4 py-3 text-base text-brand-dark placeholder:text-brand-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[48px] touch-manipulation";
  const labelClass = "block text-sm font-medium text-brand-dark mb-1.5";

  return (
    <div className="max-w-lg mx-auto w-full">
      <h1 className="text-xl font-bold text-brand-dark mb-1">{template.title}</h1>
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
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-800 text-sm" role="alert">
            {error}
          </div>
        )}

        {/* Step 0: Booking summary + Your information */}
        {step === 0 && (
          <div className="space-y-4 min-w-0 overflow-hidden">
            <div className="rounded-xl bg-brand-bg/50 border border-brand-dark/10 px-4 py-3 text-sm text-brand-dark">
              <p className="font-medium text-brand-dark">{bookingSummary.experienceName}</p>
              <p className="text-brand-muted">{bookingSummary.tripDate}{bookingSummary.startTime ? ` · ${[bookingSummary.startTime, bookingSummary.endTime].filter(Boolean).join(" – ")}` : ""}{bookingSummary.partySize != null ? ` · ${bookingSummary.partySize} guests` : ""}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="waiver-name" className={labelClass}>Full name *</label>
                <input
                  id="waiver-name"
                  type="text"
                  autoComplete="name"
                  value={signer.name}
                  onChange={(e) => setSigner((s) => ({ ...s, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label htmlFor="waiver-email" className={labelClass}>Email *</label>
                <input
                  id="waiver-email"
                  type="email"
                  autoComplete="email"
                  value={signer.email}
                  onChange={(e) => setSigner((s) => ({ ...s, email: e.target.value }))}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              {template.requiredFields.phone && (
                <div>
                  <label htmlFor="waiver-phone" className={labelClass}>Phone</label>
                  <input
                    id="waiver-phone"
                    type="tel"
                    autoComplete="tel"
                    value={signer.phone}
                    onChange={(e) => setSigner((s) => ({ ...s, phone: e.target.value }))}
                    className={inputClass}
                    placeholder="(555) 123-4567"
                  />
                </div>
              )}
              {template.requiredFields.dob && (
                <div className="min-w-0 w-full">
                  <label htmlFor="waiver-dob" className={labelClass}>Date of birth</label>
                  <input
                    id="waiver-dob"
                    type="date"
                    value={signer.dob}
                    onChange={(e) => setSigner((s) => ({ ...s, dob: e.target.value }))}
                    className={`${inputClass} bg-white text-brand-dark [color-scheme:light] w-full max-w-full min-w-0 box-border`}
                    aria-label="Date of birth"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Terms + acknowledgements + single agreement checkbox */}
        {step === 1 && (
          <div className="space-y-4">
            <TermsAccept
              termsHtml={template.termsHtml}
              onAcceptChange={setTermsAccepted}
              requiredScrollToBottom
              className="terms-step"
            />
            {clausesWithInitials.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-brand-dark/10">
                <p className="text-sm font-medium text-brand-dark">Initial each statement:</p>
                {clausesWithInitials.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 flex-wrap">
                    <label htmlFor={`waiver-initials-${c.id}`} className="text-sm text-brand-dark flex-1 min-w-0">{c.label}</label>
                    <input
                      id={`waiver-initials-${c.id}`}
                      type="text"
                      value={initials[c.id] ?? ""}
                      onChange={(e) =>
                        setInitials((prev) => ({ ...prev, [c.id]: e.target.value.slice(0, 4) }))
                      }
                      className="w-20 rounded-xl border border-brand-dark/20 px-3 py-2.5 text-sm uppercase min-h-[48px] touch-manipulation"
                      placeholder="XX"
                      maxLength={4}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Signature + submit (no separate confirm step) */}
        {step === 2 && (
          <div className="space-y-4">
            <SignaturePad
              onDataUrlChange={setSignatureDataUrl}
              typedName={typedName}
              onTypedNameChange={setTypedName}
              requireTypedName={template.signature.requireTypedName}
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
