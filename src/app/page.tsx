import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Thesis from "@/components/Thesis";
import Experience from "@/components/Experience";
import Skills from "@/components/Skills";
import PersonalDetails from "@/components/PersonalDetails";
import AskResume from "@/components/AskResume";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import JourneyOverlay from "@/components/journey/JourneyOverlay";
import { skillGroups } from "@content/resume";

// Build the marquee from résumé skills — starred ones get emphasis.
const MARQUEE = skillGroups.flatMap((g) => [
  ...(g.star ?? []).map((label) => ({ label, star: true })),
  ...g.skills.map((label) => ({ label })),
]);

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Marquee items={MARQUEE} />
      <Thesis />
      <Experience />
      <Skills />
      <PersonalDetails />
      <AskResume />
      <Contact />
      <Footer />
      {/* Immersive 3D walking-trail résumé. Renders on top of the classic
          site above (kept in the DOM for SEO + the "skip to classic" path). */}
      <JourneyOverlay />
    </main>
  );
}
