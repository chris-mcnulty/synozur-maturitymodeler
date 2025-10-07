import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface ModelCardProps {
  slug: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export function ModelCard({ slug, name, description, imageUrl }: ModelCardProps) {
  return (
    <Card className="overflow-hidden hover-elevate transition-all duration-200 p-0" data-testid={`card-model-${slug}`}>
      {imageUrl && (
        <div className="aspect-video w-full overflow-hidden">
          <img 
            src={imageUrl} 
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-6">
        <h3 className="text-xl font-bold mb-2" data-testid={`text-model-name-${slug}`}>
          {name}
        </h3>
        <p className="text-muted-foreground mb-4 line-clamp-2" data-testid={`text-model-description-${slug}`}>
          {description}
        </p>
        <Button className="w-full group" data-testid={`button-start-${slug}`}>
          Begin Assessment
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </Card>
  );
}
