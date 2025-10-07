import { ScoreCard } from '../ScoreCard';

export default function ScoreCardExample() {
  const dimensions = [
    { key: "strategy", label: "Strategy & Leadership", score: 350 },
    { key: "data", label: "Data & Infrastructure", score: 320 },
    { key: "talent", label: "Talent & Culture", score: 380 },
    { key: "technology", label: "Technology & Tools", score: 340 },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <ScoreCard
        overallScore={348}
        label="Operational"
        dimensions={dimensions}
        industryMean={315}
      />
    </div>
  );
}
