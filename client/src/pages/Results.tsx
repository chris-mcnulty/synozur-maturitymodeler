import { useState, useCallback, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Download, Mail, ArrowLeft, ChevronRight, Users, Target, TrendingUp, Award, BookOpen, Calendar, Phone, ExternalLink, Lightbulb, Share2, Sparkles, Lock, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Result, Assessment, Model, Dimension, User, Question, Answer } from "@shared/schema";
import { SiLinkedin, SiX, SiThreads, SiFacebook, SiInstagram, SiBluesky } from "react-icons/si";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProfileGate } from "@/components/ProfileGate";
import { generateAssessmentPDF } from "@/services/pdfGenerator";
import { useToast } from "@/hooks/use-toast";
import { MarkdownContent } from "@/components/MarkdownContent";

// Color palette for maturity levels (no emojis per design guidelines)
const levelColors = [
  { color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  { color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
  { color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20' },
  { color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
  { color: 'text-green-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20' },
  { color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
  { color: 'text-pink-500', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/20' },
];

// Get maturity level from custom scale or default
function getMaturityLevel(score: number, maturityScale?: Array<{
  id: string;
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
}>) {
  const defaultScale = [
    { id: '1', name: 'Nascent', description: 'Beginning AI journey', minScore: 100, maxScore: 199 },
    { id: '2', name: 'Experimental', description: 'Experimenting with AI', minScore: 200, maxScore: 299 },
    { id: '3', name: 'Operational', description: 'Operational AI processes', minScore: 300, maxScore: 399 },
    { id: '4', name: 'Strategic', description: 'Strategic AI foundations', minScore: 400, maxScore: 449 },
    { id: '5', name: 'Transformational', description: 'Leading AI transformation', minScore: 450, maxScore: 500 },
  ];
  
  const scale = maturityScale || defaultScale;
  const level = scale.find(l => score >= l.minScore && score <= l.maxScore) || scale[0];
  const levelIndex = scale.findIndex(l => l.id === level.id);
  const colors = levelColors[levelIndex % levelColors.length];
  
  return {
    ...level,
    ...colors,
  };
}

export default function Results() {
  const [, params] = useRoute("/results/:assessmentId");
  const [, setLocation] = useLocation();
  const assessmentId = params?.assessmentId;
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [pdfAction, setPdfAction] = useState<'download' | 'email' | null>(null);
  const [maturitySummary, setMaturitySummary] = useState<string>('');
  const [recommendationsSummary, setRecommendationsSummary] = useState<string>('');
  const [aiContentLoading, setAiContentLoading] = useState(false);
  const [aiContentReady, setAiContentReady] = useState(false);
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

  // Fetch the assessment owner's profile (for AI generation context)
  // Note: This may return null if not authenticated or not authorized
  const { data: assessmentOwner } = useQuery<User | null>({
    queryKey: ['/api/users', assessment?.userId],
    queryFn: async () => {
      if (!assessment?.userId) return null;
      const res = await fetch(`/api/users/${assessment.userId}`);
      // Return null for 401/403 (not authenticated/authorized) or 404 (not found)
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!assessment?.userId,
    retry: false, // Don't retry on auth failures
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
  const { data: benchmarkData } = useQuery<{
    overall?: { meanScore: number; dimensionScores: Record<string, number>; sampleSize: number };
    segments: Array<{
      type: string;
      label: string;
      meanScore: number;
      dimensionScores: Record<string, number>;
      sampleSize: number;
    }>;
  }>({
    queryKey: ['/api/benchmarks', assessment?.modelId],
    enabled: !!assessment?.modelId,
  });
  
  // Extract overall benchmark for easier access
  const benchmark = benchmarkData?.overall;

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

  // Update page title when model loads
  useEffect(() => {
    if (model) {
      document.title = `${model.name} Results | The Synozur Alliance`;
    }
  }, [model]);

  // Define all hooks before any conditional returns to ensure consistent hook order
  const overallScore = result?.overallScore || 0;
  
  // Memoize recommendations to ensure consistent hook order
  const recommendations = useMemo(() => {
    if (!result || !model) return [];
    const recs = [];
    
    // Overall score-based recommendations
    if (result.overallScore >= 450) {
      recs.push({
        icon: <Award className="h-5 w-5" />,
        title: "Industry Leader",
        description: "You're at the forefront of AI transformation. Focus on innovation and sharing best practices.",
      });
    } else if (result.overallScore >= 350) {
      recs.push({
        icon: <TrendingUp className="h-5 w-5" />,
        title: "Strong Foundation",
        description: "You have excellent AI capabilities. Focus on optimization and scaling successful initiatives.",
      });
    } else if (result.overallScore >= 250) {
      recs.push({
        icon: <Target className="h-5 w-5" />,
        title: "Building Momentum",
        description: "You're making progress. Prioritize high-impact areas and build systematic processes.",
      });
    } else {
      recs.push({
        icon: <Lightbulb className="h-5 w-5" />,
        title: "Getting Started",
        description: "Begin with pilot projects and focus on building foundational AI capabilities.",
      });
    }

    // Dimension-specific recommendations
    if (model?.dimensions && result?.dimensionScores) {
      model.dimensions.forEach(dim => {
        const score = (result.dimensionScores as Record<string, number>)[dim.key] || 0;
        if (score < 60) {
          recs.push({
            icon: <Target className="h-5 w-5" />,
            title: `Improve ${dim.label}`,
            description: `Focus on strengthening your ${dim.label.toLowerCase()} capabilities to unlock greater AI value.`,
          });
        }
      });
    }

    return recs.slice(0, 3); // Return top 3 recommendations
  }, [result, model]);

  // Fetch AI-generated summaries when result and model are loaded
  useEffect(() => {
    const fetchAISummaries = async () => {
      if (!result || !model) return;

      setAiContentLoading(true);
      setAiContentReady(false);

      try {
        // Prepare dimension scores for AI
        // Build a comprehensive mapping that includes ALL dimension scores from the result
        const resultDimensionScores = result.dimensionScores as Record<string, number>;
        const dimensionScoresForAI: Record<string, { score: number; label: string }> = {};
        
        // First, map all dimensions from the model (with labels)
        model.dimensions.forEach(dim => {
          if (resultDimensionScores[dim.key] !== undefined) {
            dimensionScoresForAI[dim.key] = {
              score: resultDimensionScores[dim.key],
              label: dim.label
            };
          }
        });
        
        // Then, check for any dimension scores in the result that aren't in the model
        // This handles cases where the model structure has changed
        Object.entries(resultDimensionScores).forEach(([key, score]) => {
          if (!dimensionScoresForAI[key]) {
            const matchingDimension = model.dimensions.find(d => d.key === key);
            dimensionScoresForAI[key] = {
              score,
              label: matchingDimension?.label || `Dimension ${key}` // Fallback label
            };
            console.warn(`Dimension score found without matching model dimension: ${key}`);
          }
        });

        // Fetch maturity summary
        // IMPORTANT: Use proxy profile for proxy assessments, otherwise use assessment owner's profile
        let userContext: { industry?: string; companySize?: string; jobTitle?: string } | undefined;
        
        if (assessment?.isProxy) {
          // Use proxy profile data for AI context
          userContext = {
            industry: assessment.proxyIndustry || undefined,
            companySize: assessment.proxyCompanySize || undefined,
            jobTitle: assessment.proxyJobTitle || undefined
          };
        } else {
          // Use real user profile
          const profileForAI = assessmentOwner || user;
          userContext = profileForAI ? {
            industry: profileForAI.industry || undefined,
            companySize: profileForAI.companySize || undefined,
            jobTitle: profileForAI.jobTitle || undefined
          } : undefined;
        }
        
        const maturityResponse = await fetch('/api/ai/generate-maturity-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overallScore: result.overallScore,
            dimensionScores: dimensionScoresForAI,
            modelName: model.name,
            userContext
          })
        });

        if (maturityResponse.ok) {
          const { summary } = await maturityResponse.json();
          setMaturitySummary(summary);
        }

        // Fetch recommendations summary if recommendations exist
        if (recommendations.length > 0) {
          const recsResponse = await fetch('/api/ai/generate-recommendations-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recommendations: recommendations.map(r => ({
                title: r.title,
                description: r.description
              })),
              modelName: model.name,
              userContext // Use the same context determined above (proxy or real user)
            })
          });

          if (recsResponse.ok) {
            const { summary } = await recsResponse.json();
            setRecommendationsSummary(summary);
          }
        }
        
        // Mark AI content as ready
        setAiContentReady(true);
      } catch (error) {
        console.error('Error fetching AI summaries:', error);
        // Still mark as ready even on error
        setAiContentReady(true);
      } finally {
        setAiContentLoading(false);
      }
    };

    fetchAISummaries();
  }, [result, model, user, assessmentOwner, recommendations]);

  // Memoize improvement resources to ensure consistent hook order
  const improvementResources = useMemo(() => {
    if (!responses || !questions || responses.length === 0 || questions.length === 0) return [];
    
    const resources: Array<{
      question: string;
      answer: string;
      improvementStatement?: string;
      resourceTitle?: string;
      resourceLink?: string;
      resourceDescription?: string;
    }> = [];

    responses.forEach(response => {
      const question = questions.find(q => q.id === response.questionId);
      if (!question) return;

      const selectedAnswer = question.answers?.find(a => a.id === response.answerId);
      let answerText = 'N/A';
      
      if (selectedAnswer) {
        answerText = selectedAnswer.text;
      } else if (response.numericValue != null) {
        answerText = response.numericValue.toString();
      } else if (response.booleanValue != null) {
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
  }, [responses, questions]);

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

      // Use proxy profile data for proxy assessments, otherwise use real user profile
      let pdfUserContext;
      if (assessment?.isProxy) {
        pdfUserContext = {
          name: assessment.proxyName || undefined,
          company: assessment.proxyCompany || undefined,
          jobTitle: assessment.proxyJobTitle || undefined,
          industry: assessment.proxyIndustry || undefined,
          companySize: assessment.proxyCompanySize || undefined
        };
      } else {
        pdfUserContext = user ? {
          name: user.name || undefined,
          company: user.company || undefined,
          jobTitle: user.jobTitle || undefined,
          industry: user.industry || undefined,
          companySize: user.companySize || undefined
        } : undefined;
      }

      const pdf = generateAssessmentPDF({
        result,
        model,
        benchmark: benchmark || undefined,
        recommendations: recommendations.map(r => ({
          title: r.title,
          description: r.description
        })),
        improvementResources: improvementResources,
        maturitySummary,
        recommendationsSummary,
        userContext: pdfUserContext
      });

      // Download the PDF with unique filename format: [ModelName]-Report-[YYYY-MM-DD]-[UniqueID].pdf
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      const modelNameSlug = model.name.replace(/\s+/g, '-');
      // Generate a unique identifier using timestamp and random component
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      pdf.save(`${modelNameSlug}-Report-${today}-${uniqueId}.pdf`);
      
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
  }, [model, result, benchmark, recommendations, improvementResources, maturitySummary, recommendationsSummary, user, assessment, toast]);

  // Send PDF via email
  const sendPdfEmail = useCallback(async (recipientEmail: string, recipientName?: string) => {
    try {
      // Validate email address
      if (!recipientEmail || recipientEmail.trim() === '') {
        toast({
          title: "Email Required",
          description: "Please provide a valid email address to receive the report.",
          variant: "destructive"
        });
        return;
      }

      if (!model || !result) {
        toast({
          title: "Error",
          description: "Unable to generate PDF. Missing assessment data.",
          variant: "destructive"
        });
        return;
      }

      // Use proxy profile data for proxy assessments, otherwise use real user profile
      let pdfUserContext;
      if (assessment?.isProxy) {
        pdfUserContext = {
          name: assessment.proxyName || undefined,
          company: assessment.proxyCompany || undefined,
          jobTitle: assessment.proxyJobTitle || undefined,
          industry: assessment.proxyIndustry || undefined,
          companySize: assessment.proxyCompanySize || undefined
        };
      } else {
        pdfUserContext = user ? {
          name: user.name || undefined,
          company: user.company || undefined,
          jobTitle: user.jobTitle || undefined,
          industry: user.industry || undefined,
          companySize: user.companySize || undefined
        } : undefined;
      }

      // Generate PDF
      const pdf = generateAssessmentPDF({
        result,
        model,
        benchmark: benchmark || undefined,
        recommendations: recommendations.map(r => ({
          title: r.title,
          description: r.description
        })),
        improvementResources: improvementResources,
        maturitySummary,
        recommendationsSummary,
        userContext: pdfUserContext
      });

      // Convert PDF to base64 using Promise wrapper for proper error handling
      const pdfBlob = pdf.output('blob');
      const base64PDF = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string;
            const base64 = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix
            resolve(base64);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF file'));
        reader.readAsDataURL(pdfBlob);
      });

      // Send email via API
      const response = await fetch('/api/send-pdf-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfBase64: base64PDF,
          fileName: `${model.name.replace(/\s+/g, '-')}-Report-${new Date().toISOString().split('T')[0]}-${Date.now().toString(36) + Math.random().toString(36).substr(2, 5)}.pdf`,
          recipientEmail,
          recipientName,
          modelName: model.name,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.details || error.error || 'Failed to send email');
      }

      toast({
        title: "Email Sent!",
        description: `Your assessment report has been sent to ${recipientEmail}`,
      });
    } catch (error) {
      console.error('Error sending email:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send email. Please try again.";
      toast({
        title: "Email Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [model, result, benchmark, recommendations, improvementResources, maturitySummary, recommendationsSummary, user, assessment, toast]);

  // Handle PDF/Email actions
  const handlePdfAction = useCallback((action: 'download' | 'email') => {
    // Check if AI content is still loading
    if (aiContentLoading) {
      toast({
        title: "Please wait",
        description: "Report is being generated. This may take a few moments.",
        variant: "default"
      });
      return;
    }

    // Check if AI content is ready
    if (!aiContentReady) {
      toast({
        title: "Report not ready",
        description: "Please wait for the complete report to generate before downloading.",
        variant: "default"
      });
      return;
    }

    setPdfAction(action);
    if (!user) {
      setShowProfileGate(true);
    } else {
      // User is logged in, proceed with action
      if (action === 'download') {
        generateAndDownloadPDF();
      } else {
        // Send email to logged-in user
        sendPdfEmail(user.email || '', user.name || undefined);
      }
    }
  }, [user, generateAndDownloadPDF, sendPdfEmail, aiContentLoading, aiContentReady, toast]);

  const handleProfileComplete = useCallback((profile: any) => {
    setShowProfileGate(false);
    // After profile is complete, proceed with the action
    if (pdfAction === 'download') {
      generateAndDownloadPDF();
    } else if (pdfAction === 'email') {
      // Send email to the email from profile
      sendPdfEmail(profile.email, profile.name);
    }
  }, [pdfAction, generateAndDownloadPDF, sendPdfEmail]);

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

  // Parse maturity scale if it's a string (defensive handling)
  const parsedMaturityScale = model.maturityScale 
    ? (typeof model.maturityScale === 'string' 
        ? JSON.parse(model.maturityScale) 
        : model.maturityScale)
    : undefined;
  
  const maturityLevel = getMaturityLevel(result.overallScore, parsedMaturityScale);
  
  // Calculate max score from model's maturity scale (or default to 500 for legacy models)
  const maturityMaxScore = parsedMaturityScale && parsedMaturityScale.length > 0
    ? Math.max(...parsedMaturityScale.map((level: any) => level.maxScore))
    : 500;
  
  // For 100-point scale models, each dimension is scored independently on 0-100 scale
  // For legacy 500-point models, dimension scores also use the same max as overall
  const dimensionMaxScore = maturityMaxScore <= 100 ? 100 : maturityMaxScore;
  
  const dimensionScores = model.dimensions.map(dim => ({
    key: dim.key,
    label: dim.label,
    score: (result.dimensionScores as Record<string, number>)[dim.key] || 0,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-primary/5 to-background py-16 overflow-hidden">
        {model.imageUrl && (
          <div className="absolute inset-0 z-0">
            <img 
              src={model.imageUrl}
              alt={model.name}
              className="w-full h-full object-cover opacity-10"
            />
          </div>
        )}
        <div className="container relative z-10 mx-auto px-4 max-w-6xl">
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
              {assessment?.isProxy ? `${model.name} Results` : `Your ${model.name} Results`}
            </h1>
            <p className="text-xl text-muted-foreground">
              Assessment completed on {new Date().toLocaleDateString()}
            </p>
            
            {/* Display proxy profile information if this is a proxy assessment */}
            {assessment?.isProxy && (
              <div className="mt-6 inline-block">
                <Card className="p-4 bg-primary/5">
                  <div className="flex items-center gap-3 text-left">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-lg">
                        {assessment.proxyName?.charAt(0).toUpperCase() || 'P'}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold" data-testid="text-proxy-name">
                        {assessment.proxyName}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid="text-proxy-company">
                        {assessment.proxyCompany}
                        {assessment.proxyJobTitle && ` • ${assessment.proxyJobTitle}`}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Overall Score Card */}
          <Card className="p-8 mb-8">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center md:text-left">
                <div className="mb-6">
                  <div className="text-7xl font-bold text-primary mb-2" data-testid="text-score">
                    {result.overallScore}
                  </div>
                  <div className="text-lg text-muted-foreground">out of {maturityMaxScore}</div>
                </div>
                
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${maturityLevel.bgColor} ${maturityLevel.borderColor} border`}>
                  <span className={`text-xl font-bold ${maturityLevel.color}`}>
                    {maturityLevel.name}
                  </span>
                </div>
                
                <p className="mt-4 text-muted-foreground">
                  {maturityLevel.description}
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
                        <Progress value={(result.overallScore / maturityMaxScore) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Industry Average</span>
                          <span className="font-medium">{benchmark.meanScore}</span>
                        </div>
                        <Progress value={(benchmark.meanScore / maturityMaxScore) * 100} className="h-2" />
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

          {/* AI-Generated Maturity Summary */}
          {!user ? (
            <Card className="p-8 mb-8 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-2 text-primary">AI-Powered Insights</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a free account to unlock your personalized AI-powered executive summary
                  </p>
                  <Alert className="bg-background/50 border-primary/30 mb-4">
                    <Lock className="h-4 w-4 text-primary" />
                    <AlertDescription>
                      <p className="font-medium mb-2">With a free account, you'll receive:</p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span>Detailed analysis of your maturity level</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span>AI-generated insights tailored to your responses</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span>Strategic recommendations for improvement</span>
                        </li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => setLocation(`/auth?redirect=/results/${assessmentId}&claimAssessment=${assessmentId}`)} 
                      data-testid="button-signup-executive"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Create Free Account
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setLocation(`/auth?redirect=/results/${assessmentId}&claimAssessment=${assessmentId}`)} 
                      data-testid="button-login-executive"
                    >
                      Log In
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (aiContentLoading || maturitySummary) && (
            <Card className="p-8 mb-8">
              <h3 className="text-2xl font-bold mb-4 text-primary">Executive Summary</h3>
              {aiContentLoading && !maturitySummary ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing your assessment results...</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                    <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                  </div>
                </div>
              ) : (
                <MarkdownContent content={maturitySummary} className="text-muted-foreground prose prose-lg max-w-none" />
              )}
            </Card>
          )}
        </div>
      </section>

      {/* Dimension Breakdown */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-center text-foreground">Dimension Breakdown</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dimensionScores.map(dim => (
              <Card key={dim.key} className="p-6" data-testid={`card-dimension-${dim.key}`}>
                <h3 className="font-semibold mb-3">{dim.label}</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl font-bold text-primary">{dim.score}</span>
                  <span className="text-sm text-muted-foreground">/ {dimensionMaxScore}</span>
                </div>
                <Progress value={(dim.score / dimensionMaxScore) * 100} className="h-2" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Personalized Recommendations */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-center text-foreground">Strategic Recommendations</h2>
          
          {/* AI-Generated Recommendations Summary */}
          {!user ? (
            <Card className="p-6 mb-8 border-2 border-secondary/20 bg-gradient-to-br from-secondary/5 to-primary/5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-secondary/10">
                  <Target className="h-6 w-6 text-secondary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2 text-secondary">Your Transformation Roadmap</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a free account to unlock your personalized transformation roadmap with AI-powered strategic recommendations
                  </p>
                  <div className="flex gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={() => setLocation(`/auth?redirect=/results/${assessmentId}&claimAssessment=${assessmentId}`)} 
                      data-testid="button-signup-roadmap"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Create Free Account
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setLocation(`/auth?redirect=/results/${assessmentId}&claimAssessment=${assessmentId}`)} 
                      data-testid="button-login-roadmap"
                    >
                      Log In
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (aiContentLoading || recommendationsSummary) && (
            <Card className="p-6 mb-8 bg-background">
              <h3 className="text-lg font-semibold mb-4 text-primary">Your Transformation Roadmap</h3>
              {aiContentLoading && !recommendationsSummary ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Creating your transformation roadmap...</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                    <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                  </div>
                </div>
              ) : (
                <MarkdownContent content={recommendationsSummary} className="text-muted-foreground" />
              )}
            </Card>
          )}
          
          <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-6">
            {recommendations.map((rec, idx) => (
              <Card key={idx} className="p-6" data-testid={`card-recommendation-${idx}`}>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {rec.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{rec.title}</h3>
                    <p className="text-base text-muted-foreground">{rec.description}</p>
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
            <h2 className="text-3xl font-bold mb-8 text-center text-foreground">Improvement Resources</h2>
            <div className="space-y-4">
              {improvementResources.map((resource, idx) => (
                <Card key={idx} className="p-6" data-testid={`card-resource-${idx}`}>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-base text-muted-foreground">Question</h4>
                      <p className="text-base">{resource.question}</p>
                    </div>
                    {resource.answer && (
                      <div>
                        <h4 className="font-semibold text-base text-muted-foreground">Your Answer</h4>
                        <p className="text-base">{resource.answer}</p>
                      </div>
                    )}
                    {resource.improvementStatement && (
                      <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-lg">
                        <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-base mb-1">Improvement Recommendation</h4>
                          <p className="text-base text-muted-foreground">{resource.improvementStatement}</p>
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
                          className="text-base text-primary hover:underline"
                          data-testid={`link-resource-${idx}`}
                        >
                          {resource.resourceTitle || 'View Resource'}
                        </a>
                        {resource.resourceDescription && (
                          <span className="text-base text-muted-foreground">- {resource.resourceDescription}</span>
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
              <h2 className="text-2xl font-bold mb-2 text-foreground">Get Your Full Report</h2>
              <p className="text-muted-foreground">
                Download your comprehensive PDF report with detailed insights and action plans
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => handlePdfAction('download')}
                disabled={aiContentLoading || !aiContentReady}
                data-testid="button-download-pdf"
              >
                {aiContentLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF Report
                  </>
                )}
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => handlePdfAction('email')}
                disabled={aiContentLoading || !aiContentReady}
                data-testid="button-email-pdf"
              >
                {aiContentLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Email Report
                  </>
                )}
              </Button>
            </div>
            
            {/* Social Sharing Section */}
            <div className="mt-8 pt-8 border-t border-border">
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Share2 className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Share Your Results</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Inspire others on their transformation journey
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    
                    // Copy to clipboard first
                    navigator.clipboard.writeText(shareText).then(() => {
                      toast({
                        title: "Text copied!",
                        description: "Paste it when LinkedIn opens. LinkedIn no longer supports pre-filled text.",
                      });
                      // Then open LinkedIn
                      setTimeout(() => {
                        const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(resultsUrl)}`;
                        window.open(linkedInUrl, '_blank', 'width=600,height=600');
                      }, 500);
                    });
                  }}
                  className="gap-2"
                  data-testid="button-share-linkedin"
                >
                  <SiLinkedin className="h-4 w-4" />
                  LinkedIn
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
                    window.open(twitterUrl, '_blank', 'width=600,height=600');
                  }}
                  className="gap-2"
                  data-testid="button-share-twitter"
                >
                  <SiX className="h-4 w-4" />
                  X / Twitter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`;
                    window.open(threadsUrl, '_blank', 'width=600,height=600');
                  }}
                  className="gap-2"
                  data-testid="button-share-threads"
                >
                  <SiThreads className="h-4 w-4" />
                  Threads
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    
                    // Copy to clipboard first
                    navigator.clipboard.writeText(shareText).then(() => {
                      toast({
                        title: "Text copied!",
                        description: "Paste it when Facebook opens. Facebook no longer supports pre-filled text.",
                      });
                      // Then open Facebook
                      setTimeout(() => {
                        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(resultsUrl)}`;
                        window.open(facebookUrl, '_blank', 'width=600,height=600');
                      }, 500);
                    });
                  }}
                  className="gap-2"
                  data-testid="button-share-facebook"
                >
                  <SiFacebook className="h-4 w-4" />
                  Facebook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    
                    navigator.clipboard.writeText(shareText).then(() => {
                      toast({
                        title: "Text copied!",
                        description: "Paste it in your Instagram post or story.",
                      });
                    });
                  }}
                  className="gap-2"
                  data-testid="button-share-instagram"
                >
                  <SiInstagram className="h-4 w-4" />
                  Instagram
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const resultsUrl = `${window.location.origin}/results/${assessmentId}`;
                    const modelUrl = `${window.location.origin}/api/og/${model.slug}`;
                    const shareText = `I scored ${result.overallScore} - ${maturityLevel.name} on the ${model.name}!\n\n${resultsUrl}\n\nGet your own score free with personalized recommendations, resources and roadmap from Synozur at ${modelUrl}`;
                    const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
                    window.open(blueskyUrl, '_blank', 'width=600,height=600');
                  }}
                  className="gap-2"
                  data-testid="button-share-bluesky"
                >
                  <SiBluesky className="h-4 w-4" />
                  Bluesky
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary/5">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Organization?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Connect with our transformation experts to create a custom roadmap
          </p>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Card 
              className="p-4 hover-elevate cursor-pointer"
              onClick={() => window.open('https://www.synozur.com/start', '_blank')}
            >
              <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold">Schedule a Workshop</h3>
            </Card>
            <Card 
              className="p-4 hover-elevate cursor-pointer"
              onClick={() => window.open('https://www.synozur.com/services-overview/default', '_blank')}
            >
              <BookOpen className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold">Learn More</h3>
            </Card>
            <Card 
              className="p-4 hover-elevate cursor-pointer"
              onClick={() => {
                const subject = encodeURIComponent(`Followup on ${model?.name || 'Assessment'}`);
                window.location.href = `mailto:contactus@synozur.com?subject=${subject}`;
              }}
            >
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

      {/* General Resources */}
      {model.generalResources && model.generalResources.length > 0 && (
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="text-3xl font-bold mb-8 text-center">Additional Resources</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {model.generalResources.map((resource) => (
                <Card key={resource.id} className="p-6 hover-elevate">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-lg">{resource.title}</h3>
                      <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                    </div>
                    {resource.description && (
                      <p className="text-base text-muted-foreground">
                        {resource.description}
                      </p>
                    )}
                    {resource.link && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(resource.link, '_blank')}
                        className="w-full"
                        data-testid={`button-resource-${resource.id}`}
                      >
                        Learn More
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

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