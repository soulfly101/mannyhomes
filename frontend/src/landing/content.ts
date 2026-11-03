/**
 * Everything editable on the landing page: copy, photos, facilities, locations and contact details.
 * Photos go in frontend/public/photos/ and the hero video in frontend/public/videos/.
 *
 * ⚠️ PLACEHOLDERS — confirm or replace before launch:
 *   - photos: stock apartment photos from the first version of the app
 *   - FACILITIES: written to be typical, not confirmed for every building
 *   - LOCATIONS: map pins are approximate area centres; `nearby` is empty until the owner lists real places
 *   - CONTACT: phone and email are placeholders
 * Buildings, room types, prices and availability are NOT here: they come live from the admin inventory.
 */

export const BRAND = { name: "Altheo Homes", monogram: "A" };

export const PHOTOS = {
  hero: "/photos/hero.jpg",
  livingRoom: "/photos/two.jpg",
  bedroom: "/photos/one.jpg",
  lounge: "/photos/three.jpg",
};

export const HERO = {
  /** Owner's video of the buildings. Until the file exists, the poster photo is shown. */
  video: "/videos/hero.mp4",
  poster: PHOTOS.hero,
  eyebrow: "A new chapter in Accra living",
  title: "Your next chapter starts here.",
  subtitle: "Well-kept apartments across Altheo Homes' buildings. See what's free, then book and pay with Mobile Money.",
  cta: "Explore residences",
};

export const EXPERIENCE = {
  eyebrow: "The Altheo experience",
  lead: "A considered approach to renting, where everyday living is simple and well looked after.",
  photo: PHOTOS.livingRoom,
  points: [
    { title: "Prime locations", text: "Homes in growing, well-connected parts of Accra and its surroundings." },
    { title: "Book and pay with MoMo", text: "Reserve a room type online and pay deposits and bills by Mobile Money." },
    { title: "Repairs handled fast", text: "Report a problem from your phone and follow it until it's fixed." },
    { title: "Secure, managed compounds", text: "Professionally managed buildings with an on-site team." },
  ],
};

export const RESIDENCES = {
  eyebrow: "Find your residence",
  title: "Homes for every stage",
  lead: "Every room type across our buildings, with what's free right now.",
  /** Thumbnail per room type name (lower case); anything else uses `fallback`. */
  photos: {
    "1 bedroom": PHOTOS.bedroom,
    "2 bedroom": PHOTOS.livingRoom,
    "3 bedroom": PHOTOS.lounge,
  } as Record<string, string>,
  fallback: PHOTOS.livingRoom,
};

export const FACILITIES = {
  eyebrow: "Facilities",
  title: "Everyday living, elevated",
  lead: "Thoughtful spaces that bring comfort, balance and convenience to your daily routine.",
  // PLACEHOLDER: confirm which of these each building really has.
  items: [
    { title: "Secure compound", text: "Gated access and on-site staff.", photo: PHOTOS.hero },
    { title: "Bright living rooms", text: "Open, airy spaces with natural light.", photo: PHOTOS.livingRoom },
    { title: "Quiet bedrooms", text: "Calm rooms made for proper rest.", photo: PHOTOS.bedroom },
    { title: "Comfortable lounges", text: "Room to relax and receive guests.", photo: PHOTOS.lounge },
    { title: "Reliable water and power", text: "Planned for steady supply day to day.", photo: PHOTOS.livingRoom },
  ],
};

export type Place = { name: string; minutes: number };
export type AreaInfo = { lat: number; lng: number; nearby: Place[] };

export const LOCATION = {
  eyebrow: "Location",
  title: "Well-connected addresses",
  lead: "Close to everyday essentials, transport and the places you go most.",
  /**
   * Keyed by the building location exactly as entered in the admin (e.g. "Oyarifa").
   * PLACEHOLDER: approximate area centres; add real nearby places with travel times.
   */
  areas: {
    Oyarifa: { lat: 5.7728, lng: -0.1789, nearby: [] },
    Aburi: { lat: 5.8484, lng: -0.1746, nearby: [] },
  } as Record<string, AreaInfo>,
  /** Centre of the map when nothing is selected (Accra). */
  centre: { lat: 5.6037, lng: -0.187 },
};

export const GALLERY = {
  eyebrow: "Gallery",
  title: "Inside our homes",
  // PLACEHOLDER: replace with real photos of each room type.
  tabs: [
    { label: "1 bedroom", photos: [PHOTOS.bedroom, PHOTOS.livingRoom, PHOTOS.lounge] },
    { label: "2 bedroom", photos: [PHOTOS.livingRoom, PHOTOS.lounge, PHOTOS.bedroom] },
    { label: "3 bedroom", photos: [PHOTOS.lounge, PHOTOS.bedroom, PHOTOS.livingRoom] },
  ],
};

export const CALL_TO_ACTION = {
  eyebrow: "Ready for what's next?",
  title: "Interested in a residence?",
  lead: "Speak with our team to learn more about availability and pricing, or to arrange a viewing.",
  button: "Book a viewing",
  photo: PHOTOS.lounge,
};

export const CONTACT = {
  // PLACEHOLDER: real phone number and email.
  phone: "+233 00 000 0000",
  email: "hello@altheohomes.com",
  formTitle: "Have a question or want to arrange a viewing?",
};

export const FOOTER_LINKS = [
  { label: "Home", href: "#top" },
  { label: "Residences", href: "#residences" },
  { label: "Facilities", href: "#facilities" },
  { label: "Location", href: "#location" },
  { label: "Contact", href: "#contact" },
];
