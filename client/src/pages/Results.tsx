import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Download, Mail, ArrowLeft, ChevronRight, Users, Target, TrendingUp, Award, BookOpen, Calendar, Phone, ExternalLink, Lightbulb } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Result, Assessment, Model, Dimension, User, Question, Answer } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProfileGate } from "@/components/ProfileGate";
import { generateAssessmentPDF } from "@/services/pdfGenerator";
import { useToast } from "@/hooks/use-toast";

// Maturity level configurations (no emojis per design guidelines)
const maturityLevels = {
  'Nascent': {
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    description: 'You are at the beginning of your AI journey with significant growth potential.',
  },
  'Experimental': {
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    description: 'You are experimenting with AI and building momentum for transformation.',
  },
  'Operational': {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    description: 'You have good operational AI processes with clear opportunities to advance.',
  },
  'Strategic': {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    description: 'You have strong strategic foundations and are well-positioned for AI success.',
  },
  'Transformational': {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    description: 'You are at the forefront of AI transformation, leading the industry!',
  },
};

export default function Results() {
  const [, params] = useRoute("/results/:assessmentId");
  const [, setLocation] = useLocation();
  const assessmentId = params?.assessmentId;
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [pdfAction, setPdfAction] = useState<'download' | 'email' | null>(null);
  const { toast } = useToast();

  // Fetch user data
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  // Fetch result
  const { data: result, isLoading: resultLoading, error: resultError } = useQuery<Result>({
    queryKey: ['/api/results', assessmentId],
    enabled: !!assessmentId,
    retry: false,
  });

  // Fetch assessment to get model info
  const { data: assessment } = useQuery<Assessment>({
    queryKey: ['/api/assessments', assessmentId],
    enabled: !!assessmentId,
  });

  // Fetch model with dimensions
  const { data: model } = useQuery<Model & { dimensions: Dimension[] }>({
    queryKey: ['/api/models', 'by-id', assessment?.modelId],
    queryFn: async () => {
      const res = await fetch(`/api/models/by-id/${assessment?.modelId}`);
      return res.json();
    },
    enabled: !!assessment?.modelId,
  });

  // Fetch benchmark data
  const { data: benchmark } = useQuery<{ meanScore: number; sampleSize: number }>({
    queryKey: ['/api/benchmarks', assessment?.modelId],
    enabled: !!assessment?.modelId,
  });

  // Fetch user's responses with questions and answers for resource display
  const { data: responses = [] } = useQuery<Array<{
    questionId: string;
    answerId?: string;
    numericValue?: number;
    booleanValue?: boolean;
    textValue?: string;
  }>>({
    queryKey: ['/api/assessments', assessmentId, 'responses'],
    enabled: !!assessmentId,
  });

  // Fetch questions with answers to get improvement statements and resources
  const { data: questions = [] } = useQuery<Array<Question & { answers: Answer[] }>>({
    queryKey: ['/api/models', model?.slug, 'questions'],
    queryFn: async () => {
      if (!model?.slug) return [];
      const res = await fetch(`/api/models/${model.slug}/questions`);
      return res.json();
    },
    enabled: !!model?.slug,
  });


  if (resultLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground" data-testid="loading-results">Calculating your results...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (resultError || !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <h2 className="text-2xl font-bold mb-4" data-testid="text-error-title">Results Not Available</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-error-message">
              We couldn't find results for this assessment. This may happen if:
            </p>
            <ul className="text-sm text-muted-foreground text-left mb-8 space-y-2">
              <li>• The assessment is incomplete</li>
              <li>• Not all questions were answered</li>
              <li>• There was an error calculating results</li>
            </ul>
            <div className="space-y-4">
              <Button
                onClick={() => setLocation(`/assessment/${assessmentId}`)}
                className="w-full"
                data-testid="button-return-assessment"
              >
                Return to Assessment
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/')}
                className="w-full"
                data-testid="button-home"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground">Loading assessment details...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const maturityConfig = maturityLevels[result.label as keyof typeof maturityLevels] || maturityLevels['Nascent'];
  const dimensionScores = model.dimensions.map(dim => ({
    key: dim.key,
    label: dim.label,
    score: (result.dimensionScores as Record<string, number>)[dim.key] || 0,
  }));

  // Generate personalized recommendations based on score and responses
  const getRecommendations = () => {
    const recommendations = [];
    
    // Overall score-based recommendations
    if (result.overallScore >= 450) {
      recommendations.push({
        icon: <Award className="h-5 w-5" />,
        title: "Join the AI Leaders Alliance",
        description: "You're an AI leader! Consider joining Synozur's AI Alliance for peer benchmarking, innovation workshops, and thought leadership opportunities."
      });
    } else if (result.overallScore >= 400) {
      recommendations.push({
        icon: <Target className="h-5 w-5" />,
        title: "Scale Your AI Initiatives",
        description: "Focus on scaling successful pilots and establishing centers of excellence to drive enterprise-wide transformation."
      });
    } else if (result.overallScore >= 300) {
      recommendations.push({
        icon: <TrendingUp className="h-5 w-5" />,
        title: "Build Strategic Capabilities",
        description: "Develop a comprehensive AI strategy and invest in talent development to move from operational to strategic maturity."
      });
    } else if (result.overallScore >= 200) {
      recommendations.push({
        icon: <Users className="h-5 w-5" />,
        title: "Expand Your AI Experiments",
        description: "Identify high-value use cases and build cross-functional teams to accelerate your AI journey."
      });
    } else {
      recommendations.push({
        icon: <BookOpen className="h-5 w-5" />,
        title: "Start with AI Foundations",
        description: "Begin with education and awareness programs, then identify quick wins to build momentum and demonstrate value."
      });
    }

    // Add dimension-specific recommendations
    dimensionScores.forEach(dim => {
      if (dim.score < 300) {
        recommendations.push({
          icon: <ChevronRight className="h-5 w-5" />,
          title: `Improve ${dim.label}`,
          description: `Your ${dim.label} score is ${dim.score}. Focus on strengthening this area to improve overall maturity.`
        });
      }
    });

    return recommendations.slice(0, 3); // Show top 3 recommendations
  };

  // Get improvement statements and resources from user responses
  const getImprovementResources = () => {
    const resources: Array<{
      question: string;
      answer?: string;
      improvementStatement?: string;
      resourceTitle?: string;
      resourceLink?: string;
      resourceDescription?: string;
    }> = [];

    responses.forEach(response => {
      const question = questions.find(q => q.id === response.questionId);
      if (!question) return;

      let selectedAnswer: Answer | undefined;
      let answerText = '';

      if (response.answerId) {
        selectedAnswer = question.answers?.find(a => a.id === response.answerId);
        answerText = selectedAnswer?.text || '';
      } else if (response.numericValue !== undefined) {
        answerText = response.numericValue.toString();
      } else if (response.booleanValue !== undefined) {
        answerText = response.booleanValue ? 'True' : 'False';
      } else if (response.textValue) {
        answerText = response.textValue;
      }

      // Get improvement statement and resource from answer if available, else from question
      const improvementStatement = selectedAnswer?.improvementStatement || question.improvementStatement || undefined;
      const resourceTitle = selectedAnswer?.resourceTitle || question.resourceTitle || undefined;
      const resourceLink = selectedAnswer?.resourceLink || question.resourceLink || undefined;
      const resourceDescription = selectedAnswer?.resourceDescription || question.resourceDescription || undefined;

      if (improvementStatement || resourceLink) {
        resources.push({
          question: question.text,
          answer: answerText,
          improvementStatement,
          resourceTitle,
          resourceLink,
          resourceDescription,
        });
      }
    });

    return resources.slice(0, 5); // Show top 5 resources
  };

  const recommendations = getRecommendations();
  const improvementResources = getImprovementResources();

  // PDF download function using useCallback for stable reference
  const generateAndDownloadPDF = useCallback(() => {
    try {
      if (!model || !result) {
        toast({
          title: "Error",
          description: "Unable to generate PDF. Missing assessment data.",
          variant: "destructive"
        });
        return;
      }

      const pdf = generateAssessmentPDF({
        result,
        model,
        benchmark: benchmark || undefined,
        recommendations: recommendations.map(r => ({
          title: r.title,
          description: r.description
        })),
        improvementResources: improvementResources.slice(0, 3)
      });

      // Download the PDF
      pdf.save(`${model.name.replace(/\s+/g, '_')}_Assessment_Report.pdf`);
      
      toast({
        title: "Success",
        description: "Your PDF report has been downloaded successfully!"
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  }, [model, result, benchmark, recommendations, improvementResources, toast]);

  // Handle PDF/Email actions
  const handlePdfAction = useCallback((action: 'download' | 'email') => {
    setPdfAction(action);
    if (!user) {
      setShowProfileGate(true);
    } else {
      // User is logged in, proceed with action
      if (action === 'download') {
        generateAndDownloadPDF();
      } else {
        // TODO: Implement email sending
        toast({
          title: "Coming Soon",
          description: "Email delivery will be available soon. Please download the PDF for now.",
        });
      }
    }
  }, [user, generateAndDownloadPDF, toast]);

  const handleProfileComplete = useCallback((profile: any) => {
    setShowProfileGate(false);
    // After profile is complete, proceed with the action
    if (pdfAction === 'download') {
      generateAndDownloadPDF();
    } else if (pdfAction === 'email') {
      // TODO: Implement email sending with profile.email
      toast({
        title: "Coming Soon",
        description: `Email delivery to ${profile.email} will be available soon. Please download the PDF for now.`,
      });
    }
  }, [pdfAction, generateAndDownloadPDF, toast]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Assessments
          </Button>

          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4" data-testid="text-title">
              Your {model.name} Results
            </h1>
            <p className="text-xl text-muted-foreground">
              Assessment completed on {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Overall Score Card */}
          <Card className="p-8 mb-8">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center md:text-left">
                <div className="mb-6">
                  <div className="text-7xl font-bold text-primary mb-2" data-testid="text-score">
                    {result.overallScore}
                  </div>
                  <div className="text-lg text-muted-foreground">out of 500</div>
                </div>
                
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${maturityConfig.bgColor} ${maturityConfig.borderColor} border`}>
                  <span className={`text-xl font-bold ${maturityConfig.color}`}>
                    {result.label}
                  </span>
                </div>
                
                <p className="mt-4 text-muted-foreground">
                  {maturityConfig.description}
                </p>
              </div>

              <div>
                {benchmark && (
                  <div className="bg-muted/30 rounded-lg p-6">
                    <h3 className="font-semibold mb-4">Industry Benchmark</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Your Score</span>
                          <span className="font-medium">{result.overallScore}</span>
                        </div>
                        <Progress value={(result.overallScore / 500) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Industry Average</span>
                          <span className="font-medium">{benchmark.meanScore}</span>
                        </div>
                        <Progress value={(benchmark.meanScore / 500) * 100} className="h-2" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on {benchmark.sampleSize} organizations
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Dimension Breakdown */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-center">Dimension Breakdown</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dimensionScores.map(dim => (
              <Card key={dim.key} className="p-6" data-testid={`card-dimension-${dim.key}`}>
                <h3 className="font-semibold mb-3">{dim.label}</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl font-bold text-primary">{dim.score}</span>
                  <span className="text-sm text-muted-foreground">/ 500</span>
                </div>
                <Progress value={(dim.score / 500) * 100} className="h-2" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Personalized Recommendations */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-center">Personalized Recommendations</h2>
          <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-6">
            {recommendations.map((rec, idx) => (
              <Card key={idx} className="p-6" data-testid={`card-recommendation-${idx}`}>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {rec.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{rec.title}</h3>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Improvement Resources */}
      {improvementResources.length > 0 && (
        <section className="py-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="text-3xl font-bold mb-8 text-center">Improvement Resources</h2>
            <div className="space-y-4">
              {improvementResources.map((resource, idx) => (
                <Card key={idx} className="p-6" data-testid={`card-resource-${idx}`}>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground">Question</h4>
                      <p className="text-sm">{resource.question}</p>
                    </div>
                    {resource.answer && (
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground">Your Answer</h4>
                        <p className="text-sm">{resource.answer}</p>
                      </div>
                    )}
                    {resource.improvementStatement && (
                      <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-lg">
                        <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-1">Improvement Recommendation</h4>
                          <p className="text-sm text-muted-foreground">{resource.improvementStatement}</p>
                        </div>
                      </div>
                    )}
                    {resource.resourceLink && (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 text-primary" />
                        <a
                          href={resource.resourceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                          data-testid={`link-resource-${idx}`}
                        >
                          {resource.resourceTitle || 'View Resource'}
                        </a>
                        {resource.resourceDescription && (
                          <span className="text-sm text-muted-foreground">- {resource.resourceDescription}</span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Actions Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <Card className="p-8 bg-primary/5">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">Get Your Full Report</h2>
              <p className="text-muted-foreground">
                Download your comprehensive PDF report with detailed insights and action plans
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => handlePdfAction('download')}
                data-testid="button-download-pdf"
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF Report
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => handlePdfAction('email')}
                data-testid="button-email-pdf"
              >
                <Mail className="mr-2 h-4 w-4" />
                Email Report
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary/5">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your AI Journey?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Connect with our AI experts to create a custom transformation roadmap
          </p>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Card className="p-4 hover-elevate">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold">Schedule a Workshop</h3>
            </Card>
            <Card className="p-4 hover-elevate">
              <BookOpen className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold">Learn More About AI</h3>
            </Card>
            <Card className="p-4 hover-elevate">
              <Phone className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold">Contact Our Experts</h3>
            </Card>
          </div>
          <Button
            size="lg"
            onClick={() => window.open('https://www.synozur.com', '_blank')}
            data-testid="button-contact"
          >
            Visit Synozur.com
          </Button>
        </div>
      </section>

      {/* Profile Gate Modal */}
      <Dialog open={showProfileGate} onOpenChange={setShowProfileGate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Your Profile to Get Your Report</DialogTitle>
            <DialogDescription>
              Please provide your information to receive your personalized PDF report
            </DialogDescription>
          </DialogHeader>
          <ProfileGate
            onComplete={handleProfileComplete}
          />
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}