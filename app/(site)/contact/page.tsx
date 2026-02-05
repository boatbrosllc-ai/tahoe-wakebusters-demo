import type { Metadata } from "next";
import { brand } from "@/content/brand";
import { ContactForm } from "@/components/site/ContactForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact | Lake Travis & Lake Austin Boat Rentals",
  description: `Get in touch with ${brand.companyName}. Lake Travis and Lake Austin boat rentals, Austin TX. Phone, email, address.`,
};

const address = `${brand.address.line1}, ${brand.address.city}, ${brand.address.state} ${brand.address.zip}`;
const mapQuery = encodeURIComponent(address);
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

export default function ContactPage() {
  return (
    <div className="section-padding bg-white">
      <div className="container-narrow px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-dark mb-2">
          Contact us
        </h1>
        <p className="text-lg text-brand-muted mb-10">
          Call, email, or drop a message. We&apos;re here to help with bookings and questions.
        </p>
        <div className="grid lg:grid-cols-2 gap-10">
          <div>
            <h2 className="text-xl font-semibold text-brand-dark mb-4">Get in touch</h2>
            <ul className="space-y-4 text-brand-muted">
              <li>
                <span className="font-medium text-brand-dark block mb-1">Phone</span>
                <a
                  href={`tel:${brand.phoneTel}`}
                  className="text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                >
                  {brand.phone}
                </a>
              </li>
              <li>
                <span className="font-medium text-brand-dark block mb-1">Email</span>
                <a
                  href={`mailto:${brand.email}`}
                  className="text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                >
                  {brand.email}
                </a>
              </li>
              <li>
                <span className="font-medium text-brand-dark block mb-1">Address</span>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
                >
                  {address}
                </a>
                <p className="text-sm text-brand-muted mt-1">{brand.hours}</p>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-brand-dark/10 bg-brand-bg/80 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-brand-dark mb-4">Send a message</h2>
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
