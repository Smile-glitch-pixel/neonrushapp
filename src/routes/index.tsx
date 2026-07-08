import { createFileRoute } from "@tanstack/react-router";
import NeonRush from "@/components/NeonRush";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEON RUSH — Arcade infini hypnotique" },
      {
        name: "description",
        content:
          "Un jeu d'arcade néon addictif : esquive, collecte, enchaîne des combos et bats ton meilleur score dans un tourbillon de particules.",
      },
      { property: "og:title", content: "NEON RUSH" },
      {
        property: "og:description",
        content: "Arcade infini néon avec combos, particules et bande-son réactive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <NeonRush />;
}
