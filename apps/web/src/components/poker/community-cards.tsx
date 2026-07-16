import type { CardViewModel } from "./playing-card";
import { PlayingCard } from "./playing-card";

export function CommunityCards({
  cards,
}: {
  readonly cards: readonly CardViewModel[];
}) {
  return (
    <section
      aria-label="Community cards"
      className="flex items-center justify-center gap-1 sm:gap-2"
    >
      {cards.map((card) => (
        <PlayingCard card={card} key={card.code} />
      ))}
      {Array.from({ length: Math.max(0, 5 - cards.length) }, (_, index) => (
        <div
          aria-hidden="true"
          className="aspect-[5/7] w-10 rounded-md border border-dashed border-white/20 sm:w-12 lg:w-14"
          key={`empty-${index}`}
        />
      ))}
    </section>
  );
}
