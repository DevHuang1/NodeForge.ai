import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ArchitectureFlow } from "@/components/ArchitectureFlow";
import { PipelineDemo } from "@/components/PipelineDemo";
import { ReviewPanel } from "@/components/ReviewPanel";
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
        <ReviewPanel />
        <PromptLibrary />
        <MermaidSection />
      </main>
      <Footer />
    </>
  );
}