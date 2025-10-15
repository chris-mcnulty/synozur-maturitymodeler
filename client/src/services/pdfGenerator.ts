import jsPDF from 'jspdf';
import type { Result, Model, Dimension } from '@shared/schema';
// @ts-ignore
import logoImage from '@assets/SA-Logo-Horizontal-color_1760530252980.png';
// @ts-ignore - Font files as base64 strings
import avenirRegularFont from './avenir-regular-font.txt?raw';
// @ts-ignore
import avenirBoldFont from './avenir-bold-font.txt?raw';

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

  // Add Avenir Next LT Pro fonts
  try {
    // Add regular font
    doc.addFileToVFS('AvenirNextLTPro-Regular.ttf', avenirRegularFont);
    doc.addFont('AvenirNextLTPro-Regular.ttf', 'Avenir', 'normal');
    
    // Add bold font
    doc.addFileToVFS('AvenirNextLTPro-Bold.ttf', avenirBoldFont);
    doc.addFont('AvenirNextLTPro-Bold.ttf', 'Avenir', 'bold');
    
    // Set Avenir as default font
    doc.setFont('Avenir', 'normal');
  } catch (error) {
    console.error('Error loading Avenir fonts, falling back to default:', error);
    // If fonts fail to load, jsPDF will use its default font
  }

  // Define colors (using RGB)
  const primaryColor = { r: 129, g: 15, b: 251 }; // #810FFB
  const accentColor = { r: 230, g: 12, b: 179 }; // #E60CB3
  const textColor = { r: 51, g: 51, b: 51 };
  const grayColor = { r: 102, g: 102, b: 102 };
  
  let yPosition = 15;

  // Add Synozur logo to header
  try {
    // Add logo image (centered, width: 60mm to fit nicely)
    const logoWidth = 60;
    const logoHeight = 20; // Adjust based on aspect ratio
    const logoX = (210 - logoWidth) / 2; // Center on A4 width (210mm)
    doc.addImage(logoImage, 'PNG', logoX, yPosition, logoWidth, logoHeight);
    yPosition += logoHeight + 8;
  } catch (error) {
    console.error('Failed to add logo to PDF:', error);
    // Fallback to text header if logo fails
    doc.setFontSize(12);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text('THE SYNOZUR ALLIANCE LLC', 105, yPosition, { align: 'center' });
    yPosition += 6;
  }
  
  doc.setFontSize(9);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('The Transformation Company | Find Your North Star', 105, yPosition, { align: 'center' });
  
  yPosition += 15;

  // Report Title
  doc.setFont('Avenir', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(`${model.name} Report`, 105, yPosition, { align: 'center' });
  doc.setFont('Avenir', 'normal');
  
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

  doc.setFont('Avenir', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Overall Maturity Score', 25, yPosition);
  doc.setFont('Avenir', 'normal');
  
  yPosition += 15;
  doc.setFontSize(36);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(result.overallScore.toString(), 25, yPosition);
  
  doc.setFontSize(14);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text(` out of 500`, 25 + doc.getTextWidth(result.overallScore.toString()), yPosition);
  
  yPosition += 15;

  // Maturity Level
  doc.setFontSize(16);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(`Maturity Level: ${result.label}`, 25, yPosition);
  
  yPosition += 10;
  doc.setFontSize(10);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  
  // AI-Generated Executive Summary or fallback description
  if (maturitySummary) {
    yPosition += 10;
    doc.setFont('Avenir', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Executive Summary', 25, yPosition);
    doc.setFont('Avenir', 'normal');
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    const summaryLines = doc.splitTextToSize(maturitySummary, 160);
    summaryLines.forEach((line: string) => {
      if (yPosition > 240) {  // Changed from 260 to ensure space for dimensional scores
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
    
    const lines = doc.splitTextToSize(maturityDescription, 160);
    lines.forEach((line: string) => {
      doc.text(line, 25, yPosition);
      yPosition += 5;
    });
    yPosition += 10;
  }

  // Benchmark comparison if available
  if (benchmark) {
    doc.setFont('Avenir', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Industry Benchmark', 25, yPosition);
    doc.setFont('Avenir', 'normal');
    yPosition += 7;
    
    doc.setFontSize(10);
    doc.text(`Your Score: ${result.overallScore} | Industry Average: ${benchmark.meanScore}`, 25, yPosition);
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    yPosition += 5;
    doc.text(`Based on ${benchmark.sampleSize} organizations`, 25, yPosition);
    yPosition += 10;
  }

  // Dimension Breakdown
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  doc.setFont('Avenir', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Dimension Breakdown', 25, yPosition);
  doc.setFont('Avenir', 'normal');
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
  if (recommendationsSummary || recommendations.length > 0) {
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.line(20, yPosition, 190, yPosition);
    yPosition += 10;
    
    // AI Recommendations Summary if available
    if (recommendationsSummary) {
      doc.setFont('Avenir', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text('Your Transformation Roadmap', 25, yPosition);
      doc.setFont('Avenir', 'normal');
      yPosition += 8;
      
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
    }
    
    // Detailed recommendations section
    if (recommendations.length > 0) {
      doc.setFont('Avenir', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text('Strategic Action Items', 25, yPosition);
      doc.setFont('Avenir', 'normal');
      yPosition += 8;
    }

    recommendations.forEach((rec, index) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFont('Avenir', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.text(`• ${rec.title}`, 30, yPosition);
      doc.setFont('Avenir', 'normal');
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
    
    doc.setFont('Avenir', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text('Improvement Resources', 25, yPosition);
    doc.setFont('Avenir', 'normal');
    yPosition += 10;

    improvementResources.forEach((resource, index) => {
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
  
  doc.setFont('Avenir', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Ready to Transform Your Organization?', 25, yPosition);
  doc.setFont('Avenir', 'normal');
  
  yPosition += 8;
  doc.setFontSize(10);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('Connect with our transformation experts to create a custom roadmap', 25, yPosition);
  yPosition += 5;
  doc.text('for your organization\'s unique journey to excellence.', 25, yPosition);
  
  yPosition += 10;
  doc.setFont('Avenir', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('Take Action Today:', 25, yPosition);
  doc.setFont('Avenir', 'normal');
  
  yPosition += 8;
  doc.setFontSize(9);
  
  // Schedule a Workshop
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('• Schedule a Workshop:', 30, yPosition);
  yPosition += 5;
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('  https://www.synozur.com/start', 30, yPosition);
  yPosition += 7;
  
  // Learn More About Our Services
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('• Learn More About Our Services:', 30, yPosition);
  yPosition += 5;
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('  https://www.synozur.com/services-overview/default', 30, yPosition);
  yPosition += 7;
  
  // Contact Our Experts
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('• Contact Our Experts:', 30, yPosition);
  yPosition += 5;
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('  ContactUs@synozur.com', 30, yPosition);
  
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