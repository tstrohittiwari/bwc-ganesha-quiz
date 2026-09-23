import { TOTAL_QUESTIONS, tierForIndex } from "@/lib/game-config";

export default function Ladder({ currentIndex }: { currentIndex: number }) {
  const rungs = Array.from({ length: TOTAL_QUESTIONS }, (_, i) => i).reverse();
  return (
    <ol className="ladder" aria-label="Progress">
      {rungs.map((i) => (
        <li
          key={i}
          className={`rung tier-${tierForIndex(i).difficulty} ${
            i === currentIndex ? "rung-current" : i < currentIndex ? "rung-done" : ""
          }`}
        >
          <span>{i + 1}</span>
        </li>
      ))}
    </ol>
  );
}
