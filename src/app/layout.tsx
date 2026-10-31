import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Nav, { type NavVariant } from "@/components/Nav";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space",
  display: "swap",
});

const jb = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jb",
  display: "swap",
});

export const siteMode: "main" | "chart" = process.env.SITE_MODE === "chart" ? "chart" : "main";

export async function generateMetadata(): Promise<Metadata> {
  if (siteMode === "chart") {
    return {
      title: "ChartLens — Envia a foto do gráfico e recebe a expectativa (sobe ou desce)",
      description:
        "Visão computacional sobre fotografias e capturas de gráficos de ações: reconstrói a série de preços, mede tendência, R², pressão compradora/vendedora, suportes e resistências e devolve pontuação, confiança e probabilidade de subida.",
    };
  }
  return {
    title: "TickerLab — Avaliação técnica de ações de todos os mercados",
    description:
      "Motor de análise técnica para mais de 61.000 ações de 34 mercados: RSI, MACD, ADX, Bollinger, suportes/resistências e expectativa de subida ou descida.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const variant: NavVariant = siteMode === "chart" ? "chart" : "main";
  return (
    <html lang="pt" className={`${space.variable} ${jb.variable}`}>
      <body className="min-h-screen antialiased">
        <Nav variant={variant} />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-ink-800/80 bg-ink-950/80 py-8">
          <div className="mx-auto max-w-[1400px] px-4 text-xs leading-relaxed text-ink-400">
            <p className="mb-2 font-semibold text-ink-300">
              {variant === "chart"
                ? "ChartLens · leitura técnica de fotografias de gráficos — parte do motor TickerLab"
                : "TickerLab · motor de avaliação técnica de ações"}
            </p>
            <p>
              Todas as leituras são geradas automaticamente a partir de indicadores técnicos sobre dados de mercado
              diferidos e não constituem recomendação de investimento, aconselhamento financeiro ou oferta. O capital
              está em risco. Confirma sempre com múltiplas fontes antes de decidir.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
