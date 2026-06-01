/**
 * Global FAQs — Boat Bros official policy and FAQ content.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export function getFaqById(id: string): FaqItem | undefined {
  return faqs.find((f) => f.id === id);
}

export const faqs: FaqItem[] = [
  {
    id: "cancellation-policy",
    question: "What is your cancellation policy?",
    answer:
      "We ask all customers to acknowledge and review our current cancellation policy. Free cancellations until 30 days before the booking start time. 50% refund for cancellations between 15–30 days before the booking start time. Cancellations within 14 days of the booking start time are non-refundable.",
  },
  {
    id: "bad-weather",
    question: "What happens if there is bad weather?",
    answer:
      "Our approach to unfavorable weather conditions is one of flexibility. Please be aware that unfavorable weather does not equate to overcast skies, a slight dip in temperature, or a bit of drizzle. We're eager to provide you with an enjoyable experience, rain or shine, as long as conditions are safe. Many of our clients plan their outings well in advance, gathering friends and preparing supplies. Over the years, we've observed that some of the most memorable experiences occur when there's a bit of rain. As the saying goes in Texas, \"If you don't like the weather, just wait five minutes and it'll change.\" So, even if a light shower occurs, it's often followed by a burst of sunshine! We hold the authority to cancel any boat trip if conditions are deemed unsafe or uncomfortable, such as temperatures falling below 55°F or wind speeds exceeding 20 mph.",
  },
  {
    id: "tipping-captain",
    question: "Tipping the captain",
    answer:
      "We have a minimum auto gratuity of 20% for all rentals. You can always add more if you feel your captain went above and beyond. If you feel for any reason your captain did not meet 20% expectations, please send a detailed explanation to info@boatbrosatx.com.",
  },
  {
    id: "tip-on-card",
    question: "Can I leave a tip on the card?",
    answer:
      "Yes, you can leave a tip for your captain on the card you have on file.",
  },
  {
    id: "split-payment",
    question: "Can we split the payment?",
    answer:
      "We can split your payment in 2 but not more than that. You can always use Venmo or a similar app amongst your group to settle up.",
  },
  {
    id: "gas",
    question: "Do we have to pay for gas?",
    answer: "Nope. Gas is included in the price of the boat.",
  },
  {
    id: "minimum-booking",
    question: "Is there a minimum booking timeframe?",
    answer:
      "We have 3 hour minimums depending on the day and boat.",
  },
  {
    id: "multi-day-rental",
    question: "Can we rent a boat for multiple days and leave it at our lake house or on the water?",
    answer:
      "No, we do not allow the boats to stay on the water overnight. However, we will work with you to provide you a boat for the days and times needed.",
  },
  {
    id: "drive-boat",
    question: "Can we drive the boat ourselves?",
    answer:
      "Unfortunately Boat Bros doesn't allow boats to be taken out without our captains.",
  },
  {
    id: "pets",
    question: "Can we bring dogs/pets?",
    answer:
      "Yes you can bring your pets on your private boat rentals but please don't let them on the seats as their nails can tear the leather seats. There is also a required $40 pet fee. We do not allow pets on our public boat tours as a courtesy to other guests.",
  },
  {
    id: "bring-food-drink",
    question: "Can I bring anything to eat or drink on the boat?",
    answer:
      "Yes you can bring anything you would like to eat or drink. We do ask that you don't bring red wine. Glass and styrofoam are prohibited on Lake Austin.",
  },
  {
    id: "where-meet-park",
    question: "Where do we meet you and/or park?",
    answer:
      "For Lake Austin boat rentals: Loop 360 Boat Ramp, 5019 N Capital of Texas Hwy. It is a public boat ramp and not an office. We will have a team down at the dock ready and waiting for you. If you cannot locate us for any reason please give us a call and we can direct you in the right direction. There will be a pay booth when you arrive at Loop 360 Boat Ramp where you pay $5 per person CASH ONLY walk-in fee. Once you've paid you'll walk towards the boat ramp/dock where your boat will be waiting for you.",
  },
  {
    id: "ice",
    question: "Do you provide ice?",
    answer:
      "No, we do not provide ice but we do provide an empty cooler. We can provide ice for an additional charge.",
  },
  {
    id: "tube-pontoon",
    question: "Can we tube from a pontoon boat?",
    answer:
      "No, we do not allow tubing, skiing, or wakeboarding from pontoons. We do allow tubing and water sports on our Axis A24 wake surf boat.",
  },
  {
    id: "kid-life-vests",
    question: "Do you provide infant/kid life vests?",
    answer:
      "Yes we have kid life vests of different sizes. However, if you have one that you know fits your kid we recommend you bring it. All children under 13 must wear their life vests while on the boat.",
  },
  {
    id: "what-do-on-lake",
    question: "What do people do on the lake?",
    answer:
      "There is plenty to do and see on Lake Austin. Lake Austin is a 26 mile long lake which offers a great scenic cruise. There is also a \"party\" cove where boats tie up together and enjoy the lake and swim. There are restaurants located on the lake such as Hula Hut, County Line BBQ and Ski Shores.",
  },
  {
    id: "swim",
    question: "Can you swim on the lake?",
    answer: "Yes!!!! You can definitely swim in Lake Austin.",
  },
  {
    id: "pick-up-different-location",
    question: "Can you pick us up from a different location?",
    answer:
      "If you have a boat with one of our drivers we can work with you. Sometimes the drive to your special pick up location will cut into your rental time depending on the day/time. Call us for more information.",
  },
  {
    id: "fish",
    question: "Can I fish off the boat?",
    answer: "If you bring a fishing pole you can fish!",
  },
  {
    id: "more-than-14",
    question: "What are the options if I have more than 14 people?",
    answer:
      "We can always do a double boat party based on your party size and needs.",
  },
  {
    id: "grill",
    question: "Is there a grill on the boat?",
    answer:
      "No we do not provide grills on the boat and sorry but you can't bring your own either.",
  },
  {
    id: "pontoon-speed",
    question: "How fast do pontoon boats go?",
    answer:
      "We want all our pontoons to be operated at a safe speed, under 20 mph.",
  },
  {
    id: "radio",
    question: "Is there a radio on the boat?",
    answer:
      "Yes all our boats have radios and Bluetooth so you can easily connect your favorite playlist!",
  },
  {
    id: "lost-found",
    question: "Do you have a lost & found?",
    answer:
      "Contact our admin team at (512) 957-6197 for lost and found questions.",
  },
];
