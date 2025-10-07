import { ResultsHistory } from '../ResultsHistory';

export default function ResultsHistoryExample() {
  const results = [
    { id: "1", modelName: "AI Maturity Assessment", date: "January 15, 2025", score: 348, label: "Operational", change: 28 },
    { id: "2", modelName: "Digital Transformation", date: "January 10, 2025", score: 425, label: "Strategic", change: -15 },
    { id: "3", modelName: "AI Maturity Assessment", date: "December 1, 2024", score: 320, label: "Operational" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Assessment History</h2>
      <ResultsHistory results={results} />
    </div>
  );
}
