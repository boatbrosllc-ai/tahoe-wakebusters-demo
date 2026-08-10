"use client";

import { motion } from "framer-motion";

type PaymentLogo = {
  id: string;
  name: string;
  /** Soft border tint matching brand (Stripe Payment Element style) */
  border: string;
  /** Hover border (slightly deeper tint) */
  borderHover: string;
  src?: string;
  /** Text-only mark when no logo asset (Pay Later / Credit) */
  wordmark?: {
    primary: string;
    secondary?: string;
    color: string;
  };
};

const PAYMENT_LOGOS: PaymentLogo[] = [
  {
    id: "visa",
    name: "Visa",
    border: "#B8C0E8",
    borderHover: "#9FA8DA",
    src: "/logos/payments/visa.svg",
  },
  {
    id: "mastercard",
    name: "Mastercard",
    border: "#F5B8BE",
    borderHover: "#EF9A9A",
    src: "/logos/payments/mastercard.svg",
  },
  {
    id: "amex",
    name: "American Express",
    border: "#A8D0F0",
    borderHover: "#90CAF9",
    src: "/logos/payments/amex.svg",
  },
  {
    id: "apple-pay",
    name: "Apple Pay",
    border: "#C5CED6",
    borderHover: "#B0BEC5",
    src: "/logos/payments/apple-pay.svg",
  },
  {
    id: "google-pay",
    name: "Google Pay",
    border: "#A8D0F0",
    borderHover: "#90CAF9",
    src: "/logos/payments/google-pay.svg",
  },
  {
    id: "link",
    name: "Link",
    border: "#9AEBBC",
    borderHover: "#00D66F",
    src: "/logos/payments/link.png",
  },
  {
    id: "cash-app-pay",
    name: "Cash App Pay",
    border: "#A8D5B0",
    borderHover: "#81C784",
    src: "/logos/payments/cashapp.svg",
  },
  {
    id: "amazon-pay",
    name: "Amazon Pay",
    border: "#FFD09A",
    borderHover: "#FFCC80",
    src: "/logos/payments/amazon-pay.svg",
  },
  {
    id: "paypal",
    name: "PayPal",
    border: "#C5CED6",
    borderHover: "#B0BEC5",
    src: "/logos/payments/paypal.svg",
  },
  {
    id: "venmo",
    name: "Venmo",
    border: "#9AD4F5",
    borderHover: "#81D4FA",
    src: "/logos/payments/venmo.svg",
  },
  {
    id: "affirm",
    name: "Affirm",
    border: "#B8C0E8",
    borderHover: "#9FA8DA",
    src: "/logos/payments/affirm.svg",
  },
  {
    id: "klarna",
    name: "Klarna",
    border: "#F0A8C0",
    borderHover: "#F48FB1",
    src: "/logos/payments/klarna.svg",
  },
  {
    id: "afterpay",
    name: "Afterpay / Clearpay",
    border: "#9AD5CF",
    borderHover: "#80CBC4",
    src: "/logos/payments/afterpay.svg",
  },
  {
    id: "bank",
    name: "Bank account",
    border: "#C5CED6",
    borderHover: "#B0BEC5",
    src: "/logos/payments/bank.svg",
  },
];

export function PaymentOptions() {
  return (
    <section className="section-padding bg-white" aria-labelledby="payment-options-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <h2
          id="payment-options-heading"
          className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-3 sm:mb-4"
        >
          Flexible ways to pay
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-12 leading-relaxed">
          We&apos;re here to help you get on the water, not make checkout harder. That&apos;s why we went out
          of our way to offer as many payment options as we can: cards, bank, wallets, and buy now, pay later.
          Book your Cabo charter the way that works for you.
        </p>

        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto list-none">
          {PAYMENT_LOGOS.map((option, i) => (
            <motion.li
              key={option.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20px" }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
              whileHover={{ y: -4, scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className="group"
            >
              <motion.div
                className="flex h-[72px] sm:h-[80px] flex-col items-center justify-center gap-0.5 rounded-xl bg-white px-3 sm:px-4 shadow-sm transition-[border-color,box-shadow] duration-200 group-hover:shadow-md"
                style={{ border: `2.5px solid ${option.border}` }}
                whileHover={{ borderColor: option.borderHover }}
                title={option.name}
              >
                <span className="sr-only">{option.name}</span>
                {option.src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local brand SVGs; avoid next/image SVG config
                  <img
                    src={option.src}
                    alt=""
                    width={140}
                    height={40}
                    className="h-9 sm:h-10 w-auto max-w-[85%] object-contain transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                ) : option.wordmark ? (
                  <span className="flex flex-col items-center justify-center text-center leading-tight">
                    <span
                      className="text-[15px] sm:text-base font-bold tracking-tight"
                      style={{ color: option.wordmark.color }}
                    >
                      {option.wordmark.primary}
                    </span>
                    {option.wordmark.secondary ? (
                      <span
                        className="mt-0.5 text-[10px] sm:text-[11px] font-medium tracking-wide opacity-70"
                        style={{ color: option.wordmark.color }}
                      >
                        {option.wordmark.secondary}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </motion.div>
            </motion.li>
          ))}
        </ul>

        <p className="mt-8 sm:mt-10 text-sm sm:text-base text-brand-muted text-center max-w-2xl mx-auto">
          Options roll into checkout over time — availability can vary by trip.
        </p>
      </div>
    </section>
  );
}
