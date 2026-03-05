import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/content/brand";
import { ContactForm } from "@/components/site/ContactForm";
import { Phone, Mail, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact | Lake Austin Boat Rentals",
  description:
    "Contact Boat Bros for Lake Austin boat rentals. Pontoon, wake surf, sunset cruise. Phone, email, Austin TX.",
  keywords: ["Lake Austin boat rentals", "contact boat rental Lake Austin", "Boat Bros Austin TX"],
  openGraph: {
    title: "Contact | Lake Austin Boat Rentals | Boat Bros",
    description: "Get in touch for Lake Austin boat rentals. Phone, email, address.",
  },
};

const address = `${brand.address.line1}, ${brand.address.city}, ${brand.address.state} ${brand.address.zip}`;
const mapQuery = encodeURIComponent(address);
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

const contactItems = [
  {
    label: "Phone",
    value: brand.phone,
    href: `tel:${brand.phoneTel}`,
    icon: Phone,
    description: "Call us anytime",
  },
  {
    label: "Email",
    value: brand.email,
    href: `mailto:${brand.email}`,
    icon: Mail,
    description: "We reply within a few hours",
  },
  {
    label: "Address & hours",
    value: address,
    href: mapUrl,
    icon: MapPin,
    description: brand.hours,
    external: true,
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero strip */}
      <section
        className="relative overflow-hidden bg-brand-dark px-5 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20"
        aria-labelledby="contact-heading"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-secondary/10" />
        <div className="container-narrow relative z-10 mx-auto text-center">
          <h1
            id="contact-heading"
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Get in touch
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-white/90 sm:text-xl">
            Call, email, or send a message. We&apos;re here to help with bookings and questions.
          </p>
          <p className="mt-3">
            <Link
              href="/location"
              className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded"
            >
              View our location, map & hours →
            </Link>
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="section-padding bg-brand-bg/50">
        <div className="container-narrow mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
            {/* Contact cards */}
            <div className="flex flex-col gap-4 sm:gap-5">
              {contactItems.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className="group flex items-start gap-4 rounded-2xl border border-white bg-white p-5 shadow-soft transition-all duration-200 hover:border-brand-primary/20 hover:shadow-soft-lg sm:p-6"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary transition-colors group-hover:bg-brand-primary/25">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
                        {item.label}
                      </span>
                      <span className="mt-1 block font-medium text-brand-dark group-hover:text-brand-primary">
                        {item.value}
                      </span>
                      {item.description && (
                        <span className="mt-0.5 block text-sm text-brand-muted">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Form card */}
            <div className="rounded-2xl border border-brand-dark/5 bg-white p-6 shadow-soft-lg sm:p-8 lg:shadow-premium">
              <h2 className="text-xl font-semibold text-brand-dark sm:text-2xl">
                Send a message
              </h2>
              <p className="mt-1 text-sm text-brand-muted">
                Fill out the form and we&apos;ll get back to you soon.
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
