import { BRAND, CONTACT, FOOTER_LINKS } from "./content";
import { ContactForm } from "./ContactForm";
import { sectionClass } from "./parts";
import type { Residence } from "./Residences";

/** Simple line drawing of a row of buildings (drawn for Altheo, no external asset). */
function Skyline() {
  return (
    <svg viewBox="0 0 1200 120" className="h-auto w-full text-foreground/35" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 119h1200" />
      <path d="M20 119V58h90v61M35 58V40h60v18M45 70h12v12H45zm28 0h12v12H73zM45 94h12v12H45zm28 0h12v12H73z" />
      <path d="M130 119V30l55-18 55 18v89M150 44h20v16h-20zm40 0h20v16h-20zM150 74h20v16h-20zm40 0h20v16h-20zM176 98h18v21h-18z" />
      <path d="M260 119V66h70v53M270 76h14v14h-14zm28 0h14v14h-14zM270 98h14v14h-14zm28 0h14v14h-14z" />
      <path d="M350 119V20h80v99M362 32h16v14h-16zm28 0h16v14h-16zM362 58h16v14h-16zm28 0h16v14h-16zM362 84h16v14h-16zm28 0h16v14h-16zM380 106h20v13h-20z" />
      <path d="M450 119V52l40-20 40 20v67M466 62h14v14h-14zm34 0h14v14h-14zM466 88h14v14h-14zm34 0h14v14h-14z" />
      <path d="M550 119V38h110v81M565 50h18v14h-18zm32 0h18v14h-18zm32 0h18v14h-18zM565 76h18v14h-18zm32 0h18v14h-18zm32 0h18v14h-18zM595 100h22v19h-22z" />
      <path d="M680 119V60h60v59M692 72h14v14h-14zm24 0h14v14h-14zM692 96h14v14h-14zm24 0h14v14h-14z" />
      <path d="M760 119V24h70v95M772 36h14v14h-14zm24 0h14v14h-14zM772 60h14v14h-14zm24 0h14v14h-14zM772 84h14v14h-14zm24 0h14v14h-14z" />
      <path d="M850 119V48l50-22 50 22v71M866 60h16v16h-16zm36 0h16v16h-16zM866 88h16v16h-16zm36 0h16v16h-16zM886 104h16v15h-16z" />
      <path d="M970 119V70h80v49M982 80h16v14h-16zm30 0h16v14h-16zM982 102h16v14h-16zm30 0h16v14h-16z" />
      <path d="M1070 119V34h110v85M1084 46h18v14h-18zm32 0h18v14h-18zm32 0h18v14h-18zM1084 72h18v14h-18zm32 0h18v14h-18zm32 0h18v14h-18zM1114 96h22v23h-22z" />
    </svg>
  );
}

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
      <div className={`${sectionClass} pb-2`}>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </div>
      <Skyline />
    </footer>
  );
}
