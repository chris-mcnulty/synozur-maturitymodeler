import { ModelCard } from '../ModelCard';
import openingGraphic from '@assets/generated_images/Opening_graphic_AI_transformation_bf033f89.png';

export default function ModelCardExample() {
  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <ModelCard
        slug="ai-maturity"
        name="AI Maturity Assessment"
        description="Evaluate your organization's AI capabilities across strategy, data, technology, and culture dimensions."
        imageUrl={openingGraphic}
      />
      <ModelCard
        slug="digital-transformation"
        name="Digital Transformation"
        description="Measure your digital maturity and identify opportunities for modernization and innovation."
        imageUrl={openingGraphic}
      />
      <ModelCard
        slug="data-governance"
        name="Data Governance"
        description="Assess your data management practices and compliance readiness."
      />
    </div>
  );
}
