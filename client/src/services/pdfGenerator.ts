import jsPDF from 'jspdf';
import type { Result, Model, Dimension } from '@shared/schema';

interface PDFData {
  result: Result;
  model: Model & { dimensions: Dimension[] };
  benchmark?: { meanScore: number; sampleSize: number };
  recommendations?: Array<{
    title: string;
    description: string;
  }>;
  improvementResources?: Array<{
    question: string;
    answer?: string;
    improvementStatement?: string;
    resourceLink?: string;
  }>;
  maturitySummary?: string;
  recommendationsSummary?: string;
  userContext?: {
    name?: string;
    company?: string;
    jobTitle?: string;
    industry?: string;
    companySize?: string;
  };
}

export function generateAssessmentPDF(data: PDFData): jsPDF {
  const { result, model, benchmark, recommendations = [], improvementResources = [], 
          maturitySummary, recommendationsSummary, userContext } = data;
  
  // Create new PDF document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Define colors (using RGB)
  const primaryColor = { r: 129, g: 15, b: 251 }; // #810FFB
  const accentColor = { r: 230, g: 12, b: 179 }; // #E60CB3
  const textColor = { r: 51, g: 51, b: 51 };
  const grayColor = { r: 102, g: 102, b: 102 };
  
  let yPosition = 15;

  // Synozur Branding Header
  doc.setFontSize(12);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('THE SYNOZUR ALLIANCE LLC', 105, yPosition, { align: 'center' });
  yPosition += 6;
  doc.setFontSize(9);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('Transformation Experts | Find Your North Star', 105, yPosition, { align: 'center' });
  
  yPosition += 15;

  // Report Title
  doc.setFontSize(24);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(`${model.name} Report`, 105, yPosition, { align: 'center' });
  
  // Personalization if user context exists
  if (userContext) {
    yPosition += 10;
    doc.setFontSize(10);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    if (userContext.name) {
      doc.text(`Prepared for: ${userContext.name}`, 105, yPosition, { align: 'center' });
      yPosition += 5;
    }
    if (userContext.company) {
      doc.text(userContext.company, 105, yPosition, { align: 'center' });
      yPosition += 5;
    }
  }
  
  yPosition += 5;
  doc.setFontSize(10);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text(`Assessment Date: ${new Date().toLocaleDateString()}`, 105, yPosition, { align: 'center' });
  
  yPosition += 15;

  // Overall Score Section
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;

  doc.setFontSize(18);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Overall Maturity Score', 105, yPosition, { align: 'center' });
  
  yPosition += 15;
  doc.setFontSize(36);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(result.overallScore.toString(), 85, yPosition, { align: 'right' });
  
  doc.setFontSize(14);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text(' out of 500', 85, yPosition);
  
  yPosition += 15;

  // Maturity Level
  doc.setFontSize(16);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(`Maturity Level: ${result.label}`, 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setFontSize(10);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  
  // AI-Generated Executive Summary or fallback description
  if (maturitySummary) {
    yPosition += 10;
    doc.setFontSize(12);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Executive Summary', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(maturitySummary, 160);
    summaryLines.forEach((line: string) => {
      if (yPosition > 260) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 25, yPosition);
      yPosition += 5;
    });
    yPosition += 10;
  } else {
    // Fallback to simple description if no AI summary
    let maturityDescription = '';
    switch(result.label) {
      case 'Transformational':
        maturityDescription = "You're at the forefront of AI transformation, leading the industry with mature practices.";
        break;
      case 'Strategic':
        maturityDescription = "You're strategic with AI as a differentiator. Double down on responsible AI, proprietary models, and organizational culture.";
        break;
      case 'Operational':
        maturityDescription = "You have good operational AI processes with clear opportunities to advance to strategic maturity.";
        break;
      case 'Experimental':
        maturityDescription = "You're experimenting with AI and building momentum. Focus on scaling successful pilots.";
        break;
      case 'Nascent':
        maturityDescription = "You're at the beginning of your AI journey with significant growth potential ahead.";
        break;
    }
    
    const lines = doc.splitTextToSize(maturityDescription, 150);
    lines.forEach((line: string) => {
      doc.text(line, 105, yPosition, { align: 'center' });
      yPosition += 5;
    });
    yPosition += 10;
  }

  // Benchmark comparison if available
  if (benchmark) {
    doc.setFontSize(12);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Industry Benchmark', 105, yPosition, { align: 'center' });
    yPosition += 7;
    
    doc.setFontSize(10);
    doc.text(`Your Score: ${result.overallScore} | Industry Average: ${benchmark.meanScore}`, 105, yPosition, { align: 'center' });
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    yPosition += 5;
    doc.text(`Based on ${benchmark.sampleSize} organizations`, 105, yPosition, { align: 'center' });
    yPosition += 10;
  }

  // Dimension Breakdown
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  doc.setFontSize(14);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Dimension Breakdown', 105, yPosition, { align: 'center' });
  yPosition += 10;

  // Table header
  doc.setFontSize(10);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Dimension', 30, yPosition);
  doc.text('Score', 160, yPosition, { align: 'right' });
  yPosition += 5;
  
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.1);
  doc.line(30, yPosition, 180, yPosition);
  yPosition += 5;

  // Dimension scores
  const dimensionScores = model.dimensions.map(dim => ({
    label: dim.label,
    score: (result.dimensionScores as Record<string, number>)[dim.key] || 0
  }));

  dimensionScores.forEach(dim => {
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(dim.label, 30, yPosition);
    
    // Color code the score
    if (dim.score >= 400) {
      doc.setTextColor(34, 197, 94); // Green
    } else if (dim.score >= 300) {
      doc.setTextColor(251, 146, 60); // Orange
    } else {
      doc.setTextColor(239, 68, 68); // Red
    }
    
    doc.text(dim.score.toString(), 160, yPosition, { align: 'right' });
    yPosition += 7;
  });

  yPosition += 10;

  // Check if we need a new page for recommendations
  if (yPosition > 220) {
    doc.addPage();
    yPosition = 20;
  }

  // Personalized Recommendations
  if (recommendations.length > 0) {
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.line(20, yPosition, 190, yPosition);
    yPosition += 10;
    
    doc.setFontSize(14);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Strategic Recommendations', 105, yPosition, { align: 'center' });
    yPosition += 10;

    // AI Recommendations Summary if available
    if (recommendationsSummary) {
      doc.setFontSize(9);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      const summaryLines = doc.splitTextToSize(recommendationsSummary, 160);
      summaryLines.forEach((line: string) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 20;
        }
        doc.text(line, 25, yPosition);
        yPosition += 5;
      });
      yPosition += 10;
      
      // Add section header for detailed recommendations
      doc.setFontSize(11);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text('Detailed Action Items:', 30, yPosition);
      yPosition += 8;
    }

    recommendations.slice(0, 3).forEach(rec => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.text(`• ${rec.title}`, 30, yPosition);
      yPosition += 5;
      
      doc.setFontSize(9);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      const descLines = doc.splitTextToSize(rec.description, 150);
      descLines.forEach((line: string) => {
        doc.text(line, 35, yPosition);
        yPosition += 4;
      });
      yPosition += 5;
    });
  }

  // Improvement Resources
  if (improvementResources.length > 0) {
    // Check if we need a new page
    if (yPosition > 220) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition += 10;
    }
    
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.line(20, yPosition, 190, yPosition);
    yPosition += 10;
    
    doc.setFontSize(14);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Improvement Resources', 105, yPosition, { align: 'center' });
    yPosition += 10;

    improvementResources.slice(0, 5).forEach(resource => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Question text
      doc.setFontSize(9);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(`Q: ${resource.question}`, 30, yPosition);
      yPosition += 5;
      
      // Answer
      if (resource.answer) {
        doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
        doc.text(`A: ${resource.answer}`, 30, yPosition);
        yPosition += 5;
      }
      
      // Improvement statement
      if (resource.improvementStatement) {
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        const improvementLines = doc.splitTextToSize(resource.improvementStatement, 150);
        improvementLines.forEach((line: string) => {
          doc.text(line, 30, yPosition);
          yPosition += 4;
        });
        yPosition += 3;
      }
      
      // Resource link
      if (resource.resourceLink) {
        doc.setFontSize(8);
        doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
        doc.text(`Resource: ${resource.resourceLink}`, 30, yPosition);
        yPosition += 5;
      }
      
      yPosition += 3;
    });
  }

  // Check if we need a new page for footer
  if (yPosition > 230) {
    doc.addPage();
    yPosition = 20;
  } else {
    yPosition = 230; // Move to footer position
  }

  // Enhanced Footer with Synozur Branding
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  doc.setFontSize(14);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Take the Next Step in Your Transformation Journey', 105, yPosition, { align: 'center' });
  
  yPosition += 8;
  doc.setFontSize(10);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('The Synozur Alliance specializes in guiding organizations through', 105, yPosition, { align: 'center' });
  yPosition += 5;
  doc.text('strategic transformations that deliver measurable results.', 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setFontSize(11);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('Connect With Our Experts:', 105, yPosition, { align: 'center' });
  
  yPosition += 7;
  doc.setFontSize(10);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  
  // Email contact
  doc.text('✉ Email: contactus@synozur.com', 105, yPosition, { align: 'center' });
  yPosition += 6;
  
  // Schedule consultation
  doc.text('📅 Schedule a Consultation:', 105, yPosition, { align: 'center' });
  yPosition += 5;
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('https://www.synozur.com/start', 105, yPosition, { align: 'center' });
  
  yPosition += 12;
  
  // Copyright and Legal
  doc.setFontSize(8);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('© ' + new Date().getFullYear() + ' The Synozur Alliance LLC. All Rights Reserved.', 105, yPosition, { align: 'center' });
  yPosition += 4;
  doc.text('This assessment, its methodology, and all associated intellectual property are proprietary to', 105, yPosition, { align: 'center' });
  yPosition += 3;
  doc.text('The Synozur Alliance LLC and protected under applicable copyright and trademark laws.', 105, yPosition, { align: 'center' });
  yPosition += 3;
  doc.text('Unauthorized reproduction or distribution is prohibited.', 105, yPosition, { align: 'center' });

  return doc;
}