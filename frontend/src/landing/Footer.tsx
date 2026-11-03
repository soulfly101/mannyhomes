import { BRAND, CONTACT, FOOTER_LINKS } from "./content";
import { ContactForm } from "./ContactForm";
import { sectionClass } from "./parts";
import type { Residence } from "./Residences";

export function Footer({ residences, enquiry }: { residences: Residence[]; enquiry: Residence | null }) {
  return (
    <footer id="contact" aria-labelledby="contact-title" className="scroll-mt-6 border-t border-border bg-card">
      <div className={`${sectionClass} grid gap-12 py-16 lg:grid-cols-[1fr_1fr_1.6fr]`}>
        <nav aria-label="Footer">
          <ul className="flex flex-col">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-flex min-h-11 items-center text-sm font-semibold uppercase tracking-[0.14em] hover:text-muted-foreground">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <a href={`mailto:${CONTACT.email}`} className="inline-flex min-h-11 items-center font-medium hover:underline">
            {CONTACT.email}
          </a>
          <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center font-medium hover:underline">
            {CONTACT.phone}
          </a>
        </div>
        <div>
          <h2 id="contact-title" className="font-serif text-2xl font-medium">
            {CONTACT.formTitle}
          </h2>
          <div className="mt-6">
            <ContactForm residences={residences} enquiry={enquiry} />
          </div>
        </div>
      </div>
      <div className={`${sectionClass} pb-10`}>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
