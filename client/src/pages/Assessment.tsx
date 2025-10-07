import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProgressBar } from "@/components/ProgressBar";
import { QuestionCard } from "@/components/QuestionCard";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Assessment() {
  //todo: remove mock functionality - fetch from API
  const questions = [
    {
      id: "q1",
      text: "Does leadership treat AI as a strategic priority?",
      answers: [
        { key: "a1", label: "Not at all - AI is not on our radar", score: 100 },
        { key: "a2", label: "Somewhat - We're exploring possibilities", score: 200 },
        { key: "a3", label: "We have a roadmap and executive sponsorship", score: 300 },
        { key: "a4", label: "AI is a strategic priority with dedicated resources", score: 400 },
        { key: "a5", label: "AI is core to our business strategy", score: 500 },
      ],
    },
    {
      id: "q2",
      text: "How mature is your data infrastructure?",
      answers: [
        { key: "a1", label: "Data is siloed and unstructured", score: 100 },
        { key: "a2", label: "Some centralization, inconsistent quality", score: 200 },
        { key: "a3", label: "Centralized with governance policies", score: 300 },
        { key: "a4", label: "Well-governed with real-time access", score: 400 },
        { key: "a5", label: "Enterprise-wide data platform", score: 500 },
      ],
    },
  ];

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleAnswer = (answerKey: string) => {
    setAnswers({ ...answers, [questions[currentQuestion].id]: answerKey });
  };

  const canGoNext = answers[questions[currentQuestion].id];
  const canGoPrev = currentQuestion > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <ProgressBar current={currentQuestion + 1} total={questions.length} />
          </div>

          <QuestionCard
            question={questions[currentQuestion].text}
            answers={questions[currentQuestion].answers}
            onAnswer={handleAnswer}
            selectedAnswer={answers[questions[currentQuestion].id]}
          />

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
              disabled={!canGoPrev}
              data-testid="button-previous"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button
              onClick={() => setCurrentQuestion(currentQuestion + 1)}
              disabled={!canGoNext}
              data-testid="button-next"
            >
              {currentQuestion === questions.length - 1 ? "Complete" : "Next"}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
