import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ArchitectureFlow } from "@/components/ArchitectureFlow";
import { PipelineDemo } from "@/components/PipelineDemo";
import { PromptLibrary } from "@/components/PromptLibrary";
import { MermaidSection } from "@/components/MermaidSection";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ArchitectureFlow />
        <PipelineDemo />
        <PromptLibrary />
        <MermaidSection />
      </main>
      <Footer />
    </>
  );
}