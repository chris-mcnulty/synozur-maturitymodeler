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
}

export function generateAssessmentPDF(data: PDFData): jsPDF {
  const { result, model, benchmark, recommendations = [], improvementResources = [] } = data;
  
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
  
  let yPosition = 20;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(`${model.name} Report`, 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setFontSize(10);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, yPosition, { align: 'center' });
  
  yPosition += 20;

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
  
  // Add maturity description based on label
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
    doc.text('Personalized Recommendations', 105, yPosition, { align: 'center' });
    yPosition += 10;

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

  // Check if we need a new page for footer
  if (yPosition > 230) {
    doc.addPage();
    yPosition = 20;
  } else {
    yPosition = 230; // Move to footer position
  }

  // Footer CTA
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  doc.setFontSize(12);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text('Ready to Transform Your AI Journey?', 105, yPosition, { align: 'center' });
  
  yPosition += 7;
  doc.setFontSize(10);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('Connect with our AI experts to create a custom transformation roadmap:', 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text('Learn More About AI Solutions', 105, yPosition, { align: 'center' });
  yPosition += 5;
  doc.text('Schedule a Workshop', 105, yPosition, { align: 'center' });
  yPosition += 5;
  doc.text('Contact Us: contactus@synozur.com', 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setFontSize(8);
  doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
  doc.text('This site, content, and models are the property of The Synozur Alliance LLC. All rights reserved.', 105, yPosition, { align: 'center' });

  return doc;
}