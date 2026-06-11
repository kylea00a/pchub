import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Overview } from "@/components/Overview";
import { HowItWorks } from "@/components/HowItWorks";
import { HostAgent } from "@/components/HostAgent";
import { SpecsDetected } from "@/components/SpecsDetected";
import { ForRenters } from "@/components/ForRenters";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Overview />
        <HowItWorks />
        <HostAgent />
        <SpecsDetected />
        <ForRenters />
      </main>
      <Footer />
    </>
  );
}
