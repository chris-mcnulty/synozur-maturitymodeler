import { AdminTable } from '../AdminTable';

export default function AdminTableExample() {
  const models = [
    { id: 1, name: "AI Maturity", slug: "ai-maturity", version: "1.0.0", status: "published" },
    { id: 2, name: "Digital Transformation", slug: "digital-transform", version: "2.1.0", status: "published" },
    { id: 3, name: "Data Governance", slug: "data-gov", version: "1.0.0", status: "draft" },
  ];

  const results = [
    { id: 1, date: "2025-01-15", userName: "Alex Chen", company: "Contoso", modelName: "AI Maturity", score: 348 },
    { id: 2, date: "2025-01-14", userName: "Sarah Smith", company: "Acme Corp", modelName: "Digital Transform", score: 425 },
    { id: 3, date: "2025-01-13", userName: "Mike Johnson", company: "Tech Inc", modelName: "AI Maturity", score: 280 },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Models Table</h3>
        <AdminTable type="models" data={models} />
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Results Table</h3>
        <AdminTable type="results" data={results} />
      </div>
    </div>
  );
}
