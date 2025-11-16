interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  if (!content) return null;

  const parseMarkdown = (text: string): JSX.Element[] => {
    const elements: JSX.Element[] = [];
    const lines = text.split('\n');
    let currentParagraph: string[] = [];
    let currentList: string[] = [];
    let keyCounter = 0;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ').trim();
        if (paragraphText) {
          // Split very long paragraphs for better readability
          const chunks = splitLongParagraph(paragraphText);
          chunks.forEach(chunk => {
            elements.push(
              <p key={`p-${keyCounter++}`} className="mb-4 text-base leading-relaxed">
                {parseBoldText(chunk)}
              </p>
            );
          });
        }
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`ul-${keyCounter++}`} className="mb-4 ml-4 space-y-2">
            {currentList.map((item, idx) => (
              <li key={`li-${idx}`} className="text-base leading-relaxed list-disc marker:text-primary">
                {parseBoldText(item)}
              </li>
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      // Handle H1 headers (# )
      if (trimmed.startsWith('# ')) {
        flushParagraph();
        flushList();
        const headerText = trimmed.substring(2).trim();
        elements.push(
          <h3 key={`h1-${keyCounter++}`} className="text-2xl font-bold mb-6 mt-6 first:mt-0 text-primary">
            {parseBoldText(headerText)}
          </h3>
        );
        return;
      }

      // Handle H2 headers (## )
      if (trimmed.startsWith('## ')) {
        flushParagraph();
        flushList();
        const headerText = trimmed.substring(3).trim();
        elements.push(
          <h4 key={`h2-${keyCounter++}`} className="text-xl font-semibold mb-5 mt-5 text-secondary">
            {parseBoldText(headerText)}
          </h4>
        );
        return;
      }

      // Handle bullet points (• or - at start)
      if (trimmed.startsWith('• ') || trimmed.match(/^-\s/)) {
        flushParagraph();
        const bulletText = trimmed.substring(2).trim();
        currentList.push(bulletText);
        return;
      }

      // Handle standalone bold headings (e.g., **Building Momentum**)
      if (trimmed.match(/^\*\*[^*]+\*\*$/)) {
        flushParagraph();
        flushList();
        const boldText = trimmed.replace(/\*\*/g, '').trim();
        elements.push(
          <h4 key={`bold-heading-${keyCounter++}`} className="text-lg font-semibold mb-5 mt-5 text-secondary">
            {boldText}
          </h4>
        );
        return;
      }

      // Regular paragraph text - accumulate lines
      flushList(); // Flush any pending list before starting paragraph
      currentParagraph.push(trimmed);
    });

    // Flush any remaining content
    flushParagraph();
    flushList();

    return elements;
  };

  // Split very long paragraphs at natural break points
  const splitLongParagraph = (text: string): string[] => {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 400) {
      // First try to split at sentence boundaries (. ! ?)
      const sentenceMatch = remaining.substring(0, 500).match(/^(.{200,}?)[.!?]\s+/);
      
      if (sentenceMatch) {
        chunks.push(sentenceMatch[1].trim() + sentenceMatch[0].charAt(sentenceMatch[1].length));
        remaining = remaining.substring(sentenceMatch[0].length).trim();
        continue;
      }

      // Fallback: split at comma if available
      const lastComma = remaining.substring(0, 450).lastIndexOf(',');
      if (lastComma > 200) {
        chunks.push(remaining.substring(0, lastComma + 1).trim());
        remaining = remaining.substring(lastComma + 1).trim();
        continue;
      }

      // Last resort: hard break at 400 characters
      const lastSpace = remaining.substring(0, 400).lastIndexOf(' ');
      const breakPoint = lastSpace > 200 ? lastSpace : 400;
      chunks.push(remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }

    // Add remaining text
    if (remaining) {
      chunks.push(remaining);
    }

    return chunks;
  };

  // Parse bold text within a string
  const parseBoldText = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let keyCounter = 0;

    while (remaining) {
      const boldStart = remaining.indexOf('**');
      
      if (boldStart === -1) {
        // No more bold text
        parts.push(remaining);
        break;
      }

      // Add text before bold
      if (boldStart > 0) {
        parts.push(remaining.substring(0, boldStart));
      }

      // Find closing **
      const boldEnd = remaining.indexOf('**', boldStart + 2);
      
      if (boldEnd === -1) {
        // No closing **, treat as regular text
        parts.push(remaining);
        break;
      }

      // Extract bold text and add as <strong>
      const boldText = remaining.substring(boldStart + 2, boldEnd);
      parts.push(
        <strong key={`bold-${keyCounter++}`} className="font-semibold text-foreground">
          {boldText}
        </strong>
      );

      // Continue with remaining text
      remaining = remaining.substring(boldEnd + 2);
    }

    return parts;
  };

  return (
    <div className={className}>
      {parseMarkdown(content)}
    </div>
  );
}
