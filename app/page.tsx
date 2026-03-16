import { Hero } from "@/components/home/hero";
import { Experience } from "@/components/home/experience";
import { Projects } from "@/components/home/projects";
import { WritingPreview } from "@/components/home/writing-preview";
import { ContactSection } from "@/components/home/contact-section";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Experience />
      <Projects />
      <WritingPreview />
      <ContactSection />
    </>
  );
}
