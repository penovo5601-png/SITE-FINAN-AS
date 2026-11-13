import type { Metadata } from "next";
import PortfolioBuilder from "@/components/PortfolioBuilder";
export const metadata: Metadata = { title: "Carteiras até 100k · só ações", description: "Três carteiras diversificadas da Zona Euro com rendibilidade esperada e justificação por ação, segundo o método do guia prático." };
export const dynamic = "force-dynamic";
export default function CarteirasPage() { return <PortfolioBuilder />; }
