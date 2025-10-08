import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

interface Answer {
  key: string;
  label: string;
  score: number;
}

interface QuestionCardProps {
  question: string;
  questionType?: 'multiple_choice' | 'numeric';
  answers?: Answer[];
  minValue?: number;
  maxValue?: number;
  unit?: string;
  onAnswer: (value: string) => void;
  selectedAnswer?: string;
}

export function QuestionCard({ 
  question, 
  questionType = 'multiple_choice',
  answers = [], 
  minValue,
  maxValue,
  unit,
  onAnswer, 
  selectedAnswer 
}: QuestionCardProps) {
  const [selected, setSelected] = useState(selectedAnswer || "");
  const [numericValue, setNumericValue] = useState(selectedAnswer || "");
  const [numericError, setNumericError] = useState<string>("");

  useEffect(() => {
    if (questionType === 'numeric' && selectedAnswer) {
      setNumericValue(selectedAnswer);
    } else if (questionType === 'multiple_choice' && selectedAnswer) {
      setSelected(selectedAnswer);
    }
  }, [selectedAnswer, questionType]);

  const handleSelect = (value: string) => {
    setSelected(value);
    onAnswer(value);
  };

  const handleNumericChange = (value: string) => {
    setNumericValue(value);
    setNumericError("");
    
    // Validate the numeric value
    const numValue = parseFloat(value);
    if (value === "") {
      setNumericError("Please enter a value");
      return;
    }
    if (isNaN(numValue)) {
      setNumericError("Please enter a valid number");
      return;
    }
    if (minValue !== undefined && numValue < minValue) {
      setNumericError(`Value must be at least ${minValue}`);
      return;
    }
    if (maxValue !== undefined && numValue > maxValue) {
      setNumericError(`Value must be at most ${maxValue}`);
      return;
    }
    
    // If valid, call onAnswer
    onAnswer(value);
  };

  return (
    <Card className="p-8 max-w-3xl mx-auto" data-testid="card-question">
      <h2 className="text-2xl font-bold mb-6" data-testid="text-question">
        {question}
      </h2>
      
      {questionType === 'multiple_choice' ? (
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
      ) : (
        <div className="space-y-4">
          {minValue !== undefined && maxValue !== undefined && (
            <p className="text-sm text-muted-foreground">
              Enter a value between {minValue} and {maxValue}{unit ? ` ${unit}` : ''}
            </p>
          )}
          
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              value={numericValue}
              onChange={(e) => handleNumericChange(e.target.value)}
              onBlur={(e) => handleNumericChange(e.target.value)}
              min={minValue}
              max={maxValue}
              placeholder={`Enter value${unit ? ` in ${unit}` : ''}`}
              className={`max-w-xs ${numericError ? 'border-destructive' : ''}`}
              data-testid="input-numeric-answer"
            />
            {unit && (
              <span className="text-muted-foreground">{unit}</span>
            )}
          </div>
          
          {numericError && (
            <p className="text-sm text-destructive">{numericError}</p>
          )}
          
          {minValue === 0 && maxValue === 800 && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">M365 Adoption Score Guide:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Communication: 0-100 points</li>
                <li>• Meetings: 0-100 points</li>
                <li>• Content collaboration: 0-100 points</li>
                <li>• Teamwork: 0-100 points</li>
                <li>• Mobility: 0-100 points</li>
                <li>• Endpoint analytics: 0-100 points</li>
                <li>• Network connectivity: 0-100 points</li>
                <li>• Microsoft 365 Apps Health: 0-100 points</li>
              </ul>
              <p className="text-sm font-medium mt-2">Total: 0-800 points</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}