import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    id: "1",
    question: "What is NovaLaunch?",
    answer: "A no-code platform for deploying tokens on Stellar",
  },
  {
    id: "2",
    question: "How much does it cost?",
    answer: "Transparent fees: X XLM deployment + Y XLM metadata",
  },
  {
    id: "3",
    question: "Do I need coding skills?",
    answer: "No, our interface handles everything",
  },
  {
    id: "4",
    question: "Is it secure?",
    answer: "Yes, audited smart contracts and secure wallet integration",
  },
  {
    id: "5",
    question: "What wallets are supported?",
    answer: "Freighter, Albedo, and other Stellar wallets",
  },
  {
    id: "6",
    question: "Can I customize my token?",
    answer: "Yes, full control over name, symbol, supply, and branding",
  },
];

/**
 * FAQ Accordion Component
 * 
 * Accessibility Features:
 * - role="region" on accordion (provided by Radix UI)
 * - aria-expanded on buttons (provided by Radix UI)
 * - aria-controls linking button to content (provided by Radix UI)
 * - Keyboard navigation: Tab, Enter, Space (provided by Radix UI)
 * - Focus visible styles
 * 
 * Features:
 * - Smooth 300ms ease animation for expand/collapse
 * - Chevron icon rotates 180° when expanded (300ms)
 * - Only one item open at a time (type="single")
 * - Active question highlighted in primary color
 * - Max-width (3xl) for readability
 * - Subtle borders between items
 */
export function FAQ() {
  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-center">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq) => (
            <AccordionItem
              key={faq.id}
              value={faq.id}
              className="border-b border-border transition-colors duration-300 [&[data-state=open]]:border-primary"
            >
              <AccordionTrigger className="hover:text-primary focus-visible:text-primary transition-colors duration-300 [&[data-state=open]]:text-primary">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}