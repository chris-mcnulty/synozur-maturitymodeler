import { QuestionCard } from '../QuestionCard';

export default function QuestionCardExample() {
  const answers = [
    { key: "a1", label: "Not at all - AI is not on our radar", score: 100 },
    { key: "a2", label: "Somewhat - We're exploring possibilities", score: 200 },
    { key: "a3", label: "We have a roadmap and executive sponsorship", score: 300 },
    { key: "a4", label: "AI is a strategic priority with dedicated resources", score: 400 },
    { key: "a5", label: "AI is core to our business strategy", score: 500 },
  ];

  return (
    <div className="p-8">
      <QuestionCard
        question="Does leadership treat AI as a strategic priority?"
        answers={answers}
        onAnswer={(key) => console.log('Selected:', key)}
      />
    </div>
  );
}
