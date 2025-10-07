import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface Answer {
  key: string;
  label: string;
  score: number;
}

interface QuestionCardProps {
  question: string;
  answers: Answer[];
  onAnswer: (answerKey: string) => void;
  selectedAnswer?: string;
}

export function QuestionCard({ question, answers, onAnswer, selectedAnswer }: QuestionCardProps) {
  const [selected, setSelected] = useState(selectedAnswer || "");

  const handleSelect = (value: string) => {
    setSelected(value);
    onAnswer(value);
  };

  return (
    <Card className="p-8 max-w-3xl mx-auto" data-testid="card-question">
      <h2 className="text-2xl font-bold mb-6" data-testid="text-question">
        {question}
      </h2>
      
      <RadioGroup value={selected} onValueChange={handleSelect}>
        <div className="space-y-3">
          {answers.map((answer) => (
            <div
              key={answer.key}
              className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all hover-elevate ${
                selected === answer.key
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
              data-testid={`answer-option-${answer.key}`}
            >
              <RadioGroupItem value={answer.key} id={answer.key} />
              <Label
                htmlFor={answer.key}
                className="flex-1 cursor-pointer font-medium"
              >
                {answer.label}
              </Label>
            </div>
          ))}
        </div>
      </RadioGroup>
    </Card>
  );
}
